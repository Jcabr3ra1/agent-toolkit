import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";
import { createPeerReviewStore } from "../src/peer-review-store.js";
import { runPeerInboxCli } from "../src/peer-inbox-cli.js";

const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "agent-toolkit-inbox-")));
after(() => fs.rm(root, { recursive: true, force: true }));
const bin = fileURLToPath(new URL("../bin/agent-toolkit-inbox.js", import.meta.url));

async function fixture() {
  const directory = await fs.mkdtemp(path.join(root, "case-"));
  const projectRoot = path.join(directory, "project");
  await fs.mkdir(projectRoot, { mode: 0o700 });
  await fs.writeFile(path.join(projectRoot, "app.js"), "export const answer = 42;\n");
  const storage = path.join(directory, "workflows", "peers");
  const store = createPeerReviewStore({ root: storage });
  const task = await store.startCollaboration({ projectRoot, project: "Bandeja", title: "Esperar sin modelo",
    objective: "Recibir encargos", primaryAgent: "codex" });
  const bound = { taskId: task.id, projectRoot };
  const send = async () => store.dispatchReview(await store.prepareReview({ ...bound, from: "codex", to: "claude",
    message: "Revisa answer.", paths: ["app.js"], reviewer: { model: "sonnet", effort: "medium", reason: "Cambio pequeño." } }),
    { previewId: "a".repeat(32) });
  return { directory, projectRoot, storage, store, bound, send };
}

async function run(argv, store, hooks = {}) {
  const output = [], errors = [];
  let clock = 0, sleeps = 0;
  const code = await runPeerInboxCli(argv, { store, out: text => output.push(text), err: text => errors.push(text),
    now: () => clock, sleep: async ms => { sleeps++; clock += ms; await hooks.onSleep?.(sleeps); } });
  return { code, sleeps, json: output.length ? JSON.parse(output.join("")) : null, errors: errors.join("") };
}

test("the inbox times out without a request and reports a later handoff without the prompt", async () => {
  const f = await fixture();
  const args = ["wait", "--agent", "claude", "--project-root", f.projectRoot];
  const idle = await run([...args, "--timeout-seconds", "5"], f.store);
  assert.equal(idle.code, 3);
  assert.equal(idle.json.state, "timeout");
  let sent;
  const waited = await run(args, f.store, { onSleep: async count => { if (count === 3) sent = await f.send(); } });
  assert.equal(waited.code, 0);
  assert.equal(waited.sleeps, 3);
  assert.equal(waited.json.state, "handoff");
  assert.equal(waited.json.taskId, f.bound.taskId);
  assert.equal(waited.json.review.id, sent.id);
  assert.deepEqual(waited.json.review.reviewer, { model: "sonnet", effort: "medium", reason: "Cambio pequeño." });
  assert.equal(waited.json.review.prompt, undefined);
  assert.equal((await run(["wait", "--agent", "codex", "--project-root", f.projectRoot, "--timeout-seconds", "1"], f.store)).code, 3);
});

test("waiting on a review ends when the report arrives or the collaboration closes", async () => {
  const f = await fixture();
  const request = await f.send();
  const args = ["wait", "--agent", "codex", "--project-root", f.projectRoot, "--task", f.bound.taskId, "--review", request.id];
  const report = await run(args, f.store, { onSleep: async count => {
    if (count !== 2) return;
    const claim = await f.store.claimReview({ ...f.bound, reviewId: request.id, agent: "claude" });
    await f.store.submitReview({ ...f.bound, reviewId: request.id, agent: "claude", claimToken: claim.claimToken, content: "Sin hallazgos." });
  } });
  assert.equal(report.code, 0);
  assert.deepEqual({ state: report.json.state, reviewState: report.json.review.state, hasReport: report.json.review.hasReport },
    { state: "finished", reviewState: "completed", hasReport: true });
  assert.equal(JSON.stringify(report.json).includes("Sin hallazgos"), false);
  const second = await f.send();
  const closed = await run([...args.slice(0, 8), second.id], f.store, { onSleep: () => f.store.closeCollaboration(f.bound) });
  assert.equal(closed.json.state, "closed");
});

