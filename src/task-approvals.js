import { createHash } from "node:crypto";
import Ajv2020 from "ajv/dist/2020.js";
import { copyBytes, copyInertJson, decode, fail, parseEventJson, ParseFailure } from "./client-output-json.js";

export const APPROVALS_ID = "https://agent-toolkit.local/schemas/agent-task-approvals.schema.json";
export const LIMITS = Object.freeze({ maxBytes: 1_000_000, maxEvents: 256 });
const OPEN = ["reserved", "started", "indeterminate"];
const BAD_PATH = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}\\*?[\]{}]/u;

// Declared data only: nothing here proves who approved, what ran or what time it is.
class Refusal extends Error {
  constructor(state, code) { super(code); this.state = state; this.code = code; }
}
const block = code => { throw new Refusal("blocked", code); };

function canonical(v) {
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  return `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${canonical(v[k])}`).join(",")}}`;
}
// Internal: input is already inert JSON (validated or copied), so no further checks.
const digest = v => createHash("sha256").update(canonical(v)).digest("hex");
/**
 * Canonical SHA-256 of JSON data. It identifies content; it does not authenticate anyone.
 * Only bounded inert JSON is accepted: getters, proxies, cycles, functions (toJSON) and
 * non-plain objects are rejected by copyInertJson without invoking any callback.
 */
export function approvalHash(value) { return digest(copyInertJson(value)); }
const same = (a, b) => canonical(a) === canonical(b);
function freeze(v) {
  if (v && typeof v === "object") { Object.values(v).forEach(freeze); Object.freeze(v); }
  return v;
}

function validTime(v) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(v)) return false;
  const t = Date.parse(v);
  return Number.isFinite(t) && new Date(t).toISOString() === v.replace(/Z$/, ".000Z");
}
function validPath(p) {
  if (typeof p !== "string" || p.length === 0 || p.length > 256 || p !== p.normalize("NFC") || BAD_PATH.test(p)) return false;
  if (/^[A-Za-z]:/.test(p)) return false;
  return p.split("/").every(s => s !== "" && s !== "." && s !== "..");
}
// Logical comparison only. Symlinks and physical aliases are out of scope for this core.
function pathFacts(items) {
  const pairs = new Set(); const folded = new Map();
  for (const { path, action } of items) {
    if (!validPath(path)) fail("invalid-approval-path");
    const pair = JSON.stringify([path, action]);
    if (pairs.has(pair)) fail("duplicate-approval-path");
    pairs.add(pair);
    const key = path.normalize("NFKC").toLowerCase();
    if (folded.has(key) && folded.get(key) !== path) fail("path-collision");
    folded.set(key, path);
  }
  const keys = [...folded.keys()];
  if (keys.some(k => keys.some(o => o.startsWith(`${k}/`)))) fail("path-file-directory-conflict");
}
// Effects must match what the actions and checks imply, in both directions. Never auto-added.
function effectFacts(items, checks, effects) {
  if (items.some(i => i.action !== "read") !== effects.includes("workspace-write")) fail("effect-path-mismatch");
  if ((checks.length > 0) !== effects.includes("test-execution")) fail("effect-check-mismatch");
}

const itemKey = i => JSON.stringify([i.path, i.action]);
// Identity of the work, not of its bookkeeping: ids, array order and the base do not matter,
// the concrete artifact does. A reviewed correction therefore is new work, not a repeat.
const workKey = (items, checks, effects, artifactSha256) =>
  canonical([items.map(itemKey).sort(), [...checks].sort(), [...effects].sort(), artifactSha256]);
const within = (items, allowed, key = x => x) => {
  const set = new Set(allowed.map(key));
  return items.every(i => set.has(key(i)));
};
const live = r => r.ops.filter(o => o.state !== "released-declared");
const remaining = r => ({
  operations: Math.max(0, r.scope.limits.maxOperations - live(r).length),
  corrections: Math.max(0, r.scope.limits.maxCorrections - r.corrections),
  retries: Math.max(0, r.scope.limits.maxRetries - r.retries)
});
// A new request may follow only requests that consumed nothing. Renewals after consumption,
// overlapping requests and other recipients need an accounting context RA-A does not have.
const pristine = r => r.status === "denied"
  || ((r.status === "revoked" || r.status === "closed") && r.ops.length === 0 && r.corrections === 0);

function requestFacts(e, history) {
  const { scope } = e;
  if (scope.projectId !== history.projectId || scope.taskId !== history.taskId) fail("foreign-request-identity");
  if (digest(scope) !== e.scopeSha256) fail("scope-hash-mismatch");
  if (!validTime(scope.validFrom) || !validTime(scope.expiresAt) || Date.parse(scope.validFrom) >= Date.parse(scope.expiresAt)) fail("invalid-validity");
  if (scope.limits.maxRetries >= scope.limits.maxOperations) fail("invalid-limits");
  pathFacts(scope.paths);
  effectFacts(scope.paths, scope.checks, scope.effects);
  const seen = new Set();
  for (const t of e.baseBinding.transitions) {
    const key = `${t.fromSha256}>${t.toSha256}`;
    if (t.fromSha256 === t.toSha256 || seen.has(key)) fail("invalid-base-transition");
    seen.add(key);
  }
}

function newRequest(e) {
  return {
    requestId: e.requestId, scope: e.scope, scopeSha256: e.scopeSha256, requestSha256: digest(e), status: "pending",
    artifact: e.artifact, revisions: new Set([e.artifact.revision]), shas: new Set([e.artifact.sha256]),
    corrections: 0, retries: 0, base: e.baseBinding.initialSha256, transitions: e.baseBinding.transitions,
    divergedBase: null, ops: []
  };
}

// Shared by reserve events and prospective coverage. Returns null or [state, reason].
function admission(r, s, now) {
  if (r.status === "pending") return ["approval-needed", "decision-pending"];
  if (r.status !== "approved") return ["blocked", r.status];
  if (!within(s.items, r.scope.paths, itemKey) || !within(s.checks, r.scope.checks) || !within(s.effects, r.scope.effects)) return ["approval-needed", "outside-scope"];
  if (r.divergedBase !== null) return ["blocked", "unexpected-base-change"];
  if (s.base !== r.base) return ["blocked", "base-diverged"];
  if (s.revision !== r.artifact.revision || (s.sha !== null && s.sha !== r.artifact.sha256)) return ["blocked", "artifact-mismatch"];
  if (r.ops.some(o => o.state === "indeterminate")) return ["reconciliation-required", "reconciliation-required"];
  if (r.ops.some(o => OPEN.includes(o.state))) return ["blocked", "operation-in-progress"];
  if (now < Date.parse(r.scope.validFrom)) return ["blocked", "not-yet-valid"];
  if (now >= Date.parse(r.scope.expiresAt)) return ["approval-needed", "expired"];
  if (live(r).length >= r.scope.limits.maxOperations) return ["approval-needed", "budget-exhausted"];
  const key = workKey(s.items, s.checks, s.effects, r.artifact.sha256);
  const twins = live(r).filter(o => o.key === key);
  if (twins.some(o => o.state === "succeeded")) return ["blocked", "operation-already-finished"];
  if (s.retryOf === null) return twins.length ? ["blocked", "undeclared-retry"] : null;
  const origin = r.ops.find(o => o.operationId === s.retryOf);
  if (!origin || origin.state !== "failed" || origin.key !== key) return ["blocked", "invalid-retry"];
  if (r.retries >= r.scope.limits.maxRetries) return ["approval-needed", "retry-not-allowed"];
  return null;
}

// Per-file queries inside an already reserved operation: read-only, they never consume a use.
function inFlight(r, q, now) {
  if (r.status !== "approved") return ["blocked", r.status];
  const o = r.ops.find(x => x.operationId === q.operationId);
  if (!o) return ["blocked", "unknown-operation"];
  if (o.state === "indeterminate") return ["reconciliation-required", "reconciliation-required"];
  if (o.state !== "reserved" && o.state !== "started") return ["blocked", "operation-finished"];
  if (now >= Date.parse(r.scope.expiresAt)) return ["blocked", "expired-in-flight"];
  if (!within(q.items, o.items, itemKey) || !within(q.checks, o.checks) || !within(q.effects, o.effects)) return ["blocked", "outside-operation"];
  if (q.observedBaseSha256 !== o.expectedBase) return ["blocked", "base-diverged"];
  if (q.artifact.revision !== o.artifactRevision || q.artifact.sha256 !== o.artifactSha256) return ["blocked", "artifact-mismatch"];
  return null;
}

// An unexpected base is recorded, not hidden: the approval stays, new coverage is blocked.
function settle(r, o, outcome, resulting) {
  if (outcome === "succeeded" && resulting === null) fail("missing-result-base");
  o.state = outcome;
  if (resulting === null || resulting === o.expectedBase) return;
  if (r.transitions.some(t => t.fromSha256 === o.expectedBase && t.toSha256 === resulting)) r.base = resulting;
  else r.divergedBase = resulting;
}

function operationEvent(r, e, at, claim) {
  const o = r.ops.find(x => x.operationId === e.operationId);
  if (!o) block("unknown-operation");
  if (e.type === "start") {
    if (o.state !== "reserved") block("invalid-operation-transition");
    if (r.status !== "approved") block(r.status);
    if (at >= Date.parse(r.scope.expiresAt)) block("expired");
    o.state = "started"; o.sawStart = true; o.lastEventId = e.eventId;
  } else if (e.type === "interrupt") {
    if (o.state !== "reserved" && o.state !== "started") block("invalid-operation-transition");
    o.state = "indeterminate"; o.lastEventId = e.eventId;
  } else if (e.type === "result") {
    if (o.state !== "started") block("invalid-operation-transition");
    settle(r, o, e.outcome, e.resultingBaseSha256);
  } else {
    // Reconciliation is declared data. Missing start/result or a timeout has no evidence shape
    // here, so it can only leave the operation indeterminate; it never releases a use.
    const ev = e.evidence;
    if (!OPEN.includes(o.state)) block("invalid-operation-transition");
    if (ev.reservationEventId !== o.reserveEventId || ev.priorEventId !== o.lastEventId || ev.previousState !== o.state) block("reconcile-evidence-mismatch");
    claim(ev.decisionRef);
    if (e.resolution === "not-started-confirmed") {
      if (ev.observation !== "non-start-confirmed" || o.sawStart) block("reconcile-contradiction");
      if (ev.inspectedBaseSha256 !== o.expectedBase) block("non-start-base-mismatch");
      if (e.resultingBaseSha256 !== null) fail("unexpected-result-base");
      o.state = "released-declared";
    } else {
      if (ev.observation !== "termination-observed") block("reconcile-contradiction");
      settle(r, o, e.resolution === "finished-succeeded" ? "succeeded" : "failed", e.resultingBaseSha256);
    }
  }
}

function reduceHistory(history, checkpoint) {
  const { events } = history;
  if (events.length !== checkpoint.revision || digest(history) !== checkpoint.historySha256) block("checkpoint-divergent");
  const seen = new Map(); const responses = new Set(); const operations = new Set(); const requests = new Map();
  let clock = -Infinity; let duplicates = 0;
  const claim = ref => { if (responses.has(ref)) block("response-ref-reused"); responses.add(ref); };
  for (const e of events) {
    if (!validTime(e.at)) fail("invalid-event-time");
    const previous = seen.get(e.eventId);
    if (previous) {
      if (!same(previous, e)) block("event-id-conflict");
      duplicates++; continue;
    }
    seen.set(e.eventId, e);
    const at = Date.parse(e.at);
    if (at < clock) block("clock-regression");
    clock = at;
    if (e.type === "request") {
      if (requests.has(e.requestId)) block("request-id-conflict");
      if (![...requests.values()].every(pristine)) block("accounting-context-required");
      requestFacts(e, history); requests.set(e.requestId, newRequest(e));
      continue;
    }
    const r = requests.get(e.requestId);
    if (!r) block("unknown-request");
    switch (e.type) {
      case "decision":
        claim(e.responseRef);
        if (r.status !== "pending") block("decision-conflict");
        if (e.requestSha256 !== r.requestSha256) block("decision-request-mismatch");
        r.status = e.decision === "approve" ? "approved" : "denied";
        break;
      case "revoke":
        claim(e.responseRef);
        if (r.status !== "pending" && r.status !== "approved") block("terminal-conflict");
        r.status = "revoked";
        break;
      case "close":
        if (r.status !== "pending" && r.status !== "approved") block("terminal-conflict");
        r.status = "closed";
        break;
      case "correction":
        if (r.status !== "approved") block("correction-not-allowed");
        if (e.scopeSha256 !== r.scopeSha256) block("scope-change-requires-new-request");
        if (r.corrections >= r.scope.limits.maxCorrections) block("correction-limit");
        if (e.previousRevision !== r.artifact.revision) block("correction-chain-conflict");
        if (r.revisions.has(e.artifact.revision)) block("revision-reused");
        if (r.shas.has(e.artifact.sha256)) block("artifact-reused");
        if (r.ops.some(o => OPEN.includes(o.state))) block("operation-in-progress");
        r.artifact = e.artifact; r.revisions.add(e.artifact.revision); r.shas.add(e.artifact.sha256); r.corrections++;
        break;
      case "reserve": {
        pathFacts(e.items); effectFacts(e.items, e.checks, e.effects);
        if (operations.has(e.operationId)) block("operation-id-conflict");
        const refusal = admission(r, {
          items: e.items, checks: e.checks, effects: e.effects, base: e.expectedBaseSha256,
          revision: e.artifactRevision, sha: null, retryOf: e.retryOf
        }, at);
        if (refusal) block(refusal[1]);
        operations.add(e.operationId);
        if (e.retryOf !== null) r.retries++;
        r.ops.push({
          operationId: e.operationId, state: "reserved", reserveEventId: e.eventId, lastEventId: e.eventId,
          items: e.items, checks: e.checks, effects: e.effects, key: workKey(e.items, e.checks, e.effects, r.artifact.sha256),
          expectedBase: e.expectedBaseSha256, artifactRevision: r.artifact.revision, artifactSha256: r.artifact.sha256,
          retryOf: e.retryOf, sawStart: false
        });
        break;
      }
      default:
        operationEvent(r, e, at, claim);
    }
  }
  return { requests, clock, duplicates };
}

function summarize(reduced, history) {
  const { requests, clock, duplicates } = reduced;
  return {
    revision: history.events.length, historySha256: digest(history), duplicatesIgnored: duplicates,
    lastEventAt: Number.isFinite(clock) ? new Date(clock).toISOString().replace(".000Z", "Z") : null,
    requests: [...requests.values()].map(r => ({
      requestId: r.requestId, status: r.status, scopeSha256: r.scopeSha256, requestSha256: r.requestSha256,
      artifact: { ...r.artifact }, baseSha256: r.base, divergedBaseSha256: r.divergedBase,
      corrections: r.corrections, retries: r.retries, usedOperations: live(r).length, remaining: remaining(r),
      operations: r.ops.map(o => ({ operationId: o.operationId, state: o.state, reserveEventId: o.reserveEventId, retryOf: o.retryOf }))
    }))
  };
}

/** Strict text/bytes entry point: bounded size, valid UTF-8, no duplicate or unsafe keys. */
export function parseApprovalInput(value) {
  return copyInertJson(parseEventJson(decode(copyBytes(value, LIMITS.maxBytes))));
}

/**
 * Pure calculators over explicit inputs. No IO, clock, processes, store or runtime.
 * Every report keeps authorityVerified/executionAuthorized/persisted/nativeExecuted false.
 */
export function createTaskApprovals(schema) {
  const root = copyInertJson(schema);
  if (root.$id !== APPROVALS_ID) throw Error("Unsupported approvals schema");
  const ajv = new Ajv2020({ strict: true, allErrors: false });
  ajv.addSchema(root);
  const check = Object.fromEntries(["replayInput", "proposeInput", "coverInput", "report"]
    .map(name => [name, ajv.compile({ $ref: `${APPROVALS_ID}#/$defs/${name}` })]));

  function run(operation, input, body) {
    const r = {
      schemaVersion: "1.0.0", engineVersion: "1.0.0", operation, state: "invalid", reasons: [],
      authorityVerified: false, executionAuthorized: false, persisted: false, nativeExecuted: false,
      requestId: null, revision: null, historySha256: null, view: null, remaining: null, proposal: null
    };
    try {
      const d = copyInertJson(input);
      if (!check[`${operation}Input`](d)) fail("invalid-approval-input");
      body(d, r);
    } catch (error) {
      if (!(error instanceof Refusal || error instanceof ParseFailure)) throw error;
      r.state = error instanceof Refusal ? error.state : "invalid"; r.reasons = [error.code];
      r.view = null; r.remaining = null; r.proposal = null;
    }
    if (!check.report(r)) throw Error("Approval report invariant failed");
    return freeze(r);
  }

  return {
    replay: input => run("replay", input, (d, r) => {
      const reduced = reduceHistory(d.history, d.checkpoint);
      r.state = "reduced"; r.reasons = ["history-replayed"];
      r.revision = d.history.events.length; r.historySha256 = d.checkpoint.historySha256;
      r.view = summarize(reduced, d.history);
    }),

    propose: input => run("propose", input, (d, r) => {
      reduceHistory(d.history, d.checkpoint);
      r.revision = d.history.events.length; r.historySha256 = d.checkpoint.historySha256; r.requestId = d.event.requestId;
      const known = d.history.events.find(e => e.eventId === d.event.eventId);
      if (known) {
        if (!same(known, d.event)) block("event-id-conflict");
        r.state = "noop"; r.reasons = ["event-already-recorded"];
        return;
      }
      if (d.history.events.length >= LIMITS.maxEvents) block("event-limit");
      const history = { ...d.history, events: [...d.history.events, d.event] };
      const next = { revision: history.events.length, historySha256: digest(history) };
      reduceHistory(history, next); // the reducer is the single source of validity
      r.state = "proposed"; r.reasons = ["event-proposed"];
      r.proposal = { event: d.event, nextRevision: next.revision, nextHistorySha256: next.historySha256 };
    }),

    cover: input => run("cover", input, (d, r) => {
      const reduced = reduceHistory(d.history, d.checkpoint);
      const q = d.query;
      r.revision = d.history.events.length; r.historySha256 = d.checkpoint.historySha256; r.requestId = q.requestId;
      if (!validTime(d.now)) fail("invalid-now");
      const now = Date.parse(d.now);
      if (now < reduced.clock) block("clock-regression");
      pathFacts(q.items); effectFacts(q.items, q.checks, q.effects);
      const request = reduced.requests.get(q.requestId);
      let verdict;
      if (!request) verdict = ["approval-needed", "request-missing"];
      else {
        r.remaining = remaining(request);
        if (!same(q.recipient, request.scope.recipient)) verdict = ["approval-needed", "recipient-not-covered"];
        else if (q.operationId !== null) verdict = inFlight(request, q, now);
        else {
          verdict = admission(request, {
            items: q.items, checks: q.checks, effects: q.effects, base: q.observedBaseSha256,
            revision: q.artifact.revision, sha: q.artifact.sha256, retryOf: q.retryOf
          }, now);
        }
      }
      r.state = verdict ? verdict[0] : "declared-covered";
      r.reasons = [verdict ? verdict[1] : "declared-data-match"];
    })
  };
}
