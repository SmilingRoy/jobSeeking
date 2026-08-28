import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { mergeAndWrite } from "../scripts/merge-job-pipelines.mjs";
import { mergeJobPair, mergePipelineJobs } from "../scripts/lib/merge-pipeline-jobs.mjs";
import { assertValidScoringConfig, scoreJob, scoringConfig } from "../scripts/lib/job-scoring.mjs";
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
    evaluation: {
      direction_fit: "priority",
      responsibility_fit: "high",
      product_form_fit: "priority",
      product_layer_fit: "conditional",
      role_fit: "preferred",
      experience_fit: "medium",
      company_quality: "medium",
      team_quality: "medium",
      growth_value: "high",
      freshness_fit: "high",
      title_fit: "preferred",
      city_fit: "match",
      mandatory_requirement_fit: "match",
      work_mode_fit: "match",
    },
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
  const verified = scoreJob(ocrJob());
  const merged = mergeJobPair(verified, indexJob({ collected_at: "2026-08-03T00:00:00Z" }));
  assert.equal(merged.verification_status, "captured_jd");
  assert.equal(merged.recommendation, verified.recommendation);
  assert.equal(merged.score, verified.score);
  assert.equal(merged.evidence_confidence, verified.evidence_confidence);
  assert.match(merged.job_description_raw, /推动上线/);
});

test("lower-evidence OCR conflicts cannot downgrade a verified record", () => {
  const verified = scoreJob(ocrJob());
  const partial = ocrJob({
    company: "错误公司",
    verification_status: "needs_review",
    capture_status: "detail_unchanged",
    job_description_raw: "unknown",
    responsibilities: "unknown",
    recommendation: "信息不足",
    score: null,
    collected_at: "2026-08-03T00:00:00Z",
  });
  const merged = mergeJobPair(verified, partial);
  assert.equal(merged.verification_status, "captured_jd");
  assert.equal(merged.company, "示例科技");
  assert.ok(merged.review_reasons.includes("lower_evidence_conflict:company"));
});

test("an incomplete OCR record cannot claim captured_jd", () => {
  const [normalized] = mergePipelineJobs({ jobs: [] }, { jobs: [ocrJob({
    capture_status: "detail_unchanged",
    job_description_raw: "unknown",
    responsibilities: "unknown",
    review_reasons: [],
  })] });
  assert.equal(normalized.verification_status, "needs_review");
  assert.equal(normalized.recommendation, "信息不足");
  assert.equal(normalized.score, null);
  assert.ok(normalized.review_reasons.includes("incomplete_ocr:capture_status=detail_unchanged"));
  assertValidSiteJobs([normalized]);
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
  assert.throws(() => assertValidSiteJobs([scoreJob(ocrJob({ job_status: "closed" }))]), /关闭证据/);
  const closed = scoreJob(ocrJob({
    job_status: "closed",
    evidence_source: [
      { type: "ocr_jd", observed_at: "2026-08-02T00:00:00Z", capture_status: "captured" },
      { type: "closure", observed_at: "2026-08-03T00:00:00Z", detail: "页面明确显示职位已关闭" },
    ],
  }));
  assert.doesNotThrow(() => assertValidSiteJobs([closed]));
  assert.equal(closed.recommendation, "不推荐");
  assert.deepEqual(closed.hard_filter_reasons, ["job_status=closed"]);
});

test("new explicit closure evidence updates an existing open record", () => {
  const verified = scoreJob(ocrJob({ job_status: "open" }));
  const closure = indexJob({
    job_status: "closed",
    collected_at: "2026-08-04T00:00:00Z",
    evidence_source: [{ type: "closure", observed_at: "2026-08-04T00:00:00Z", detail: "页面明确显示职位已关闭" }],
  });
  const merged = mergeJobPair(verified, closure);
  assert.equal(merged.job_status, "closed");
  assert.equal(merged.recommendation, "不推荐");
  assert.deepEqual(merged.hard_filter_reasons, ["job_status=closed"]);
});

test("public index records receive the complete unscored contract", () => {
  const scored = scoreJob(indexJob());
  assert.equal(scored.match_score, null);
  assert.equal(scored.evidence_confidence, 0);
  assert.deepEqual(scored.score_components, []);
  assert.equal(scored.scoring_config_version, scoringConfig.version);
  assertValidSiteJobs([scored]);
});

test("unknown dimensions lower confidence without lowering the known-dimension score", () => {
  const complete = scoreJob(ocrJob());
  const uncertain = scoreJob(ocrJob({
    evaluation: {
      direction_fit: "priority",
      responsibility_fit: "high",
      product_form_fit: "unknown",
      product_layer_fit: "unknown",
      role_fit: "unknown",
      experience_fit: "unknown",
      company_quality: "unknown",
      team_quality: "unknown",
      growth_value: "unknown",
      freshness_fit: "unknown",
    },
  }));
  assert.equal(uncertain.match_score, 100);
  assert.ok(uncertain.evidence_confidence < complete.evidence_confidence);
  assert.equal(uncertain.recommendation, "信息不足");
  assert.equal(uncertain.score, null);
});

test("scoring is deterministic, versioned, and explainable", () => {
  const first = scoreJob(ocrJob());
  const second = scoreJob(ocrJob());
  assert.deepEqual(first, second);
  assert.equal(first.score_components.length, 10);
  assert.equal(first.scoring_config_version, "job-pipeline-scoring-v1.0.0");
  assert.equal(first.hard_filter_reasons.length, 0);
  assert.ok(first.match_score >= 0 && first.match_score <= 100);
  assert.ok(first.evidence_confidence >= 0.7);
});

test("invalid scoring configuration fails closed instead of silently changing scores", () => {
  const invalid = structuredClone(scoringConfig);
  invalid.thresholds = { review: 80, consider: 70, preferred: 60 };
  assert.throws(() => assertValidScoringConfig(invalid), /review <= consider <= preferred/);
  assert.throws(() => scoreJob(ocrJob(), invalid), /review <= consider <= preferred/);
});

test("validator rejects high recommendations with low evidence confidence", () => {
  const unsafe = scoreJob(ocrJob());
  unsafe.evidence_confidence = 0.2;
  unsafe.recommendation = "优先推荐";
  assert.throws(() => assertValidSiteJobs([unsafe]), /低证据置信度/);
});

test("validator rejects semantically inconsistent pipeline evidence", () => {
  const inconsistent = scoreJob(ocrJob());
  inconsistent.pipeline = "public_index";
  assert.throws(() => assertValidSiteJobs([inconsistent]), /pipeline 与 verification_status 不一致/);

  const unsupported = scoreJob(ocrJob());
  unsupported.evidence_source = [{ type: "public_index", observed_at: "2026-08-03T00:00:00Z" }];
  assert.throws(() => assertValidSiteJobs([unsupported]), /完成态 OCR 证据/);
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
