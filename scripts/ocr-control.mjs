#!/usr/bin/env node
const action = process.argv[2] || "status";
const bridge = process.env.OCR_BRIDGE_URL || "http://127.0.0.1:4318";
const args = process.argv.slice(3);
const limitIndex = args.indexOf("--limit");
const limit = limitIndex >= 0 ? Number(args[limitIndex + 1]) : 0;
let response;
if (action === "start") {
  response = await fetch(`${bridge}/commands/start`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ limit }) });
} else if (action === "stop") {
  response = await fetch(`${bridge}/commands/stop`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
} else if (action === "status") {
  response = await fetch(`${bridge}/commands/status`);
} else {
  throw new Error("用法：ocr-control.mjs start [--limit N] | stop | status");
}
const payload = await response.json();
if (!response.ok) throw new Error(payload.error || `bridge HTTP ${response.status}`);
console.log(JSON.stringify(payload, null, 2));
