# Job Lens / 职位雷达

Job Lens 是一个面向上海产品经理求职的证据驱动工作台：把公开索引发现、岗位信息整合、OCR 复核和个人决策状态串成一条可追溯链路。

## 项目目标

用户需要的不是“岗位数量”，而是可以判断、复核和行动的机会。Job Lens 将岗位分成几个阶段：

1. **Public index**：通过公开网络索引发现上海产品经理岗位。
2. **Integration**：按稳定岗位 ID 和规范化 URL 去重，保留每次发现的来源证据。
3. **Workbench**：在浏览器中维护收藏、已查看、待复核等个人决策状态。
4. **OCR / scoring**：对用户提供的岗位卡片或 JD 截图进行 OCR，补全字段后再评分。
5. **Sites**：只有校验和构建成功的数据才进入私有站点部署。

公开索引不是完整 JD，也不是岗位仍在招聘的证明。索引记录统一标记为：

    pipeline = public_index
    verification_status = unverified_index_snapshot
    score = null
    recommendation = 信息不足

未知字段保持 `unknown`，不会用猜测覆盖已知信息；冲突和缺失会进入复核队列。

## 当前状态

代码、脚本、测试和产品文档已上传到 [GitHub](https://github.com/SmilingRoy/jobSeeking)。公开仓库刻意不包含本地岗位数据、采集历史、登录态或 Sites 私有配置。

当前重点待解决问题记录在 [docs/产品视角-核心待解决问题.md](docs/产品视角-核心待解决问题.md)，包括：

- OCR 依赖的浏览器采集入口尚未稳定；
- 公开索引常返回列表页或重复岗位，新增具体详情链接不足；
- 无法可靠确认岗位已关闭、过期或仍开放；
- 公司融资阶段、规模、行业、完整 JD 等字段经常缺失；
- 采集、站点导入和自动化健康状态需要更完整的可观测性。

## 本地安装

要求 Node.js >=22.13.0，推荐使用 pnpm：

    pnpm install
    pnpm dev

常用校验：

    pnpm lint
    pnpm validate:data
    pnpm build

data/ 是本地运行时数据目录。仓库发布快照不包含真实岗位数据；首次运行可使用 fixtures/ 中的合成样例。

## 公开索引采集

### 离线 fixture

    pnpm run collect:index -- --provider fixture
    pnpm run test:collector

### Codex CLI 公共检索

在已经登录 Codex CLI 的本机执行：

    pnpm run collect:index -- \
      --provider codex \
      --auto-loop \
      --max-rounds 1 \
      --history outputs/boss-index-history.json

持续运行单轮闭环时使用：

    node scripts/run-job-lens-round.mjs --query-limit 4

该 runner 负责单实例锁、断点续跑、稳定 ID 去重、历史和 worker-state 的原子更新，以及连续无新增的健康记录。有效的 worker.lock 或 worker.pid 存在时，不会启动第二个进程。

如果 Codex 默认状态目录只读，可把已有登录态复制到可写临时目录，并通过 --codex-home 传入；不要把 auth.json、Cookie 或 Token 写入项目。

### 手动检索信封

也可以把公开检索结果整理为 outputs/inbox/codex-search.json：

    {
      "queries": [{
        "query": "site:zhipin.com/job_detail/ 上海 产品经理",
        "mode": "exact",
        "results": [{
          "title": "产品经理 20-30K",
          "url": "https://www.zhipin.com/job_detail/example.html",
          "description": "上海 产品经理"
        }]
      }]
    }

然后导入：

    pnpm run collect:index -- \
      --provider codex \
      --input outputs/inbox/codex-search.json

列表页只能作为 source_url / evidence_source 的发现证据。只有公开结果中出现稳定岗位 ID 或规范 job_detail URL 时，才允许生成候选记录；不会把卡片序号伪装成岗位 ID，也不会绕过登录、验证码或安全页。

## 数据整合与站点数据

把公开索引历史转换为站点合同：

    node scripts/index-to-site-jobs.mjs
    node scripts/validate-site-jobs.mjs data/jobs.json

转换规则包括：

- 按 job_id、规范 URL、公司 + 标题 + 城市去重；
- 保留全部公开来源和原始摘要；
- 索引岗位不虚构完整 JD，不生成评分；
- OCR 证据只能升级记录，不能把已验证记录降级；
- 校验失败时保留旧的 data/jobs.json。

网站右上角支持导入经过校验的 JSON。导入按稳定岗位 ID 合并，并保留浏览器 localStorage 中的个人决策状态。

## OCR 与评分

OCR 输入可以来自岗位卡片截图、详情截图或文本导入：

    python3 scripts/ocr-and-score.py \
      --manifest /path/to/manifest.json \
      --ocr-dir /path/to/card-ocr \
      --detail-ocr-dir /path/to/detail-ocr

输出层次为：

- data/jobs-structured.json：结构化证据；
- data/jobs-scored.json：按匹配策略生成的评分；
- data/jobs.json：网站使用的统一岗位合同。

只有职责、任职要求等完整证据满足质量门槛时，岗位才可能离开“信息不足”。任何缺失信息都不会被推断为正面或负面结论。

## 自动化与运行安全

后台 worker 每轮都应更新 outputs/worker-state.json，至少包含：

    status, job_count, iterations, updated_at
    accepted_new, duplicates, rejected, site_import_new

连续三轮没有新增时，任务应暂停并记录原因（重复、无稳定 ID、搜索矩阵耗尽或安全验证）。部署失败时站点保留上一版本，site_import_new 记为 0。

请勿提交以下内容：

- API key、PAT、Cookie、OAuth 登录态；
- outputs/、本地数据库、截图和 OCR 原文；
- 真实岗位采集历史或临时预览数据；
- .openai/hosting.json 等 Sites 私有配置。

## 开发命令

    pnpm lint
    pnpm test:collector
    pnpm test:matching
    pnpm validate:data
    pnpm build

渲染测试依赖先完成生产构建。若岗位数据快照发生变化，应更新数据基线或使用独立 fixture，不要把数据变化误判为代码回归。

## 目录结构

    app/       网站和决策工作台
    config/    检索、匹配和评分配置
    fixtures/  OCR、索引和匹配测试样例
    scripts/   采集、整合、校验、OCR 和评分脚本
    tests/     JavaScript 与 Python 测试
    docs/      产品方案、运行手册和问题清单
    data/      本地岗位数据（不随公开代码快照发布）

## 合规边界

Job Lens 只使用公开网络检索和用户明确提供的截图或文本。它不请求 BOSS 私有接口，不绕过登录墙、验证码或安全验证，不模拟真人行为，也不把公开索引摘要包装成已验证的完整职位描述。
