import { createClientAdapterPlanner } from "./client-adapter-plan.js";
import { validators, copyInertJson, ParseFailure, fail, same, hash, unique, fresh, tested, ledgerFacts, CONTROLS, EFFECTS } from "./client-runtime-core.js";

const GATES = ["trusted-authorization", "native-installation-and-controls", "subscription-and-billing", "atomic-durable-reservation", "private-context-resolution", "supervised-process-and-cancellation"];

/** Pure eligibility of declarations. Never issues an execution capability. */
export function createClientRuntimeAdmission(base, preference, adapter, runtime) {
  const validate = validators(base, preference, adapter, runtime);
  const plan = createClientAdapterPlanner(base, preference, adapter);
  return function admit(input) {
    const r = { schemaVersion: "1.0.0", engineVersion: "1.0.0", state: "invalid", executed: false, runtimeReady: false,
      verifiedAdmission: false, identity: null, reservation: null, missing: [], reasons: [], externalGates: [...GATES],
      audit: { inputSha256: null, planSha256: null, ledgerSha256: null } };
    function finish(state, reasons = []) {
      r.state = state; r.reasons = [...new Set(reasons)].sort(); r.missing.sort();
      if (state !== "eligible-for-reservation") r.reservation = null;
      if (!validate.admissionReport(r)) throw Error("Runtime admission invariant failed");
      return r;
    }
    try {
      const d = copyInertJson(input);
      if (!validate.admissionInput(d)) fail("invalid-admission-input");
      const recomputed = plan(d.planningInput);
      r.identity = recomputed.identity; r.audit.inputSha256 = hash(d);
      if (!same(recomputed, d.plan)) fail("runtime-plan-mismatch");
      if (recomputed.state !== "prepared") return finish("blocked", ["runtime-plan-not-prepared"]);
      r.audit.planSha256 = hash(recomputed);
      r.missing = ["expectedInstallation", "evidence", "ledger"].filter(k => d[k] === undefined);
      if (r.missing.length) return finish("needs-info", ["runtime-evidence-missing"]);
      const { ledger, evidence: e, planningInput: p, now } = d; const intent = recomputed.intent;
      r.audit.ledgerSha256 = hash(ledger);
      const facts = ledgerFacts(ledger, now); const blocks = [];
      const block = c => blocks.push(c); const maxAge = p.selection.policy.availabilityMaxAgeSeconds;
      const current = Date.parse(now); const evaluation = Date.parse(p.selection.request.evaluationTime);
      if (current < evaluation || current - evaluation > maxAge * 1000) block("runtime-evaluation-stale-or-future");
      const ageValid = time => current >= Date.parse(time) && current - Date.parse(time) <= maxAge * 1000;
      const selectedAvailability = p.selection.request.availability.find(a => a.profileId === intent.profileId);
      const registryRecord = p.registry.records.find(a => a.recordId === intent.compatibilityRecordId);
      if (![selectedAvailability?.checkedAt, registryRecord?.evaluatedAt, p.context.provenance.checkedAt,
        p.context.authorization.checkedAt, p.environment.checkedAt, p.historyEvidence.checkedAt].every(ageValid)) block("runtime-plan-evidence-stale-or-future");
      const { identity, planSha256, ...installation } = e.binding;
      if (!same(identity, recomputed.identity) || planSha256 !== r.audit.planSha256) block("runtime-evidence-binding-mismatch");
      if (!same(installation, d.expectedInstallation) || !same(installation.client, intent.client)) block("runtime-installation-mismatch");
      if (!tested(e.installation, now, maxAge)) block("runtime-installation-not-tested-or-fresh");
      if (e.authorization.status !== "approved" || e.authorization.revoked || !fresh(e.authorization, now, maxAge) ||
          e.authorization.referenceId !== intent.authorizationRef) block("runtime-authorization-not-current");
      if (!EFFECTS.every(v => e.authorization.effectsApproved.includes(v))) block("runtime-effects-not-authorized");
      if (!same(e.authorization.limits, ledger.limits)) block("runtime-budget-authorization-mismatch");
      if (!tested(e.access.assessment, now, maxAge) || e.access.access !== "subscription-session" || e.access.externalBilling !== "disabled") block("runtime-access-or-billing-unconfirmed");
      if (!tested(e.context.assessment, now, maxAge) || e.context.promptRef !== intent.input.promptRef) block("runtime-context-mismatch-or-stale");
      if (!unique(e.controls.map(c => c.controlId)) || !unique(e.effects.map(c => c.effectId))) fail("duplicate-runtime-evidence");
      for (const control of CONTROLS) {
        const record = e.controls.find(c => c.controlId === control);
        if (!record || !tested(record.assessment, now, maxAge)) block("runtime-controls-not-tested-or-fresh");
      }
      for (const effect of EFFECTS) {
        const record = e.effects.find(c => c.effectId === effect);
        if (!record || record.disposition !== "allowed" || !tested(record.assessment, now, maxAge)) block("runtime-native-effects-unconfirmed");
      }
      if (!tested(e.accounting.assessment, now, maxAge) || e.accounting.maxCallsPerStart === null || !e.accounting.limitEnforced) block("runtime-call-ceiling-unconfirmed");
      if (ledger.projectId !== recomputed.identity.projectId || ledger.taskId !== recomputed.identity.taskId) block("runtime-ledger-identity-mismatch");
      if (!same(ledger.history, p.selection.request.history)) block("runtime-history-mismatch");
      if (ledger.status !== "reconciled" || facts.uncertain || facts.overrun) block("runtime-reconciliation-required");
      if (facts.active) block("runtime-active-reservation");
      if (ledger.attempts.length >= 128) block("runtime-ledger-capacity");
      if (ledger.limits.maxModelCalls > p.selection.policy.maxFutureExecutions ||
          ledger.limits.maxDurationSeconds > p.selection.policy.maxFutureDurationSeconds) block("runtime-budget-exceeds-policy");
      if (ledger.limits.maxMainStarts <= ledger.mainStartsUsed ||
          ledger.limits.maxModelCalls - ledger.history.executionsUsed < (e.accounting.maxCallsPerStart ?? Infinity) ||
          ledger.limits.maxDurationSeconds - ledger.history.durationUsedSeconds < intent.limits.timeoutSeconds) block("runtime-budget-insufficient");
      if (blocks.length) return finish("blocked", blocks);
      r.reservation = { identity: recomputed.identity, planSha256: r.audit.planSha256, client: intent.client, profileId: intent.profileId,
        model: intent.requestedModel, effort: intent.requestedEffort, calls: e.accounting.maxCallsPerStart, seconds: intent.limits.timeoutSeconds };
      return finish("eligible-for-reservation", ["declared-eligibility-only"]);
    } catch (error) {
      if (!(error instanceof ParseFailure)) throw error;
      return finish("invalid", [error.code]);
    }
  };
}
