import { readFile, writeFile } from "node:fs/promises";

const manifestPath = process.argv[2];
if (!manifestPath) {
  throw new Error("用法：node scripts/import-inline-collector.mjs MANIFEST_PATH [OUTPUT_PATH]");
}
const outputPath = process.argv[3] ?? new URL("../data/jobs.json", import.meta.url).pathname;

const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const jobs = [];
const seen = new Set();

for (const item of manifest.jobs ?? []) {
  const url = String(item.url ?? "").trim();
  if (!/^https:\/\/www\.zhipin\.com\/job_detail\/[^/]+\.html$/i.test(url)) continue;
  const key = String(item.canonical_key ?? url).toLowerCase();
  if (seen.has(key)) continue;
  seen.add(key);
  const sequence = Number(item.sequence ?? jobs.length + 1);
  const screenshots = Array.isArray(item.screenshot_files) ? item.screenshot_files : [];
  jobs.push({
    id: key.replace(/^www\.zhipin\.com\//, "").replaceAll("/", "-") || `boss-${sequence}`,
    url,
    title: "信息不足（待 OCR）",
    company: "信息不足（待 OCR）",
    city: "上海",
    district: "unknown",
    office_location: "unknown",
    salary: "unknown",
    workExperience: "unknown",
    education: "unknown",
    company_size: "unknown",
    financing_stage: "unknown",
    industry: "互联网产品",
    recruiter_name: "unknown",
    recruiter_role: "unknown",
    recruiter_activity: "unknown",
    description: "已采集岗位详情截图，文字字段待 OCR/人工复核。",
    job_description_raw: "已采集岗位详情截图，文字字段待 OCR/人工复核。",
    responsibilities: "信息不足（待 OCR）",
    requirements: "信息不足（待 OCR）",
    tags: ["产品经理", "上海", "待解析"],
    directions: [],
    collected_at: String(item.captured_at ?? manifest.created_at ?? "unknown"),
    recommendation: "信息不足",
    score: null,
    responsibility_fit: "unknown",
    title_fit: "unknown",
    capture_status: String(item.status ?? "unknown"),
    capture_note: String(item.note ?? ""),
    list_page: Number(item.list_page ?? 0),
    card_index: Number(item.card_index ?? 0),
    screenshot_count: screenshots.length,
    evidence_source: "BOSS 可见列表卡片悬停链接 + 右侧详情截图",
  });
}

const payload = {
  metadata: {
    source: "BOSS直聘上海+产品经理列表页",
    collected_at: manifest.created_at,
    job_count: jobs.length,
    note: "精确链接已保留；截图文字字段未完成 OCR 的记录统一标记为信息不足，不推断未知内容。",
  },
  jobs,
};
await writeFile(outputPath, JSON.stringify(payload, null, 2) + "\n", "utf8");
console.log(`imported ${jobs.length} jobs to ${outputPath}`);