test("invalid arguments and unreadable inboxes fail without waiting", async () => {
  const f = await fixture();
  for (const argv of [[], ["listen"], ["wait", "--agent", "gemini", "--project-root", f.projectRoot],
    ["wait", "--agent", "claude"], ["wait", "--agent", "claude", "--project-root", f.projectRoot, "--task", f.bound.taskId],
    ["wait", "--agent", "claude", "--project-root", f.projectRoot, "--timeout-seconds", "0"],
    ["wait", "--agent", "claude", "--project-root", f.projectRoot, "--task", "x", "--review", "y"],
    ["wait", "--agent", "claude", "--project-root", f.projectRoot, "--extra", "1"],
    ["wait", "--agent", "claude", "--project-root", f.projectRoot, "--timeout-seconds", "5", "--timeout-seconds", "9"]]) {
    const result = await run(argv, f.store);
    assert.equal(result.code, 2, JSON.stringify(argv));
    assert.match(result.errors, /Uso: agent-toolkit-inbox wait/u);
    assert.equal(result.sleeps, 0);
  }
  const missing = await run(["wait", "--agent", "claude", "--project-root", path.join(f.directory, "missing")], f.store);
  assert.equal(missing.code, 1);
  assert.equal(missing.sleeps, 0);
});

test("the installed bin blocks without a model and exits when a request arrives", async () => {
  const f = await fixture();
  const child = spawn(process.execPath, [bin, "wait", "--agent", "claude", "--project-root", f.projectRoot, "--timeout-seconds", "30"],
    { env: { ...process.env, AGENT_TOOLKIT_WORKFLOW_DIR: path.dirname(f.storage) }, stdio: ["ignore", "pipe", "pipe"] });
  let stdout = "", stderr = "";
  child.stdout.on("data", chunk => { stdout += chunk; });
  child.stderr.on("data", chunk => { stderr += chunk; });
  const exited = new Promise(resolve => child.on("exit", resolve));
  await new Promise(resolve => setTimeout(resolve, 500));
  assert.equal(child.exitCode, null);
  const sent = await f.send();
  assert.equal(await exited, 0, stderr);
  assert.equal(JSON.parse(stdout).review.id, sent.id);
});

test("rendimiento prints a table of recorded outcomes without using a model", async () => {
  const f = await fixture();
  const empty = [];
  assert.equal(await runPeerInboxCli(["rendimiento"], { store: f.store, out: t => empty.push(t), err: () => {} }), 0);
  assert.match(empty.join(""), /Sin resultados registrados/u);
  const request = await f.send();
  const claim = await f.store.claimReview({ ...f.bound, reviewId: request.id, agent: "claude" });
  await f.store.submitReview({ ...f.bound, reviewId: request.id, agent: "claude", claimToken: claim.claimToken, content: "Veredicto: Aprobado" });
  await f.store.recordOutcome({ ...f.bound, reviewId: request.id, agent: "codex", verdict: "aprobado", findings: 2, upheld: 1, level: "normal" });
  const output = [];
  assert.equal(await runPeerInboxCli(["rendimiento", "--project-root", f.projectRoot], { store: f.store, out: t => output.push(t), err: () => {} }), 0);
  assert.match(output.join(""), /\| claude \| sonnet \| medium \| normal \| 1 \| 2 \| 1 \(50 %\) \| 1 \/ 0 \/ 0 \|/u);
  const json = [];
  await runPeerInboxCli(["rendimiento", "--json"], { store: f.store, out: t => json.push(t), err: () => {} });
  assert.equal(JSON.parse(json.join("")).groups[0].reviews, 1);
  const errors = [];
  assert.equal(await runPeerInboxCli(["rendimiento", "--otro"], { store: f.store, out: () => {}, err: t => errors.push(t) }), 2);
  assert.match(errors.join(""), /rendimiento \[--project-root/u);
});
