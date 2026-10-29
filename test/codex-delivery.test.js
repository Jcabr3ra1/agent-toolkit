import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import { deliverReview, findCodexThread, registerReviewer } from "../src/codex-delivery.js";
import { runPeerInboxCli } from "../src/peer-inbox-cli.js";
import { createPeerReviewStore } from "../src/peer-review-store.js";

const root = await fs.mkdtemp(path.join(os.tmpdir(), "codex-delivery-"));
after(() => fs.rm(root, { recursive: true, force: true }));
const THREAD = "01a174b5-e8a9-7012-b868-be7511ef18f8";
const OTHER = "01a178b0-3a4a-7f61-8eb2-3cb63a12e5af";

async function fixture() {
  const directory = await fs.mkdtemp(path.join(root, "case-"));
  const projectRoot = await fs.realpath(await fs.mkdtemp(path.join(directory, "project-")));
  await fs.chmod(projectRoot, 0o700);
  await fs.writeFile(path.join(projectRoot, "app.js"), "export const answer = 42;\n");
  const codexHome = path.join(directory, "codex");
  await fs.mkdir(path.join(codexHome, "sessions", "2026", "10", "26"), { recursive: true });
  const store = createPeerReviewStore({ root: path.join(directory, "store") });
  const task = await store.startCollaboration({ projectRoot, project: "P", title: "T", objective: "O", primaryAgent: "claude", context: "C" });
  const bound = { taskId: task.id, projectRoot };
  const prepared = to => store.prepareReview({ ...bound, from: to === "codex" ? "claude" : "codex", to, message: "Revisa.", paths: ["app.js"] });
  const send = async (to = "codex") => (await store.dispatchReview(await prepared(to), { previewId: "a".repeat(32) })).id;
  const session = async (id, cwd, ageMs = 0) => {
    const file = path.join(codexHome, "sessions", "2026", "10", "26", `rollout-${id}.jsonl`);
    await fs.writeFile(file, JSON.stringify({ type: "session_meta", payload: { id, cwd, runtime_workspace_roots: [cwd] } }) + "\n{}\n");
    const when = new Date(Date.now() - ageMs);
    await fs.utimes(file, when, when);
  };
  const registry = path.join(directory, "reviewers");
  return { directory, projectRoot, codexHome, store, bound, send, session, registry, task };
}

test("the reviewer's session is found only when it is the one active session of that project", async () => {
  const f = await fixture();
  await assert.rejects(findCodexThread({ projectRoot: f.projectRoot, codexHome: f.codexHome }), { code: "codex-delivery", message: /No encontré tu sesión/u });
  await f.session(OTHER, f.projectRoot, 10 * 60_000);
  await f.session("01a17000-0000-7000-8000-000000000000", "/otro/proyecto");
  await assert.rejects(findCodexThread({ projectRoot: f.projectRoot, codexHome: f.codexHome }), { message: /No encontré tu sesión/u });
  await f.session(THREAD, f.projectRoot);
  assert.equal(await findCodexThread({ projectRoot: f.projectRoot, codexHome: f.codexHome }), THREAD);
  await f.session(OTHER, f.projectRoot);
  await assert.rejects(findCodexThread({ projectRoot: f.projectRoot, codexHome: f.codexHome }), { message: /Hay 2 sesiones de Codex activas.*--thread/u });
});

test("registering stores the thread privately and rejects bad input", async () => {
  const f = await fixture();
  await f.session(THREAD, f.projectRoot);
  const result = await registerReviewer({ projectRoot: f.projectRoot, codexHome: f.codexHome, directory: f.registry });
  assert.deepEqual(result, { registered: true, thread: THREAD, projectRoot: f.projectRoot });
  const [file] = await fs.readdir(f.registry);
  assert.equal((await fs.stat(path.join(f.registry, file))).mode & 0o777, 0o600);
  assert.equal(JSON.parse(await fs.readFile(path.join(f.registry, file), "utf8")).thread, THREAD);
  assert.equal((await fs.readdir(f.registry)).length, 1);
  await registerReviewer({ projectRoot: f.projectRoot, thread: OTHER, directory: f.registry });
  assert.equal(JSON.parse(await fs.readFile(path.join(f.registry, file), "utf8")).thread, OTHER);
  await assert.rejects(registerReviewer({ projectRoot: "relativa", thread: THREAD, directory: f.registry }), { code: "codex-delivery" });
  await assert.rejects(registerReviewer({ projectRoot: f.projectRoot, thread: "no-uuid; rm -rf /", directory: f.registry }), { message: /no es un UUID/u });
});

test("delivery sends one fixed notice for a pending approved review and nothing else", async () => {
  const f = await fixture();
  await registerReviewer({ projectRoot: f.projectRoot, thread: THREAD, directory: f.registry });
  const reviewId = await f.send();
  const calls = [];
  const run = async (thread, text) => { calls.push([thread, text]); return `Queued message 01a17975-24fe-79f2-99f4-2300e1137e91 for thread ${thread}.\n`; };
  const result = await deliverReview({ store: f.store, ...f.bound, reviewId, directory: f.registry, run });
  assert.deepEqual(result, { delivered: true, thread: THREAD, queued: "01a17975-24fe-79f2-99f4-2300e1137e91" });
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], THREAD);
  assert.match(calls[0][1], new RegExp(`Colaboración ${f.task.id}, encargo ${reviewId}, proyecto ${f.projectRoot.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}`, "u"));
  assert.match(calls[0][1], /claim_peer_review.*submit_peer_review/su);
  assert.equal(calls[0][1].includes("Revisa."), false);
  assert.ok(calls[0][1].length < 700);
});

