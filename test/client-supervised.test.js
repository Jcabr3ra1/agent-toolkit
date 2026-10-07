import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import fsPromises from "node:fs/promises";
import childProcess from "node:child_process";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import crypto from "node:crypto";
import { performance } from "node:perf_hooks";
import Ajv2020 from "ajv/dist/2020.js";
import { createClientSupervisedEvaluator } from "../src/client-supervised.js";
import { CONTROLS, EFFECTS, hash } from "../src/client-runtime-core.js";

const schema = JSON.parse(fs.readFileSync(new URL("../schemas/agent-client-supervised.schema.json", import.meta.url), "utf8"));
const LIMITS = { maxMainStarts: 1, maxConcurrent: 1, maxRetries: 0, maxCorrections: 0, timeoutSeconds: 120,
  terminationGraceSeconds: 2, maxInputBytes: 16384, maxStdoutBytes: 262144, maxStderrBytes: 32768,
  maxEventBytes: 32768, maxEvents: 512, maxNativeTurns: 1 };
const POLICY = { maxEvidenceAgeSeconds: 3600, revokedEvidenceRefs: [], limits: LIMITS };
const NOW = "2026-10-04T14:00:00Z", EXPIRY = "2026-10-04T15:00:00Z";
const evaluate = createClientSupervisedEvaluator(schema, POLICY);
const ajv = new Ajv2020({ strict: true }); ajv.addFormat("date-time", true); ajv.addSchema(schema);
const validReport = ajv.compile({ $ref: `${schema.$id}#/$defs/report` });
const CONTROL_IDS = CONTROLS.filter(id => id !== "internal-call-limit");
const get = (o, path) => path.split(".").reduce((v, k) => v[k], o);
const set = (o, path, value) => { const keys = path.split("."); const key = keys.pop(); keys.reduce((v, k) => v[k], o)[key] = value; };
const clone = v => structuredClone(v);

