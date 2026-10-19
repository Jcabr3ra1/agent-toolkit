import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import Ajv2020 from "ajv/dist/2020.js";
import { APPROVALS_ID, LIMITS, approvalHash, createTaskApprovals, parseApprovalInput } from "../src/task-approvals.js";

const schema = JSON.parse(fs.readFileSync(new URL("../schemas/agent-task-approvals.schema.json", import.meta.url), "utf8"));
const api = createTaskApprovals(schema);
const ajv = new Ajv2020({ strict: true, allErrors: false });
ajv.addSchema(structuredClone(schema));
const validReport = ajv.compile({ $ref: `${APPROVALS_ID}#/$defs/report` });

const H = c => c.repeat(64);
const T = s => new Date(Date.UTC(2026, 9, 18, 14, 0, s)).toISOString().replace(".000Z", "Z");

// Every fixture is a function so no scenario can alias or mutate another scenario's data.
const items = () => [{ path: "src/task-approvals.js", action: "create" }, { path: "test/task-approvals.test.js", action: "create" }];
const docs = () => [{ path: "docs/agent-task-approvals.md", action: "create" }];
const schemaItem = () => [{ path: "schemas/agent-task-approvals.schema.json", action: "create" }];
const checks = () => ["node-test-approvals"];
const effects = () => ["workspace-write", "test-execution"];
const writeOnly = () => ["workspace-write"];

const scope = (patch = {}) => ({
  projectId: "agent-toolkit", taskId: "task-approval-registry",
  recipient: { client: "claude-code", role: "proposer", mode: "autonomous" },
  paths: [...items(), ...docs(), ...schemaItem()], checks: checks(), effects: effects(),
  limits: { maxOperations: 2, maxRetries: 1, maxCorrections: 1 }, validFrom: T(0), expiresAt: T(3600), ...patch
});
const request = (patch = {}) => {
  const e = {
    eventId: "ev-request", type: "request", requestId: "req-1", at: T(0), scope: scope(),
    artifact: { revision: "r02", sha256: H("a"), qualityReviewRef: "qr-1" },
    baseBinding: { initialSha256: H("b"), transitions: [{ fromSha256: H("b"), toSha256: H("c") }] }, ...patch
  };
  return { ...e, scopeSha256: patch.scopeSha256 ?? approvalHash(e.scope) };
};
const request2 = (at, patch = {}) => request({ eventId: "ev-request-2", requestId: "req-2", at: T(at), ...patch });
const decision = (patch = {}, req = request()) => ({
  eventId: "ev-decision", type: "decision", requestId: req.requestId, at: T(1), decision: "approve",
  requestSha256: approvalHash(req), responseRef: "resp-1", ...patch
});
const decision2 = (at, req, patch = {}) => decision({ eventId: "ev-decision-2", at: T(at), responseRef: "resp-2", ...patch }, req);
const reserve = (patch = {}) => ({
  eventId: "ev-reserve", type: "reserve", requestId: "req-1", at: T(2), operationId: "op-1", retryOf: null,
  artifactRevision: "r02", expectedBaseSha256: H("b"), items: items(), checks: checks(), effects: effects(), ...patch
});
const start = (patch = {}) => ({ eventId: "ev-start", type: "start", requestId: "req-1", at: T(3), operationId: "op-1", ...patch });
const interrupt = (patch = {}) => ({ eventId: "ev-interrupt", type: "interrupt", requestId: "req-1", at: T(4), operationId: "op-1", evidenceRef: "evid-2", ...patch });
const result = (patch = {}) => ({
  eventId: "ev-result", type: "result", requestId: "req-1", at: T(4), operationId: "op-1", outcome: "succeeded",
  resultingBaseSha256: H("c"), evidenceRef: "evid-1", ...patch
});
const termination = (patch = {}) => ({
  reservationEventId: "ev-reserve", priorEventId: "ev-interrupt", previousState: "indeterminate", decisionRef: "dec-1",
  observation: "termination-observed", evidenceRef: "evid-3", ...patch
});
const nonStart = (patch = {}) => ({
  reservationEventId: "ev-reserve", priorEventId: "ev-interrupt", previousState: "indeterminate", decisionRef: "dec-1",
  observation: "non-start-confirmed", inspectedBaseSha256: H("b"), evidenceRef: "evid-4", ...patch
});
const reconcile = (patch = {}) => ({
  eventId: "ev-reconcile", type: "reconcile", requestId: "req-1", at: T(5), operationId: "op-1", resolution: "finished-failed",
  resultingBaseSha256: null, evidence: termination(), ...patch
});
const correction = (patch = {}) => ({
  eventId: "ev-correction", type: "correction", requestId: "req-1", at: T(2), scopeSha256: approvalHash(scope()),
  previousRevision: "r02", artifact: { revision: "r03", sha256: H("d"), qualityReviewRef: "qr-2" }, ...patch
});
const revoke = (patch = {}) => ({ eventId: "ev-revoke", type: "revoke", requestId: "req-1", at: T(5), responseRef: "resp-9", ...patch });
const close = (patch = {}) => ({ eventId: "ev-close", type: "close", requestId: "req-1", at: T(5), reason: "completed", ...patch });
const query = (patch = {}) => ({
  requestId: "req-1", operationId: null, recipient: scope().recipient, items: items(), checks: checks(), effects: effects(),
  observedBaseSha256: H("b"), artifact: { revision: "r02", sha256: H("a") }, retryOf: null, ...patch
});

const approved = () => { const req = request(); return [req, decision({}, req)]; };
const approvedWith = patch => { const req = request({ scope: scope(patch) }); return [req, decision({}, req)]; };
const tight = () => approvedWith({ limits: { maxOperations: 1, maxRetries: 0, maxCorrections: 0 } });

