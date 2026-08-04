const allowedRecommendations = new Set([
  "优先推荐",
  "可以考虑",
  "谨慎评估",
  "不推荐",
  "信息不足",
]);

const allowedVerificationStatuses = new Set([
  "unverified_index_snapshot",
  "captured_jd",
  "needs_review",
]);

export function siteJobErrors(jobs) {
  const errors = [];
  const ids = new Set();
  const urls = new Set();
  for (const [index, job] of jobs.entries()) {
    const label = `jobs[${index}]`;
    if (!job.id) errors.push(`${label}.id 缺失`);
    if (ids.has(job.id)) errors.push(`${label}.id 重复: ${job.id}`);
    ids.add(job.id);
    if (!/^https:\/\/www\.zhipin\.com\/job_detail\/[^/]+\.html$/.test(job.url ?? "")) {
      errors.push(`${label}.url 不是具体 BOSS 详情链接`);
    }
    if (urls.has(job.url)) errors.push(`${label}.url 重复: ${job.url}`);
    urls.add(job.url);
    if (job.city !== "上海") errors.push(`${label}.city 不是上海`);
    if (!String(job.title ?? "").includes("产品经理")) errors.push(`${label}.title 不包含产品经理`);
    if (!allowedRecommendations.has(job.recommendation)) errors.push(`${label}.recommendation 不合法: ${job.recommendation}`);
    if (job.score !== null && (typeof job.score !== "number" || job.score < 0 || job.score > 100)) {
      errors.push(`${label}.score 不在 0-100`);
    }
    if (job.verification_status && !allowedVerificationStatuses.has(job.verification_status)) {
      errors.push(`${label}.verification_status 不合法: ${job.verification_status}`);
    }
  }
  return errors;
}

export function assertValidSiteJobs(jobs) {
  if (!Array.isArray(jobs)) throw new Error("jobs 必须是数组");
  const errors = siteJobErrors(jobs);
  if (errors.length) throw new Error(errors.join("\n"));
}
