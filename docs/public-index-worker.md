# 公开岗位索引后台采集

worker 使用 Codex CLI 的公开网页检索，在本地持续运行并将历史去重后的结果写入 `outputs/boss-index-history.json`。

## 启动

在已完成 `codex login` 的机器上，从项目根目录执行：

```bash
nohup node scripts/run-public-index-worker.mjs \
  --target 1000 \
  --interval-ms 60000 \
  > outputs/worker.log 2>&1 &
echo $! > outputs/worker.pid
```

默认每 1 分钟运行一批，达到目标数量后自动退出。worker 使用 `--ignore-user-config`，避免旧的 `gpt-5` 项目配置干扰 ChatGPT 登录认证。

## 查看与停止

```bash
cat outputs/worker-state.json
tail -f outputs/worker.log
kill "$(cat outputs/worker.pid)"
```

单实例锁为 `outputs/worker.lock`。异常中断后再次启动会复用历史和断点文件；不要并行启动两个 worker。

采集器只使用 Codex 的公开搜索结果，不请求 BOSS 私有接口，不绕过登录、验证码或安全校验。结果保留为 `unverified_index_snapshot`，下游仍需正常登录态复核。