// Exact envelopes per API: the closed schema is never relaxed to accept another API's fields.
const historyOf = events => ({ projectId: "agent-toolkit", taskId: "task-approval-registry", events: structuredClone(events) });
const checkpointOf = history => ({ revision: history.events.length, historySha256: approvalHash(history) });
const replayEnvelope = events => { const history = historyOf(events); return { schemaVersion: "1.0.0", history, checkpoint: checkpointOf(history) }; };
const proposeEnvelope = (events, event) => ({ ...replayEnvelope(events), event: structuredClone(event) });
const coverEnvelope = (events, patch = {}, now = T(10)) => ({ ...replayEnvelope(events), now, query: query(patch) });
const replay = events => api.replay(replayEnvelope(events));
const propose = (events, event) => api.propose(proposeEnvelope(events, event));
const cover = (events, patch, now) => api.cover(coverEnvelope(events, patch, now));
const verdict = r => [r.state, r.reasons[0]];
const COVERED = ["declared-covered", "declared-data-match"];
const noAuthority = r => {
  assert.equal(r.authorityVerified, false);
  assert.equal(r.executionAuthorized, false);
  assert.equal(r.persisted, false);
  assert.equal(r.nativeExecuted, false);
  assert.notEqual(r.state, "covered");
};
const code = c => e => e.code === c;

test("RA-01/RA-10 una aprobación declarada solo produce cobertura declarada, sin autoridad", () => {
  const r = cover(approved());
  assert.deepEqual(verdict(r), COVERED);
  assert.deepEqual(r.remaining, { operations: 2, corrections: 1, retries: 1 });
  noAuthority(r);
});

test("RA-01 consultar archivos dentro de una operación no consume otro uso ni añade eventos", () => {
  const events = [...approved(), reserve()];
  const first = cover(events, { operationId: "op-1", items: [items()[0]], checks: [], effects: writeOnly() });
  const second = cover(events, { operationId: "op-1", items: [items()[1]], checks: [], effects: writeOnly() });
  assert.deepEqual(verdict(first), COVERED);
  assert.deepEqual(verdict(second), COVERED);
  assert.equal(first.remaining.operations, 1);
  assert.equal(second.remaining.operations, 1);
  assert.equal(second.revision, events.length);
  assert.deepEqual(verdict(cover(events)), ["blocked", "operation-in-progress"]);
});

test("sin decisión o sin solicitud se pide aprobación", () => {
  assert.deepEqual(verdict(cover([request()])), ["approval-needed", "decision-pending"]);
  assert.deepEqual(verdict(cover([])), ["approval-needed", "request-missing"]);
  assert.deepEqual(verdict(cover(approved(), { requestId: "req-other" })), ["approval-needed", "request-missing"]);
});

test("RA-03 denegado, revocado y cerrado no quedan cubiertos; la decisión inicial es única", () => {
  const denied = () => [request(), decision({ decision: "deny" })];
  const second = () => decision({ eventId: "ev-decision-2", responseRef: "resp-2", at: T(2) });
  assert.deepEqual(verdict(cover(denied())), ["blocked", "denied"]);
  assert.deepEqual(verdict(cover([...approved(), revoke()])), ["blocked", "revoked"]);
  assert.deepEqual(verdict(cover([...approved(), close()])), ["blocked", "closed"]);
  assert.deepEqual(verdict(replay([...denied(), second()])), ["blocked", "decision-conflict"]);
  assert.deepEqual(verdict(replay([...approved(), second()])), ["blocked", "decision-conflict"]);
  assert.deepEqual(verdict(replay([...denied(), revoke({ at: T(2) })])), ["blocked", "terminal-conflict"]);
  const twice = [...approved(), revoke({ at: T(2) }), revoke({ eventId: "ev-revoke-2", responseRef: "resp-10", at: T(3) })];
  assert.deepEqual(verdict(replay(twice)), ["blocked", "terminal-conflict"]);
});

test("RA-03/P6 la vigencia es [validFrom, expiresAt)", () => {
  assert.deepEqual(verdict(cover(approved(), {}, T(3599))), COVERED);
  assert.deepEqual(verdict(cover(approved(), {}, T(3600))), ["approval-needed", "expired"]);
  assert.deepEqual(verdict(cover(approvedWith({ validFrom: T(100) }), {}, T(50))), ["blocked", "not-yet-valid"]);
});

test("P6 un reloj retrocedido bloquea", () => {
  assert.deepEqual(verdict(cover(approved(), {}, T(0))), ["blocked", "clock-regression"]);
  assert.deepEqual(verdict(replay([...approved(), reserve({ at: T(0) })])), ["blocked", "clock-regression"]);
});

test("RA-03 el presupuesto agotado deja de cubrir", () => {
  const two = [
    ...approved(), reserve(), start(), result(),
    reserve({ eventId: "ev-reserve-2", operationId: "op-2", at: T(5), expectedBaseSha256: H("c"), items: docs(), checks: [], effects: writeOnly() }),
    start({ eventId: "ev-start-2", operationId: "op-2", at: T(6) }),
    result({ eventId: "ev-result-2", operationId: "op-2", at: T(7), resultingBaseSha256: H("c") })
  ];
  const r = cover(two, { items: schemaItem(), checks: [], effects: writeOnly(), observedBaseSha256: H("c") });
  assert.deepEqual(verdict(r), ["approval-needed", "budget-exhausted"]);
  assert.equal(r.remaining.operations, 0);
});

test("P2 una operación finalizada no se vuelve a ejecutar por conservar el sí", () => {
  const done = () => [...approved(), reserve(), start(), result()];
  assert.deepEqual(verdict(cover(done(), { observedBaseSha256: H("c") })), ["blocked", "operation-already-finished"]);
  assert.deepEqual(verdict(cover(done(), { operationId: "op-1", observedBaseSha256: H("c") })), ["blocked", "operation-finished"]);
  assert.deepEqual(verdict(cover(done())), ["blocked", "base-diverged"]);
});

