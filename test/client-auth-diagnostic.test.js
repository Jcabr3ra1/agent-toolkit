import { compiler, sdkArguments, supported } from "../testing/client-posix.js";
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawn, execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { EventEmitter } from "node:events";
import Ajv2020 from "ajv/dist/2020.js";
import { createAuthDiagnosticParser, AUTH_DIAGNOSTIC_ID } from "../src/client-auth-diagnostic-parser.js";
import { createAuthDiagnosticCollector, createAuthDiagnosticPermit, revokeAuthDiagnosticPermit, authDiagnosticReviewBinding } from "../src/client-auth-diagnostic.js";
import { createManagedPreferencesInvocationPermit } from "../src/client-managed-preferences-invocation.js";
import { createDiagnosticPermit } from "../src/client-native-diagnostics.js";
import { createNativeAccessPermit } from "../src/client-native-access.js";
import { createSupervisedPermit } from "../src/client-supervised-permit.js";
import { createFixturePermit } from "../src/client-runtime-fixture-permit.js";
import { createSelectiveReadPermit } from "../src/client-selective-files.js";

const schema = JSON.parse(await fs.readFile(new URL("../schemas/agent-client-auth-diagnostic.schema.json", import.meta.url), "utf8"));
const fixture = fileURLToPath(new URL("../testing/auth-diagnostic/fixture.c", import.meta.url));
const defaultLimits = { maxBytes: 32768, blockBytes: 32768, maxDepth: 32, maxNodes: 20000, maxKeyBytes: 256, maxKeys: 4096 };
const mono = () => Number(process.hrtime.bigint() / 1000000n);
const wire = { loggedIn: true, authMethod: "claude.ai", subscriptionType: "pro" };
const parser = limits => createAuthDiagnosticParser(schema, { ...defaultLimits, ...limits });
function parse(text, exit = 0, limits) { const p = parser(limits); p.push(Buffer.isBuffer(text) ? text : Buffer.from(text)); return p.finish(exit); }
function safeParser(r) {
  assert.equal(r.nativeExecuted, false); assert.equal(r.inferenceRequested, false); assert.equal(r.runtimeReady, false);
  assert.equal(r.verifiedAdmission, false); assert.equal(r.externalBillingVerified, false);
  assert.equal(r.stats.retainedRawBytes, 0); assert.equal(r.stats.retainedUnselectedValueTextBytes, 0);
  assert.ok(r.stats.retainedApprovedScalarCount <= 3);
  if (r.state !== "observed") assert.equal(r.projection, null);
  assert.doesNotMatch(JSON.stringify(r), /synthetic-private|configDirectory|email|organization|\/Users\//); return r;
}

for (const loggedIn of [false, true]) for (const authMethod of ["none", "claude.ai", "oauth_token", "api_key", "api_key_helper", "third_party"])
  for (const subscriptionType of [null, "pro", "max", "team", "enterprise", "free"]) test(`AD parser observed ${loggedIn}/${authMethod}/${subscriptionType}`, () => {
    const r = safeParser(parse(JSON.stringify({ loggedIn, authMethod, subscriptionType }), loggedIn ? 0 : 1));
    assert.equal(r.state, "observed"); assert.equal(r.projection.loggedIn, loggedIn); assert.equal(r.projection.authMethod, authMethod);
    const expected = !loggedIn ? "signed-out" : ["oauth_token", "api_key", "api_key_helper", "third_party"].includes(authMethod) || subscriptionType === "free" ? "incompatible" :
      authMethod === "claude.ai" && ["pro", "max", "team", "enterprise"].includes(subscriptionType) ? "compatible-declared" : "unresolved";
    assert.equal(r.projection.classification, expected);
  });
test("AD parser missing category remains null; only top-level approved names select", () => {
  const r = safeParser(parse(JSON.stringify({ loggedIn: true, authMethod: "claude.ai", unknown: { subscriptionType: "pro", loggedIn: "secret" } })));
  assert.equal(r.state, "observed"); assert.equal(r.projection.subscriptionType, null); assert.equal(r.projection.classification, "unresolved");
});
for (const exit of [null, -1, 1, 2, "0"]) test("AD parser true login rejects exit " + exit, () => assert.equal(safeParser(parse(JSON.stringify(wire), exit)).reason, "auth-exit-mismatch"));
test("AD parser false login rejects exit zero", () => assert.equal(parse('{"loggedIn":false,"authMethod":"none"}').reason, "auth-exit-mismatch"));
for (const [name, value] of [["loggedIn", "true"], ["loggedIn", null], ["loggedIn", 1], ["authMethod", null], ["authMethod", {}], ["authMethod", "new-method"], ["subscriptionType", true], ["subscriptionType", []], ["subscriptionType", "PRO"]])
  test(`AD parser selected type/enum ${name}/${JSON.stringify(value)}`, () => {
    const r = safeParser(parse(JSON.stringify({ ...wire, [name]: value })));
    assert.equal(r.state, "invalid"); assert.ok(["auth-invalid-type", "auth-invalid-enum"].includes(r.reason));
  });
for (const body of [{}, { loggedIn: true }, { authMethod: "none" }]) test("AD parser required fields " + JSON.stringify(body), () => assert.equal(parse(JSON.stringify(body)).reason, "auth-required-field"));
test("AD parser all byte boundaries, empty chunks and escaped selected names", () => {
  const text = '{"logg\\u0065dIn":true,"authMethod":"claude\\u002eai","subscriptionType":"pro","email":"synthetic-private😀ñ","unknown":{"array":[null,true,false,-0,1.23e-5,{},[]],"configDirectory":"/synthetic-private","__proto__":{"a":1}}}';
  const bytes = Buffer.from(text), expected = parse(text);
  assert.equal(expected.state, "observed");
  for (let n = 0; n <= bytes.length; n++) {
    const p = parser(); assert.equal(safeParser(p.push(bytes.subarray(0, n))).projection, null);
    p.push(Buffer.alloc(0)); p.push(bytes.subarray(n)); assert.deepEqual(safeParser(p.finish(0)), expected);
  }
  const p = parser(); for (const b of bytes) assert.equal(p.push(Buffer.from([b])).projection, null); assert.deepEqual(p.finish(0), expected);
});
test("AD parser long ignored values do not become strings/objects in projection", () => {
  const p = parser(); p.push(Buffer.from('{"email":"'));
  for (let i = 0; i < 20; i++) { const r = safeParser(p.push(Buffer.from("synthetic-private".repeat(50)))); assert.equal(r.stats.retainedApprovedScalarCount, 0); }
  p.push(Buffer.from('","loggedIn":true,"authMethod":"claude.ai","subscriptionType":"pro"}'));
  const r = safeParser(p.finish(0)); assert.deepEqual(r.projection, { ...wire, classification: "compatible-declared" });
  // Structural audit complements the accounting counters; no payload JSON.parse/text accumulator.
  const source = fsSync.readFileSync(new URL("../src/client-auth-diagnostic-parser.js", import.meta.url), "utf8");
  assert.doesNotMatch(source, /JSON\.parse|TextDecoder|\.toString\(|\.concat\(|valueText\s*\+=/);
});
const malformed = ["", "[]", "null", "true", "{", '{"x":}', '{"x" 1}', '{"x":01}', '{"x":1.}', '{"x":1e}', '{"x":1e+}', '{"x":-}', '{"x":tru}', '{"x":truex}', '{"x":NaN}', '{"x":Infinity}', '{"x":[] ,}', '{"x":[1,]}', '{"x":[,1]}', '{"x":"\\q"}', '{"x":"\\uZZZZ"}', '{"x":"\\ud800"}', '{"x":"\\udc00"}', '{"x":"\\ud800\\u0000"}', '{"x":"\\ud800a"}', '{"x":"\n"}', '{}{}', '{} garbage', '{"x":1,"x":2}', '{"x":1,"\\u0078":2}', '{"nested":{"x":1,"x":2}}'];
for (const [i, text] of malformed.entries()) test("AD parser rejects malformed/duplicate ignored JSON " + i, () => {
  const p = parser(); for (const b of Buffer.from(text)) p.push(Buffer.from([b])); assert.equal(safeParser(p.finish(0)).state, "invalid");
});
for (const [i, sequence] of [[0xc0, 0x80], [0xed, 0xa0, 0x80], [0xf4, 0x90, 0x80, 0x80], [0xe2], [0xff], [0x80], [0xe2, 0x28, 0xa1]].entries()) test("AD parser rejects invalid UTF8 " + i, () => {
  const bytes = Buffer.concat([Buffer.from('{"x":"'), Buffer.from(sequence), Buffer.from('","loggedIn":true,"authMethod":"none"}')]);
  assert.equal(safeParser(parse(bytes)).state, "invalid");
});
test("AD parser accepts skipped numeric grammar without coercing/retaining its value", () => {
  for (const token of ["-0", "0", "1", "-12.345", "1E+9", "1e-9999", "9999999999999999999999999", "1e9999"])
    assert.equal(parse('{"loggedIn":true,"authMethod":"none","discarded":' + token + '}').state, "observed");
});
for (const [overrides, text, reason] of [
  [{ maxBytes: 5, blockBytes: 5 }, "      ", "auth-byte-limit"],
  [{ maxDepth: 1 }, '{"x":{}}', "auth-depth-limit"], [{ maxNodes: 1 }, '{"x":0}', "auth-node-limit"],
  [{ maxKeyBytes: 1 }, '{"xx":0}', "auth-key-bytes-limit"], [{ maxKeys: 1 }, '{"x":0,"y":0}', "auth-key-limit"]])
  test("AD parser bounded " + reason, () => { const p = parser(overrides); for (const b of Buffer.from(text)) p.push(Buffer.from([b])); assert.equal(safeParser(p.finish(0)).reason, reason); });
test("AD parser chunk cap, proxies, subclasses and text are rejected without invoking hooks", () => {
  let traps = 0; const proxy = new Proxy(Buffer.from("{}"), { getPrototypeOf() { traps++; throw Error("private"); } });
  class Bytes extends Uint8Array {}
  for (const input of ["{}", proxy, new Bytes(2), Buffer.alloc(32769), { toString() { traps++; throw Error("private"); } }]) {
    const p = parser(); assert.equal(safeParser(p.push(input)).state, "invalid"); assert.equal(p.finish(0).projection, null);
  }
  assert.equal(traps, 0);
});
test("AD parser closure/abort cannot revive a projection", () => {
  const p = parser(); p.push(Buffer.from(JSON.stringify(wire))); assert.equal(p.finish(0).state, "observed");
  assert.equal(p.push(Buffer.alloc(0)).reason, "auth-closed"); assert.equal(p.finish(0).projection, null);
  const a = parser(); a.push(Buffer.from(JSON.stringify(wire))); a.abort(); assert.equal(a.finish(0).reason, "auth-aborted");
});
test("AD deterministic synthetic JSON corpus validates ignored structure at every depth", () => {
  for (let i = 0; i < 40; i++) {
    let discarded = { emoji: "😀ñ", escape: "\t\n\"\\", values: [i / 7, true, false, null, -i], empty: {} };
    for (let depth = 0; depth < i % 10; depth++) discarded = depth % 2 ? [discarded] : { child: discarded };
    const r = safeParser(parse(JSON.stringify({ ...wire, discarded })));
    assert.equal(r.state, "observed"); assert.deepEqual(r.projection, { ...wire, classification: "compatible-declared" });
  }
});
test("AD inert schema/limits reject getters/proxies/toJSON without side effects", () => {
  let traps = 0; const getter = { get maxBytes() { traps++; throw Error("private"); } }, proxy = new Proxy(schema, { ownKeys() { traps++; throw Error("private"); } });
  assert.throws(() => createAuthDiagnosticParser(schema, getter)); assert.throws(() => createAuthDiagnosticParser(proxy));
  assert.throws(() => parser({ maxBytes: "32768" })); assert.throws(() => parser({ maxBytes: 32769 })); assert.throws(() => parser({ blockBytes: 32769 }));
  assert.equal(traps, 0);
});

const localTest = (name, fn) => test(name, { skip: supported ? false : "Requires POSIX ownership/modes, compiler and process-group isolation for the synthetic auth fixture.", timeout: 20000 }, fn);
// Native synthetic integration is not a startup-latency benchmark. Keep budget
// validation independent, and exercise exact deadline boundaries virtually.
const INTEGRATION_TIMING = Object.freeze({ processTimeoutMs: 3000, totalTimeoutMs: 5000, graceMs: 100, confirmationMs: 120 });
const VALIDATION_TIMING = Object.freeze({ processTimeoutMs: 800, totalTimeoutMs: 2500, graceMs: 100, confirmationMs: 120 });
function reviews(cfg) { const bindingSha256 = authDiagnosticReviewBinding(cfg); cfg.identityReview.bindingSha256 = bindingSha256; cfg.startupReview.bindingSha256 = bindingSha256; return cfg; }
function declarationConfiguration() {
  // Fictitious inert stat pins for pre-host validation, never installation evidence.
  const root = path.resolve("synthetic-auth-declaration"), uid = 1000;
  const pin = name => ({ path: path.join(root, name), dev: 1, ino: name === "artifact" ? 3 : 4, uid, mode: name === "artifact" ? 0o500 : 0o777, size: 1, mtimeMs: 1, ctimeMs: 1 });
  return reviews({ source: "synthetic-fixture", recipe: "auth-status-v1", version: "fictitious-declaration",
    artifact: { ...pin("artifact"), sha256: "a".repeat(64) }, entryLink: pin("entry"),
    workspaceParent: { path: path.join(root, "workspaces"), dev: 1, ino: 2, uid, mode: 0o700 }, excludedRoots: [path.join(root, "excluded")],
    identityReview: { state: "reviewed", bindingSha256: "0".repeat(64), evidenceSha256: "1".repeat(64) },
    startupReview: { state: "reviewed", bindingSha256: "0".repeat(64), evidenceSha256: "2".repeat(64), effectsEnumerated: true, unresolvedEffects: false },
    limits: { ...VALIDATION_TIMING, maxOutputBytes: 32768, maxErrorBytes: 32768, permitLifetimeMs: 60000 } });
}
function forbiddenEffects() {
  const counts = { io: 0, spawn: 0 };
  const io = Object.fromEntries(Object.keys(fs).map(key => [key, () => { counts.io++; throw Error("unexpected IO"); }]));
  return { counts, deps: { io, spawn() { counts.spawn++; throw Error("unexpected spawn"); } } };
}
async function setup(t, mode = 0, timing = INTEGRATION_TIMING) {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "agent-auth-fixture-"))); await fs.chmod(root, 0o700);
  const owned = await fs.lstat(root);
  t.after(async () => { const s = await fs.lstat(root).catch(() => null); if (s?.isDirectory() && !s.isSymbolicLink() && s.dev === owned.dev && s.ino === owned.ino) await fs.rm(root, { recursive: true }); });
  const artifact = path.join(root, "fictitious-artifact"), entry = path.join(root, "fictitious-entry"), parent = path.join(root, "workspaces"); await fs.mkdir(parent, { mode: 0o700 });
  await new Promise((resolve, reject) => execFile(compiler, ["-std=c11", "-Wall", "-Wextra", "-Werror", ...sdkArguments, `-DAD_MODE=${mode}`, fixture, "-o", artifact],
    { env: { PATH: "/usr/bin:/bin", HOME: process.env.HOME, TMPDIR: root }, timeout: 10000 }, e => e ? reject(Error("Fictitious compilation failed")) : resolve()).stdin.end());
  await fs.chmod(artifact, 0o500); await fs.symlink(artifact, entry);
  const a = await fs.lstat(artifact), e = await fs.lstat(entry), p = await fs.lstat(parent);
  const statPin = (s, name) => ({ path: name, dev: s.dev, ino: s.ino, uid: s.uid, mode: s.mode & 4095, size: s.size, mtimeMs: s.mtimeMs, ctimeMs: s.ctimeMs });
  const cfg = { source: "synthetic-fixture", recipe: "auth-status-v1", version: "fictitious-1", artifact: { ...statPin(a, artifact), sha256: createHash("sha256").update(await fs.readFile(artifact)).digest("hex") },
    entryLink: statPin(e, entry), workspaceParent: { path: parent, dev: p.dev, ino: p.ino, uid: p.uid, mode: p.mode & 4095 }, excludedRoots: [path.join(root, "excluded-project")],
    identityReview: { state: "reviewed", bindingSha256: "0".repeat(64), evidenceSha256: "1".repeat(64) },
    startupReview: { state: "reviewed", bindingSha256: "0".repeat(64), evidenceSha256: "2".repeat(64), effectsEnumerated: true, unresolvedEffects: false },
    limits: { ...timing, maxOutputBytes: 32768, maxErrorBytes: 32768, permitLifetimeMs: 60000 } };
  return { cfg: reviews(cfg), root, parent, artifact, entry };
}
const permit = cfg => createAuthDiagnosticPermit(schema, cfg);
const collector = (cfg, p, deps = {}) => createAuthDiagnosticCollector(schema, cfg, p, deps);
function safe(r) {
  assert.equal(r.scope, "auth-status-only"); assert.equal(r.source, "synthetic-fixture"); assert.equal(r.nativeExecuted, false);
  for (const k of ["inferenceRequested", "runtimeReady", "verifiedAdmission", "externalBillingVerified", "remoteCancellationVerified"]) assert.equal(r[k], false);
  assert.equal(r.actualModelCalls, null); assert.ok(r.spawnAttempts <= 1); assert.deepEqual(r.reasons, [...new Set(r.reasons)].sort());
  if (r.state !== "observation-complete") assert.equal(r.projection, null);
  assert.doesNotMatch(JSON.stringify(r), /synthetic-private|agent-auth-fixture|\/Users\/|argv|sha256|configDirectory|email/); return r;
}
localTest("AD fixed recipe, original HOME, minimal env, no shell/stdin and cleanup", async t => {
  const { cfg, parent } = await setup(t); let count = 0;
  const c = collector(cfg, permit(cfg), { spawn(file, argv, options) { count++; assert.equal(file, cfg.entryLink.path); assert.deepEqual(argv, ["auth", "status"]);
    assert.equal(options.shell, false); assert.equal(options.detached, true); assert.deepEqual(options.stdio, ["ignore", "pipe", "pipe"]);
    assert.equal(options.env.HOME, process.env.HOME); assert.equal(options.env.TMPDIR, options.cwd); assert.equal(options.env.PATH, "/usr/bin:/bin");
    assert.deepEqual(Object.keys(options.env).sort(), ["HOME", "LANG", "LC_ALL", "PATH", "TMPDIR"]); return spawn(file, argv, options); } });
  const r = safe(await c.run()); assert.equal(r.state, "observation-complete"); assert.deepEqual(r.projection, { ...wire, classification: "compatible-declared" });
  assert.equal(r.artifactMatchedBefore, true); assert.equal(r.artifactMatchedAfter, true); assert.equal(r.terminationConfirmed, true); assert.equal(r.cleanupRequired, false);
  assert.equal(count, 1); assert.deepEqual(await fs.readdir(parent), []); assert.equal(safe(await c.run()).spawnAttempts, 0);
});
for (const mode of [1, 14, 15, 16, 20]) localTest("AD valid fictitious transport " + mode, async t => {
  const { cfg } = await setup(t, mode); const r = safe(await collector(cfg, permit(cfg)).run()); assert.equal(r.state, "observation-complete");
  assert.equal(r.projection.classification, mode === 1 ? "signed-out" : mode === 15 ? "incompatible" : mode === 20 ? "compatible-declared" : "unresolved");
});
for (const mode of [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 17, 18, 19, 21, 22]) localTest("AD invalid/unfinished fictitious transport " + mode, async t => {
  const { cfg, parent } = await setup(t, mode); const r = safe(await collector(cfg, permit(cfg)).run()); assert.notEqual(r.state, "observation-complete");
  assert.equal(r.processStarted, true); if ([7, 8, 11].includes(mode)) assert.ok(["timed-out", "indeterminate"].includes(r.state));
  if (mode === 9) { assert.equal(r.state, "indeterminate"); assert.equal(r.cleanupRequired, true); assert.equal((await fs.readdir(parent)).length, 1); }
  else if (r.terminationConfirmed) assert.deepEqual(await fs.readdir(parent), []);
  if (mode === 10) assert.ok(r.reasons.includes("auth-descendants-unconfirmed"));
});
for (const kind of ["missing", "fake", "serialized", "proxy", "revoked", "used", "mismatch", "expired", "foreign"]) test("AD permission " + kind + " blocks before IO", { timeout: 20000 }, async () => {
  const cfg = declarationConfiguration(), { counts, deps } = forbiddenEffects();
  assert.equal(typeof collector(cfg, permit(cfg), deps).run, "function");
  let p = kind === "missing" ? undefined : permit(cfg), traps = 0;
  if (kind === "fake") p = {};
  if (kind === "serialized") p = JSON.parse(JSON.stringify(p));
  if (kind === "proxy") p = new Proxy({}, { getPrototypeOf() { traps++; throw Error("private"); } });
  if (kind === "revoked") revokeAuthDiagnosticPermit(p);
  if (kind === "used") assert.deepEqual(safe(await collector(cfg, p, deps).run(undefined)).reasons, ["auth-input-forbidden"]);
  if (kind === "mismatch") cfg.limits.totalTimeoutMs++;
  if (kind === "foreign") p = createManagedPreferencesInvocationPermit(cfg);
  if (kind === "expired") deps.monotonic = () => mono() + 100000;
  const r = safe(await collector(cfg, p, deps).run());
  assert.equal(r.state, "blocked-before-start"); assert.deepEqual(r.reasons, ["auth-permission-rejected"]); assert.equal(r.spawnAttempts, 0);
  assert.deepEqual(counts, { io: 0, spawn: 0 }); assert.equal(traps, 0);
});
for (const kind of ["identity-pending", "identity-rejected", "startup-pending", "startup-rejected", "identity-binding", "startup-binding", "effects-unknown", "effects-not-enumerated"])
  test("AD specific startup gate " + kind + " blocks before all IO", { timeout: 20000 }, async () => {
    const cfg = declarationConfiguration(), { counts, deps } = forbiddenEffects();
    assert.equal(typeof collector(cfg, permit(cfg), deps).run, "function");
    if (kind.startsWith("identity-")) cfg.identityReview[kind === "identity-binding" ? "bindingSha256" : "state"] = kind === "identity-binding" ? "f".repeat(64) : kind.slice(9);
    if (kind.startsWith("startup-")) cfg.startupReview[kind === "startup-binding" ? "bindingSha256" : "state"] = kind === "startup-binding" ? "f".repeat(64) : kind.slice(8);
    if (kind === "effects-unknown") cfg.startupReview.unresolvedEffects = true;
    if (kind === "effects-not-enumerated") cfg.startupReview.effectsEnumerated = false;
    const r = safe(await collector(cfg, permit(cfg), deps).run());
    assert.equal(r.state, "blocked-before-start"); assert.deepEqual(r.reasons, ["auth-startup-not-reviewed"]); assert.equal(r.spawnAttempts, 0);
    assert.deepEqual(counts, { io: 0, spawn: 0 });
  });
