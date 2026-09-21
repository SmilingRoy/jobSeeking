#!/usr/bin/env node
import http from "node:http";
import { join, resolve } from "node:path";
import { readdir, readFile } from "node:fs/promises";
import {
  DEFAULT_RUNS_DIR,
  atomicWriteJson,
  createRun,
  decodeImageData,
  loadRun,
  screenshotName,
  upsertJob,
} from "./lib/ocr-capture.mjs";

const port = Number(process.env.OCR_BRIDGE_PORT || 4318);
const runsRoot = resolve(process.env.OCR_RUNS_DIR || DEFAULT_RUNS_DIR);
const control = { pending: null, active: false, run_id: null, target: 0, count: 0, phase: "idle", message: "" };

function send(response, status, payload) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8", "access-control-allow-origin": "*" });
  response.end(JSON.stringify(payload));
}

async function body(request) {
  let value = "";
  for await (const chunk of request) {
    value += chunk;
    if (value.length > 40 * 1024 * 1024) throw new Error("request too large");
  }
  return JSON.parse(value || "{}");
}

const server = http.createServer(async (request, response) => {
  if (request.method === "OPTIONS") {
    response.writeHead(204, { "access-control-allow-origin": "*", "access-control-allow-headers": "content-type" });
    return response.end();
  }
  try {
    const url = new URL(request.url, `http://127.0.0.1:${port}`);
    if (request.method === "GET" && url.pathname === "/health") return send(response, 200, { ok: true, port, runs_root: runsRoot });
    if (request.method === "POST" && url.pathname === "/commands/start") {
      const input = await body(request);
      const target = Number(input.limit || 0);
      if (!Number.isInteger(target) || target < 0 || target > 10000) throw new Error("limit 必须是 0 到 10000 的整数，0 表示持续采集");
      const command = { id: `command-${Date.now()}`, action: "start", limit: target, created_at: new Date().toISOString() };
      control.pending = command;
      control.active = false;
      control.phase = "queued";
      control.target = target;
      control.message = target ? `等待采集 ${target} 个岗位` : "等待开始持续采集";
      return send(response, 202, command);
    }
    if (request.method === "POST" && url.pathname === "/commands/stop") {
      control.pending = { id: `command-${Date.now()}`, action: "stop", created_at: new Date().toISOString() };
      control.message = "等待扩展安全停止";
      return send(response, 202, control.pending);
    }
    if (request.method === "GET" && url.pathname === "/commands/claim") {
      const command = control.pending;
      control.pending = null;
      return send(response, 200, command || { action: "none" });
    }
    if (request.method === "GET" && url.pathname === "/commands/status") return send(response, 200, control);
    if (request.method === "POST" && url.pathname === "/commands/status") {
      const input = await body(request);
      Object.assign(control, input, { pending: control.pending });
      return send(response, 200, control);
    }
    if (request.method === "POST" && url.pathname === "/runs") {
      const input = await body(request);
      const run = await createRun(runsRoot, input.run_id);
      return send(response, 201, { run_id: run.runId, manifest: run.manifest });
    }
    if (request.method === "POST" && url.pathname === "/runs/seen") {
      const urls = new Set();
      for (const entry of await readdir(runsRoot, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        try {
          const manifest = JSON.parse(await readFile(join(runsRoot, entry.name, "manifest.json"), "utf8"));
          for (const job of manifest.jobs || []) if (job.url) urls.add(job.url);
        } catch { /* ignore incomplete run directories */ }
      }
      return send(response, 200, { urls: [...urls] });
    }
    const match = url.pathname.match(/^\/runs\/([^/]+)\/(job|finalize)$/);
    if (!match) return send(response, 404, { error: "not_found" });
    const run = await loadRun(runsRoot, decodeURIComponent(match[1]));
    if (request.method !== "POST") return send(response, 405, { error: "method_not_allowed" });
    if (match[2] === "finalize") {
      run.manifest.finalized_at = new Date().toISOString();
      await atomicWriteJson(join(run.runDir, "manifest.json"), run.manifest);
      return send(response, 200, { run_id: run.runId, job_count: run.manifest.jobs.length, manifest: run.manifest });
    }
    const input = await body(request);
    const job = upsertJob(run.manifest, input.job || input);
    if (input.card_image) {
      const image = decodeImageData(input.card_image);
      const filename = screenshotName(job.sequence, "card").replace(/\.png$/, `.${image.extension}`);
      await import("node:fs/promises").then(({ writeFile }) => writeFile(join(run.screenshotsDir, filename), image.bytes));
      job.card_screenshot = `screenshots/${filename}`;
    }
    if (Array.isArray(input.detail_images)) {
      job.detail_screenshots = [];
      for (const [index, value] of input.detail_images.entries()) {
        const image = decodeImageData(value);
        const filename = screenshotName(job.sequence, "detail", index + 1).replace(/\.png$/, `.${image.extension}`);
        await import("node:fs/promises").then(({ writeFile }) => writeFile(join(run.screenshotsDir, filename), image.bytes));
        job.detail_screenshots.push(`screenshots/${filename}`);
      }
    }
    await atomicWriteJson(join(run.runDir, "manifest.json"), run.manifest);
    return send(response, 201, { run_id: run.runId, job });
  } catch (error) {
    return send(response, 400, { error: error instanceof Error ? error.message : String(error) });
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`OCR capture bridge listening on http://127.0.0.1:${port}`);
});
