#!/usr/bin/env node

import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const astro = path.join(root, "node_modules", "astro", "bin", "astro.mjs");
const requestedPort = process.env.AGENT_TOOLKIT_UI_PORT ?? "4321";
if (!/^\d{1,5}$/.test(requestedPort) || Number(requestedPort) < 1024 || Number(requestedPort) > 65535) {
  process.stderr.write("agent-toolkit-ui: el puerto debe estar entre 1024 y 65535\n");
  process.exit(2);
}

const child = spawn(process.execPath, [astro, "dev", "--host", "127.0.0.1", "--port", requestedPort, "--strictPort"], {
  cwd: root,
  env: process.env,
  stdio: "inherit"
});
child.on("error", () => {
  process.stderr.write("agent-toolkit-ui: instala las dependencias del proyecto con npm install\n");
  process.exitCode = 1;
});
child.on("exit", (code, signal) => {
  process.exitCode = code ?? (signal ? 1 : 0);
});
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => child.kill(signal));
}
