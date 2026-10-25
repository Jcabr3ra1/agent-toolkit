import assert from "node:assert/strict";
import fs from "node:fs";
import fsPromises from "node:fs/promises";
import childProcess from "node:child_process";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import test from "node:test";
import { createClientAdapterPlanner } from "../src/client-adapter-plan.js";
import { createClientRuntimeAdmission } from "../src/client-runtime-admission.js";
import { createClientRuntimeState } from "../src/client-runtime-state.js";
import { validators, hash, CONTROLS, EFFECTS } from "../src/client-runtime-core.js";
import { createModelSelector } from "../src/model-selection.js";

const read = p => JSON.parse(fs.readFileSync(new URL(p, import.meta.url), "utf8"));
const schemas = ["agent-model-selection", "agent-model-preference", "agent-client-adapter", "agent-client-runtime"]
  .map(name => read(`../schemas/${name}.schema.json`));
const select = createModelSelector(schemas[0], schemas[1]);
const plan = createClientAdapterPlanner(...schemas.slice(0, 3));
const admit = createClientRuntimeAdmission(...schemas); const transition = createClientRuntimeState(...schemas);
const valid = validators(...schemas);
const BASE = Object.fromEntries(["request", "catalog", "policy"].map(name => [name, read(`../examples/model-selection/${name}.preference.example.json`)]));
const NOW = "2026-10-02T14:00:00Z"; const LATER = "2026-10-02T14:00:01Z"; const EXPIRES = "2026-10-02T15:00:00Z";
const ROUTES = [["openai", "codex-cli", "codex-native"], ["anthropic", "claude-code", "claude-native"]];
const temporal = () => ({ checkedAt: NOW, expiresAt: EXPIRES, evidenceRef: "demo-evidence" });
const assessment = () => ({ ...temporal(), status: "locally-tested", source: "installation-test" });
const get = (v, path) => path.split(".").reduce((v, k) => v[k], v);
const set = (v, path, value) => { const keys = path.split("."); const last = keys.pop(); keys.reduce((v, k) => v[k], v)[last] = value; };
function renew(f) {
  f.planningInput.decision = select(f.planningInput.selection); f.plan = plan(f.planningInput);
  f.evidence.binding.identity = structuredClone(f.plan.identity); f.evidence.binding.planSha256 = hash(f.plan); return f;
}
function fixture(route = ROUTES[0]) {
  const [provider, client, variant] = route; const selection = structuredClone(BASE);
  Object.assign(selection.request, { provider, client }); selection.request.requirements.tools = [];
  selection.catalog.profiles.forEach((p, i) => {
    Object.assign(p, { provider, client, requestedModel: `demo-model-${i}` });
    p.declaredCapabilities.tools = []; p.verifiedCapabilities.tools = [];
  });
  selection.policy.routes.forEach(r => { Object.assign(r, { provider, client }); });
  const descriptor = { provider, client, variant, clientVersion: "0.0.0-demo" };
  const planningInput = {
    schemaVersion: "1.0.0", selection, decision: {}, adapter: descriptor,
    registry: { schemaVersion: "1.0.0", registryId: "demo-registry", revision: "r01", records: [{
      recordId: "demo-evaluation", ...descriptor, status: "evaluated", supportedModels: selection.catalog.profiles.map(p => p.requestedModel),
      efforts: ["brief", "standard", "deep"], roles: ["tutor", "proposer", "reviewer"], controls: CONTROLS.slice(0, 7), evaluatedAt: NOW, evidenceRefs: ["demo-control-evidence"] }] },
    context: { scope: "text-only", promptRef: "demo-prompt", provenance: { checkedAt: NOW, evidenceRef: "demo-context" },
      authorization: { status: "approved", referenceId: selection.request.authorizationContext.referenceId, checkedAt: NOW, evidenceRef: "demo-approval" } },
    environment: { access: "subscription-session", externalBilling: "disabled", controls: CONTROLS.slice(0, 7), checkedAt: NOW, evidenceRef: "demo-admission" },
    historyEvidence: { status: "reconciled", history: selection.request.history, checkedAt: NOW, evidenceRef: "demo-ledger" },
    limits: { maxTurns: 1, timeoutSeconds: 60, maxOutputBytes: 8192, maxLineBytes: 1024, maxEvents: 100, maxStderrBytes: 1024 }
  };
  const expectedInstallation = { installationId: "demo-installation", client: descriptor, platform: "darwin", artifactSha256: "a".repeat(64), controlRevision: "r01" };
  const ledger = { schemaVersion: "1.0.0", projectId: selection.request.projectId, taskId: selection.request.taskId, revision: 0,
    status: "reconciled", importEvidenceRef: "demo-import", importedHistory: structuredClone(selection.request.history),
    importedMainStartsUsed: 0, history: structuredClone(selection.request.history), mainStartsUsed: 0,
    limits: { maxMainStarts: 3, maxModelCalls: 3, maxDurationSeconds: 900 }, attempts: [] };
  const evidence = {
    binding: { ...structuredClone(expectedInstallation), identity: {}, planSha256: "a".repeat(64) }, installation: assessment(),
    authorization: { ...temporal(), status: "approved", referenceId: planningInput.context.authorization.referenceId,
      revoked: false, effectsApproved: [...EFFECTS], limits: structuredClone(ledger.limits) },
    access: { assessment: assessment(), access: "subscription-session", externalBilling: "disabled" },
    context: { assessment: assessment(), promptRef: "demo-prompt", promptSha256: "b".repeat(64), promptBytes: 100 },
    controls: CONTROLS.map(controlId => ({ controlId, assessment: assessment() })),
    effects: EFFECTS.map(effectId => ({ effectId, disposition: "allowed", assessment: assessment() })),
    accounting: { assessment: assessment(), maxCallsPerStart: 2, limitEnforced: true }
  };
  // Everything here is declared fiction, never an admission for a real client.
  return renew({ schemaVersion: "1.0.0", now: NOW, planningInput, plan: {}, expectedInstallation, evidence, ledger });
}
function checkAdmission(f, state, reason) {
  const r = admit(f); assert.equal(r.state, state, JSON.stringify(r)); assert.equal(valid.admissionReport(r), true);
  if (reason) assert.ok(r.reasons.includes(reason), JSON.stringify(r.reasons));
  if (state !== "eligible-for-reservation") assert.equal(r.reservation, null);
  assert.equal(r.executed, false); assert.equal(r.runtimeReady, false); assert.equal(r.verifiedAdmission, false);
  return r;
}
function action(ledger, operation, attemptId = "demo-attempt") {
  return { schemaVersion: "1.0.0", operation, now: NOW, ledger: structuredClone(ledger),
    expectedRevision: ledger.revision, expectedLedgerSha256: hash(ledger), attemptId };
}
function reserve(f = fixture(), attemptId = "demo-attempt") {
  const a = action(f.ledger, "reserve", attemptId); a.admissionInput = f; return a;
}
function checkState(a, state, reason) {
  const r = transition(a); assert.equal(r.state, state, JSON.stringify(r)); assert.equal(valid.stateReport(r), true);
  if (reason) assert.ok(r.reasons.includes(reason), JSON.stringify(r.reasons));
  if (state !== "proposed") { assert.equal(r.nextLedger, null); assert.equal(r.compareAndSwap, null); }
  assert.equal(r.executed, false); assert.equal(r.runtimeReady, false); assert.equal(r.persisted, false); assert.equal(r.verifiedAdmission, false);
  return r;
}
function settlement(ledger, observation = "started", calls = 1, seconds = 10) {
  return { ...action(ledger, "settle"), startObservation: observation, actualCalls: calls, actualSeconds: seconds,
    outcome: observation === "started" ? "completed" : "not-started", terminationConfirmed: true,
    reconciliation: { ...temporal(), status: "approved", referenceId: "demo-reconciliation", source: "operator-attestation", revoked: false,
      projectId: ledger.projectId, taskId: ledger.taskId, attemptId: "demo-attempt", ledgerSha256: hash(ledger) } };
}
function withLedger(f, ledger) {
  f.ledger = structuredClone(ledger); f.planningInput.selection.request.history = structuredClone(ledger.history);
  f.planningInput.historyEvidence.history = structuredClone(ledger.history); return renew(f);
}

