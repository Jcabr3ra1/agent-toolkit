import Ajv2020 from "ajv/dist/2020.js";
import { types } from "node:util";
import { copyInertJson, copyBytes, decode, parseEventJson, fail } from "./client-output-json.js";
import { hash } from "./client-runtime-core.js";
import { createIsolatedVariantEvaluator, ISOLATED_MECHANISMS, ISOLATED_SCHEMA_ID } from "./client-isolated-variant.js";

export const VERIFICATION_SCHEMA_ID = "https://agent-toolkit.local/schemas/agent-client-isolated-verification.schema.json";
const phases = Object.freeze(["pre-start", "session", "shutdown"]);
const coverage = [
  ["session"], ["pre-start", "session"], ["pre-start"], phases, phases,
  ["pre-start", "session"], ["pre-start", "session"], ["pre-start", "session"], phases,
  ["pre-start"], phases, phases
];
// Closed semantic methods, not executable recipes or authenticated capabilities.
export const ISOLATED_VERIFICATION_CHECKS = Object.freeze(ISOLATED_MECHANISMS.map((m, i) => Object.freeze({
  mechanismId: m.id, definitionSha256: m.definitionSha256,
  allowedMethods: Object.freeze(["documentation-review", ...(m.id === "tools-empty-denied" ? [] : ["structure-review"]),
    ...(m.id === "managed-sources-excluded" ? [] : ["fixture-test"]), "native-test"]),
  requiredCoverage: Object.freeze([...coverage[i]])
})));
const provenanceBasis = Object.freeze({ documented: "documentation", "local-structure-observation": "structure",
  "operator-attested": "attestation", "fixture-claim": "fixture-test", "native-claim": "native-test" });
const methodBasis = Object.freeze({ "documentation-review": "documentation", "structure-review": "structure", "fixture-test": "fixture-test", "native-test": "native-test" });
const utc = v => typeof v === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString() === v.replace(/Z$/, ".000Z");
const byId = values => [...values].sort((a, b) => a.mechanismId < b.mechanismId ? -1 : a.mechanismId > b.mechanismId ? 1 : 0);
function strictJson(input) {
  if (types.isProxy(input)) fail("verification-invalid-input");
  const d = typeof input === "string" || types.isUint8Array(input)
    ? parseEventJson(decode(copyBytes(input, 32768))) : copyInertJson(input);
  return copyInertJson(parseEventJson(decode(copyBytes(JSON.stringify(d), 32768))));
}
const emptyRow = c => ({ mechanismId: c.mechanismId, methodId: null, state: "unresolved",
  requiredCoverage: [...c.requiredCoverage], missingCoverage: [...c.requiredCoverage],
  missingEvidence: ["planning-check", "native-effectiveness-evidence", "trusted-provenance"], reasons: [], evidenceAuthenticated: false });

