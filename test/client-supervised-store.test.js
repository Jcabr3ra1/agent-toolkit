import { supported } from "../testing/client-posix.js";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { createSupervisedContract, hash, taskKey } from "../src/client-supervised-contract.js";
import { createSupervisedPermit, claimSupervisedPermit, revokeSupervisedPermit } from "../src/client-supervised-permit.js";
import { createFixturePermit } from "../src/client-runtime-fixture-permit.js";
import { schema, store, request, fakeComplete, report, setup, taskDirectory } from "../testing/supervised/setup.js";
import { REASON_CODES } from "../src/client-supervised-codes.js";

const contract = createSupervisedContract(schema);
const localTest = (name, fn) => test(name, { skip: supported ? false : "Requires the POSIX attested store with uid/modes, no-follow opens and directory fsync.", timeout: 15000 }, fn);
const eventFiles = ["0000.json", "0001.json", "0002.json", "0003.json"];
const worker = fileURLToPath(new URL("../testing/supervised/store-worker.js", import.meta.url));
async function runWorker(root, mode) {
  const p = spawn(process.execPath, [worker, root, mode], { env: { LANG: "C", LC_ALL: "C", TMPDIR: path.dirname(root) }, stdio: ["ignore", "pipe", "pipe"] });
  let text = "", error = ""; p.stdout.on("data", b => { text += b; }); p.stderr.on("data", b => { error += b; });
  const [code] = await once(p, "close"); assert.equal(error, "");
  return { code, output: text ? JSON.parse(text) : null };
}
const privateSafe = v => assert.doesNotMatch(JSON.stringify(v), /synthetic-private|\/Users\/|agent-supervised-test|NODE_OPTIONS|PRIVATE KEY/);

test("S2 contract: closed registry and independent identity budget", () => {
  assert.deepEqual([...REASON_CODES], schema.$defs.reasons.items.enum);
  assert.deepEqual(contract.request(request()), request());
  const a = request().identity; assert.equal(taskKey(a), taskKey({ ...a, taskRevision: "r-two" }));
  assert.notEqual(taskKey(a), taskKey({ ...a, projectId: "other" }));
  assert.notEqual(taskKey(a), taskKey({ ...a, taskId: "other" }));
});
test("S2 closed reports reject arbitrary diagnostics and native claims", () => {
  for (const change of [r => { r.reasons = ["private-secret-text"]; }, r => { r.nativeExecuted = true; },
    r => { r.actualModelCalls = 0; }, r => { r.rawOutput = "private"; }, r => { r.metrics.mainStartsObserved = 0; },
    r => { r.metrics.terminationConfirmed = false; }, r => { r.groupObservation = "unconfirmed"; }]) {
    const r = report(); change(r); assert.throws(() => contract.processReport(r));
  }
});
for (const [name, change] of [
  ["client", d => { d.fixtureId = "claude"; }], ["S1 profile", d => { d.scope = "supervised-subscription"; }],
  ["S1 result", d => { d.state = "ready-for-supervised-review"; }], ["argv", d => { d.argv = []; }],
  ["shell", d => { d.shell = true; }], ["path", d => { d.identity.taskId = "../other"; }],
  ["numeric id", d => { d.attemptId = 1; }], ["coercion", d => { d.limits.timeoutMs = "1000"; }],
  ["missing limit", d => { delete d.limits.retries; }], ["retry", d => { d.limits.retries = 1; }],
  ["concurrency", d => { d.limits.concurrency = 2; }], ["time", d => { d.limits.timeoutMs = 120001; }],
  ["output", d => { d.limits.maxOutputBytes = 262145; }], ["grace", d => { d.limits.graceMs = d.limits.timeoutMs; }],
  ["line", d => { d.limits.maxLineBytes = d.limits.maxOutputBytes + 1; }],
  ["input bytes", d => { d.limits.maxInputBytes = 1; }], ["surrogate", d => { d.inputText = "\ud800"; }],
  ["getter", d => Object.defineProperty(d, "extra", { enumerable: true, get() { throw Error("do not call"); } })],
  ["proxy", d => { d.identity = new Proxy(d.identity, { ownKeys() { throw Error("do not call"); } }); }],
  ["cycle", d => { d.extra = d; }], ["toJSON", d => { d.toJSON = () => { throw Error("do not call"); }; }],
  ["prototype", d => Object.setPrototypeOf(d, { extra: true })]
]) test("S2 contract rejects " + name, () => {
  const d = request(); change(d); assert.throws(() => contract.request(d));
});
for (const bytes of [Buffer.from([0xff]), Buffer.alloc(131073), '{"schemaVersion":"1.0.0","schemaVersion":"1.0.0"}', '{"__proto__":{}}']) {
  test("S2 strict byte/json parser rejects adversary " + String(bytes).slice(0, 35), () => assert.throws(() => contract.request(bytes)));
}
test("S2 contract copies inputs and accepts strict string/bytes", () => {
  const d = request(), before = structuredClone(d), parsed = contract.request(JSON.stringify(d));
  assert.deepEqual(parsed, d); assert.deepEqual(contract.request(Buffer.from(JSON.stringify(d))), d);
  parsed.identity.taskId = "changed"; assert.deepEqual(d, before);
});
test("S2 top-level proxy never invokes ownKeys/getPrototypeOf hooks", () => {
  let hooks = 0;
  const p = new Proxy(request(), { ownKeys() { hooks++; return []; }, getPrototypeOf() { hooks++; return null; } });
  assert.throws(() => contract.request(p)); assert.equal(hooks, 0);
});
test("S2 permits reject fake, C2, serialized, revoked and mismatched handles", async () => {
  for (const h of [null, {}, { approved: true }, createFixturePermit(async () => {}, async () => {})]) await assert.rejects(claimSupervisedPermit(h, "a"));
  const h = createSupervisedPermit("a", async () => {}, async () => {});
  await assert.rejects(claimSupervisedPermit(JSON.parse(JSON.stringify(h)), "a"));
  revokeSupervisedPermit(h); await assert.rejects(claimSupervisedPermit(h, "a"));
  const q = createSupervisedPermit("a", async () => {}, async () => {});
  await assert.rejects(claimSupervisedPermit(q, "b")); await assert.rejects(claimSupervisedPermit(q, "a"));
});
test("S2 permits: concurrent consumers and failing claim consume once", async () => {
  let n = 0; const h = createSupervisedPermit("a", async () => { n++; await new Promise(r => setTimeout(r, 10)); }, async () => {});
  const both = await Promise.allSettled([claimSupervisedPermit(h, "a"), claimSupervisedPermit(h, "a")]);
  assert.equal(both.filter(x => x.status === "fulfilled").length, 1); assert.equal(n, 1);
  const bad = createSupervisedPermit("b", async () => { throw Error("no"); }, async () => {});
  await assert.rejects(claimSupervisedPermit(bad, "b")); await assert.rejects(claimSupervisedPermit(bad, "b"));
});

