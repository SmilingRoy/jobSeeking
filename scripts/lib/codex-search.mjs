import { spawn } from "node:child_process";
import { canonicalizeBossUrl } from "./job-index.mjs";

const RESULT_SCHEMA = `{"queries":[{"query":"...","mode":"exact","results":[{"title":"...","url":"https://www.zhipin.com/job_detail/<id>.html","company":"...","location":"上海...","salary_range":"...","experience_requirement":"...","education_requirement":"...","industry":"...","company_size":"...","financing_stage":"...","description":"...","responsibility_summary":"...","qualification_summary":"...","product_direction_tags":["..."],"product_form_tags":["..."],"product_layer_tags":["..."],"role_type":"...","team_and_reporting":"...","work_mode":"...","travel_requirement":"...","recruiter_activity":"...","published_or_updated_at":"...","field_evidence":{"field":"原始摘要"},"information_confidence":{"field":"high|medium|low"}}]}]}`;

export function codexPrompt(query, context = {}) {
  const excluded = Array.isArray(context.excludeUrls) && context.excludeUrls.length
    ? `\n不要重复这些已见链接：${context.excludeUrls.slice(-100).join(" ")}`
    : "";
  return [
    "使用 Codex 内置网页检索，检索上海的产品经理岗位；采集阶段不判断岗位相关性，只要城市为上海且标题含产品经理就保留。",
    `检索式：${query}`,
    `这是第 ${context.round ?? 1} 轮；请尽量寻找此前没有返回过的新岗位。${excluded}`,
    "只返回严格 JSON，不要 Markdown、解释或代码围栏。",
    `输出格式必须是：${RESULT_SCHEMA}`,
    "结果只保留公开索引中能确认上海且标题含产品经理的岗位；列表页也可以作为结果，但必须保留原始 URL。尽可能从公开摘要补齐 schema 中的字段；无法确认时使用 unknown，不要推断。每个补充字段尽量在 field_evidence 中保留对应摘要，并给出 information_confidence。",
  ].join("\n");
}

function parseJsonText(text) {
  const trimmed = String(text ?? "").trim();
  const candidates = [trimmed, ...[...trimmed.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)].map((match) => match[1].trim())];
  for (const candidate of candidates) {
    try {
      const value = JSON.parse(candidate);
      if (value && Array.isArray(value.queries ?? value.batches)) return value;
    } catch {
      // Continue with the next possible JSON payload.
    }
  }
  throw new Error("Codex 检索没有返回可解析的 queries JSON");
}

function seenKey(url) {
  return canonicalizeBossUrl(url) ?? String(url);
}

export function parseCodexExecOutput(output) {
  const text = String(output ?? "").trim();
  const direct = (() => {
    try { return JSON.parse(text); } catch { return null; }
  })();
  if (direct && Array.isArray(direct.queries ?? direct.batches)) return direct;

  const messages = [];
  for (const line of text.split(/\r?\n/)) {
    try {
      const event = JSON.parse(line);
      const item = event.item ?? event;
      if (typeof item.text === "string") messages.push(item.text);
      for (const content of item.content ?? []) {
        if (typeof content.text === "string") messages.push(content.text);
      }
    } catch {
      // Non-JSON diagnostics are ignored; the final agent message is parsed below.
    }
  }
  return parseJsonText(messages.at(-1) ?? text);
}

export function runCodexSearch(prompt, options = {}, dependencies = {}) {
  const command = dependencies.command ?? options.codexCommand ?? "codex";
  const args = dependencies.args ?? [
    "--search", "exec",
    ...(options.ignoreUserConfig ? ["--ignore-user-config"] : []),
    "--ephemeral", "--json", prompt,
  ];
  const spawnProcess = dependencies.spawn ?? spawn;
  return new Promise((resolve, reject) => {
    const child = spawnProcess(command, args, {
      cwd: options.cwd,
      env: {
        ...process.env,
        ...(options.codexHome ? { CODEX_HOME: options.codexHome } : {}),
        ...(options.env ?? {}),
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk) => { stdout += chunk; });
    child.stderr?.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`Codex 检索进程失败（${code}）：${stderr.trim().slice(0, 500)}`));
        return;
      }
      try { resolve(parseCodexExecOutput(stdout)); }
      catch (error) { reject(error); }
    });
  });
}

export async function collectCodexLive(config, options, dependencies = {}) {
  const plan = dependencies.plan ?? [];
  const maxRounds = options.maxRounds ?? 10;
  const batches = [];
  const seen = new Set((dependencies.seenUrls ?? []).map(seenKey));
  let requestCount = 0;
  let emptyRounds = 0;

  for (let round = 1; round <= maxRounds; round += 1) {
    let newCount = 0;
    for (const item of plan) {
      const prompt = codexPrompt(item.query, { round, excludeUrls: [...seen] });
      const document = await (dependencies.search ?? runCodexSearch)(prompt, options, dependencies);
      requestCount += 1;
      const sourceBatches = document.queries ?? document.batches ?? [];
      for (const batch of sourceBatches) {
        const results = Array.isArray(batch.results) ? batch.results : [];
        batches.push({ ...item, ...batch, query: batch.query ?? item.query, mode: batch.mode ?? item.mode, round });
        for (const result of results) {
          const url = result?.url;
          const key = typeof url === "string" ? seenKey(url) : null;
          if (key && !seen.has(key)) {
            seen.add(key);
            newCount += 1;
          }
        }
      }
    }
    if (newCount === 0) emptyRounds += 1;
    else emptyRounds = 0;
    if (emptyRounds >= 1) break;
  }
  return {
    batches,
    requestCount,
    queryCount: plan.length * Math.max(1, Math.min(maxRounds, batches.length ? Math.ceil(batches.length / plan.length) : 1)),
    rounds: batches.length ? Math.max(...batches.map((batch) => batch.round ?? 1)) : 0,
    fixtureNote: "Codex 内置网页检索自动调用结果；公开索引候选仍需正常登录态复核。",
  };
}
