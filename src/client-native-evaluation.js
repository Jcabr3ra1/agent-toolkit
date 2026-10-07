import Ajv2020 from "ajv/dist/2020.js";
import { CONTROLS, EFFECTS, hash, same, fresh, unique } from "./client-runtime-core.js";
import { copyInertJson, copyBytes, decode, parseEventJson, ParseFailure, fail } from "./client-output-json.js";

const SCHEMA_ID = "https://agent-toolkit.local/schemas/agent-client-native-evaluation.schema.json";
const MAX_INPUT_BYTES = 131072;
const SECTIONS = ["installation", "controls", "effects", "access", "accounting", "observations"];

// Trusted construction only. The caller supplies a schema and policy, never paths or callbacks.
export function createClientNativeEvaluator(schema, trustedPolicy) {
  let contract; let policy;
  try { contract = copyInertJson(schema); policy = copyInertJson(trustedPolicy); }
  catch { throw Error("Invalid native evaluation configuration"); }
  if (contract?.$id !== SCHEMA_ID) throw Error("Unsupported native evaluation schema");
  const ajv = new Ajv2020({ strict: true, allErrors: true });
  ajv.addFormat("date-time", { type: "string", validate: value => {
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(value)) return false;
    const t = Date.parse(value);
    return Number.isFinite(t) && new Date(t).toISOString() === value.replace(/Z$/, ".000Z");
  } });
  ajv.addSchema(contract);
  const validator = name => ajv.compile({ $ref: `${SCHEMA_ID}#/$defs/${name}` });
  const validInput = validator("input"); const validPolicy = validator("policy"); const validReport = validator("report");
  if (!validPolicy(policy)) throw Error("Invalid native evaluation policy");
  const revoked = new Set(policy.revokedEvidenceRefs); const policySha256 = hash(policy);

  return function evaluateClientNativeEvidence(input) {
    const r = { schemaVersion: "1.0.0", state: "invalid", evaluationId: null,
      executed: false, runtimeReady: false, verifiedAdmission: false, reasons: [], missing: [],
      audit: { inputSha256: null, bindingSha256: null, policySha256 } };
    const blockers = new Set(); const missing = new Set();
    const block = reason => blockers.add(reason);
    function finish(state, reasons = []) {
      r.state = state; r.reasons = [...new Set(reasons)].sort(); r.missing = [...missing].sort();
      if (!validReport(r)) throw Error("Native evaluation report invariant failed");
      return r;
    }
    try {
      // Strings/bytes use duplicate-aware decoding; objects never invoke conversion hooks.
      const parsed = typeof input === "string" || (input && typeof input === "object" && ArrayBuffer.isView(input))
        ? parseEventJson(decode(copyBytes(input, MAX_INPUT_BYTES))) : input;
      const d = copyInertJson(parsed);
      if (Buffer.byteLength(JSON.stringify(d)) > MAX_INPUT_BYTES) fail("native-input-limit");
      if (!validInput(d)) fail("invalid-native-evaluation-input");
      if (d.controls && !unique(d.controls.map(c => c.controlId))) fail("duplicate-native-control");
      if (d.effects && !unique(d.effects.map(e => e.effectId))) fail("duplicate-native-effect");
      if (d.installation && !unique(d.installation.artifacts.map(a => a.artifactId))) fail("duplicate-native-artifact");
      r.evaluationId = d.evaluationId; r.audit.inputSha256 = hash(d); r.audit.bindingSha256 = hash(d.binding);
      if (!same(d.expectedBinding, d.binding)) block("native-binding-mismatch");
      const scope = r.audit.bindingSha256;
      const ref = (id, label) => { if (id !== null && revoked.has(id)) block(`native-evidence-revoked:${label}`); };
      function assess(a, label) {
        ref(a.evidenceRef, label);
        if (a.scopeSha256 !== scope) block(`native-evidence-scope-mismatch:${label}`);
        if (!fresh(a, d.now, policy.maxEvidenceAgeSeconds)) block(`native-evidence-not-fresh:${label}`);
        if (a.status === "rejected") block(`native-evidence-rejected:${label}`);
        else if (a.status !== "locally-tested") missing.add(`${label}.installation-test`);
        else if (a.source !== "installation-test") block(`native-evidence-source-conflict:${label}`);
      }
      for (const section of SECTIONS) if (d[section] === undefined) missing.add(section);
      if (d.installation) {
        assess(d.installation.assessment, "installation");
        const artifacts = [...d.installation.artifacts].sort((a, b) => a.artifactId < b.artifactId ? -1 : a.artifactId > b.artifactId ? 1 : 0);
        if (hash(artifacts) !== d.binding.artifactSha256) block("native-artifact-set-mismatch");
        const kinds = new Set(artifacts.map(a => a.kind));
        if (kinds.has("wrapper") && (!kinds.has("interpreter") || !kinds.has("package"))) block("native-wrapper-dependencies-incomplete");
        if (!kinds.has("binary") && !kinds.has("wrapper")) block("native-entry-artifact-missing");
      }
      for (const id of CONTROLS) {
        const c = d.controls?.find(c => c.controlId === id); const label = `controls.${id}`;
        if (!c) { missing.add(label); continue; }
        assess(c.assessment, label);
        for (const [key, suffix] of [["mechanismId", "mechanism"], ["positiveEvidenceRef", "positive-proof"], ["negativeEvidenceRef", "negative-proof"]]) {
          if (c[key] === null) missing.add(`${label}.${suffix}`);
          else if (key !== "mechanismId") ref(c[key], `${label}.${suffix}`);
        }
      }
      for (const id of EFFECTS) {
        const e = d.effects?.find(e => e.effectId === id); const label = `effects.${id}`;
        if (!e) { missing.add(label); continue; }
        assess(e.assessment, label);
        if (e.disposition !== "allowed" || e.presence === "unknown") block(`native-effect-unconfirmed:${id}`);
        if (["native-auth", "provider-inference"].includes(id) && e.presence === "absent") block(`native-required-effect-absent:${id}`);
        const a = e.authorization;
        if (a.status !== "approved" || a.evidenceRef === null) block(`native-effect-not-authorized:${id}`);
        if (a.scopeSha256 !== scope) block(`native-authorization-scope-mismatch:${id}`);
        ref(a.evidenceRef, `${label}.authorization`);
      }
      if (d.access) {
        assess(d.access.assessment, "access"); assess(d.access.billingAssessment, "billing");
        if (d.access.access !== "subscription-session" || d.access.externalBilling !== "disabled") block("native-subscription-or-billing-unconfirmed");
      }
      if (d.accounting) {
        assess(d.accounting.assessment, "accounting");
        if (d.accounting.maxCallsPerStart === null || !d.accounting.limitEnforced) block("native-internal-call-ceiling-unconfirmed");
      }
      for (const observation of d.observations ?? []) block(`native-unresolved:${observation}`);
      if (blockers.size) return finish("blocked", [...blockers]);
      if (missing.size) return finish("incomplete", ["native-evidence-incomplete"]);
      return finish("ready-for-installation-review", ["declared-evidence-only"]);
    } catch (error) {
      if (!(error instanceof ParseFailure)) throw error;
      return finish("invalid", [error.code]);
    }
  };
}
