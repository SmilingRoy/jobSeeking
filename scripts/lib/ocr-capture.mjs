import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import { join, resolve } from "node:path";

export const DEFAULT_RUNS_DIR = resolve("outputs/ocr-runs");

export function canonicalizeBossUrl(value) {
  try {
    const url = new URL(String(value));
    if (!/^(www\.|m\.)?zhipin\.com$/i.test(url.hostname)) return null;
    if (!/^\/job_detail\/[^/]+\.html$/i.test(url.pathname)) return null;
    return `https://www.zhipin.com${url.pathname}`;
  } catch {
    return null;
  }
}

export function safeRunId(value) {
  const normalized = String(value || "").replace(/[^a-zA-Z0-9_-]/g, "-").replace(/-+/g, "-");
  return normalized.slice(0, 80) || `ocr-${Date.now()}`;
}

export async function atomicWriteJson(path, value) {
  await mkdir(resolve(path, ".."), { recursive: true });
  const temporary = `${path}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporary, path);
}

export async function createRun(root, requestedRunId) {
  const runId = safeRunId(requestedRunId);
  const runDir = join(root, runId);
  const screenshotsDir = join(runDir, "screenshots");
  await mkdir(screenshotsDir, { recursive: true });
  if (requestedRunId) {
    try {
      const manifest = JSON.parse(await readFile(join(runDir, "manifest.json"), "utf8"));
      return { runId, runDir, screenshotsDir, manifest };
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }
  const manifest = {
    run_id: runId,
    source: "boss_chrome",
    created_at: new Date().toISOString(),
    jobs: [],
  };
  await atomicWriteJson(join(runDir, "manifest.json"), manifest);
  return { runId, runDir, screenshotsDir, manifest };
}

export async function loadRun(root, runId) {
  const safeId = safeRunId(runId);
  const runDir = join(root, safeId);
  const manifestPath = join(runDir, "manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  return { runId: safeId, runDir, screenshotsDir: join(runDir, "screenshots"), manifest };
}

export function screenshotName(sequence, kind, page = 1) {
  const number = String(sequence).padStart(4, "0");
  return kind === "card" ? `job_${number}_card_context.png` : `job_${number}_detail_${String(page).padStart(2, "0")}.png`;
}

export function upsertJob(manifest, incoming) {
  const url = canonicalizeBossUrl(incoming.url);
  if (!url) throw new Error("仅支持具体 BOSS job_detail URL");
  const existing = manifest.jobs.find((job) => job.url === url);
  const job = {
    sequence: existing?.sequence ?? incoming.sequence ?? manifest.jobs.length + 1,
    url,
    title_hint: String(incoming.title_hint || existing?.title_hint || "").slice(0, 200),
    card_screenshot: incoming.card_screenshot || existing?.card_screenshot || "",
    detail_screenshots: [...new Set([...(existing?.detail_screenshots || []), ...(incoming.detail_screenshots || [])])],
    capture_status: incoming.capture_status || existing?.capture_status || "needs_review",
    page_state: incoming.page_state || existing?.page_state || "unknown",
    captured_at: incoming.captured_at || existing?.captured_at || new Date().toISOString(),
  };
  if (existing) Object.assign(existing, job);
  else manifest.jobs.push(job);
  manifest.jobs.sort((a, b) => a.sequence - b.sequence);
  return job;
}

export function decodeImageData(value) {
  const raw = String(value || "");
  const match = raw.match(/^data:image\/(png|jpeg|jpg);base64,(.+)$/i);
  if (!match) throw new Error("图片必须是 data:image/png 或 data:image/jpeg base64 数据");
  return { extension: match[1].toLowerCase() === "png" ? "png" : "jpg", bytes: Buffer.from(match[2], "base64") };
}