localTest("AD concurrent collectors consume one scoped handle only once", async t => {
  const { cfg } = await setup(t), p = permit(cfg); const rs = await Promise.all([collector(cfg, p).run(), collector(cfg, p).run()]); rs.forEach(safe);
  assert.equal(rs.reduce((n, r) => n + r.spawnAttempts, 0), 1); assert.equal(rs.filter(r => r.state === "observation-complete").length, 1);
});
test("AD N1/S3.1/S3.2/S2/C1/SC handles do not cross the diagnostic boundary", { timeout: 20000 }, async () => {
  const cfg = declarationConfiguration(), { counts, deps } = forbiddenEffects();
  assert.equal(typeof collector(cfg, permit(cfg), deps).run, "function");
  const handles = [createManagedPreferencesInvocationPermit(cfg), createDiagnosticPermit(cfg), createNativeAccessPermit({}, {}),
    createSupervisedPermit("synthetic", () => {}, () => {}), createFixturePermit(() => {}, () => {}), createSelectiveReadPermit(cfg)];
  for (const p of handles) {
    const r = safe(await collector(cfg, p, deps).run());
    assert.equal(r.state, "blocked-before-start"); assert.deepEqual(r.reasons, ["auth-permission-rejected"]); assert.equal(r.spawnAttempts, 0);
    assert.deepEqual(counts, { io: 0, spawn: 0 });
  }
});
for (const kind of ["sha", "uid", "inode", "mode", "special-mode", "setuid-mode", "sticky-mode", "size", "mtime", "ctime", "hardlink", "link-inode", "link-target", "link-mtime", "parent-inode", "parent-mode", "git", "obsidian", "excluded"])
  localTest("AD pin/parent " + kind + " rejected before spawn", async t => {
    const { cfg, artifact, entry, parent, root } = await setup(t);
    const specialBit = { "special-mode": 0o2000, "setuid-mode": 0o4000, "sticky-mode": 0o1000 }[kind];
    const io = {}; let specialStats = 0, opens = 0;
    if (kind === "sha") cfg.artifact.sha256 = "f".repeat(64);
    if (kind === "uid") cfg.artifact.uid++;
    if (kind === "inode") cfg.artifact.ino++;
    if (kind === "mode") await fs.chmod(artifact, 0o700);
    if (specialBit) {
      // chmod can clear setgid when the file's group is not one of ours.
      // Model the unsafe metadata, not an OS-dependent chmod outcome; all
      // other pin fields remain genuine and matching. Never execute this file.
      const actual = await fs.lstat(artifact);
      cfg.artifact.mode = (actual.mode & 4095) | specialBit;
      io.lstat = async (...args) => {
        const stat = await fs.lstat(...args);
        if (args[0] !== artifact) return stat;
        const unsafe = Object.assign(Object.create(Object.getPrototypeOf(stat)), stat, { mode: stat.mode | specialBit });
        for (const key of ["dev", "ino", "uid", "size", "mtimeMs", "ctimeMs"]) assert.equal(unsafe[key], cfg.artifact[key]);
        assert.equal(unsafe.mode & 4095, cfg.artifact.mode);
        assert.equal(unsafe.isFile(), true); assert.equal(unsafe.isSymbolicLink(), false);
        specialStats++; return unsafe;
      };
      io.open = async () => { opens++; throw Error("special mode must block before open"); };
    }
    if (kind === "size") cfg.artifact.size++;
    if (kind === "mtime") cfg.artifact.mtimeMs++;
    if (kind === "ctime") cfg.artifact.ctimeMs++;
    if (kind === "hardlink") await fs.link(artifact, path.join(root, "additional-link"));
    if (kind === "link-inode") cfg.entryLink.ino++;
    if (kind === "link-mtime") cfg.entryLink.mtimeMs++;
    if (kind === "link-target") { await fs.unlink(entry); await fs.symlink(path.join(root, "different-target"), entry); }
    if (kind === "parent-inode") cfg.workspaceParent.ino++;
    if (kind === "parent-mode") await fs.chmod(parent, 0o755);
    if (kind === "git" || kind === "obsidian") await fs.mkdir(path.join(root, kind === "git" ? ".git" : ".obsidian"));
    if (kind === "excluded") cfg.excludedRoots = [root];
    reviews(cfg); let calls = 0; const r = safe(await collector(cfg, permit(cfg), { io, spawn() { calls++; throw Error("private"); } }).run());
    assert.equal(r.state, "blocked-before-start"); assert.equal(calls, 0); assert.deepEqual(await fs.readdir(parent), []);
    if (specialBit) {
      assert.ok(specialStats > 0); assert.equal(opens, 0); assert.equal(r.spawnAttempts, 0); assert.equal(r.processStarted, false);
    }
  });
