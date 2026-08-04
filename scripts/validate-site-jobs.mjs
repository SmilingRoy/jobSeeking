import { readFile } from "node:fs/promises";

const path = new URL("../data/jobs.json", import.meta.url);
const payload = JSON.parse(await readFile(path, "utf8"));
const jobs = Array.isArray(payload.jobs) ? payload.jobs : [];
const ids = new Set();
const urls = new Set();
const allowed = new Set(["优先推荐", "可以考虑", "谨慎评估", "不推荐", "信息不足"]);
const errors = [];

for (const [index, job] of jobs.entries()) {
  const label = `jobs[${index}]`;
  if (!job.id) errors.push(`${label}.id 缺失`);
  if (ids.has(job.id)) errors.push(`${label}.id 重复: ${job.id}`);
  ids.add(job.id);
  if (!/^https:\/\/www\.zhipin\.com\/job_detail\/.+\.html$/.test(job.url ?? "")) errors.push(`${label}.url 不是具体 BOSS 详情链接`);
  if (urls.has(job.url)) errors.push(`${label}.url 重复: ${job.url}`);
  urls.add(job.url);
  if (!allowed.has(job.recommendation)) errors.push(`${label}.recommendation 不合法: ${job.recommendation}`);
  if (job.score !== null && (typeof job.score !== "number" || job.score < 0 || job.score > 100)) errors.push(`${label}.score 不在 0-100`);
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
console.log(`site jobs valid: ${jobs.length} unique jobs, ${urls.size} concrete BOSS links`);
