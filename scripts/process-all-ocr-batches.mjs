#!/usr/bin/env node
import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { writeProcessingStatus } from "./lib/ocr-batch-status.mjs";

const root = resolve(".");
const runsRoot = resolve(process.argv[2] ?? "outputs/ocr-runs");
const workers = Number(process.argv[3] ?? 8);

function runBatch(runDir) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, ["scripts/ocr-process.mjs", "--run", runDir, "--workers", String(workers)], {
      cwd: root,
      stdio: "inherit",
    });
    child.on("error", reject);
    child.on("exit", (code) => code === 0 ? resolvePromise() : reject(new Error(`batch exited with ${code}`)));
  });
}

const entries = (await readdir(runsRoot, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory() && entry.name.startsWith("ocr-"))
  .map((entry) => entry.name)
  .sort();
const summary = [];
for (const name of entries) {
  const runDir = join(runsRoot, name);
  const manifestPath = join(runDir, "manifest.json");
  if (!existsSync(manifestPath)) continue;
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const screenshots = join(runDir, "screenshots");
  if (!existsSync(screenshots) || !(manifest.jobs?.length)) {
    await writeProcessingStatus(runDir, "skipped", { run_id: name, reason: "no_capturable_jobs_or_screenshots" });
    summary.push({ run_id: name, status: "skipped" });
    continue;
  }
  try {
    await runBatch(runDir);
    summary.push({ run_id: name, status: "processed" });
  } catch (error) {
    summary.push({ run_id: name, status: "failed", error: error.message });
    console.error(`批次 ${name} 处理失败，继续处理后续批次：${error.message}`);
  }
}
console.log(JSON.stringify(summary, null, 2));
