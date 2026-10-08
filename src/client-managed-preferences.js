import Ajv2020 from "ajv/dist/2020.js";
import { types } from "node:util";
import { copyInertJson, copyBytes, decode, parseEventJson, fail } from "./client-output-json.js";

export const PREFERENCES_SCHEMA_ID = "https://agent-toolkit.local/schemas/agent-client-managed-preferences.schema.json";
export const PREFERENCE_KEYS = Object.freeze(["hooks", "policyHelper", "apiKeyHelper", "env", "managedMcpServers", "disableAllHooks"]);
const transportReasons = Object.freeze(["preferences-transport-timeout", "preferences-transport-overflow", "preferences-transport-unconfirmed", "preferences-transport-changed-artifact", "preferences-transport-error"]);
function strictJson(input) {
  if (types.isProxy(input)) fail("preferences-invalid-output");
  const d = typeof input === "string" || types.isUint8Array(input)
    ? parseEventJson(decode(copyBytes(input, 32768))) : copyInertJson(input);
  return copyInertJson(parseEventJson(decode(copyBytes(JSON.stringify(d), 32768))));
}
const report = reason => ({ scope: "partial-preference-observation", state: "invalid", decision: "no-native-start",
  sourceClaim: null, fields: [], reasons: [reason], helperExecutionVerified: false, preferencesQueriedVerified: false,
  runtimeReady: false, verifiedAdmission: false, effectiveIsolationVerified: false, externalBillingVerified: false });

/** This decoder validates protocol claims; it does not launch or authenticate a helper. */
export function createManagedPreferencesReader(schema, expectedSource) {
  let valid;
  try {
    const s = copyInertJson(schema);
    if (s.$id !== PREFERENCES_SCHEMA_ID || JSON.stringify(s.$defs.field.properties.name.enum) !== JSON.stringify(PREFERENCE_KEYS) ||
        typeof expectedSource !== "string" || !["synthetic", "core-foundation-claim"].includes(expectedSource)) throw Error();
    const ajv = new Ajv2020({ strict: true, allErrors: true }); ajv.addSchema(s);
    valid = Object.fromEntries(["wire", "report"].map(n => [n, ajv.compile({ $ref: `${PREFERENCES_SCHEMA_ID}#/$defs/${n}` })]));
  } catch { throw Error("Invalid managed-preferences schema or source"); }
  const checked = r => { if (!valid.report(r)) throw Error("Managed-preferences report invariant failed"); return r; };
  return (input, exitCode) => {
    let r = report("preferences-invalid-output");
    try {
      const d = strictJson(input); if (!valid.wire(d)) fail("preferences-invalid-output");
      if (d.source !== expectedSource) return checked(report("preferences-source-mismatch"));
      if (!Number.isSafeInteger(exitCode) || exitCode !== (d.status === "complete" ? 0 : 1)) return checked(report("preferences-exit-mismatch"));
      if (d.status === "failed") { r.state = "helper-failed"; r.sourceClaim = d.source; r.reasons = [d.code]; }
      else {
        if (new Set(d.fields.map(f => f.name)).size !== 6) fail("preferences-invalid-output");
        r.state = "partial-observation"; r.sourceClaim = d.source;
        r.fields = PREFERENCE_KEYS.map(name => ({ ...d.fields.find(f => f.name === name) }));
        r.reasons = ["preferences-observation-partial"];
        if (r.fields.some(f => f.forced === "unknown")) r.reasons.push("preferences-force-unknown");
        if (r.fields.some(f => f.type === "not-found-by-api" && f.forced === "forced")) r.reasons.push("preferences-nonatomic-observation");
        r.reasons.sort();
      }
    } catch { r = report("preferences-invalid-output"); }
    return checked(r);
  };
}

/** Closed, bounded stdout accumulator. No provisional fields, native IO, or timers. */
export function createManagedPreferencesStreamReader(schema, expectedSource) {
  const read = createManagedPreferencesReader(schema, expectedSource);
  let buffer = Buffer.alloc(32768), bytes = 0, closed = false, error = null;
  const discard = reason => { buffer = null; bytes = 0; error = reason; };
  return Object.freeze({
    push(chunk) {
      if (closed) { discard("preferences-stream-closed"); return false; }
      if (error) return false;
      try {
        const b = copyBytes(chunk, 32768);
        if (bytes + b.length > 32768) { discard("preferences-transport-overflow"); return false; }
        Uint8Array.prototype.set.call(buffer, b, bytes); bytes += b.length; return true;
      } catch { discard("preferences-invalid-output"); return false; }
    },
    abort(reason) {
      if (closed) { discard("preferences-stream-closed"); return false; }
      discard(typeof reason === "string" && transportReasons.includes(reason) ? reason : "preferences-transport-error");
      return false;
    },
    finish(exitCode) {
      if (closed) return report("preferences-stream-closed");
      closed = true;
      if (error) { buffer = null; return report(error); }
      const result = read(buffer.subarray(0, bytes), exitCode); buffer = null; bytes = 0;
      return result;
    }
  });
}
