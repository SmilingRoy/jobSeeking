import { classifyBossUrl } from "./job-index.mjs";

export const RECOMMENDATIONS = Object.freeze([
  "优先推荐",
  "可以考虑",
  "谨慎评估",
  "不推荐",
  "信息不足",
]);

export const PIPELINES = Object.freeze(["public_index", "ocr_jd"]);
export const VERIFICATION_STATUSES = Object.freeze([
  "unverified_index_snapshot",
  "captured_jd",
  "needs_review",
]);

export const CONTRACT_SCALAR_FIELDS = Object.freeze([
  "id", "url", "title", "company", "city", "district", "office_location", "salary",
  "workExperience", "education", "company_size", "financing_stage", "industry",
  "description", "job_description_raw", "responsibilities", "requirements", "pipeline",
  "verification_status", "capture_status", "scoring_config_version",
]);

export const CONTRACT_ARRAY_FIELDS = Object.freeze([
  "tags", "directions", "missing_information", "review_reasons", "score_components",
  "hard_filter_reasons",
]);

export const DEFAULT_SCORING_CONFIG_VERSION = "job-pipeline-scoring-v1.0.0";

const allowedRecommendations = new Set(RECOMMENDATIONS);
const allowedPipelines = new Set(PIPELINES);
const allowedVerificationStatuses = new Set(VERIFICATION_STATUSES);
const highRecommendations = new Set(["优先推荐", "可以考虑"]);

export function isUnknown(value) {
  return value == null || value === "" || value === "unknown";
}

export function canonicalJobUrl(value) {
  const result = classifyBossUrl(value);
  return result.type === "job_detail" ? result.canonicalUrl : null;
}

export function stableJobId(url) {
  return classifyBossUrl(url).jobId ?? null;
}

function scalar(value) {
  if (isUnknown(value)) return "unknown";
  return String(value);
}

function arrayOfStrings(value) {
  return Array.isArray(value)
    ? value.filter((item) => typeof item === "string" && item.trim()).map((item) => item.trim())
    : [];
}

/** Normalize public-index, OCR, and legacy site-shaped records into one contract. */
export function normalizeSiteJobRecord(record, pipelineHint = "public_index") {
  if (!record || typeof record !== "object") throw new Error("岗位记录必须是对象");
  const url = canonicalJobUrl(record.url ?? record.job_url);
  if (!url) throw new Error(`不是具体 BOSS 详情链接: ${record.url ?? record.job_url ?? "missing"}`);
  const pipeline = record.pipeline ?? pipelineHint;
  const unverified = pipeline === "public_index" || record.verification_status === "unverified_index_snapshot";
  const title = scalar(record.title ?? record.job_title);
  const normalized = {
    ...record,
    id: stableJobId(url),
    url,
    title,
    company: scalar(record.company ?? record.company_name),
    city: scalar(record.city),
    district: scalar(record.district),
    office_location: scalar(record.office_location),
    salary: scalar(record.salary ?? record.salary_range),
    workExperience: scalar(record.workExperience ?? record.work_experience ?? record.experience_requirement),
    education: scalar(record.education ?? record.education_requirement),
    company_size: scalar(record.company_size),
    financing_stage: scalar(record.financing_stage),
    industry: scalar(record.industry),
    description: scalar(record.description ?? record.job_description_raw),
    job_description_raw: scalar(record.job_description_raw ?? record.description),
    responsibilities: scalar(record.responsibilities ?? record.responsibility_summary),
    requirements: scalar(record.requirements ?? record.qualification_summary),
    pipeline: unverified ? "public_index" : pipeline,
    verification_status: unverified ? "unverified_index_snapshot" : (record.verification_status ?? "needs_review"),
    evidence_source: normalizeEvidenceSource(record.evidence_source, {
      type: unverified ? "public_index" : pipeline,
      observed_at: record.collected_at ?? record.last_seen_at ?? "unknown",
    }),
    capture_status: scalar(record.capture_status),
    tags: arrayOfStrings(record.tags ?? record.product_direction_tags),
    directions: arrayOfStrings(record.directions ?? record.product_direction_tags ?? record.tags),
    missing_information: arrayOfStrings(record.missing_information),
    review_reasons: arrayOfStrings(record.review_reasons),
    score_components: Array.isArray(record.score_components) ? record.score_components : [],
    hard_filter_reasons: arrayOfStrings(record.hard_filter_reasons),
    match_score: unverified ? null : (record.match_score ?? null),
    score: unverified ? null : (record.score ?? null),
    evidence_confidence: unverified ? 0 : (record.evidence_confidence ?? 0),
    scoring_config_version: scalar(record.scoring_config_version ?? DEFAULT_SCORING_CONFIG_VERSION),
  };
  if (unverified) normalized.recommendation = "信息不足";
  return normalized;
}