function assessments(f) {
  return [f.selection?.assessment, f.context?.assessment, f.authorization?.assessment, f.limitations?.assessment,
    f.history?.assessment, f.installation?.assessment, ...(f.controls ?? []).map(c => c.assessment),
    ...(f.effects ?? []).map(e => e.assessment), f.access?.assessment, f.access?.billingAssessment].filter(Boolean);
}
function rebind(f, policy = POLICY) {
  const summary = value => { if (!value) return null; const { assessment, billingAssessment, ...declaration } = value; return declaration; };
  const ordered = (items, key) => (items ?? []).map(summary).sort((a, b) => a[key] < b[key] ? -1 : a[key] > b[key] ? 1 : 0);
  const authorization = summary(f.authorization);
  if (authorization) authorization.effectsApproved = [...authorization.effectsApproved].sort();
  const scope = hash({ profile: f.profile, intentId: f.intentId, identity: f.identity,
    selection: summary(f.selection), binding: f.binding ?? null, expectedBinding: f.expectedBinding ?? null,
    limits: f.limits ?? null, context: summary(f.context), authorization,
    limitations: summary(f.limitations), history: summary(f.history), access: summary(f.access),
    controls: ordered(f.controls, "controlId"), effects: ordered(f.effects, "effectId"),
    observations: [...(f.observations ?? [])].sort(), policySha256: hash(policy) });
  for (const a of assessments(f)) a.scopeSha256 = scope;
  return f;
}
// Synthetic evidence only: no real models, installations, accounts or approvals.
function fixture() {
  const stamp = (id, source = "installation-test") => ({ status: "confirmed", source,
    checkedAt: NOW, expiresAt: EXPIRY, evidenceRef: `demo-${id}`, scopeSha256: "d".repeat(64) });
  const binding = { provider: "anthropic", client: "claude-code", variantId: "demo-variant", clientVersion: "0.0.0-demo",
    platform: "darwin", architecture: "arm64", installationId: "demo-installation", artifactSha256: "a".repeat(64),
    configurationSha256: "b".repeat(64), environmentSha256: "c".repeat(64), controlRevision: "demo-r01" };
  return rebind({ schemaVersion: "1.0.0", profile: "supervised-subscription", intentId: "demo-intent", now: NOW,
    identity: { projectId: "demo-project", taskId: "demo-task", taskRevision: 1, role: "tutor", mode: "tutor" },
    binding, expectedBinding: clone(binding), limits: clone(LIMITS),
    selection: { provider: "anthropic", client: "claude-code", profileId: "demo-profile", model: "demo-model-v2", effort: "medium",
      source: "operator-choice", assessment: stamp("selection", "operator-attestation") },
    context: { promptRef: "demo-prompt", promptSha256: "e".repeat(64), inputBytes: 256, assessment: stamp("context") },
    authorization: { status: "approved", profile: "supervised-subscription", writer: "user", effectsApproved: [...EFFECTS],
      limits: clone(LIMITS), assessment: stamp("authorization", "operator-attestation") },
    limitations: { internalCallsUnknownAccepted: true, remoteCancellationUnknownAccepted: true, assessment: stamp("limitations", "operator-attestation") },
    history: { projectId: "demo-project", taskId: "demo-task", mainStartsUsed: 0, durationUsedSeconds: 0,
      actualModelCalls: null, state: "clear", assessment: stamp("history") },
    installation: { assessment: stamp("installation") },
    controls: CONTROL_IDS.map(controlId => ({ controlId, mechanismId: `demo-${controlId}`, positiveEvidenceRef: `positive-${controlId}`,
      negativeEvidenceRef: `negative-${controlId}`, assessment: stamp(controlId) })),
    effects: EFFECTS.map(effectId => ({ effectId, presence: "present", disposition: "allowed", assessment: stamp(effectId) })),
    access: { method: "subscription-session", externalBilling: "disabled", assessment: stamp("access", "operator-attestation"),
      billingAssessment: stamp("billing", "operator-attestation") }, observations: [] });
}
function check(input, state, reason, evaluator = evaluate) {
  const r = evaluator(input); assert.equal(r.state, state, JSON.stringify(r)); assert.equal(validReport(r), true);
  if (reason) assert.ok(r.reasons.includes(reason), JSON.stringify(r));
  for (const field of ["executed", "runtimeReady", "verifiedAdmission", "externalBillingVerified", "selectionVerified", "remoteCancellationVerified"]) assert.equal(r[field], false);
  assert.equal(r.internalCallCeiling, null); assert.equal(r.profile, "supervised-subscription");
  for (const field of ["ticket", "reservation", "argv", "permit", "actualModelCalls"]) assert.equal(field in r, false);
  assert.deepEqual(r.reasons, [...new Set(r.reasons)].sort()); assert.deepEqual(r.missing, [...new Set(r.missing)].sort());
  return r;
}
function freeze(v) { if (v && typeof v === "object") { Object.values(v).forEach(freeze); Object.freeze(v); } return v; }

test("S1: favorable is declaration review, deterministic, inert and non-mutating", () => {
  const f = fixture(), original = clone(f); freeze(f); const r = check(f, "ready-for-supervised-review", "supervised-declarations-only");
  assert.deepEqual(evaluate(f), r); assert.deepEqual(f, original); assert.equal(r.audit.inputSha256, hash(f));
  for (const input of [JSON.stringify(f), Buffer.from(JSON.stringify(f)), new Uint8Array(Buffer.from(JSON.stringify(f)))]) assert.deepEqual(evaluate(input), r);
  assert.deepEqual(evaluate(Object.fromEntries(Object.entries(f).reverse())), r);
  r.externalGates.pop(); r.reasons.push("caller-mutation"); assert.notDeepEqual(evaluate(f), r);
});
test("S1: C1 controls untouched; only this schema excludes the internal call ceiling", () => {
  assert.equal(CONTROLS.length, 11); assert.ok(CONTROLS.includes("internal-call-limit"));
  assert.deepEqual(schema.$defs.controlId.enum, CONTROL_IDS); assert.deepEqual(schema.$defs.effectId.enum, EFFECTS);
});
test("S1: minimal well-formed identity reports missing declarations", () => {
  const { schemaVersion, profile, intentId, now, identity } = fixture(); const r = check({ schemaVersion, profile, intentId, now, identity }, "incomplete");
  assert.ok(r.missing.includes("authorization")); assert.ok(r.missing.includes("binding"));
});
for (const section of ["selection", "binding", "expectedBinding", "limits", "context", "authorization", "limitations", "history", "installation", "controls", "effects", "access", "observations"]) {
  test(`S1: section missing ${section} never favorable`, () => { const f = fixture(); delete f[section]; rebind(f);
    const r = check(f, section === "authorization" ? "blocked" : "incomplete"); assert.ok(r.missing.includes(section)); });
}
for (const id of CONTROL_IDS) test(`S1: missing control ${id}`, () => { const f = fixture(); f.controls = f.controls.filter(c => c.controlId !== id); rebind(f);
  assert.ok(check(f, "incomplete").missing.includes(`controls.${id}`)); });
