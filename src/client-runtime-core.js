import { createHash } from "node:crypto";
import Ajv2020 from "ajv/dist/2020.js";
import { copyInertJson, ParseFailure, fail } from "./client-output-json.js";

export { copyInertJson, ParseFailure, fail };
export const RUNTIME_ID = "https://agent-toolkit.local/schemas/agent-client-runtime.schema.json";
export const CONTROLS = ["no-tools", "no-subagents", "no-mcp", "no-hooks", "no-personalizations", "no-updates", "stdin-text", "no-fallback", "no-resume", "no-permission-bypass", "internal-call-limit"];
export const EFFECTS = ["native-auth", "provider-inference", "client-state", "telemetry", "descendants"];

export function validators(base, preference, adapter, runtime) {
  const schemas = [base, preference, adapter, runtime].map(copyInertJson);
  if (schemas[3].$id !== RUNTIME_ID) throw Error("Unsupported runtime schema");
  const ajv = new Ajv2020({ strict: true, allErrors: true });
  ajv.addFormat("date-time", { type: "string", validate: timestamp });
  schemas.forEach(s => ajv.addSchema(s));
  return Object.fromEntries(["admissionInput", "admissionReport", "stateInput", "stateReport", "ledger"]
    .map(name => [name, ajv.compile({ $ref: `${RUNTIME_ID}#/$defs/${name}` })]));
}
export function canonical(v) {
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  return `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${canonical(v[k])}`).join(",")}}`;
}
export const same = (a, b) => canonical(a) === canonical(b);
export const hash = v => createHash("sha256").update(canonical(v)).digest("hex");
export const unique = v => new Set(v).size === v.length;
export function fresh(stamp, now, maxAge = Infinity) {
  const checked = Date.parse(stamp.checkedAt); const expires = Date.parse(stamp.expiresAt); const current = Date.parse(now);
  return checked < expires && checked <= current && current < expires && current - checked <= maxAge * 1000;
}
export function tested(stamp, now, maxAge) {
  return stamp.status === "locally-tested" && stamp.source === "installation-test" && fresh(stamp, now, maxAge);
}
function timestamp(v) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(v)) return false;
  const t = Date.parse(v); return Number.isFinite(t) && new Date(t).toISOString() === v.replace(/Z$/, ".000Z");
}

// Validate accounting relations, not authenticity. Called only after schema validation.
export function ledgerFacts(ledger, now) {
  if (!unique(ledger.attempts.map(a => a.attemptId))) fail("duplicate-ledger-attempt");
  const history = copyInertJson(ledger.importedHistory);
  let starts = ledger.importedMainStartsUsed; let active = 0; let previousTime = -Infinity; let uncertain = false; let overrun = false;
  for (const [index, a] of ledger.attempts.entries()) {
    if (a.identity.projectId !== ledger.projectId || a.identity.taskId !== ledger.taskId) fail("foreign-ledger-attempt");
    const reserved = Date.parse(a.reservedAt); const updated = Date.parse(a.updatedAt);
    if (reserved < previousTime || updated < reserved || updated > Date.parse(now)) fail("ledger-chronology-conflict");
    previousTime = updated;
    if (a.state !== "settled") {
      active++;
      if (index !== ledger.attempts.length - 1 || active > 1) fail("multiple-active-attempts");
      if (a.actualCalls !== null || a.actualSeconds !== null || a.evidenceRef !== null) fail("unsettled-consumption-present");
      if (a.state === "reserved" && (a.startObservation !== "not-reported" || a.outcome !== null)) fail("invalid-reserved-attempt");
      if (a.state === "started" && (a.startObservation !== "started" || a.outcome !== null)) fail("invalid-started-attempt");
      if (a.state === "reconciliation-required" && (!["started", "unknown"].includes(a.startObservation) || a.outcome !== "indeterminate")) fail("invalid-interrupted-attempt");
      if (a.state !== "reserved") uncertain = true;
    } else {
      if (a.actualCalls === null || a.actualSeconds === null || a.evidenceRef === null || a.outcome === null || a.outcome === "indeterminate") fail("unproven-settlement");
      if (!["started", "not-started"].includes(a.startObservation)) fail("invalid-settlement-observation");
      if (a.startObservation === "not-started" && (a.actualCalls !== 0 || a.actualSeconds !== 0 || a.outcome !== "not-started")) fail("not-started-consumption-conflict");
      if (a.startObservation === "started" && a.outcome === "not-started") fail("started-outcome-conflict");
      history.executionsUsed += a.actualCalls; history.durationUsedSeconds += a.actualSeconds;
      if (a.startObservation === "started" && a.actualCalls > 0) {
        history.previousProfileId = a.profileId; history.previousEffort = a.effort;
      }
      if (a.actualCalls > a.reservedCalls || a.actualSeconds > a.reservedSeconds) overrun = true;
    }
    if (a.startObservation === "started") starts++;
  }
  if (starts > 1_000_000 || history.executionsUsed > 1_000_000 || history.durationUsedSeconds > 1_000_000) fail("ledger-counter-limit");
  if (!same(ledger.history, history) || ledger.mainStartsUsed !== starts) fail("ledger-total-mismatch");
  if ((uncertain || overrun) && ledger.status !== "reconciliation-required") fail("ledger-uncertainty-hidden");
  return { active, uncertain, overrun, history, starts };
}

export function recalculate(ledger) {
  const history = copyInertJson(ledger.importedHistory); let starts = ledger.importedMainStartsUsed; let pending = false;
  for (const a of ledger.attempts) {
    if (a.startObservation === "started") starts++;
    if (a.state !== "settled" && a.state !== "reserved") pending = true;
    if (a.state === "settled") {
      history.executionsUsed += a.actualCalls; history.durationUsedSeconds += a.actualSeconds;
      if (a.startObservation === "started" && a.actualCalls > 0) { history.previousProfileId = a.profileId; history.previousEffort = a.effort; }
      if (a.actualCalls > a.reservedCalls || a.actualSeconds > a.reservedSeconds) pending = true;
    }
  }
  if (starts > 1_000_000 || history.executionsUsed > 1_000_000 || history.durationUsedSeconds > 1_000_000) fail("ledger-counter-limit");
  ledger.history = history; ledger.mainStartsUsed = starts;
  if (pending) ledger.status = "reconciliation-required";
  else if (ledger.attempts.every(a => a.state === "settled")) ledger.status = "reconciled";
  return ledger;
}