for (const kind of ["artifact", "entry", "revoke", "cancel"]) localTest("AD post-run " + kind + " discards projection", async t => {
  const { cfg, artifact, entry } = await setup(t), p = permit(cfg), abort = new AbortController(); let opens = 0;
  const r = safe(await collector(cfg, p, { signal: abort.signal, io: { async open(...args) {
    if (++opens === 2) {
      if (kind === "artifact") { await fs.chmod(artifact, 0o700); await fs.appendFile(artifact, "synthetic-private-tail"); await fs.chmod(artifact, 0o500); }
      if (kind === "entry") { await fs.unlink(entry); await fs.symlink(artifact, entry); }
      if (kind === "revoke") revokeAuthDiagnosticPermit(p);
      if (kind === "cancel") abort.abort();
    }
    return fs.open(...args);
  } } }).run());
  assert.equal(r.processStarted, true); assert.equal(r.state, "indeterminate"); assert.equal(r.projection, null);
});
localTest("AD captured inert config survives caller mutation and getters/proxies never run", async t => {
  const { cfg } = await setup(t), p = permit(cfg), s = structuredClone(schema), c = createAuthDiagnosticCollector(s, cfg, p);
  cfg.artifact.path = "/synthetic-private"; s.$id = "wrong"; assert.equal(safe(await c.run()).state, "observation-complete");
});
test("AD inert collector configuration rejects getters/proxies before any effects", { timeout: 20000 }, () => {
  const cfg = declarationConfiguration(), { counts, deps } = forbiddenEffects();
  assert.equal(typeof collector(cfg, permit(cfg), deps).run, "function");
  let traps = 0; const g = { get artifact() { traps++; throw Error("private"); } }, proxy = new Proxy({}, { ownKeys() { traps++; throw Error("private"); } });
  assert.throws(() => collector(g, {}, deps), /^Error: Invalid auth diagnostic configuration$/);
  assert.throws(() => collector(proxy, {}, deps), /^Error: Invalid auth diagnostic configuration$/);
  assert.equal(traps, 0); assert.deepEqual(counts, { io: 0, spawn: 0 });
});
for (const kind of ["before", "during", "revoke"]) localTest("AD abort/revoke " + kind + " never publishes fields", async t => {
  const { cfg } = await setup(t, 8), p = permit(cfg), a = new AbortController(); if (kind === "before") a.abort();
  const r = safe(await collector(cfg, p, { signal: a.signal, spawn(file, argv, options) { const child = spawn(file, argv, options);
    child.once("spawn", () => kind === "revoke" ? revokeAuthDiagnosticPermit(p) : a.abort()); return child; } }).run());
  assert.equal(r.state, "canceled"); assert.equal(r.terminationConfirmed, true); assert.equal(r.spawnAttempts, kind === "before" ? 0 : 1);
});
for (const kind of ["sync", "async"]) localTest("AD spawn failure " + kind + " does not invent execution", async t => {
  const { cfg } = await setup(t); const r = safe(await collector(cfg, permit(cfg), { spawn: kind === "sync" ? () => { throw Error("private"); } : (_, args, opts) => spawn("/synthetic-missing", args, opts) }).run());
  assert.equal(r.state, "failed"); assert.equal(r.processStarted, false); assert.equal(r.spawnAttempts, 1);
});
localTest("AD unconfirmed group ends within confirmation budget and retains owned workspace", async t => {
  const { cfg } = await setup(t, 8), a = new AbortController();
  const r = safe(await collector(cfg, permit(cfg), { signal: a.signal, spawn(file, args, options) { const c = spawn(file, args, options); c.once("spawn", () => a.abort()); return c; },
    kill(pid, signal) { assert.ok(pid < -1); if (signal === 0) { const e = Error("private"); e.code = "EPERM"; throw e; }
      try { return process.kill(pid, signal); } catch (e) { if (e.code === "ESRCH") return true; throw e; } } }).run());
  assert.equal(r.state, "indeterminate"); assert.equal(r.terminationConfirmed, false); assert.equal(r.cleanupRequired, true); assert.ok(r.elapsedMs < 2000);
});
localTest("AD late cleanup/revocation cannot certify or retain fields", async t => {
  const { cfg } = await setup(t), p = permit(cfg); let timeOffset = 0;
  const r = safe(await collector(cfg, p, { monotonic: () => mono() + timeOffset, io: { async rmdir(...args) { await fs.rmdir(...args); timeOffset = 100000; } } }).run());
  assert.equal(r.state, "indeterminate"); assert.equal(r.projection, null); assert.equal(r.cleanupRequired, false);
});
localTest("AD revoke during successful cleanup removes provisional projection", async t => {
  const { cfg } = await setup(t), p = permit(cfg);
  const r = safe(await collector(cfg, p, { io: { async rmdir(...args) { await fs.rmdir(...args); revokeAuthDiagnosticPermit(p); } } }).run());
  assert.equal(r.state, "canceled"); assert.equal(r.projection, null); assert.equal(r.cleanupRequired, false);
});
localTest("AD slow preparation and revocation during hashing never start a process", async t => {
  for (const mode of ["late", "revoke"]) {
    const { cfg, parent } = await setup(t), p = permit(cfg); let offset = 0, starts = 0;
    const r = safe(await collector(cfg, p, { monotonic: () => mono() + offset, io: { async open(...args) {
      if (mode === "late") offset = 100000; else revokeAuthDiagnosticPermit(p); return fs.open(...args);
    } }, spawn() { starts++; throw Error("private"); } }).run());
    assert.notEqual(r.state, "observation-complete"); assert.equal(starts, 0); assert.equal(r.spawnAttempts, 0); assert.deepEqual(await fs.readdir(parent), []);
  }
});
for (const missing of ["exit", "close", "stdout-close", "stderr-close", "pid"]) localTest("AD virtual transport missing " + missing + " stays indeterminate, late data cannot mutate report", async t => {
  const f = await virtualTimingFixture(t, { missing });
  f.complete(); f.advance(100); const r = safe(await f.result), child = f.child;
  assert.equal(r.state, "indeterminate"); assert.equal(r.terminationConfirmed, false); assert.equal(r.cleanupRequired, true);
  const snapshot = structuredClone(r); child.stdout.emit("data", Buffer.from("synthetic-private")); child.emit("exit", 0); child.emit("close");
  child.stdout.emit("close"); child.stderr.emit("close"); child.emit("spawn"); assert.deepEqual(r, snapshot);
});
test("AD configuration is closed with noncoercing budgets and no expanded recipe/env/prompt", { timeout: 20000 }, () => {
  const cfg = declarationConfiguration(), { counts, deps } = forbiddenEffects();
  assert.equal(typeof collector(cfg, permit(cfg), deps).run, "function");
  for (const mutate of [c => { c.argv = ["--print"]; }, c => { c.prompt = "private"; }, c => { c.env = {}; }, c => { c.recipe = "anything"; }, c => { c.limits.processTimeoutMs = 15001; },
    c => { c.limits.totalTimeoutMs = 90001; }, c => { c.limits.maxOutputBytes = 32769; }, c => { c.limits.maxErrorBytes = 32769; }, c => { c.artifact.size = 536870913; },
    c => { c.limits.processTimeoutMs = "800"; }, c => { c.limits.graceMs = 1000; }, c => { c.limits.processTimeoutMs = 2600; }, c => { c.excludedRoots = []; }]) {
    const c = structuredClone(cfg); mutate(c); assert.throws(() => collector(c, {}, deps), /^Error: Invalid auth diagnostic configuration$/);
  }
  assert.deepEqual(counts, { io: 0, spawn: 0 });
});
localTest("AD report schema is closed and cannot turn observation into readiness", async t => {
  const { cfg } = await setup(t), r = safe(await collector(cfg, permit(cfg)).run()), ajv = new Ajv2020({ strict: true }); ajv.addSchema(schema);
  const valid = ajv.compile({ $ref: AUTH_DIAGNOSTIC_ID + "#/$defs/report" }); assert.equal(valid(r), true);
  for (const mutate of [c => { c.runtimeReady = true; }, c => { c.nativeExecuted = true; }, c => { c.actualModelCalls = 0; }, c => { c.token = "private"; },
    c => { c.projection = null; }, c => { c.cleanupRequired = true; }, c => { c.terminationConfirmed = false; }]) { const c = structuredClone(r); mutate(c); assert.equal(valid(c), false); }
});

