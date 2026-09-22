import scoringConfig from "../../config/matching-v2/scoring-algorithm.json" with { type: "json" };
import preferences from "../../config/matching-v2/preferences.shanghai-pm.json" with { type: "json" };
import { isUnknown, normalizeSiteJobRecord } from "./site-job-contract.mjs";

const HIGH_RECOMMENDATIONS = new Set(["优先推荐", "可以考虑"]);

export function assertValidScoringConfig(config) {
  if (!config || typeof config !== "object") throw new Error("scoring config 必须是对象");
  if (typeof config.version !== "string" || !config.version.trim()) throw new Error("scoring config.version 缺失");
  if (!Number.isFinite(config.confidence_floor_for_recommendation)
    || config.confidence_floor_for_recommendation < 0
    || config.confidence_floor_for_recommendation > 1) {
    throw new Error("scoring config.confidence_floor_for_recommendation 必须在 0-1");
  }
  if (!config.dimensions || typeof config.dimensions !== "object" || !Object.keys(config.dimensions).length) {
    throw new Error("scoring config.dimensions 必须是非空对象");
  }
  for (const [dimension, values] of Object.entries(config.dimensions)) {
    if (!values || typeof values !== "object" || !("unknown" in values) || values.unknown !== null) {
      throw new Error(`scoring config.dimensions.${dimension}.unknown 必须显式为 null`);
    }
    for (const [classification, factor] of Object.entries(values)) {
      if (factor !== null && (!Number.isFinite(factor) || factor < 0 || factor > 1)) {
        throw new Error(`scoring config.dimensions.${dimension}.${classification} 必须在 0-1 或为 null`);
      }
    }
  }
  const thresholds = config.thresholds;
  if (!thresholds || ![thresholds.review, thresholds.consider, thresholds.preferred]
    .every((value) => Number.isFinite(value) && value >= 0 && value <= 100)) {
    throw new Error("scoring config.thresholds 必须在 0-100");
  }
  if (!(thresholds.review <= thresholds.consider && thresholds.consider <= thresholds.preferred)) {
    throw new Error("scoring config.thresholds 必须满足 review <= consider <= preferred");
  }
  if (!config.hard_filter_values || typeof config.hard_filter_values !== "object"
    || Object.values(config.hard_filter_values).some((values) => !Array.isArray(values))) {
    throw new Error("scoring config.hard_filter_values 必须由数组组成");
  }
}

function unique(values) {
  return [...new Set(values.filter((value) => value != null && value !== ""))];
}

const NON_BLOCKING_INFORMATION_DIMENSIONS = new Set([
  "financing_fit", "company_quality", "freshness_fit", "team_quality",
]);

function suppliedOrInferred(supplied, inferred) {
  return Object.fromEntries(Object.entries(inferred).map(([key, value]) => {
    const candidate = supplied[key];
    return [key, candidate != null && candidate !== "" && candidate !== "unknown" ? candidate : value];
  }));
}

function inferEvaluation(job) {
  const supplied = job.evaluation && typeof job.evaluation === "object" ? job.evaluation : {};
  const directions = Array.isArray(job.directions) ? job.directions : [];
  const text = [job.title, job.company, job.description, job.job_description_raw, job.responsibilities, job.requirements, ...directions]
    .filter((value) => !isUnknown(value))
    .join(" ");
  const responsibilityGroups = [
    ["用户研究", "需求洞察", "行为分析"],
    ["产品规划", "方案设计", "版本迭代"],
    ["增长", "转化", "留存", "召回"],
    ["交易", "订单", "履约", "售后"],
    ["指标", "数据分析", "A/B"],
  ];
  const responsibilityCategories = responsibilityGroups.filter((group) => group.some((word) => text.includes(word))).length;
  const hasDeliveryLoop = ["上线", "落地", "迭代", "验证"].some((word) => text.includes(word));
  const priority = preferences.priority_directions ?? [];
  const adjacent = preferences.adjacent_directions ?? [];
  const excluded = preferences.excluded_directions ?? [];
  const bSide = ["B端", "企业SaaS", "商家后台", "内部系统", "中后台"].some((word) => text.includes(word));
  const cSide = ["C端", "用户端", "App", "小程序", "消费者"].some((word) => text.includes(word));
  const inferred = {
    title_fit: String(job.title ?? "").includes("产品经理") ? "preferred" : "unknown",
    city_fit: job.city === "上海" ? "match" : (isUnknown(job.city) ? "unknown" : "mismatch"),
    direction_fit: excluded.some((word) => text.includes(word)) ? "excluded"
      : (directions.some((value) => priority.includes(value)) || priority.some((word) => text.includes(word)) ? "priority"
        : (directions.some((value) => adjacent.includes(value)) || adjacent.some((word) => text.includes(word)) ? "adjacent" : "unknown")),
    responsibility_fit: responsibilityCategories >= 3 && hasDeliveryLoop ? "high" : (responsibilityCategories ? "medium" : "unknown"),
    product_form_fit: cSide ? "priority" : (bSide ? "conditional" : "unknown"),
    product_layer_fit: text.includes("核心链路") || text.includes("交易链路") ? "priority" : (bSide ? "conditional" : "unknown"),
    role_fit: String(job.title ?? "").includes("产品经理") ? "preferred" : "unknown",
    experience_fit: isUnknown(job.workExperience) ? "unknown" : "medium",
    company_quality: "unknown",
    team_quality: "unknown",
    growth_value: "unknown",
    freshness_fit: "unknown",
    mandatory_requirement_fit: isUnknown(job.requirements) ? "unknown" : "match",
    work_mode_fit: job.city === "上海" ? "match" : "unknown",
    risk_fit: "clear",
  };
  if (inferred.direction_fit === "priority") inferred.growth_value = "medium";
  return suppliedOrInferred(supplied, inferred);
}

