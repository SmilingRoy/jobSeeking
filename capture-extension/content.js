function canonical(url) {
  try {
    const value = new URL(url, location.href);
    if (!/^(www\.|m\.)?zhipin\.com$/i.test(value.hostname)) return null;
    if (!/^\/job_detail\/[^/]+\.html$/i.test(value.pathname)) return null;
    return `https://www.zhipin.com${value.pathname}`;
  } catch {
    return null;
  }
}

function collectJobs() {
  const seen = new Set();
  return [...document.querySelectorAll('a[href*="/job_detail/"]')].flatMap((link) => {
    const url = canonical(link.href);
    if (!url || seen.has(url)) return [];
    seen.add(url);
    const card = link.closest("li, article, .job-card, .job-list-item, .job-card-wrapper") || link;
    return [{ url, title_hint: (card.innerText || link.innerText || "").replace(/\s+/g, " ").trim().slice(0, 200) }];
  });
}

function pageState() {
  const text = (document.body?.innerText || "").slice(0, 10000);
  if (/验证码|安全验证|访问验证|请完成验证|security check/i.test(text)) return "blocked_by_security_page";
  if (/职位描述|岗位职责|任职要求|职位要求/.test(text)) return "detail_loaded";
  return "unknown";
}

function detailScroller() {
  const rightPoint = document.elementFromPoint(window.innerWidth * 0.72, window.innerHeight * 0.5);
  let ancestor = rightPoint;
  while (ancestor && ancestor !== document.body) {
    const rect = ancestor.getBoundingClientRect();
    if (rect.left > window.innerWidth * 0.38
      && rect.width > 240
      && rect.height > 240
      && ancestor.scrollHeight > ancestor.clientHeight + 40) {
      return ancestor;
    }
    ancestor = ancestor.parentElement;
  }
  const candidates = [...document.querySelectorAll("*")].filter((element) => {
    const rect = element.getBoundingClientRect();
    return rect.left > window.innerWidth * 0.42
      && rect.width > 240
      && rect.height > 240
      && element.scrollHeight > element.clientHeight + 40
      && rect.right > window.innerWidth * 0.72;
  });
  return candidates.sort((left, right) => {
    const rightDelta = (right.scrollHeight - right.clientHeight) + right.clientHeight * 0.05;
    const leftDelta = (left.scrollHeight - left.clientHeight) + left.clientHeight * 0.05;
    return rightDelta - leftDelta;
  })[0] || null;
}

function clickJob(link) {
  link.closest("li, article, .job-card, .job-list-item, .job-card-wrapper")?.scrollIntoView({ block: "center", behavior: "instant" });
  link.click();
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "collect_jobs") sendResponse({ jobs: collectJobs(), page_url: location.href });
  else if (message.type === "page_state") sendResponse({ state: pageState(), title: document.title });
  else if (message.type === "show_job") {
    const target = canonical(message.url);
    const link = [...document.querySelectorAll('a[href*="/job_detail/"]')].find((item) => canonical(item.href) === target);
    if (!link) sendResponse({ ok: false });
    else {
      const maxAttempts = 2;
      let attempt = 0;
      const tryClick = () => {
        attempt += 1;
        const before = document.body?.innerText || "";
        clickJob(link);
        const started = Date.now();
        let loadedAt = 0;
        const check = () => {
          const text = document.body?.innerText || "";
          const loaded = /职位描述|岗位职责|任职要求|职位要求|工作职责/.test(text) && text !== before;
          if (loaded && !loadedAt) loadedAt = Date.now();
          const stable = loadedAt && Date.now() - loadedAt >= 700;
          if (stable) {
            const scroller = detailScroller();
            if (scroller) scroller.scrollTop = 0;
            sendResponse({ ok: true, state: "list_detail_loaded", scrollable: Boolean(detailScroller()), attempts: attempt });
          } else if (Date.now() - started > 8000) {
            if (attempt < maxAttempts) setTimeout(tryClick, 900);
            else sendResponse({ ok: false, state: "detail_unchanged", attempts: attempt });
          } else setTimeout(check, 150);
        };
        check();
      };
      tryClick();
    }
  }
  else if (message.type === "scroll_detail_page") {
    const scroller = detailScroller();
    if (!scroller) sendResponse({ moved: false, done: true });
    else {
      const before = scroller.scrollTop;
      const step = Math.max(scroller.clientHeight * 0.78, 240);
      scroller.scrollTop = Math.min(before + step, scroller.scrollHeight - scroller.clientHeight);
      const after = scroller.scrollTop;
      const moved = after > before + 4;
      sendResponse({ moved, done: after >= scroller.scrollHeight - scroller.clientHeight - 4, top: after, height: scroller.scrollHeight, viewport: scroller.clientHeight });
    }
  }
  else if (message.type === "reset_detail_scroll") {
    const scroller = detailScroller();
    if (scroller) scroller.scrollTop = 0;
    sendResponse({ ok: true });
  }
  else if (message.type === "next_page") {
    const candidates = [...document.querySelectorAll("a,button")];
    const next = candidates.find((item) => /下一页|下一頁|next/i.test((item.innerText || item.getAttribute("aria-label") || "").trim()) && !item.disabled);
    if (!next) sendResponse({ ok: false });
    else { next.click(); sendResponse({ ok: true }); }
  }
  else if (message.type === "navigate") { location.href = message.url; sendResponse({ ok: true }); }
  return true;
});