// Only in-memory filesystem/transport doubles below. No paths are opened or spawned.
function reviewBoundaryFixture({ size = 65537, growth = false, shortRead = null, truncated = false, late = false, signalError = "EPERM" } = {}) {
  const root = path.resolve("/synthetic-auth-review"), artifact = path.join(root,"artifact"), entry = path.join(root,"entry");
  const parent = path.join(root,"workspaces"), workspace = path.join(parent,"owned"), uid = process.getuid?.() ?? 1000;
  const zeroBlock = Buffer.alloc(65536), digest = createHash("sha256");
  for (let offset = 0; offset < size; offset += zeroBlock.length) digest.update(zeroBlock.subarray(0, Math.min(zeroBlock.length, size - offset)));
  const cfg = { source: "synthetic-fixture", recipe: "auth-status-v1", version: "fictitious-review",
    artifact: { path: artifact, dev: 1, ino: 3, uid, mode: 0o500, size, mtimeMs: 1, ctimeMs: 1, sha256: digest.digest("hex") },
    entryLink: { path: entry, dev: 1, ino: 4, uid, mode: 0o777, size: artifact.length, mtimeMs: 1, ctimeMs: 1 },
    workspaceParent: { path: parent, dev: 1, ino: 2, uid, mode: 0o700 }, excludedRoots: [path.join(root,"excluded")],
    identityReview: { state: "reviewed", bindingSha256: "0".repeat(64), evidenceSha256: "1".repeat(64) },
    startupReview: { state: "reviewed", bindingSha256: "0".repeat(64), evidenceSha256: "2".repeat(64), effectsEnumerated: true, unresolvedEffects: false },
    limits: { processTimeoutMs: 100, totalTimeoutMs: 2500, graceMs: 20, confirmationMs: 20, maxOutputBytes: 32768, maxErrorBytes: 32768, permitLifetimeMs: 60000 } };
  reviews(cfg);
  const counts = { lstat: 0, opens: 0, requests: [], bytesRead: 0, spawn: 0, mkdtemp: 0, closed: 0, rmdir: 0, signals: [] };
  const stat = (kind, extra = {}) => ({ dev: 1, ino: 10, uid, mode: kind === "directory" ? 0o40700 : kind === "file" ? 0o100500 : 0o120777,
    nlink: 1, size: 0, mtimeMs: 1, ctimeMs: 1, isDirectory: () => kind === "directory", isFile: () => kind === "file",
    isSymbolicLink: () => kind === "link", ...extra });
  const fileStat = () => stat("file", { ...cfg.artifact, mode: 0o100500, size: size + (growth && counts.bytesRead ? 1 : 0) });
  const io = {
    async lstat(name) {
      counts.lstat++;
      if (name.endsWith("/.git") || name.endsWith("/.obsidian")) throw Object.assign(Error("absent"), { code: "ENOENT" });
      if (name === artifact) return fileStat();
      if (name === entry) return stat("link", { ...cfg.entryLink, mode: 0o120777 });
      return stat("directory", { ino: name === parent ? 2 : name === workspace ? 5 : 10 });
    },
    async readlink() { return artifact; },
    async open(name) {
      assert.equal(name, artifact); const opened = ++counts.opens;
      return { async stat() { return fileStat(); }, async read(buffer, offset, length, position) {
        counts.requests.push({ opened, position, length });
        const actualSize = truncated ? size - 1 : size + (growth ? 1 : 0);
        const bytesRead = Math.max(0, Math.min(length, shortRead ?? length, actualSize - position));
        buffer.fill(0, offset, offset + bytesRead); counts.bytesRead += bytesRead; return { bytesRead };
      }, async close() { counts.closed++; } };
    },
    async mkdtemp() { counts.mkdtemp++; return workspace; }, async chmod() {}, async rmdir() { counts.rmdir++; }
  };
  const child = new EventEmitter(); child.pid = 24680;
  child.stdout = new EventEmitter(); child.stderr = new EventEmitter(); child.stdout.destroy = () => {}; child.stderr.destroy = () => {};
  const deps = { io, spawn(file, argv) {
    counts.spawn++; assert.equal(file, entry); assert.deepEqual(argv, ["auth", "status"]);
    if (!late) setImmediate(() => {
      child.emit("spawn"); child.stdout.emit("data", Buffer.from(JSON.stringify(wire))); child.emit("exit", 0);
      child.stdout.emit("close"); child.stderr.emit("close"); child.emit("close");
    });
    return child;
  }, kill(pid, signal) {
    assert.equal(pid, -24680); counts.signals.push(signal);
    if (signal === 0) throw Object.assign(Error("gone"), { code: "ESRCH" });
    if (late) throw Object.assign(Error("synthetic-private"), signalError === null ? {} : { code: signalError });
  } };
  return { cfg, counts, child, deps };
}

