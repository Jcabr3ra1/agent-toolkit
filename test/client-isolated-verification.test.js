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
import { ISOLATED_MECHANISMS, createIsolatedVariantEvaluator } from "../src/client-isolated-variant.js";
import { createIsolatedVerificationPlanner, ISOLATED_VERIFICATION_CHECKS, VERIFICATION_SCHEMA_ID } from "../src/client-isolated-verification.js";

const schema = JSON.parse(fs.readFileSync(new URL("../schemas/agent-client-isolated-verification.schema.json", import.meta.url), "utf8"));
const variantSchema = JSON.parse(fs.readFileSync(new URL("../schemas/agent-client-isolated-variant.schema.json", import.meta.url), "utf8"));
const policy = { policyId: "synthetic-policy", maxEvidenceAgeSeconds: 3600, revokedReferences: [], allowedVariants: ["claude-subscription-text-v1"] };
const catalog = { catalogId: "synthetic-catalog", variantSchema, variantPolicy: policy, checks: structuredClone(ISOLATED_VERIFICATION_CHECKS) };
const plan = createIsolatedVerificationPlanner(schema, catalog), evaluateVariant = createIsolatedVariantEvaluator(variantSchema, policy);
const now = "2026-10-05T12:00:00Z";
const ids = ISOLATED_MECHANISMS.map(m => m.id);
function input() {
  return { schemaVersion: "1.0.0", variant: { schemaVersion: "1.0.0", variantId: "claude-subscription-text-v1", now, mode: "tutor", role: "proponent",
    candidate: { client: "claude-code", candidateId: "synthetic-candidate", artifactSha256: "a".repeat(64), versionReference: "synthetic-version",
      configurationSha256: "b".repeat(64), environmentSha256: "c".repeat(64), authentication: "subscription" },
    mechanisms: [...ids], observations: ids.map(mechanismId => ({ mechanismId, state: "absent", referenceId: `obs-${mechanismId}`, observedAt: now })),
    assessments: ids.map(mechanismId => ({ mechanismId, provenance: "pending", outcome: "unknown" })) },
    checks: ISOLATED_VERIFICATION_CHECKS.map(c => ({ mechanismId: c.mechanismId, methodId: "documentation-review",
      coverage: [...c.requiredCoverage], containment: "not-needed", evidence: null })) };
}
function attach(d = input(), planner = plan) {
  const scopeSha256 = planner({ ...d, checks: d.checks.map(c => ({ ...c, evidence: null })) }).planSha256;
  for (const c of d.checks) c.evidence = { provenance: "documented", basis: "documentation", outcome: "supported", referenceId: `e-${c.mechanismId}`,
    observedAt: now, scopeSha256, definitionSha256: ISOLATED_MECHANISMS.find(m => m.id === c.mechanismId).definitionSha256 };
  return d;
}
function safe(r) {
  assert.equal(r.scope, "isolated-verification-plan-only"); assert.equal(r.decision, "no-native-start");
  for (const key of ["executed", "runtimeReady", "verifiedAdmission", "externalBillingVerified", "effectiveIsolationVerified"]) assert.equal(r[key], false);
  assert.deepEqual(Object.keys(r).sort(), ["scope", "state", "decision", "matrix", "reasons", "planSha256", "variantScopeSha256", "executed", "runtimeReady", "verifiedAdmission", "externalBillingVerified", "effectiveIsolationVerified"].sort());
  assert.equal(r.matrix.length, 12); assert.deepEqual(r.matrix.map(x => x.mechanismId), ids);
  assert.deepEqual(r.reasons, [...new Set(r.reasons)].sort());
  for (const row of r.matrix) { assert.equal(row.evidenceAuthenticated, false); assert.ok(row.missingEvidence.includes("native-effectiveness-evidence"));
    assert.ok(row.missingEvidence.includes("trusted-provenance")); assert.deepEqual(row.reasons, [...new Set(row.reasons)].sort()); }
  assert.doesNotMatch(JSON.stringify(r), /synthetic-private|\/Users\/|example\.invalid|argv|reservation|ticket/i); return r;
}
test("VP complete proposal requires review, never native startup", () => {
  const r = safe(plan(input())); assert.equal(r.state, "plan-review-required");
  assert.ok(r.matrix.every(row => row.state === "unresolved")); assert.ok(r.reasons.includes("verification-variant-evidence-unresolved"));
});
test("VP documented references are declarations, not authenticated proof", () => {
  const r = safe(plan(attach())); assert.equal(r.state, "plan-review-required"); assert.ok(r.matrix.every(row => row.state === "documented-only"));
});
test("VP input, schema and catalog are immutable and encodings deterministic", () => {
  const d = attach(), before = structuredClone(d), s = structuredClone(schema), c = structuredClone(catalog);
  const r = safe(plan(d)); assert.deepEqual(plan(JSON.stringify(d)), r); assert.deepEqual(plan(Buffer.from(JSON.stringify(d))), r);
  assert.deepEqual(plan(new Uint8Array(Buffer.from(JSON.stringify(d)))), r);
  assert.deepEqual(d, before); assert.deepEqual(schema, s); assert.deepEqual(catalog, c);
  r.matrix[0].missingEvidence.length = 0; assert.deepEqual(plan(d), plan(before));
});
test("VP factory snapshots trusted inputs and exports frozen catalog", () => {
  const s = structuredClone(schema), c = structuredClone(catalog), p = createIsolatedVerificationPlanner(s, c), d = attach(input(), p), before = p(d);
  s.$defs.input.additionalProperties = true; c.checks.length = 0; c.variantPolicy.maxEvidenceAgeSeconds = 1;
  assert.deepEqual(p(d), before); assert.ok(Object.isFrozen(ISOLATED_VERIFICATION_CHECKS));
  for (const row of ISOLATED_VERIFICATION_CHECKS) { assert.ok(Object.isFrozen(row)); assert.ok(Object.isFrozen(row.allowedMethods)); assert.ok(Object.isFrozen(row.requiredCoverage)); }
});
test("VP permutation of sets preserves scope and matrix order", () => {
  const d = attach(), before = plan(d); d.variant.mechanisms.reverse(); d.variant.observations.reverse(); d.variant.assessments.reverse();
  d.checks.reverse(); d.checks.forEach(c => c.coverage.reverse()); assert.deepEqual(plan(d), before);
  const c = structuredClone(catalog); c.checks.reverse(); c.checks.forEach(v => { v.allowedMethods.reverse(); v.requiredCoverage.reverse(); });
  assert.deepEqual(createIsolatedVerificationPlanner(schema, c)(d), before);
});
for (const t of ISOLATED_VERIFICATION_CHECKS) {
  test(`VP ${t.mechanismId} missing check has concrete missing evidence`, () => {
    const d = input(); d.checks = d.checks.filter(c => c.mechanismId !== t.mechanismId);
    const r = safe(plan(d)); assert.equal(r.state, "blocked"); const row = r.matrix.find(v => v.mechanismId === t.mechanismId);
    assert.ok(row.reasons.includes("verification-check-missing")); assert.ok(row.missingEvidence.includes("planning-check"));
  });
  test(`VP ${t.mechanismId} missing variant selection blocks incomplete composition`, () => {
    const d = input(); d.variant.mechanisms = d.variant.mechanisms.filter(id => id !== t.mechanismId);
    const r = safe(plan(d)); assert.equal(r.state, "blocked");
    assert.ok(r.matrix.find(x => x.mechanismId === t.mechanismId).missingEvidence.includes("variant-mechanism-selection"));
  });
  for (const phase of t.requiredCoverage) test(`VP ${t.mechanismId} missing ${phase} coverage blocks`, () => {
    const d = input(); d.checks.find(c => c.mechanismId === t.mechanismId).coverage = t.requiredCoverage.filter(p => p !== phase);
    const r = safe(plan(d)); assert.equal(r.state, "blocked"); const row = r.matrix.find(v => v.mechanismId === t.mechanismId);
    assert.equal(row.state, "not-observable-in-scope"); assert.deepEqual(row.missingCoverage, [phase]);
  });
  test(`VP ${t.mechanismId} native claim cannot authenticate itself`, () => {
    const d = input(), c = d.checks.find(x => x.mechanismId === t.mechanismId); c.methodId = "native-test"; c.containment = "declared-contained";
    attach(d); Object.assign(c.evidence, { provenance: "native-claim", basis: "native-test" });
    const r = safe(plan(d)); assert.equal(r.state, "blocked"); assert.equal(r.matrix.find(x => x.mechanismId === t.mechanismId).state, "unresolved");
    assert.ok(r.reasons.includes("verification-native-provenance-unverified"));
  });
}
for (const [name, method, provenance, basis, state] of [
  ["structure", "structure-review", "local-structure-observation", "structure", "structure-only"],
  ["fixture", "fixture-test", "fixture-claim", "fixture-test", "test-scoped"],
  ["attestation", "documentation-review", "operator-attested", "attestation", "unresolved"]
]) test(`VP ${name} retains its limited provenance`, () => {
  const d = input(), c = d.checks[1]; c.methodId = method; c.containment = method === "fixture-test" ? "declared-contained" : "not-needed";
  attach(d); Object.assign(c.evidence, { provenance, basis });
  const r = safe(plan(d)); assert.equal(r.state, "plan-review-required"); assert.equal(r.matrix[1].state, state);
});
test("VP even complete IA-1 native claims cannot remove pending provenance", () => {
  const d = input(), scopeSha256 = evaluateVariant(d.variant).scopeSha256;
  d.variant.assessments = ISOLATED_MECHANISMS.map(m => ({ mechanismId: m.id, provenance: "native-variant-tested", basis: "native-test", outcome: "supported",
    referenceId: `native-${m.id}`, observedAt: now, scopeSha256, definitionSha256: m.definitionSha256 }));
  assert.equal(evaluateVariant(d.variant).state, "ready-for-variant-review");
  const r = safe(plan(attach(d))); assert.equal(r.state, "plan-review-required"); assert.ok(r.matrix.every(row => row.missingEvidence.includes("trusted-provenance")));
});
for (const [name, mutate, reason] of [
  ["unknown managed policy", d => { d.variant.observations.find(o => o.mechanismId === "managed-sources-excluded").state = "unknown"; }, "verification-managed-policy-unresolved"],
  ["missing managed policy", d => { d.variant.observations = d.variant.observations.filter(o => o.mechanismId !== "managed-sources-excluded"); }, "verification-managed-policy-unresolved"],
  ["unknown authentication", d => { d.variant.candidate.authentication = "unknown"; }, "verification-authentication-unresolved"],
  ["API", d => { d.variant.candidate.authentication = "api"; }, "verification-variant-blocked"],
  ["bare", d => { d.variant.candidate.authentication = "bare"; }, "verification-variant-blocked"],
  ["duplicate check", d => { d.checks[1] = structuredClone(d.checks[0]); }, "verification-duplicate-check"],
  ["duplicate coverage", d => { d.checks[1].coverage = ["pre-start", "pre-start", "session"]; }, "verification-duplicate-coverage"],
  ["duplicate variant mechanism", d => { d.variant.mechanisms[1] = d.variant.mechanisms[0]; }, "verification-variant-blocked"],
  ["unsupported structure method", d => { d.checks[0].methodId = "structure-review"; }, "verification-method-not-allowed"],
  ["managed fixture", d => { const c = d.checks[4]; c.methodId = "fixture-test"; c.containment = "declared-contained"; }, "verification-method-not-allowed"],
  ["unknown containment", d => { d.checks[0].containment = "unknown"; }, "verification-effect-or-coverage-unresolved"],
  ["prohibited effect prerequisite", d => { d.checks[0].containment = "prohibited-effect-required"; }, "verification-effect-or-coverage-unresolved"],
  ["uncontained native test", d => { d.checks[0].methodId = "native-test"; }, "verification-containment-inconsistent"],
  ["unexpected containment on review", d => { d.checks[0].containment = "declared-contained"; }, "verification-containment-inconsistent"]
]) test("VP blocks " + name, () => {
  const d = input(); mutate(d); const r = safe(plan(d)); assert.equal(r.state, "blocked"); assert.ok(r.reasons.includes(reason));
});
for (const [name, mutate, reason] of [
  ["rejected", d => { d.checks[0].evidence.provenance = "rejected"; }, "verification-evidence-incompatible"],
  ["incompatible", d => { d.checks[0].evidence.outcome = "incompatible"; }, "verification-evidence-incompatible"],
  ["future", d => { d.checks[0].evidence.observedAt = "2026-10-05T12:00:01Z"; }, "verification-evidence-future"],
  ["expired", d => { d.checks[0].evidence.observedAt = "2026-10-05T10:59:59Z"; }, "verification-evidence-expired"],
  ["wrong scope", d => { d.checks[0].evidence.scopeSha256 = "f".repeat(64); }, "verification-binding-mismatch"],
  ["wrong definition", d => { d.checks[0].evidence.definitionSha256 = "f".repeat(64); }, "verification-binding-mismatch"],
  ["attestation promoted", d => { d.checks[0].evidence.basis = "attestation"; }, "verification-provenance-mismatch"],
  ["structure promoted", d => { d.checks[0].evidence.provenance = "local-structure-observation"; }, "verification-provenance-mismatch"],
  ["wrong method", d => { Object.assign(d.checks[1].evidence, { provenance: "fixture-claim", basis: "fixture-test" }); }, "verification-method-evidence-mismatch"],
  ["changed environment", d => { d.variant.candidate.environmentSha256 = "d".repeat(64); }, "verification-binding-mismatch"],
  ["changed artifact", d => { d.variant.candidate.artifactSha256 = "d".repeat(64); }, "verification-binding-mismatch"],
  ["changed config", d => { d.variant.candidate.configurationSha256 = "d".repeat(64); }, "verification-binding-mismatch"],
  ["changed version", d => { d.variant.candidate.versionReference = "synthetic-version-two"; }, "verification-binding-mismatch"],
  ["changed mode", d => { d.variant.mode = "autonomous"; }, "verification-binding-mismatch"],
  ["changed role", d => { d.variant.role = "reviewer"; }, "verification-binding-mismatch"],
  ["changed check", d => { d.checks[1].methodId = "structure-review"; }, "verification-binding-mismatch"],
  ["changed containment", d => { d.checks[0].containment = "unknown"; }, "verification-binding-mismatch"]
]) test("VP rejects evidence " + name, () => {
  const d = attach(); mutate(d); const r = safe(plan(d)); assert.equal(r.state, "blocked"); assert.ok(r.reasons.includes(reason));
});
test("VP exact freshness bound is allowed, next second blocks", () => {
  const d = attach(); d.variant.now = "2026-10-05T13:00:00Z"; assert.equal(plan(d).state, "plan-review-required");
  d.variant.now = "2026-10-05T13:00:01Z"; assert.equal(plan(d).state, "blocked");
});
test("VP unknown evidence stays unresolved without pretending the plan is implemented", () => {
  const d = attach(); d.checks[0].evidence.outcome = "unknown"; const r = safe(plan(d)); assert.equal(r.state, "plan-review-required");
  assert.equal(r.matrix[0].state, "unresolved"); assert.ok(r.matrix[0].missingEvidence.includes("current-scoped-reference"));
});
test("VP missing structural observations remain concrete per-mechanism findings", () => {
  const d = input(); d.variant.observations = d.variant.observations.filter(o => o.mechanismId !== "session-hooks-disabled");
  const r = safe(plan(d)); assert.equal(r.state, "plan-review-required");
  assert.ok(r.matrix.find(x => x.mechanismId === "session-hooks-disabled").missingEvidence.includes("variant-structural-reference"));
});
test("VP revocation blocks even freshly rebound declarations", () => {
  const c = structuredClone(catalog); c.variantPolicy.revokedReferences = ["e-tools-empty-denied"];
  const p = createIsolatedVerificationPlanner(schema, c), r = safe(p(attach(input(), p)));
  assert.equal(r.state, "blocked"); assert.ok(r.reasons.includes("verification-evidence-revoked"));
});
for (const name of ["catalog", "policy"]) test(`VP changed ${name} invalidates bindings`, () => {
  const c = structuredClone(catalog); if (name === "catalog") c.catalogId = "synthetic-catalog-two"; else c.variantPolicy.policyId = "synthetic-policy-two";
  assert.equal(createIsolatedVerificationPlanner(schema, c)(attach()).state, "blocked");
});
for (const [name, mutate] of [
  ["fake permission", d => { d.permission = true; }], ["argv", d => { d.checks[0].argv = ["synthetic-private"]; }],
  ["raw settings", d => { d.settings = { token: "synthetic-private" }; }], ["account", d => { d.variant.candidate.email = "synthetic-private@example.invalid"; }],
  ["path", d => { d.checks[0].evidence.referenceId = "/synthetic-private"; }], ["URL", d => { d.checks[0].evidence.referenceId = "https://example.invalid"; }],
  ["authenticated evidence", d => { d.checks[0].evidence.authenticated = true; }], ["model catalog override", d => { d.catalog = catalog; }],
  ["native record injection", d => { d.checks[0].evidence.collector = "trusted-collector"; }],
  ["unknown method", d => { d.checks[0].methodId = "execute-helper"; }], ["unknown mechanism", d => { d.checks[0].mechanismId = "bypass-permissions"; }],
  ["unknown phase", d => { d.checks[0].coverage = ["any"]; }], ["coercion", d => { d.variant.now = 1; }],
  ["calendar", d => { d.variant.now = "2026-02-30T00:00:00Z"; }], ["evidence calendar", d => { d.checks[0].evidence.observedAt = "2026-02-29T00:00:00Z"; }],
  ["date offset", d => { d.variant.now = "2026-10-05T12:00:00+00:00"; }], ["surrogate", d => { d.checks[0].evidence.referenceId = "\ud800"; }],
  ["cycle", d => { d.extra = d; }], ["symbol", d => { d[Symbol("secret")] = "synthetic-private"; }],
  ["nonenumerable", d => { Object.defineProperty(d, "extra", { value: "synthetic-private" }); }],
  ["prototype", d => { Object.setPrototypeOf(d, { inherited: "synthetic-private" }); }]
]) test("VP invalid " + name, () => {
  const d = attach(); mutate(d); const r = safe(plan(d)); assert.equal(r.state, "invalid"); assert.equal(r.planSha256, null); assert.equal(r.variantScopeSha256, null);
});
test("VP getters, toJSON and proxy traps are never called", () => {
  let calls = 0; const d = input(); Object.defineProperty(d, "checks", { enumerable: true, get() { calls++; return []; } }); assert.equal(plan(d).state, "invalid");
  const j = input(); j.toJSON = () => { calls++; return input(); }; assert.equal(plan(j).state, "invalid");
  const p = new Proxy({}, { getPrototypeOf() { calls++; return Object.prototype; }, get() { calls++; return null; }, ownKeys() { calls++; return []; } });
  assert.equal(plan(p).state, "invalid"); const n = input(); n.checks[0] = p; assert.equal(plan(n).state, "invalid"); assert.equal(calls, 0);
});
for (const [name, value] of [
  ["null", null], ["undefined", undefined], ["array", []], ["number", 1], ["invalid UTF8", Buffer.from([0xff])],
  ["oversize", " ".repeat(32769)], ["duplicate root", '{"checks":[],"checks":[]}'], ["pollution", '{"__proto__":{}}'],
  ["unsafe constructor", '{"constructor":{}}'], ["BOM", "\ufeff{}"], ["escaped surrogate", '{"value":"\\ud800"}'], ["overflow", '{"n":1e999}']
]) test("VP adversarial " + name, () => assert.equal(safe(plan(value)).state, "invalid"));
test("VP nested duplicate keys cannot hide changed evidence", () => {
  const text = JSON.stringify(attach()).replace('"basis":"documentation"', '"basis":"documentation","\\u0062asis":"documentation"');
  assert.equal(plan(text).state, "invalid");
});
test("VP 32 KiB bound is exact for strings and bytes", () => {
  const text = JSON.stringify(attach()), padded = text + " ".repeat(32768 - Buffer.byteLength(text));
  assert.equal(plan(padded).state, "plan-review-required"); assert.equal(plan(Buffer.from(padded)).state, "plan-review-required");
  assert.equal(plan(padded + " ").state, "invalid"); assert.equal(plan("é".repeat(16385)).state, "invalid");
});
for (const [name, mutate] of [
  ["missing check", c => { c.checks.pop(); }], ["duplicate check", c => { c.checks[1] = structuredClone(c.checks[0]); }],
  ["weakened coverage", c => { c.checks[3].requiredCoverage.pop(); }], ["added method", c => { c.checks[0].allowedMethods.push("structure-review"); }],
  ["removed method", c => { c.checks[0].allowedMethods.pop(); }], ["definition change", c => { c.checks[0].definitionSha256 = "f".repeat(64); }],
  ["extra permission", c => { c.permission = true; }], ["policy missing", c => { delete c.variantPolicy; }],
  ["policy age excess", c => { c.variantPolicy.maxEvidenceAgeSeconds = 3601; }], ["policy coercion", c => { c.variantPolicy.maxEvidenceAgeSeconds = "3600"; }],
  ["schema changed mechanisms", c => { c.variantSchema.$defs.mechanismId.enum[0] = "bypass-permissions"; }],
  ["unsafe ID", c => { c.catalogId = "/synthetic-private"; }]
]) test("VP rejects trusted catalog " + name, () => {
  const c = structuredClone(catalog); mutate(c); assert.throws(() => createIsolatedVerificationPlanner(schema, c), /^Error: Invalid isolated-verification schema or catalog$/);
});
test("VP hostile trusted objects fail without traps or raw errors", () => {
  let calls = 0; const p = new Proxy({}, { getPrototypeOf() { calls++; throw Error("synthetic-private"); } });
  assert.throws(() => createIsolatedVerificationPlanner(schema, p), /Invalid isolated-verification schema or catalog/);
  const c = structuredClone(catalog); Object.defineProperty(c, "catalogId", { enumerable: true, get() { calls++; return "valid"; } });
  assert.throws(() => createIsolatedVerificationPlanner(schema, c), /Invalid isolated-verification schema or catalog/); assert.equal(calls, 0);
});
test("VP reports obey schema, including twelve invalid-input rows", () => {
  const ajv = new Ajv2020({ strict: true }); ajv.addFormat("date-time", () => true); ajv.addSchema(variantSchema); ajv.addSchema(schema);
  const valid = ajv.compile({ $ref: `${VERIFICATION_SCHEMA_ID}#/$defs/report` });
  for (const d of [null, input(), attach()]) { const r = safe(plan(d)); assert.equal(valid(r), true); r.runtimeReady = true; assert.equal(valid(r), false); }
});
test("VP construction and planning perform no IO, network, spawn, current clock or randomness", () => {
  const d = attach(), restores = [], calls = [];
  const replace = (object, key) => { const old = object[key]; if (typeof old !== "function") return;
    object[key] = () => { calls.push(key); throw Error("forbidden " + key); }; restores.push(() => { object[key] = old; }); };
  try {
    for (const key of ["readFileSync", "readFile", "openSync", "open", "writeFileSync", "writeFile", "statSync", "readdirSync"]) replace(fs, key);
    for (const key of ["readFile", "writeFile", "open", "stat", "readdir"]) replace(fsp, key);
    for (const key of ["spawn", "spawnSync", "exec", "execSync", "execFile", "execFileSync", "fork"]) replace(childProcess, key);
    for (const object of [http, https]) for (const key of ["request", "get"]) replace(object, key);
    for (const key of ["connect", "createConnection"]) replace(net, key);
    for (const key of ["randomUUID", "randomBytes", "randomInt", "randomFillSync"]) replace(crypto, key);
    replace(globalThis, "fetch"); replace(Date, "now"); replace(Math, "random"); syncBuiltinESMExports();
    assert.equal(safe(createIsolatedVerificationPlanner(schema, catalog)(d)).state, "plan-review-required"); assert.deepEqual(calls, []);
  } finally { restores.reverse().forEach(fn => fn()); syncBuiltinESMExports(); }
});
