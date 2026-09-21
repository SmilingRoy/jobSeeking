import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(new Request("http://localhost/", { headers: { accept: "text/html" } }), {
    ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
  }, { waitUntil() {}, passThroughOnException() {} });
}

test("server renders the Job Lens dashboard with the imported dataset", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await response.text();
  const data = JSON.parse(await readFile(new URL("../data/jobs.json", import.meta.url), "utf8"));
  assert.match(html, /职位雷达/);
  assert.match(html, new RegExp(`上海[\\s\\S]*${data.jobs.length}[\\s\\S]*个岗位`));
  assert.match(html, /筛选岗位/);
  if (data.jobs.length === 0) {
    assert.match(html, /没有符合条件的岗位/);
  } else {
    assert.match(html, /值得投递/);
    assert.doesNotMatch(html, /谨慎评估/);
    assert.doesNotMatch(html, /没有符合条件的岗位/);
  }
  assert.doesNotMatch(html, /Your site is taking shape|codex-preview|SkeletonPreview/);
});

test("site data contains only concrete BOSS detail links", async () => {
  const data = JSON.parse(await readFile(new URL("../data/jobs.json", import.meta.url), "utf8"));
  for (const job of data.jobs) {
    assert.match(job.url, /^https:\/\/www\.zhipin\.com\/job_detail\/.+\.html$/);
    assert.ok(job.id);
  }
});