function hardFilterReasons(job, evaluation, config) {
  const reasons = [];
  for (const [field, rejectedValues] of Object.entries(config.hard_filter_values)) {
    const value = field === "job_status" ? job[field] : evaluation[field];
    if (rejectedValues.includes(value)) reasons.push(`${field}=${value}`);
  }
  for (const risk of Array.isArray(job.risk_flags) ? job.risk_flags : []) {
    if (risk && typeof risk === "object" && risk.hard_reject === true) {
      reasons.push(`hard_reject=${risk.reason ?? "unspecified"}`);
    }
  }
  return unique(reasons);
}

export function scoreJob(job, config = scoringConfig) {
  assertValidScoringConfig(config);
  job = normalizeSiteJobRecord(job, job?.pipeline ?? "public_index");
  const publicOnly = job.pipeline === "public_index" || job.verification_status === "unverified_index_snapshot";
  if (publicOnly) {
    return {
      ...job,
      match_score: null,
      score: null,
      evidence_confidence: 0,
      score_components: [],
      hard_filter_reasons: [],
      scoring_config_version: config.version,
      recommendation: "信息不足",
    };
  }

  const evaluation = inferEvaluation(job);
  const components = [];
  let knownWeight = 0;
  let knownRequiredWeight = 0;
  let earnedPoints = 0;
  const requiredWeight = Object.entries(preferences.weights)
    .filter(([dimension]) => !NON_BLOCKING_INFORMATION_DIMENSIONS.has(dimension))
    .reduce((sum, [, weight]) => sum + weight, 0);
  for (const [dimension, weight] of Object.entries(preferences.weights)) {
    const classification = evaluation[dimension] ?? "unknown";
    const factor = config.dimensions[dimension]?.[classification] ?? null;
    const known = factor !== null;
    if (known) {
      knownWeight += weight;
      if (!NON_BLOCKING_INFORMATION_DIMENSIONS.has(dimension)) knownRequiredWeight += weight;
      earnedPoints += weight * factor;
    }
    components.push({
      dimension,
      classification,
      weight,
      known,
      points: known ? Number((weight * factor).toFixed(2)) : null,
    });
  }

  const responsibilityText = job.responsibilities ?? job.responsibility_summary;
  const completeJd = !isUnknown(job.job_description_raw) && !isUnknown(responsibilityText);
  const captureFactor = job.verification_status === "captured_jd" && completeJd ? 1 : 0.55;
  const evidenceConfidence = Number(((knownRequiredWeight / requiredWeight) * captureFactor).toFixed(3));
  const matchScore = knownWeight ? Number(((earnedPoints / knownWeight) * 100).toFixed(1)) : null;
  const hardReasons = hardFilterReasons(job, evaluation, config);
  let recommendation = "信息不足";
  if (hardReasons.length) recommendation = "不推荐";
  else if (job.verification_status === "captured_jd" && completeJd) {
    if (matchScore >= config.thresholds.preferred) recommendation = "优先推荐";
    else if (matchScore >= config.thresholds.consider) recommendation = "可以考虑";
    else if (matchScore >= config.thresholds.review) recommendation = "谨慎评估";
    else recommendation = "不推荐";
  }
  if (evidenceConfidence < config.confidence_floor_for_recommendation && recommendation === "优先推荐") {
    recommendation = "可以考虑";
  }
  if (job.verification_status === "needs_review" && HIGH_RECOMMENDATIONS.has(recommendation)) recommendation = "信息不足";

  return {
    ...job,
    evaluation,
    match_score: matchScore,
    score: recommendation === "信息不足" ? null : matchScore,
    evidence_confidence: evidenceConfidence,
    score_components: components,
    hard_filter_reasons: hardReasons,
    scoring_config_version: config.version,
    recommendation,
    missing_information: unique([
      ...(Array.isArray(job.missing_information) ? job.missing_information : [])
        .filter((item) => item !== "完整JD或职责证据" || !completeJd),
    ...components.filter((component) => !component.known && !NON_BLOCKING_INFORMATION_DIMENSIONS.has(component.dimension)).map((component) => component.dimension),
      ...(!completeJd ? ["完整JD或职责证据"] : []),
    ]),
  };
}

export function scoreJobs(jobs, config = scoringConfig) {
  return jobs.map((job) => scoreJob(job, config));
}

export { scoringConfig };
