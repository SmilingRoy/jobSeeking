import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { braveSearch, collectCodex, parseArgs } from "../scripts/collect-public-index.mjs";
import { normalizeJobTitle, processSearchBatches } from "../scripts/lib/job-index.mjs";
import { buildSitePayload, deduplicateIndexedRecords, displayIndexSummary } from "../scripts/index-to-site-jobs.mjs";
import { collectPlan } from "../scripts/lib/resumable-collector.mjs";
import { collectCodexLive, codexPrompt, parseCodexExecOutput } from "../scripts/lib/codex-search.mjs";
import { parseWorkerArgs } from "../scripts/run-public-index-worker.mjs";

test("defaults to Codex input and keeps Brave as an explicit fallback", () => {
  assert.equal(parseArgs([]).provider, "codex");
  assert.equal(parseArgs([]).input, "outputs/inbox/codex-search.json");
  assert.equal(parseArgs(["--provider", "brave"]).provider, "brave");
  assert.equal(parseArgs(["--provider", "fixture"]).provider, "fixture");
  assert.equal(parseArgs(["--auto-loop", "--max-rounds", "4"]).autoLoop, true);
  assert.equal(parseArgs(["--auto-loop", "--max-rounds", "4"]).maxRounds, 4);
});

test("supports the ChatGPT-compatible Codex CLI override", () => {
  assert.equal(parseArgs(["--ignore-user-config"]).ignoreUserConfig, true);
  assert.equal(parseWorkerArgs(["--target", "1000", "--interval-ms", "60000"]).target, 1000);
  assert.throws(() => parseWorkerArgs(["--interval-ms", "1000"]), /不得小于 60000/);
});

test("parses Codex exec JSONL final messages", () => {
  const output = [
    JSON.stringify({ type: "turn.started" }),
    JSON.stringify({ type: "item.completed", item: { type: "agent_message", text: '{"queries":[{"query":"q","results":[]}]}' } }),
  ].join("\n");
  assert.equal(parseCodexExecOutput(output).queries.length, 1);
});

test("Codex live loop stops after a round with no new links", async () => {
  const prompts = [];
  let calls = 0;
  const result = await collectCodexLive({}, { maxRounds: 5 }, {
    plan: [{ query: "上海 产品经理", mode: "exact" }],
    search: async (prompt) => {
      prompts.push(prompt);
      calls += 1;
      return calls === 1
        ? { queries: [{ query: "上海 产品经理", mode: "exact", results: [{ title: "产品经理", url: "https://www.zhipin.com/job_detail/new.html", description: "上海" }] }] }
        : { queries: [{ query: "上海 产品经理", mode: "exact", results: [] }] };
    },
  });
  assert.equal(result.requestCount, 2);
  assert.equal(result.rounds, 2);
  assert.match(prompts[1], /不要重复.*new\.html/);
});

test("Codex prompts require a machine-readable search envelope", () => {
  assert.match(codexPrompt("上海 AI产品经理"), /严格 JSON/);
  assert.match(codexPrompt("上海 AI产品经理", { round: 2 }), /第 2 轮/);
});

test("loads Codex search batches without turning them into verified JD records", async () => {
  const source = await collectCodex("fixtures/public-index-sample.json");
  assert.equal(source.queryCount, 2);
  assert.equal(source.batches[0].mode, "exact");
  assert.match(source.fixtureNote, /公开搜索索引/);
});

test("combines multiple Codex inputs before global deduplication", async () => {
  const source = await collectCodex(["fixtures/public-index-sample.json", "fixtures/public-index-sample.json"]);
  assert.equal(source.batches.length, 4);
  assert.equal(source.queryCount, 4);
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
      company_name: "第一家公司",
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
  assert.equal(payload.jobs[0].description, "上海 增长产品经理 20-30K");
  assert.match(payload.jobs[0].job_description_raw, /公开索引摘要（待验证）/);
});

test("keeps compensation out of the displayed job title", () => {
  assert.equal(normalizeJobTitle("产品经理 15-18K·15薪"), "产品经理");
  assert.equal(normalizeJobTitle("用户增长产品经理-C端AI产品方向 20-30K·15薪"), "用户增长产品经理-C端AI产品方向");
  assert.equal(normalizeJobTitle("AI 产品经理 25-50K"), "AI 产品经理");
});

test("shows the responsibility portion of an index summary on the card", () => {
  assert.equal(
    displayIndexSummary("上海徐汇区漕河泾 3-5年 学历不限；负责搭建米哈游国内外增长专项，拉动营收和 DAU。"),
    "负责搭建米哈游国内外增长专项，拉动营收和 DAU。",
  );
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

test("deduplicates canonical URLs and preserves all public index evidence", () => {
  const records = [
    {
      job_id: "duplicate-a",
      job_url: "https://m.zhipin.com/job_detail/duplicate.html?from=one",
      job_title: "增长产品经理",
      city: "上海",
      company_name: "第一家公司",
      index_evidence: { provider: "codex", query: "q1", result_description: "上海；增长产品" },
      missing_information: ["完整JD"],
    },
    {
      job_id: "duplicate-b",
      job_url: "https://www.zhipin.com/job_detail/duplicate.html?from=two",
      job_title: "增长产品经理",
      city: "上海",
      company_name: "另一家公司",
      company_size: "100-499人",
      index_evidence: { provider: "codex", query: "q2", result_description: "上海；增长产品；示例公司" },
      missing_information: ["招聘者信息"],
    },
  ];
  const deduplicated = deduplicateIndexedRecords(records);
  assert.equal(deduplicated.duplicateCount, 1);
  assert.equal(deduplicated.records.length, 1);
  assert.equal(deduplicated.records[0].company_name, "第一家公司");
  assert.deepEqual(deduplicated.records[0].missing_information, ["完整JD", "招聘者信息"]);
  assert.equal(deduplicated.records[0].index_evidence_all.length, 2);
  assert.deepEqual(deduplicated.records[0].review_reasons, ["index_conflict:company_name"]);
  const payload = buildSitePayload({ jobs: records });
  assert.equal(payload.jobs.length, 1);
  assert.equal(payload.jobs[0].evidence_source.length, 2);
  assert.equal(payload.jobs[0].score, null);
});
