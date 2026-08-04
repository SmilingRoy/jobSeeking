import assert from "node:assert/strict";
import test from "node:test";
import {
  buildQueryPlan,
  canonicalizeBossUrl,
  classifyBossUrl,
  mergeHistory,
  normalizeIndexedResult,
  processSearchBatches
} from "../scripts/lib/job-index.mjs";

const context = {
  provider: "fixture",
  query: "site:zhipin.com/job_detail/ 上海 产品经理",
  mode: "exact",
  rank: 1,
  collectedAt: "2026-08-03T00:00:00.000Z"
};

test("canonicalizes supported BOSS URLs and drops tracking parameters", () => {
  assert.equal(
    canonicalizeBossUrl("http://m.zhipin.com/job_detail/abc123.html?ka=search_list_1#top"),
    "https://www.zhipin.com/job_detail/abc123.html"
  );
  assert.equal(canonicalizeBossUrl("https://example.com/job_detail/abc.html"), null);
  assert.deepEqual(classifyBossUrl("https://www.zhipin.com/job_detail/abc123.html"), {
    type: "job_detail",
    canonicalUrl: "https://www.zhipin.com/job_detail/abc123.html",
    jobId: "abc123"
  });
});

test("keeps only Shanghai product-manager evidence as an unverified schema record", () => {
  const normalized = normalizeIndexedResult({
    title: "上海交易产品经理招聘 30-45K",
    url: "https://www.zhipin.com/job_detail/abc123.html?source=search",
    description: "上海浦东新区，3-5年，本科"
  }, context);
  assert.equal(normalized.kind, "job");
  assert.equal(normalized.value.job_id, "abc123");
  assert.equal(normalized.value.city, "上海");
  assert.equal(normalized.value.district, "浦东新区");
  assert.equal(normalized.value.salary_range, "30-45K");
  assert.equal(normalized.value.job_status, "unknown");
  assert.equal(normalized.value.evaluation.city_fit, "match");
  assert.deepEqual(normalized.value.product_direction_tags, ["交易"]);
  assert.equal(normalized.value.index_evidence.verification_status, "unverified_index_snapshot");
});

test("rejects unconfirmed city and non-product-manager results", () => {
  const missingCity = normalizeIndexedResult({
    title: "产品经理 20-30K",
    url: "https://www.zhipin.com/job_detail/a.html",
    description: "3-5年"
  }, context);
  assert.equal(missingCity.reason, "city_not_confirmed_shanghai");
  const wrongRole = normalizeIndexedResult({
    title: "上海产品运营 20-30K",
    url: "https://www.zhipin.com/job_detail/b.html",
    description: "上海"
  }, context);
  assert.equal(wrongRole.reason, "title_not_product_manager");
});

test("deduplicates exact links across queries and preserves both evidence records", () => {
  const result = processSearchBatches([
    { query: "q1", mode: "exact", results: [{ title: "上海产品经理 20-30K", url: "https://www.zhipin.com/job_detail/a.html", description: "上海" }] },
    { query: "q2", mode: "exact", results: [{ title: "上海增长产品经理 20-30K", url: "https://www.zhipin.com/job_detail/a.html?x=1", description: "上海" }] }
  ], { provider: "fixture", collectedAt: context.collectedAt });
  assert.equal(result.jobs.length, 1);
  assert.equal(result.stats.duplicateCount, 1);
  assert.equal(result.jobs[0].index_evidence_all.length, 2);
});

test("merges repeated runs into stable history", () => {
  const first = { jobs: [{ job_id: "a", job_url: "u", first_seen_at: "t1", last_seen_at: "t1", seen_count: 1 }], discovery_pages: [] };
  const second = { jobs: [{ job_id: "a", job_url: "u", first_seen_at: "t2", last_seen_at: "t2", seen_count: 1 }, { job_id: "b", job_url: "v", first_seen_at: "t2", last_seen_at: "t2", seen_count: 1 }], discovery_pages: [] };
  const merged = mergeHistory(first, second);
  assert.equal(merged.jobs.length, 2);
  assert.equal(merged.jobs.find((job) => job.job_id === "a").first_seen_at, "t1");
  assert.equal(merged.jobs.find((job) => job.job_id === "a").seen_count, 2);
});

test("builds a bounded query matrix", () => {
  const config = {
    city: "上海",
    terms: ["产品经理", "增长产品经理"],
    modes: [
      { id: "exact", template: "site:zhipin.com/job_detail/ {city} {district} {term}" },
      { id: "listing", template: "site:zhipin.com/zhaopin/ {city}{district}{term}" }
    ]
  };
  const plan = buildQueryPlan(config, { modes: ["exact"], queryLimit: 1 });
  assert.deepEqual(plan, [{ term: "产品经理", district: "全市", mode: "exact", query: "site:zhipin.com/job_detail/ 上海 产品经理" }]);
});

test("can shard the query plan by Shanghai districts for larger runs", () => {
  const config = {
    city: "上海",
    district_shards: ["浦东新区", "徐汇区"],
    terms: ["产品经理"],
    modes: [{ id: "exact", template: "site:zhipin.com/job_detail/ {city} {district} {term}" }]
  };
  const plan = buildQueryPlan(config, { districtShards: true });
  assert.equal(plan.length, 3);
  assert.deepEqual(plan.map((item) => item.district), ["全市", "浦东新区", "徐汇区"]);
  assert.match(plan[1].query, /上海 浦东新区 产品经理/);
});
