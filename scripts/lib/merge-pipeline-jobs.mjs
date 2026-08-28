import { isUnknown, normalizeSiteJobRecord, stableJobId } from "./site-job-contract.mjs";
import { scoreJob } from "./job-scoring.mjs";

const ARRAY_FIELDS = ["tags", "directions", "missing_information", "risk_flags", "interview_questions", "review_reasons"];
const FRESHNESS_FIELDS = ["collected_at", "last_seen_at", "published_or_updated_at", "recruiter_activity", "salary"];
const OCR_COMPLETE_STATUSES = new Set(["captured"]);
const CONFLICT_FIELDS = ["title", "company", "city"];

function unique(values) {
  return [...new Set(values.filter((value) => value != null && value !== ""))];
}

function timestamp(value) {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : -Infinity;
}

function normalizeRecord(record, pipelineHint) {
  const normalizedInput = normalizeSiteJobRecord(record, pipelineHint);
  const url = normalizedInput.url;
  const pipeline = normalizedInput.pipeline;
  const completeOcrEvidence = pipeline === "ocr_jd"
    && OCR_COMPLETE_STATUSES.has(normalizedInput.capture_status)
    && !isUnknown(normalizedInput.job_description_raw)
    && !isUnknown(normalizedInput.responsibilities);
  let verification = normalizedInput.verification_status
    ?? (completeOcrEvidence ? "captured_jd" : (pipeline === "ocr_jd" ? "needs_review" : "unverified_index_snapshot"));
  const reviewReasons = [...normalizedInput.review_reasons];
  if (pipeline === "ocr_jd" && verification === "captured_jd" && !completeOcrEvidence) {
    verification = "needs_review";
    if (!OCR_COMPLETE_STATUSES.has(normalizedInput.capture_status)) reviewReasons.push(`incomplete_ocr:capture_status=${normalizedInput.capture_status}`);
    if (isUnknown(normalizedInput.job_description_raw)) reviewReasons.push("incomplete_ocr:missing_job_description_raw");
    if (isUnknown(normalizedInput.responsibilities)) reviewReasons.push("incomplete_ocr:missing_responsibilities");
  }
  if (pipeline === "ocr_jd" && verification === "needs_review" && reviewReasons.length === 0) {
    reviewReasons.push("incomplete_ocr:evidence_requires_review");
  }
  const normalized = {
    ...normalizedInput,
    id: stableJobId(url),
    url,
    pipeline,
    verification_status: verification,
    review_reasons: unique(reviewReasons),
  };
  if (pipeline === "public_index" || verification === "unverified_index_snapshot") {
    normalized.pipeline = "public_index";
    normalized.verification_status = "unverified_index_snapshot";
    normalized.recommendation = "信息不足";
    normalized.score = null;
  }
  return normalized;
}

function isCompleteOcr(record) {
  return record.pipeline === "ocr_jd" && record.verification_status === "captured_jd" && OCR_COMPLETE_STATUSES.has(record.capture_status) && !isUnknown(record.job_description_raw) && !isUnknown(record.responsibilities);
}

function mergeEvidence(left, right) {
  const keyed = new Map();
  for (const entry of [...left, ...right]) {
    const key = JSON.stringify([entry.type, entry.observed_at, entry.url, entry.query, entry.detail]);
    keyed.set(key, entry);
  }
  return [...keyed.values()];
}