for (const route of ROUTES) test(`C1-RC01/04: ${route[1]} declara elegibilidad, no autorización`, () => {
  const f = fixture(route); const before = structuredClone(f); const r = checkAdmission(f, "eligible-for-reservation");
  assert.equal(r.reservation.calls, 2); assert.equal(r.reservation.seconds, 60); assert.ok(r.externalGates.includes("atomic-durable-reservation"));
  assert.deepEqual(f, before); assert.deepEqual(admit(f), r); assert.equal(r.audit.planSha256, hash(f.plan));
});
for (const key of ["expectedInstallation", "evidence", "ledger"]) test(`C1-RC01: falta ${key} no se inventa`, () => {
  const f = fixture(); delete f[key]; const r = checkAdmission(f, "needs-info", "runtime-evidence-missing"); assert.ok(r.missing.includes(key));
});
for (const [path, value, reason] of [
  ["evidence.binding.planSha256", "c".repeat(64), "runtime-evidence-binding-mismatch"],
  ["evidence.binding.identity.revision", "r99", "runtime-evidence-binding-mismatch"],
  ["evidence.binding.client.clientVersion", "0.0.1-demo", "runtime-installation-mismatch"],
  ["expectedInstallation.artifactSha256", "c".repeat(64), "runtime-installation-mismatch"],
  ["expectedInstallation.installationId", "another", "runtime-installation-mismatch"],
  ["expectedInstallation.platform", "linux", "runtime-installation-mismatch"],
  ["expectedInstallation.controlRevision", "r02", "runtime-installation-mismatch"],
  ["evidence.authorization.status", "denied", "runtime-authorization-not-current"],
  ["evidence.authorization.status", "pending", "runtime-authorization-not-current"],
  ["evidence.authorization.revoked", true, "runtime-authorization-not-current"],
  ["evidence.authorization.referenceId", "foreign-approval", "runtime-authorization-not-current"],
  ["evidence.authorization.effectsApproved", [], "runtime-effects-not-authorized"],
  ["evidence.authorization.limits.maxMainStarts", 4, "runtime-budget-authorization-mismatch"],
  ["evidence.access.access", "api-key", "runtime-access-or-billing-unconfirmed"],
  ["evidence.access.externalBilling", "enabled", "runtime-access-or-billing-unconfirmed"],
  ["evidence.access.externalBilling", "unknown", "runtime-access-or-billing-unconfirmed"],
  ["evidence.context.promptRef", "foreign-prompt", "runtime-context-mismatch-or-stale"],
  ["evidence.accounting.maxCallsPerStart", null, "runtime-call-ceiling-unconfirmed"],
  ["evidence.accounting.limitEnforced", false, "runtime-call-ceiling-unconfirmed"],
  ["ledger.taskId", "foreign-task", "runtime-ledger-identity-mismatch"],
  ["ledger.status", "reconciliation-required", "runtime-reconciliation-required"]
]) test(`C1-RC01/02/04: bloquea ${path}=${JSON.stringify(value)}`, () => { const f = fixture(); set(f, path, value); checkAdmission(f, "blocked", reason); });

