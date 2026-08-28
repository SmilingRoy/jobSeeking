#!/usr/bin/env node
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { writeJsonAtomic } from "./lib/atomic-json.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const defaults = {
  history: "outputs/boss-index-history.json",
  state: "outputs/worker-state.json",
  lock: "outputs/worker.lock",
  checkpoint: "outputs/checkpoints/public-index.json",
  codexHome: process.env.CODEX_HOME ?? "",
  target: 1000,
  queryLimit: 4,
};

function parseArgs(argv) {
  const options = { ...defaults };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--history") options.history = argv[++i];
    else if (token === "--state") options.state = argv[++i];
    else if (token === "--lock") options.lock = argv[++i];
    else if (token === "--checkpoint") options.checkpoint = argv[++i];
    else if (token === "--codex-home") options.codexHome = argv[++i];
    else if (token === "--target") options.target = Number(argv[++i]);
    else if (token === "--query-limit") options.queryLimit = Number(argv[++i]);
    else throw new Error(`未知参数：${token}`);
  }
  return Object.fromEntries(Object.entries(options).map(([key, value]) => [
    key, typeof value === "string" ? resolve(root, value) : value,
  ]));
}

async function readJson(path, fallback = {}) {
  try { return JSON.parse(await readFile(path, "utf8")); } catch (error) {
    if (error.code === "ENOENT") return fallback;
    throw error;
  }
}

async function acquireLock(path) {
  await mkdir(dirname(path), { recursive: true });
  try {
    await writeFile(path, JSON.stringify({ pid: process.pid, started_at: new Date().toISOString() }), { flag: "wx" });
    return true;
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
    try {
      const current = await readJson(path);
      const age = Date.now() - (await stat(path)).mtimeMs;
      if (age < 10 * 60 * 1000) {
        try { process.kill(Number(current.pid), 0); return false; } catch (probe) {
          if (probe.code === "EPERM") return false;
        }
      }
    } catch { /* stale or malformed lock: replace it */ }
    await rm(path, { force: true });
    await writeFile(path, JSON.stringify({ pid: process.pid, started_at: new Date().toISOString() }), { flag: "wx" });
    return true;
  }
}

function runCollector(options) {
  const args = [
    "scripts/collect-public-index.mjs", "--provider", "codex", "--auto-loop", "--max-rounds", "1",
    "--resume", "--ignore-user-config", "--history", options.history, "--checkpoint", options.checkpoint,
    "--query-limit", String(options.queryLimit),
    ...(options.codexHome ? ["--codex-home", options.codexHome] : []),
  ];
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, args, {
      cwd: root,
      env: { ...process.env, ...(options.codexHome ? { CODEX_HOME: options.codexHome } : {}) },
      stdio: "inherit",
    });
    child.on("error", reject);
    child.on("close", (code) => code === 0 ? resolvePromise() : reject(new Error(`采集退出码 ${code}`)));
  });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const locked = await acquireLock(options.lock);
  if (!locked) { console.log(JSON.stringify({ status: "skipped_locked" })); return; }
  try {
    const beforeDoc = await readJson(options.history, { jobs: [] });
    const before = Array.isArray(beforeDoc.jobs) ? beforeDoc.jobs.length : 0;
    const priorState = await readJson(options.state, {});
    try { await runCollector(options); } catch (error) {
      await writeJsonAtomic(options.state, {
        ...priorState, status: "batch_failed", target: options.target, job_count: before,
        iterations: Number(priorState.iterations ?? 0) + 1, error: error.message, updated_at: new Date().toISOString(),
      });
      throw error;
    }
    const afterDoc = await readJson(options.history, { jobs: [] });
    const after = Array.isArray(afterDoc.jobs) ? afterDoc.jobs.length : 0;
    const metadata = afterDoc.metadata ?? {};
    const accepted = Math.max(0, after - before);
    const noNewStreak = accepted > 0 ? 0 : Number(priorState.no_new_streak ?? 0) + 1;
    const state = {
      ...priorState,
      status: after >= options.target ? "target_reached" : (noNewStreak >= 3 ? "paused_no_new" : "running"),
      target: options.target, job_count: after, iterations: Number(priorState.iterations ?? 0) + 1,
      updated_at: new Date().toISOString(), no_new_streak: noNewStreak,
      last_batch: {
        accepted_new: accepted, duplicates: metadata.duplicate_count ?? 0,
        rejected: metadata.rejection_counts ?? {}, site_import_new: 0,
        raw_result_count: metadata.raw_result_count ?? 0,
        exact_job_links: metadata.current_job_count ?? 0,
        discovery_pages: metadata.current_discovery_page_count ?? 0,
        query_count: metadata.query_count ?? 0, request_count: metadata.request_count ?? 0,
        checked_at: new Date().toISOString(),
        reason: accepted > 0 ? "发现并合并新的稳定岗位 ID" : "本轮没有新的具体 job_detail 链接或结果均已去重",
      },
    };
    await writeJsonAtomic(options.state, state);
    console.log(JSON.stringify({ status: state.status, before, after, accepted, noNewStreak }));
  } finally { await rm(options.lock, { force: true }); }
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
