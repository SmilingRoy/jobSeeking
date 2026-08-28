#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { writeJsonAtomic } from "./lib/atomic-json.mjs";
import { mergePipelineJobs } from "./lib/merge-pipeline-jobs.mjs";
import { assertValidSiteJobs } from "./lib/site-job-contract.mjs";

function parseArgs(argv) {
  const options = { index: "", ocr: "", output: "data/jobs.json" };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--index") options.index = argv[++index];
    else if (token === "--ocr") options.ocr = argv[++index];
    else if (token === "--output") options.output = argv[++index];
    else throw new Error(`未知参数：${token}`);
  }
  if (!options.index || !options.ocr) throw new Error("必须同时提供 --index 和 --ocr");
  return options;
}

async function readJson(path) {
  return JSON.parse(await readFile(resolve(path), "utf8"));
}

export async function mergeAndWrite(options) {
  const jobs = mergePipelineJobs(await readJson(options.index), await readJson(options.ocr));
  assertValidSiteJobs(jobs);
  const payload = {
    metadata: {
      source: "public_index + ocr_jd",
      contract_version: "job-pipeline-v1",
      job_count: jobs.length,
      note: "同一规范化 BOSS URL 以完整 OCR JD 为最高证据，异常记录进入复核。",
    },
    jobs,
  };
  await writeJsonAtomic(resolve(options.output), payload);
  return payload;
}

export async function main(argv = process.argv.slice(2)) {
  const payload = await mergeAndWrite(parseArgs(argv));
  console.log(`merged site jobs written: ${payload.jobs.length}`);
}

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