for (const location of ["installation", "access.assessment", "context.assessment", "accounting.assessment", "controls.0.assessment", "effects.0.assessment"]) {
  for (const status of ["documented", "pending", "rejected"]) test(`C1-RC01/02: ${location} ${status} no equivale a probado`, () => {
    const f = fixture(); set(f.evidence, location + ".status", status); checkAdmission(f, "blocked");
  });
  for (const [label, key, value] of [
    ["caducada", "expiresAt", NOW], ["futura", "checkedAt", LATER], ["antigua", "checkedAt", "2026-10-02T12:00:00Z"],
    ["vigencia inversa", "expiresAt", "2026-10-02T13:00:00Z"], ["solo documentación", "source", "provider-documentation"]
  ]) test(`C1-RC01: ${location} ${label}`, () => { const f = fixture(); set(f.evidence, location + "." + key, value); checkAdmission(f, "blocked"); });
}
for (const control of CONTROLS) test(`C1-RC02: falta control preventivo ${control}`, () => {
  const f = fixture(); f.evidence.controls = f.evidence.controls.filter(c => c.controlId !== control); checkAdmission(f, "blocked", "runtime-controls-not-tested-or-fresh");
});
for (const effect of EFFECTS) for (const disposition of ["unknown", "rejected"]) test(`C1-RC02: efecto ${effect} ${disposition}`, () => {
  const f = fixture(); f.evidence.effects.find(e => e.effectId === effect).disposition = disposition; checkAdmission(f, "blocked", "runtime-native-effects-unconfirmed");
});
test("C1-RC01: evidencia duplicada no da dos votos a un control", () => {
  const f = fixture(); f.evidence.controls[1] = structuredClone(f.evidence.controls[0]); checkAdmission(f, "invalid", "duplicate-runtime-evidence");
});
test("C1-RC01: plan entero alterado y plan no preparado no habilitan", () => {
  const f = fixture(); f.plan.reasons.push("forged"); checkAdmission(f, "invalid", "runtime-plan-mismatch");
  const g = fixture(); g.planningInput.environment.externalBilling = "unknown"; renew(g); checkAdmission(g, "blocked", "runtime-plan-not-prepared");
});
test("C1-RC01: evidencia original se revalida al instante declarado, sin refrescar fechas", () => {
  const f = fixture(); f.now = "2026-10-02T14:51:00Z";
  checkAdmission(f, "blocked", "runtime-plan-evidence-stale-or-future");
  const g = fixture(); g.now = "2026-10-02T13:59:59Z"; checkAdmission(g, "blocked", "runtime-evaluation-stale-or-future");
  const h = fixture(); h.evidence.authorization.expiresAt = NOW; checkAdmission(h, "blocked", "runtime-authorization-not-current");
});
for (const [field, amount, reason] of [["maxMainStarts", 0, "runtime-budget-insufficient"], ["maxModelCalls", 1, "runtime-budget-insufficient"],
  ["maxDurationSeconds", 59, "runtime-budget-insufficient"], ["maxModelCalls", 4, "runtime-budget-exceeds-policy"], ["maxDurationSeconds", 901, "runtime-budget-exceeds-policy"]]) {
  test(`C1-RC04: presupuesto ${field}=${amount}`, () => {
    const f = fixture(); f.ledger.limits[field] = amount; f.evidence.authorization.limits[field] = amount; checkAdmission(f, "blocked", reason);
  });
}
test("C1-RC04: historial importado no desaparece ni se confunde con arranques", () => {
  const f = fixture(); Object.assign(f.ledger.importedHistory, { executionsUsed: 1, durationUsedSeconds: 840 });
  f.ledger.history = structuredClone(f.ledger.importedHistory); f.ledger.importedMainStartsUsed = 1; f.ledger.mainStartsUsed = 1;
  withLedger(f, f.ledger); checkAdmission(f, "eligible-for-reservation");
  f.ledger.history.executionsUsed = 0; checkAdmission(f, "invalid", "ledger-total-mismatch");
});
test("C1-RC04: snapshot conciliado distinto del selector bloquea", () => {
  const f = fixture(); f.ledger.history.executionsUsed = 1; f.ledger.importedHistory.executionsUsed = 1;
  checkAdmission(f, "blocked", "runtime-history-mismatch");
});

