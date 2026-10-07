import Ajv2020 from "ajv/dist/2020.js";
import { copyInertJson, copyBytes, decode, parseEventJson, ParseFailure, fail } from "./client-output-json.js";
import { CONTROLS, EFFECTS, hash, same, unique, fresh } from "./client-runtime-core.js";

const SCHEMA_ID = "https://agent-toolkit.local/schemas/agent-client-supervised.schema.json";
const MAX_INPUT_BYTES = 131072;
const REQUIRED_CONTROLS = CONTROLS.filter(id => id !== "internal-call-limit");
const SECTIONS = ["selection", "binding", "expectedBinding", "limits", "context", "authorization", "limitations", "history", "installation", "controls", "effects", "access", "observations"];
const GATES = ["trusted-authorization-and-limitations", "native-installation-and-controls", "subscription-and-billing", "selection-and-private-context", "supervised-history-and-durable-reservation", "local-supervision-and-termination", "human-result-review"];

function declarationScope(data, policySha256) {
  const summary = value => {
    if (!value) return null;
    const { assessment, billingAssessment, ...declaration } = value;
    return declaration;
  };
  const ordered = (items, key) => (items ?? []).map(summary).sort((a, b) => a[key] < b[key] ? -1 : a[key] > b[key] ? 1 : 0);
  const authorization = summary(data.authorization);
  if (authorization) authorization.effectsApproved = [...authorization.effectsApproved].sort();
  return hash({ profile: data.profile, intentId: data.intentId, identity: data.identity,
    selection: summary(data.selection), binding: data.binding ?? null, expectedBinding: data.expectedBinding ?? null,
    limits: data.limits ?? null, context: summary(data.context), authorization,
    limitations: summary(data.limitations), history: summary(data.history), access: summary(data.access),
    controls: ordered(data.controls, "controlId"), effects: ordered(data.effects, "effectId"),
    observations: [...(data.observations ?? [])].sort(), policySha256 });
}