// Exact boundary checks use neither a compiler nor OS processes/scheduling.
async function virtualTimingFixture(t, { missing = null, groupError = null, signal } = {}) {
  t.mock.timers.enable({ apis: ["setInterval", "setTimeout"] });
  const f = reviewBoundaryFixture({ late: true }), child = f.child;
  if (missing === "pid") child.pid = 1;
  let clock = 0, began = 0, groupGone = false, emitted = false, settled = false;
  let ready; const started = new Promise(resolve => { ready = resolve; });
  const signals = [];
  const deps = { ...f.deps, signal, monotonic: () => clock,
    spawn(file, argv) {
      const returned = f.deps.spawn(file, argv);
      queueMicrotask(() => { child.emit("spawn"); ready(); }); return returned;
    },
    kill(pid, kind) {
      assert.equal(pid, -24680); // Never forwarded to process.kill.
      signals.push({ kind, ms: clock - began });
      if (kind === 0) {
        if (groupError) throw Object.assign(Error("synthetic-private"), { code: groupError });
        if (groupGone) throw Object.assign(Error("gone"), { code: "ESRCH" });
      }
      return true;
    }
  };
  const authorization = permit(f.cfg), run = collector(f.cfg, authorization, deps);
  clock = mono(); began = clock; // Permission was issued on this same monotonic epoch.
  const advance = ms => { for (let i = 0; i < ms; i++) { clock++; t.mock.timers.tick(1); } };
  const result = run.run(); result.then(() => { settled = true; }, () => { settled = true; });
  t.after(async () => {
    try { if (!settled) { advance(2500); await result; } }
    finally { t.mock.timers.reset(); }
  });
  await Promise.race([started, result.then(() => { throw Error("Virtual run ended before spawn"); })]);
  const complete = () => {
    if (emitted) return; emitted = true; groupGone = true;
    child.stdout.emit("data", Buffer.from(JSON.stringify(wire)));
    if (missing !== "exit") child.emit("exit", 0);
    if (missing !== "stdout-close") child.stdout.emit("close");
    if (missing !== "stderr-close") child.stderr.emit("close");
    if (missing !== "close") child.emit("close");
  };
  return { ...f, authorization, signals, advance, complete, result };
}

