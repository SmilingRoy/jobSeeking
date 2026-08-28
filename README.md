# Job Lens / 职位雷达

上海产品经理岗位筛选工作台，以及一套可分批运行、跨轮次去重的公开索引采集器。

## 批量发现岗位

采集分成两层：

1. 由 Codex 内置网页检索发现被公开索引的 BOSS 具体岗位链接和招聘列表页，并导入检索结果信封。
2. 只把索引文本明确包含“上海”和“产品经理”的具体链接写入候选池；岗位状态、完整 JD 和公司信息保持 `unknown`，等待正常登录态复核。

采集器不会直接批量请求 BOSS，不会绕过登录、安全页或验证码，也不会使用 Cookie 外传、代理池或模拟真人行为。Brave Search API 保留为显式备用 provider。

### Codex 检索导入

Codex 网页检索不是 Node 进程内可直接调用的项目 API。先由 Codex 检索，再将结果整理为以下信封格式保存到 `outputs/inbox/codex-search.json`：

```json
{
  "note": "Codex 内置网页检索结果；尚未验证岗位仍开放",
  "queries": [
    {
      "query": "site:zhipin.com/job_detail/ 上海 产品经理",
      "mode": "exact",
      "results": [
        {
          "title": "产品经理 20-30K",
          "url": "https://www.zhipin.com/job_detail/example.html",
          "description": "上海 产品经理"
        }
      ]
    }
  ]
}
```

然后运行：

```bash
pnpm run collect:index -- --provider codex --input outputs/inbox/codex-search.json
```

### Node 内自动调用 Codex 并循环检索

本机已登录 Codex CLI 时，可以让 Node 进程直接启动 `codex --search exec`，由 Codex 返回机器可读的检索信封。每轮会把已见的详情链接放入下一轮提示，整轮没有新增岗位时停止：

```bash
pnpm run collect:index -- \
  --provider codex \
  --auto-loop \
  --max-rounds 10 \
  --history outputs/boss-index-history.json
```

`--auto-loop` 需要本机 Codex CLI 可执行、已完成登录且允许写入 Codex 状态目录；可用 `--codex-command` 指定 CLI 路径。若 CLI 不可用，继续使用上面的 `--input` 信封模式。自动循环最多运行 `--max-rounds` 轮，并在一轮没有新 `job_detail` 链接时结束；结果仍经过上海、产品经理、具体详情链接和历史去重校验。

采集阶段只做范围校验：公开证据能确认上海、标题包含“产品经理”即可进入候选，不在采集阶段按用户偏好筛掉增长、AI、电商、内容、推荐、商业化或其他方向。Codex 会尽可能返回公司、薪资、经验、学历、行业、规模、融资、职责、任职要求、产品形态/层级、角色、团队、工作方式、招聘活跃度等字段；不能确认的字段填 `unknown`，并可在 `field_evidence` 和 `information_confidence` 中保留来源与置信度。方向筛选和评分留给下游。

默认查询矩阵包含泛岗位、C 端、用户体验、内容、搜索、推荐、商业化、会员、海外、平台、增长、交易、履约、本地生活、LBS、出行、策略、AI 和电商等关键词，并可结合 `--district-shards` 扩展到上海各区。历史合并遵循已知字段不被后续 `unknown` 覆盖的单调证据规则。

Codex 检索结果仍然是公开索引候选；列表页只能作为 discovery evidence，不能代替具体 `job_detail` 链接或完整 JD。

### 先离线试跑

```bash
pnpm run collect:index -- --provider fixture
pnpm run test:collector
```

### Brave 备用批量采集

在本机终端临时设置 Brave Search API 密钥后运行：

```bash
export BRAVE_SEARCH_API_KEY="你的密钥"
pnpm run collect:index -- --provider brave --pages 3
```

默认配置包含 16 个产品方向和两类检索式，共 32 个检索式。每个检索式默认抓 3 页、每页最多 20 条，单轮最多发现 1,920 条原始索引结果；会按 BOSS 岗位 ID 和规范化 URL 去重。Brave 单个检索式最多支持 10 页，可用 `--pages 10` 扩大到单轮最多 6,400 条原始索引结果。

需要更大规模时，可开启上海全市 + 16 个行政区分片。建议同时用 `--modes exact`，只寻找具体岗位页：默认 3 页时理论上限 16,320 条原始索引结果，10 页时为 54,400 条；实际数量通常更少，并会有大量跨关键词、跨行政区重复，历史文件会自动合并。

适合分批、重复运行的参数：

```bash
# 只跑前 8 个检索式
pnpm run collect:index -- --provider brave --pages 5 --query-limit 8

# 只找具体岗位页，不收列表页
pnpm run collect:index -- --provider brave --pages 5 --modes exact

# 单独扩充一个方向
pnpm run collect:index -- --provider brave --pages 10 --modes exact --term 交易产品经理

# 大批量：按上海 16 个行政区分片；先用 query-limit 控制首批成本
pnpm run collect:index -- --provider brave --pages 3 --modes exact --district-shards --query-limit 40
```

结果写到 `outputs/runs/`，跨轮累计结果写到 `outputs/boss-index-history.json`，最新摘要写到 `outputs/latest-index-report.md`。`outputs/` 默认不进入 Git，避免把个人求职数据发布到网站代码中。