// A separate pure review of declarations. This is not a C1 admission or a launcher.
export function createClientSupervisedEvaluator(schema, trustedPolicy) {
  let contract; let policy;
  try { contract = copyInertJson(schema); policy = copyInertJson(trustedPolicy); }
  catch { throw Error("Invalid supervised evaluation configuration"); }
  if (contract?.$id !== SCHEMA_ID) throw Error("Unsupported supervised evaluation schema");
  const ajv = new Ajv2020({ strict: true, allErrors: true });
  ajv.addFormat("date-time", { type: "string", validate: value => {
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(value)) return false;
    const time = Date.parse(value);
    return Number.isFinite(time) && new Date(time).toISOString() === value.replace(/Z$/, ".000Z");
  } });
  ajv.addSchema(contract);
  const validator = name => ajv.compile({ $ref: `${SCHEMA_ID}#/$defs/${name}` });
  const validInput = validator("input"), validPolicy = validator("policy"), validReport = validator("report");
  if (!validPolicy(policy) || policy.limits.terminationGraceSeconds >= policy.limits.timeoutSeconds ||
      policy.limits.maxEventBytes > policy.limits.maxStdoutBytes) throw Error("Invalid supervised evaluation policy");
  const revoked = new Set(policy.revokedEvidenceRefs), policySha256 = hash(policy);

  return function evaluateSupervisedIntent(input) {
    const report = { schemaVersion: "1.0.0", profile: "supervised-subscription", intentId: null, state: "invalid",
      executed: false, runtimeReady: false, verifiedAdmission: false, externalBillingVerified: false,
      selectionVerified: false, internalCallCeiling: null, remoteCancellationVerified: false,
      reasons: [], missing: [], externalGates: [...GATES], audit: { inputSha256: null, scopeSha256: null, policySha256 } };
    const blockers = new Set(), missing = new Set();
    const block = reason => blockers.add(reason);
    function finish(state, reasons = []) {
      report.state = state; report.reasons = [...new Set(reasons)].sort(); report.missing = [...missing].sort();
      if (!validReport(report)) throw Error("Supervised evaluation report invariant failed");
      return report;
    }
    try {
      const parsed = typeof input === "string" || (input && typeof input === "object" && ArrayBuffer.isView(input))
        ? parseEventJson(decode(copyBytes(input, MAX_INPUT_BYTES))) : input;
      const data = copyInertJson(parsed);
      const serialized = JSON.stringify(data);
      parseEventJson(decode(copyBytes(serialized, MAX_INPUT_BYTES))); // Validate Unicode in copied object strings too.
      if (!validInput(data)) fail("invalid-supervised-input");
      if (data.controls && !unique(data.controls.map(c => c.controlId))) fail("duplicate-supervised-control");
      if (data.effects && !unique(data.effects.map(e => e.effectId))) fail("duplicate-supervised-effect");
      report.intentId = data.intentId; report.audit.inputSha256 = hash(data);
      for (const section of SECTIONS) if (data[section] === undefined) missing.add(section);

      // Evidence is bound to the whole intent, not just an installation or a task name.
      const { assessment: selectionAssessment, ...selection } = data.selection ?? {};
      const { assessment: contextAssessment, ...context } = data.context ?? {};
      const scope = declarationScope(data, policySha256);
      report.audit.scopeSha256 = scope;
      function reference(id, label) {
        if (id === null) missing.add(`${label}.reference`);
        else if (revoked.has(id)) block(`supervised-reference-revoked:${label}`);
      }
      function assess(a, label, sources) {
        if (!a) return;
        reference(a.evidenceRef, label);
        if (a.scopeSha256 !== scope) block(`supervised-scope-mismatch:${label}`);
        if (!fresh(a, data.now, policy.maxEvidenceAgeSeconds)) block(`supervised-evidence-not-fresh:${label}`);
        if (a.status === "rejected") block(`supervised-evidence-rejected:${label}`);
        else if (a.status !== "confirmed") missing.add(`${label}.confirmation`);
        else if (!sources.includes(a.source)) block(`supervised-source-conflict:${label}`);
      }
      const human = ["operator-attestation"], test = ["installation-test"], attested = [...human, ...test];
      if (data.binding && data.expectedBinding && !same(data.binding, data.expectedBinding)) block("supervised-binding-mismatch");
      if (data.selection) {
        assess(selectionAssessment, "selection", attested);
        if (["latest", "default", "opus", "sonnet", "haiku", "fable"].includes(selection.model) || selection.model.split("-").includes("latest")) block("supervised-model-not-pinned");
        if (data.binding && (selection.client !== data.binding.client || selection.provider !== data.binding.provider)) block("supervised-selection-binding-mismatch");
        if (selection.source === "operator-choice" && selectionAssessment.source !== "operator-attestation") block("supervised-selection-source-conflict");
      }
      if (data.limits) {
        for (const key of Object.keys(policy.limits)) if (data.limits[key] > policy.limits[key]) block("supervised-limits-exceed-policy");
        if (data.limits.terminationGraceSeconds >= data.limits.timeoutSeconds) block("supervised-grace-outside-deadline");
        if (data.limits.maxEventBytes > data.limits.maxStdoutBytes) block("supervised-event-limit-inconsistent");
      }
      if (data.context) {
        assess(contextAssessment, "context", attested);
        if (data.limits && context.inputBytes > data.limits.maxInputBytes) block("supervised-context-exceeds-budget");
      }
      if (data.authorization) {
        const a = data.authorization;
        assess(a.assessment, "authorization", human);
        if (a.status !== "approved") block("supervised-authorization-not-approved");
        if (data.limits && !same(a.limits, data.limits)) block("supervised-authorization-limits-mismatch");
        if (data.identity.mode === "tutor" && a.writer !== "user") block("supervised-tutor-authority-conflict");
      }
      if (data.identity.role === "tutor" && data.identity.mode !== "tutor") block("supervised-tutor-mode-conflict");
      if (data.limitations) {
        assess(data.limitations.assessment, "limitations", human);
        if (!data.limitations.internalCallsUnknownAccepted || !data.limitations.remoteCancellationUnknownAccepted) block("supervised-limitations-not-accepted");
      }
      if (data.history) {
        const h = data.history;
        assess(h.assessment, "history", attested);
        if (h.projectId !== data.identity.projectId || h.taskId !== data.identity.taskId) block("supervised-history-identity-mismatch");
        if (h.state !== "clear") block("supervised-history-reconciliation-required");
        if (h.mainStartsUsed === 0 && (h.durationUsedSeconds > 0 || (h.actualModelCalls !== null && h.actualModelCalls > 0))) block("supervised-history-counters-inconsistent");
        if (data.limits && (h.mainStartsUsed >= data.limits.maxMainStarts || h.durationUsedSeconds >= data.limits.timeoutSeconds)) block("supervised-budget-exhausted");
        if (h.mainStartsUsed > 0 && h.actualModelCalls === null) block("supervised-prior-consumption-unresolved");
      }
      if (data.installation) assess(data.installation.assessment, "installation", test);
      for (const id of REQUIRED_CONTROLS) {
        const c = data.controls?.find(c => c.controlId === id), label = `controls.${id}`;
        if (!c) { missing.add(label); continue; }
        assess(c.assessment, label, test);
        for (const key of ["mechanismId", "positiveEvidenceRef", "negativeEvidenceRef"]) {
          if (c[key] === null) missing.add(`${label}.${key.toLowerCase()}`);
          else if (key !== "mechanismId") reference(c[key], `${label}.${key.toLowerCase()}`);
        }
      }
      for (const id of EFFECTS) {
        const e = data.effects?.find(e => e.effectId === id), label = `effects.${id}`;
        if (!e) { missing.add(label); continue; }
        assess(e.assessment, label, test);
        if (e.presence === "unknown" || e.disposition !== "allowed") block(`supervised-effect-unconfirmed:${id}`);
        if (["native-auth", "provider-inference"].includes(id) && e.presence === "absent") block(`supervised-required-effect-absent:${id}`);
        if (e.presence === "present" && !data.authorization?.effectsApproved.includes(id)) block(`supervised-effect-not-authorized:${id}`);
      }
      if (data.access) {
        assess(data.access.assessment, "access", attested);
        assess(data.access.billingAssessment, "billing", attested);
        if (data.access.method !== "subscription-session") block("supervised-subscription-required");
        if (data.access.externalBilling !== "disabled") block("supervised-external-billing-not-disabled");
      }
      for (const code of data.observations ?? []) block(`supervised-unresolved:${code}`);
      if (blockers.size) return finish("blocked", [...blockers]);
      if (missing.size) return finish("incomplete", ["supervised-declarations-incomplete"]);
      return finish("ready-for-supervised-review", ["supervised-declarations-only"]);
    } catch (error) {
      if (!(error instanceof ParseFailure)) throw error;
      return finish("invalid", [error.code]);
    }
  };
}
