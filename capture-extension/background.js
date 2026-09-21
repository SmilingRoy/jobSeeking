const BRIDGE = "http://127.0.0.1:4318";
let running = false;
let activeRunId = null;
const COOL_DOWN_EVERY = 40;
const CHECKPOINT_KEY = "ocr_capture_checkpoint";
const GLOBAL_SEEN_KEY = "ocr_capture_seen_urls";
const BATCH_SIZE_MIN = 2;
const BATCH_SIZE_MAX = 4;
const BATCH_PAUSE_MIN = 8000;
const BATCH_PAUSE_MAX = 15000;

async function loadCheckpoint() {
  const value = await chrome.storage.local.get(CHECKPOINT_KEY);
  return value[CHECKPOINT_KEY] || null;
}

async function saveCheckpoint(value) {
  await chrome.storage.local.set({ [CHECKPOINT_KEY]: value });
}

async function clearCheckpoint() {
  await chrome.storage.local.remove(CHECKPOINT_KEY);
}

async function loadGlobalSeen() {
  const value = await chrome.storage.local.get(GLOBAL_SEEN_KEY);
  return new Set(Array.isArray(value[GLOBAL_SEEN_KEY]) ? value[GLOBAL_SEEN_KEY] : []);
}

async function saveGlobalSeen(seen) {
  await chrome.storage.local.set({ [GLOBAL_SEEN_KEY]: [...seen].slice(-10000) });
}

