export const DATASET_STORAGE_KEY = "job-lens:dataset:v1";
export const USER_STATE_STORAGE_KEY = "job-lens:user-state:v1";
export const USER_STATUSES = ["未查看", "已查看", "候选", "已投递", "忽略"];

const recommendations = new Set(["优先推荐", "可以考虑", "谨慎评估", "不推荐", "信息不足"]);
const pipelines = new Set(["public_index", "ocr_jd"]);
const verificationStatuses = new Set(["unverified_index_snapshot", "captured_jd", "needs_review"]);
const bossUrl = /^https:\/\/www\.zhipin\.com\/job_detail\/([^/]+)\.html$/;

const requiredStringFields = ["id", "url", "title", "city", "recommendation", "pipeline", "verification_status"];
const optionalStringFields = [
  "company", "district", "office_location", "salary", "workExperience", "education",
  "company_size", "financing_stage", "industry", "recruiter_name", "recruiter_role",
  "recruiter_activity", "description", "job_description_raw", "responsibilities",
  "requirements", "collected_at", "capture_status", "responsibility_fit", "title_fit",
  "scoring_config_version", "job_status",
];
const requiredStringArrayFields = ["missing_information", "review_reasons"];
const optionalStringArrayFields = ["tags", "directions", "positive_evidence", "hard_filter_reasons"];

function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isUnknown(value) {
  return value == null || value === "" || value === "unknown";
}

function assertStringArray(job, field, index, required) {
  const value = job[field];
  if (value === undefined && !required) return;
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(`jobs[${index}].${field} 必须是字符串数组`);
  }
}

function assertRawJob(job, index) {
  if (!isPlainObject(job)) throw new Error(`jobs[${index}] 不是对象`);
  for (const field of requiredStringFields) {
    if (typeof job[field] !== "string" || !job[field].trim()) throw new Error(`jobs[${index}].${field} 必须是非空字符串`);
  }
  for (const field of optionalStringFields) {
    if (job[field] !== undefined && typeof job[field] !== "string") throw new Error(`jobs[${index}].${field} 必须是字符串`);
  }
  if (!(job.score === null || (typeof job.score === "number" && Number.isFinite(job.score)))) {
    throw new Error(`jobs[${index}].score 必须是数值或 null`);
  }
  if (job.match_score !== undefined && !(job.match_score === null || (typeof job.match_score === "number" && Number.isFinite(job.match_score)))) {
    throw new Error(`jobs[${index}].match_score 必须是数值或 null`);
  }
  if (job.evidence_confidence !== undefined && !(job.evidence_confidence === null || (typeof job.evidence_confidence === "number" && Number.isFinite(job.evidence_confidence) && job.evidence_confidence >= 0 && job.evidence_confidence <= 1))) {
    throw new Error(`jobs[${index}].evidence_confidence 必须在 0-1 或为 null`);
  }
  for (const field of requiredStringArrayFields) assertStringArray(job, field, index, true);
  for (const field of optionalStringArrayFields) assertStringArray(job, field, index, false);
  if (!Array.isArray(job.evidence_source) || !job.evidence_source.length || job.evidence_source.some((entry) => !isPlainObject(entry) || typeof entry.type !== "string" || !entry.type.trim())) {
    throw new Error(`jobs[${index}].evidence_source 必须是含 type 的非空对象数组`);
  }
  if (job.score_components !== undefined && (!Array.isArray(job.score_components) || job.score_components.some((entry) => !isPlainObject(entry)))) {
    throw new Error(`jobs[${index}].score_components 必须是对象数组`);
  }
  if (job.risk_flags !== undefined && !Array.isArray(job.risk_flags)) throw new Error(`jobs[${index}].risk_flags 必须是数组`);
}

function strings(value) {
  return Array.isArray(value) ? value.filter((item) => typeof item === "string") : [];
}

