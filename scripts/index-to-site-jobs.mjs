#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { classifyBossUrl, normalizeJobTitle, normalizeText } from "./lib/job-index.mjs";
import { writeJsonAtomic } from "./lib/atomic-json.mjs";
import { assertValidSiteJobs, normalizeSiteJobRecord } from "./lib/site-job-contract.mjs";
import { scoreJob } from "./lib/job-scoring.mjs";

function parseArgs(argv) {
  const options = { input: "", output: "data/jobs.json", limit: 0 };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--input") options.input = argv[++index];
    else if (token === "--output") options.output = argv[++index];
    else if (token === "--limit") options.limit = Number(argv[++index]);
    else throw new Error(`未知参数：${token}`);
  }
  if (!options.input) throw new Error("缺少 --input 采集结果 JSON");
  if (!Number.isInteger(options.limit) || options.limit < 0) throw new Error("--limit 必须是非负整数");
  return options;
}

export function displayIndexSummary(value) {
  const summary = normalizeText(value);
  if (!summary) return "";
  // Index cards commonly begin with location/experience/education metadata;
  // keep that evidence in job_description_raw but show the responsibility text
  // as the card summary.
  if (/^上海[^；]*；/.test(summary)) return summary.slice(summary.indexOf("；") + 1).trim() || summary;
  return summary;
}

export function indexedRecordToSiteJob(job) {
  if (job?.url && !job?.job_url) return scoreJob(normalizeSiteJobRecord(job, "public_index"));
  const title = normalizeJobTitle(job.job_title);
  const urlInfo = classifyBossUrl(job.job_url);
  if (
    urlInfo.type !== "job_detail" ||
    job.city !== "上海" ||
    !title.includes("产品经理") ||
    job.job_status === "closed"
  ) return null;

  const evidenceRecords = Array.isArray(job.index_evidence_all) && job.index_evidence_all.length
    ? job.index_evidence_all
    : (job.index_evidence ? [job.index_evidence] : []);
  const evidence = evidenceRecords.at(-1) ?? {};
  const summary = normalizeText(evidence.result_description);
  const evidenceText = summary
    ? `公开索引摘要（待验证）：${summary}`
    : "公开索引只确认了上海、产品经理标题和具体岗位链接；完整 JD 待验证。";
  const displaySummary = displayIndexSummary(summary);
  const cardDescription = displaySummary
    ? displaySummary
    : "公开索引只确认了上海、产品经理标题和具体岗位链接；完整 JD 待验证。";
  const directions = Array.isArray(job.product_direction_tags)
    ? job.product_direction_tags.filter((item) => typeof item === "string" && item.trim())
    : [];
  const missingInformation = Array.isArray(job.missing_information)
    ? job.missing_information
    : ["岗位当前开放状态", "完整JD", "公司信息"];

  return scoreJob({
    id: String(job.job_id || urlInfo.jobId),
    url: urlInfo.canonicalUrl,
    title,
    company: job.company_name && job.company_name !== "unknown" ? String(job.company_name) : "unknown",
    city: "上海",
    district: String(job.district ?? "unknown"),
    office_location: String(job.office_location ?? "unknown"),
    salary: String(job.salary_range ?? "unknown"),
    workExperience: String(job.experience_requirement ?? "unknown"),
    education: String(job.education_requirement ?? "unknown"),
    company_size: String(job.company_size ?? "unknown"),
    financing_stage: String(job.financing_stage ?? "unknown"),
    industry: String(job.industry ?? "unknown"),
    recruiter_name: String(job.recruiter_name ?? "unknown"),
    recruiter_role: String(job.recruiter_role ?? "unknown"),
    recruiter_activity: String(job.recruiter_activity ?? "unknown"),
    description: cardDescription,
    job_description_raw: evidenceText,
    responsibilities: String(job.responsibility_summary ?? "unknown"),
    requirements: String(job.qualification_summary ?? "unknown"),
    tags: directions,
    product_form_tags: Array.isArray(job.product_form_tags) ? job.product_form_tags : [],
    product_layer_tags: Array.isArray(job.product_layer_tags) ? job.product_layer_tags : [],
    role_type: String(job.role_type ?? "unknown"),
    team_and_reporting: String(job.team_and_reporting ?? "unknown"),
    work_mode: String(job.work_mode ?? "unknown"),
    travel_requirement: String(job.travel_requirement ?? "unknown"),
    field_evidence: job.field_evidence && typeof job.field_evidence === "object" ? job.field_evidence : {},
    information_confidence: job.information_confidence && typeof job.information_confidence === "object" ? job.information_confidence : {},
    collected_at: String(job.last_seen_at ?? job.collected_at ?? "unknown"),
    recommendation: "信息不足",
    score: null,
    directions,
    responsibility_fit: "unknown",
    title_fit: "高",
    pipeline: "public_index",
    verification_status: "unverified_index_snapshot",
    evidence_source: (evidenceRecords.length ? evidenceRecords : [{}]).map((entry) => ({
      type: "public_index",
      observed_at: String(entry.observed_at ?? job.last_seen_at ?? job.collected_at ?? "unknown"),
      provider: String(entry.provider ?? "unknown"),
      query: String(entry.query ?? "unknown"),
      summary: normalizeText(entry.result_description ?? entry.summary) || "unknown",
    })),
    capture_status: "index_snapshot",
    missing_information: missingInformation,
    review_reasons: Array.isArray(job.review_reasons) ? job.review_reasons : [],
  });
}