/** Pure planning. Even a complete plan cannot authorize or authenticate a native run. */
export function createIsolatedVerificationPlanner(schema, trustedCatalog) {
  let valid, catalog, evaluateVariant;
  try {
    const s = copyInertJson(schema); catalog = strictJson(trustedCatalog);
    if (s.$id !== VERIFICATION_SCHEMA_ID || catalog.variantSchema?.$id !== ISOLATED_SCHEMA_ID) throw Error();
    evaluateVariant = createIsolatedVariantEvaluator(catalog.variantSchema, catalog.variantPolicy);
    const ajv = new Ajv2020({ strict: true, allErrors: true }); ajv.addFormat("date-time", { type: "string", validate: utc });
    ajv.addSchema(catalog.variantSchema); ajv.addSchema(s);
    valid = Object.fromEntries(["input", "catalog", "report"].map(n => [n, ajv.compile({ $ref: `${VERIFICATION_SCHEMA_ID}#/$defs/${n}` })]));
    if (!valid.catalog(catalog)) throw Error();
    const normalized = byId(catalog.checks).map(c => ({ ...c, allowedMethods: [...c.allowedMethods].sort(), requiredCoverage: [...c.requiredCoverage].sort() }));
    const expected = byId(ISOLATED_VERIFICATION_CHECKS).map(c => ({ ...c, allowedMethods: [...c.allowedMethods].sort(), requiredCoverage: [...c.requiredCoverage].sort() }));
    if (hash(normalized) !== hash(expected)) throw Error();
  } catch { throw Error("Invalid isolated-verification schema or catalog"); }
  const revoked = new Set(catalog.variantPolicy.revokedReferences);
  const catalogSha256 = hash({ catalogId: catalog.catalogId, checks: ISOLATED_VERIFICATION_CHECKS, variantSchema: catalog.variantSchema });
  return input => {
    const r = { scope: "isolated-verification-plan-only", state: "invalid", decision: "no-native-start",
      matrix: ISOLATED_VERIFICATION_CHECKS.map(emptyRow), reasons: [], planSha256: null, variantScopeSha256: null,
      executed: false, runtimeReady: false, verifiedAdmission: false, externalBillingVerified: false, effectiveIsolationVerified: false };
    try {
      const d = strictJson(input); if (!valid.input(d)) fail("verification-invalid-input");
      const v = evaluateVariant(d.variant); if (v.state === "invalid") fail("verification-invalid-input");
      r.variantScopeSha256 = v.scopeSha256;
      r.planSha256 = hash({ variantScopeSha256: v.scopeSha256, catalogSha256,
        checks: byId(d.checks).map(c => ({ mechanismId: c.mechanismId, methodId: c.methodId, coverage: [...c.coverage].sort(), containment: c.containment })) });
      const blocked = new Set(), reasons = new Set();
      if (v.state === "blocked") blocked.add("verification-variant-blocked");
      if (v.state === "incomplete") reasons.add("verification-variant-evidence-unresolved");
      if (d.variant.candidate.authentication === "unknown") blocked.add("verification-authentication-unresolved");
      if (new Set(d.checks.map(c => c.mechanismId)).size !== d.checks.length) blocked.add("verification-duplicate-check");
      for (let i = 0; i < r.matrix.length; i++) {
        const row = r.matrix[i], template = ISOLATED_VERIFICATION_CHECKS[i];
        const c = d.checks.find(x => x.mechanismId === row.mechanismId), rowBlocked = new Set(), rowReasons = new Set();
        const observation = d.variant.observations.find(o => o.mechanismId === row.mechanismId);
        if (!d.variant.mechanisms.includes(row.mechanismId)) {
          rowBlocked.add("verification-variant-mechanism-missing"); row.missingEvidence.push("variant-mechanism-selection");
        }
        if (!observation || observation.state === "unknown") {
          rowReasons.add("verification-variant-observation-unresolved"); row.missingEvidence.push("variant-structural-reference");
        }
        if (row.mechanismId === "managed-sources-excluded" && (!observation || observation.state === "unknown")) {
          rowBlocked.add("verification-managed-policy-unresolved"); row.missingEvidence.push("effective-managed-policy");
        }
        if (!c) rowBlocked.add("verification-check-missing");
        else {
          row.methodId = c.methodId; row.missingEvidence = row.missingEvidence.filter(x => x !== "planning-check");
          row.missingCoverage = template.requiredCoverage.filter(p => !c.coverage.includes(p));
          if (!template.allowedMethods.includes(c.methodId)) rowBlocked.add("verification-method-not-allowed");
          if (new Set(c.coverage).size !== c.coverage.length) rowBlocked.add("verification-duplicate-coverage");
          if (row.missingCoverage.length || ["unknown", "prohibited-effect-required"].includes(c.containment)) {
            row.state = "not-observable-in-scope"; rowBlocked.add("verification-effect-or-coverage-unresolved");
          }
          const reviewOnly = ["documentation-review", "structure-review"].includes(c.methodId);
          if (reviewOnly && c.containment !== "not-needed" || !reviewOnly && c.containment === "not-needed") rowBlocked.add("verification-containment-inconsistent");
          const e = c.evidence;
          if (!e) { row.missingEvidence.push("current-scoped-reference"); rowReasons.add("verification-evidence-pending"); }
          else {
            const age = Date.parse(d.variant.now) - Date.parse(e.observedAt);
            if (revoked.has(e.referenceId)) rowBlocked.add("verification-evidence-revoked");
            if (age < 0) rowBlocked.add("verification-evidence-future");
            if (age > catalog.variantPolicy.maxEvidenceAgeSeconds * 1000) rowBlocked.add("verification-evidence-expired");
            if (e.scopeSha256 !== r.planSha256 || e.definitionSha256 !== template.definitionSha256) rowBlocked.add("verification-binding-mismatch");
            if (e.provenance === "rejected" || e.outcome === "incompatible") { row.state = "incompatible"; rowBlocked.add("verification-evidence-incompatible"); }
            else if (e.basis !== provenanceBasis[e.provenance]) rowBlocked.add("verification-provenance-mismatch");
            if (e.provenance === "native-claim") rowBlocked.add("verification-native-provenance-unverified");
            if (e.provenance === "operator-attested") rowReasons.add("verification-attestation-not-proof");
            else if (e.basis !== methodBasis[c.methodId]) rowBlocked.add("verification-method-evidence-mismatch");
            if (e.outcome === "unknown") { row.missingEvidence.push("current-scoped-reference"); rowReasons.add("verification-evidence-unresolved"); }
            if (!rowBlocked.size && row.state === "unresolved" && e.outcome === "supported") {
              if (e.provenance === "documented") row.state = "documented-only";
              if (e.provenance === "local-structure-observation") row.state = "structure-only";
              if (e.provenance === "fixture-claim") row.state = "test-scoped";
            }
          }
        }
        if (rowBlocked.size && !["incompatible", "not-observable-in-scope"].includes(row.state)) row.state = "unresolved";
        // Every native claim still lacks a trusted collector, regardless of apparent consistency.
        rowReasons.add("verification-native-effectiveness-pending");
        row.missingEvidence = [...new Set(row.missingEvidence)].sort();
        row.reasons = [...new Set([...rowBlocked, ...rowReasons])].sort();
        for (const reason of rowBlocked) blocked.add(reason);
        for (const reason of rowReasons) reasons.add(reason);
      }
      r.state = blocked.size ? "blocked" : "plan-review-required";
      r.reasons = [...new Set([...blocked, ...reasons])].sort();
    } catch {
      r.state = "invalid"; r.matrix = ISOLATED_VERIFICATION_CHECKS.map(emptyRow);
      r.reasons = ["verification-invalid-input"]; r.planSha256 = null; r.variantScopeSha256 = null;
    }
    if (!valid.report(r)) throw Error("Isolated-verification report invariant failed");
    return r;
  };
}
