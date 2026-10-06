import Ajv2020 from "ajv/dist/2020.js";
import { copyInertJson } from "./client-output-json.js";
import { copyTaskJson, taskRelativePath, taskHash } from "./task-prepare.js";

export const VERIFY_SCHEMA_ID = "https://agent-toolkit.local/schemas/agent-task-verify.schema.json";
// totalBytes bounds bytes read from observed entries only; the contract has its own contractBytes cap.
export const VERIFY_LIMITS = Object.freeze({ contractBytes: 524288, entries: 128, fileBytes: 8388608,
  totalBytes: 33554432, chunkBytes: 65536, reportBytes: 131072 });
export const VERIFY_FACTS = Object.freeze({ scopeCoverage: "listed-files-only", unlistedChangesVerified: false,
  contentQualityVerified: false, testsExecuted: false, permissionVerified: false, approvalGranted: false,
  gitStateVerified: false, modelVerified: false, nativeAdmission: false, runtimeReady: false,
  wrote: false, sent: false, executed: false, humanReviewRequired: true });
// Internal key for task-verify-files.js. A report stays copyable data and never authorizes anything.
export const LOCAL_READ = Symbol("agent-task-verify.local-read");
const EXPECTATIONS = Object.freeze({
  inspect: (before, after) => before !== null && after === before,
  modify: (before, after) => before !== null && after !== null,
  create: (before, after) => before === null && after !== null,
  delete: (before, after) => before !== null && after === null });
const CLIENT_DIRS = [".claude", ".codex", ".gemini", ".agents"];
const pathKey = (root, p) => root + "/" + p.normalize("NFC").toLowerCase();
const shaOrNull = v => typeof v === "string" && /^[a-f0-9]{64}$/.test(v) ? v : null;

export function verifyRelativePath(p) {
  return taskRelativePath(p) && p.split("/").every(part => !CLIENT_DIRS.includes(part.toLowerCase()));
}
function contractReasons(c) {
  const reasons = new Set(), ids = new Set(), keys = [];
  for (const e of c.entries) {
    if (ids.has(e.id)) reasons.add("verify-duplicate-id");
    ids.add(e.id);
    if (!verifyRelativePath(e.path)) reasons.add("verify-path-invalid");
    if (!EXPECTATIONS[e.operation](e.before, e.after)) reasons.add("verify-expectation-conflict");
    keys.push(pathKey(e.root, e.path));
  }
  // The same path twice, or a listed file that is also a listed entry's directory, is ambiguous.
  if (keys.some((k, i) => keys.some((o, j) => i !== j && (o === k || o.startsWith(k + "/"))))) reasons.add("verify-path-collision");
  return [...reasons];
}

