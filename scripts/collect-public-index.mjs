#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildQueryPlan,
  mergeHistory,
  processSearchBatches
} from "./lib/job-index.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function parseArgs(argv) {
  const options = {
    provider: process.env.BRAVE_SEARCH_API_KEY ? "brave" : "fixture",
    pages: 3,
    count: 20,
    delayMs: 1100,
    queryLimit: 0,
    districtShards: false,
    modes: [],
    terms: [],
    fixture: "fixtures/public-index-sample.json",
    history: "outputs/boss-index-history.json",
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
    else if (token === "--history") options.history = argv[++index];
    else if (token === "--output") options.output = argv[++index];
    else throw new Error(`未知参数：${token}`);
  }
  if (!Number.isInteger(options.pages) || options.pages < 1 || options.pages > 10) throw new Error("--pages 必须是 1 到 10 的整数");
  if (!Number.isInteger(options.count) || options.count < 1 || options.count > 20) throw new Error("--count 必须是 1 到 20 的整数");
  if (!Number.isInteger(options.queryLimit) || options.queryLimit < 0) throw new Error("--query-limit 必须是非负整数");
  if (!Number.isFinite(options.delayMs) || options.delayMs < 0) throw new Error("--delay-ms 必须是非负数");
  if (!["brave", "fixture"].includes(options.provider)) throw new Error("--provider 仅支持 brave 或 fixture");
  return options;
}

function help() {
  return `上海产品经理公开索引采集器

用法：
  node scripts/collect-public-index.mjs --provider brave --pages 3
  node scripts/collect-public-index.mjs --provider fixture

关键参数：
  --pages 1..10       每个检索式翻页数，默认 3
  --count 1..20       每页结果数，默认 20
  --query-limit N     只执行前 N 个检索式，便于分批
  --district-shards   按上海全市及 16 个区拆分检索式
  --modes exact,listing
  --term 交易产品经理  可重复传入
  --delay-ms 1100     请求间隔
  --history PATH      跨轮次合并去重文件
  --output PATH       本轮输出文件

Brave 模式需要环境变量 BRAVE_SEARCH_API_KEY。脚本不直接请求 BOSS，也不处理验证码或安全页。`;
}

function sleep(ms) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function readJsonIfExists(path) {
  try {
    return await readJson(path);
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

async function braveSearch(query, page, options) {
  const key = process.env.BRAVE_SEARCH_API_KEY;
  if (!key) throw new Error("缺少 BRAVE_SEARCH_API_KEY；可先用 --provider fixture 验证流程");
  const url = new URL("https://api.search.brave.com/res/v1/web/search");
  url.searchParams.set("q", query);
  url.searchParams.set("count", String(options.count));
  url.searchParams.set("offset", String(page));
  url.searchParams.set("country", "CN");
  url.searchParams.set("search_lang", "zh-hans");
  url.searchParams.set("extra_snippets", "true");
  url.searchParams.set("result_filter", "web");

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "Accept-Encoding": "gzip",
        "X-Subscription-Token": key
      }
    });
    if (response.ok) {
      const body = await response.json();
      return {
        results: body.web?.results ?? [],
        moreResultsAvailable: body.query?.more_results_available === true
      };
    }
    const detail = (await response.text()).slice(0, 300);
    if ((response.status === 429 || response.status >= 500) && attempt < 2) {
      await sleep(1500 * (attempt + 1));
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
  const batches = [];
  let requestCount = 0;
  for (const item of plan) {
    for (let page = 0; page < options.pages; page += 1) {
      const pageResult = await braveSearch(item.query, page, options);
      requestCount += 1;
      batches.push({ ...item, page, results: pageResult.results });
      if (!pageResult.moreResultsAvailable || pageResult.results.length < options.count) break;
      await sleep(options.delayMs);
    }
  }
  return { batches, requestCount, queryCount: plan.length };
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

function markdownReport(result) {
  const rejectionLines = Object.entries(result.metadata.rejection_counts)
    .map(([reason, count]) => `- ${reason}: ${count}`)
    .join("\n") || "- 无";
  return `# BOSS 公开索引采集报告

- 采集时间：${result.metadata.collected_at}
- 城市约束：上海（只保留索引文本能明确确认上海的结果）
- 数据性质：公开搜索索引候选，尚未验证岗位仍开放
- 本轮检索式：${result.metadata.query_count}
- 本轮请求：${result.metadata.request_count}
- 原始结果：${result.metadata.raw_result_count}
- 具体岗位链接：${result.jobs.length}
- 发现列表页：${result.discovery_pages.length}
- 本轮重复：${result.metadata.duplicate_count}
- 历史累计具体岗位：${result.metadata.history_job_count}

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
  const source = options.provider === "brave"
    ? await collectBrave(config, options)
    : await collectFixture(resolve(root, options.fixture));
  const processed = processSearchBatches(source.batches, {
    provider: options.provider,
    collectedAt
  });
  const historyPath = resolve(root, options.history);
  const previous = await readJsonIfExists(historyPath);
  const historyRecords = mergeHistory(previous, processed);
  const metadata = {
    query: "产品经理及细分方向",
    city: "上海",
    collected_at: collectedAt,
    source: options.provider === "brave" ? "BOSS直聘公开网页索引 via Brave Search API" : "离线公开索引样本",
    verification_status: "unverified_index_snapshot",
    provider: options.provider,
    query_count: source.queryCount,
    request_count: source.requestCount,
    raw_result_count: processed.stats.rawResultCount,
    duplicate_count: processed.stats.duplicateCount,
    rejection_counts: processed.stats.rejectionCounts,
    current_job_count: processed.jobs.length,
    current_discovery_page_count: processed.discovery_pages.length,
    history_job_count: historyRecords.jobs.length,
    history_discovery_page_count: historyRecords.discovery_pages.length,
    note: source.fixtureNote ?? "索引结果不代表岗位仍开放；需使用正常登录态逐条复核。"
  };
  const current = { metadata, jobs: processed.jobs, discovery_pages: processed.discovery_pages };
  const history = { metadata, jobs: historyRecords.jobs, discovery_pages: historyRecords.discovery_pages };
  const stamp = collectedAt.replace(/[:.]/g, "-");
  const outputPath = resolve(root, options.output || `outputs/runs/boss-index-${stamp}.json`);
  const reportPath = resolve(root, "outputs/latest-index-report.md");
  await Promise.all([
    mkdir(dirname(outputPath), { recursive: true }),
    mkdir(dirname(historyPath), { recursive: true }),
    mkdir(dirname(reportPath), { recursive: true })
  ]);
  await Promise.all([
    writeFile(outputPath, `${JSON.stringify(current, null, 2)}\n`),
    writeFile(historyPath, `${JSON.stringify(history, null, 2)}\n`),
    writeFile(reportPath, markdownReport(current))
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