test("delivery refuses reviews that are not pending, not for codex, closed, unregistered or stale", async () => {
  const f = await fixture();
  const run = async () => { throw new Error("must not run"); };
  const go = reviewId => deliverReview({ store: f.store, ...f.bound, reviewId, directory: f.registry, run });
  const toCodex = await f.send();
  await assert.rejects(go(toCodex), { message: /no se registró como revisor/u });
  await registerReviewer({ projectRoot: f.projectRoot, thread: THREAD, directory: f.registry });
  await assert.rejects(go("11111111-1111-4111-8111-111111111111"), { message: /Solo se avisa de un encargo aprobado, pendiente/u });
  await assert.rejects(deliverReview({ store: f.store, ...f.bound, reviewId: "x", directory: f.registry, run }), { message: /deben ser UUID/u });
  await f.store.cancelReview({ ...f.bound, reviewId: toCodex });
  await assert.rejects(go(toCodex), { message: /Solo se avisa/u });
  const toClaude = await f.send("claude");
  await assert.rejects(go(toClaude), { message: /Solo se avisa/u });
  await f.store.cancelReview({ ...f.bound, reviewId: toClaude });
  const again = await f.send();
  const old = path.join(f.registry, (await fs.readdir(f.registry))[0]);
  const record = JSON.parse(await fs.readFile(old, "utf8"));
  await fs.writeFile(old, JSON.stringify({ ...record, registeredAt: new Date(Date.now() - 25 * 3_600_000).toISOString() }));
  await assert.rejects(go(again), { message: /más de 24 horas/u });
  await fs.writeFile(old, "{roto");
  await assert.rejects(go(again), { message: /no se registró|no es válido/u });
  await f.store.closeCollaboration(f.bound);
  await assert.rejects(go(again), { message: /Solo se avisa/u });
});

test("a failing codex queue reports it and leaves the review pending", async () => {
  const f = await fixture();
  await registerReviewer({ projectRoot: f.projectRoot, thread: THREAD, directory: f.registry });
  const reviewId = await f.send();
  const run = async () => { throw Object.assign(new Error("fallo"), { code: "codex-delivery" }); };
  await assert.rejects(deliverReview({ store: f.store, ...f.bound, reviewId, directory: f.registry, run }), { code: "codex-delivery" });
  assert.equal((await f.store.getCollaboration({ ...f.bound, freshness: false })).reviews[0].state, "pending");
});

test("the inbox CLI registers, notifies and rejects wrong arguments", async () => {
  const f = await fixture();
  const sent = [];
  const run = async (args, extra = {}) => {
    const out = [], errors = [];
    const code = await runPeerInboxCli(args, { store: f.store, codexHome: f.codexHome, deliveryDirectory: f.registry,
      deliver: input => deliverReview({ ...input, run: async (thread, text) => { sent.push([thread, text]); return `Queued message 01a17975-24fe-79f2-99f4-2300e1137e91 for thread ${thread}.`; } }),
      out: t => out.push(t), err: t => errors.push(t), ...extra });
    return { code, out: out.join(""), errors: errors.join("") };
  };
  assert.equal((await run(["registrar", "--agent", "codex", "--project-root", f.projectRoot])).code, 1);
  const registered = await run(["registrar", "--agent", "codex", "--project-root", f.projectRoot, "--thread", THREAD]);
  assert.deepEqual([registered.code, JSON.parse(registered.out).thread], [0, THREAD]);
  const reviewId = await f.send();
  const notified = await run(["avisar", "--project-root", f.projectRoot, "--task", f.task.id, "--review", reviewId]);
  assert.equal(notified.code, 0);
  assert.equal(JSON.parse(notified.out).delivered, true);
  assert.equal(sent.length, 1);
  for (const argv of [["registrar", "--agent", "claude", "--project-root", f.projectRoot], ["registrar", "--agent", "codex"],
    ["registrar", "--agent", "codex", "--project-root", f.projectRoot, "--task", f.task.id], ["avisar", "--project-root", f.projectRoot],
    ["avisar", "--project-root", f.projectRoot, "--task", f.task.id, "--review", reviewId, "--thread", THREAD],
    ["avisar", "--project-root", f.projectRoot, "--project-root", f.projectRoot, "--task", f.task.id, "--review", reviewId]]) {
    const result = await run(argv);
    assert.equal(result.code, 2, JSON.stringify(argv));
    assert.match(result.errors, /agent-toolkit-inbox registrar/u);
  }
});

test("a write denied by a sandbox names the cause instead of a generic failure", async () => {
  const f = await fixture();
  const errors = [];
  const code = await runPeerInboxCli(["registrar", "--agent", "codex", "--project-root", f.projectRoot, "--thread", THREAD], {
    store: f.store, codexHome: f.codexHome, deliveryDirectory: path.join(f.directory, "no-escribible", "reviewers"),
    out: () => {}, err: t => errors.push(t) });
  assert.equal(code, 0);
  const locked = path.join(f.directory, "no-escribible", "reviewers");
  await fs.chmod(locked, 0o500);
  try {
    const denied = await runPeerInboxCli(["registrar", "--agent", "codex", "--project-root", f.projectRoot, "--thread", THREAD], {
      store: f.store, codexHome: f.codexHome, deliveryDirectory: locked, out: () => {}, err: t => errors.push(t) });
    assert.equal(denied, 1);
    assert.match(errors.join(""), /No se pudo escribir en el registro de Agent Toolkit \((EACCES|EPERM)\).*agent-toolkit doctor --agent codex/su);
  } finally { await fs.chmod(locked, 0o700); }
});