test("C1-RC04/05: reserva propuesta con CAS, sin persistir ni mutar", () => {
  const a = reserve(); const before = structuredClone(a); const r = checkState(a, "proposed");
  assert.equal(r.nextLedger.revision, 1); assert.equal(r.nextLedger.attempts[0].reservedCalls, 2); assert.equal(r.nextLedger.history.executionsUsed, 0);
  assert.equal(r.compareAndSwap.expectedSha256, hash(a.ledger)); assert.equal(r.compareAndSwap.nextSha256, hash(r.nextLedger));
  assert.deepEqual(a, before); assert.deepEqual(transition(a), r);
});
test("C1-RC04/05: segundo escritor necesita CAS real, nunca se simula exclusión efectiva", () => {
  const f = fixture(); const a = reserve(f); const b = reserve(structuredClone(f), "second");
  const first = checkState(a, "proposed"); const second = checkState(b, "proposed");
  assert.equal(second.persisted, false); assert.equal(first.compareAndSwap.expectedSha256, second.compareAndSwap.expectedSha256);
  b.ledger = first.nextLedger; checkState(b, "blocked", "runtime-snapshot-conflict");
  const current = withLedger(fixture(), first.nextLedger); checkAdmission(current, "blocked", "runtime-active-reservation");
});
test("C1-RC04: reserva debe usar el mismo ledger e instante de admisión", () => {
  const a = reserve(); a.admissionInput.ledger.revision = 1; checkState(a, "blocked", "runtime-admission-snapshot-conflict");
  const b = reserve(); b.admissionInput.now = LATER; checkState(b, "blocked", "runtime-admission-snapshot-conflict");
  const c = reserve(); c.admissionInput.evidence.accounting.limitEnforced = false; checkState(c, "blocked", "runtime-reservation-not-eligible");
});
test("C1-RC04: arranque declarado retiene reserva, cuenta proceso pero no inventa llamadas", () => {
  const reserved = checkState(reserve(), "proposed").nextLedger;
  const started = checkState(action(reserved, "mark-started"), "proposed").nextLedger;
  assert.equal(started.mainStartsUsed, 1); assert.equal(started.history.executionsUsed, 0); assert.equal(started.status, "reconciliation-required");
  checkAdmission(withLedger(fixture(), started), "blocked", "runtime-reconciliation-required");
  checkState(action(started, "mark-started"), "blocked", "runtime-start-observation-conflict");
});
for (const phase of ["reserved", "started"]) test(`C1-RC04/06: interrupción en ${phase} conserva cupo incierto`, () => {
  let ledger = checkState(reserve(), "proposed").nextLedger;
  if (phase === "started") ledger = checkState(action(ledger, "mark-started"), "proposed").nextLedger;
  const next = checkState(action(ledger, "interrupt"), "proposed").nextLedger;
  assert.equal(next.attempts[0].startObservation, phase === "started" ? "started" : "unknown");
  assert.equal(next.attempts[0].reservedCalls, 2); assert.equal(next.status, "reconciliation-required");
  checkAdmission(withLedger(fixture(), next), "blocked", "runtime-reconciliation-required");
  checkState(action(next, "interrupt"), "blocked", "runtime-attempt-already-interrupted");
});
for (const outcome of ["completed", "failed", "canceled", "timed-out"]) test(`C1-RC04/06: concilia ${outcome} sin borrar consumo`, () => {
  const reserved = checkState(reserve(), "proposed").nextLedger; const started = checkState(action(reserved, "mark-started"), "proposed").nextLedger;
  const a = settlement(started); a.outcome = outcome; const next = checkState(a, "proposed").nextLedger;
  assert.equal(next.history.executionsUsed, 1); assert.equal(next.history.durationUsedSeconds, 10); assert.equal(next.mainStartsUsed, 1);
  assert.equal(next.history.previousProfileId, started.attempts[0].profileId); assert.equal(next.status, "reconciled");
  checkState(settlement(next), "blocked", "runtime-attempt-already-settled");
});
test("C1-RC04: prueba de no-arranque requiere permiso y consumo cero", () => {
  const ledger = checkState(reserve(), "proposed").nextLedger;
  const next = checkState(settlement(ledger, "not-started", 0, 0), "proposed").nextLedger;
  assert.equal(next.mainStartsUsed, 0); assert.equal(next.history.executionsUsed, 0); assert.equal(next.attempts.length, 1);
  checkState(settlement(ledger, "not-started", 1, 0), "blocked", "runtime-not-started-consumption-conflict");
  const started = checkState(action(ledger, "mark-started"), "proposed").nextLedger;
  checkState(settlement(started, "not-started", 0, 0), "blocked", "runtime-start-observation-conflict");
});
for (const [key, value, reason] of [
  ["terminationConfirmed", false, "runtime-reconciliation-not-authorized-or-terminated"],
  ["reconciliation.status", "pending", "runtime-reconciliation-not-authorized-or-terminated"],
  ["reconciliation.revoked", true, "runtime-reconciliation-not-authorized-or-terminated"],
  ["reconciliation.expiresAt", NOW, "runtime-reconciliation-not-authorized-or-terminated"],
  ["reconciliation.checkedAt", "2026-10-02T12:00:00Z", "runtime-reconciliation-not-authorized-or-terminated"],
  ["reconciliation.taskId", "foreign-task", "runtime-reconciliation-binding-mismatch"],
  ["reconciliation.attemptId", "another", "runtime-reconciliation-binding-mismatch"],
  ["reconciliation.ledgerSha256", "c".repeat(64), "runtime-reconciliation-binding-mismatch"]
]) test(`C1-RC04: conciliación ${key} rechazada`, () => {
  const ledger = checkState(reserve(), "proposed").nextLedger; const a = settlement(ledger); set(a, key, value); checkState(a, "blocked", reason);
});
test("C1-RC04: exceso se registra entero y mantiene bloqueo", () => {
  const ledger = checkState(reserve(), "proposed").nextLedger;
  const next = checkState(settlement(ledger, "started", 4, 70), "proposed").nextLedger;
  assert.equal(next.history.executionsUsed, 4); assert.equal(next.history.durationUsedSeconds, 70); assert.equal(next.status, "reconciliation-required");
  const f = fixture(); f.ledger = next; checkAdmission(f, "blocked", "runtime-reconciliation-required");
});
test("C1-RC04: otra revisión o cliente no puede resetear el ledger", () => {
  const ledger = checkState(settlement(checkState(reserve(), "proposed").nextLedger), "proposed").nextLedger;
  const f = withLedger(fixture(ROUTES[1]), ledger); f.planningInput.selection.request.revision = "r02"; renew(f);
  const r = checkAdmission(f, "eligible-for-reservation"); assert.equal(r.reservation.calls, 2);
  assert.equal(f.ledger.history.executionsUsed, 1); assert.equal(f.ledger.mainStartsUsed, 1);
});
for (const [label, change, reason] of [
  ["totales", l => { l.mainStartsUsed = 1; }, "ledger-total-mismatch"],
  ["historial", l => { l.history.durationUsedSeconds = 1; }, "ledger-total-mismatch"],
  ["duplicados", l => { l.attempts.push(structuredClone(l.attempts[0])); }, "duplicate-ledger-attempt"],
  ["tarea ajena", l => { l.attempts[0].identity.taskId = "foreign"; }, "foreign-ledger-attempt"],
  ["incertidumbre oculta", l => { l.attempts[0].state = "started"; l.attempts[0].startObservation = "started"; l.mainStartsUsed = 1; }, "ledger-uncertainty-hidden"],
  ["tiempo futuro", l => { l.attempts[0].updatedAt = LATER; }, "ledger-chronology-conflict"],
  ["consumo en reserva", l => { l.attempts[0].actualCalls = 1; }, "unsettled-consumption-present"]
]) test(`C1-RC02/04: ledger corrupto ${label}`, () => {
  const ledger = checkState(reserve(), "proposed").nextLedger; change(ledger);
  checkState(action(ledger, "interrupt"), "invalid", reason);
});
test("C1-RC04: revision/hash obsoletos y límite de revisión no se sobrescriben", () => {
  const a = reserve(); a.expectedRevision = 1; checkState(a, "blocked", "runtime-snapshot-conflict");
  const b = reserve(); b.expectedLedgerSha256 = "c".repeat(64); checkState(b, "blocked", "runtime-snapshot-conflict");
  const f = fixture(); f.ledger.revision = 1000000; checkState(reserve(f), "blocked", "runtime-revision-limit");
});
for (const [label, change] of [
  ["getter", f => Object.defineProperty(f, "extra", { enumerable: true, get() { throw Error("getter executed"); } })],
  ["proxy", f => { f.evidence = new Proxy(f.evidence, { ownKeys() { throw Error("proxy executed"); } }); }],
  ["cycle", f => { f.extra = f; }], ["toJSON", f => { f.toJSON = () => { throw Error("toJSON executed"); }; }],
  ["extra secret", f => { f.secret = "private-never-echo"; }], ["date invalid", f => { f.now = "2026-02-30T14:00:00Z"; }],
  ["coercion", f => { f.evidence.accounting.maxCallsPerStart = "2"; }], ["too many", f => { f.evidence.controls = Array(257).fill(f.evidence.controls[0]); }],
  ["unsafe key", f => Object.defineProperty(f, "__proto__", { enumerable: true, value: {} })],
  ["deep", f => { let v = f; for (let i = 0; i < 70; i++) { v.extra = {}; v = v.extra; } }],
  ["huge", f => { f.extra = "x".repeat(2_000_001); }], ["unicode timestamp", f => { f.now += "\ud800"; }]
]) test(`C1-RC02/09: entrada ${label} no ejecuta hooks ni filtra datos`, () => {
  const f = fixture(); change(f); const r = checkAdmission(f, "invalid"); assert.equal(JSON.stringify(r).includes("private-never-echo"), false);
});
test("C1-RC01: mutar salida no cambia entrada ni siguientes propuestas", () => {
  const f = fixture(); const before = structuredClone(f); const r = admit(f); r.reservation.model = "changed";
  assert.deepEqual(f, before); assert.notEqual(admit(f).reservation.model, "changed");
  const a = reserve(); const s = transition(a); s.nextLedger.attempts[0].model = "changed";
  assert.notEqual(transition(a).nextLedger.attempts[0].model, "changed");
  const reversed = Object.fromEntries(Object.entries(f).reverse()); assert.deepEqual(admit(reversed), admit(f));
});
for (const observation of ["started", "not-started"]) test(`C1-RC04/06: recuperación de arranque desconocido como ${observation}`, () => {
  const reserved = checkState(reserve(), "proposed").nextLedger;
  const interrupted = checkState(action(reserved, "interrupt"), "proposed").nextLedger;
  const a = settlement(interrupted, observation, observation === "started" ? 1 : 0, observation === "started" ? 10 : 0);
  const next = checkState(a, "proposed").nextLedger;
  assert.equal(next.mainStartsUsed, observation === "started" ? 1 : 0);
  assert.equal(next.status, "reconciled"); assert.equal(next.attempts.length, 1);
  checkAdmission(withLedger(fixture(), next), "eligible-for-reservation");
});
test("C1-RC04: exceso mayor que los límites del selector se conserva sin ampliar permisos", () => {
  const ledger = checkState(reserve(), "proposed").nextLedger;
  const next = checkState(settlement(ledger, "started", 101, 86401), "proposed").nextLedger;
  assert.equal(next.history.executionsUsed, 101); assert.equal(next.history.durationUsedSeconds, 86401);
  assert.equal(next.status, "reconciliation-required"); assert.equal(valid.ledger(next), true);
  checkAdmission(withLedger(fixture(), next), "invalid", "invalid-admission-input");
});
test("C1-RC04: suma fuera del formato bloquea sin recortar ni cambiar el snapshot", () => {
  const ledger = checkState(reserve(), "proposed").nextLedger;
  ledger.importedHistory.executionsUsed = 1; ledger.history.executionsUsed = 1;
  const a = settlement(ledger, "started", 1000000, 10); const before = structuredClone(a);
  checkState(a, "invalid", "ledger-counter-limit"); assert.deepEqual(a, before);
});
test("C1-RC04: capacidad completa mantiene todos los intentos y bloquea otra reserva", () => {
  const ledger = checkState(settlement(checkState(reserve(), "proposed").nextLedger, "not-started", 0, 0), "proposed").nextLedger;
  const template = structuredClone(ledger.attempts[0]);
  ledger.attempts = Array.from({ length: 128 }, (_, i) => ({ ...structuredClone(template), attemptId: `attempt-${i}` }));
  const f = withLedger(fixture(), ledger); checkAdmission(f, "blocked", "runtime-ledger-capacity");
  checkState(reserve(f, "new-attempt"), "blocked", "runtime-reservation-not-eligible");
  assert.equal(ledger.attempts.length, 128);
});
for (const [label, change, reason] of [
  ["dos activos", l => { l.attempts.push({ ...structuredClone(l.attempts[0]), attemptId: "second" }); }, "multiple-active-attempts"],
  ["fechas inversas", l => { l.attempts[0].reservedAt = LATER; }, "ledger-chronology-conflict"],
  ["reserva iniciada", l => { l.attempts[0].startObservation = "started"; }, "invalid-reserved-attempt"],
  ["inicio sin observación", l => { l.attempts[0].state = "started"; }, "invalid-started-attempt"],
  ["interrupción sin incertidumbre", l => { l.attempts[0].state = "reconciliation-required"; }, "invalid-interrupted-attempt"],
  ["cierre sin prueba", l => { l.attempts[0].state = "settled"; }, "unproven-settlement"]
]) test(`C1-RC04: relaciones de ledger ${label}`, () => {
  const ledger = checkState(reserve(), "proposed").nextLedger; change(ledger);
  checkState(action(ledger, "interrupt"), "invalid", reason);
});
test("C1-RC04: intento siguiente no puede solaparse con el anterior", () => {
  const reserved = checkState(reserve(), "proposed").nextLedger;
  const a = settlement(reserved, "not-started", 0, 0); a.now = LATER;
  const ledger = checkState(a, "proposed").nextLedger;
  const second = { ...structuredClone(ledger.attempts[0]), attemptId: "second", reservedAt: NOW, updatedAt: LATER };
  ledger.attempts.push(second);
  const op = action(ledger, "interrupt"); op.now = LATER;
  checkState(op, "invalid", "ledger-chronology-conflict");
});
for (const [label, change] of [
  ["getter", a => Object.defineProperty(a, "extra", { enumerable: true, get() { throw Error("getter executed"); } })],
  ["proxy", a => { a.ledger = new Proxy(a.ledger, { ownKeys() { throw Error("proxy executed"); } }); }],
  ["cycle", a => { a.extra = a; }], ["operación desconocida", a => { a.operation = "launch"; }],
  ["coerción", a => { a.expectedRevision = "0"; }], ["contador no finito", a => { a.ledger.mainStartsUsed = NaN; }],
  ["fecha inválida", a => { a.now = "2026-02-30T14:00:00Z"; }],
  ["dato extra privado", a => { a.secret = "private-never-echo"; }]
]) test(`C1-RC02/09: transición rechaza ${label} sin hooks ni datos privados`, () => {
  const a = reserve(); change(a); const r = checkState(a, "invalid");
  assert.equal(JSON.stringify(r).includes("private-never-echo"), false);
});
test("C1-RC01/04: frontera de vigencia inclusiva por edad, exclusiva por vencimiento", () => {
  const f = fixture(); f.evidence.authorization.checkedAt = "2026-10-02T13:00:00Z";
  checkAdmission(f, "eligible-for-reservation"); f.evidence.authorization.checkedAt = "2026-10-02T12:59:59Z";
  checkAdmission(f, "blocked", "runtime-authorization-not-current");
  const ledger = checkState(reserve(), "proposed").nextLedger; const a = settlement(ledger);
  a.reconciliation.checkedAt = "2026-10-02T13:00:00Z"; checkState(a, "proposed");
  a.reconciliation.checkedAt = "2026-10-02T12:59:59Z";
  checkState(a, "blocked", "runtime-reconciliation-not-authorized-or-terminated");
});
test("C1-RC01/04: el esquema no permite ejecutar, persistir o emitir autorización verificada", () => {
  for (const change of [r => { r.executed = true; }, r => { r.runtimeReady = true; }, r => { r.verifiedAdmission = true; }, r => { r.reservation = null; }]) {
    const r = admit(fixture()); change(r); assert.equal(valid.admissionReport(r), false);
  }
  const r = transition(reserve()); r.persisted = true; assert.equal(valid.stateReport(r), false);
});
test("C1-RC01/09: fábricas y operaciones no intentan IO, red, procesos, reloj o azar", () => {
  const f = fixture(); const a = reserve(f); const startedInput = action(checkState(a, "proposed").nextLedger, "mark-started");
  const schemaBefore = structuredClone(schemas); const restore = []; let attempts = 0;
  function forbid(obj, keys) { for (const k of keys) {
    if (typeof obj[k] !== "function") continue; const prior = obj[k]; obj[k] = () => { attempts++; throw Error(`Forbidden ${k}`); }; restore.push(() => { obj[k] = prior; });
  } }
  try {
    forbid(fs, ["readFileSync", "writeFileSync", "openSync", "readdirSync", "statSync", "realpathSync"]);
    forbid(fsPromises, ["readFile", "writeFile", "open", "readdir", "stat", "realpath", "mkdir", "rename"]);
    forbid(childProcess, ["exec", "execSync", "spawn", "spawnSync", "execFile", "execFileSync", "fork"]);
    forbid(http, ["request", "get"]); forbid(https, ["request", "get"]); forbid(net, ["connect", "createConnection"]);
    forbid(globalThis, ["fetch", "setTimeout", "setInterval"]); forbid(Date, ["now"]); forbid(Math, ["random"]);
    const pureAdmit = createClientRuntimeAdmission(...schemas); const pureState = createClientRuntimeState(...schemas);
    assert.equal(pureAdmit(f).state, "eligible-for-reservation"); assert.equal(pureState(a).state, "proposed"); assert.equal(pureState(startedInput).state, "proposed");
    assert.equal(attempts, 0); assert.deepEqual(schemas, schemaBefore);
  } finally { restore.reverse().forEach(fn => fn()); }
});
