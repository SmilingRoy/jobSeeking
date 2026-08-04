import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { buildSitePayload } from "../scripts/index-to-site-jobs.mjs";
import { collectPlan } from "../scripts/lib/resumable-collector.mjs";

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