for (const id of EFFECTS) test(`S1: missing effect ${id}`, () => { const f = fixture(); f.effects = f.effects.filter(e => e.effectId !== id); rebind(f);
  assert.ok(check(f, "incomplete").missing.includes(`effects.${id}`)); });
for (const section of ["controls", "effects"]) test(`S1: duplicated ${section} invalid`, () => {
  const f = fixture(); f[section][1] = clone(f[section][0]); check(f, "invalid", section === "controls" ? "duplicate-supervised-control" : "duplicate-supervised-effect");
});

const LOCATIONS = ["selection.assessment", "context.assessment", "authorization.assessment", "limitations.assessment", "history.assessment",
  "installation.assessment", "controls.0.assessment", "effects.0.assessment", "access.assessment", "access.billingAssessment"];
for (const path of LOCATIONS) {
  for (const status of ["pending", "documented"]) test(`S1: ${path} ${status} not promoted`, () => {
    const f = fixture(); set(f, `${path}.status`, status); const original = clone(f); check(f, "incomplete"); assert.deepEqual(f, original);
  });
  test(`S1: ${path} rejected blocks`, () => { const f = fixture(); set(f, `${path}.status`, "rejected"); check(f, "blocked"); });
  test(`S1: ${path} reference missing`, () => { const f = fixture(); set(f, `${path}.evidenceRef`, null); check(f, "incomplete"); });
  for (const [label, key, value] of [["future", "checkedAt", "2026-10-04T14:00:01Z"], ["expired", "expiresAt", NOW],
    ["old", "checkedAt", "2026-10-04T12:59:59Z"], ["reversed", "expiresAt", "2026-10-04T13:59:59Z"], ["wrong scope", "scopeSha256", "f".repeat(64)]]) {
    test(`S1: ${path} ${label}`, () => { const f = fixture(); set(f, `${path}.${key}`, value); check(f, "blocked"); });
  }
  test(`S1: ${path} revoked`, () => { const f = fixture(); const policy = { ...clone(POLICY), revokedEvidenceRefs: [get(f, path).evidenceRef] };
    rebind(f, policy); check(f, "blocked", undefined, createClientSupervisedEvaluator(schema, policy)); });
  test(`S1: ${path} documentation cannot confirm`, () => { const f = fixture(); set(f, `${path}.source`, "provider-documentation"); check(f, "blocked"); });
}
for (const path of ["authorization.assessment", "limitations.assessment"]) test(`S1: ${path} must be human attestation`, () => {
  const f = fixture(); set(f, `${path}.source`, "installation-test"); check(f, "blocked");
});
for (const path of ["installation.assessment", "controls.0.assessment", "effects.0.assessment"]) test(`S1: ${path} operator claim cannot confirm native controls`, () => {
  const f = fixture(); set(f, `${path}.source`, "operator-attestation"); check(f, "blocked");
});
for (const path of ["access.assessment", "access.billingAssessment", "history.assessment", "context.assessment"]) test(`S1: ${path} attestation stays a declaration`, () => {
  const f = fixture(); set(f, `${path}.source`, "operator-attestation"); check(f, "ready-for-supervised-review");
});
test("S1: evidence boundary age inclusive and expiry exclusive", () => {
  const f = fixture(); for (const a of assessments(f)) a.checkedAt = "2026-10-04T13:00:00Z";
  check(f, "ready-for-supervised-review"); f.now = "2026-10-04T14:00:01Z"; check(f, "blocked");
  const g = fixture(); g.now = EXPIRY; check(g, "blocked");
});
for (const [path, value, reason] of [
  ["authorization.status", "pending", "supervised-authorization-not-approved"], ["authorization.status", "denied", "supervised-authorization-not-approved"],
  ["authorization.writer", "agent", "supervised-tutor-authority-conflict"], ["limitations.internalCallsUnknownAccepted", false, "supervised-limitations-not-accepted"],
  ["limitations.remoteCancellationUnknownAccepted", false, "supervised-limitations-not-accepted"], ["access.method", "api-key", "supervised-subscription-required"],
  ["access.method", "unknown", "supervised-subscription-required"], ["access.externalBilling", "enabled", "supervised-external-billing-not-disabled"],
  ["access.externalBilling", "unknown", "supervised-external-billing-not-disabled"], ["history.state", "active", "supervised-history-reconciliation-required"],
  ["history.state", "reconciliation-required", "supervised-history-reconciliation-required"], ["history.taskId", "other-task", "supervised-history-identity-mismatch"],
  ["history.projectId", "other-project", "supervised-history-identity-mismatch"], ["history.mainStartsUsed", 1, "supervised-budget-exhausted"],
  ["history.durationUsedSeconds", 1, "supervised-history-counters-inconsistent"], ["history.actualModelCalls", 1, "supervised-history-counters-inconsistent"]
]) test(`S1: block ${path}=${value}`, () => { const f = fixture(); set(f, path, value); check(f, "blocked", reason); });
test("S1: accepting remote limitations never authorizes external billing", () => {
  const f = fixture(); f.access.externalBilling = "enabled"; check(f, "blocked", "supervised-external-billing-not-disabled");
});
test("S1: started uncertain history persists and cannot restart on revision", () => {
  const f = fixture(); f.history.mainStartsUsed = 1; f.history.actualModelCalls = null; f.identity.taskRevision = 2; rebind(f);
  check(f, "blocked", "supervised-prior-consumption-unresolved");
});
for (const role of ["proposer", "reviewer"]) for (const mode of ["tutor", "autonomous"]) test(`S1: textual ${role}/${mode} grants no apply permission`, () => {
  const f = fixture(); f.identity.role = role; f.identity.mode = mode; f.authorization.writer = mode === "tutor" ? "user" : "agent"; rebind(f);
  check(f, "ready-for-supervised-review");
});
test("S1: tutor role cannot request autonomous", () => { const f = fixture(); f.identity.mode = "autonomous"; rebind(f); check(f, "blocked", "supervised-tutor-mode-conflict"); });
for (const key of Object.keys(fixture().binding)) test(`S1: binding mismatch ${key}`, () => {
  const f = fixture(); const other = { provider: "anthropic", client: "claude-code", variantId: "other-variant", clientVersion: "0.0.1-demo",
    platform: "linux", architecture: "x64", installationId: "other-installation", artifactSha256: "f".repeat(64), configurationSha256: "f".repeat(64),
    environmentSha256: "f".repeat(64), controlRevision: "other-revision" };
  if (["provider", "client"].includes(key)) { f.expectedBinding[key] = "other"; check(f, "invalid"); }
  else { f.expectedBinding[key] = other[key]; check(f, "blocked", "supervised-binding-mismatch"); }
});
for (const [path, value] of [["intentId", "other-intent"], ["identity.taskRevision", 2], ["identity.taskId", "other-task"],
  ["selection.model", "demo-other-model-v3"], ["selection.effort", "high"], ["context.promptRef", "other-prompt"],
  ["context.promptSha256", "f".repeat(64)], ["binding.controlRevision", "other-revision"], ["limits.timeoutSeconds", 119]]) {
  test(`S1: full scope binds ${path}`, () => { const f = fixture(); set(f, path, value); check(f, "blocked"); });
}
for (const id of EFFECTS) {
  for (const [key, value] of [["presence", "unknown"], ["disposition", "unknown"], ["disposition", "rejected"]]) test(`S1: effect ${id} ${key} ${value} blocks`, () => {
    const f = fixture(); f.effects.find(e => e.effectId === id)[key] = value; check(f, "blocked", `supervised-effect-unconfirmed:${id}`);
  });
  test(`S1: effect ${id} permission must be explicit`, () => { const f = fixture(); f.authorization.effectsApproved = f.authorization.effectsApproved.filter(e => e !== id);
    check(f, "blocked", `supervised-effect-not-authorized:${id}`); });
  test(`S1: effect ${id} absent not authorized for later activation`, () => {
    const f = fixture(); f.effects.find(e => e.effectId === id).presence = "absent"; f.authorization.effectsApproved = f.authorization.effectsApproved.filter(e => e !== id);
    rebind(f); check(f, ["native-auth", "provider-inference"].includes(id) ? "blocked" : "ready-for-supervised-review");
  });
}
for (const key of ["mechanismId", "positiveEvidenceRef", "negativeEvidenceRef"]) {
  test(`S1: control missing ${key}`, () => { const f = fixture(); f.controls[0][key] = null; rebind(f); check(f, "incomplete"); });
  if (key !== "mechanismId") test(`S1: control proof revoked ${key}`, () => {
    const f = fixture(), policy = { ...clone(POLICY), revokedEvidenceRefs: [f.controls[0][key]] }; rebind(f, policy);
    check(f, "blocked", undefined, createClientSupervisedEvaluator(schema, policy));
  });
}
for (const model of ["latest", "default", "opus", "sonnet", "haiku", "fable", "demo-latest", "latest-demo-model"]) test(`S1: mobile alias ${model} blocked`, () => {
  const f = fixture(); f.selection.model = model; rebind(f); check(f, "blocked", "supervised-model-not-pinned");
});
test("S1: operator choice cannot pretend installation-sourced selection", () => { const f = fixture(); f.selection.assessment.source = "installation-test";
  check(f, "blocked", "supervised-selection-source-conflict"); });
