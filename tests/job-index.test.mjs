import assert from "node:assert/strict";
import test from "node:test";
import {
  buildQueryPlan,
  canonicalizeBossUrl,
  classifyBossUrl,
  mergeHistory,
  normalizeIndexedResult,
  processSearchBatches,
  summarizeQueryMetrics,
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

test("preserves structured enrichment fields and location evidence", () => {
  const normalized = normalizeIndexedResult({
    title: "AI产品经理 25-40K",
    url: "https://www.zhipin.com/job_detail/enriched.html",
    company: "示例公司",
    location: "上海杨浦区五角场",
    salary_range: "25-40K",
    experience_requirement: "3-5年",
    education_requirement: "本科",
    description: "负责AI应用从0到1落地",
    responsibility_summary: "负责需求分析、方案设计和上线复盘",
    qualification_summary: "具备互联网产品经验",
    product_form_tags: ["App"],
    product_layer_tags: ["C端用户层"],
    role_type: "高级产品经理",
    field_evidence: { responsibility_summary: "负责需求分析、方案设计和上线复盘" },
    information_confidence: { company: "medium" }
  }, context);
  assert.equal(normalized.kind, "job");
  assert.equal(normalized.value.district, "杨浦区");
  assert.equal(normalized.value.responsibility_summary, "负责需求分析、方案设计和上线复盘");
  assert.deepEqual(normalized.value.product_form_tags, ["App"]);
  assert.deepEqual(normalized.value.product_layer_tags, ["C端用户层"]);
  assert.equal(normalized.value.field_evidence.responsibility_summary, "负责需求分析、方案设计和上线复盘");
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
  const roleOnlyInSnippet = normalizeIndexedResult({
    title: "上海产品运营 20-30K",
    url: "https://www.zhipin.com/job_detail/c.html",
    description: "上海，协助产品经理推进项目"
  }, context);
  assert.equal(roleOnlyInSnippet.reason, "title_not_product_manager");
});

test("summarizes marginal yield per query", () => {
  const metrics = summarizeQueryMetrics([
    {
      query: "q1",
      mode: "exact",
      results: [
        { title: "上海产品经理 20-30K", url: "https://www.zhipin.com/job_detail/a.html", description: "上海" },
        { title: "上海产品运营", url: "https://www.zhipin.com/job_detail/b.html", description: "上海" },
      ],
    },
  ], { provider: "fixture", collectedAt: context.collectedAt });
  assert.equal(metrics.length, 1);
  assert.equal(metrics[0].raw_results, 2);
  assert.equal(metrics[0].exact_job_links, 1);
  assert.equal(metrics[0].marginal_yield, 0.5);
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

test("does not downgrade known fields during evidence merge", () => {
  const merged = mergeHistory({
    jobs: [{ job_id: "a", job_url: "u", company_name: "已知公司", salary_range: "30-40K", product_direction_tags: ["用户增长"], field_evidence: { company_name: "来源A" }, first_seen_at: "t1", last_seen_at: "t1", seen_count: 1 }],
    discovery_pages: []
  }, {
    jobs: [{ job_id: "a", job_url: "u", company_name: "unknown", salary_range: "unknown", product_direction_tags: ["AI应用"], field_evidence: { salary_range: "来源B" }, first_seen_at: "t2", last_seen_at: "t2", seen_count: 1 }],
    discovery_pages: []
  });
  assert.equal(merged.jobs[0].company_name, "已知公司");
  assert.equal(merged.jobs[0].salary_range, "30-40K");
  assert.deepEqual(merged.jobs[0].product_direction_tags, ["用户增长", "AI应用"]);
  assert.deepEqual(merged.jobs[0].field_evidence, { company_name: "来源A", salary_range: "来源B" });
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