export function mergeJobPair(existingInput, incomingInput) {
  const existing = normalizeRecord(existingInput, existingInput.pipeline ?? "public_index");
  const incoming = normalizeRecord(incomingInput, incomingInput.pipeline ?? "public_index");
  if (existing.url !== incoming.url) throw new Error("不能合并不同 URL 的岗位");

  const existingVerified = existing.verification_status === "captured_jd";
  const incomingComplete = isCompleteOcr(incoming);
  const base = incomingComplete || (!existingVerified && incoming.pipeline === "ocr_jd") ? incoming : existing;
  const supplement = base === incoming ? existing : incoming;
  const merged = { ...base };
  const conflicts = existing.pipeline === "ocr_jd" && incoming.pipeline === "ocr_jd"
    ? CONFLICT_FIELDS.filter((field) => !isUnknown(existing[field]) && !isUnknown(incoming[field]) && existing[field] !== incoming[field])
    : [];

  for (const [key, value] of Object.entries(supplement)) {
    if (ARRAY_FIELDS.includes(key) || key === "evidence_source") continue;
    if (isUnknown(merged[key]) && !isUnknown(value)) merged[key] = value;
  }
  for (const field of ARRAY_FIELDS) {
    merged[field] = unique([...(Array.isArray(existing[field]) ? existing[field] : []), ...(Array.isArray(incoming[field]) ? incoming[field] : [])]);
  }
  merged.evidence_source = mergeEvidence(existing.evidence_source, incoming.evidence_source);
  merged.first_seen_at = [existing.first_seen_at, incoming.first_seen_at, existing.collected_at, incoming.collected_at]
    .filter((value) => timestamp(value) > -Infinity)
    .sort((a, b) => timestamp(a) - timestamp(b))[0] ?? "unknown";

  const newer = timestamp(incoming.collected_at ?? incoming.last_seen_at) >= timestamp(existing.collected_at ?? existing.last_seen_at) ? incoming : existing;
  for (const field of FRESHNESS_FIELDS) {
    if (!isUnknown(newer[field])) merged[field] = newer[field];
  }

  if (existingVerified && !incomingComplete) {
    merged.pipeline = "ocr_jd";
    merged.verification_status = "captured_jd";
    merged.capture_status = existing.capture_status;
    merged.recommendation = existing.recommendation;
    merged.score = existing.score;
  }
  if (incomingComplete) {
    merged.pipeline = "ocr_jd";
    merged.verification_status = "captured_jd";
  } else if (merged.pipeline === "ocr_jd" && merged.verification_status !== "captured_jd") {
    merged.verification_status = "needs_review";
    merged.recommendation = highRecommendation(merged.recommendation) ? "信息不足" : (merged.recommendation ?? "信息不足");
    merged.score = merged.recommendation === "信息不足" ? null : merged.score;
  }
  if (conflicts.length && (!existingVerified || incomingComplete)) {
    merged.verification_status = "needs_review";
    merged.review_reasons = unique([...(merged.review_reasons ?? []), ...conflicts.map((field) => `field_conflict:${field}`)]);
    if (highRecommendation(merged.recommendation)) merged.recommendation = "信息不足";
    if (merged.recommendation === "信息不足") merged.score = null;
  } else if (conflicts.length) {
    merged.review_reasons = unique([...(merged.review_reasons ?? []), ...conflicts.map((field) => `lower_evidence_conflict:${field}`)]);
  }
  if (incoming.job_status === "closed") {
    const hasClosureEvidence = incoming.evidence_source.some((entry) => entry.type === "closure" && !isUnknown(entry.detail));
    merged.job_status = hasClosureEvidence ? "closed" : (existing.job_status ?? "unknown");
  }
  merged.id = stableJobId(merged.url);
  return scoreJob(merged);
}

function highRecommendation(value) {
  return value === "优先推荐" || value === "可以考虑";
}

export function mergePipelineJobs(indexDocument, ocrDocument) {
  const records = new Map();
  const inputs = [
    ...((Array.isArray(indexDocument) ? indexDocument : indexDocument?.jobs) ?? []).map((job) => [job, "public_index"]),
    ...((Array.isArray(ocrDocument) ? ocrDocument : ocrDocument?.jobs) ?? []).map((job) => [job, "ocr_jd"]),
  ];
  for (const [input, pipeline] of inputs) {
    const job = normalizeRecord(input, pipeline);
    records.set(job.url, records.has(job.url) ? mergeJobPair(records.get(job.url), job) : scoreJob(job));
  }
  return [...records.values()].sort((a, b) => String(a.id).localeCompare(String(b.id)));
}
