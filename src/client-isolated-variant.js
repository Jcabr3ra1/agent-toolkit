import Ajv2020 from "ajv/dist/2020.js";
import { types } from "node:util";
import { copyInertJson, copyBytes, decode, parseEventJson, fail } from "./client-output-json.js";
import { hash } from "./client-runtime-core.js";

export const ISOLATED_VARIANT_ID = "claude-subscription-text-v1";
export const ISOLATED_SCHEMA_ID = "https://agent-toolkit.local/schemas/agent-client-isolated-variant.schema.json";
// Semantic constraints, deliberately not flags, settings, commands or guarantees.
export const ISOLATED_MECHANISMS = Object.freeze([
  ["tools-empty-denied", "empty-tools-and-total-denial"],
  ["restricted-settings", "restricted-session-and-limited-setting-sources"],
  ["local-personalizations-excluded", "local-personalizations-excluded-without-editing"],
  ["session-hooks-disabled", "session-hook-exclusion-not-managed-hook-proof"],
  ["managed-sources-excluded", "managed-and-host-sources-require-separate-proof"],
  ["strict-empty-mcp", "strict-owned-empty-mcp-with-managed-conflict-check"],
  ["connectors-disabled", "cloud-connector-discovery-excluded"],
  ["browser-ide-excluded", "browser-and-ide-not-enabled"],
  ["skills-plugins-delegation-excluded", "skills-plugins-and-delegation-excluded"],
  ["minimal-environment", "explicit-minimal-environment-without-api-or-helper"],
  ["updates-nonessential-traffic-disabled", "updates-and-nonessential-traffic-excluded"],
  ["resume-persistence-fallback-excluded", "no-resume-persistence-or-requested-fallback"]
].map(([id, constraint]) => Object.freeze({ id, constraint, definitionSha256: hash({ id, constraint, revision: 1 }) })));
const ids = ISOLATED_MECHANISMS.map(m => m.id);
const definitions = new Map(ISOLATED_MECHANISMS.map(m => [m.id, m.definitionSha256]));
const basis = Object.freeze({ documented: "documentation", "local-structure-observation": "structure", "operator-attested": "attestation", "native-variant-tested": "native-test" });
const utc = v => typeof v === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString() === v.replace(/Z$/, ".000Z");

function strictJson(input) {
  if (types.isProxy(input)) fail("isolated-invalid-input");
  const d = typeof input === "string" || types.isUint8Array(input)
    ? parseEventJson(decode(copyBytes(input, 32768))) : copyInertJson(input);
  return copyInertJson(parseEventJson(decode(copyBytes(JSON.stringify(d), 32768))));
}
const sortById = values => [...values].sort((a, b) => a.mechanismId < b.mechanismId ? -1 : a.mechanismId > b.mechanismId ? 1 : 0);