localTest("S2 storage: append-only durable completion, privacy and permissions", async t => {
  const root = await setup(t), s = store(root), d = request(), before = structuredClone(d);
  assert.equal((await s.observe(d.identity)).state, "clear");
  const r = await s.withReservation(d, fakeComplete(d)); assert.equal(r.state, "recorded", JSON.stringify(r));
  const dir = taskDirectory(root); assert.deepEqual(await fs.readdir(dir), [...eventFiles, "confirmed.json"]);
  assert.equal((await fs.lstat(dir)).mode & 0o777, 0o700);
  for (const p of eventFiles) {
    assert.equal((await fs.lstat(path.join(dir, p))).mode & 0o777, 0o600);
    const e = JSON.parse(await fs.readFile(path.join(dir, p), "utf8")); privateSafe(e); assert.equal(e.actualModelCalls, null);
  }
  const observed = await s.observe(d.identity); assert.equal(observed.state, "consumed");
  assert.equal(observed.mainStartsObserved, 1); assert.equal(observed.actualModelCalls, null); privateSafe(r); privateSafe(observed);
  assert.deepEqual(d, before);
});
localTest("S2 storage: attempts/revisions/fixtures/new instances never reset a task", async t => {
  const root = await setup(t), d = request(); await store(root).withReservation(d, fakeComplete(d));
  const dir = taskDirectory(root); const before = await Promise.all(eventFiles.map(p => fs.readFile(path.join(dir, p))));
  for (const change of [q => { q.attemptId = "a-two"; }, q => { q.identity.taskRevision = "r-two"; }, q => { q.fixtureId = "silent"; }]) {
    const q = structuredClone(d); change(q); let consumed = false;
    assert.equal((await store(root).withReservation(q, async () => { consumed = true; return report(); })).state, "blocked");
    assert.equal(consumed, false);
  }
  assert.deepEqual(await Promise.all(eventFiles.map(p => fs.readFile(path.join(dir, p)))), before);
});
localTest("S2 storage: different task/project remain isolated", async t => {
  const root = await setup(t);
  for (const i of [{ projectId: "synthetic", taskId: "one" }, { projectId: "synthetic", taskId: "two" }, { projectId: "other", taskId: "one" }]) {
    const d = request(); Object.assign(d.identity, i); assert.equal((await store(root).withReservation(d, fakeComplete(d))).state, "recorded");
  }
  assert.equal((await fs.readdir(root)).length, 3);
});
localTest("S2 storage: in-process and cross-process exclusive reservation", async t => {
  const root = await setup(t), d = request();
  const both = await Promise.all([store(root).withReservation(d, fakeComplete(d)), store(root).withReservation(d, fakeComplete(d))]);
  assert.equal(both.filter(r => r.state === "recorded").length, 1); assert.equal(both.filter(r => r.state === "blocked").length, 1);
  const root2 = await setup(t); const children = await Promise.all([runWorker(root2, "race"), runWorker(root2, "race")]);
  assert.ok(children.every(r => r.code === 0)); assert.equal(children.filter(r => r.output.state === "recorded").length, 1);
});
for (const point of ["before-reserve", "after-directory", "after-write-reserved", "durable-reserved", "before-consumer", "after-write-start-claimed", "durable-start-claimed", "after-write-started", "durable-started", "after-write-completed-for-review"]) {
  localTest("S2 storage: injected failure at " + point, async t => {
    const root = await setup(t), d = request(); let consumed = false;
    const r = await store(root, { checkpoint: async name => { if (name === point) throw Error("PRIVATE KEY private exception"); } }).withReservation(d, async h => { consumed = true; return fakeComplete(d)(h); });
    assert.notEqual(r.state, "recorded"); privateSafe(r);
    const observed = await store(root).observe(d.identity);
    if (point === "before-reserve") { assert.equal(observed.state, "clear"); assert.equal(consumed, false); }
    else { assert.equal(observed.state, "reconciliation-required"); assert.equal((await store(root).withReservation(d, fakeComplete(d))).state, "blocked"); }
  });
}
for (const point of ["before-reserve", "after-directory", "durable-reserved", "durable-start-claimed", "durable-started", "supervisor-spawn"]) {
  localTest("S2 storage: actual coordinator process exits at " + point, async t => {
    const root = await setup(t); const r = await runWorker(root, point); assert.equal(r.code, 23);
    const s = await store(root).observe(request().identity);
    if (point === "before-reserve") assert.equal(s.state, "clear");
    else { assert.equal(s.state, "reconciliation-required"); assert.equal((await store(root).withReservation(request(), fakeComplete(request()))).state, "blocked"); }
  });
}
for (const [name, mutate] of [
  ["extra file", async dir => fs.writeFile(path.join(dir, "unknown"), "private", { mode: 0o600 })],
  ["truncated", async dir => fs.writeFile(path.join(dir, "0000.json"), "{")],
  ["event gap", async dir => fs.unlink(path.join(dir, "0001.json"))],
  ["missing receipt", async dir => fs.unlink(path.join(dir, "confirmed.json"))],
  ["malformed receipt", async dir => fs.writeFile(path.join(dir, "confirmed.json"), "{")],
  ["receipt mismatch", async dir => fs.writeFile(path.join(dir, "confirmed.json"), JSON.stringify({ schemaVersion: "1.0.0", scope: "fixture-only", terminalSha256: "a".repeat(64) }))],
  ["permissions", async dir => fs.chmod(path.join(dir, "0000.json"), 0o644)],
  ["hardlink", async dir => fs.link(path.join(dir, "0000.json"), path.join(path.dirname(dir), "hardlink"))],
  ["directory mode", async dir => fs.chmod(dir, 0o755)],
  ["symlink", async dir => { await fs.rename(path.join(dir, "0000.json"), path.join(path.dirname(dir), "original")); await fs.symlink(path.join(path.dirname(dir), "original"), path.join(dir, "0000.json")); }],
  ["binding", async dir => { const p = path.join(dir, "0001.json"), e = JSON.parse(await fs.readFile(p)); e.identity.taskRevision = "other"; await fs.writeFile(p, JSON.stringify(e)); }],
  ["chain hash", async dir => { const p = path.join(dir, "0001.json"), e = JSON.parse(await fs.readFile(p)); e.previousSha256 = "f".repeat(64); await fs.writeFile(p, JSON.stringify(e)); }],
  ["forged complete", async dir => { const p = path.join(dir, "0000.json"), e = JSON.parse(await fs.readFile(p)); e.state = "completed-for-review"; await fs.writeFile(p, JSON.stringify(e)); }]
]) localTest("S2 storage detects " + name, async t => {
  const root = await setup(t), d = request(); await store(root).withReservation(d, fakeComplete(d)); await mutate(taskDirectory(root));
  const s = await store(root).observe(d.identity); assert.equal(s.state, "reconciliation-required"); privateSafe(s);
  assert.equal((await store(root).withReservation(d, fakeComplete(d))).state, "blocked");
});
localTest("S2 storage rejects root link, replacement, wrong mode and non-temp root", async t => {
  const root = await setup(t), s = store(root); assert.equal((await s.observe(request().identity)).state, "clear");
  await fs.chmod(root, 0o755); assert.equal((await s.observe(request().identity)).state, "reconciliation-required"); await fs.chmod(root, 0o700);
  const link = path.join(root, "link"); await fs.symlink(root, link);
  assert.equal((await store(link).observe(request().identity)).state, "reconciliation-required");
  assert.equal((await store(process.cwd()).observe(request().identity)).state, "reconciliation-required");
  const previous = path.join(root, "old-dir"); await fs.mkdir(previous, { mode: 0o700 });
  assert.throws(() => store("relative"));
});
localTest("S2 storage: errors/fabricated reports never refund reservations", async t => {
  for (const consume of [async () => { throw Error("raw secret"); }, async () => ({ executed: true }), async h => {
    await claimSupervisedPermit(h, hash(request())); return report("completed-for-review", false);
  }]) {
    const root = await setup(t); const r = await store(root).withReservation(request(), consume);
    assert.equal(r.state, "reconciliation-required"); assert.equal((await store(root).withReservation(request(), fakeComplete(request()))).state, "blocked");
  }
});
localTest("S2 storage: claim fails safely on fsync/readback errors", async t => {
  const root = await setup(t); let invokes = 0;
  const r = await store(root, { io: { open: async (...args) => {
    const h = await fs.open(...args); h.sync = async () => { throw Error("disk"); }; return h;
  } } }).withReservation(request(), async () => { invokes++; return report(); });
  assert.equal(r.state, "reconciliation-required"); assert.equal(invokes, 0);
});
localTest("S2 storage: receipt only exists after confirmed terminal synchronization", async t => {
  const root = await setup(t);
  const r = await store(root, { checkpoint: async name => {
    if (name === "after-write-completed-for-review") throw Error("disk");
  } }).withReservation(request(), fakeComplete(request()));
  assert.equal(r.state, "reconciliation-required");
  assert.equal((await fs.readdir(taskDirectory(root))).includes("confirmed.json"), false);
  assert.equal((await store(root).observe(request().identity)).state, "reconciliation-required");
});
localTest("S2 storage: owner mismatch or replaced directory rejects read", async t => {
  const root = await setup(t); await store(root).withReservation(request(), fakeComplete(request()));
  const p = path.join(taskDirectory(root), "0000.json");
  const bad = store(root, { io: { lstat: async name => {
    const s = await fs.lstat(name); if (name === p) s.uid += 1; return s;
  } } }); assert.equal((await bad.observe(request().identity)).state, "reconciliation-required");
  const pinned = store(root); await pinned.observe(request().identity);
  const held = root + "-held"; await fs.rename(root, held); await fs.mkdir(root, { mode: 0o700 });
  try { assert.equal((await pinned.observe(request().identity)).state, "reconciliation-required"); }
  finally { await fs.rmdir(root); await fs.rename(held, root); }
});
localTest("S2 storage: clocks/short writes/oversized files fail closed", async t => {
  for (const deps of [{ clock: () => NaN }, { io: { open: async (...a) => {
    const h = await fs.open(...a); h.write = async () => ({ bytesWritten: 0 }); return h;
  } } }]) {
    const root = await setup(t), r = await store(root, deps).withReservation(request(), fakeComplete(request()));
    assert.equal(r.state, "reconciliation-required"); assert.equal((await store(root).withReservation(request(), fakeComplete(request()))).state, "blocked");
  }
  const root = await setup(t); await store(root).withReservation(request(), fakeComplete(request()));
  await fs.writeFile(path.join(taskDirectory(root), "0000.json"), Buffer.alloc(131073));
  assert.equal((await store(root).observe(request().identity)).state, "reconciliation-required");
});
localTest("S2 scope change after reservation cannot claim a different prompt", async t => {
  const root = await setup(t), d = request(); let handle;
  const r = await store(root).withReservation(d, async h => {
    handle = h; const other = structuredClone(d); other.inputText = "other";
    await claimSupervisedPermit(h, hash(other)); return report();
  }); assert.equal(r.state, "reconciliation-required");
  await assert.rejects(claimSupervisedPermit(handle, hash(d)));
});
test("S2 observed-start capability expires and is single-use", async () => {
  let starts = 0;
  const h = createSupervisedPermit("a", async () => {}, async () => { starts++; });
  const cap = await claimSupervisedPermit(h, "a"); await cap.started(); await assert.rejects(cap.started()); assert.equal(starts, 1);
  const second = createSupervisedPermit("b", async () => {}, async () => { starts++; });
  const cap2 = await claimSupervisedPermit(second, "b"); revokeSupervisedPermit(second); await assert.rejects(cap2.started()); assert.equal(starts, 1);
});
