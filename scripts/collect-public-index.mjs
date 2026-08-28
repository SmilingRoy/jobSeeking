#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildQueryPlan,
  mergeHistory,
  processSearchBatches,
  summarizeQueryMetrics,
} from "./lib/job-index.mjs";
import { readJsonIfExists, writeJsonAtomic, writeTextAtomic } from "./lib/atomic-json.mjs";
import { collectPlan } from "./lib/resumable-collector.mjs";
import { collectCodexLive } from "./lib/codex-search.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export function parseArgs(argv) {
  const options = {
    provider: "codex",
    pages: 3,
    count: 20,
    delayMs: 1100,
    queryLimit: 0,
    districtShards: false,
    modes: [],
    terms: [],
    fixture: "fixtures/public-index-sample.json",
    input: "outputs/inbox/codex-search.json",
    history: "outputs/boss-index-history.json",
    checkpoint: "outputs/checkpoints/public-index.json",
    resume: false,
    maxAttempts: 3,
    autoLoop: false,
    maxRounds: 10,
    codexCommand: "codex",
    codexHome: "",
    ignoreUserConfig: false,
    output: ""
  };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--help" || token === "-h") options.help = true;
    else if (token === "--provider") options.provider = argv[++index];
    else if (token === "--pages") options.pages = Number(argv[++index]);
    else if (token === "--count") options.count = Number(argv[++index]);
    else if (token === "--delay-ms") options.delayMs = Number(argv[++index]);
    else if (token === "--query-limit") options.queryLimit = Number(argv[++index]);
    else if (token === "--district-shards") options.districtShards = true;
    else if (token === "--modes") options.modes = argv[++index].split(",").filter(Boolean);
    else if (token === "--term") options.terms.push(argv[++index]);
    else if (token === "--fixture") options.fixture = argv[++index];
    else if (token === "--input") options.input = argv[++index];
    else if (token === "--history") options.history = argv[++index];
    else if (token === "--checkpoint") options.checkpoint = argv[++index];
    else if (token === "--resume") options.resume = true;
    else if (token === "--max-attempts") options.maxAttempts = Number(argv[++index]);
    else if (token === "--auto-loop") options.autoLoop = true;
    else if (token === "--max-rounds") options.maxRounds = Number(argv[++index]);
    else if (token === "--codex-command") options.codexCommand = argv[++index];
    else if (token === "--codex-home") options.codexHome = argv[++index];
    else if (token === "--ignore-user-config") options.ignoreUserConfig = true;
    else if (token === "--output") options.output = argv[++index];
    else throw new Error(`未知参数：${token}`);
  }
  if (!Number.isInteger(options.pages) || options.pages < 1 || options.pages > 10) throw new Error("--pages 必须是 1 到 10 的整数");
  if (!Number.isInteger(options.count) || options.count < 1 || options.count > 20) throw new Error("--count 必须是 1 到 20 的整数");
  if (!Number.isInteger(options.queryLimit) || options.queryLimit < 0) throw new Error("--query-limit 必须是非负整数");
  if (!Number.isFinite(options.delayMs) || options.delayMs < 0) throw new Error("--delay-ms 必须是非负数");
  if (!Number.isInteger(options.maxAttempts) || options.maxAttempts < 1 || options.maxAttempts > 5) throw new Error("--max-attempts 必须是 1 到 5 的整数");
  if (!Number.isInteger(options.maxRounds) || options.maxRounds < 1 || options.maxRounds > 50) throw new Error("--max-rounds 必须是 1 到 50 的整数");
  if (!["codex", "brave", "fixture"].includes(options.provider)) throw new Error("--provider 仅支持 codex、brave 或 fixture");
  return options;
}

function help() {
  return `上海产品经理公开索引采集器

用法：
  node scripts/collect-public-index.mjs --provider codex --input outputs/inbox/codex-search.json
  node scripts/collect-public-index.mjs --provider brave --pages 3
  node scripts/collect-public-index.mjs --provider fixture

关键参数：
  --pages 1..10       每个检索式翻页数，默认 3
  --count 1..20       每页结果数，默认 20
  --query-limit N     只执行前 N 个检索式，便于分批
  --district-shards   按上海全市及 16 个区拆分检索式
  --modes exact,listing
  --term 交易产品经理  可重复传入
  --input PATH[,PATH]   一个或多个 Codex 检索结果信封 JSON，跨输入去重
  --delay-ms 1100     请求间隔
  --max-attempts 3    限流或服务错误的最大尝试次数
  --auto-loop         Codex provider 在 Node 进程内自动调用并循环到无新增岗位
  --max-rounds N      自动循环最多轮数，默认 10
  --codex-command CMD Codex CLI 可执行文件，默认 codex
  --codex-home PATH  Codex CLI 运行目录；用于将状态数据库放到可写目录（需该目录已有登录态）
  --ignore-user-config 运行 Codex CLI 时忽略旧的用户/项目配置，使用 ChatGPT 登录的默认 Codex 模型
  --checkpoint PATH   逐页断点文件
  --resume            从同配置的未完成断点继续
  --history PATH      跨轮次合并去重文件
  --output PATH       本轮输出文件

Codex 默认从 --input 读取检索信封；使用 --auto-loop 时由 Node 进程调用 Codex CLI 的 --search exec，并按轮次去重直到无新增岗位。
Brave 模式需要环境变量 BRAVE_SEARCH_API_KEY，作为可选备用路径。脚本不直接请求 BOSS，也不处理验证码或安全页。`;
}

