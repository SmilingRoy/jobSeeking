#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { scoreJobs } from "./lib/job-scoring.mjs";

const path = process.argv[2] ?? "data/jobs.json";
const payload = JSON.parse(await readFile(path, "utf8"));
const jobs = scoreJobs(payload.jobs ?? []);
const recommendationCounts = {};
const scoreCounts = {};
for (const job of jobs) {
  recommendationCounts[job.recommendation] = (recommendationCounts[job.recommendation] ?? 0) + 1;
  const score = job.score == null ? "null" : String(job.score);
  scoreCounts[score] = (scoreCounts[score] ?? 0) + 1;
}
payload.metadata = {
  ...(payload.metadata ?? {}),
  job_count: jobs.length,
  scoring_algorithm_version: "matching-v2.0.0",
  preference_version: "shanghai-pm-preferences-v1.0.0",
  rescored_at: new Date().toISOString(),
  recommendation_counts: recommendationCounts,
  score_counts: scoreCounts,
};
payload.jobs = jobs;
await writeFile(path, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ path, jobs: jobs.length, recommendationCounts, scoreCounts }, null, 2));