function isUnknownIndexedValue(value) {
  return value == null || value === "" || value === "unknown";
}

function mergeIndexedRecords(existing, incoming) {
  const merged = { ...existing };
  const conflictFields = [];
  for (const [key, value] of Object.entries(incoming)) {
    const existingValue = merged[key];
    if (isUnknownIndexedValue(value) && !isUnknownIndexedValue(existingValue)) continue;
    if (!isUnknownIndexedValue(value) && !isUnknownIndexedValue(existingValue)
      && !Array.isArray(value) && !Array.isArray(existingValue)
      && !["job_id", "job_url", "collected_at", "first_seen_at", "last_seen_at", "seen_count", "index_evidence", "index_evidence_all", "field_evidence", "information_confidence"].includes(key)
      && existingValue !== value) {
      conflictFields.push(key);
      continue;
    }
    if (Array.isArray(value) && Array.isArray(existingValue)) {
      merged[key] = [...new Set([...existingValue, ...value])];
      continue;
    }
    if ((key === "field_evidence" || key === "information_confidence")
      && value && typeof value === "object" && !Array.isArray(value)) {
      merged[key] = { ...(existingValue ?? {}), ...value };
      continue;
    }
    if (key === "index_evidence" || key === "index_evidence_all") continue;
    merged[key] = value;
  }
  merged.first_seen_at = [existing.first_seen_at, incoming.first_seen_at]
    .filter((value) => !isUnknownIndexedValue(value))
    .sort()[0] ?? "unknown";
  merged.last_seen_at = [existing.last_seen_at, incoming.last_seen_at]
    .filter((value) => !isUnknownIndexedValue(value))
    .sort()
    .at(-1) ?? "unknown";
  merged.seen_count = (existing.seen_count ?? 1) + (incoming.seen_count ?? 1);
  merged.index_evidence_all = [
    ...(existing.index_evidence_all ?? [existing.index_evidence].filter(Boolean)),
    ...(incoming.index_evidence_all ?? [incoming.index_evidence].filter(Boolean)),
  ];
  merged.index_evidence = merged.index_evidence_all.at(-1) ?? existing.index_evidence ?? incoming.index_evidence;
  merged.review_reasons = [...new Set([
    ...(existing.review_reasons ?? []),
    ...(incoming.review_reasons ?? []),
    ...conflictFields.map((field) => `index_conflict:${field}`),
  ])];
  return merged;
}

export function deduplicateIndexedRecords(records) {
  const byUrl = new Map();
  let duplicateCount = 0;
  for (const record of records) {
    const url = classifyBossUrl(record.job_url ?? record.url).canonicalUrl;
    if (!url || classifyBossUrl(record.job_url ?? record.url).type !== "job_detail") continue;
    if (byUrl.has(url)) {
      duplicateCount += 1;
      byUrl.set(url, mergeIndexedRecords(byUrl.get(url), record));
    } else {
      byUrl.set(url, record);
    }
  }
  return { records: [...byUrl.values()], duplicateCount };
}

export function buildSitePayload(document, limit = 0) {
  const sourceRecords = Array.isArray(document) ? document : document.jobs ?? [];
  const deduplicated = deduplicateIndexedRecords(sourceRecords);
  const mapped = deduplicated.records
    .map(indexedRecordToSiteJob)
    .filter(Boolean);
  const jobs = (limit ? mapped.slice(0, limit) : mapped);
  assertValidSiteJobs(jobs);
  return {
    metadata: {
      source: document.metadata?.source ?? "BOSS直聘公开网页索引",
      pipeline: "public_index",
      verification_status: "unverified_index_snapshot",
      collected_at: document.metadata?.collected_at ?? "unknown",
      input_job_count: sourceRecords.length,
      duplicate_count: deduplicated.duplicateCount,
      rejected_count: deduplicated.records.length - mapped.length,
      review_count: jobs.filter((job) => job.review_reasons.length > 0).length,
      job_count: jobs.length,
      note: "公开索引候选尚未验证岗位开放状态或完整 JD。",
    },
    jobs,
  };
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  const input = JSON.parse(await readFile(resolve(options.input), "utf8"));
  const payload = buildSitePayload(input, options.limit);
  await writeJsonAtomic(resolve(options.output), payload);
  console.log(`site jobs written: ${payload.jobs.length} unverified index snapshots`);
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