export function normalizeEvidenceSource(value, fallback = {}) {
  const entries = Array.isArray(value)
    ? value
    : (value
      ? [{ type: fallback.type ?? "legacy", detail: String(value) }]
      : (fallback.type ? [{ type: fallback.type }] : []));
  return entries
    .filter((entry) => entry && typeof entry === "object")
    .map((entry) => ({
      ...entry,
      type: String(entry.type ?? fallback.type ?? "unknown"),
      observed_at: String(entry.observed_at ?? fallback.observed_at ?? "unknown"),
    }));
}

export function siteJobErrors(jobs) {
  const errors = [];
  const ids = new Set();
  const urls = new Set();
  for (const [index, job] of jobs.entries()) {
    const label = `jobs[${index}]`;
    const canonicalUrl = canonicalJobUrl(job.url);
    if (!job.id) errors.push(`${label}.id 缺失`);
    if (ids.has(job.id)) errors.push(`${label}.id 重复: ${job.id}`);
    ids.add(job.id);
    if (!canonicalUrl || canonicalUrl !== job.url) errors.push(`${label}.url 不是规范化具体 BOSS 详情链接`);
    if (urls.has(job.url)) errors.push(`${label}.url 重复: ${job.url}`);
    urls.add(job.url);
    if (canonicalUrl && job.id !== stableJobId(canonicalUrl)) errors.push(`${label}.id 必须等于 BOSS 岗位 ID`);
    if (job.city !== "上海") errors.push(`${label}.city 不是上海`);
    if (!String(job.title ?? "").includes("产品经理")) errors.push(`${label}.title 不包含产品经理`);
    for (const field of CONTRACT_SCALAR_FIELDS) {
      if (typeof job[field] !== "string") errors.push(`${label}.${field} 必须是字符串`);
    }
    for (const field of CONTRACT_ARRAY_FIELDS) {
      if (!Array.isArray(job[field])) errors.push(`${label}.${field} 必须是数组`);
    }
    if (!allowedRecommendations.has(job.recommendation)) errors.push(`${label}.recommendation 不合法: ${job.recommendation}`);
    if (job.score !== null && (typeof job.score !== "number" || job.score < 0 || job.score > 100)) {
      errors.push(`${label}.score 不在 0-100`);
    }
    if (!allowedPipelines.has(job.pipeline)) errors.push(`${label}.pipeline 不合法: ${job.pipeline}`);
    if (!allowedVerificationStatuses.has(job.verification_status)) {
      errors.push(`${label}.verification_status 不合法: ${job.verification_status}`);
    }
    if (!Array.isArray(job.evidence_source) || job.evidence_source.length === 0) errors.push(`${label}.evidence_source 必须是非空数组`);
    else for (const [evidenceIndex, evidence] of job.evidence_source.entries()) {
      if (!evidence || typeof evidence !== "object" || isUnknown(evidence.type)) {
        errors.push(`${label}.evidence_source[${evidenceIndex}].type 缺失`);
      }
    }
    if (!Array.isArray(job.missing_information)) errors.push(`${label}.missing_information 必须是数组`);
    if (!Array.isArray(job.review_reasons)) errors.push(`${label}.review_reasons 必须是数组`);
    if (job.match_score !== null && (!Number.isFinite(job.match_score) || job.match_score < 0 || job.match_score > 100)) {
      errors.push(`${label}.match_score 不在 0-100 或 null`);
    }
    if (!Number.isFinite(job.evidence_confidence) || job.evidence_confidence < 0 || job.evidence_confidence > 1) {
      errors.push(`${label}.evidence_confidence 不在 0-1`);
    }
    if (!Array.isArray(job.score_components)) errors.push(`${label}.score_components 必须是数组`);
    else for (const [componentIndex, component] of job.score_components.entries()) {
      if (!component || typeof component !== "object" || isUnknown(component.dimension) || typeof component.known !== "boolean") {
        errors.push(`${label}.score_components[${componentIndex}] 结构不合法`);
      }
    }
    if (!Array.isArray(job.hard_filter_reasons)) errors.push(`${label}.hard_filter_reasons 必须是数组`);
    if (typeof job.scoring_config_version !== "string" || isUnknown(job.scoring_config_version)) {
      errors.push(`${label}.scoring_config_version 缺失`);
    }
    if (job.match_score !== null && job.score !== null && job.score !== job.match_score) {
      errors.push(`${label}.score 必须与 match_score 一致或为 null`);
    }
    if (job.pipeline === "public_index" || job.verification_status === "unverified_index_snapshot") {
      if (job.score !== null || job.match_score !== null || job.recommendation !== "信息不足") {
        errors.push(`${label} 公开索引记录不能展示分数或高等级推荐`);
      }
    }
    if ((job.pipeline === "public_index") !== (job.verification_status === "unverified_index_snapshot")) {
      errors.push(`${label}.pipeline 与 verification_status 不一致`);
    }
    if (job.verification_status === "needs_review" && job.review_reasons.length === 0) {
      errors.push(`${label} 待复核岗位必须说明 review_reasons`);
    }
    if (job.verification_status === "needs_review" && highRecommendations.has(job.recommendation)) {
      errors.push(`${label} 待复核岗位不能高等级推荐`);
    }
    if (highRecommendations.has(job.recommendation) && job.evidence_confidence < 0.7) {
      errors.push(`${label} 低证据置信度不能高等级推荐`);
    }
    if (highRecommendations.has(job.recommendation) && job.match_score === null) {
      errors.push(`${label} 高等级推荐必须有 match_score`);
    }
    if (job.verification_status === "captured_jd" && (isUnknown(job.job_description_raw) || isUnknown(job.responsibilities))) {
      errors.push(`${label} captured_jd 缺少完整 JD 或职责证据`);
    }
    if (job.verification_status === "captured_jd") {
      const hasOcrEvidence = job.evidence_source.some((entry) => entry?.type === "ocr_jd");
      if (!hasOcrEvidence || job.capture_status !== "captured") {
        errors.push(`${label} captured_jd 缺少完成态 OCR 证据`);
      }
    }
    if ((Array.isArray(job.hard_filter_reasons) ? job.hard_filter_reasons : []).length > 0
      && job.recommendation !== "不推荐") {
      errors.push(`${label} 命中硬筛条件时必须为不推荐`);
    }
    if (job.job_status === "closed") {
      const closureEvidence = Array.isArray(job.evidence_source) && job.evidence_source.some((entry) => entry?.type === "closure" && !isUnknown(entry?.detail));
      if (!closureEvidence) errors.push(`${label} closed 缺少明确关闭证据`);
    }
  }
  return errors;
}

export function assertValidSiteJobs(jobs) {
  if (!Array.isArray(jobs)) throw new Error("jobs 必须是数组");
  const errors = siteJobErrors(jobs);
  if (errors.length) throw new Error(errors.join("\n"));
}