export function normalizeJob(job) {
  return {
    ...job,
    id: String(job.id),
    url: String(job.url),
    title: String(job.title),
    company: String(job.company ?? "unknown"),
    city: String(job.city),
    district: String(job.district ?? "unknown"),
    office_location: String(job.office_location ?? "unknown"),
    salary: String(job.salary ?? "unknown"),
    workExperience: String(job.workExperience ?? "unknown"),
    education: String(job.education ?? "unknown"),
    company_size: String(job.company_size ?? "unknown"),
    financing_stage: String(job.financing_stage ?? "unknown"),
    industry: String(job.industry ?? "unknown"),
    recruiter_name: String(job.recruiter_name ?? "unknown"),
    recruiter_role: String(job.recruiter_role ?? "unknown"),
    recruiter_activity: String(job.recruiter_activity ?? "unknown"),
    description: String(job.description ?? job.job_description_raw ?? "信息不足"),
    job_description_raw: String(job.job_description_raw ?? "unknown"),
    responsibilities: String(job.responsibilities ?? "unknown"),
    requirements: String(job.requirements ?? "unknown"),
    tags: strings(job.tags),
    directions: strings(job.directions),
    collected_at: String(job.collected_at ?? "unknown"),
    recommendation: job.recommendation,
    score: typeof job.score === "number" ? job.score : null,
    match_score: typeof job.match_score === "number" ? job.match_score : (typeof job.score === "number" ? job.score : null),
    evidence_confidence: typeof job.evidence_confidence === "number" ? job.evidence_confidence : null,
    responsibility_fit: String(job.responsibility_fit ?? "unknown"),
    title_fit: String(job.title_fit ?? "unknown"),
    pipeline: job.pipeline,
    verification_status: job.verification_status,
    evidence_source: job.evidence_source,
    capture_status: String(job.capture_status ?? "unknown"),
    missing_information: strings(job.missing_information),
    review_reasons: strings(job.review_reasons),
    positive_evidence: strings(job.positive_evidence),
    hard_filter_reasons: strings(job.hard_filter_reasons),
    score_components: Array.isArray(job.score_components) ? job.score_components : [],
    risk_flags: Array.isArray(job.risk_flags) ? job.risk_flags : (Array.isArray(job.risks) ? job.risks : []),
    scoring_config_version: String(job.scoring_config_version ?? "unknown"),
  };
}

export function validateAndNormalizePayload(payload) {
  if (!isPlainObject(payload) || !Array.isArray(payload.jobs)) throw new Error("JSON 顶层必须包含 jobs 数组");
  if (payload.metadata !== undefined && !isPlainObject(payload.metadata)) throw new Error("JSON 顶层 metadata 必须是对象");
  const ids = new Set();
  const urls = new Set();
  const jobs = payload.jobs.map((raw, index) => {
    assertRawJob(raw, index);
    const job = normalizeJob(raw);
    const match = job.url.match(bossUrl);
    if (!match) throw new Error(`jobs[${index}].url 不是规范化 BOSS 详情链接`);
    if (job.id !== match[1]) throw new Error(`jobs[${index}].id 与 URL 岗位 ID 不一致`);
    if (ids.has(job.id) || urls.has(job.url)) throw new Error(`jobs[${index}] 岗位重复`);
    ids.add(job.id); urls.add(job.url);
    if (job.city !== "上海" || !job.title.includes("产品经理")) throw new Error(`jobs[${index}] 不是上海产品经理`);
    if (!recommendations.has(job.recommendation)) throw new Error(`jobs[${index}].recommendation 不合法`);
    if (!pipelines.has(job.pipeline) || !verificationStatuses.has(job.verification_status)) throw new Error(`jobs[${index}] 流水线状态不合法`);
    if (job.score !== null && (job.score < 0 || job.score > 100)) throw new Error(`jobs[${index}].score 超出范围`);
    if (job.match_score !== null && (job.match_score < 0 || job.match_score > 100)) throw new Error(`jobs[${index}].match_score 超出范围`);
    if ((job.pipeline === "public_index" || job.verification_status === "unverified_index_snapshot") && (job.score !== null || job.recommendation !== "信息不足")) throw new Error(`jobs[${index}] 公开索引不能展示分数`);
    if (job.verification_status === "needs_review" && ["优先推荐", "可以考虑"].includes(job.recommendation)) throw new Error(`jobs[${index}] 待复核岗位不能高等级推荐`);
    if (job.verification_status === "captured_jd" && (isUnknown(job.job_description_raw) || isUnknown(job.responsibilities))) throw new Error(`jobs[${index}] captured_jd 缺少完整 JD 或职责证据`);
    if (job.job_status === "closed" && !job.evidence_source.some((entry) => entry.type === "closure" && !isUnknown(entry.detail))) throw new Error(`jobs[${index}] closed 缺少明确关闭证据`);
    return job;
  });
  return { metadata: payload.metadata ?? {}, jobs };
}

export function loadPersisted(storage, bundledPayload) {
  const fallback = validateAndNormalizePayload(bundledPayload);
  try {
    const saved = storage.getItem(DATASET_STORAGE_KEY);
    return saved ? validateAndNormalizePayload(JSON.parse(saved)) : fallback;
  } catch {
    return fallback;
  }
}

export function loadUserStates(storage) {
  try {
    const parsed = JSON.parse(storage.getItem(USER_STATE_STORAGE_KEY) ?? "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(Object.entries(parsed).filter(([, value]) => USER_STATUSES.includes(value)));
  } catch {
    return {};
  }
}

export function updateUserState(storage, current, jobId, status) {
  if (!USER_STATUSES.includes(status)) throw new Error("用户状态不合法");
  if (typeof jobId !== "string" || !jobId.trim()) throw new Error("岗位 ID 不合法");
  const next = { ...current, [jobId]: status };
  storage.setItem(USER_STATE_STORAGE_KEY, JSON.stringify(next));
  return next;
}

export function persistDataset(storage, payload) {
  const normalized = validateAndNormalizePayload(payload);
  storage.setItem(DATASET_STORAGE_KEY, JSON.stringify(normalized));
  return normalized;
}
