import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { hash } from "../src/client-runtime-core.js";
import { createNativePreflightEvaluator, createNativeAccessExtractor, PROJECTION_FIELDS } from "../src/client-native-preflight.js";
import { inspectPreflightMetadata, verifyPreflightCandidate } from "../src/client-native-preflight-files.js";
import { createNativeAccessCollector, createNativeAccessPermit, revokeNativeAccessPermit, nativeAccessScope } from "../src/client-native-access.js";
import { createDiagnosticPermit } from "../src/client-native-diagnostics.js";
import http from "node:http";
import https from "node:https";
import net from "node:net";

const schema = JSON.parse(await fs.readFile(new URL("../schemas/agent-client-native-preflight.schema.json", import.meta.url), "utf8"));
const candidateSchema = JSON.parse(await fs.readFile(new URL("../schemas/agent-client-native-diagnostics.schema.json", import.meta.url), "utf8"));
const fixture = fileURLToPath(new URL("../testing/native-preflight/fixture.cjs", import.meta.url));
const scope = "a".repeat(64), now = "2026-10-05T12:00:00Z";
const policy = { expectedScopeSha256: scope, maxEvidenceAgeSeconds: 3600, revokedReferences: [] };
const evaluate = createNativePreflightEvaluator(schema, policy), extract = createNativeAccessExtractor(schema);
function assessment(binding = scope) { return { source: "locally-observed", referenceId: "synthetic-proof", checkedAt: now, scopeSha256: binding }; }
function input(binding = scope, time = now) {
  return { schemaVersion: "1.0.0", scope: "native-preflight-only", now: time, candidateScopeSha256: binding,
    projection: { safeSource: true, fields: PROJECTION_FIELDS.map(name => ({ name, state: "absent", assessment: { ...assessment(binding), checkedAt: time } })) },
    access: { data: { loggedIn: true, authMethod: "claude.ai", subscriptionType: "pro" }, assessment: { ...assessment(binding), checkedAt: time } },
    economy: { state: "disabled", source: "operator-attested", referenceId: "synthetic-attestation", receivedAt: time, scopeSha256: binding, sessionContinuity: true } };
}
const safe = r => {
  assert.equal(r.runtimeReady, false); assert.equal(r.verifiedAdmission, false); assert.equal(r.externalBillingVerified, false);
  assert.equal(r.actualModelCalls, null); assert.equal(r.inferenceRequested, false);
  assert.doesNotMatch(JSON.stringify(r), /synthetic-private|example.invalid|\/Users\/|api[_-]?key\s*[:=]/i); return r;
};
test("PF consistency review is pure, immutable and never grants runtime", () => {
  const d = input(), before = structuredClone(d); const r = safe(evaluate(d));
  assert.equal(r.state, "review-complete"); assert.equal(r.queryEligible, true); assert.equal(r.nativeExecuted, false); assert.deepEqual(d, before);
  assert.deepEqual(evaluate(JSON.stringify(d)), r); assert.deepEqual(evaluate(Buffer.from(JSON.stringify(d))), r);
});
for (const name of PROJECTION_FIELDS) for (const state of ["present", "unknown"]) test(`PF ${name} ${state} cannot enable access`, () => {
  const d = input(); d.projection.fields.find(f => f.name === name).state = state;
  const r = safe(evaluate(d)); assert.equal(r.queryEligible, false); assert.equal(r.state, state === "present" ? "blocked" : "incomplete");
});
for (const name of PROJECTION_FIELDS) for (const source of ["documented", "operator-attested", "pending"]) test(`PF ${name} ${source} is not a local control proof`, () => {
  const d = input(); d.projection.fields.find(f => f.name === name).assessment.source = source; assert.equal(evaluate(d).queryEligible, false);
});
for (const [name, change, state] of [
  ["missing safe source", d => { d.projection.safeSource = false; }, "incomplete"],
  ["missing fields", d => { d.projection.fields = []; }, "incomplete"],
  ["duplicate", d => { d.projection.fields[1] = structuredClone(d.projection.fields[0]); }, "blocked"],
  ["wrong scope", d => { d.candidateScopeSha256 = "b".repeat(64); }, "blocked"],
  ["wrong evidence", d => { d.projection.fields[0].assessment.scopeSha256 = "b".repeat(64); }, "blocked"],
  ["future", d => { d.projection.fields[0].assessment.checkedAt = "2026-10-06T12:00:00Z"; }, "blocked"],
  ["stale", d => { d.projection.fields[0].assessment.checkedAt = "2026-10-05T10:00:00Z"; }, "incomplete"],
  ["missing reference", d => { d.projection.fields[0].assessment.referenceId = null; }, "incomplete"],
  ["missing binding", d => { d.projection.fields[0].assessment.scopeSha256 = null; }, "incomplete"],
  ["missing access", d => { delete d.access; }, "incomplete"],
  ["subscription unknown", d => { d.access.data.subscriptionType = null; }, "incomplete"],
  ["not logged in", d => { d.access.data.loggedIn = false; }, "blocked"],
  ["API route", d => { d.access.data.authMethod = "api_key"; }, "blocked"],
  ["helper", d => { d.access.data.authMethod = "api_key_helper"; }, "blocked"],
  ["third party", d => { d.access.data.authMethod = "third_party"; }, "blocked"],
  ["supplied token", d => { d.access.data.authMethod = "oauth_token"; }, "blocked"],
  ["free tier", d => { d.access.data.subscriptionType = "free"; }, "blocked"],
  ["credits enabled", d => { d.economy.state = "enabled"; }, "blocked"],
  ["credits unknown", d => { d.economy.state = "unknown"; }, "incomplete"],
  ["economy missing", d => { delete d.economy; }, "incomplete"],
  ["receipt time unknown", d => { d.economy.receivedAt = null; }, "incomplete"],
  ["session changed", d => { d.economy.sessionContinuity = false; }, "incomplete"]
]) test("PF " + name, () => { const d = input(); change(d); assert.equal(safe(evaluate(d)).state, state); });
test("PF revoked references block, exactly max age is fresh", () => {
  assert.equal(createNativePreflightEvaluator(schema, { ...policy, revokedReferences: ["synthetic-proof"] })(input()).state, "blocked");
  const d = input(); d.now = "2026-10-05T13:00:00Z"; assert.equal(evaluate(d).state, "review-complete"); d.now = "2026-10-05T13:00:01Z"; assert.equal(evaluate(d).state, "incomplete");
});
for (const [name, mutate] of [
  ["raw settings", d => { d.projection.raw = "synthetic-private"; }], ["secret value", d => { d.projection.fields[0].apiKey = "synthetic-private"; }],
  ["coercion", d => { d.projection.safeSource = "true"; }], ["malformed date", d => { d.now = "2026-02-30T00:00:00Z"; }],
  ["getter", d => Object.defineProperty(d, "bad", { enumerable: true, get() { throw Error("do not call"); } })],
  ["cycle", d => { d.bad = d; }], ["proxy", d => { d.projection = new Proxy({}, { ownKeys() { throw Error("do not call"); } }); }]
]) test("PF input rejects " + name, () => { const d = input(); mutate(d); assert.equal(safe(evaluate(d)).state, "invalid"); });
for (const value of [undefined, null, [], '{"now":"x","now":"y"}', Buffer.from([0xff]), "x".repeat(32769), '{"__proto__":{}}']) test("PF rejects adversarial root", () => assert.equal(evaluate(value).state, "invalid"));
test("PF extractor discards personal/unknown fields, not their values into errors", () => {
  const d = { loggedIn: true, authMethod: "claude.ai", subscriptionType: "pro", email: "synthetic-private@example.invalid", token: "synthetic-private", configDirectory: "/synthetic-private" };
  assert.deepEqual(extract(JSON.stringify(d)), { loggedIn: true, authMethod: "claude.ai", subscriptionType: "pro" });
  delete d.subscriptionType; assert.equal(extract(d).subscriptionType, null);
});
for (const d of [
  { loggedIn: "true", authMethod: "claude.ai" }, { loggedIn: true, authMethod: "none" },
  { loggedIn: false, authMethod: "claude.ai" }, { loggedIn: true, authMethod: "unknown" },
  { loggedIn: true, authMethod: "claude.ai", subscriptionType: 3 }, '{"loggedIn":true,"loggedIn":false}'
]) test("PF extractor rejects contradictory/invalid access", () => assert.throws(() => extract(d)));

