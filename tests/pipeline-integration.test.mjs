import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { mergeAndWrite } from "../scripts/merge-job-pipelines.mjs";
import { mergeJobPair, mergePipelineJobs } from "../scripts/lib/merge-pipeline-jobs.mjs";
import { assertValidSiteJobs } from "../scripts/lib/site-job-contract.mjs";

const url = "https://www.zhipin.com/job_detail/integration-1.html";

function indexJob(overrides = {}) {
  return {
    id: "integration-1",
    url,
    title: "增长产品经理",
    company: "unknown",
    city: "上海",
    district: "unknown",
    description: "公开索引摘要（待验证）",
    job_description_raw: "公开索引摘要（待验证）",
    responsibilities: "unknown",
    recommendation: "信息不足",
    score: null,
    pipeline: "public_index",
    verification_status: "unverified_index_snapshot",
    capture_status: "index_snapshot",
    collected_at: "2026-08-01T00:00:00Z",
    first_seen_at: "2026-08-01T00:00:00Z",
    missing_information: ["完整JD", "公司信息"],
    review_reasons: [],
    evidence_source: [{ type: "public_index", observed_at: "2026-08-01T00:00:00Z", query: "上海 产品经理" }],
    ...overrides,
  };
}

function ocrJob(overrides = {}) {
  return {
    ...indexJob(),
    company: "示例科技",
    job_description_raw: "职位描述：负责用户增长产品规划、推动上线并进行数据验证。任职要求：3年以上产品经验。",
    description: "负责用户增长产品规划、推动上线并进行数据验证。",
    responsibilities: "负责用户增长产品规划、推动上线并进行数据验证。",
    requirements: "3年以上产品经验。",
    recommendation: "可以考虑",
    score: 78,
    pipeline: "ocr_jd",
    verification_status: "captured_jd",
    capture_status: "captured",
    collected_at: "2026-08-02T00:00:00Z",
    missing_information: ["团队规模"],
    evidence_source: [{ type: "ocr_jd", observed_at: "2026-08-02T00:00:00Z", capture_status: "captured" }],
    ...overrides,
  };
}

test("complete OCR upgrades a public candidate and preserves index evidence", () => {
  const [merged] = mergePipelineJobs({ jobs: [indexJob()] }, { jobs: [ocrJob()] });
  assert.equal(merged.pipeline, "ocr_jd");
  assert.equal(merged.verification_status, "captured_jd");
  assert.equal(merged.company, "示例科技");
  assert.equal(merged.first_seen_at, "2026-08-01T00:00:00Z");
  assert.deepEqual(merged.evidence_source.map((entry) => entry.type), ["public_index", "ocr_jd"]);
  assertValidSiteJobs([merged]);
});

test("later index observation cannot downgrade a verified record", () => {
  const merged = mergeJobPair(ocrJob(), indexJob({ collected_at: "2026-08-03T00:00:00Z" }));
  assert.equal(merged.verification_status, "captured_jd");
  assert.equal(merged.recommendation, "可以考虑");
  assert.equal(merged.score, 78);
  assert.match(merged.job_description_raw, /推动上线/);
});

test("unknown fields never overwrite known fields and URLs deduplicate", () => {
  const [merged] = mergePipelineJobs(
    { jobs: [indexJob({ company: "索引公司" }), indexJob({ url: "https://m.zhipin.com/job_detail/integration-1.html?from=x" })] },
    { jobs: [ocrJob({ company: "unknown" })] },
  );
  assert.equal(merged.company, "索引公司");
  assert.equal(merged.id, "integration-1");
});

test("closed status requires explicit closure evidence", () => {
  assert.throws(() => assertValidSiteJobs([ocrJob({ job_status: "closed" })]), /关闭证据/);
  const closed = ocrJob({
    job_status: "closed",
    evidence_source: [{ type: "closure", observed_at: "2026-08-03T00:00:00Z", detail: "页面明确显示职位已关闭" }],
  });
  assert.doesNotThrow(() => assertValidSiteJobs([closed]));
});

test("conflicting OCR identity fields enter review instead of recommendation", () => {
  const merged = mergeJobPair(ocrJob(), ocrJob({ company: "另一家公司", collected_at: "2026-08-03T00:00:00Z" }));
  assert.equal(merged.verification_status, "needs_review");
  assert.equal(merged.recommendation, "信息不足");
  assert.equal(merged.score, null);
  assert.deepEqual(merged.review_reasons, ["field_conflict:company"]);
});

test("validation failure leaves the existing output untouched", async () => {
  const directory = await mkdtemp(join(tmpdir(), "pipeline-atomic-"));
  const indexPath = join(directory, "index.json");
  const ocrPath = join(directory, "ocr.json");
  const outputPath = join(directory, "jobs.json");
  const original = '{"sentinel":true}\n';
  await writeFile(indexPath, JSON.stringify({ jobs: [indexJob()] }));
  await writeFile(ocrPath, JSON.stringify({ jobs: [ocrJob({ title: "项目经理" })] }));
  await writeFile(outputPath, original);
  await assert.rejects(mergeAndWrite({ index: indexPath, ocr: ocrPath, output: outputPath }), /title/);
  assert.equal(await readFile(outputPath, "utf8"), original);
  await rm(directory, { recursive: true, force: true });
});