test("P2 un reintento es otra operación, declarada y dentro del ámbito", () => {
  const failed = () => [...approved(), reserve(), start(), result({ outcome: "failed", resultingBaseSha256: null })];
  assert.deepEqual(verdict(cover(failed())), ["blocked", "undeclared-retry"]);
  assert.deepEqual(verdict(cover(failed(), { retryOf: "op-1" })), COVERED);
  assert.deepEqual(verdict(cover(failed(), { retryOf: "op-9" })), ["blocked", "invalid-retry"]);
  const noRetry = approvedWith({ limits: { maxOperations: 2, maxRetries: 0, maxCorrections: 1 } });
  const failedNoRetry = [...noRetry, reserve(), start(), result({ outcome: "failed", resultingBaseSha256: null })];
  assert.deepEqual(verdict(cover(failedNoRetry, { retryOf: "op-1" })), ["approval-needed", "retry-not-allowed"]);
  const retry = reserve({ eventId: "ev-reserve-2", operationId: "op-2", at: T(5), retryOf: "op-1" });
  assert.equal(propose(failed(), retry).state, "proposed");
  const view = replay([...failed(), retry]).view.requests[0];
  assert.deepEqual(view.remaining, { operations: 0, corrections: 1, retries: 0 });
});

test("RA-05/RA-06 una sola reserva abierta; interrumpida exige conciliación y no devuelve cupo", () => {
  const second = reserve({ eventId: "ev-reserve-2", operationId: "op-2", at: T(3) });
  assert.deepEqual(verdict(propose([...tight(), reserve()], second)), ["blocked", "operation-in-progress"]);
  const interrupted = () => [...approved(), reserve(), start(), interrupt()];
  assert.deepEqual(verdict(cover(interrupted())), ["reconciliation-required", "reconciliation-required"]);
  assert.deepEqual(verdict(cover(interrupted(), { operationId: "op-1" })), ["reconciliation-required", "reconciliation-required"]);
  assert.equal(cover(interrupted()).remaining.operations, 1);
  const settled = () => [...interrupted(), reconcile()];
  assert.deepEqual(verdict(cover(settled(), { retryOf: "op-1" })), COVERED);
  assert.equal(cover(settled()).remaining.operations, 1);
});

test("RA-04 un evento duplicado es no-op; mismo ID con otro contenido y respuesta repetida bloquean", () => {
  const plain = replay(approved());
  const dup = replay([...approved(), decision()]);
  assert.equal(dup.state, "reduced");
  assert.equal(dup.view.duplicatesIgnored, 1);
  assert.deepEqual(dup.view.requests, plain.view.requests);
  assert.deepEqual(verdict(replay([...approved(), decision({ decision: "deny" })])), ["blocked", "event-id-conflict"]);
  assert.deepEqual(verdict(replay([...approved(), decision({ eventId: "ev-decision-b", at: T(2) })])), ["blocked", "response-ref-reused"]);
  const req2 = request2(2);
  const crossed = [request(), decision({ decision: "deny" }), req2, decision2(3, req2, { responseRef: "resp-1" })];
  assert.deepEqual(verdict(replay(crossed)), ["blocked", "response-ref-reused"]);
  assert.equal(propose(approved(), decision()).state, "noop");
  assert.deepEqual(verdict(propose(approved(), decision({ decision: "deny" }))), ["blocked", "event-id-conflict"]);
});

test("P1 la corrección cambia el artefacto sin ampliar el ámbito ni aceptar revisiones arbitrarias", () => {
  const corrected = () => [...approved(), correction()];
  assert.deepEqual(verdict(cover(corrected())), ["blocked", "artifact-mismatch"]);
  const fresh = cover(corrected(), { artifact: { revision: "r03", sha256: H("d") } });
  assert.deepEqual(verdict(fresh), COVERED);
  assert.equal(fresh.remaining.corrections, 0);
  const second = correction({ eventId: "ev-correction-2", at: T(3), previousRevision: "r03", artifact: { revision: "r04", sha256: H("e"), qualityReviewRef: "qr-3" } });
  assert.deepEqual(verdict(replay([...corrected(), second])), ["blocked", "correction-limit"]);
  assert.deepEqual(verdict(replay([...approved(), correction({ scopeSha256: H("f") })])), ["blocked", "scope-change-requires-new-request"]);
  assert.deepEqual(verdict(replay([...approved(), correction({ previousRevision: "r99" })])), ["blocked", "correction-chain-conflict"]);
  assert.deepEqual(verdict(replay([...approved(), correction({ artifact: { revision: "r02", sha256: H("d"), qualityReviewRef: "qr-2" } })])), ["blocked", "revision-reused"]);
  const noCorrections = { limits: { maxOperations: 2, maxRetries: 1, maxCorrections: 0 } };
  const refused = correction({ scopeSha256: approvalHash(scope(noCorrections)) });
  assert.deepEqual(verdict(replay([...approvedWith(noCorrections), refused])), ["blocked", "correction-limit"]);
  assert.deepEqual(verdict(replay([...approved(), reserve(), correction({ at: T(3) })])), ["blocked", "operation-in-progress"]);
});

test("RA-07 destinatario, rol, ruta, acción, comprobación o efecto distintos no heredan permiso", () => {
  const role = { ...scope().recipient, role: "applier" };
  const client = { ...scope().recipient, client: "gemini-cli" };
  const mode = { ...scope().recipient, mode: "supervised" };
  assert.deepEqual(verdict(cover(approved(), { recipient: role })), ["approval-needed", "recipient-not-covered"]);
  assert.deepEqual(verdict(cover(approved(), { recipient: client })), ["approval-needed", "recipient-not-covered"]);
  assert.deepEqual(verdict(cover(approved(), { recipient: mode })), ["approval-needed", "recipient-not-covered"]);
  assert.deepEqual(verdict(cover(approved(), { items: [{ path: "src/other.js", action: "create" }] })), ["approval-needed", "outside-scope"]);
  assert.deepEqual(verdict(cover(approved(), { items: [{ path: "src/task-approvals.js", action: "modify" }] })), ["approval-needed", "outside-scope"]);
  assert.deepEqual(verdict(cover(approved(), { checks: ["other-check"] })), ["approval-needed", "outside-scope"]);
  assert.deepEqual(verdict(cover(approved(), { effects: [...effects(), "client-start"] })), ["approval-needed", "outside-scope"]);
  assert.deepEqual(verdict(cover(approved(), { items: [{ path: "src/task-approvals.js/x", action: "create" }] })), ["approval-needed", "outside-scope"]);
});

