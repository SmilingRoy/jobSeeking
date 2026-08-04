#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { classifyBossUrl, normalizeText } from "./lib/job-index.mjs";
import { writeJsonAtomic } from "./lib/atomic-json.mjs";
import { assertValidSiteJobs } from "./lib/site-job-contract.mjs";

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

export function indexedRecordToSiteJob(job) {
  const title = normalizeText(job.job_title);
  const urlInfo = classifyBossUrl(job.job_url);
  if (
    urlInfo.type !== "job_detail" ||
    job.city !== "上海" ||
    !title.includes("产品经理") ||
    job.job_status === "closed"
  ) return null;

  const evidence = job.index_evidence ?? {};
  const summary = normalizeText(evidence.result_description);
  const evidenceText = summary
    ? `公开索引摘要（待验证）：${summary}`
    : "公开索引只确认了上海、产品经理标题和具体岗位链接；完整 JD 待验证。";
  const directions = Array.isArray(job.product_direction_tags)
    ? job.product_direction_tags.filter((item) => typeof item === "string" && item.trim())
    : [];
  const missingInformation = Array.isArray(job.missing_information)
    ? job.missing_information
    : ["岗位当前开放状态", "完整JD", "公司信息"];

  return {
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
    description: evidenceText,
    job_description_raw: evidenceText,
    responsibilities: "unknown",
    requirements: "unknown",
    tags: directions,
    collected_at: String(job.last_seen_at ?? job.collected_at ?? "unknown"),
    recommendation: "信息不足",
    score: null,
    directions,
    responsibility_fit: "unknown",
    title_fit: "高",
    pipeline: "public_index",
    verification_status: "unverified_index_snapshot",
    evidence_source: [{
      type: "public_index",
      observed_at: String(job.last_seen_at ?? job.collected_at ?? "unknown"),
      provider: String(evidence.provider ?? "unknown"),
      query: String(evidence.query ?? "unknown"),
      summary: summary || "unknown",
    }],
    capture_status: "index_snapshot",
    missing_information: missingInformation,
    review_reasons: [],
  };
}

export function buildSitePayload(document, limit = 0) {
  const mapped = (Array.isArray(document) ? document : document.jobs ?? [])
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