function sleep(ms) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

export async function braveSearch(query, page, options, dependencies = {}) {
  const key = dependencies.apiKey ?? process.env.BRAVE_SEARCH_API_KEY;
  const fetchPage = dependencies.fetch ?? fetch;
  const wait = dependencies.sleep ?? sleep;
  if (!key) throw new Error("缺少 BRAVE_SEARCH_API_KEY；可先用 --provider fixture 验证流程");
  const url = new URL("https://api.search.brave.com/res/v1/web/search");
  url.searchParams.set("q", query);
  url.searchParams.set("count", String(options.count));
  url.searchParams.set("offset", String(page));
  url.searchParams.set("country", "CN");
  url.searchParams.set("search_lang", "zh-hans");
  url.searchParams.set("extra_snippets", "true");
  url.searchParams.set("result_filter", "web");

  for (let attempt = 0; attempt < options.maxAttempts; attempt += 1) {
    let response;
    try {
      response = await fetchPage(url, {
        headers: {
          Accept: "application/json",
          "Accept-Encoding": "gzip",
          "X-Subscription-Token": key
        }
      });
    } catch (error) {
      if (attempt < options.maxAttempts - 1) {
        await wait(1500 * (attempt + 1));
        continue;
      }
      throw new Error(`Brave API 网络请求失败，已尝试 ${options.maxAttempts} 次：${error.message}`);
    }
    if (response.ok) {
      const body = await response.json();
      return {
        results: body.web?.results ?? [],
        moreResultsAvailable: body.query?.more_results_available === true
      };
    }
    const detail = (await response.text()).slice(0, 300);
    if ((response.status === 429 || response.status >= 500) && attempt < options.maxAttempts - 1) {
      await wait(1500 * (attempt + 1));
      continue;
    }
    if ([401, 403, 429].includes(response.status)) {
      throw new Error(`Brave API 已停止：HTTP ${response.status}。请检查密钥、额度或限流。${detail ? ` ${detail}` : ""}`);
    }
    throw new Error(`Brave API 请求失败：HTTP ${response.status} ${detail}`);
  }
  return { results: [], moreResultsAvailable: false };
}

async function collectBrave(config, options) {
  const plan = buildQueryPlan(config, options);
  const collected = await collectPlan(plan, {
    provider: options.provider,
    pages: options.pages,
    count: options.count,
    delayMs: options.delayMs,
    checkpointPath: resolve(root, options.checkpoint),
    resume: options.resume,
    searchPage: (query, page) => braveSearch(query, page, options),
    sleep,
    now: Date.now,
  });
  return { ...collected, queryCount: plan.length };
}

async function collectFixture(path) {
  const fixture = await readJson(path);
  return {
    batches: fixture.queries ?? [],
    requestCount: 0,
    queryCount: fixture.queries?.length ?? 0,
    fixtureNote: fixture.note
  };
}

export async function collectCodex(paths) {
  const inputPaths = Array.isArray(paths) ? paths : String(paths).split(",").filter(Boolean);
  const documents = await Promise.all(inputPaths.map((path) => readJson(path)));
  const batches = documents.flatMap((document) => document.queries ?? document.batches ?? []);
  if (!batches.length || !batches.every((batch) => Array.isArray(batch.results))) {
    throw new Error("Codex 检索输入必须包含 queries 或 batches 数组");
  }
  return {
    batches,
    requestCount: documents.reduce((total, document) => total + (document.request_count ?? 0), 0),
    queryCount: documents.reduce((total, document) => total + (document.query_count ?? document.queries?.length ?? document.batches?.length ?? 0), 0),
    fixtureNote: documents.map((document) => document.note).filter(Boolean).join("；") || "Codex 内置网页检索结果；岗位状态、完整 JD 和公司信息仍需正常登录态复核。"
  };
}