const supported = process.platform === "darwin" && process.arch === "arm64";
const localTest = (name, fn) => test(name, { skip: !supported, timeout: 20000 }, fn);
async function setup(t) {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "agent-preflight-test-"))); await fs.chmod(root, 0o700); const owned = await fs.lstat(root);
  t.after(async () => { const s = await fs.lstat(root).catch(() => null); if (s?.dev === owned.dev && s?.ino === owned.ino && s.isDirectory() && !s.isSymbolicLink()) await fs.rm(root, { recursive: true }); });
  const artifactPath = path.join(root, "synthetic-candidate"), entryPath = path.join(root, "synthetic-link"), bytes = Buffer.from("not an AI client");
  await fs.writeFile(artifactPath, bytes, { mode: 0o755 }); await fs.symlink(artifactPath, entryPath); const s = await fs.lstat(artifactPath), link = await fs.lstat(entryPath);
  const cfg = { candidate: { entryPath, artifactPath, expectedSha256: createHash("sha256").update(bytes).digest("hex"), expectedUid: s.uid, expectedMode: s.mode & 4095, expectedSize: s.size, expectedDev: s.dev, expectedIno: s.ino, expectedLinkIno: link.ino }, workspaceParent: root,
    limits: { timeoutMs: 1500, totalTimeoutMs: 6000, graceMs: 150, confirmationMs: 300, maxOutputBytes: 32768, maxErrorBytes: 32768 } };
  return { cfg, d: input(nativeAccessScope(cfg), new Date().toISOString().replace(/\.\d{3}Z$/, "Z")) };
}
function collector(cfg, d, deps = {}, permit = createNativeAccessPermit(cfg, d)) {
  return createNativeAccessCollector(schema, candidateSchema, cfg, permit, { ...deps, spawn: deps.spawn ?? ((_exec, a, o) => spawn(process.execPath, [fixture, deps.mode ?? "success", ...a], o)) });
}
localTest("PF native guard does not reserve workspace or spawn on unknown controls", async t => {
  const { cfg, d } = await setup(t); d.projection.safeSource = false; d.projection.fields = []; let n = 0;
  const r = await collector(cfg, d, { spawn: () => { n++; throw Error("no"); } }).run(d);
  safe(r.report); assert.equal(r.report.state, "blocked"); assert.equal(n, 0); assert.equal(r.auth, null);
  assert.deepEqual(await fs.readdir(cfg.workspaceParent), ["synthetic-candidate", "synthetic-link"]);
});
localTest("PF native synthetic collector only auth status, no prompt or raw data", async t => {
  const { cfg, d } = await setup(t); let n = 0;
  const run = collector(cfg, d, { spawn: (exe, a, o) => { n++; assert.equal(exe, cfg.candidate.artifactPath); assert.deepEqual(a, ["auth", "status"]); assert.deepEqual(o.stdio, ["ignore", "pipe", "pipe"]); assert.equal(o.shell, false); assert.equal(o.env.ANTHROPIC_API_KEY, undefined); return spawn(process.execPath, [fixture, "success", ...a], o); } });
  const r = await run.run(d); safe(r.report); assert.equal(r.report.state, "completed"); assert.equal(r.report.nativeExecuted, true); assert.equal(n, 1);
  assert.deepEqual(r.auth, { loggedIn: true, authMethod: "claude.ai", subscriptionType: "pro" }); assert.doesNotMatch(JSON.stringify(r), /synthetic-private/);
  assert.equal((await run.run(d)).report.nativeExecuted, false); assert.deepEqual(await fs.readdir(cfg.workspaceParent), ["synthetic-candidate", "synthetic-link"]);
});
for (const mode of ["silent", "ignore-term", "overflow", "stderr", "utf8", "duplicate", "failure"]) localTest("PF native fixture " + mode + " stops without retry", async t => {
  const { cfg, d } = await setup(t); const r = await collector(cfg, d, { mode }).run(d); safe(r.report);
  assert.notEqual(r.report.state, "completed"); assert.equal(r.report.spawnAttempts, 1); assert.equal(r.auth, null); assert.equal(r.report.terminationConfirmed, true);
});
localTest("PF fake/cross-phase/serialized/revoked/binding mismatch permits block", async t => {
  const { cfg, d } = await setup(t); const revoked = createNativeAccessPermit(cfg, d); revokeNativeAccessPermit(revoked);
  const changed = structuredClone(d); changed.projection.safeSource = false;
  for (const p of [{}, createDiagnosticPermit({ synthetic: true }), JSON.parse(JSON.stringify(createNativeAccessPermit(cfg, d))), revoked, createNativeAccessPermit(cfg, changed)]) {
    const r = await collector(cfg, d, {}, p).run(d); assert.equal(r.report.spawnAttempts, 0);
  }
});
localTest("PF metadata is lstat only and never exports paths/values", async t => {
  const { cfg } = await setup(t); let calls = 0;
  const r = await inspectPreflightMetadata([{ id: "artifact", path: cfg.candidate.artifactPath }, { id: "link", path: cfg.candidate.entryPath }, { id: "missing", path: path.join(cfg.workspaceParent, "missing") }], { lstat: async p => { calls++; return fs.lstat(p); } });
  assert.deepEqual(r.map(v => v.kind), ["file", "unsafe", "missing"]); assert.ok(calls > 0); assert.doesNotMatch(JSON.stringify(r), /agent-preflight-test|synthetic-candidate/);
  await assert.rejects(inspectPreflightMetadata(Array.from({ length: 17 }, (_, i) => ({ id: "id-" + i, path: cfg.workspaceParent }))));
  await assert.rejects(inspectPreflightMetadata([{ id: "x", path: "relative" }]));
});
localTest("PF candidate change blocks before native access", async t => {
  const { cfg, d } = await setup(t); await fs.writeFile(cfg.candidate.artifactPath, "changed"); let n = 0;
  const r = await collector(cfg, d, { spawn: () => { n++; throw Error("no"); } }).run(d); assert.equal(n, 0); assert.equal(r.report.state, "blocked");
  await assert.rejects(verifyPreflightCandidate(cfg.candidate));
});
localTest("PF collector rejects stale controls using its own clock", async t => {
  const { cfg, d } = await setup(t); let n = 0;
  const r = await collector(cfg, d, { clock: () => Date.now() + 3700000, spawn: () => { n++; throw Error("no"); } }).run(d);
  assert.equal(n, 0); assert.equal(r.report.preflight.queryEligible, false);
});
localTest("PF collector one permit shared by two instances, one query", async t => {
  const { cfg, d } = await setup(t), p = createNativeAccessPermit(cfg, d);
  const both = await Promise.all([collector(cfg, d, {}, p).run(d), collector(cfg, d, {}, p).run(d)]);
  assert.equal(both.filter(r => r.report.state === "completed").length, 1); assert.equal(both.reduce((n, r) => n + r.report.spawnAttempts, 0), 1);
});
localTest("PF cancel before/during query stops without a second start", async t => {
  for (const early of [true, false]) {
    const { cfg, d } = await setup(t), a = new AbortController(); if (early) a.abort();
    const r = await collector(cfg, d, { signal: a.signal, spawn: (_e, args, o) => {
      const p = spawn(process.execPath, [fixture, "silent", ...args], o); p.on("spawn", () => setTimeout(() => a.abort(), 30)); return p;
    } }).run(d);
    assert.equal(r.report.spawnAttempts, early ? 0 : 1); assert.equal(r.auth, null);
    assert.equal(r.report.terminationConfirmed, true);
  }
});
localTest("PF synchronous/asynchronous spawn failures never invent native start", async t => {
  for (const fn of [() => { throw Error("synthetic-private-error"); }, (_e, a, o) => spawn("/synthetic-access-missing-executable", a, o)]) {
    const { cfg, d } = await setup(t); const r = await collector(cfg, d, { spawn: fn }).run(d);
    assert.equal(r.report.nativeExecuted, false); assert.equal(r.report.spawnAttempts, 1); assert.equal(r.report.terminationConfirmed, true); assert.equal(r.auth, null);
    assert.deepEqual(await fs.readdir(cfg.workspaceParent), ["synthetic-candidate", "synthetic-link"]);
  }
});
localTest("PF unconfirmed group cannot report access success", async t => {
  const { cfg, d } = await setup(t); cfg.limits.timeoutMs = 600; cfg.limits.graceMs = 100; cfg.limits.confirmationMs = 150;
  d.candidateScopeSha256 = nativeAccessScope(cfg); for (const f of d.projection.fields) f.assessment.scopeSha256 = d.candidateScopeSha256;
  d.access.assessment.scopeSha256 = d.economy.scopeSha256 = d.candidateScopeSha256;
  const r = await collector(cfg, d, { kill: () => { const e = Error("denied"); e.code = "EPERM"; throw e; } }).run(d);
  // Success fixture exits by itself; denied observation leaves no hanging child.
  assert.equal(r.report.state, "indeterminate"); assert.equal(r.report.terminationConfirmed, false); assert.equal(r.auth, null);
});
localTest("PF metadata errors and symlinks stay unknown/unsafe, no file reads", async t => {
  const { cfg } = await setup(t);
  const r = await inspectPreflightMetadata([{ id: "private", path: cfg.candidate.artifactPath }], { lstat: async () => { const e = Error("synthetic-private-error"); e.code = "EACCES"; throw e; } });
  assert.deepEqual(r, [{ id: "private", kind: "unknown" }]);
  const linkDir = path.join(cfg.workspaceParent, "linkdir"); await fs.symlink(cfg.workspaceParent, linkDir);
  const s = await inspectPreflightMetadata([{ id: "via-link", path: path.join(linkDir, "synthetic-candidate") }]); assert.equal(s[0].kind, "unsafe");
});
localTest("PF no network calls from the controller on admitted synthetic query", async t => {
  const { cfg, d } = await setup(t); let calls = 0;
  const saved = [http.request, http.get, https.request, https.get, net.connect, net.createConnection, globalThis.fetch];
  const deny = () => { calls++; throw Error("network"); };
  http.request = http.get = https.request = https.get = net.connect = net.createConnection = globalThis.fetch = deny;
  try { assert.equal((await collector(cfg, d).run(d)).report.state, "completed"); assert.equal(calls, 0); }
  finally { [http.request, http.get, https.request, https.get, net.connect, net.createConnection, globalThis.fetch] = saved; }
});
test("PF top-level proxy hooks are never invoked", () => {
  let hooks = 0; const p = new Proxy({}, { getPrototypeOf() { hooks++; throw Error("no"); }, ownKeys() { hooks++; throw Error("no"); } });
  assert.equal(evaluate(p).state, "invalid"); assert.throws(() => extract(p)); assert.equal(hooks, 0);
});
test("PF inventory identifiers do not coerce booleans/null into names", async () => {
  for (const id of [true, false, null, 42]) await assert.rejects(inspectPreflightMetadata([{ id, path: "/synthetic-only" }]));
});
test("PF inventory rejects filesystem roots before any metadata call", async () => {
  const root = path.parse(process.cwd()).root;
  let calls = 0;
  const lstat = async () => { calls++; throw Error("Unexpected metadata access"); };
  for (const entries of [
    [{ id: "root", path: root }],
    [{ id: "file", path: path.join(root, "synthetic-only") }, { id: "root", path: root }]
  ]) {
    await assert.rejects(inspectPreflightMetadata(entries, { lstat }), { message: "Invalid metadata inventory" });
    assert.equal(calls, 0);
  }
});
localTest("PF observed incompatible native access overrides compatible input claims", async t => {
  const { cfg, d } = await setup(t); const r = await collector(cfg, d, { mode: "api" }).run(d);
  assert.equal(r.report.nativeExecuted, true); assert.equal(r.report.state, "blocked");
  assert.equal(r.report.preflight.state, "blocked"); assert.ok(r.report.preflight.reasons.includes("preflight-access-incompatible"));
  assert.equal(r.auth.authMethod, "api_key"); assert.equal(r.report.runtimeReady, false);
});
