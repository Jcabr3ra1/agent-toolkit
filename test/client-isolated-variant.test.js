import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import fsp from "node:fs/promises";
import childProcess from "node:child_process";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import crypto from "node:crypto";
import { syncBuiltinESMExports } from "node:module";
import Ajv2020 from "ajv/dist/2020.js";
import { createIsolatedVariantEvaluator, ISOLATED_MECHANISMS, ISOLATED_VARIANT_ID, ISOLATED_SCHEMA_ID } from "../src/client-isolated-variant.js";

// All data below are synthetic; schema is the only file loaded by this suite.
const schema = JSON.parse(fs.readFileSync(new URL("../schemas/agent-client-isolated-variant.schema.json", import.meta.url), "utf8"));
const policy = { policyId: "synthetic-policy", maxEvidenceAgeSeconds: 3600, revokedReferences: [], allowedVariants: [ISOLATED_VARIANT_ID] };
const evaluate = createIsolatedVariantEvaluator(schema, policy);
const now = "2026-10-05T12:00:00Z";
const ids = ISOLATED_MECHANISMS.map(m => m.id);
function draft() {
  return { schemaVersion: "1.0.0", variantId: ISOLATED_VARIANT_ID, now, mode: "tutor", role: "proponent",
    candidate: { client: "claude-code", candidateId: "synthetic-candidate", artifactSha256: "a".repeat(64),
      versionReference: "synthetic-version", configurationSha256: "b".repeat(64), environmentSha256: "c".repeat(64), authentication: "subscription" },
    mechanisms: [...ids], observations: ids.map(mechanismId => ({ mechanismId, state: "absent", referenceId: `obs-${mechanismId}`, observedAt: now })),
    assessments: ids.map(mechanismId => ({ mechanismId, provenance: "pending", outcome: "unknown" })) };
}
function claims(d = draft(), evaluator = evaluate) {
  const scopeSha256 = evaluator({ ...d, assessments: [] }).scopeSha256;
  d.assessments = ISOLATED_MECHANISMS.map(m => ({ mechanismId: m.id, provenance: "native-variant-tested", basis: "native-test", outcome: "supported",
    referenceId: `test-${m.id}`, observedAt: now, scopeSha256, definitionSha256: m.definitionSha256 }));
  return d;
}
function noPermit(r) {
  for (const key of ["executed", "runtimeReady", "verifiedAdmission", "externalBillingVerified", "effectiveIsolationVerified"]) assert.equal(r[key], false);
  assert.equal(r.scope, "isolated-variant-claims-only");
  assert.deepEqual(Object.keys(r).sort(), ["scope", "state", "reasons", "unresolvedMechanisms", "descriptionSha256", "scopeSha256", "executed", "runtimeReady", "verifiedAdmission", "externalBillingVerified", "effectiveIsolationVerified"].sort());
  assert.deepEqual(r.reasons, [...new Set(r.reasons)].sort());
  assert.deepEqual(r.unresolvedMechanisms, [...new Set(r.unresolvedMechanisms)].sort());
  assert.doesNotMatch(JSON.stringify(r), /synthetic-private|\/Users\/|example\.invalid|argv|ticket|reservation/i);
  return r;
}
test("IV synthetic native claims allow only description review, not authentication or isolation", () => {
  const r = noPermit(evaluate(claims())); assert.equal(r.state, "ready-for-variant-review");
  assert.deepEqual(r.unresolvedMechanisms, []); assert.match(r.scopeSha256, /^[a-f0-9]{64}$/);
  assert.notEqual(r.scopeSha256, r.descriptionSha256);
});
test("IV pending declarations remain incomplete", () => {
  const r = noPermit(evaluate(draft())); assert.equal(r.state, "incomplete"); assert.equal(r.unresolvedMechanisms.length, ids.length);
});
test("IV object, string and bytes are deterministic and immutable", () => {
  const d = claims(), before = structuredClone(d), schemaBefore = structuredClone(schema), policyBefore = structuredClone(policy);
  const r = noPermit(evaluate(d)); assert.deepEqual(evaluate(JSON.stringify(d)), r); assert.deepEqual(evaluate(Buffer.from(JSON.stringify(d))), r);
  assert.deepEqual(evaluate(new Uint8Array(Buffer.from(JSON.stringify(d)))), r);
  assert.deepEqual(d, before); assert.deepEqual(schema, schemaBefore); assert.deepEqual(policy, policyBefore);
  r.reasons.push("caller-mutation"); assert.deepEqual(evaluate(d), evaluate(before));
});
test("IV factory captures schema/policy, not subsequent caller mutations", () => {
  const s = structuredClone(schema), p = structuredClone(policy), e = createIsolatedVariantEvaluator(s, p), d = claims(draft(), e);
  const before = e(d); s.$defs.input.additionalProperties = true; p.allowedVariants.length = 0; p.maxEvidenceAgeSeconds = 1;
  assert.deepEqual(e(d), before); assert.ok(Object.isFrozen(ISOLATED_MECHANISMS));
  assert.ok(ISOLATED_MECHANISMS.every(Object.isFrozen));
});
test("IV ordering of sets does not change description or scope", () => {
  const d = claims(), r = evaluate(d); d.mechanisms.reverse(); d.observations.reverse(); d.assessments.reverse(); assert.deepEqual(evaluate(d), r);
});
for (const m of ISOLATED_MECHANISMS) {
  for (const [provenance, basis] of [["documented", "documentation"], ["local-structure-observation", "structure"], ["operator-attested", "attestation"]]) {
    test(`IV ${m.id}: ${provenance} cannot become effectiveness proof`, () => {
      const d = claims(); Object.assign(d.assessments.find(a => a.mechanismId === m.id), { provenance, basis });
      const r = noPermit(evaluate(d)); assert.equal(r.state, "incomplete"); assert.ok(r.unresolvedMechanisms.includes(m.id));
    });
  }
  test(`IV ${m.id}: absent assessment remains missing`, () => {
    const d = claims(); d.assessments = d.assessments.filter(a => a.mechanismId !== m.id);
    const r = evaluate(d); assert.equal(r.state, "incomplete"); assert.deepEqual(r.unresolvedMechanisms, [m.id]);
  });
}
for (const id of ["session-hooks-disabled", "strict-empty-mcp"]) test(`IV configured ${id} with documented exclusion remains incomplete`, () => {
  const d = draft(); d.observations.find(o => o.mechanismId === id).state = "configured"; claims(d);
  Object.assign(d.assessments.find(a => a.mechanismId === id), { provenance: "documented", basis: "documentation" });
  assert.equal(noPermit(evaluate(d)).state, "incomplete");
});
for (const [name, mutate, expected] of [
  ["missing mechanisms", d => { d.mechanisms = []; claims(d); }, "incomplete"],
  ["missing observations", d => { d.observations = []; claims(d); }, "incomplete"],
  ["unknown managed source", d => { d.observations.find(o => o.mechanismId === "managed-sources-excluded").state = "unknown"; claims(d); }, "incomplete"],
  ["unknown authentication", d => { d.candidate.authentication = "unknown"; claims(d); }, "incomplete"],
  ["API authentication", d => { d.candidate.authentication = "api"; claims(d); }, "blocked"],
  ["bare authentication", d => { d.candidate.authentication = "bare"; claims(d); }, "blocked"],
  ["duplicated mechanisms", d => { d.mechanisms[1] = d.mechanisms[0]; }, "blocked"],
  ["duplicated observation", d => { d.observations[1] = structuredClone(d.observations[0]); }, "blocked"],
  ["duplicated assessment", d => { d.assessments[1] = structuredClone(d.assessments[0]); }, "blocked"],
  ["incompatible composition", d => { d.assessments[0].outcome = "incompatible"; }, "blocked"],
  ["explicit rejection", d => { d.assessments[0].provenance = "rejected"; }, "blocked"],
  ["unknown effectiveness", d => { d.assessments[0].outcome = "unknown"; }, "incomplete"],
  ["attestation promoted to native", d => { d.assessments[0].basis = "attestation"; }, "blocked"],
  ["structure promoted to native", d => { d.assessments[0].basis = "structure"; }, "blocked"],
  ["native promoted to documentation", d => { d.assessments[0].provenance = "documented"; }, "blocked"],
  ["wrong mechanism definition", d => { d.assessments[0].definitionSha256 = "f".repeat(64); }, "blocked"],
  ["wrong variant scope", d => { d.assessments[0].scopeSha256 = "f".repeat(64); }, "blocked"],
  ["changed artifact", d => { d.candidate.artifactSha256 = "d".repeat(64); }, "blocked"],
  ["changed version", d => { d.candidate.versionReference = "synthetic-version-two"; }, "blocked"],
  ["changed configuration", d => { d.candidate.configurationSha256 = "d".repeat(64); }, "blocked"],
  ["changed environment", d => { d.candidate.environmentSha256 = "d".repeat(64); }, "blocked"],
  ["changed candidate", d => { d.candidate.candidateId = "synthetic-candidate-two"; }, "blocked"],
  ["changed mode", d => { d.mode = "autonomous"; }, "blocked"],
  ["changed role", d => { d.role = "reviewer"; }, "blocked"],
  ["changed observation", d => { d.observations[0].state = "configured"; }, "blocked"],
  ["future assessment", d => { d.assessments[0].observedAt = "2026-10-05T12:00:01Z"; }, "blocked"],
  ["expired assessment", d => { d.assessments[0].observedAt = "2026-10-05T10:59:59Z"; }, "blocked"],
  ["future observation", d => { d.observations[0].observedAt = "2026-10-05T12:00:01Z"; claims(d); }, "blocked"],
  ["expired observation", d => { d.observations[0].observedAt = "2026-10-05T10:59:59Z"; claims(d); }, "blocked"]
]) test("IV " + name, () => { const d = claims(); mutate(d); assert.equal(noPermit(evaluate(d)).state, expected); });
test("IV exactly one hour is fresh, next second blocks", () => {
  const d = claims(); d.now = "2026-10-05T13:00:00Z"; assert.equal(evaluate(d).state, "ready-for-variant-review");
  d.now = "2026-10-05T13:00:01Z"; assert.equal(evaluate(d).state, "blocked");
});
for (const ref of ["test-tools-empty-denied", "obs-tools-empty-denied"]) test(`IV revoked ${ref} blocks`, () => {
  const e = createIsolatedVariantEvaluator(schema, { ...policy, revokedReferences: [ref] });
  const r = noPermit(e(claims(draft(), e))); assert.equal(r.state, "blocked"); assert.ok(r.reasons.includes("isolated-evidence-revoked"));
});
test("IV policy updates invalidate previous scope", () => {
  const d = claims(); const e = createIsolatedVariantEvaluator(schema, { ...policy, policyId: "synthetic-policy-two" });
  assert.equal(e(d).state, "blocked");
});
test("IV explicit empty allowed variants policy blocks", () => {
  const e = createIsolatedVariantEvaluator(schema, { ...policy, allowedVariants: [] }); assert.equal(e(claims(draft(), e)).state, "blocked");
});
for (const [name, mutate] of [
  ["unknown variant", d => { d.variantId = "synthetic-unknown-variant"; }],
  ["unknown mechanism", d => { d.mechanisms[0] = "bypass-permissions"; }],
  ["unknown candidate", d => { d.candidate.client = "another-client"; }],
  ["fake permission", d => { d.permission = true; }],
  ["argv", d => { d.argv = ["synthetic-private"]; }],
  ["hooks", d => { d.hooks = "synthetic-private"; }],
  ["raw settings", d => { d.settings = { token: "synthetic-private" }; }],
  ["path", d => { d.candidate.candidateId = "/synthetic-private"; }],
  ["URL", d => { d.candidate.versionReference = "https://example.invalid"; }],
  ["account", d => { d.observations[0].email = "synthetic-private@example.invalid"; }],
  ["token", d => { d.assessments[0].token = "synthetic-private"; }],
  ["coercion", d => { d.now = 1; }],
  ["timestamp rollover", d => { d.now = "2026-02-30T12:00:00Z"; }],
  ["timezone offset", d => { d.now = "2026-10-05T12:00:00+00:00"; }],
  ["surrogate", d => { d.candidate.candidateId = "\ud800"; }],
  ["getter", d => { Object.defineProperty(d, "now", { enumerable: true, get() { throw Error("not allowed"); } }); }],
  ["toJSON", d => { d.toJSON = () => { throw Error("not allowed"); }; }],
  ["nested proxy", d => { d.candidate = new Proxy({}, { ownKeys() { throw Error("not allowed"); } }); }],
  ["cycle", d => { d.extra = d; }],
  ["symbol", d => { d[Symbol("secret")] = "synthetic-private"; }],
  ["non-enumerable", d => { Object.defineProperty(d, "extra", { value: "synthetic-private" }); }],
  ["prototype", d => { Object.setPrototypeOf(d.candidate, { secret: "synthetic-private" }); }]
]) test("IV invalid " + name, () => { const d = claims(); mutate(d); const r = noPermit(evaluate(d)); assert.equal(r.state, "invalid"); assert.equal(r.scopeSha256, null); });
for (const [name, value] of [
  ["undefined", undefined], ["null", null], ["array", []], ["number", 1], ["invalid UTF8", Buffer.from([0xff])],
  ["oversize", " ".repeat(32769)], ["duplicate keys", '{"now":"x","now":"x"}'],
  ["escaped duplicate", '{"now":"x","\\u006eow":"x"}'], ["pollution", '{"__proto__":{}}'],
  ["constructor", '{"constructor":{}}'], ["overflow", '{"n":1e999}'], ["BOM", '\ufeff{}'],
  ["proxy", new Proxy({}, { getPrototypeOf() { throw Error("not allowed"); } })],
  ["escaped surrogate", '{"id":"\\ud800"}']
]) test("IV adversarial " + name, () => assert.equal(noPermit(evaluate(value)).state, "invalid"));
test("IV 32 KiB byte boundary is exact and multibyte aware", () => {
  const text = JSON.stringify(claims()), padded = text + " ".repeat(32768 - Buffer.byteLength(text));
  assert.equal(evaluate(padded).state, "ready-for-variant-review"); assert.equal(evaluate(padded + " ").state, "invalid");
  assert.equal(evaluate(Buffer.from(padded)).state, "ready-for-variant-review");
  assert.equal(evaluate("é".repeat(16385)).state, "invalid");
});
for (const [name, mutate] of [
  ["missing allowed variants", p => { delete p.allowedVariants; }], ["extra", p => { p.permission = true; }],
  ["coerced age", p => { p.maxEvidenceAgeSeconds = "3600"; }], ["zero age", p => { p.maxEvidenceAgeSeconds = 0; }],
  ["excess age", p => { p.maxEvidenceAgeSeconds = 3601; }], ["fractional age", p => { p.maxEvidenceAgeSeconds = 1.5; }],
  ["duplicate revoked", p => { p.revokedReferences = ["same", "same"]; }], ["unknown variant", p => { p.allowedVariants = ["unknown"]; }],
  ["private reference", p => { p.revokedReferences = ["/synthetic-private"]; }],
  ["getter", p => { Object.defineProperty(p, "policyId", { enumerable: true, get() { throw Error("synthetic-private"); } }); }]
]) test("IV invalid trusted policy " + name, () => {
  const p = structuredClone(policy); mutate(p); assert.throws(() => createIsolatedVariantEvaluator(schema, p), /^Error: Invalid isolated-variant schema or policy$/);
});
test("IV schema cannot redefine closed mechanisms", () => {
  const s = structuredClone(schema); s.$defs.mechanismId.enum.push("bypass-permissions");
  assert.throws(() => createIsolatedVariantEvaluator(s, policy), /Invalid isolated-variant schema or policy/);
});
test("IV hostile getters, toJSON and proxy traps are never executed", () => {
  let calls = 0;
  const d = claims(); Object.defineProperty(d, "now", { enumerable: true, get() { calls++; return now; } });
  assert.equal(evaluate(d).state, "invalid");
  const j = claims(); j.toJSON = () => { calls++; return claims(); }; assert.equal(evaluate(j).state, "invalid");
  const p = new Proxy({}, { getPrototypeOf() { calls++; return Object.prototype; }, ownKeys() { calls++; return []; }, get() { calls++; return null; } });
  assert.equal(evaluate(p).state, "invalid");
  const n = claims(); n.candidate = p; assert.equal(evaluate(n).state, "invalid"); assert.equal(calls, 0);
});
test("IV duplicate keys are rejected inside otherwise valid evidence", () => {
  const text = JSON.stringify(claims()).replace('"outcome":"supported"', '"outcome":"supported","outcome":"supported"');
  assert.equal(noPermit(evaluate(text)).state, "invalid");
});
test("IV configured hooks and MCP do not imply either effectiveness or incompatibility", () => {
  const d = draft(); for (const id of ["session-hooks-disabled", "strict-empty-mcp"]) d.observations.find(o => o.mechanismId === id).state = "configured";
  assert.equal(evaluate(d).state, "incomplete"); claims(d);
  // Still only reviewable synthetic claims, never a verified native configuration.
  assert.equal(noPermit(evaluate(d)).state, "ready-for-variant-review");
});
test("IV second-level precision, invalid observation/assessment calendar and changed policy bound", () => {
  for (const field of ["now", "observation", "assessment"]) {
    const d = claims(); const bad = "2026-02-29T00:00:00Z";
    if (field === "now") d.now = bad; else if (field === "observation") d.observations[0].observedAt = bad; else d.assessments[0].observedAt = bad;
    assert.equal(evaluate(d).state, "invalid");
  }
  const d = claims(); d.now = "2026-10-05T12:00:00.000Z"; assert.equal(evaluate(d).state, "invalid");
  const e = createIsolatedVariantEvaluator(schema, { ...policy, maxEvidenceAgeSeconds: 60 }); assert.equal(e(claims()).state, "blocked");
});
test("IV reports validate against closed schema", () => {
  const ajv = new Ajv2020({ strict: true }); ajv.addFormat("date-time", () => true); ajv.addSchema(schema);
  const valid = ajv.compile({ $ref: `${ISOLATED_SCHEMA_ID}#/$defs/report` });
  for (const d of [null, draft(), claims()]) { const r = noPermit(evaluate(d)); assert.equal(valid(r), true); r.runtimeReady = true; assert.equal(valid(r), false); }
});
test("IV construction and favorable evaluation have zero IO, network, spawn, clock or randomness", () => {
  const d = claims(), restores = [], calls = [];
  const replace = (object, key) => { const previous = object[key]; if (typeof previous !== "function") return;
    object[key] = () => { calls.push(key); throw Error("forbidden " + key); }; restores.push(() => { object[key] = previous; }); };
  try {
    for (const key of ["readFileSync", "readFile", "openSync", "open", "writeFileSync", "writeFile", "statSync", "readdirSync"]) replace(fs, key);
    for (const key of ["readFile", "open", "writeFile", "stat", "readdir"]) replace(fsp, key);
    for (const key of ["spawn", "spawnSync", "exec", "execSync", "execFile", "execFileSync", "fork"]) replace(childProcess, key);
    for (const object of [http, https]) for (const key of ["request", "get"]) replace(object, key);
    for (const key of ["connect", "createConnection"]) replace(net, key);
    for (const key of ["randomBytes", "randomUUID", "randomInt", "randomFillSync"]) replace(crypto, key);
    replace(globalThis, "fetch"); replace(Date, "now"); replace(Math, "random"); syncBuiltinESMExports();
    const e = createIsolatedVariantEvaluator(schema, policy); assert.equal(noPermit(e(d)).state, "ready-for-variant-review");
    assert.deepEqual(calls, []);
  } finally { restores.reverse().forEach(fn => fn()); syncBuiltinESMExports(); }
});
