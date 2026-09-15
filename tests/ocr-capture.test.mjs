import assert from "node:assert/strict";
import test from "node:test";
import { canonicalizeBossUrl, decodeImageData, safeRunId, upsertJob } from "../scripts/lib/ocr-capture.mjs";

test("canonicalizes BOSS detail URLs and rejects list pages", () => {
  assert.equal(canonicalizeBossUrl("https://m.zhipin.com/job_detail/a.html?from=search"), "https://www.zhipin.com/job_detail/a.html");
  assert.equal(canonicalizeBossUrl("https://www.zhipin.com/job_detail/a.html"), "https://www.zhipin.com/job_detail/a.html");
  assert.equal(canonicalizeBossUrl("https://www.zhipin.com/job duizhi"), null);
  assert.equal(canonicalizeBossUrl("https://example.com/job_detail/a.html"), null);
});

test("upsertJob deduplicates by canonical URL and preserves detail pages", () => {
  const manifest = { jobs: [] };
  upsertJob(manifest, { url: "https://m.zhipin.com/job_detail/a.html?x=1", title_hint: "产品经理", detail_screenshots: ["screenshots/a.png"] });
  upsertJob(manifest, { url: "https://www.zhipin.com/job_detail/a.html", title_hint: "产品经理（更新）", detail_screenshots: ["screenshots/b.png"] });
  assert.equal(manifest.jobs.length, 1);
  assert.deepEqual(manifest.jobs[0].detail_screenshots, ["screenshots/a.png", "screenshots/b.png"]);
});

test("image payloads are limited to supported data URLs", () => {
  assert.equal(decodeImageData("data:image/png;base64,Zm9v").bytes.toString(), "foo");
  assert.throws(() => decodeImageData("data:text/plain;base64,Zm9v"), /图片必须/);
  assert.equal(safeRunId("2026/09/14 test"), "2026-09-14-test");
});