test("AD timing profiles separate synthetic integration from validation", () => {
  assert.deepEqual(INTEGRATION_TIMING, { processTimeoutMs: 3000, totalTimeoutMs: 5000, graceMs: 100, confirmationMs: 120 });
  assert.deepEqual(VALIDATION_TIMING, { processTimeoutMs: 800, totalTimeoutMs: 2500, graceMs: 100, confirmationMs: 120 });
  assert.equal(INTEGRATION_TIMING.processTimeoutMs - INTEGRATION_TIMING.graceMs - INTEGRATION_TIMING.confirmationMs, 2780);
});
localTest("AD virtual deadline exact TERM 60 KILL 80 uncertainty 100", async t => {
  const f = await virtualTimingFixture(t), commands = () => f.signals.filter(s => s.kind !== 0);
  f.advance(59); assert.deepEqual(commands(), []);
  f.advance(1); assert.deepEqual(commands(), [{ kind: "SIGTERM", ms: 60 }]);
  f.advance(19); assert.deepEqual(commands(), [{ kind: "SIGTERM", ms: 60 }]);
  f.advance(1); assert.deepEqual(commands(), [{ kind: "SIGTERM", ms: 60 }, { kind: "SIGKILL", ms: 80 }]);
  let delivered = false; f.result.then(() => { delivered = true; });
  f.advance(19); await Promise.resolve(); assert.equal(delivered, false);
  f.advance(1); const r = safe(await f.result);
  assert.equal(r.state, "indeterminate"); assert.equal(r.elapsedMs, 100); assert.equal(r.terminationConfirmed, false);
  assert.equal(r.projection, null); assert.equal(r.cleanupRequired, true); assert.equal(f.counts.spawn, 1); assert.equal(f.counts.rmdir, 0);
});
for (const ms of [59, 60]) localTest("AD virtual complete closure at " + ms + " respects deadline", async t => {
  const f = await virtualTimingFixture(t); f.advance(ms); f.complete(); const r = safe(await f.result);
  assert.equal(r.state, ms === 59 ? "observation-complete" : "timed-out");
  assert.equal(r.terminationConfirmed, true); assert.equal(r.cleanupRequired, false); assert.equal(f.counts.rmdir, 1);
  assert.equal(r.elapsedMs, ms); assert.equal(f.counts.spawn, 1);
  if (ms === 59) { assert.deepEqual(r.projection, { ...wire, classification: "compatible-declared" }); assert.ok(f.signals.every(s => s.kind === 0)); }
  else { assert.equal(r.projection, null); assert.ok(r.reasons.includes("auth-deadline")); }
});
for (const kind of ["cancel", "revoke"]) localTest("AD virtual " + kind + " cannot publish fields", async t => {
  const controller = new AbortController(), f = await virtualTimingFixture(t, { signal: controller.signal });
  if (kind === "cancel") controller.abort(); else { revokeAuthDiagnosticPermit(f.authorization); f.advance(10); }
  f.complete(); const r = safe(await f.result);
  assert.equal(r.state, "canceled"); assert.equal(r.projection, null); assert.equal(r.terminationConfirmed, true);
  assert.equal(r.cleanupRequired, false); assert.equal(f.counts.spawn, 1);
  assert.ok(f.signals.some(s => s.kind === "SIGTERM"));
});
localTest("AD virtual EPERM is uncertainty, never group absence", async t => {
  const f = await virtualTimingFixture(t, { groupError: "EPERM" }); f.complete(); f.advance(40); const r = safe(await f.result);
  assert.equal(r.state, "indeterminate"); assert.equal(r.terminationConfirmed, false); assert.equal(r.cleanupRequired, true);
  assert.equal(r.projection, null); assert.ok(r.reasons.includes("auth-group-unconfirmed")); assert.equal(f.counts.rmdir, 0);
});
for (const [graceMs, accepted] of [[659, true], [660, false]]) test("AD validation budget relation remains exact at grace " + graceMs, () => {
  const f = reviewBoundaryFixture(); Object.assign(f.cfg.limits, VALIDATION_TIMING, { graceMs });
  if (accepted) assert.doesNotThrow(() => collector(f.cfg, {})); else assert.throws(() => collector(f.cfg, {}), /^Error: Invalid auth diagnostic configuration$/);
});
function boundedReviewReads(f) {
  for (const { position, length } of f.counts.requests) {
    assert.ok(position < f.cfg.artifact.size, "must not request an EOF sentinel");
    assert.equal(length, Math.min(65536, f.cfg.artifact.size - position, 536870912 - position));
  }
}
test("AD review regression rejects all run arguments before IO and consumes valid permission", { timeout: 20000 }, async () => {
  let traps = 0;
  const inputs = [undefined, "--print", { prompt: "synthetic-private" }, { get prompt() { traps++; throw Error("private"); } },
    new Proxy({}, { ownKeys() { traps++; throw Error("private"); }, get() { traps++; throw Error("private"); } })];
  for (const input of inputs) {
    const cfg = declarationConfiguration(), { counts, deps } = forbiddenEffects(), p = permit(cfg), c = collector(cfg, p, deps), r = safe(await c.run(input));
    assert.equal(r.state, "blocked-before-start"); assert.deepEqual(r.reasons, ["auth-input-forbidden"]);
    assert.deepEqual(counts, { io: 0, spawn: 0 });
    assert.equal(safe(await c.run()).spawnAttempts, 0);
    assert.deepEqual(safe(await collector(cfg, p, deps).run()).reasons, ["auth-permission-rejected"]);
    assert.deepEqual(counts, { io: 0, spawn: 0 });
  }
  assert.equal(traps, 0);
});
localTest("AD review regression stable artifact reads only pinned bytes without EOF sentinel", async () => {
  const f = reviewBoundaryFixture(), r = safe(await collector(f.cfg, permit(f.cfg), f.deps).run());
  assert.equal(r.state, "observation-complete"); assert.equal(f.counts.bytesRead, 2 * f.cfg.artifact.size);
  assert.equal(f.counts.requests.length, 4); assert.equal(f.counts.closed, 2); boundedReviewReads(f);
});
localTest("AD review regression growth at the 512 MiB cap never reads the appended byte", async () => {
  const f = reviewBoundaryFixture({ size: 536870912, growth: true }), r = safe(await collector(f.cfg, permit(f.cfg), f.deps).run());
  assert.equal(r.state, "blocked-before-start"); assert.equal(r.artifactMatchedBefore, false);
  assert.equal(f.counts.bytesRead, f.cfg.artifact.size); assert.equal(f.counts.requests.length, 8192);
  assert.equal(f.counts.closed, 1); assert.equal(f.counts.spawn, 0); boundedReviewReads(f);
});
localTest("AD review regression short reads still remain within the pinned artifact", async () => {
  const f = reviewBoundaryFixture({ shortRead: 17 }), r = safe(await collector(f.cfg, permit(f.cfg), f.deps).run());
  assert.equal(r.state, "observation-complete"); assert.equal(f.counts.bytesRead, 2 * f.cfg.artifact.size);
  assert.equal(f.counts.closed, 2); boundedReviewReads(f);
});
localTest("AD review regression truncated artifact fails before spawn and closes descriptor", async () => {
  const f = reviewBoundaryFixture({ truncated: true }), r = safe(await collector(f.cfg, permit(f.cfg), f.deps).run());
  assert.equal(r.state, "blocked-before-start"); assert.equal(f.counts.bytesRead, f.cfg.artifact.size - 1);
  assert.equal(f.counts.closed, 1); assert.equal(f.counts.spawn, 0); boundedReviewReads(f);
});
localTest("AD review regression late failed signal cannot mutate a delivered report", async () => {
  for (const signalError of ["EPERM", "ESRCH", null]) {
    const f = reviewBoundaryFixture({ late: true, signalError }), r = safe(await collector(f.cfg, permit(f.cfg), f.deps).run());
    assert.equal(r.state, "indeterminate"); assert.equal(r.cleanupRequired, true);
    const delivered = structuredClone(r);
    f.child.emit("spawn"); assert.deepEqual(f.counts.signals, ["SIGKILL"]);
    f.child.emit("error", Error("synthetic-private")); f.child.emit("exit", 0); f.child.emit("close");
    f.child.stdout.emit("data", Buffer.from("synthetic-private")); f.child.stderr.emit("data", Buffer.from("synthetic-private"));
    f.child.stdout.emit("close"); f.child.stderr.emit("close"); assert.deepEqual(r, delivered);
  }
});
