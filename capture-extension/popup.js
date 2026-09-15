const status = document.querySelector("#status");
document.querySelector("#start").addEventListener("click", async () => {
  status.textContent = "采集中…";
  const response = await chrome.runtime.sendMessage({ type: "start", limit: document.querySelector("#limit").value });
  status.textContent = response.ok ? `完成：${response.run.run_id}` : `失败：${response.error}`;
});
document.querySelector("#stop").addEventListener("click", async () => {
  await chrome.runtime.sendMessage({ type: "stop" });
  status.textContent = "已请求停止";
});
