#!/usr/bin/env node

import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export function parseWorkerArgs(argv = process.argv.slice(2)) {
  const options = {
    target: 1000,
    intervalMs: 60 * 1000,
    maxRounds: 1,
    once: false,
    provider: "codex",
    history: "outputs/boss-index-history.json",
    checkpoint: "outputs/checkpoints/public-index.json",
    state: "outputs/worker-state.json",
    lock: "outputs/worker.lock",
    log: "outputs/worker.log",
    codexCommand: "codex",
    codexHome: "",
  };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--target") options.target = Number(argv[++i]);
    else if (token === "--interval-ms") options.intervalMs = Number(argv[++i]);
    else if (token === "--max-rounds") options.maxRounds = Number(argv[++i]);
    else if (token === "--once") options.once = true;
    else if (token === "--provider") options.provider = argv[++i];
    else if (token === "--history") options.history = argv[++i];
    else if (token === "--checkpoint") options.checkpoint = argv[++i];
    else if (token === "--state") options.state = argv[++i];
    else if (token === "--lock") options.lock = argv[++i];
    else if (token === "--log") options.log = argv[++i];
    else if (token === "--codex-command") options.codexCommand = argv[++i];
    else if (token === "--codex-home") options.codexHome = argv[++i];
    else if (token === "--help" || token === "-h") options.help = true;
    else throw new Error(`未知参数：${token}`);
  }
  if (!Number.isInteger(options.target) || options.target < 1) throw new Error("--target 必须是正整数");
  if (!Number.isFinite(options.intervalMs) || options.intervalMs < 60_000) throw new Error("--interval-ms 不得小于 60000，避免过密请求");
  if (!Number.isInteger(options.maxRounds) || options.maxRounds < 1 || options.maxRounds > 10) throw new Error("--max-rounds 必须是 1 到 10 的整数");
  if (options.provider !== "codex") throw new Error("后台 worker 当前只允许使用 codex 公共检索");
  return options;
}

function sleep(ms) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

async function jobCount(historyPath) {
  try {
    const document = JSON.parse(await readFile(historyPath, "utf8"));
    return Array.isArray(document.jobs) ? document.jobs.length : 0;
  } catch (error) {
    if (error.code === "ENOENT") return 0;
    throw error;
  }
}

async function writeState(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function processIsAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === "EPERM";
  }
}

async function acquireLock(lockPath) {
  try {
    await writeFile(lockPath, JSON.stringify({ pid: process.pid, started_at: new Date().toISOString() }), { flag: "wx" });
    return;
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
    try {
      const existing = JSON.parse(await readFile(lockPath, "utf8"));
      const lockAgeMs = Date.now() - (await stat(lockPath)).mtimeMs;
      const stale = lockAgeMs > 10 * 60 * 1000;
      if (!stale && (existing.pid === process.pid || processIsAlive(existing.pid))) {
        throw new Error(`已有 worker 在运行：${lockPath}`);
      }
    } catch (readError) {
      if (readError.message.startsWith("已有 worker")) throw readError;
    }
    await rm(lockPath, { force: true });
    await writeFile(lockPath, JSON.stringify({ pid: process.pid, started_at: new Date().toISOString() }), { flag: "wx" });
  }
}

function runBatch(options) {
  const args = [
    "scripts/collect-public-index.mjs",
    "--provider", options.provider,
    "--auto-loop",
    "--max-rounds", String(options.maxRounds),
    "--ignore-user-config",
    ...(options.codexHome ? ["--codex-home", options.codexHome] : []),
    "--resume",
    "--history", options.history,
    "--checkpoint", options.checkpoint,
  ];
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, args, {
      cwd: root,
      env: { ...process.env, CODEX_WORKER: "1" },
      stdio: "inherit",
    });
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error("采集批次超时（120000ms）"));
    }, 120_000);
    child.on("error", reject);
    child.on("close", (code, signal) => {
      clearTimeout(timeout);
      if (code === 0) resolvePromise({ code, signal });
      else reject(new Error(`采集批次失败：exit=${code ?? "unknown"}, signal=${signal ?? "none"}`));
    });
  });
}

function help() {
  return `后台岗位采集 worker\n\n用法：\n  pnpm run collect:index:worker -- --target 1000\n  pnpm run collect:index:worker -- --target 1000 --interval-ms 60000\n  pnpm run collect:index:worker -- --once\n\n说明：使用 Codex 内置公开检索，默认每 1 分钟执行一批，达到历史去重后的目标岗位数后退出。\n不会请求 BOSS 私有接口，不会处理验证码或安全页。`;
}

export async function runWorker(options) {
  const absolute = Object.fromEntries(Object.entries(options).map(([key, value]) => (
    [key, typeof value === "string" && ["history", "checkpoint", "state", "lock", "log"].includes(key) ? resolve(root, value) : value]
  )));
  let locked = false;
  try {
    await mkdir(dirname(absolute.lock), { recursive: true });
    await acquireLock(absolute.lock);
    locked = true;
  } catch (error) {
    throw error;
  }

  const startedAt = new Date().toISOString();
  let iterations = 0;
  let lastError = null;
  const cleanup = async () => {
    if (locked) await rm(absolute.lock, { force: true });
  };
  try {
    while (true) {
      const before = await jobCount(absolute.history);
      if (before >= absolute.target) {
        await writeState(absolute.state, { status: "target_reached", target: absolute.target, job_count: before, iterations, started_at: startedAt, finished_at: new Date().toISOString() });
        return { status: "target_reached", jobCount: before, iterations };
      }
      iterations += 1;
      await writeState(absolute.state, { status: "running", target: absolute.target, job_count: before, iterations, started_at: startedAt, updated_at: new Date().toISOString() });
      try {
        await runBatch(absolute);
        lastError = null;
      } catch (error) {
        lastError = error.message;
        await writeState(absolute.state, { status: "batch_failed", target: absolute.target, job_count: await jobCount(absolute.history), iterations, error: lastError, updated_at: new Date().toISOString() });
        if (absolute.once) throw error;
      }
      const after = await jobCount(absolute.history);
      if (absolute.once || after >= absolute.target) {
        const status = after >= absolute.target ? "target_reached" : (lastError ? "failed" : "one_batch_complete");
        await writeState(absolute.state, { status, target: absolute.target, job_count: after, iterations, error: lastError, started_at: startedAt, finished_at: new Date().toISOString() });
        return { status, jobCount: after, iterations };
      }
      await sleep(absolute.intervalMs);
    }
  } finally {
    await cleanup();
  }
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  const options = parseWorkerArgs();
  if (options.help) console.log(help());
  else runWorker(options).then((result) => console.log(JSON.stringify(result, null, 2))).catch((error) => { console.error(error.message); process.exitCode = 1; });
}
