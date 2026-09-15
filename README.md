# Job Lens / 职位雷达

面向上海产品经理岗位的 OCR 采集、JD 结构化、岗位匹配和投递决策工作台。

## 在线网站

公开访问地址：[job-lens-radar.smilingroy.chatgpt.site](https://job-lens-radar.smilingroy.chatgpt.site)

项目仓库：[github.com/SmilingRoy/jobSeeking](https://github.com/SmilingRoy/jobSeeking)

网站当前只展示已识别到完整 JD 的岗位。岗位卡片保留标题、公司、薪资、经验、地区、匹配分、推荐结论、岗位职责、任职要求和 BOSS 投递链接。

## 当前主流程

项目以 BOSS 直聘列表页 OCR 采集为主，不把搜索 API 作为主数据来源。

```text
已登录的 BOSS 列表页
  → 点击左侧岗位卡片
  → 等待右侧 JD 面板更新
  → 只滚动右侧 JD 面板并截图
  → Vision OCR
  → 卡片信息与 JD 信息 mapping
  → OCR 清洗和自然语言结构化
  → matching-v2 评分
  → 按岗位 URL 去重合并
  → 写入 data/jobs.json
  → 网站展示
```

采集器不跳转岗位详情页，减少频繁导航触发风控的概率；不读取或上传 Cookie、密码等登录凭据。单个岗位失败不会阻断整批任务。

## 开发环境

- macOS
- Node.js `>=22.13.0`
- pnpm
- Python 3
- 完整 Xcode（`scripts/ocr-vision.swift` 使用 macOS Vision framework）
- Chrome，已登录 BOSS 直聘

安装依赖：

```bash
pnpm install
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install Pillow
```

项目不依赖 Brave Search 才能运行；搜索 API 相关脚本仅作为备用能力保留。

## OCR 采集

目标页面：

```text
https://www.zhipin.com/web/geek/jobs
```

1. 在 Chrome 加载 `capture-extension/` 未打包扩展。
2. 打开已登录的 BOSS 岗位列表页。
3. 启动本地 OCR Bridge：

```bash
pnpm run ocr:capture
```

4. 在扩展弹窗中设置采集数量并开始采集，或者使用本地控制命令：

```bash
pnpm run ocr:start -- --limit 30  # 采集 30 个岗位后停止
pnpm run ocr:start                # 持续采集，直到发送停止命令
pnpm run ocr:stop
pnpm run ocr:status
```

控制命令由扩展定时领取，最多约 30 秒生效。长批量采集支持失败重试、页面去重、断点恢复和阶段性冷却；Chrome 需要保持运行，当前标签页需要保持在 BOSS 岗位列表。

每次采集生成独立批次：

```text
outputs/ocr-runs/<run-id>/
  manifest.json
  screenshots/
  ocr/
  jobs-structured.json
  jobs-scored.json
  review-queue.json
  report.md
```

## OCR 处理与评分

批次完成后运行：

```bash
pnpm run ocr:process -- --run outputs/ocr-runs/<run-id>
```

处理步骤包括：

- 图片规范化和 Vision OCR
- OCR 文本去噪、重复页合并和低质量文本识别
- 从左侧岗位卡片 mapping 标题、公司、薪资、经验、学历、地区和链接
- 从右侧 JD mapping 岗位职责和任职要求
- matching-v2 评分和推荐结论
- 按规范化 BOSS URL 去重
- 生成网站使用的数据和报告

也可以直接处理已有 manifest：

```bash
python3 scripts/ocr-and-score.py \
  --manifest /path/to/manifest.json \
  --ocr-dir /path/to/card-ocr \
  --detail-ocr-dir /path/to/detail-ocr
```

主要输出：

- `data/jobs-structured.json`：结构化原始层
- `data/jobs-scored.json`：评分层
- `data/jobs.json`：网站展示层

Vision OCR 结果包含文本、置信度和归一化坐标；项目仍兼容旧版纯文本 OCR 文件。

## 信息完整性规则

岗位只有在完整 JD 和职责内容满足质量门槛时，才会进入网站岗位池。公司规模、融资阶段、公司质量、团队质量、岗位新鲜度和融资匹配度是辅助分析维度，不会单独触发“信息不足”。

岗位唯一主键是规范化 BOSS 岗位链接。未知字段使用 `unknown`，不会用缺失内容猜测岗位信息。用户查看状态独立保存，不会被新一轮采集覆盖。

统一岗位合同入口：

```text
scripts/lib/site-job-contract.mjs
```

校验网站数据：

```bash
node scripts/validate-site-jobs.mjs data/jobs.json
```

## 网站开发

```bash
pnpm run dev
pnpm run build
pnpm run start
```

网站基于 Vinext、React 和 Cloudflare Workers 兼容运行时构建。Sites 配置位于 `.openai/hosting.json`，当前不使用 D1 或 R2。

## 测试

运行页面和核心数据测试：

```bash
node --test tests/rendered-html.test.mjs tests/job-workbench.test.mjs
```

运行 OCR 采集测试：

```bash
node --test tests/ocr-capture.test.mjs
```

运行 Python OCR 和 matching 测试：

```bash
PYTHONPATH=. python3 tests/test_ocr_pipeline.py
PYTHONPATH=. python3 tests/test_matching_v2.py
```

编译 Vision OCR：

```bash
swiftc scripts/ocr-vision.swift -o /tmp/ocr-vision
```

## 目录说明

```text
app/                    网站页面和工作台逻辑
capture-extension/      Chrome OCR 采集扩展
data/                   当前岗位结构化、评分和网站展示数据
scripts/                OCR、采集、mapping、评分和合并脚本
tests/                  JavaScript 和 Python 测试
outputs/                本地采集批次，默认不纳入 Git
.openai/hosting.json    GPT Sites 托管配置
```

更多变更记录见 [CHANGELOG.md](CHANGELOG.md)。