test("RA-08 transición prevista avanza; cambio ajeno bloquea sin borrar la aprobación", () => {
  const advanced = () => [...approved(), reserve(), start(), result()];
  const other = { items: docs(), checks: [], effects: writeOnly() };
  assert.deepEqual(verdict(cover(advanced(), { ...other, observedBaseSha256: H("c") })), COVERED);
  assert.deepEqual(verdict(cover(advanced(), other)), ["blocked", "base-diverged"]);
  const foreign = () => [...approved(), reserve(), start(), result({ resultingBaseSha256: H("e") })];
  const view = replay(foreign()).view.requests[0];
  assert.equal(view.status, "approved");
  assert.equal(view.divergedBaseSha256, H("e"));
  assert.deepEqual(verdict(cover(foreign(), { ...other, observedBaseSha256: H("e") })), ["blocked", "unexpected-base-change"]);
});

test("P6 la caducidad no se renueva ni se amplía por una operación en curso", () => {
  const started = () => [...approved(), reserve(), start()];
  assert.deepEqual(verdict(cover(started(), { operationId: "op-1" }, T(3600))), ["blocked", "expired-in-flight"]);
  assert.deepEqual(verdict(replay([...approved(), reserve(), start({ at: T(3600) })])), ["blocked", "expired"]);
  assert.deepEqual(verdict(replay([...approved(), reserve({ at: T(3600) })])), ["blocked", "expired"]);
  const late = () => [...started(), result({ at: T(3700) })];
  assert.equal(replay(late()).state, "reduced");
  assert.deepEqual(verdict(cover(late(), { observedBaseSha256: H("c") }, T(3701))), ["approval-needed", "expired"]);
});

test("revocar o cerrar impide operaciones nuevas sin borrar consumos", () => {
  const settled = () => [...approved(), reserve(), start(), result(), revoke()];
  const view = replay(settled()).view.requests[0];
  assert.equal(view.status, "revoked");
  assert.equal(view.usedOperations, 1);
  assert.deepEqual(verdict(cover(settled(), { observedBaseSha256: H("c") })), ["blocked", "revoked"]);
  assert.deepEqual(verdict(replay([...approved(), revoke({ at: T(2) }), reserve({ at: T(3) })])), ["blocked", "revoked"]);
  assert.deepEqual(verdict(replay([...approved(), reserve(), revoke({ at: T(3) }), start({ at: T(4) })])), ["blocked", "revoked"]);
  assert.deepEqual(verdict(replay([...approved(), close({ at: T(2) }), reserve({ at: T(3) })])), ["blocked", "closed"]);
});

test("P7 rutas inseguras, colisiones y duplicados invalidan la solicitud", () => {
  const bad = ["/etc/passwd", "src/../x.js", "./x.js", "src//x.js", "x.js/", "src\\x.js", "src/*.js", "src/{a,b}.js", "src/x[1].js", "C:/x.js", "src/e\u0301.js", "src/\u202ex.js", "src/\u0000x.js"];
  for (const path of bad) {
    const r = replay([request({ scope: scope({ paths: [{ path, action: "create" }] }) })]);
    assert.deepEqual(verdict(r), ["invalid", "invalid-approval-path"], path);
  }
  const dup = { path: "src/a.js", action: "create" };
  assert.deepEqual(verdict(replay([request({ scope: scope({ paths: [dup, { ...dup }] }) })])), ["invalid", "duplicate-approval-path"]);
  const folded = [{ path: "src/A.js", action: "create" }, { path: "src/a.js", action: "create" }];
  assert.deepEqual(verdict(replay([request({ scope: scope({ paths: folded }) })])), ["invalid", "path-collision"]);
  const nested = [{ path: "src/a", action: "create" }, { path: "src/a/b.js", action: "create" }];
  assert.deepEqual(verdict(replay([request({ scope: scope({ paths: nested }) })])), ["invalid", "path-file-directory-conflict"]);
  const sameTwice = [{ path: "src/a.js", action: "read" }, { path: "src/a.js", action: "modify" }];
  assert.equal(replay([request({ scope: scope({ paths: sameTwice }) })]).state, "reduced");
});

test("la solicitud debe ser coherente consigo misma", () => {
  assert.deepEqual(verdict(replay([request({ scopeSha256: H("f") })])), ["invalid", "scope-hash-mismatch"]);
  assert.deepEqual(verdict(replay([request({ scope: scope({ projectId: "otro-proyecto" }) })])), ["invalid", "foreign-request-identity"]);
  assert.deepEqual(verdict(replay([request({ scope: scope({ validFrom: T(100), expiresAt: T(50) }) })])), ["invalid", "invalid-validity"]);
  assert.deepEqual(verdict(replay([request({ scope: scope({ limits: { maxOperations: 2, maxRetries: 2, maxCorrections: 0 } }) })])), ["invalid", "invalid-limits"]);
  assert.deepEqual(verdict(replay([request({ scope: scope({ effects: ["test-execution"] }) })])), ["invalid", "effect-path-mismatch"]);
  assert.deepEqual(verdict(replay([request({ scope: scope({ effects: ["workspace-write"] }) })])), ["invalid", "effect-check-mismatch"]);
  const loop = { initialSha256: H("b"), transitions: [{ fromSha256: H("b"), toSha256: H("b") }] };
  assert.deepEqual(verdict(replay([request({ baseBinding: loop })])), ["invalid", "invalid-base-transition"]);
});

test("la decisión se liga a la solicitud completa y no basta una solicitud sin decisión", () => {
  assert.deepEqual(verdict(replay([request(), decision({ requestSha256: H("f") })])), ["blocked", "decision-request-mismatch"]);
  assert.deepEqual(verdict(replay([request(), decision({ requestId: "req-x" })])), ["blocked", "unknown-request"]);
  assert.deepEqual(verdict(replay([request(), request({ eventId: "ev-request-dup" })])), ["blocked", "request-id-conflict"]);
});

