import assert from "node:assert/strict";
import test from "node:test";
import { DATASET_STORAGE_KEY, loadPersisted, loadUserStates, persistDataset, updateUserState, USER_STATE_STORAGE_KEY, validateAndNormalizePayload } from "../app/job-workbench.mjs";

class MemoryStorage {
  values = new Map();
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, value); }
}

function job(overrides = {}) {
  return {
    id: "workbench-1",
    url: "https://www.zhipin.com/job_detail/workbench-1.html",
    title: "增长产品经理",
    company: "示例公司",
    city: "上海",
    description: "公开索引摘要（待验证）",
    job_description_raw: "公开索引摘要（待验证）",
    responsibilities: "unknown",
    recommendation: "信息不足",
    score: null,
    pipeline: "public_index",
    verification_status: "unverified_index_snapshot",
    evidence_source: [{ type: "public_index", observed_at: "2026-08-04T00:00:00Z" }],
    missing_information: ["完整JD"],
    review_reasons: [],
    ...overrides,
  };
}

test("strict import validates and really replaces the persisted dataset", () => {
  const storage = new MemoryStorage();
  const result = persistDataset(storage, { metadata: { version: 1 }, jobs: [job()] });
  assert.equal(result.jobs.length, 1);
  assert.equal(loadPersisted(storage, { jobs: [] }).jobs[0].id, "workbench-1");
  assert.ok(storage.getItem(DATASET_STORAGE_KEY));
});

test("invalid import cannot replace the previous dataset", () => {
  const storage = new MemoryStorage();
  persistDataset(storage, { jobs: [job()] });
  const before = storage.getItem(DATASET_STORAGE_KEY);
  assert.throws(() => persistDataset(storage, { jobs: [job({ score: 88, recommendation: "优先推荐" })] }), /公开索引/);
  assert.equal(storage.getItem(DATASET_STORAGE_KEY), before);
});

test("user state persists separately and survives index to OCR upgrade", () => {
  const storage = new MemoryStorage();
  let states = updateUserState(storage, {}, "workbench-1", "候选");
  const upgraded = job({
    pipeline: "ocr_jd",
    verification_status: "captured_jd",
    capture_status: "captured",
    job_description_raw: "职位描述：负责增长产品规划、推动上线与数据验证。",
    responsibilities: "负责增长产品规划、推动上线与数据验证。",
    recommendation: "可以考虑",
    score: 78,
    evidence_source: [{ type: "ocr_jd", observed_at: "2026-08-05T00:00:00Z" }],
  });
  persistDataset(storage, { jobs: [upgraded] });
  states = loadUserStates(storage);
  assert.equal(states["workbench-1"], "候选");
  assert.equal(validateAndNormalizePayload({ jobs: [upgraded] }).jobs[0].verification_status, "captured_jd");
});

test("only known user statuses are loaded", () => {
  const storage = new MemoryStorage();
  storage.setItem(USER_STATE_STORAGE_KEY, JSON.stringify({ good: "已投递", bad: "删除" }));
  assert.deepEqual(loadUserStates(storage), { good: "已投递" });
});
