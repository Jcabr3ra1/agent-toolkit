import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawn, execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import { createManagedPreferencesInvocation, createManagedPreferencesInvocationPermit, revokeManagedPreferencesInvocationPermit, INVOCATION_SCHEMA_ID } from "../src/client-managed-preferences-invocation.js";

const schema = JSON.parse(await fs.readFile(new URL("../schemas/agent-client-managed-preferences-invocation.schema.json", import.meta.url), "utf8"));
const preferencesSchema = JSON.parse(await fs.readFile(new URL("../schemas/agent-client-managed-preferences.schema.json", import.meta.url), "utf8"));
const fixture = fileURLToPath(new URL("../testing/managed-preferences/invocation-fixture.c", import.meta.url));
const helper = fileURLToPath(new URL("../src/native/managed-preferences.c", import.meta.url));
const backend = fileURLToPath(new URL("../testing/managed-preferences/backend.c", import.meta.url));
const compiler = "/Library/Developer/CommandLineTools/usr/bin/clang", sdk = "/Library/Developer/CommandLineTools/SDKs/MacOSX.sdk";
const localTest = (name, fn) => test(name, { skip: process.platform !== "darwin", timeout: 20000 }, fn);
const mono = () => Number(process.hrtime.bigint() / 1000000n);
function safe(r) {
  assert.equal(r.scope, "managed-preferences-helper-only"); assert.equal(r.decision, "no-client-start");
  for (const k of ["nativeClientStarted", "inferenceRequested", "runtimeReady", "verifiedAdmission", "effectiveIsolationVerified", "externalBillingVerified", "preferencesQueriedVerified"]) assert.equal(r[k], false);
  assert.ok(r.spawnAttempts <= 1); assert.deepEqual(r.reasons, [...new Set(r.reasons)].sort());
  if (!["completed", "helper-failed"].includes(r.state)) { assert.equal(r.projection, null); assert.equal(r.helperExecutionVerified, false); }
  assert.doesNotMatch(JSON.stringify(r), /synthetic-private|agent-invocation-test|\/Users\/|argv|sha256/); return r;
}
async function setup(t, mode = 0, useHelper = false) {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "agent-invocation-test-"))); await fs.chmod(root, 0o700);
  const owned = await fs.lstat(root);
  t.after(async () => { const s = await fs.lstat(root).catch(() => null); if (s?.isDirectory() && !s.isSymbolicLink() && s.dev === owned.dev && s.ino === owned.ino) await fs.rm(root, { recursive: true }); });
  const artifact = path.join(root, "synthetic-artifact"), parent = path.join(root, "owned-workspaces"); await fs.mkdir(parent, { mode: 0o700 });
  const args = ["-std=c11", "-Wall", "-Wextra", "-Werror", "-isysroot", sdk];
  if (useHelper) args.push("-DN1_SYNTHETIC_BACKEND", `-DN1_SCENARIO=${mode}`, helper, backend);
  else args.push(`-DN1_TRANSPORT_MODE=${mode}`, fixture);
  args.push("-o", artifact);
  await new Promise((resolve, reject) => { const child = execFile(compiler, args, { env: { PATH: "/usr/bin:/bin", HOME: process.env.HOME, TMPDIR: root }, timeout: 10000 }, e => e ? reject(Error("Synthetic compilation failed")) : resolve()); child.stdin.end(); });
  await fs.chmod(artifact, 0o500);
  const a = await fs.lstat(artifact), p = await fs.lstat(parent), bytes = await fs.readFile(artifact);
  const cfg = { expectedSource: "synthetic", artifact: { path: artifact, dev: a.dev, ino: a.ino, uid: a.uid, mode: a.mode & 4095, size: a.size, mtimeMs: a.mtimeMs, ctimeMs: a.ctimeMs, sha256: createHash("sha256").update(bytes).digest("hex") },
    workspaceParent: { path: parent, dev: p.dev, ino: p.ino, uid: p.uid, mode: p.mode & 4095 },
    limits: { totalTimeoutMs: 1500, graceMs: 150, confirmationMs: 250, maxOutputBytes: 32768, maxErrorBytes: 32768, permitLifetimeMs: 60000 } };
  return { cfg, artifact, parent, root };
}
const collector = (cfg, permit, deps = {}) => createManagedPreferencesInvocation(schema, preferencesSchema, cfg, permit, deps);
localTest("NI helper is invoked exactly once, without shell/input/unapproved env, then revalidated and cleaned", async t => {
  const { cfg, parent } = await setup(t); const permit = createManagedPreferencesInvocationPermit(cfg); let calls = 0;
  const deps = { spawn(file, args, opts) { calls++; assert.equal(file, cfg.artifact.path); assert.deepEqual(args, []); assert.equal(opts.shell, false); assert.equal(opts.detached, true);
    assert.deepEqual(opts.stdio, ["ignore", "pipe", "pipe"]); assert.equal(opts.env.HOME, process.env.HOME); assert.deepEqual(Object.keys(opts.env).sort(), ["HOME", "LANG", "LC_ALL", "PATH", "TMPDIR"]);
    return spawn(file, args, opts); } };
  const before = structuredClone(cfg), c = collector(cfg, permit, deps), r = safe(await c.run());
  assert.equal(r.state, "completed"); assert.equal(r.helperStarted, true); assert.equal(r.helperExecutionVerified, true);
  assert.equal(r.artifactMatchedBefore, true); assert.equal(r.artifactMatchedAfter, true); assert.equal(r.terminationConfirmed, true);
  assert.equal(r.cleanupRequired, false); assert.equal(r.projection.sourceClaim, "synthetic"); assert.equal(calls, 1); assert.deepEqual(cfg, before);
  assert.deepEqual(await fs.readdir(parent), []); assert.equal(safe(await c.run()).spawnAttempts, 0);
});
for (const scenario of [0, 1, 2, 9]) localTest(`NI actual N1 helper with synthetic backend ${scenario}`, async t => {
  const { cfg } = await setup(t, scenario, true); const r = safe(await collector(cfg, createManagedPreferencesInvocationPermit(cfg)).run());
  assert.equal(r.state, [2, 9].includes(scenario) ? "helper-failed" : "completed"); assert.equal(r.helperExecutionVerified, true); assert.equal(r.terminationConfirmed, true);
});
for (const mode of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]) localTest(`NI transport fixture ${mode} cannot turn invalid/unfinished output into fields`, async t => {
  const { cfg, parent } = await setup(t, mode); const r = safe(await collector(cfg, createManagedPreferencesInvocationPermit(cfg)).run());
  if (mode === 9) { assert.equal(r.state, "helper-failed"); assert.equal(r.projection.state, "helper-failed"); }
  else assert.notEqual(r.state, "completed");
  if ([1, 2, 8].includes(mode)) assert.ok(["timed-out", "indeterminate"].includes(r.state));
  if (mode === 11) { assert.equal(r.state, "indeterminate"); assert.equal(r.cleanupRequired, true); assert.equal((await fs.readdir(parent)).length, 1); }
  else if (r.terminationConfirmed) assert.deepEqual(await fs.readdir(parent), []);
  if (mode === 10) assert.ok(r.reasons.includes("helper-descendants-unconfirmed"));
});
for (const kind of ["missing", "fake", "serialized", "revoked", "mismatch", "proxy", "expired"]) localTest("NI permission " + kind + " blocks before IO or workspace/spawn", async t => {
  const { cfg, parent } = await setup(t); let token;
  if (["revoked", "mismatch", "serialized", "expired"].includes(kind)) token = createManagedPreferencesInvocationPermit(cfg);
  if (kind === "fake") token = {};
  if (kind === "serialized") token = JSON.parse(JSON.stringify(token));
  if (kind === "revoked") revokeManagedPreferencesInvocationPermit(token);
  if (kind === "mismatch") cfg.limits.totalTimeoutMs++;
  let traps = 0; if (kind === "proxy") token = new Proxy({}, { getPrototypeOf() { traps++; throw Error("private"); } });
  let ioCalls = 0, spawnCalls = 0;
  const deps = { io: { lstat() { ioCalls++; throw Error("private"); } }, spawn() { spawnCalls++; throw Error("private"); } };
  if (kind === "expired") deps.monotonic = () => mono() + 100000;
  const r = safe(await collector(cfg, token, deps).run()); assert.equal(r.state, "blocked"); assert.equal(r.spawnAttempts, 0);
  assert.equal(ioCalls, 0); assert.equal(spawnCalls, 0); assert.equal(traps, 0); assert.deepEqual(await fs.readdir(parent), []);
});
localTest("NI shared permit across two instances is consumed once", async t => {
  const { cfg } = await setup(t), p = createManagedPreferencesInvocationPermit(cfg);
  const results = await Promise.all([collector(cfg, p).run(), collector(cfg, p).run()]);
  assert.equal(results.reduce((n, r) => n + r.spawnAttempts, 0), 1); assert.equal(results.filter(r => r.state === "completed").length, 1); results.forEach(safe);
});
for (const kind of ["sha", "uid", "inode", "mode", "size", "symlink", "hardlink", "parent-inode", "parent-mode", "git"]) localTest("NI identity " + kind + " blocks before spawn", async t => {
  const { cfg, artifact, parent, root } = await setup(t);
  if (kind === "sha") cfg.artifact.sha256 = "f".repeat(64);
  if (kind === "uid") cfg.artifact.uid++;
  if (kind === "inode") cfg.artifact.ino++;
  if (kind === "mode") await fs.chmod(artifact, 0o700);
  if (kind === "size") cfg.artifact.size++;
  if (kind === "symlink") { const link = path.join(root, "alias"); await fs.symlink(artifact, link); cfg.artifact.path = link; }
  if (kind === "hardlink") await fs.link(artifact, path.join(root, "extra-link"));
  if (kind === "parent-inode") cfg.workspaceParent.ino++;
  if (kind === "parent-mode") await fs.chmod(parent, 0o755);
  if (kind === "git") await fs.mkdir(path.join(root, ".git"));
  let calls = 0; const r = safe(await collector(cfg, createManagedPreferencesInvocationPermit(cfg), { spawn() { calls++; throw Error("private"); } }).run());
  assert.equal(r.state, "blocked"); assert.equal(r.spawnAttempts, 0); assert.equal(calls, 0); assert.deepEqual(await fs.readdir(parent), []);
});
localTest("NI post-run artifact change discards output, not a claim that the race was prevented", async t => {
  const { cfg, artifact } = await setup(t); const token = createManagedPreferencesInvocationPermit(cfg);
  const r = safe(await collector(cfg, token, { spawn(file, args, opts) {
    fsSync.chmodSync(artifact, 0o700); fsSync.appendFileSync(artifact, "synthetic-private-tail"); fsSync.chmodSync(artifact, 0o500);
    return spawn(file, args, opts);
  } }).run());
  assert.equal(r.helperStarted, true); assert.equal(r.state, "indeterminate"); assert.equal(r.projection, null); assert.equal(r.artifactMatchedAfter, false);
});
localTest("NI source mismatch cannot be elevated to a native preference observation", async t => {
  const { cfg } = await setup(t); cfg.expectedSource = "core-foundation-claim";
  const r = safe(await collector(cfg, createManagedPreferencesInvocationPermit(cfg)).run()); assert.equal(r.state, "failed"); assert.equal(r.projection, null);
});
localTest("NI configuration and decoder schema are captured before caller mutations", async t => {
  const { cfg } = await setup(t), p = createManagedPreferencesInvocationPermit(cfg), s = structuredClone(preferencesSchema);
  const c = createManagedPreferencesInvocation(schema, s, cfg, p); cfg.artifact.path = "/synthetic-private"; s.$defs.wire.oneOf[0].properties.application.const = "wrong";
  assert.equal(safe(await c.run()).state, "completed");
});
localTest("NI abort before start and during execution never publishes pending fields", async t => {
  const { cfg } = await setup(t, 8); const a = new AbortController(); a.abort();
  const first = safe(await collector(cfg, createManagedPreferencesInvocationPermit(cfg), { signal: a.signal }).run()); assert.equal(first.state, "canceled"); assert.equal(first.spawnAttempts, 0);
  const b = new AbortController(); const second = safe(await collector(cfg, createManagedPreferencesInvocationPermit(cfg), {
    signal: b.signal, spawn(file, args, opts) { const child = spawn(file, args, opts); child.once("spawn", () => b.abort()); return child; }
  }).run()); assert.equal(second.state, "canceled"); assert.equal(second.projection, null); assert.equal(second.terminationConfirmed, true);
});
localTest("NI revocation during execution stops the owned helper", async t => {
  const { cfg } = await setup(t, 8), p = createManagedPreferencesInvocationPermit(cfg);
  const r = safe(await collector(cfg, p, { spawn(file, args, opts) { const child = spawn(file, args, opts); child.once("spawn", () => revokeManagedPreferencesInvocationPermit(p)); return child; } }).run());
  assert.equal(r.state, "canceled"); assert.equal(r.terminationConfirmed, true); assert.equal(r.projection, null);
});
for (const kind of ["sync", "async"]) localTest("NI " + kind + " spawn failure never invents helper execution", async t => {
  const { cfg } = await setup(t); const deps = { spawn: kind === "sync" ? () => { throw Error("synthetic-private"); } : (file, args, opts) => spawn("/synthetic-missing-program", args, opts) };
  const r = safe(await collector(cfg, createManagedPreferencesInvocationPermit(cfg), deps).run()); assert.equal(r.state, "failed"); assert.equal(r.helperStarted, false); assert.equal(r.helperExecutionVerified, false);
});
localTest("NI inability to confirm the group preserves uncertainty and workspace", async t => {
  const { cfg } = await setup(t, 1), abort = new AbortController();
  const r = safe(await collector(cfg, createManagedPreferencesInvocationPermit(cfg), {
    signal: abort.signal, spawn(file, args, options) { const child = spawn(file, args, options); child.once("spawn", () => abort.abort()); return child; },
    kill(pid, signal) {
    if (signal === 0) { const e = Error("synthetic-private"); e.code = "EPERM"; throw e; }
    try { return process.kill(pid, signal); } catch (e) { if (e.code === "ESRCH") return true; throw e; }
  } }).run()); assert.equal(r.state, "indeterminate"); assert.equal(r.terminationConfirmed, false); assert.equal(r.cleanupRequired, true);
  assert.ok(r.elapsedMs < 1300); // Confirmation ends well before the 1500 ms total budget.
});
localTest("NI byte budgets have no unbounded retained stdout/stderr", async t => {
  const { cfg } = await setup(t, 3); cfg.limits.maxOutputBytes = 16;
  const r = safe(await collector(cfg, createManagedPreferencesInvocationPermit(cfg)).run()); assert.equal(r.state, "failed"); assert.equal(r.projection, null);
});
localTest("NI report schema is closed and does not grant any AI client admission", async t => {
  const { cfg } = await setup(t), r = safe(await collector(cfg, createManagedPreferencesInvocationPermit(cfg)).run());
  const ajv = new Ajv2020({ strict: true }); ajv.addSchema(preferencesSchema); ajv.addSchema(schema);
  const valid = ajv.compile({ $ref: `${INVOCATION_SCHEMA_ID}#/$defs/report` }); assert.equal(valid(r), true); r.nativeClientStarted = true; assert.equal(valid(r), false);
});
localTest("NI API rejects config extras, coercion and expanded budgets before IO", async t => {
  const { cfg } = await setup(t);
  for (const mutate of [c => { c.argv = []; }, c => { c.env = { API_KEY: "synthetic-private" }; }, c => { c.limits.totalTimeoutMs = "1500"; }, c => { c.limits.totalTimeoutMs = 15001; }, c => { c.limits.maxOutputBytes = 32769; }, c => { c.limits.graceMs = 1000; c.limits.confirmationMs = 1000; }]) {
    const c = structuredClone(cfg); mutate(c); assert.throws(() => collector(c, {}), /^Error: Invalid managed-preferences invocation configuration$/);
  }
});

