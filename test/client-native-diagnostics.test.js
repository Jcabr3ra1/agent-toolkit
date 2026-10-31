import { supported } from "../testing/client-posix.js";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import { createNativeDiagnostics, createDiagnosticPermit, revokeDiagnosticPermit, extractDiagnosticMetadata } from "../src/client-native-diagnostics.js";
import { createSupervisedPermit } from "../src/client-supervised-permit.js";

const schema = JSON.parse(await fs.readFile(new URL("../schemas/agent-client-native-diagnostics.schema.json", import.meta.url), "utf8"));
const options = schema.$defs.observation.properties.optionsPresent.items.enum;
const program = fileURLToPath(new URL("../testing/native-diagnostics/fixture.cjs", import.meta.url));
const localTest = (name, fn) => test(name, { skip: supported ? false : "Requires a POSIX synthetic client fixture with ownership and process-group isolation; this is not Windows native-client admission.", timeout: 20000 }, fn);
// Declarations only: these paths and pins do not name an installed executable.
function inertConfiguration() {
  const workspaceParent = path.resolve("synthetic-diagnostic-boundary");
  return { candidate: { entryPath: path.join(workspaceParent, "entry"), artifactPath: path.join(workspaceParent, "artifact"),
    expectedSha256: "a".repeat(64), expectedUid: 1000, expectedMode: 0o755, expectedSize: 1,
    expectedDev: 1, expectedIno: 2, expectedLinkIno: 3 }, workspaceParent,
    limits: { maxStarts: 2, processTimeoutMs: 1500, totalTimeoutMs: 6000, graceMs: 150,
      confirmationMs: 300, maxStdoutBytes: 131072, maxStderrBytes: 32768 } };
}
function deniedEffects() {
  const calls = [];
  const deny = name => () => { calls.push(name); throw Error("Unexpected boundary effect: " + name); };
  return { calls, dependencies: { monotonic: () => 0, spawn: deny("spawn"), kill: deny("kill"),
    io: Object.fromEntries(Object.keys(fs).filter(name => typeof fs[name] === "function").map(name => [name, deny("io." + name)])) } };
}
function blockedBeforeEffects(result, reason, effects) {
  const r = checked(result);
  assert.equal(r.report.state, "blocked");
  assert.deepEqual(r.report.reasons, [reason]);
  assert.equal(r.report.spawnAttempts, 0); assert.equal(r.report.startsObserved, 0);
  assert.equal(r.report.nativeExecuted, false); assert.deepEqual(r.report.operations, []);
  assert.deepEqual(r.observation, { declaredVersion: null, optionsPresent: [] });
  assert.deepEqual(effects.calls, []);
}
async function setup(t) {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "agent-diagnostic-test-")));
  await fs.chmod(root, 0o700); const owned = await fs.lstat(root);
  t.after(async () => {
    const s = await fs.lstat(root).catch(() => null);
    if (s?.dev === owned.dev && s?.ino === owned.ino && s.isDirectory() && !s.isSymbolicLink()) await fs.rm(root, { recursive: true });
  });
  const artifactPath = path.join(root, "synthetic-candidate"), entryPath = path.join(root, "synthetic-link");
  const bytes = Buffer.from("synthetic artifact, not a native AI client");
  await fs.writeFile(artifactPath, bytes, { mode: 0o755 }); await fs.symlink(artifactPath, entryPath);
  const a = await fs.lstat(artifactPath), e = await fs.lstat(entryPath);
  return { candidate: { entryPath, artifactPath, expectedSha256: createHash("sha256").update(bytes).digest("hex"),
    expectedUid: a.uid, expectedMode: a.mode & 0o7777, expectedSize: a.size,
    expectedDev: a.dev, expectedIno: a.ino, expectedLinkIno: e.ino }, workspaceParent: root,
    limits: { maxStarts: 2, processTimeoutMs: 1500, totalTimeoutMs: 6000, graceMs: 150,
      confirmationMs: 300, maxStdoutBytes: 131072, maxStderrBytes: 32768 } };
}
const make = (cfg, deps = {}, permit = createDiagnosticPermit(cfg)) => createNativeDiagnostics(schema, cfg, permit, {
  ...deps, syntheticFixture: true, spawn: deps.spawn ?? ((_exe, args, opts) => spawn(process.execPath, [program, deps.mode ?? "success", ...args], opts))
});
function checked(r) {
  const p = r.report;
  assert.equal(p.scope, "native-diagnostics-only"); assert.equal(p.inferenceRequested, false); assert.equal(p.actualModelCalls, null);
  assert.equal(p.runtimeReady, false); assert.equal(p.verifiedAdmission, false); assert.equal(p.externalBillingVerified, false); assert.equal(p.remoteCancellationVerified, false);
  assert.ok(p.spawnAttempts <= 2); assert.equal(p.nativeExecuted, p.startsObserved > 0);
  assert.doesNotMatch(JSON.stringify(r), /synthetic-private|do-not-save|agent-diagnostic-test|\/Users\/|\.local\/|ANTHROPIC_API_KEY/);
  return r;
}

