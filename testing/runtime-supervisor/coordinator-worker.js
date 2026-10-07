// Trusted subprocess harness: fixed fixture, explicit fictional clock, no IA/network.
import { coordinator, request } from "./setup.js";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
const root = process.argv[2];
const wait = process.argv[3] === "wait";
const crash = process.argv[3] === "crash-after-spawn" || process.argv[3] === "crash-after-mark";
let groupId, workspace;
async function barrier() {
  const s = await fs.lstat(workspace);
  process.send?.({ type: "started", groupId, workspace, dev: s.dev, ino: s.ino });
  await new Promise(resolve => process.once("message", resolve));
}
const run = coordinator(root, { store: { checkpoint: async phase => {
  if (phase === "session-reserved" && wait) {
    process.send?.({ type: "reserved" });
    await new Promise(resolve => process.once("message", m => { if (m?.type === "release") resolve(); }));
  }
  if (phase === "session-mark-started-confirmed" && process.argv[3] === "crash-after-mark") await barrier();
} }, supervisor: {
  spawn: (...args) => { const child = spawn(...args); groupId = child.pid; workspace = args[2].cwd; return child; },
  checkpoint: async phase => { if (phase === "fixture-spawned" && process.argv[3] === "crash-after-spawn") await barrier(); }
} });
const report = await run(request(root, crash ? "silent" : "success"));
process.send?.({ type: "result", report });
process.disconnect?.();