function markdownReport(result) {
  const rejectionLines = Object.entries(result.metadata.rejection_counts)
    .map(([reason, count]) => `- ${reason}: ${count}`)
    .join("\n") || "- 无";
  const queryLines = result.metadata.query_metrics
    .map((item) => `| ${item.mode} | ${item.query.replaceAll("|", "\\|")} | ${item.pages} | ${item.raw_results} | ${item.exact_job_links} | ${item.duplicates} | ${(item.marginal_yield * 100).toFixed(1)}% |`)
    .join("\n") || "| - | 无 | 0 | 0 | 0 | 0 | 0.0% |";
  return `# BOSS 公开索引采集报告

- 采集时间：${result.metadata.collected_at}
- 城市约束：上海（只保留索引文本能明确确认上海的结果）
- 数据性质：公开搜索索引候选，尚未验证岗位仍开放
- 本轮检索式：${result.metadata.query_count}
- 本轮请求：${result.metadata.request_count}
- 断点复用页：${result.metadata.resumed_batch_count}
- 原始结果：${result.metadata.raw_result_count}
- 具体岗位链接：${result.jobs.length}
- 发现列表页：${result.discovery_pages.length}
- 本轮重复：${result.metadata.duplicate_count}
- 历史累计具体岗位：${result.metadata.history_job_count}
- 本轮历史新增：${result.metadata.new_history_job_count}

## 检索式产出

| 模式 | 检索式 | 页数 | 原始结果 | 唯一详情链接 | 重复 | 详情链接产出率 |
|---|---|---:|---:|---:|---:|---:|
${queryLines}

## 拒绝原因

${rejectionLines}

## 使用边界

采集器不会直接批量请求 BOSS 页面，不会绕过登录、安全页或验证码。具体岗位需在正常登录态下逐步复核，复核后才能标为“已验证”。
`;
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (options.help) {
    console.log(help());
    return;
  }
  const config = await readJson(resolve(root, "config/job-queries.json"));
  const collectedAt = new Date().toISOString();
  const historyPath = resolve(root, options.history);
  const previous = await readJsonIfExists(historyPath);
  const source = options.provider === "brave"
    ? await collectBrave(config, options)
    : options.provider === "codex"
      ? options.autoLoop
        ? await collectCodexLive(config, options, {
          plan: buildQueryPlan(config, options),
          seenUrls: (previous?.jobs ?? []).map((job) => job.job_url).filter(Boolean),
        })
        : await collectCodex(options.input.split(",").map((path) => resolve(root, path)))
      : await collectFixture(resolve(root, options.fixture));
  const processed = processSearchBatches(source.batches, {
    provider: options.provider,
    collectedAt
  });
  const historyRecords = mergeHistory(previous, processed);
  const previousKeys = new Set((previous?.jobs ?? []).map((job) => job.job_id || job.job_url));
  const newHistoryJobCount = processed.jobs.filter((job) => !previousKeys.has(job.job_id || job.job_url)).length;
  const queryMetrics = summarizeQueryMetrics(source.batches, {
    provider: options.provider,
    collectedAt,
  });
  const metadata = {
    query: "产品经理及细分方向",
    city: "上海",
    collected_at: collectedAt,
    source: options.provider === "brave"
      ? "BOSS直聘公开网页索引 via Brave Search API"
      : options.provider === "codex"
        ? "Codex 内置网页检索结果"
        : "离线公开索引样本",
    verification_status: "unverified_index_snapshot",
    provider: options.provider,
    query_count: source.queryCount,
    request_count: source.requestCount,
    resumed_batch_count: source.resumedBatchCount ?? 0,
    raw_result_count: processed.stats.rawResultCount,
    duplicate_count: processed.stats.duplicateCount,
    rejection_counts: processed.stats.rejectionCounts,
    current_job_count: processed.jobs.length,
    current_discovery_page_count: processed.discovery_pages.length,
    history_job_count: historyRecords.jobs.length,
    new_history_job_count: newHistoryJobCount,
    history_discovery_page_count: historyRecords.discovery_pages.length,
    query_metrics: queryMetrics,
    note: source.fixtureNote ?? "索引结果不代表岗位仍开放；需使用正常登录态逐条复核。"
  };
  const current = { metadata, jobs: processed.jobs, discovery_pages: processed.discovery_pages };
  const history = { metadata, jobs: historyRecords.jobs, discovery_pages: historyRecords.discovery_pages };
  const stamp = collectedAt.replace(/[:.]/g, "-");
  const outputPath = resolve(root, options.output || `outputs/runs/boss-index-${stamp}.json`);
  const reportPath = resolve(root, "outputs/latest-index-report.md");
  await Promise.all([
    writeJsonAtomic(outputPath, current),
    writeJsonAtomic(historyPath, history),
    writeTextAtomic(reportPath, markdownReport(current))
  ]);
  console.log(JSON.stringify({
    provider: options.provider,
    output: outputPath,
    history: historyPath,
    report: reportPath,
    raw_results: metadata.raw_result_count,
    exact_job_links: metadata.current_job_count,
    discovery_pages: metadata.current_discovery_page_count,
    historical_exact_jobs: metadata.history_job_count,
    new_historical_exact_jobs: metadata.new_history_job_count,
    rejected: metadata.rejection_counts
  }, null, 2));
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