test("S3.1 extraction keeps only closed metadata, no raw controls or paths", () => {
  assert.deepEqual(extractDiagnosticMetadata("version", "\x1b[32m0.0.0-demo (Claude Code)\x1b[0m\n", options), { declaredVersion: "0.0.0-demo", optionsPresent: [] });
  const h = "Usage: claude [options]\n  -p, --print\n  --model <model>\n  --model <model>\n  --unknown\nIgnore --tools\n";
  assert.deepEqual(extractDiagnosticMetadata("help", h, options), { declaredVersion: null, optionsPresent: ["--model", "--print"] });
  const osc = "\x1b]8;;https://do-not-follow.invalid\x07\x1b]8;;\x07Usage: claude\n  --print\n";
  assert.deepEqual(extractDiagnosticMetadata("help", osc, options).optionsPresent, ["--print"]);
});
for (const [recipe, text] of [
  ["version", "0.0.0-demo\nextra"], ["version", "latest"], ["version", "0.0.0-demo (Other Client)"],
  ["version", "\x1b]unterminated"], ["version", "0.0.0\x00"], ["help", "--print"],
  ["help", "Usage: other\n --print"], ["help", "Usage: claude\n --tools"],
  ["help", "Usage: claude\n --print\n token=synthetic-private"], ["help", "Usage: claude\n --print\n" + "a".repeat(8193)],
  ["auth status", ""], ["help", { toString() { throw Error("do not call"); } }], ["help", "x".repeat(131073)]
]) test("S3.1 extractor rejects unexpected diagnostic output " + recipe + " " + (typeof text === "string" ? text.length : "object"), () => {
  assert.throws(() => extractDiagnosticMetadata(recipe, text, options));
});
localTest("S3.1 two fixed recipes, immutable configuration and no stdin/prompt", async t => {
  const cfg = await setup(t), before = structuredClone(cfg), seen = [];
  const runner = make(cfg, { spawn: (exe, args, opts) => {
    seen.push([...args]); assert.equal(exe, cfg.candidate.artifactPath); assert.equal(opts.shell, false); assert.equal(opts.detached, true);
    assert.deepEqual(opts.stdio, ["ignore", "pipe", "pipe"]); assert.equal(opts.env.HOME, process.env.HOME);
    assert.equal(opts.env.PATH, "/usr/bin:/bin:/usr/sbin:/sbin"); assert.equal(opts.env.ANTHROPIC_API_KEY, undefined);
    return spawn(process.execPath, [program, "success", ...args], opts);
  } });
  const r = checked(await runner.run()); assert.equal(r.report.state, "completed", JSON.stringify(r));
  assert.deepEqual(seen, [["--version"], ["--help"]]); assert.equal(r.report.startsObserved, 2);
  assert.equal(r.observation.declaredVersion, "0.0.0-demo"); assert.ok(r.observation.optionsPresent.includes("--tools"));
  assert.deepEqual(cfg, before); assert.equal((await runner.run()).report.state, "blocked");
  assert.deepEqual(await fs.readdir(cfg.workspaceParent), ["synthetic-candidate", "synthetic-link"]);
});
for (const mode of ["split-utf8", "environment"]) localTest("S3.1 synthetic client " + mode, async t => {
  const cfg = await setup(t), r = checked(await make(cfg, { mode }).run()); assert.equal(r.report.state, "completed", JSON.stringify(r));
});
for (const [mode, why] of [
  ["failure", "diagnostic-exit-failed"], ["invalid-utf8", "diagnostic-invalid-utf8"], ["truncated-utf8", "diagnostic-invalid-utf8"],
  ["stderr-invalid", "diagnostic-invalid-utf8"], ["stdout-overflow", "diagnostic-output-limit"], ["stderr-overflow", "diagnostic-stderr-limit"],
  ["junk", "diagnostic-output-unexpected"], ["silent", "diagnostic-deadline"], ["ignore-term", "diagnostic-deadline"]
]) localTest("S3.1 stops without help/retry on " + mode, async t => {
  const cfg = await setup(t); const r = checked(await make(cfg, { mode }).run());
  assert.notEqual(r.report.state, "completed"); assert.equal(r.report.spawnAttempts, 1); assert.equal(r.report.operations.length, 1);
  assert.ok(r.report.reasons.includes(why), JSON.stringify(r)); assert.equal(r.report.operations[0].terminationConfirmed, true);
});
for (const [name, mutate] of [
  ["sha", cfg => { cfg.candidate.expectedSha256 = "a".repeat(64); }], ["mode", cfg => { cfg.candidate.expectedMode = 0o777; }],
  ["inode", cfg => { cfg.candidate.expectedIno++; }], ["link inode", cfg => { cfg.candidate.expectedLinkIno++; }],
  ["uid", cfg => { cfg.candidate.expectedUid++; }], ["size", cfg => { cfg.candidate.expectedSize++; }]
]) localTest("S3.1 rejects changed candidate " + name + " before spawn", async t => {
  const cfg = await setup(t); mutate(cfg); let n = 0;
  const r = checked(await make(cfg, { spawn: () => { n++; throw Error("do not run"); } }).run());
  assert.equal(r.report.state, "blocked"); assert.equal(n, 0); assert.equal(r.report.nativeExecuted, false);
});
localTest("S3.1 artifact changed after version prevents help and clears admission", async t => {
  const cfg = await setup(t); let starts = 0;
  const r = checked(await make(cfg, { spawn: (_exe, args, opts) => {
    starts++; const p = spawn(process.execPath, [program, "success", ...args], opts);
    p.on("exit", () => { /* Replace only this synthetic test artefact. */ });
    const original = p.emit.bind(p);
    p.emit = (event, ...a) => { if (event === "close") fs.writeFile(cfg.candidate.artifactPath, "changed").then(() => original(event, ...a)); else return original(event, ...a); };
    return p;
  } }).run());
  assert.equal(starts, 1); assert.equal(r.report.state, "failed"); assert.ok(r.report.reasons.includes("diagnostic-artifact-changed"));
  assert.equal(r.observation.declaredVersion, null);
});
localTest("S3.1 artifact, entry and parent adversaries are rejected", async t => {
  for (const mutate of [
    cfg => fs.chmod(cfg.workspaceParent, 0o755), cfg => fs.mkdir(path.join(cfg.workspaceParent, ".git")),
    cfg => fs.link(cfg.candidate.artifactPath, path.join(cfg.workspaceParent, "hardlink")),
    async cfg => { await fs.unlink(cfg.candidate.entryPath); await fs.symlink("other", cfg.candidate.entryPath); },
    async cfg => { await fs.rename(cfg.candidate.artifactPath, cfg.candidate.artifactPath + "-original"); await fs.symlink(cfg.candidate.artifactPath + "-original", cfg.candidate.artifactPath); }
  ]) {
    const cfg = await setup(t); await mutate(cfg); let n = 0;
    const r = checked(await make(cfg, { spawn: () => { n++; throw Error("no"); } }).run()); assert.equal(r.report.state, "blocked"); assert.equal(n, 0);
  }
});
test("S3.1 fake/serialized/S2/revoked/binding-mismatched permits cannot run", async () => {
  const cfg = inertConfiguration(), effects = deniedEffects();
  const revoked = createDiagnosticPermit(cfg); revokeDiagnosticPermit(revoked);
  const foreign = createDiagnosticPermit({ ...cfg, workspaceParent: cfg.workspaceParent + "-other" });
  let hooks = 0;
  const proxy = new Proxy({}, { get() { hooks++; throw Error("no hook"); }, getPrototypeOf() { hooks++; throw Error("no hook"); } });
  for (const h of [null, {}, JSON.parse(JSON.stringify(createDiagnosticPermit(cfg))), revoked, foreign, proxy,
    createSupervisedPermit("x", async () => { hooks++; }, async () => { hooks++; })]) {
    blockedBeforeEffects(await make(cfg, effects.dependencies, h).run(), "diagnostic-permit-unavailable", effects);
  }
  assert.equal(hooks, 0);
});
localTest("S3.1 one permit shared by two instances starts at most one two-step lot", async t => {
  const cfg = await setup(t), permit = createDiagnosticPermit(cfg);
  const both = await Promise.all([make(cfg, {}, permit).run(), make(cfg, {}, permit).run()]);
  assert.equal(both.filter(r => r.report.state === "completed").length, 1);
  assert.equal(both.reduce((n, r) => n + r.report.spawnAttempts, 0), 2);
});
test("S3.1 no request JSON, arbitrary recipe or prompt accepted", async () => {
  const cfg = inertConfiguration(), effects = deniedEffects();
  for (const input of [{ prompt: "x" }, { command: "auth status" }, "--help", undefined]) {
    blockedBeforeEffects(await make(cfg, effects.dependencies).run(input), "diagnostic-input-forbidden", effects);
  }
});
localTest("S3.1 cancel before process consumes permit without starting", async t => {
  const cfg = await setup(t), abort = new AbortController(); abort.abort(); const permit = createDiagnosticPermit(cfg);
  const r = checked(await make(cfg, { signal: abort.signal }, permit).run()); assert.equal(r.report.spawnAttempts, 0);
  assert.equal((await make(cfg, {}, permit).run()).report.state, "blocked");
});
localTest("S3.1 abort inside process stops the group without running help", async t => {
  const cfg = await setup(t), abort = new AbortController();
  const r = checked(await make(cfg, { signal: abort.signal, spawn: (_exe, args, opts) => {
    const p = spawn(process.execPath, [program, "silent", ...args], opts); p.on("spawn", () => setTimeout(() => abort.abort(), 40)); return p;
  } }).run()); assert.equal(r.report.state, "canceled"); assert.equal(r.report.spawnAttempts, 1);
  assert.equal(r.report.operations[0].terminationConfirmed, true);
});
localTest("S3.1 spawn errors are controlled and not reported as native starts", async t => {
  for (const fn of [() => { throw Error("synthetic-private-error"); }, (_e, a, o) => spawn("/synthetic-diagnostic-missing-executable", a, o)]) {
    const cfg = await setup(t); const r = checked(await make(cfg, { spawn: fn }).run());
    assert.equal(r.report.spawnAttempts, 1); assert.equal(r.report.startsObserved, 0); assert.equal(r.report.nativeExecuted, false); assert.equal(r.report.state, "failed");
  }
});
localTest("S3.1 controller makes no network calls and fixture inherits no keys", async t => {
  const cfg = await setup(t); let calls = 0; const saved = [http.request, http.get, https.request, https.get, net.connect, net.createConnection, globalThis.fetch];
  const deny = () => { calls++; throw Error("network"); };
  http.request = http.get = https.request = https.get = net.connect = net.createConnection = globalThis.fetch = deny;
  try { assert.equal(checked(await make(cfg, { mode: "environment" }).run()).report.state, "completed"); assert.equal(calls, 0); }
  finally { [http.request, http.get, https.request, https.get, net.connect, net.createConnection, globalThis.fetch] = saved; }
});
test("S3.1 configuration/schema invalidity never starts a candidate", () => {
  const cfg = inertConfiguration(), effects = deniedEffects(); let hooks = 0;
  for (const mutate of [q => { q.candidate.artifactPath = "relative"; }, q => { q.command = "claude"; },
    q => { q.limits.maxStarts = 3; }, q => { q.limits.processTimeoutMs = "15000"; }, q => { q.limits.graceMs = q.limits.processTimeoutMs; }]) {
    const q = structuredClone(cfg); mutate(q);
    assert.throws(() => make(q, effects.dependencies, {}), { message: "Invalid diagnostic configuration" });
  }
  const getter = Object.defineProperty(structuredClone(cfg), "extra", { enumerable: true, get() { hooks++; throw Error("do not call"); } });
  assert.throws(() => make(getter, effects.dependencies, {}), { code: "non-json-metadata" });
  assert.throws(() => createNativeDiagnostics({ ...schema, $id: "other" }, cfg, {}, effects.dependencies), { message: "Unsupported diagnostic schema" });
  assert.equal(hooks, 0); assert.deepEqual(effects.calls, []);
});
test("S3.1 malformed input consumes its approved lot, not a retry", async () => {
  const cfg = inertConfiguration(), permit = createDiagnosticPermit(cfg), effects = deniedEffects();
  blockedBeforeEffects(await make(cfg, effects.dependencies, permit).run({ prompt: "forbidden" }), "diagnostic-input-forbidden", effects);
  blockedBeforeEffects(await make(cfg, effects.dependencies, permit).run(), "diagnostic-permit-unavailable", effects);
});
localTest("S3.1 exact stdout bytes accepted and one fewer blocks", async t => {
  const version = Buffer.byteLength("0.0.0-demo (Claude Code)\n");
  for (const n of [version, version - 1]) {
    const cfg = await setup(t); cfg.limits.maxStdoutBytes = n;
    const r = checked(await make(cfg).run());
    assert.equal(r.report.spawnAttempts, n === version ? 2 : 1);
    assert.ok(r.report.reasons.includes("diagnostic-output-limit"));
    assert.equal(r.observation.declaredVersion, n === version ? "0.0.0-demo" : null);
  }
});
localTest("S3.1 artifact read race/deadline stop before native start", async t => {
  const cfg = await setup(t);
  const r = checked(await make(cfg, { io: { open: async (...a) => {
    const h = await fs.open(...a); const stat = h.stat.bind(h); let n = 0;
    h.stat = async () => { const s = await stat(); if (++n === 2) s.mtimeMs++; return s; }; return h;
  } } }).run()); assert.equal(r.report.nativeExecuted, false); assert.ok(r.report.reasons.includes("diagnostic-artifact-changed"));
  const cfg2 = await setup(t); let ticks = 0;
  const r2 = checked(await make(cfg2, { monotonic: () => (++ticks) * 10000 }).run());
  assert.equal(r2.report.nativeExecuted, false); assert.ok(r2.report.reasons.includes("diagnostic-deadline"));
});
localTest("S3.1 parent identity replacement and failed cleanup preserve unknown files", async t => {
  const cfg = await setup(t); const r = checked(await make(cfg, { io: { rmdir: async () => { throw Error("synthetic-private-error"); } } }).run());
  assert.equal(r.report.state, "indeterminate"); assert.ok(r.report.reasons.includes("diagnostic-workspace-cleanup-required"));
  assert.ok((await fs.readdir(cfg.workspaceParent)).some(n => n.startsWith("diagnostic-work-")));
});
localTest("S3.1 unconfirmed group remains uncertain, never runs help", async t => {
  const cfg = await setup(t); cfg.limits.processTimeoutMs = 600; cfg.limits.graceMs = 100; cfg.limits.confirmationMs = 150;
  const r = checked(await make(cfg, { kill: () => { const e = Error("unconfirmed"); e.code = "EPERM"; throw e; } }).run());
  // The success fixture exits itself; the spy only denies observation, leaving
  // no hanging child. Its workspace is retained until the test harness cleanup.
  assert.equal(r.report.state, "indeterminate"); assert.equal(r.report.spawnAttempts, 1);
  assert.equal(r.report.operations[0].terminationConfirmed, false);
});
localTest("S3.1 revocation between version and help forbids the second process", async t => {
  const cfg = await setup(t), permit = createDiagnosticPermit(cfg);
  const r = checked(await make(cfg, { spawn: (_exe, args, opts) => {
    const p = spawn(process.execPath, [program, "success", ...args], opts); p.on("exit", () => revokeDiagnosticPermit(permit)); return p;
  } }, permit).run()); assert.equal(r.report.spawnAttempts, 1); assert.equal(r.report.state, "failed");
  assert.ok(r.report.reasons.includes("diagnostic-canceled"));
});
