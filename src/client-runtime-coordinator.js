import Ajv2020 from "ajv/dist/2020.js";
import { createClientRuntimeStore } from "./client-runtime-store.js";
import { copyInertJson, hash, same, fresh, fail, ParseFailure } from "./client-runtime-core.js";
import { copyBytes } from "./client-output-json.js";
import { superviseFixture, monotonicMs } from "./client-runtime-supervisor.js";

export const FIXTURE_SCHEMA_ID = "https://agent-toolkit.local/schemas/agent-client-runtime-fixture.schema.json";
const stamp = v => typeof v === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString() === v.replace(/Z$/, ".000Z");

/** No CLI or native client: configured and called only by a trusted local harness. */
export function createFixtureCoordinator(base, preference, adapter, runtime, local, fixture, configuration, dependencies = {}) {
  const schemas = [base, preference, adapter, runtime, local, fixture].map(copyInertJson);
  if (schemas[5].$id !== FIXTURE_SCHEMA_ID) throw Error("Unsupported fixture runtime schema");
  const ajv = new Ajv2020({ strict: true, allErrors: true }); ajv.addFormat("date-time", { type: "string", validate: stamp });
  schemas.forEach(s => ajv.addSchema(s)); const valid = ajv.compile({ $ref: `${FIXTURE_SCHEMA_ID}#/$defs/request` });
  const validReport = ajv.compile({ $ref: `${FIXTURE_SCHEMA_ID}#/$defs/report` });
  const cfg = copyInertJson(configuration);
  const runStore = createClientRuntimeStore(...schemas.slice(0, 5), cfg, dependencies.store);
  const clock = dependencies.store?.clock ?? Date.now;
  return async function coordinate(input, { signal } = {}) {
    const r = { schemaVersion: "1.0.0", scope: "fixture-only", state: "not-started", identity: null, attemptId: null,
      fixtureExecuted: false, nativeExecuted: false, runtimeReady: false, verifiedAdmission: false, modelCalls: 0,
      process: null, storage: null, reasons: [] };
    try {
      const d = copyInertJson(input); if (!valid(d)) fail("fixture-invalid-request");
      if (d.reservation.operation !== "apply" || d.reservation.transition.operation !== "reserve") fail("fixture-reservation-required");
      const t = d.reservation.transition, a = d.authorization;
      r.identity = copyInertJson(d.reservation.identity); r.attemptId = t.attemptId;
      copyBytes(d.inputText, d.limits.maxInputBytes);
      if (d.limits.graceMs + d.limits.confirmationMs >= d.limits.timeoutMs ||
          d.limits.maxLineBytes > d.limits.maxOutputBytes || d.limits.timeoutMs > t.admissionInput.planningInput.limits.timeoutSeconds * 1000) fail("fixture-incompatible-limits");
      const gate = time => {
        if (a.status !== "approved" || a.revoked || !a.reconciliationApproved || !fresh(a, time, 3600) ||
            a.fixtureId !== d.fixtureId || a.attemptId !== t.attemptId || !same(a.identity, r.identity) ||
            a.rootSha256 !== hash(cfg.root) || a.limitsSha256 !== hash(d.limits)) fail("fixture-not-authorized");
        return hash(d);
      };
      const ms = clock(); if (typeof ms !== "number" || !Number.isFinite(ms)) fail("fixture-clock-unavailable");
      gate(new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z"));
      if (signal?.aborted) fail("fixture-canceled-before-reservation");
      const beganAt = monotonicMs();
      r.storage = await runStore.withFixtureSession(d.reservation, async session => {
        r.process = await superviseFixture(session.handle, d, { ...dependencies.supervisor, signal, beganAt });
        r.fixtureExecuted = r.process.fixtureExecuted; r.state = r.process.state;
        if (r.process.state === "indeterminate" || !r.process.terminationConfirmed) return; // Retain lock and reservation.
        const ledger = session.snapshot();
        const time = new Date(clock()).toISOString().replace(/\.\d{3}Z$/, "Z"); gate(time);
        const started = r.process.started;
        await session.apply({ schemaVersion: "1.0.0", operation: "settle", now: time, ledger, expectedRevision: ledger.revision,
          expectedLedgerSha256: hash(ledger), attemptId: t.attemptId, startObservation: started ? "started" : "not-started",
          actualCalls: 0, actualSeconds: started ? Math.ceil(r.process.elapsedMs / 1000) : 0,
          outcome: started ? r.process.state : "not-started", terminationConfirmed: true,
          reconciliation: { status: "approved", revoked: false, referenceId: a.referenceId, source: "operator-attestation",
            checkedAt: a.checkedAt, expiresAt: a.expiresAt, evidenceRef: a.evidenceRef,
            projectId: ledger.projectId, taskId: ledger.taskId, attemptId: t.attemptId, ledgerSha256: hash(ledger) } });
      }, gate);
      r.reasons = [...new Set([...(r.process?.reasons ?? []), ...r.storage.reasons])];
      if (r.storage.state === "indeterminate") r.state = "indeterminate";
      if (r.storage.state === "blocked") r.state = "not-started";
      // Public summary deliberately omits snapshots, private paths, process IDs and raw streams.
      r.storage = { state: r.storage.state, writeObservation: r.storage.writeObservation, durability: r.storage.durability,
        cleanup: r.storage.cleanup, revision: r.storage.snapshot?.revision ?? null, reasons: r.storage.reasons };
    } catch (e) {
      r.reasons = [e instanceof ParseFailure ? e.code : "fixture-coordinator-blocked"];
      if (r.fixtureExecuted) r.state = "indeterminate";
    }
    if (!validReport(r)) throw Error("Fixture runtime report invariant failed");
    return r;
  };
}
