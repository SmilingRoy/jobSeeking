#!/usr/bin/env node
import { existsSync } from "node:fs";
import { mkdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { atomicWriteJson } from "./lib/ocr-capture.mjs";
import { mergePipelineJobs } from "./lib/merge-pipeline-jobs.mjs";
import { writeProcessingStatus } from "./lib/ocr-batch-status.mjs";

const root = resolve(".");

function parseArgs(argv) {
  const options = { run: "", workers: 8 };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--run") options.run = argv[++index];
    else if (argv[index] === "--workers") options.workers = Number(argv[++index]);
    else throw new Error(`未知参数：${argv[index]}`);
  }
  if (!options.run) throw new Error("必须提供 --run outputs/ocr-runs/<run-id>");
  if (!Number.isInteger(options.workers) || options.workers < 1 || options.workers > 32) throw new Error("--workers 必须是 1 到 32 的整数");
  return options;
}

function run(command, args) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { cwd: root, stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (code) => code === 0 ? resolvePromise() : reject(new Error(`${command} exited with ${code}`)));
  });
}

const options = parseArgs(process.argv.slice(2));
const runDir = resolve(options.run);
const manifestPath = join(runDir, "manifest.json");
const screenshots = join(runDir, "screenshots");
const output = join(runDir, "jobs.json");
if (!existsSync(manifestPath) || !existsSync(screenshots)) throw new Error(`批次目录不完整：${runDir}`);

await writeProcessingStatus(runDir, "processing", { run_id: options.run, output });
try {
  const python = existsSync(join(root, ".venv/bin/python")) ? join(root, ".venv/bin/python") : "python3";
  await run(python, [
    "scripts/run-ocr-pipeline.py",
    "--manifest", manifestPath,
    "--screenshots", screenshots,
    "--work-dir", runDir,
    "--output", output,
    "--workers", String(options.workers),
  ]);

const existingPath = join(root, "data/jobs.json");
const existing = JSON.parse(await readFile(existingPath, "utf8"));
const current = JSON.parse(await readFile(output, "utf8"));
const mergedJobs = mergePipelineJobs(existing, current);
await mkdir(join(root, "data"), { recursive: true });
const directionCounts = {};
for (const job of mergedJobs) {
  for (const direction of Array.isArray(job.directions) ? job.directions : []) {
    directionCounts[direction] = (directionCounts[direction] ?? 0) + 1;
  }
}
await atomicWriteJson(existingPath, {
  metadata: {
    source: "BOSS Chrome Vision OCR",
    pipeline: "ocr_jd",
    job_count: mergedJobs.length,
    updated_at: new Date().toISOString(),
    scoring_algorithm_version: "matching-v2.0.0",
    preference_version: "shanghai-pm-preferences-v1.0.0",
    direction_taxonomy_version: "product-directions-v2.0.0",
    direction_counts: directionCounts,
  },
  jobs: mergedJobs,
});
  await writeProcessingStatus(runDir, "processed", {
    run_id: options.run,
    captured_jobs: JSON.parse(await readFile(manifestPath, "utf8")).jobs?.length ?? 0,
    processed_jobs: current.jobs.length,
    merged_total: mergedJobs.length,
    review_count: JSON.parse(await readFile(join(runDir, "review-queue.json"), "utf8")).jobs?.length ?? 0,
  });
  console.log(`OCR batch processed: ${current.jobs.length} jobs; merged total: ${mergedJobs.length}`);
} catch (error) {
  await writeProcessingStatus(runDir, "failed", { run_id: options.run, error: error instanceof Error ? error.message : String(error) });
  throw error;
}