test("S1: selector recommendation remains unverified here", () => {
  const f = fixture(); f.selection.source = "selector-recommendation"; rebind(f); check(f, "ready-for-supervised-review");
});
for (const [path, value] of [["authorization.effectsApproved", []], ["authorization.writer", "agent"],
  ["limitations.internalCallsUnknownAccepted", false], ["history.actualModelCalls", 0], ["access.externalBilling", "enabled"],
  ["controls.0.mechanismId", "other-mechanism"], ["controls.0.positiveEvidenceRef", "other-proof"], ["effects.2.presence", "absent"]]) {
  test(`S1: reused attestations cannot cover changed declaration ${path}`, () => {
    const f = fixture(); set(f, path, value); check(f, "blocked");
  });
}
test("S1: normalized control/effect sets preserve scope without mutating their order", () => {
  const f = fixture(), before = evaluate(f); f.controls.reverse(); f.effects.reverse(); f.authorization.effectsApproved.reverse();
  const original = clone(f), after = check(f, "ready-for-supervised-review");
  assert.equal(after.audit.scopeSha256, before.audit.scopeSha256); assert.deepEqual(f, original);
});
test("S1: unknown accounting stays unknown, no budget certificate in report", () => {
  const f = fixture(); check(f, "ready-for-supervised-review"); assert.equal(f.history.actualModelCalls, null);
  const text = JSON.stringify(evaluate(f));
  for (const forbidden of ["demo-installation", "demo-model-v2", "demo-prompt", "positive-no-tools", "subscription-session", "clientVersion"]) assert.equal(text.includes(forbidden), false);
  f.internalCallCeiling = 1; check(f, "invalid");
});
for (const code of schema.$defs.observations.items.enum) test(`S1: unresolved ${code}`, () => { const f = fixture(); f.observations.push(code); check(f, "blocked", `supervised-unresolved:${code}`); });
test("S1: precedence invalid > blocked > incomplete and missing still shown", () => {
  const f = fixture(); f.controls = []; f.access.externalBilling = "enabled";
  assert.equal(check(f, "blocked").missing.length, 10); f.extra = "secret-sentinel";
  assert.equal(JSON.stringify(check(f, "invalid")).includes("secret-sentinel"), false);
});
for (const key of Object.keys(LIMITS)) {
  test(`S1: limit ${key} rejects coercion`, () => { const f = fixture(); f.limits[key] = String(f.limits[key]); check(f, "invalid"); });
  test(`S1: limit ${key} rejects excess`, () => { const f = fixture(); f.limits[key] = LIMITS[key] + 1; check(f, "invalid"); });
}
test("S1: limits below trust maxima supported without unapproved replacement", () => {
  const f = fixture(); f.limits.timeoutSeconds = 60; f.authorization.limits = clone(f.limits); rebind(f); check(f, "ready-for-supervised-review");
  f.authorization.limits.timeoutSeconds = 59; check(f, "blocked", "supervised-authorization-limits-mismatch");
});
test("S1: trusted policy may be tighter", () => {
  const f = fixture(), policy = clone(POLICY); policy.limits.timeoutSeconds = 60; rebind(f, policy);
  check(f, "blocked", "supervised-limits-exceed-policy", createClientSupervisedEvaluator(schema, policy));
});
test("S1: termination grace within deadline", () => { const f = fixture(); f.limits.timeoutSeconds = 2; f.authorization.limits = clone(f.limits); rebind(f);
  check(f, "blocked", "supervised-grace-outside-deadline"); });