/** Checks consistency of unverified declarations; cannot issue a native permit. */
export function createIsolatedVariantEvaluator(schema, trustedPolicy) {
  let validators, policy;
  try {
    const s = copyInertJson(schema);
    if (s.$id !== ISOLATED_SCHEMA_ID || hash(s.$defs.mechanismId.enum) !== hash(ids)) throw Error();
    const ajv = new Ajv2020({ strict: true, allErrors: true });
    ajv.addFormat("date-time", { type: "string", validate: utc }); ajv.addSchema(s);
    validators = Object.fromEntries(["input", "policy", "report"].map(n => [n, ajv.compile({ $ref: `${ISOLATED_SCHEMA_ID}#/$defs/${n}` })]));
    policy = strictJson(trustedPolicy);
    if (!validators.policy(policy)) throw Error();
  } catch { throw Error("Invalid isolated-variant schema or policy"); }
  const revoked = new Set(policy.revokedReferences);
  const normalizedPolicy = { ...policy, revokedReferences: [...policy.revokedReferences].sort(), allowedVariants: [...policy.allowedVariants].sort() };
  return input => {
    const r = { scope: "isolated-variant-claims-only", state: "invalid", reasons: [], unresolvedMechanisms: [],
      descriptionSha256: null, scopeSha256: null, executed: false, runtimeReady: false, verifiedAdmission: false,
      externalBillingVerified: false, effectiveIsolationVerified: false };
    try {
      const d = strictJson(input);
      if (!validators.input(d)) fail("isolated-invalid-input");
      const blocked = new Set(), missing = new Set(), unresolved = new Set();
      const description = { schemaVersion: d.schemaVersion, variantId: d.variantId, candidate: d.candidate,
        mode: d.mode, role: d.role, mechanisms: [...d.mechanisms].sort(), observations: sortById(d.observations) };
      r.descriptionSha256 = hash(description);
      r.scopeSha256 = hash({ description, policy: normalizedPolicy, definitions: ISOLATED_MECHANISMS });
      if (!policy.allowedVariants.includes(d.variantId)) blocked.add("isolated-variant-not-allowed");
      if (["api", "bare"].includes(d.candidate.authentication)) blocked.add("isolated-authentication-incompatible");
      if (d.candidate.authentication === "unknown") missing.add("isolated-authentication-unresolved");
      const unique = (values, key) => {
        if (new Set(values.map(key)).size !== values.length) blocked.add("isolated-duplicate-mechanism");
      };
      unique(d.mechanisms, v => v); unique(d.observations, v => v.mechanismId); unique(d.assessments, v => v.mechanismId);
      const fresh = (time, ref) => {
        if (revoked.has(ref)) { blocked.add("isolated-evidence-revoked"); return false; }
        const age = Date.parse(d.now) - Date.parse(time);
        if (age < 0) { blocked.add("isolated-evidence-future"); return false; }
        if (age > policy.maxEvidenceAgeSeconds * 1000) { blocked.add("isolated-evidence-expired"); return false; }
        return true;
      };
      for (const id of ids) {
        if (!d.mechanisms.includes(id)) { missing.add("isolated-mechanism-missing"); unresolved.add(id); }
        const o = d.observations.find(v => v.mechanismId === id);
        if (!o) { missing.add("isolated-observation-missing"); unresolved.add(id); }
        else if (!fresh(o.observedAt, o.referenceId) || o.state === "unknown") {
          missing.add("isolated-observation-unresolved"); unresolved.add(id);
        }
        const a = d.assessments.find(v => v.mechanismId === id);
        if (!a || a.provenance === "pending") { missing.add("isolated-assessment-missing"); unresolved.add(id); continue; }
        const current = fresh(a.observedAt, a.referenceId);
        if (a.scopeSha256 !== r.scopeSha256 || a.definitionSha256 !== definitions.get(id)) {
          blocked.add("isolated-evidence-binding-mismatch"); unresolved.add(id);
        }
        if (a.provenance === "rejected" || a.outcome === "incompatible") { blocked.add("isolated-mechanism-incompatible"); unresolved.add(id); }
        if (a.provenance !== "rejected" && a.basis !== basis[a.provenance]) { blocked.add("isolated-provenance-mismatch"); unresolved.add(id); }
        if (!current || a.provenance !== "native-variant-tested" || a.basis !== "native-test" || a.outcome !== "supported") {
          missing.add("isolated-effectiveness-unresolved"); unresolved.add(id);
        }
      }
      r.state = blocked.size ? "blocked" : missing.size ? "incomplete" : "ready-for-variant-review";
      r.reasons = [...new Set([...blocked, ...missing])].sort();
      if (!r.reasons.length) r.reasons = ["isolated-claims-ready-for-review"];
      r.unresolvedMechanisms = [...unresolved].sort();
    } catch {
      r.state = "invalid"; r.reasons = ["isolated-invalid-input"]; r.unresolvedMechanisms = [];
      r.descriptionSha256 = null; r.scopeSha256 = null;
    }
    if (!validators.report(r)) throw Error("Isolated-variant report invariant failed");
    return r;
  };
}