test("P5 un checkpoint divergente bloquea y no concede cobertura", () => {
  const env = replayEnvelope(approved());
  const wrongRevision = { ...env, checkpoint: { revision: 1, historySha256: env.checkpoint.historySha256 } };
  assert.deepEqual(verdict(api.replay(wrongRevision)), ["blocked", "checkpoint-divergent"]);
  const tampered = replayEnvelope(approved());
  tampered.history.events[1].decision = "deny";
  assert.deepEqual(verdict(api.replay(tampered)), ["blocked", "checkpoint-divergent"]);
  assert.equal(approved()[1].decision, "approve");
  const stale = { ...coverEnvelope(approved()), checkpoint: { revision: 2, historySha256: H("0") } };
  assert.deepEqual(verdict(api.cover(stale)), ["blocked", "checkpoint-divergent"]);
});

test("RA-09/RA-14 JSON hostil, claves duplicadas y campos falsos de aprobación no se aceptan", () => {
  assert.throws(() => parseApprovalInput('{"a":1,"a":2}'), code("duplicate-json-key"));
  assert.throws(() => parseApprovalInput('{"__proto__":{}}'), code("unsafe-json-key"));
  assert.throws(() => parseApprovalInput("[1]"), code("invalid-event-object"));
  assert.throws(() => parseApprovalInput(" ".repeat(LIMITS.maxBytes + 1)), code("byte-limit"));
  assert.throws(() => parseApprovalInput(Buffer.from([0x7b, 0xff, 0x7d])), code("invalid-utf8"));
  assert.throws(() => parseApprovalInput(42), code("invalid-byte-input"));
  const env = replayEnvelope(approved());
  const parsed = parseApprovalInput(JSON.stringify(env));
  assert.deepEqual(parsed, env);
  assert.equal(api.replay(parsed).state, "reduced");
  assert.deepEqual(verdict(api.replay({ ...replayEnvelope(approved()), extra: 1 })), ["invalid", "invalid-approval-input"]);
  assert.deepEqual(verdict(api.replay({ ...replayEnvelope(approved()), schemaVersion: "2.0.0" })), ["invalid", "invalid-approval-input"]);
  assert.deepEqual(verdict(replay([{ ...request(), status: "approved" }])), ["invalid", "invalid-approval-input"]);
  assert.deepEqual(verdict(replay([{ ...request(), approved: true }])), ["invalid", "invalid-approval-input"]);
  assert.deepEqual(verdict(replay([...approved(), { ...reserve(), type: "grant" }])), ["invalid", "invalid-approval-input"]);
});

test("las entradas con getters, proxies o demasiados eventos fallan cerradas sin ejecutar nada", () => {
  const getter = { schemaVersion: "1.0.0", get history() { throw new Error("getter invocado"); }, checkpoint: {} };
  assert.deepEqual(verdict(api.replay(getter)), ["invalid", "non-json-metadata"]);
  assert.deepEqual(verdict(api.replay(new Proxy({}, {}))), ["invalid", "non-json-metadata"]);
  const tooMany = { schemaVersion: "1.0.0", history: historyOf(Array.from({ length: LIMITS.maxEvents + 1 }, () => request())), checkpoint: { revision: 256, historySha256: H("0") } };
  assert.equal(api.replay(tooMany).state, "invalid");
  const full = () => Array.from({ length: LIMITS.maxEvents }, () => request());
  assert.equal(replay(full()).state, "reduced");
  assert.deepEqual(verdict(propose(full(), decision())), ["blocked", "event-limit"]);
});

test("un historial de 256 eventos grandes falla cerrado por el límite de nodos, sin lanzar", () => {
  const wide = Array.from({ length: 64 }, (_, i) => ({ path: `src/f${i}.js`, action: "read" }));
  const big = request({ scope: scope({ paths: wide, checks: [], effects: [] }) });
  const env = { schemaVersion: "1.0.0", history: historyOf(Array.from({ length: LIMITS.maxEvents }, () => big)), checkpoint: { revision: 256, historySha256: H("0") } };
  assert.deepEqual(verdict(api.replay(env)), ["invalid", "metadata-limit"]);
});

test("proponer un evento solo calcula la transición y no persiste ni modifica la entrada", () => {
  const env = proposeEnvelope(approved(), reserve());
  const before = structuredClone(env);
  const r = api.propose(env);
  assert.equal(r.state, "proposed");
  assert.equal(r.proposal.nextRevision, 3);
  assert.equal(r.proposal.nextHistorySha256, approvalHash(historyOf([...approved(), reserve()])));
  assert.deepEqual(env, before);
  noAuthority(r);
  assert.deepEqual(verdict(propose([request()], reserve({ at: T(1) }))), ["blocked", "decision-pending"]);
  assert.deepEqual(verdict(propose(approved(), start())), ["blocked", "unknown-operation"]);
  assert.deepEqual(verdict(propose([...approved(), reserve()], reserve({ eventId: "ev-reserve-b", at: T(3) }))), ["blocked", "operation-id-conflict"]);
});

