import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { assertValidSiteJobs } from "./lib/site-job-contract.mjs";

const path = process.argv[2]
  ? resolve(process.argv[2])
  : new URL("../data/jobs.json", import.meta.url);
const payload = JSON.parse(await readFile(path, "utf8"));
const jobs = Array.isArray(payload.jobs) ? payload.jobs : [];
try {
  assertValidSiteJobs(jobs);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
console.log(`site jobs valid: ${jobs.length} unique jobs, ${new Set(jobs.map((job) => job.url)).size} concrete BOSS links`);
