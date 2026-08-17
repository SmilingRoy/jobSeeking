import scoringConfig from "../../config/job-scoring.json" with { type: "json" };
import { isUnknown } from "./site-job-contract.mjs";

const HIGH_RECOMMENDATIONS = new Set(["优先推荐", "可以考虑"]);

function unique(values) {
  return [...new Set(values.filter((value) => value != null && value !== ""))];
}

function inferEvaluation(job) {
  const supplied = job.evaluation && typeof job.evaluation === "object" ? job.evaluation : {};
  const text = [job.title, job.description, job.job_description_raw, job.responsibilities, job.requirements]
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
  const inferred = {
    title_fit: String(job.title ?? "").includes("产品经理") ? "preferred" : "unknown",
    city_fit: job.city === "上海" ? "match" : (isUnknown(job.city) ? "unknown" : "mismatch"),
    direction_fit: "unknown",
    responsibility_fit: responsibilityCategories >= 2 && hasDeliveryLoop ? "high" : (responsibilityCategories ? "medium" : "unknown"),
    product_form_fit: "unknown",
    product_layer_fit: "unknown",
    role_fit: String(job.title ?? "").includes("产品经理") ? "preferred" : "unknown",
    experience_fit: "unknown",
    company_quality: "unknown",
    team_quality: "unknown",
    growth_value: "unknown",
    freshness_fit: "unknown",
    mandatory_requirement_fit: isUnknown(job.requirements) ? "unknown" : "match",
    work_mode_fit: job.city === "上海" ? "match" : "unknown",
  };
  return { ...inferred, ...supplied };
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
  let earnedPoints = 0;
  const totalWeight = Object.values(config.weights).reduce((sum, weight) => sum + weight, 0);
  for (const [dimension, weight] of Object.entries(config.weights)) {
    const classification = evaluation[dimension] ?? "unknown";
    const factor = config.values[dimension]?.[classification] ?? null;
    const known = factor !== null;
    if (known) {
      knownWeight += weight;
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

  const completeJd = !isUnknown(job.job_description_raw) && !isUnknown(job.responsibilities);
  const captureFactor = job.verification_status === "captured_jd" && completeJd ? 1 : 0.55;
  const evidenceConfidence = Number(((knownWeight / totalWeight) * captureFactor).toFixed(3));
  const matchScore = knownWeight ? Number(((earnedPoints / knownWeight) * 100).toFixed(1)) : null;
  const hardReasons = hardFilterReasons(job, evaluation, config);
  let recommendation = "信息不足";
  if (hardReasons.length) recommendation = "不推荐";
  else if (job.verification_status === "captured_jd" && completeJd && evidenceConfidence >= config.confidence_floor_for_recommendation) {
    if (matchScore >= config.thresholds.preferred) recommendation = "优先推荐";
    else if (matchScore >= config.thresholds.consider) recommendation = "可以考虑";
    else if (matchScore >= config.thresholds.review) recommendation = "谨慎评估";
    else recommendation = "不推荐";
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
      ...(Array.isArray(job.missing_information) ? job.missing_information : []),
      ...components.filter((component) => !component.known).map((component) => component.dimension),
      ...(!completeJd ? ["完整JD或职责证据"] : []),
    ]),
  };
}

export function scoreJobs(jobs, config = scoringConfig) {
  return jobs.map((job) => scoreJob(job, config));
}

export { scoringConfig };
