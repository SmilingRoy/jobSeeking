import assert from "node:assert/strict";
import test from "node:test";
import { buildSitePayload } from "../scripts/index-to-site-jobs.mjs";
import { mergePipelineJobs } from "../scripts/lib/merge-pipeline-jobs.mjs";
import {
  assertValidSiteJobs,
  normalizeSiteJobRecord,
} from "../scripts/lib/site-job-contract.mjs";

const sourceJob = {
  job_id: "contract-1",
  job_url: "https://m.zhipin.com/job_detail/contract-1.html?from=search",
  job_status: "unknown",
  job_title: "增长产品经理 20-35K·15薪",
  city: "上海",
  district: "浦东新区",
  office_location: "张江",
  salary_range: "20-35K·15薪",
  experience_requirement: "3-5年",
  education_requirement: "本科",
  company_name: "示例科技",
  company_size: "100-499人",
  financing_stage: "B轮",
  industry: "互联网",
  description: "负责用户增长产品规划。",
  job_description_raw: "公开索引摘要（待验证）：上海浦东新区；负责用户增长产品规划。",
  responsibilities: "unknown",
  requirements: "unknown",
  product_direction_tags: ["用户增长"],
  index_evidence: { provider: "fixture", result_description: "上海浦东新区；负责用户增长产品规划。" },
  missing_information: ["完整JD"],
};

test("enriched public-index fields enter the standard contract", () => {
  const payload = buildSitePayload({ metadata: { source: "fixture" }, jobs: [sourceJob] });
  const [job] = payload.jobs;
  assert.equal(job.salary, "20-35K·15薪");
  assert.equal(job.workExperience, "3-5年");
  assert.equal(job.education, "本科");
  assert.equal(job.district, "浦东新区");
  assert.equal(job.office_location, "张江");
  assert.equal(job.company_size, "100-499人");
  assert.equal(job.financing_stage, "B轮");
  assert.equal(job.industry, "互联网");
  assert.deepEqual(job.tags, ["用户增长"]);
  assert.deepEqual(job.directions, ["用户增长"]);
  assert.equal(job.pipeline, "public_index");
  assert.equal(job.verification_status, "unverified_index_snapshot");
  assert.equal(job.match_score, null);
  assert.equal(job.score, null);
  assert.ok(Array.isArray(job.evidence_source));
  assertValidSiteJobs(payload.jobs);
});

test("legacy evidence strings normalize at the contract boundary", () => {
  const normalized = normalizeSiteJobRecord({
    ...sourceJob,
    evidence_source: "BOSS公开索引",
  });
  assert.deepEqual(normalized.evidence_source, [{ type: "public_index", observed_at: "unknown", detail: "BOSS公开索引" }]);
  assert.doesNotThrow(() => assertValidSiteJobs([normalized]));
  assert.throws(() => assertValidSiteJobs([{ ...normalized, evidence_source: "BOSS公开索引" }]), /必须是非空数组/);
});

test("known enriched fields survive unknown incoming evidence", () => {
  const known = normalizeSiteJobRecord({ ...sourceJob, url: sourceJob.job_url, evidence_source: [{ type: "public_index", observed_at: "t1" }] });
  const incoming = normalizeSiteJobRecord({
    ...sourceJob,
    job_url: "https://www.zhipin.com/job_detail/contract-1.html",
    company_name: "unknown",
    salary_range: "unknown",
    district: "unknown",
    evidence_source: [{ type: "public_index", observed_at: "t2" }],
  });
  const [merged] = mergePipelineJobs({ jobs: [known, incoming] }, { jobs: [] });
  assert.equal(merged.company, "示例科技");
  assert.equal(merged.salary, "20-35K·15薪");
  assert.equal(merged.district, "浦东新区");
  assert.equal(merged.url, "https://www.zhipin.com/job_detail/contract-1.html");
});

test("same normalized BOSS URL is globally deduplicated", () => {
  const [merged] = mergePipelineJobs(
    { jobs: [sourceJob] },
    { jobs: [{ ...sourceJob, job_url: "https://www.zhipin.com/job_detail/contract-1.html?utm_source=ocr", pipeline: "ocr_jd", verification_status: "needs_review", capture_status: "detail_unchanged", evidence_source: [{ type: "ocr_jd", observed_at: "t2" }] }] },
  );
  assert.equal(merged.id, "contract-1");
  assert.equal(merged.url, "https://www.zhipin.com/job_detail/contract-1.html");
  assert.equal(merged.evidence_source.length, 2);
});
