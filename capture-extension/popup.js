const status = document.querySelector("#status");
let timer;

function render(value) {
  if (!value) return;
  const count = Number(value.count || 0);
  const target = Number(value.target || 0);
  const targetText = target ? `/${target}` : "（持续到列表结束）";
  status.textContent = `${value.active ? "采集中" : value.phase === "completed" ? "已完成" : "已暂停"} · ${count}${targetText}\n${value.message || ""}`;
}

async function refresh() {
  const value = await chrome.runtime.sendMessage({ type: "status" });
  render(value);
}

document.querySelector("#start").addEventListener("click", async () => {
  const response = await chrome.runtime.sendMessage({ type: "start", limit: document.querySelector("#limit").value });
  status.textContent = response.ok ? "已启动，正在采集…" : `启动失败：${response.error}`;
  await refresh();
});
document.querySelector("#stop").addEventListener("click", async () => {
  await chrome.runtime.sendMessage({ type: "stop" });
  status.textContent = "已请求停止，当前岗位完成后暂停";
  await refresh();
});

refresh();
timer = setInterval(refresh, 2000);
