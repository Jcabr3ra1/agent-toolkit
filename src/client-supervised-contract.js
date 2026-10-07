import Ajv2020 from "ajv/dist/2020.js";
import { types } from "node:util";
import { copyBytes, decode, parseEventJson, copyInertJson, fail, ParseFailure } from "./client-output-json.js";
import { hash, same } from "./client-runtime-core.js";
import { REASON_CODES } from "./client-supervised-codes.js";

export { hash, same, fail, ParseFailure, copyInertJson };
export const LOCAL_ID = "https://agent-toolkit.local/schemas/agent-client-supervised-local.schema.json";
export const FIXTURE_IDS = Object.freeze(["success", "split-utf8", "environment", "silent", "blocked-stdin", "closed-stdin", "failure", "stdout-overflow", "stderr-overflow", "stderr-invalid", "long-line", "event-overflow", "invalid-utf8", "forbidden-event", "duplicate-json", "after-terminal", "unterminated", "incomplete", "ignore-term", "parent-child", "child-after-parent"]);
export const terminalStates = new Set(["completed-for-review", "failed", "canceled", "timed-out", "indeterminate"]);
export const zeroMetrics = () => ({ spawnAttempts: 0, mainStartsObserved: 0, stdoutBytes: 0, stderrBytes: 0, events: 0, elapsedMs: 0, terminationConfirmed: false });
export const taskKey = i => hash({ projectId: i.projectId, taskId: i.taskId });
export const monotonicMs = () => Number(process.hrtime.bigint() / 1_000_000n);
export const errorCode = e => e instanceof ParseFailure && REASON_CODES.includes(e.code) ? e.code : "supervised-local-error";

export function createSupervisedContract(schema) {
  const s = copyInertJson(schema);
  if (s.$id !== LOCAL_ID || !same(s.$defs.fixtureId.enum, FIXTURE_IDS) || !same(s.$defs.reasons.items.enum, REASON_CODES)) throw Error("Unsupported supervised local schema");
  const ajv = new Ajv2020({ strict: true, allErrors: true });
  ajv.addFormat("date-time", { type: "string", validate: v => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString() === v.replace(/Z$/, ".000Z") });
  ajv.addSchema(s);
  const v = Object.fromEntries(["identity", "request", "event", "receipt", "processReport", "report", "observation"].map(k => [k, ajv.compile({ $ref: `${LOCAL_ID}#/$defs/${k}` })]));
  function json(value) {
    if (types.isProxy(value)) fail("non-json-metadata");
    const obj = typeof value === "string" || types.isUint8Array(value)
      ? parseEventJson(decode(copyBytes(value, 131072))) : copyInertJson(value);
    const bytes = copyBytes(JSON.stringify(obj), 131072);
    // Strict string and Unicode validation for nested metadata too.
    return copyInertJson(parseEventJson(decode(bytes)));
  }
  const validate = (name, input) => { const obj = json(input); if (!v[name](obj)) fail("supervised-invalid-" + name); return obj; };
  return Object.freeze({
    request(input) {
      const d = validate("request", input), l = d.limits;
      if (l.graceMs + l.confirmationMs >= l.timeoutMs || l.maxLineBytes > l.maxOutputBytes) fail("supervised-incompatible-limits");
      copyBytes(d.inputText, l.maxInputBytes);
      return d;
    },
    identity: input => validate("identity", input),
    event: input => validate("event", input),
    receipt: input => validate("receipt", input),
    processReport(input) {
      const r = validate("processReport", input);
      if (r.fixtureExecuted !== (r.metrics.mainStartsObserved === 1) || r.metrics.mainStartsObserved > r.metrics.spawnAttempts ||
          r.state === "completed-for-review" && (!r.fixtureExecuted || !r.exitObserved || !r.pipesClosed ||
            r.groupObservation !== "absent" || !r.metrics.terminationConfirmed)) fail("supervised-invalid-processReport");
      return r;
    },
    report: input => validate("report", input),
    observation: input => validate("observation", input)
  });
}
