import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { braveSearch, collectCodex, parseArgs } from "../scripts/collect-public-index.mjs";
import { normalizeJobTitle, processSearchBatches } from "../scripts/lib/job-index.mjs";
import { buildSitePayload } from "../scripts/index-to-site-jobs.mjs";
import { collectPlan } from "../scripts/lib/resumable-collector.mjs";

test("defaults to Codex input and keeps Brave as an explicit fallback", () => {
  assert.equal(parseArgs([]).provider, "codex");
  assert.equal(parseArgs([]).input, "outputs/inbox/codex-search.json");
  assert.equal(parseArgs(["--provider", "brave"]).provider, "brave");
  assert.equal(parseArgs(["--provider", "fixture"]).provider, "fixture");
});

test("loads Codex search batches without turning them into verified JD records", async () => {
  const source = await collectCodex("fixtures/public-index-sample.json");
  assert.equal(source.queryCount, 2);
  assert.equal(source.batches[0].mode, "exact");
  assert.match(source.fixtureNote, /公开搜索索引/);
});

test("retries transient Brave network failures without exposing the API key", async () => {
  let calls = 0;
  const waits = [];
  const result = await braveSearch("上海 产品经理", 0, {
    count: 20,
    maxAttempts: 3,
  }, {
    apiKey: "test-secret",
    fetch: async () => {
      calls += 1;
      if (calls === 1) throw new Error("socket reset");
      return {
        ok: true,
        json: async () => ({
          web: { results: [{ title: "上海产品经理" }] },
          query: { more_results_available: false },
        }),
      };
    },
    sleep: async (milliseconds) => waits.push(milliseconds),
  });
  assert.equal(calls, 2);
  assert.deepEqual(waits, [1500]);
  assert.equal(result.results.length, 1);
  assert.equal(result.moreResultsAvailable, false);
});

test("stops after the configured number of transient network attempts", async () => {
  const waits = [];
  await assert.rejects(
    braveSearch("上海 产品经理", 0, {
      count: 20,
      maxAttempts: 2,
    }, {
      apiKey: "test-secret",
      fetch: async () => { throw new Error("network unavailable"); },
      sleep: async (milliseconds) => waits.push(milliseconds),
    }),
    (error) => {
      assert.match(error.message, /已尝试 2 次/);
      assert.doesNotMatch(error.message, /test-secret/);
      return true;
    },
  );
  assert.deepEqual(waits, [1500]);
});

test("resumes an interrupted collection without requesting completed pages again", async () => {
  const directory = await mkdtemp(join(tmpdir(), "job-index-checkpoint-"));
  const checkpointPath = join(directory, "checkpoint.json");
  const plan = [{ mode: "exact", query: "q", term: "产品经理", district: "全市" }];
  const fullPage = Array.from({ length: 20 }, (_, index) => ({ title: `上海产品经理 ${index}`, url: `https://www.zhipin.com/job_detail/${index}.html`, description: "上海" }));
  let firstCalls = 0;
  let clock = 1_000;
  const baseOptions = {
    provider: "brave",
    pages: 2,
    count: 20,
    delayMs: 100,
    checkpointPath,
    sleep: async (ms) => { clock += ms; },
    now: () => clock,
  };
  await assert.rejects(
    collectPlan(plan, {
      ...baseOptions,
      resume: false,
      searchPage: async (_query, page) => {
        firstCalls += 1;
        if (page === 1) throw new Error("interrupted");
        return { results: fullPage, moreResultsAvailable: true };
      },
    }),
    /interrupted/,
  );
  assert.equal(firstCalls, 2);

  let resumedCalls = 0;
  const result = await collectPlan(plan, {
    ...baseOptions,
    resume: true,
    searchPage: async (_query, page) => {
      resumedCalls += 1;
      assert.equal(page, 1);
      return { results: [{ title: "上海产品经理", url: "https://www.zhipin.com/job_detail/final.html", description: "上海" }], moreResultsAvailable: false };
    },
  });
  assert.equal(resumedCalls, 1);
  assert.equal(result.resumedBatchCount, 1);
  assert.equal(result.batches.length, 2);
  const checkpoint = JSON.parse(await readFile(checkpointPath, "utf8"));
  assert.equal(checkpoint.completed, true);
  assert.deepEqual((await readdir(directory)).filter((name) => name.endsWith(".tmp")), []);
  await rm(directory, { recursive: true, force: true });
});

test("maps index candidates to information-insufficient site records", () => {
  const payload = buildSitePayload({
    metadata: { source: "fixture", collected_at: "2026-08-04T00:00:00Z" },
    jobs: [{
      job_id: "abc",
      job_url: "https://m.zhipin.com/job_detail/abc.html?x=1",
      job_status: "unknown",
      job_title: "上海增长产品经理 20-30K",
      city: "上海",
      company_name: "unknown",
      product_direction_tags: ["用户增长"],
      index_evidence: { result_description: "上海 增长产品经理 20-30K" },
      missing_information: ["完整JD"],
    }],
  });
  assert.equal(payload.jobs.length, 1);
  assert.equal(payload.jobs[0].url, "https://www.zhipin.com/job_detail/abc.html");
  assert.equal(payload.jobs[0].recommendation, "信息不足");
  assert.equal(payload.jobs[0].score, null);
  assert.equal(payload.jobs[0].verification_status, "unverified_index_snapshot");
  assert.match(payload.jobs[0].description, /公开索引摘要（待验证）/);
});

test("keeps compensation out of the displayed job title", () => {
  assert.equal(normalizeJobTitle("产品经理 15-18K·15薪"), "产品经理");
  assert.equal(normalizeJobTitle("用户增长产品经理-C端AI产品方向 20-30K·15薪"), "用户增长产品经理-C端AI产品方向");
  assert.equal(normalizeJobTitle("AI 产品经理 25-50K"), "AI 产品经理");
});

test("extracts compensation from the raw card title", () => {
  const payload = buildSitePayload({
    jobs: [{
      job_id: "salary-1",
      job_url: "https://www.zhipin.com/job_detail/salary-1.html",
      job_status: "unknown",
      job_title: "产品经理 15-18K·15薪",
      city: "上海",
      salary_range: "15-18K·15薪",
      index_evidence: { result_description: "上海青浦区 3-5年 本科" },
    }],
  });
  assert.equal(payload.jobs[0].title, "产品经理");
  assert.equal(payload.jobs[0].salary, "15-18K·15薪");
});

test("preserves explicit company metadata from an index result", () => {
  const result = processSearchBatches([{
    query: "上海交易产品经理",
    mode: "exact",
    results: [{
      title: "交易产品经理 25-45K·15薪",
      url: "https://www.zhipin.com/job_detail/source-fields.html",
      description: "上海黄浦区 3-5年 本科；负责交易体验。",
      company: "示例公司",
      industry: "互联网",
      financing_stage: "B轮",
      company_size: "500-999人",
    }],
  }], { provider: "codex", collectedAt: "2026-08-04T00:00:00Z" });
  assert.equal(result.jobs[0].company_name, "示例公司");
  assert.equal(result.jobs[0].industry, "互联网");
  assert.equal(result.jobs[0].financing_stage, "B轮");
  assert.equal(result.jobs[0].company_size, "500-999人");
});
