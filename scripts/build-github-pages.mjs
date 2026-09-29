#!/usr/bin/env node
import { spawn } from "node:child_process";

const child = spawn("pnpm", ["exec", "vite", "build", "--config", "vite.github-pages.config.ts"], {
  stdio: "inherit",
  cwd: process.cwd(),
});

child.on("error", (error) => {
  console.error(error);
  process.exitCode = 1;
});
child.on("exit", (code, signal) => {
  if (signal) process.exitCode = 1;
  else process.exitCode = code ?? 1;
});