export function createTaskVerifier(trustedSchema) {
  let schema, validContract, validInput, validReport;
  try {
    schema = copyInertJson(trustedSchema);
    if (schema.$id !== VERIFY_SCHEMA_ID) throw Error();
    const ajv = new Ajv2020({ strict: true, allErrors: false });
    ajv.addSchema(schema);
    [validContract, validInput, validReport] = ["contract", "input", "report"].map(d => ajv.compile({ $ref: `${VERIFY_SCHEMA_ID}#/$defs/${d}` }));
  } catch { throw Error("Invalid trusted verify schema"); }
  const schemaSha256 = taskHash(schema);
  const blank = audit => ({ command: "agent-task verify", schemaVersion: "1.0.0", state: "invalid", phase: null, identity: null,
    provenance: "none", results: [], reasons: [], audit: { verifySchemaSha256: schemaSha256, contractSha256: null,
      contractByteSha256: shaOrNull(audit?.contractByteSha256), expectedPinSha256: shaOrNull(audit?.expectedPinSha256) }, ...VERIFY_FACTS });
  const finish = (out, state, codes) => {
    out.state = state; out.reasons = [...new Set(codes)].sort();
    if (state !== "matched" && state !== "mismatched") { out.results = []; out.provenance = "none"; }
    // Never truncate results to look complete: an oversized report becomes invalid.
    if (Buffer.byteLength(JSON.stringify(out)) > VERIFY_LIMITS.reportBytes) Object.assign(out, { state: "invalid", results: [], provenance: "none", reasons: ["verify-output-limit"] });
    if (!validReport(out)) throw Error("Task verify invariant failed");
    return out;
  };
  const checkContract = value => {
    let c;
    try { c = copyTaskJson(value); } catch { return { ok: false, reasons: ["verify-contract-invalid"] }; }
    if (!validContract(c)) return { ok: false, reasons: ["verify-contract-invalid"] };
    const reasons = contractReasons(c);
    return reasons.length ? { ok: false, reasons } : { ok: true, contract: c };
  };
  function run(input, provenance, audit) {
    let a = null;
    try { a = audit === null || audit === undefined ? null : copyInertJson(audit); } catch { a = null; }
    const out = blank(a);
    let d;
    try { d = copyTaskJson(input); } catch { return finish(out, "invalid", ["verify-invalid-input"]); }
    if (!validInput(d)) return finish(out, "invalid", ["verify-invalid-input"]);
    out.phase = d.phase;
    const checked = checkContract(d.contract);
    if (!checked.ok) return finish(out, "invalid", checked.reasons);
    const c = checked.contract;
    out.identity = { ...c.identity }; out.audit.contractSha256 = taskHash(c);
    if (provenance === "local-read" && (out.audit.contractByteSha256 === null || out.audit.contractByteSha256 !== out.audit.expectedPinSha256))
      return finish(out, "blocked", ["verify-pin-mismatch"]);
    const byId = new Map();
    for (const o of d.observations) {
      if (byId.has(o.id)) return finish(out, "invalid", ["verify-observation-mismatch"]);
      byId.set(o.id, o);
    }
    if (byId.size !== c.entries.length || c.entries.some(e => !byId.has(e.id))) return finish(out, "invalid", ["verify-observation-mismatch"]);
    // A present file whose hash is expected must carry that observed hash.
    if (c.entries.some(e => e[d.phase] !== null && byId.get(e.id).status === "present" && byId.get(e.id).sha256 === null))
      return finish(out, "invalid", ["verify-observation-mismatch"]);
    if (d.observations.some(o => o.status === "blocked")) return finish(out, "blocked", ["verify-observation-blocked"]);
    const differences = [], notes = [];
    out.results = c.entries.map(e => {
      const expected = e[d.phase], o = byId.get(e.id), observed = o.status === "present" ? o.sha256 : null;
      const outcome = expected === null ? (o.status === "absent" ? "matched-absent" : "unexpected-present")
        : o.status === "absent" ? "missing" : observed === expected ? "matched-hash" : "hash-differs";
      if (!outcome.startsWith("matched-")) differences.push("verify-" + outcome);
      if (e.operation === "modify" && e.before === e.after) notes.push("verify-modify-without-delta");
      return { id: e.id, root: e.root, operation: e.operation, outcome, expected, observed };
    });
    out.provenance = provenance;
    return finish(out, differences.length ? "mismatched" : "matched", [...(differences.length ? differences : ["verify-matched"]), ...notes]);
  }
  function failure(state, codes, context = {}) {
    if (state !== "blocked" && state !== "invalid") throw Error("Verify failure state required");
    const ctx = copyInertJson(context), out = blank(ctx.audit);
    out.phase = ctx.phase === "before" || ctx.phase === "after" ? ctx.phase : null;
    if (ctx.contract) {
      const checked = checkContract(ctx.contract);
      if (checked.ok) { out.identity = { ...checked.contract.identity }; out.audit.contractSha256 = taskHash(checked.contract); }
    }
    return finish(out, state, copyInertJson(codes));
  }
  return Object.freeze({ checkContract, failure,
    evaluate: input => run(input, "declared-observations", null),
    [LOCAL_READ]: (input, audit) => run(input, "local-read", audit) });
}