function boundaryConfiguration(size = 1) {
  const uid = process.getuid();
  return { expectedSource: "synthetic",
    artifact: { path: "/synthetic-boundary/helper", dev: 0, ino: 1, uid, mode: 0o500, size,
      mtimeMs: 0, ctimeMs: 0, sha256: createHash("sha256").update(Buffer.alloc(size)).digest("hex") },
    workspaceParent: { path: "/synthetic-boundary/workspaces", dev: 0, ino: 2, uid, mode: 0o700 },
    limits: { totalTimeoutMs: 15000, graceMs: 10, confirmationMs: 20, maxOutputBytes: 32768,
      maxErrorBytes: 32768, permitLifetimeMs: 60000 } };
}
function boundaryFiles(cfg, { grow = false, truncate = false, maxChunk = 65536 } = {}) {
  let actualSize = cfg.artifact.size;
  const seen = { requests: [], bytesRead: 0, closed: 0, workspaces: 0, spawns: 0 };
  const stat = file => ({ dev: 0, ino: file ? 1 : 2, uid: process.getuid(), gid: 0,
    mode: file ? 0o500 : 0o700, nlink: 1, size: file ? actualSize : 0, mtimeMs: 0, ctimeMs: 0,
    isFile: () => file, isDirectory: () => !file, isSymbolicLink: () => false });
  const io = {
    async lstat(name) {
      if (name.endsWith("/.git")) { const e = Error("Synthetic absence"); e.code = "ENOENT"; throw e; }
      return stat(name === cfg.artifact.path);
    },
    async open(name) {
      assert.equal(name, cfg.artifact.path);
      return {
        stat: async () => stat(true),
        async read(buffer, offset, length, position) {
          seen.requests.push({ position, length });
          if (truncate && seen.requests.length === 1) actualSize--;
          const bytesRead = Math.max(0, Math.min(length, actualSize - position, maxChunk));
          buffer.fill(0, offset, offset + bytesRead); seen.bytesRead += bytesRead;
          if (grow && seen.bytesRead === cfg.artifact.size) actualSize++;
          return { bytesRead };
        },
        async close() { seen.closed++; }
      };
    },
    async mkdtemp() { seen.workspaces++; throw Error("Synthetic stop after successful pin verification"); }
  };
  return { seen, dependencies: { io, spawn() { seen.spawns++; throw Error("Never start a helper in boundary tests"); } } };
}
localTest("NI regression rejects every explicit run argument before IO and consumes its permit", async () => {
  let traps = 0;
  const hostile = new Proxy({}, { get() { traps++; throw Error("synthetic-private"); }, ownKeys() { traps++; throw Error("synthetic-private"); } });
  for (const input of [{ dryRun: true }, "synthetic-private-request", null, undefined, hostile]) {
    const cfg = boundaryConfiguration(), permit = createManagedPreferencesInvocationPermit(cfg);
    let ioCalls = 0, spawns = 0;
    const deps = { io: { async lstat() { ioCalls++; throw Error("Unexpected IO"); } }, spawn() { spawns++; throw Error("Unexpected spawn"); } };
    const runner = collector(cfg, permit, deps), r = safe(await runner.run(input));
    assert.equal(r.state, "blocked"); assert.ok(r.reasons.includes("helper-input-forbidden"));
    assert.equal(ioCalls, 0); assert.equal(spawns, 0); assert.equal(traps, 0);
    assert.ok(safe(await collector(cfg, permit, deps).run()).reasons.includes("helper-permission-rejected"));
    assert.ok(safe(await runner.run()).reasons.includes("helper-local-check-failed"));
    assert.equal(ioCalls, 0); assert.equal(spawns, 0);
  }
});
localTest("NI regression growth at the 8 MiB cap never reads the added byte", async () => {
  const cfg = boundaryConfiguration(8388608), { seen, dependencies } = boundaryFiles(cfg, { grow: true });
  const r = safe(await collector(cfg, createManagedPreferencesInvocationPermit(cfg), dependencies).run());
  assert.equal(r.state, "blocked"); assert.equal(r.artifactMatchedBefore, false);
  assert.equal(seen.bytesRead, cfg.artifact.size); assert.equal(seen.requests.length, 128);
  assert.ok(seen.requests.every(x => x.position + x.length <= cfg.artifact.size));
  assert.equal(seen.closed, 1); assert.equal(seen.workspaces, 0); assert.equal(seen.spawns, 0);
});
localTest("NI regression stable exact cap verifies without a sentinel EOF read", async () => {
  const cfg = boundaryConfiguration(8388608), { seen, dependencies } = boundaryFiles(cfg);
  const r = safe(await collector(cfg, createManagedPreferencesInvocationPermit(cfg), dependencies).run());
  // Stop deliberately at mocked workspace creation; only the pre-pin is tested.
  assert.equal(r.state, "blocked"); assert.equal(r.artifactMatchedBefore, true);
  assert.equal(seen.bytesRead, cfg.artifact.size); assert.equal(seen.requests.length, 128);
  assert.ok(seen.requests.every(x => x.position + x.length <= cfg.artifact.size));
  assert.equal(seen.closed, 1); assert.equal(seen.workspaces, 1); assert.equal(seen.spawns, 0);
});
localTest("NI regression partial reads stay within the remaining pinned size", async () => {
  const cfg = boundaryConfiguration(4097), { seen, dependencies } = boundaryFiles(cfg, { maxChunk: 17 });
  const r = safe(await collector(cfg, createManagedPreferencesInvocationPermit(cfg), dependencies).run());
  assert.equal(r.artifactMatchedBefore, true); assert.equal(seen.bytesRead, cfg.artifact.size);
  assert.ok(seen.requests.every(x => x.position < cfg.artifact.size && x.position + x.length <= cfg.artifact.size));
  assert.equal(seen.closed, 1); assert.equal(seen.workspaces, 1); assert.equal(seen.spawns, 0);
});
localTest("NI regression truncation before pinned size blocks and closes the descriptor", async () => {
  const cfg = boundaryConfiguration(4097), { seen, dependencies } = boundaryFiles(cfg, { truncate: true, maxChunk: 17 });
  const r = safe(await collector(cfg, createManagedPreferencesInvocationPermit(cfg), dependencies).run());
  assert.equal(r.state, "blocked"); assert.equal(r.artifactMatchedBefore, false);
  assert.equal(seen.bytesRead, cfg.artifact.size - 1);
  assert.ok(seen.requests.every(x => x.position + x.length <= cfg.artifact.size));
  assert.equal(seen.closed, 1); assert.equal(seen.workspaces, 0); assert.equal(seen.spawns, 0);
});