网站右上角的“导入采集结果”可以直接选择本轮 JSON 或历史合并 JSON。导入时只接受索引证据明确为上海、标题包含产品经理且 URL 为具体 `job_detail` 的记录，并按规范化链接合并。所有公开索引记录默认显示“待验证”；列表每次最多渲染 80 条，可继续分批加载。

## 网站开发

### 截图 OCR 与岗位评估

原位采集器保存岗位卡片和右侧详情截图后，先在 macOS 原生环境运行 Vision OCR，
再把 OCR 文本归一化为岗位 schema，最后调用既定评分配置生成推荐结论：

```bash
python3 scripts/ocr-and-score.py \\
  --manifest /path/to/manifest.json \\
  --ocr-dir /path/to/card-ocr \\
  --detail-ocr-dir /path/to/detail-ocr
```

输出 `data/jobs-structured.json`（schema 原始层）、`data/jobs-scored.json`（评分层）
和网站使用的 `data/jobs.json`。只有完整 JD 和职责字段满足质量门槛的岗位，才会进入
“推荐投递/可以考虑”；其余统一保留为“信息不足”，不根据缺失内容猜测。

### 统一岗位合同

`scripts/lib/site-job-contract.mjs` 是 public-index、OCR 和网站数据的唯一合同入口。
转换和合并会统一薪资、经验、学历、区域、公司信息、职责/要求、标签、证据与评分字段；
未知值使用 `unknown`，证据始终是对象数组。公开索引记录固定为
`pipeline: public_index` + `verification_status: unverified_index_snapshot`，其
`score` 与 `match_score` 必须为 `null`。完整 OCR JD 才能升级为 `captured_jd`，
冲突或不完整记录进入 `needs_review`。

合并后的数据可以用以下命令校验：

```bash
node scripts/validate-site-jobs.mjs data/jobs.json
```

A clean full-stack starter running on
[vinext](https://github.com/cloudflare/vinext), with optional Cloudflare D1 and
Drizzle support.

## Prerequisites

- Node.js `>=22.13.0`

## Quick Start

```bash
npm install
npm run dev
npm run build
```

This starter does not use `wrangler.jsonc`.

## Included Shape

- edit site code under `app/`
- `.openai/hosting.json` declares optional Sites D1 and R2 bindings
- `vite.config.ts` simulates declared bindings for local development
- `db/schema.ts` starts intentionally empty
- `examples/d1/` contains an optional D1 example surface
- `drizzle.config.ts` supports local migration generation when needed

## Workspace Auth Headers

OpenAI workspace sites can read the current user's email from
`oai-authenticated-user-email`.

SIWC-authenticated workspace sites may also receive
`oai-authenticated-user-full-name` when the user's SIWC profile has a non-empty
`name` claim. The full-name value is percent-encoded UTF-8 and is accompanied by
`oai-authenticated-user-full-name-encoding: percent-encoded-utf-8`.

Treat the full name as optional and fall back to email when it is absent:

```tsx
import { headers } from "next/headers";

export default async function Home() {
  const requestHeaders = await headers();
  const email = requestHeaders.get("oai-authenticated-user-email");
  const encodedFullName = requestHeaders.get("oai-authenticated-user-full-name");
  const fullName =
    encodedFullName &&
    requestHeaders.get("oai-authenticated-user-full-name-encoding") ===
      "percent-encoded-utf-8"
      ? decodeURIComponent(encodedFullName)
      : null;

  const displayName = fullName ?? email;
  // ...
}
```

## Optional Dispatch-Owned ChatGPT Sign-In

Import the ready-to-use helpers from `app/chatgpt-auth.ts` when the site needs
optional or required ChatGPT sign-in:

- Use `getChatGPTUser()` for optional signed-in UI.
- Use `requireChatGPTUser(returnTo)` for server-rendered pages that should send
  anonymous visitors through Sign in with ChatGPT.
- Use `chatGPTSignInPath(returnTo)` and `chatGPTSignOutPath(returnTo)` for
  browser links or actions.
- Pass a same-origin relative `returnTo` path for the destination after sign-in
  or sign-out. The helper validates and safely encodes it.
- Mark protected pages with `export const dynamic = "force-dynamic"` because
  they depend on per-request identity headers.

Dispatch owns `/signin-with-chatgpt`, `/signout-with-chatgpt`, `/callback`, the
OAuth cookies, and identity header injection. Do not implement app routes for
those reserved paths. Routes that do not import and call the helper remain
anonymous-compatible.

SIWC establishes identity only; it does not prove workspace membership. Use the
Sites hosting platform's access policy controls for workspace-wide restrictions,
or enforce explicit server-side membership or allowlist checks.

Use SIWC for account pages, user-specific dashboards, saved records, and write
actions tied to the current ChatGPT user. Leave public content anonymous.

## Useful Commands

- `npm run dev`: start local development
- `npm run build`: verify the vinext build output
- `npm test`: build the starter and verify its rendered loading skeleton
- `npm run db:generate`: generate Drizzle migrations after schema changes

## Learn More

- [vinext Documentation](https://github.com/cloudflare/vinext)
- [Drizzle D1 Guide](https://orm.drizzle.team/docs/get-started/d1-new)