async function post(path, payload) {
  const response = await fetch(`${BRIDGE}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || `bridge HTTP ${response.status}`);
  return data;
}

async function report(status) {
  try { await post("/commands/status", { ...status, active: status.active ?? running, run_id: activeRunId }); } catch { /* bridge may be restarting */ }
}

function delay(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function randomDelay(min, max) {
  return delay(Math.floor(min + Math.random() * (max - min + 1)));
}

function randomInt(min, max) {
  return Math.floor(min + Math.random() * (max - min + 1));
}

async function sendTab(tabId, message) {
  try {
    return await chrome.tabs.sendMessage(tabId, message);
  } catch (error) {
    if (!String(error?.message || error).includes("Receiving end does not exist")) throw error;
    await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] });
    return chrome.tabs.sendMessage(tabId, message);
  }
}

async function capture(tabId, windowId) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      await chrome.windows.update(windowId, { focused: true });
      await chrome.tabs.update(tabId, { active: true });
      await delay(250 + attempt * 150);
      return await chrome.tabs.captureVisibleTab(windowId, { format: "png" });
    } catch (error) {
      lastError = error;
      if (attempt < 3) await delay(700 * attempt);
    }
  }
  throw lastError;
}

function pageKey(jobs) {
  return jobs.map((job) => job.url).join("|");
}

async function collectPage(tabId, previousKey = "") {
  let result = await sendTab(tabId, { type: "collect_jobs" });
  const started = Date.now();
  while (pageKey(result.jobs) === previousKey && Date.now() - started < 9000) {
    await delay(500);
    result = await sendTab(tabId, { type: "collect_jobs" });
  }
  return result;
}

async function waitForTab(tabId, url) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const tab = await chrome.tabs.get(tabId);
    if (tab.status === "complete" && (!url || tab.url === url || tab.url?.includes("/job_detail/"))) {
      await delay(1200);
      return tab;
    }
    await delay(500);
  }
  throw new Error("页面加载超时");
}

async function collect(tab, limit, resume = null) {
  const run = await post("/runs", resume?.run_id ? { run_id: resume.run_id } : {});
  activeRunId = run.run_id;
  const persistedSeen = resume ? [] : await post("/runs/seen", {}).catch(() => ({ urls: [] }));
  const seen = new Set([
    ...(Array.isArray(persistedSeen) ? persistedSeen : persistedSeen.urls || []),
    ...(Array.isArray(resume?.seen) ? resume.seen : []),
  ]);
  let sequence = Number(resume?.sequence) || 0;
  await report({ phase: "collecting", target: limit, count: sequence, message: resume ? `已从断点恢复，继续采集（已完成 ${sequence} 个）` : "已开始采集" });
  let hasNext = true;
  let previousPageKey = "";
  let batchSize = randomInt(BATCH_SIZE_MIN, BATCH_SIZE_MAX);
  let batchCount = 0;
  let batchNumber = 1;
  await report({ phase: "collecting", target: limit, count: sequence, batch: batchNumber, batch_size: batchSize, message: `第 ${batchNumber} 批开始，计划采集 ${batchSize} 个岗位` });
  await saveCheckpoint({
    version: 1,
    phase: "collecting",
    run_id: run.run_id,
    target: limit,
    tab_id: tab.id,
    window_id: tab.windowId,
    sequence,
    seen: [...seen],
    updated_at: new Date().toISOString(),
  });
  while (running && hasNext && (!limit || sequence < limit)) {
    const result = await collectPage(tab.id, previousPageKey);
    const currentPageKey = pageKey(result.jobs);
    if (currentPageKey && currentPageKey === previousPageKey) break;
    previousPageKey = currentPageKey;
    const jobs = result.jobs.filter((item) => !seen.has(item.url));
    for (const item of jobs) {
      if (!running || (limit && sequence >= limit)) break;
      seen.add(item.url);
      await saveGlobalSeen(seen);
      sequence += 1;
      const job = { ...item, sequence, capture_status: "card_captured", page_state: "search_result" };
      try {
        const cardImage = await capture(tab.id, tab.windowId);
        const shown = await sendTab(tab.id, { type: "show_job", url: item.url });
        job.page_state = shown.state || "detail_unchanged";
        job.capture_status = shown.ok ? "list_detail_captured" : "detail_unchanged";
        const detailImages = [];
        if (shown.ok) {
          await randomDelay(2500, 6000);
          detailImages.push(await capture(tab.id, tab.windowId));
          for (let page = 2; page <= 12; page += 1) {
            const next = await sendTab(tab.id, { type: "scroll_detail_page" });
            if (!next.moved) break;
            await delay(900);
            detailImages.push(await capture(tab.id, tab.windowId));
            if (next.done) break;
          }
          await sendTab(tab.id, { type: "reset_detail_scroll" });
        }
        await post(`/runs/${encodeURIComponent(run.run_id)}/job`, { job, card_image: cardImage, detail_images: detailImages });
      } catch (error) {
        job.capture_status = "needs_review";
        job.page_state = error.message;
        await post(`/runs/${encodeURIComponent(run.run_id)}/job`, { job, detail_images: [] });
      }
      await saveCheckpoint({
        version: 1,
        phase: "collecting",
        run_id: run.run_id,
        target: limit,
        tab_id: tab.id,
        window_id: tab.windowId,
        sequence,
        seen: [...seen],
        updated_at: new Date().toISOString(),
      });
      await report({ phase: "collecting", target: limit, count: sequence, message: `已采集 ${sequence} 个岗位` });
      if (running && (!limit || sequence < limit)) {
        if (sequence % COOL_DOWN_EVERY === 0) {
          await report({ phase: "cooling_down", target: limit, count: sequence, message: `已完成 ${sequence} 个岗位，短暂冷却后继续` });
          await randomDelay(20000, 35000);
        } else {
          await randomDelay(4000, 8000);
        }
        batchCount += 1;
        if (batchCount >= batchSize && running && (!limit || sequence < limit)) {
          batchNumber += 1;
          batchCount = 0;
          batchSize = randomInt(BATCH_SIZE_MIN, BATCH_SIZE_MAX);
          await report({ phase: "batch_pause", target: limit, count: sequence, batch: batchNumber - 1, batch_size: batchSize, message: `第 ${batchNumber - 1} 批完成，短暂等待后继续` });
          await randomDelay(BATCH_PAUSE_MIN, BATCH_PAUSE_MAX);
          await report({ phase: "collecting", target: limit, count: sequence, batch: batchNumber, batch_size: batchSize, message: `第 ${batchNumber} 批开始，计划采集 ${batchSize} 个岗位` });
        }
      }
    }
    if (!running || (limit && sequence >= limit)) break;
    const next = await sendTab(tab.id, { type: "next_page" });
    if (!next.ok) { hasNext = false; break; }
    await delay(1600);
  }
  await post(`/runs/${encodeURIComponent(run.run_id)}/finalize`, {});
  await clearCheckpoint();
  running = false;
  await report({ active: false, phase: "completed", target: limit, count: sequence, message: `采集完成，共 ${sequence} 个岗位` });
  activeRunId = null;
  return run;
}

async function pollControl() {
  try {
    if (!running) {
      const checkpoint = await loadCheckpoint();
      if (checkpoint?.phase === "collecting" && checkpoint.tab_id) {
        const tab = await chrome.tabs.get(checkpoint.tab_id);
        if (tab?.url?.includes("zhipin.com")) {
          running = true;
          collect(tab, Number(checkpoint.target) || 0, checkpoint).catch(async (error) => {
            running = false;
            await report({ active: false, phase: "error", message: `断点恢复失败：${error.message}` });
          });
          return;
        }
      }
    }
    const response = await fetch(`${BRIDGE}/commands/claim`);
    const command = await response.json();
    if (command.action === "stop") {
      running = false;
      await report({ phase: "stopping", message: "收到停止指令，当前岗位完成后停止" });
    } else if (command.action === "start" && !running) {
      running = true;
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.url?.includes("zhipin.com")) throw new Error("当前活动页不是 BOSS 页面");
      collect(tab, Number(command.limit) || 0).catch(async (error) => {
        running = false;
        await report({ active: false, phase: "error", message: error.message });
      });
    }
  } catch (error) {
    if (running && !activeRunId) {
      running = false;
      await report({ active: false, phase: "error", message: error.message });
    }
    /* bridge may be restarting */
  }
}

chrome.runtime.onInstalled.addListener(() => chrome.alarms.create("ocr-control", { periodInMinutes: 0.5 }));
chrome.runtime.onStartup.addListener(() => chrome.alarms.create("ocr-control", { periodInMinutes: 0.5 }));
chrome.alarms.create("ocr-control", { periodInMinutes: 0.5 });
chrome.alarms.onAlarm.addListener((alarm) => { if (alarm.name === "ocr-control") pollControl(); });
pollControl();

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "start") {
    if (running) {
      sendResponse({ ok: false, error: "采集已经在运行" });
      return false;
    }
    running = true;
    chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
      if (!tab?.url?.includes("zhipin.com")) throw new Error("当前活动页不是 BOSS 岗位列表");
      collect(tab, Number(message.limit) || 0).catch(async (error) => {
        running = false;
        await report({ active: false, phase: "error", message: error.message });
      });
    }).catch(async (error) => {
      running = false;
      await report({ active: false, phase: "error", message: error.message });
    });
    sendResponse({ ok: true, started: true });
    return false;
  }
  if (message.type === "stop") { running = false; sendResponse({ ok: true }); }
  if (message.type === "status") {
    fetch(`${BRIDGE}/commands/status`).then((response) => response.json()).then((value) => sendResponse(value)).catch((error) => sendResponse({ active: false, phase: "error", message: error.message }));
    return true;
  }
});