test("S1: context must fit explicit input budget", () => { const f = fixture(); f.limits.maxInputBytes = 255; f.authorization.limits = clone(f.limits); rebind(f);
  check(f, "blocked", "supervised-context-exceeds-budget"); });
test("S1: event cannot exceed stdout budget", () => { const f = fixture(); f.limits.maxStdoutBytes = 32; f.authorization.limits = clone(f.limits); rebind(f);
  check(f, "blocked", "supervised-event-limit-inconsistent"); });
for (const [path, value] of [["schemaVersion", "2.0.0"], ["profile", "strict"], ["identity.taskRevision", 0], ["identity.role", "executor"],
  ["now", "2026-02-30T14:00:00Z"], ["now", "2026-10-04T14:00:00.001Z"], ["now", "2026-10-04T09:00:00-05:00"],
  ["binding.clientVersion", "unknown"], ["binding.clientVersion", "latest"], ["binding.artifactSha256", "A".repeat(64)],
  ["history.mainStartsUsed", -1], ["history.actualModelCalls", "1"], ["history.actualModelCalls", 1.5], ["selection.effort", "ultracode"],
  ["observations", ["arbitrary-command"]], ["observations", ["privacy-unresolved", "privacy-unresolved"]]]) {
  test(`S1: invalid ${path}`, () => { const f = fixture(); set(f, path, value); check(f, "invalid"); });
}
for (const section of ["", "identity", "binding", "expectedBinding", "selection", "limits", "context", "history", "authorization", "limitations",
  "installation", "access", "controls.0", "effects.0", "access.billingAssessment", "authorization.assessment"]) test(`S1: extra field ${section || "root"} never leaks`, () => {
  const f = fixture(); (section ? get(f, section) : f).argv = "secret-sentinel";
  assert.equal(JSON.stringify(check(f, "invalid")).includes("secret-sentinel"), false);
});
for (const value of [null, undefined, true, false, 1, "null", "[]", "{}", 1n, NaN, Infinity, Symbol("secret"), new Date(0), () => {}]) {
  test(`S1: invalid root ${typeof value} ${String(value)}`, () => check(value, "invalid"));
}
for (const encoded of ['{"schemaVersion":"1.0.0","schemaVersion":"1.0.0"}', '{"nested":{"a":1,"\\u0061":2}}', '{"__proto__":{}}',
  '{"nested":{"constructor":{}}}', '{"nested":{"prototype":{}}}', '{"s":"\\ud800"}', '{"n":1e999}', '{"n":1e-999}', '{}{}', '{"x":1,}', '\uFEFF{}']) {
  test(`S1: adversarial JSON ${encoded}`, () => check(encoded, "invalid"));
}
test("S1: getters proxies conversions never execute", () => {
  let invoked = 0; const f = fixture(); Object.defineProperty(f, "extra", { enumerable: true, get() { invoked++; throw Error("sentinel"); } });
  check(f, "invalid"); const g = fixture(); g.toJSON = () => { invoked++; return fixture(); }; check(g, "invalid");
  const proxy = new Proxy(fixture(), { get() { invoked++; throw Error("sentinel"); }, ownKeys() { invoked++; throw Error("sentinel"); } }); check(proxy, "invalid");
  const revoked = Proxy.revocable({}, {}); revoked.revoke(); check(revoked.proxy, "invalid"); assert.equal(invoked, 0);
});
test("S1: cycles symbols prototypes hidden keys sparse arrays invalid", () => {
  const f = fixture(); f.extra = f; check(f, "invalid"); const g = fixture(); Object.setPrototypeOf(g, { secret: true }); check(g, "invalid");
  const h = fixture(); h[Symbol("secret")] = true; check(h, "invalid"); const j = fixture(); Object.defineProperty(j, "extra", { value: "secret" }); check(j, "invalid");
  const k = fixture(); k.controls = Array(10); check(k, "invalid");
});
test("S1: bounded bytes Unicode arrays nodes depth", () => {
  check("x".repeat(131073), "invalid"); check(Buffer.from([0xff]), "invalid"); check(new DataView(new ArrayBuffer(1)), "invalid");
  class CustomBytes extends Uint8Array {} check(new CustomBytes([123, 125]), "invalid");
  const f = fixture(); f.extra = "🙂".repeat(40000); check(f, "invalid"); const g = fixture(); g.extra = Array(257).fill(0); check(g, "invalid");
  const h = fixture(); let node = h; for (let i = 0; i < 66; i++) { node.extra = {}; node = node.extra; } check(h, "invalid");
  const j = fixture(); j.extra = Object.fromEntries(Array.from({ length: 30001 }, (_, i) => [`k${i}`, 1])); check(j, "invalid");
  const k = fixture(); k.selection.model = "\ud800"; check(k, "invalid");
  check('{"s":"a\nb"}', "invalid"); check('{"extra":' + '['.repeat(66) + '0' + ']'.repeat(66) + '}', "invalid");
});
test("S1: construction copies schema policy and rejects malformed trust configuration", () => {
  const policy = clone(POLICY), contract = clone(schema), evaluator = createClientSupervisedEvaluator(contract, policy);
  policy.revokedEvidenceRefs.push("demo-selection"); policy.limits.timeoutSeconds = 2; contract.$defs.input.required.push("extra");
  check(fixture(), "ready-for-supervised-review", undefined, evaluator);
  for (const bad of [null, {}, { ...clone(POLICY), maxEvidenceAgeSeconds: 0 }, { ...clone(POLICY), maxEvidenceAgeSeconds: "3600" },
    { ...clone(POLICY), extra: true }, { ...clone(POLICY), revokedEvidenceRefs: ["same", "same"] }, { ...clone(POLICY), revokedEvidenceRefs: Array(257).fill("demo") },
    { ...clone(POLICY), limits: { ...clone(LIMITS), timeoutSeconds: 2 } }, { ...clone(POLICY), limits: { ...clone(LIMITS), maxStdoutBytes: 32 } }]) {
    assert.throws(() => createClientSupervisedEvaluator(schema, bad));
  }
  for (const bad of [null, {}, { ...clone(schema), $id: "other" }]) assert.throws(() => createClientSupervisedEvaluator(bad, POLICY));
});
test("S1: no IO network spawn current clock or randomness after imports", () => {
  const f = fixture(), text = JSON.stringify(f), restorers = []; let calls = 0;
  const guard = (object, key) => { const descriptor = Object.getOwnPropertyDescriptor(object, key);
    if (!descriptor || typeof descriptor.value !== "function" || !descriptor.configurable) return;
    Object.defineProperty(object, key, { ...descriptor, value() { calls++; throw Error(`Unexpected effect: ${key}`); } });
    restorers.push(() => Object.defineProperty(object, key, descriptor)); };
  try {
    for (const object of [fs, fsPromises]) for (const key of Object.keys(object)) if (!/^[A-Z]/.test(key)) guard(object, key);
    for (const key of ["spawn", "spawnSync", "exec", "execSync", "execFile", "execFileSync", "fork"]) guard(childProcess, key);
    for (const object of [http, https]) for (const key of ["request", "get"]) guard(object, key);
    for (const key of ["connect", "createConnection", "createServer"]) guard(net, key);
    for (const key of ["randomBytes", "randomFill", "randomFillSync", "randomUUID", "randomInt"]) guard(crypto, key);
    for (const key of ["fetch", "setTimeout", "setInterval", "setImmediate"]) guard(globalThis, key);
    guard(Date, "now"); guard(Math, "random"); guard(process, "hrtime"); guard(performance, "now");
    const NativeDate = globalThis.Date;
    globalThis.Date = new Proxy(NativeDate, { construct(target, args) { if (!args.length) { calls++; throw Error("Current clock forbidden"); }
      return Reflect.construct(target, args); }, apply() { calls++; throw Error("Current clock forbidden"); } });
    restorers.push(() => { globalThis.Date = NativeDate; });
    const evaluator = createClientSupervisedEvaluator(schema, POLICY);
    assert.equal(evaluator(f).state, "ready-for-supervised-review"); assert.equal(evaluator(text).state, "ready-for-supervised-review");
    assert.equal(evaluator({}).state, "invalid"); assert.equal(calls, 0);
  } finally { restorers.reverse().forEach(restore => restore()); }
});
