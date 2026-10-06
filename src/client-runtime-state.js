import { createClientRuntimeAdmission } from "./client-runtime-admission.js";
import { validators, copyInertJson, ParseFailure, fail, hash, same, fresh, ledgerFacts, recalculate } from "./client-runtime-core.js";

/** Calculate CAS proposals only. No mutable store, locks, clock or processes. */
export function createClientRuntimeState(base, preference, adapter, runtime) {
  const validate = validators(base, preference, adapter, runtime);
  const admit = createClientRuntimeAdmission(base, preference, adapter, runtime);
  return function transition(input) {
    const r = { schemaVersion: "1.0.0", engineVersion: "1.0.0", state: "invalid", executed: false, runtimeReady: false,
      verifiedAdmission: false, persisted: false, operation: null, nextLedger: null, compareAndSwap: null, reasons: [] };
    function finish(state, code) {
      r.state = state; r.reasons = [code];
      if (state !== "proposed") { r.nextLedger = null; r.compareAndSwap = null; }
      if (!validate.stateReport(r)) throw Error("Runtime state invariant failed"); return r;
    }
    try {
      const d = copyInertJson(input); if (!validate.stateInput(d)) fail("invalid-runtime-transition");
      r.operation = d.operation; const beforeHash = hash(d.ledger);
      if (d.expectedRevision !== d.ledger.revision || d.expectedLedgerSha256 !== beforeHash) return finish("blocked", "runtime-snapshot-conflict");
      ledgerFacts(d.ledger, d.now);
      if (d.ledger.revision >= 1_000_000) return finish("blocked", "runtime-revision-limit");
      const next = copyInertJson(d.ledger); let a = next.attempts.find(a => a.attemptId === d.attemptId);
      if (d.operation === "reserve") {
        if (a) return finish("blocked", "runtime-attempt-already-exists");
        if (!same(d.admissionInput.ledger, d.ledger) || d.admissionInput.now !== d.now) return finish("blocked", "runtime-admission-snapshot-conflict");
        const admission = admit(d.admissionInput);
        if (admission.state !== "eligible-for-reservation") return finish(admission.state === "invalid" ? "invalid" : "blocked", "runtime-reservation-not-eligible");
        const v = admission.reservation;
        a = { attemptId: d.attemptId, identity: v.identity, planSha256: v.planSha256, client: v.client,
          profileId: v.profileId, model: v.model, effort: v.effort, state: "reserved", startObservation: "not-reported",
          reservedCalls: v.calls, reservedSeconds: v.seconds, reservedAt: d.now, updatedAt: d.now,
          actualCalls: null, actualSeconds: null, outcome: null, evidenceRef: null };
        next.attempts.push(a);
      } else {
        if (!a) return finish("blocked", "runtime-attempt-not-found");
        if (a.state === "settled") return finish("blocked", "runtime-attempt-already-settled");
        if (Date.parse(d.now) < Date.parse(a.updatedAt)) return finish("blocked", "runtime-observation-before-attempt");
        if (d.operation === "mark-started") {
          if (a.state !== "reserved") return finish("blocked", "runtime-start-observation-conflict");
          a.state = "started"; a.startObservation = "started";
        } else if (d.operation === "interrupt") {
          if (a.state === "reconciliation-required") return finish("blocked", "runtime-attempt-already-interrupted");
          a.state = "reconciliation-required"; a.startObservation = a.startObservation === "started" ? "started" : "unknown"; a.outcome = "indeterminate";
        } else {
          if (d.reconciliation.status !== "approved" || d.reconciliation.revoked || !fresh(d.reconciliation, d.now, 3600) || !d.terminationConfirmed) return finish("blocked", "runtime-reconciliation-not-authorized-or-terminated");
          if (d.reconciliation.projectId !== next.projectId || d.reconciliation.taskId !== next.taskId ||
              d.reconciliation.attemptId !== a.attemptId || d.reconciliation.ledgerSha256 !== beforeHash) return finish("blocked", "runtime-reconciliation-binding-mismatch");
          if (a.startObservation === "started" && d.startObservation !== "started") return finish("blocked", "runtime-start-observation-conflict");
          if (d.startObservation === "not-started" && (d.actualCalls || d.actualSeconds || d.outcome !== "not-started")) return finish("blocked", "runtime-not-started-consumption-conflict");
          if (d.startObservation === "started" && d.outcome === "not-started") return finish("blocked", "runtime-started-outcome-conflict");
          Object.assign(a, { state: "settled", startObservation: d.startObservation, actualCalls: d.actualCalls,
            actualSeconds: d.actualSeconds, outcome: d.outcome, evidenceRef: d.reconciliation.evidenceRef });
        }
        a.updatedAt = d.now;
      }
      next.revision++; recalculate(next);
      if (!validate.ledger(next)) return finish("blocked", "runtime-ledger-counter-or-capacity-limit");
      ledgerFacts(next, d.now);
      r.nextLedger = next; r.compareAndSwap = { expectedRevision: d.expectedRevision, nextRevision: next.revision,
        expectedSha256: beforeHash, nextSha256: hash(next) };
      return finish("proposed", next.status === "reconciliation-required" ? "declared-transition-reconciliation-required" : "declared-transition-only");
    } catch (error) {
      if (!(error instanceof ParseFailure)) throw error;
      return finish("invalid", error.code);
    }
  };
}