test("RA-16 el núcleo no importa IO, red, procesos ni relojes globales", () => {
  const text = fs.readFileSync(new URL("../src/task-approvals.js", import.meta.url), "utf8");
  assert.doesNotMatch(text, /child_process|node:fs|node:net|node:http|node:dns|fetch\(|Date\.now|new Date\(\)|Math\.random|process\.env/);
});

// ---- Regresión de los hallazgos de la revisión (R1–R7) ----

test("R1 una solicitud nueva no reinicia el consumo del encargo", () => {
  const consumed = () => [...tight(), reserve(), start(), result()];
  const next = request2(6);
  assert.deepEqual(verdict(propose(consumed(), next)), ["blocked", "accounting-context-required"]);
  assert.deepEqual(verdict(replay([...consumed(), next])), ["blocked", "accounting-context-required"]);
  assert.deepEqual(verdict(cover([...consumed(), next], { requestId: "req-2" })), ["blocked", "accounting-context-required"]);
  const original = cover(consumed(), { observedBaseSha256: H("c") });
  assert.deepEqual(verdict(original), ["approval-needed", "budget-exhausted"]);
  assert.equal(original.remaining.operations, 0);
  const gemini = { client: "gemini-cli", role: "applier", mode: "autonomous" };
  assert.deepEqual(verdict(propose(consumed(), request2(6, { scope: scope({ recipient: gemini }) }))), ["blocked", "accounting-context-required"]);
  const renewal = request2(3700, { scope: scope({ validFrom: T(3600), expiresAt: T(7200) }) });
  assert.deepEqual(verdict(propose(consumed(), renewal)), ["blocked", "accounting-context-required"]);
});

test("R1 las solicitudes solapadas o pendientes tampoco se admiten", () => {
  assert.deepEqual(verdict(propose(approved(), request2(2))), ["blocked", "accounting-context-required"]);
  assert.deepEqual(verdict(propose([request()], request2(1))), ["blocked", "accounting-context-required"]);
});

test("R1 solo se admite una solicitud nueva tras denegación o cierre sin consumo", () => {
  const req2 = request2(2);
  const renewed = [request(), decision({ decision: "deny" }), req2, decision2(3, req2)];
  assert.equal(replay(renewed).state, "reduced");
  assert.deepEqual(verdict(cover(renewed, { requestId: "req-2" })), COVERED);
  assert.equal(propose([...approved(), close({ at: T(2) })], request2(3)).state, "proposed");
  assert.equal(propose([...approved(), revoke({ at: T(2) })], request2(3)).state, "proposed");
  const withOps = [...approved(), reserve(), start(), result(), close({ at: T(5) })];
  assert.deepEqual(verdict(propose(withOps, request2(6))), ["blocked", "accounting-context-required"]);
  const withCorrection = [...approved(), correction(), close({ at: T(3) })];
  assert.deepEqual(verdict(propose(withCorrection, request2(4))), ["blocked", "accounting-context-required"]);
  const released = [...approved(), reserve(), interrupt({ at: T(3) }),
    reconcile({ at: T(4), resolution: "not-started-confirmed", evidence: nonStart() }), close({ at: T(5) })];
  assert.deepEqual(verdict(propose(released, request2(6))), ["blocked", "accounting-context-required"]);
});

test("R2 acción, efectos y comprobaciones deben ser coherentes en alcance, reserva y consulta", () => {
  assert.deepEqual(verdict(cover(approved(), { effects: ["test-execution"] })), ["invalid", "effect-path-mismatch"]);
  assert.deepEqual(verdict(cover(approved(), { effects: writeOnly() })), ["invalid", "effect-check-mismatch"]);
  const reserved = () => [...approved(), reserve()];
  const inOperation = { operationId: "op-1", items: [items()[0]] };
  assert.deepEqual(verdict(cover(reserved(), { ...inOperation, checks: [], effects: ["test-execution"] })), ["invalid", "effect-path-mismatch"]);
  assert.deepEqual(verdict(cover(reserved(), { ...inOperation, checks: checks(), effects: writeOnly() })), ["invalid", "effect-check-mismatch"]);
  assert.deepEqual(verdict(propose(approved(), reserve({ effects: ["test-execution"] }))), ["invalid", "effect-path-mismatch"]);
  assert.deepEqual(verdict(propose(approved(), reserve({ effects: writeOnly() }))), ["invalid", "effect-check-mismatch"]);
  assert.deepEqual(verdict(propose(approved(), reserve({ checks: [], effects: effects() }))), ["invalid", "effect-check-mismatch"]);
  const readOnly = [{ path: "src/task-approvals.js", action: "read" }];
  assert.deepEqual(verdict(cover(approved(), { items: readOnly, checks: [], effects: writeOnly() })), ["invalid", "effect-path-mismatch"]);
  const withRead = approvedWith({ paths: [...scope().paths, ...readOnly] });
  assert.deepEqual(verdict(cover(withRead, { items: readOnly, checks: [], effects: [] })), COVERED);
  const onlyReads = scope({ paths: readOnly, checks: [], effects: effects() });
  assert.deepEqual(verdict(replay([request({ scope: onlyReads })])), ["invalid", "effect-path-mismatch"]);
  assert.deepEqual(verdict(replay([request({ scope: scope({ paths: readOnly, checks: [], effects: [] }) })])), ["reduced", "history-replayed"]);
});

test("R3 una corrección revisada con huella nueva no es una repetición", () => {
  const corrected = () => [...approved(), reserve(), start(), result(), correction({ at: T(5) })];
  const r = cover(corrected(), { observedBaseSha256: H("c"), artifact: { revision: "r03", sha256: H("d") } });
  assert.deepEqual(verdict(r), COVERED);
  assert.equal(r.remaining.operations, 1);
  const afterFailure = () => [...approved(), reserve(), start(), result({ outcome: "failed", resultingBaseSha256: null }), correction({ at: T(5) })];
  const revised = { artifact: { revision: "r03", sha256: H("d") } };
  assert.deepEqual(verdict(cover(afterFailure(), revised)), COVERED);
  assert.deepEqual(verdict(cover(afterFailure(), { ...revised, retryOf: "op-1" })), ["blocked", "invalid-retry"]);
});

test("R3 cambiar IDs, orden de arrays o la base no evade consumo ni reintento", () => {
  const done = () => [...approved(), reserve(), start(), result()];
  const shuffled = { items: items().reverse(), effects: effects().reverse(), observedBaseSha256: H("c") };
  assert.deepEqual(verdict(cover(done(), shuffled)), ["blocked", "operation-already-finished"]);
  const again = reserve({ eventId: "ev-reserve-2", operationId: "op-9", at: T(5), expectedBaseSha256: H("c"), items: items().reverse(), effects: effects().reverse() });
  assert.deepEqual(verdict(propose(done(), again)), ["blocked", "operation-already-finished"]);
  const failed = () => [...approved(), reserve(), start(), result({ outcome: "failed", resultingBaseSha256: null })];
  assert.deepEqual(verdict(cover(failed(), { items: items().reverse(), effects: effects().reverse() })), ["blocked", "undeclared-retry"]);
  const partial = () => [...approved(), reserve(), start(), result({ outcome: "failed", resultingBaseSha256: H("c") })];
  assert.deepEqual(verdict(cover(partial(), { observedBaseSha256: H("c") })), ["blocked", "undeclared-retry"]);
  assert.deepEqual(verdict(cover(partial(), { observedBaseSha256: H("c"), retryOf: "op-1" })), COVERED);
});

test("R3 una corrección no puede reutilizar una huella ya usada con otra etiqueta de revisión", () => {
  const reused = correction({ artifact: { revision: "r03", sha256: H("a"), qualityReviewRef: "qr-2" } });
  assert.deepEqual(verdict(replay([...approved(), reused])), ["blocked", "artifact-reused"]);
});

test("R4 la ausencia de observación o un timeout no liberan cupo y no tienen forma de evidencia", () => {
  const interrupted = () => [...approved(), reserve(), interrupt({ at: T(3) })];
  const r = cover(interrupted());
  assert.deepEqual(verdict(r), ["reconciliation-required", "reconciliation-required"]);
  assert.equal(r.remaining.operations, 1);
  const absence = reconcile({ at: T(4), resolution: "not-started-confirmed", evidence: nonStart({ observation: "start-not-observed" }) });
  assert.deepEqual(verdict(replay([...interrupted(), absence])), ["invalid", "invalid-approval-input"]);
  const legacy = reconcile({ at: T(4), resolution: "not-started", evidence: nonStart() });
  assert.deepEqual(verdict(replay([...interrupted(), legacy])), ["invalid", "invalid-approval-input"]);
  const mixed = reconcile({ at: T(4), evidence: { ...termination(), inspectedBaseSha256: H("b") } });
  assert.deepEqual(verdict(replay([...interrupted(), mixed])), ["invalid", "invalid-approval-input"]);
  const bare = reconcile({ at: T(4), resolution: "not-started-confirmed", evidence: { ...nonStart(), inspectedBaseSha256: undefined } });
  assert.throws(() => replayEnvelope([...interrupted(), bare]), code("non-json-metadata"));
});

test("R4 el no inicio confirmado exige evidencia estructurada ligada a la operación y al estado previo", () => {
  const chain = () => [...approved(), reserve(), interrupt({ at: T(3) })];
  const confirm = (evidence = {}, patch = {}) => reconcile({ at: T(4), resolution: "not-started-confirmed", evidence: nonStart(evidence), ...patch });
  const released = () => [...chain(), confirm()];
  const rep = replay(released());
  assert.equal(rep.state, "reduced");
  assert.equal(rep.view.requests[0].operations[0].state, "released-declared");
  const covered = cover(released());
  assert.deepEqual(verdict(covered), COVERED);
  assert.equal(covered.remaining.operations, 2);
  noAuthority(covered);
  assert.deepEqual(verdict(replay([...chain(), confirm({ inspectedBaseSha256: H("e") })])), ["blocked", "non-start-base-mismatch"]);
  assert.deepEqual(verdict(replay([...chain(), confirm({ priorEventId: "ev-other" })])), ["blocked", "reconcile-evidence-mismatch"]);
  assert.deepEqual(verdict(replay([...chain(), confirm({ previousState: "reserved" })])), ["blocked", "reconcile-evidence-mismatch"]);
  assert.deepEqual(verdict(replay([...chain(), confirm({ reservationEventId: "ev-other" })])), ["blocked", "reconcile-evidence-mismatch"]);
  assert.deepEqual(verdict(replay([...chain(), confirm({ decisionRef: "resp-1" })])), ["blocked", "response-ref-reused"]);
  assert.deepEqual(verdict(replay([...chain(), reconcile({ at: T(4), resolution: "not-started-confirmed", evidence: termination() })])), ["blocked", "reconcile-contradiction"]);
  assert.deepEqual(verdict(replay([...chain(), confirm({}, { resultingBaseSha256: H("c") })])), ["invalid", "unexpected-result-base"]);
  const afterStart = [...approved(), reserve(), start(), interrupt(), confirm({}, { at: T(5) })];
  assert.deepEqual(verdict(replay(afterStart)), ["blocked", "reconcile-contradiction"]);
});

test("R4 la conciliación de una operación terminada declara el resultado y avanza la base solo si está prevista", () => {
  const chain = () => [...approved(), reserve(), start(), interrupt()];
  const succeeded = [...chain(), reconcile({ resolution: "finished-succeeded", resultingBaseSha256: H("c") })];
  const other = { items: docs(), checks: [], effects: writeOnly(), observedBaseSha256: H("c") };
  assert.deepEqual(verdict(cover(succeeded, other)), COVERED);
  assert.deepEqual(verdict(replay([...chain(), reconcile({ resolution: "finished-succeeded" })])), ["invalid", "missing-result-base"]);
  const withNonStart = reconcile({ evidence: nonStart() });
  assert.deepEqual(verdict(replay([...chain(), withNonStart])), ["blocked", "reconcile-contradiction"]);
  assert.deepEqual(verdict(replay([...chain(), reconcile({ evidence: termination({ priorEventId: "ev-start" }) })])), ["blocked", "reconcile-evidence-mismatch"]);
  const foreign = [...chain(), reconcile({ resolution: "finished-succeeded", resultingBaseSha256: H("e") })];
  assert.equal(replay(foreign).view.requests[0].divergedBaseSha256, H("e"));
});

test("R5 las fixtures no se comparten entre escenarios y los envelopes son exactos por API", () => {
  assert.notEqual(approved(), approved());
  const a = approved();
  a[1].decision = "deny";
  assert.equal(approved()[1].decision, "approve");
  const replayEnv = replayEnvelope(approved());
  const coverEnv = coverEnvelope(approved());
  const proposeEnv = proposeEnvelope(approved(), reserve());
  assert.equal(api.replay(coverEnv).state, "invalid");
  assert.equal(api.replay(proposeEnv).state, "invalid");
  assert.equal(api.propose(coverEnv).state, "invalid");
  assert.equal(api.cover(replayEnv).state, "invalid");
});

test("R5 determinismo, inmutabilidad y banderas de no autorización en todas las operaciones", () => {
  const replayEnv = replayEnvelope(approved());
  const coverEnv = coverEnvelope(approved());
  const proposeEnv = proposeEnvelope(approved(), reserve());
  const before = structuredClone([replayEnv, coverEnv, proposeEnv]);
  const a = api.replay(replayEnv);
  const b = api.cover(coverEnv);
  const c = api.propose(proposeEnv);
  assert.equal(a.state, "reduced");
  assert.equal(b.state, "declared-covered");
  assert.equal(c.state, "proposed");
  assert.deepEqual([replayEnv, coverEnv, proposeEnv], before);
  assert.deepEqual(api.cover(coverEnv), b);
  for (const r of [a, b, c]) { noAuthority(r); assert.ok(Object.isFrozen(r)); }
  assert.ok(Object.isFrozen(a.view.requests[0]));
  assert.throws(() => { b.state = "covered"; }, TypeError);
});

test("R6 el informe rechaza propiedades desconocidas en view, sus anidados y proposal.event", () => {
  const withOp = api.replay(replayEnvelope([...approved(), reserve()]));
  assert.equal(withOp.state, "reduced");
  const mutate = (report, edit) => { const copy = structuredClone(report); edit(copy); return validReport(copy); };
  assert.equal(validReport(structuredClone(withOp)), true);
  assert.equal(mutate(withOp, r => { r.view.arbitraryField = true; }), false);
  assert.equal(mutate(withOp, r => { r.view.requests[0].arbitraryField = true; }), false);
  assert.equal(mutate(withOp, r => { r.view.requests[0].remaining.arbitraryField = true; }), false);
  assert.equal(mutate(withOp, r => { r.view.requests[0].artifact.arbitraryField = true; }), false);
  assert.equal(mutate(withOp, r => { r.view.requests[0].operations[0].arbitraryField = true; }), false);
  assert.equal(mutate(withOp, r => { r.view.requests[0].operations[0].state = "released"; }), false);
  const proposed = api.propose(proposeEnvelope(approved(), reserve()));
  assert.equal(proposed.state, "proposed");
  assert.equal(validReport(structuredClone(proposed)), true);
  assert.equal(mutate(proposed, r => { r.proposal.event.arbitraryField = true; }), false);
  assert.equal(mutate(proposed, r => { r.proposal.event.type = "grant"; }), false);
  assert.equal(mutate(proposed, r => { r.proposal.arbitraryField = true; }), false);
});

test("R6 el informe impone invariantes de estado, operación y presencia", () => {
  const reduced = api.replay(replayEnvelope(approved()));
  const proposed = api.propose(proposeEnvelope(approved(), reserve()));
  const covered = api.cover(coverEnvelope(approved()));
  const invalid = api.replay({ schemaVersion: "1.0.0" });
  assert.equal(invalid.state, "invalid");
  const mutate = (report, edit) => { const copy = structuredClone(report); edit(copy); return validReport(copy); };
  assert.equal(validReport(structuredClone(covered)), true);
  assert.equal(validReport(structuredClone(invalid)), true);
  assert.equal(mutate(reduced, r => { r.view = null; }), false);
  assert.equal(mutate(reduced, r => { r.operation = "cover"; }), false);
  assert.equal(mutate(reduced, r => { r.remaining = structuredClone(covered.remaining); }), false);
  assert.equal(mutate(proposed, r => { r.proposal = null; }), false);
  assert.equal(mutate(proposed, r => { r.view = structuredClone(reduced.view); }), false);
  assert.equal(mutate(covered, r => { r.remaining = null; }), false);
  assert.equal(mutate(covered, r => { r.operation = "replay"; }), false);
  assert.equal(mutate(covered, r => { r.view = structuredClone(reduced.view); }), false);
  assert.equal(mutate(invalid, r => { r.view = structuredClone(reduced.view); }), false);
  assert.equal(mutate(invalid, r => { r.proposal = structuredClone(proposed.proposal); }), false);
  assert.equal(mutate(reduced, r => { r.authorityVerified = true; }), false);
});

test("R7 approvalHash solo admite JSON inerte y no ejecuta getters ni hooks", () => {
  let calls = 0;
  const hostile = { get data() { calls += 1; return 1; } };
  assert.throws(() => approvalHash(hostile), code("non-json-metadata"));
  assert.equal(calls, 0);
  assert.throws(() => approvalHash(new Proxy({}, {})), code("non-json-metadata"));
  const cyclic = {}; cyclic.self = cyclic;
  assert.throws(() => approvalHash(cyclic), code("non-json-metadata"));
  assert.throws(() => approvalHash({ toJSON() { return {}; } }), code("non-json-metadata"));
  class Box { constructor() { this.a = 1; } toJSON() { return {}; } }
  assert.throws(() => approvalHash(new Box()), code("non-json-metadata"));
  assert.throws(() => approvalHash({ a: undefined }), code("non-json-metadata"));
  assert.throws(() => approvalHash({ n: Number.NaN }), code("non-json-metadata"));
  const deep = {}; let node = deep;
  for (let i = 0; i < 70; i += 1) { node.next = {}; node = node.next; }
  assert.throws(() => approvalHash(deep), code("metadata-limit"));
  assert.equal(approvalHash({ b: 1, a: [true, null, "x"] }), approvalHash({ a: [true, null, "x"], b: 1 }));
  assert.match(approvalHash({}), /^[a-f0-9]{64}$/);
});
