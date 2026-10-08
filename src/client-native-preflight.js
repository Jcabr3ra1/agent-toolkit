import Ajv2020 from "ajv/dist/2020.js";
import { types } from "node:util";
import { copyInertJson, copyBytes, decode, parseEventJson, fail } from "./client-output-json.js";
import { hash } from "./client-runtime-core.js";

export const PREFLIGHT_ID = "https://agent-toolkit.local/schemas/agent-client-native-preflight.schema.json";
export const PROJECTION_FIELDS = Object.freeze(["policy", "hooks", "commands", "mcp", "connectors", "api-helper", "third-party", "fallback", "delegation"]);
const stamp = v => typeof v === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString() === v.replace(/Z$/, ".000Z");

export function strictPreflightJson(input) {
  if (types.isProxy(input)) fail("preflight-invalid-input");
  const obj = typeof input === "string" || types.isUint8Array(input)
    ? parseEventJson(decode(copyBytes(input, 32768))) : copyInertJson(input);
  return copyInertJson(parseEventJson(decode(copyBytes(JSON.stringify(obj), 32768))));
}
function validators(schema) {
  const s = copyInertJson(schema);
  if (s.$id !== PREFLIGHT_ID || JSON.stringify(s.$defs.field.properties.name.enum) !== JSON.stringify(PROJECTION_FIELDS)) throw Error("Unsupported preflight schema");
  const ajv = new Ajv2020({ strict: true, allErrors: true }); ajv.addFormat("date-time", { type: "string", validate: stamp }); ajv.addSchema(s);
  return Object.fromEntries(["input", "report", "auth"].map(n => [n, ajv.compile({ $ref: `${PREFLIGHT_ID}#/$defs/${n}` })]));
}

/** Extract only non-personal access fields; never echo unknown names or values. */
export function createNativeAccessExtractor(schema) {
  const valid = validators(schema);
  return input => {
    const d = strictPreflightJson(input);
    const auth = { loggedIn: d.loggedIn, authMethod: d.authMethod, subscriptionType: d.subscriptionType ?? null };
    if (!valid.auth(auth) || !auth.loggedIn && auth.authMethod !== "none" || auth.loggedIn && auth.authMethod === "none") fail("preflight-invalid-access");
    return auth;
  };
}

/** Pure consistency review, not an authentication or capability factory. */
export function createNativePreflightEvaluator(schema, trustedPolicy) {
  const valid = validators(schema), policy = copyInertJson(trustedPolicy);
  if (Object.keys(policy).sort().join() !== "expectedScopeSha256,maxEvidenceAgeSeconds,revokedReferences" ||
      !/^[a-f0-9]{64}$/.test(policy.expectedScopeSha256) || !Number.isSafeInteger(policy.maxEvidenceAgeSeconds) ||
      policy.maxEvidenceAgeSeconds < 1 || policy.maxEvidenceAgeSeconds > 3600 || !Array.isArray(policy.revokedReferences) ||
      policy.revokedReferences.length > 256 || policy.revokedReferences.some(v => typeof v !== "string" || !/^[a-z][a-z0-9-]{0,63}$/.test(v))) throw Error("Invalid preflight policy");
  const revoked = new Set(policy.revokedReferences);
  return input => {
    const r = { scope: "native-preflight-only", state: "invalid", queryEligible: false, nativeExecuted: false,
      inferenceRequested: false, actualModelCalls: null, runtimeReady: false, verifiedAdmission: false,
      externalBillingVerified: false, remoteCancellationVerified: false, reasons: [], unresolvedFields: [], audit: { inputSha256: null } };
    try {
      const d = strictPreflightJson(input);
      if (!valid.input(d)) fail("preflight-invalid-input");
      r.audit.inputSha256 = hash(d);
      const blocked = new Set(), missing = new Set();
      if (d.candidateScopeSha256 !== policy.expectedScopeSha256) blocked.add("preflight-binding-mismatch");
      const fresh = (time, ref, scope) => {
        if (scope !== null && scope !== policy.expectedScopeSha256 || ref !== null && revoked.has(ref) || time !== null && Date.parse(time) > Date.parse(d.now)) {
          blocked.add("preflight-evidence-rejected"); return false;
        }
        return scope === policy.expectedScopeSha256 && time !== null && ref !== null && Date.parse(d.now) - Date.parse(time) <= policy.maxEvidenceAgeSeconds * 1000;
      };
      const fields = d.projection.fields;
      if (new Set(fields.map(f => f.name)).size !== fields.length) blocked.add("preflight-duplicate-field");
      if (!d.projection.safeSource) missing.add("safe-projection-unavailable");
      for (const name of PROJECTION_FIELDS) {
        const f = fields.find(v => v.name === name);
        if (!f) { r.unresolvedFields.push(name); continue; }
        if (f.state === "present") blocked.add("preflight-critical-control-present");
        const a = f.assessment, current = fresh(a.checkedAt, a.referenceId, a.scopeSha256);
        if (!["absent", "disabled"].includes(f.state) || a.source !== "locally-observed" || !current) r.unresolvedFields.push(name);
      }
      if (r.unresolvedFields.length) missing.add("preflight-controls-unresolved");
      r.queryEligible = d.projection.safeSource && !r.unresolvedFields.length && !blocked.size;
      if (!d.access) missing.add("preflight-access-unresolved");
      else {
        const a = d.access;
        const current = fresh(a.assessment.checkedAt, a.assessment.referenceId, a.assessment.scopeSha256);
        if (a.assessment.source !== "locally-observed" || !current) missing.add("preflight-access-unresolved");
        if (!a.data.loggedIn || a.data.authMethod !== "claude.ai" || a.data.subscriptionType === "free") blocked.add("preflight-access-incompatible");
        if (a.data.subscriptionType === null) missing.add("preflight-subscription-unresolved");
      }
      if (!d.economy) missing.add("preflight-economy-unresolved");
      else {
        const e = d.economy;
        if (e.state === "enabled") blocked.add("preflight-economy-enabled");
        if (e.state !== "disabled" || e.source !== "operator-attested" || !fresh(e.receivedAt, e.referenceId, e.scopeSha256)) missing.add("preflight-economy-unresolved");
        if (e.sessionContinuity !== true) missing.add("preflight-session-unresolved");
      }
      r.state = blocked.size ? "blocked" : missing.size ? "incomplete" : "review-complete";
      // Billing/access findings never authorize a diagnostic query by themselves.
      if (blocked.size) r.queryEligible = false;
      r.reasons = [...new Set([...blocked, ...missing])].sort();
      if (!r.reasons.length) r.reasons = ["preflight-review-complete"];
      r.unresolvedFields.sort();
    } catch { r.reasons = ["preflight-invalid-input"]; r.queryEligible = false; r.audit.inputSha256 = null; }
    if (!valid.report(r)) throw Error("Preflight report invariant failed");
    return r;
  };
}
