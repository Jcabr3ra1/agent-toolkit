import { createHash } from "node:crypto";

import Ajv2020 from "ajv/dist/2020.js";

import { copyInertJson, copyBytes, decode, parseEventJson, ParseFailure, fail } from "./client-output-json.js";

const OUTPUT_ID = "https://agent-toolkit.local/schemas/agent-client-output.schema.json";
const FORMAT_ROUTES = {
  "codex-jsonl-text-v1": ["openai", "codex-cli", "codex-native"],
  "claude-jsonl-text-v1": ["anthropic", "claude-code", "claude-native"]
};
const emptyObservation = () => ({ value: null, verification: "unknown", match: "unknown", source: null, scope: null });
const emptyUsage = () => Object.fromEntries(["inputTokens", "outputTokens", "cacheReadTokens", "reasoningTokens", "totalTokens"].map(k => [k, null]));
class BlockedOutput extends ParseFailure {}
const block = (code) => { throw new BlockedOutput(code); };

/** Offline only. All records/capture metadata are caller-supplied declarations. */
export function createClientOutputParser(baseSchema, preferenceSchema, adapterSchema, outputSchema, config) {
  const schemas = [baseSchema, preferenceSchema, adapterSchema, outputSchema].map(copyInertJson);
  if (schemas[3].$id !== OUTPUT_ID) throw new Error("Unsupported output schema");
  const ajv = new Ajv2020({ strict: true, allErrors: true });
  ajv.addFormat("date-time", { type: "string", validate: isTimestamp });
  schemas.forEach(s => ajv.addSchema(s));
  const validateConfig = ajv.compile({ $ref: `${OUTPUT_ID}#/$defs/config` });
  const validateMetadata = ajv.compile({ $ref: `${OUTPUT_ID}#/$defs/metadata` });
  const validateReport = ajv.compile({ $ref: `${OUTPUT_ID}#/$defs/report` });
  const configuration = copyInertJson(config);
  if (!validateConfig(configuration)) throw new Error("Invalid output parser registry");
  const keys = configuration.supportedClients.map(r => descriptorKey(r.descriptor));
  if (new Set(keys).size !== keys.length || configuration.supportedClients.some(r => {
    const [provider, client, variant] = FORMAT_ROUTES[r.formatId];
    return r.descriptor.provider !== provider || r.descriptor.client !== client || r.descriptor.variant !== variant;
  })) throw new Error("Inconsistent output parser registry");

  function finish(report, state, reasons = []) {
    report.state = state;
    report.reasons = [...new Set([...report.reasons, ...reasons])].sort();
    if (state !== "accepted") report.response = null;
    if (!validateReport(report)) throw new Error("Output parser invariant failed");
    return report;
  }

  return function parseClientOutput(metadata, stdout, stderr = "") {
    const report = {
      schemaVersion: "1.0.0", parserVersion: "1.0.0", state: "invalid", nativeState: "unknown",
      executed: false, verifiedExecution: false, reviewRequired: true, client: null,
      captureRef: null, identity: null, requested: null, response: null,
      model: emptyObservation(), configuredModel: emptyObservation(), configuredEffort: emptyObservation(), effort: emptyObservation(),
      usage: emptyUsage(), usageScope: null, durationSeconds: null, processObservation: null,
      eventCount: 0, stderrBytes: 0, reasons: [],
      audit: { planSha256: null, stdoutSha256: null, stderrSha256: null }
    };
    try {
      const data = copyInertJson(metadata);
      if (!validateMetadata(data)) fail("invalid-capture-metadata");
      if (data.plan.state !== "prepared") block("plan-not-prepared");
      const { plan } = data; const { intent } = plan; const { limits } = intent;
      report.client = intent.client; report.identity = plan.identity; report.captureRef = data.captureRef;
      report.requested = { model: intent.requestedModel, effort: intent.requestedEffort };
      report.processObservation = data.processObservation ?? null;
      if (data.processObservation?.exitCode !== null && data.processObservation?.exitCode !== undefined &&
          data.processObservation?.signal !== null && data.processObservation?.signal !== undefined) fail("contradictory-process-observation");
      report.audit.planSha256 = hash(canonicalJson(plan));
      const registration = configuration.supportedClients.find(r => descriptorKey(r.descriptor) === descriptorKey(intent.client));
      if (!registration) block("parser-client-version-not-admitted");
      const bytes = copyBytes(stdout, limits.maxOutputBytes);
      const errorBytes = copyBytes(stderr, limits.maxStderrBytes);
      report.stderrBytes = errorBytes.length;
      report.audit.stdoutSha256 = hash(bytes); report.audit.stderrSha256 = hash(errorBytes);
      const text = decode(bytes); decode(errorBytes);
      const stream = createStream(registration.formatId, report, limits);
      let start = 0;
      while (start < text.length) {
        const newline = text.indexOf("\n", start); const end = newline === -1 ? text.length : newline;
        let line = text.slice(start, end); if (line.endsWith("\r")) line = line.slice(0, -1);
        if (!line.trim()) fail("empty-event-line");
        if (Buffer.byteLength(text.slice(start, end)) > limits.maxLineBytes) fail("event-line-byte-limit");
        if (report.eventCount >= limits.maxEvents) fail("event-count-limit");
        report.eventCount++;
        stream.consume(parseEventJson(line)); start = end + 1;
      }
      if (!stream.terminal) return finish(report, "incomplete", ["missing-terminal"]);
      if (!stream.settled()) return finish(report, "incomplete", ["unfinished-native-step"]);
      if (report.nativeState !== "completed") return finish(report, "blocked", ["native-not-completed"]);
      if (typeof stream.final !== "string" || !stream.final.trim()) block("missing-final-response");
      if (Buffer.byteLength(stream.final) > limits.maxOutputBytes) block("response-byte-limit");
      if (report.durationSeconds !== null && report.durationSeconds > limits.timeoutSeconds) block("native-duration-exceeds-plan");
      const process = report.processObservation;
      if (process?.signal) block("process-signaled");
      if (process?.exitCode !== undefined && process.exitCode !== null && process.exitCode !== 0) block("process-nonzero-exit");
      if (process?.elapsedSeconds !== undefined && process.elapsedSeconds !== null && process.elapsedSeconds > limits.timeoutSeconds) block("process-duration-exceeds-plan");
      if (!process || process.exitCode === null) return finish(report, "incomplete", ["process-exit-unconfirmed"]);
      report.response = stream.final;
      return finish(report, "accepted", ["capture-only-review-required"]);
    } catch (error) {
      if (!(error instanceof ParseFailure)) throw error;
      return finish(report, error instanceof BlockedOutput ? "blocked" : "invalid", [error.code]);
    }
  };
}

function createStream(format, report, limits) {
  let initialized = false; let terminal = false; let session = null; let final = null;
  let turnStarted = false; let assistantId = null; let assistantText = null;
  const items = new Map();

  const bindSession = (id) => {
    if (typeof id !== "string" || !id || id.length > 256) fail("invalid-native-session");
    if (session !== null && session !== id) block("native-session-mismatch"); session = id;
  };
  const init = () => { if (initialized) fail("duplicate-native-init"); initialized = true; };
  const ready = () => { if (!initialized) fail("native-event-before-init"); };
  const ending = (state) => { ready(); terminal = true; report.nativeState = state; };
  const configure = (e) => {
    if (e.model !== undefined) observe(report.configuredModel, e.model, report.requested.model, "client-init", "configuration");
    if (e.effort !== undefined && e.effort !== null) observe(report.configuredEffort, e.effort, report.requested.effort, "client-init", "configuration");
  };
  function consume(e) {
    if (terminal) fail("event-after-terminal");
    if (format === "codex-jsonl-text-v1") codex(e);
    else claude(e);
  }
  function codex(e) {
    if (e.type === "thread.started") { fields(e, ["type", "thread_id"]); init(); bindSession(e.thread_id); return; }
    ready();
    if (e.type === "turn.started") {
      fields(e, ["type"]); if (turnStarted) block("multiple-native-turns"); turnStarted = true; return;
    }
    if (["turn.completed", "turn.failed", "error"].includes(e.type)) {
      fields(e, ["type", "usage", "error", "message"]);
      if (!turnStarted && e.type !== "error") fail("terminal-before-turn");
      if (e.type === "turn.completed" && (e.error !== undefined || e.message !== undefined)) block("contradictory-terminal");
      ending(e.type === "turn.completed" ? "completed" : "failed");
      terminalUsage(report, e.usage, "codex"); return;
    }
    if (!["item.started", "item.updated", "item.completed"].includes(e.type)) block("unknown-native-event");
    if (!turnStarted) fail("item-before-turn"); fields(e, ["type", "item"]);
    const item = object(e.item); fields(item, ["id", "type", "text"]);
    if (!["agent_message", "reasoning"].includes(item.type)) block("forbidden-native-item");
    const id = nativeId(item.id); let prior = items.get(id);
    if (prior?.done || (prior && e.type === "item.started")) fail("duplicate-native-item");
    if (prior && prior.type !== item.type) fail("native-item-type-mismatch");
    if (!prior) { prior = { type: item.type, text: "", done: false }; items.set(id, prior); }
    if (item.text !== undefined && typeof item.text !== "string") fail("invalid-native-text");
    if (item.type === "agent_message") {
      if (item.text !== undefined) {
        if (!item.text.startsWith(prior.text)) block("native-snapshot-conflict"); prior.text = item.text;
      }
      if (e.type === "item.completed") {
        if (final !== null) block("multiple-final-messages");
        if (typeof item.text !== "string") fail("missing-native-text"); final = item.text;
      }
    }
    // Reasoning is validated structurally but never retained in the report.
    prior.done = e.type === "item.completed";
  }
  function claude(e) {
    if (e.parent_tool_use_id !== undefined && e.parent_tool_use_id !== null) block("subagent-output-forbidden");
    if (e.type === "system") {
      if (e.subtype !== "init") block("native-customization-or-retry-forbidden");
      fields(e, ["type", "subtype", "session_id", "uuid", "model", "effort", "tools", "mcp_servers", "plugins", "skills", "agents", "cwd", "claude_code_version", "permissionMode", "apiKeySource", "slash_commands", "terminal_slash_commands", "output_style", "capabilities", "betas", "plugin_errors", "mcp_server_errors"]);
      init(); bindSession(e.session_id); configure(e);
      for (const key of ["tools", "mcp_servers", "plugins", "skills", "agents", "plugin_errors", "mcp_server_errors"]) emptyNativeArray(e, key, ["tools", "mcp_servers", "plugins", "skills"].includes(key));
      if (e.claude_code_version !== undefined && e.claude_code_version !== report.client.clientVersion) block("native-client-version-mismatch");
      if (e.permissionMode === "bypassPermissions") block("native-permission-bypass");
      return;
    }
    ready(); bindSession(e.session_id);
    if (e.type === "assistant") {
      fields(e, ["type", "session_id", "uuid", "parent_tool_use_id", "message", "error", "aborted", "timestamp"]);
      if (e.aborted !== undefined && typeof e.aborted !== "boolean") fail("invalid-native-aborted-status");
      if (e.error !== undefined || e.aborted === true) block("assistant-error-or-aborted");
      const m = object(e.message); fields(m, ["id", "type", "role", "content", "model", "stop_reason", "stop_sequence", "usage"]);
      if ((m.role !== undefined && m.role !== "assistant") || (m.type !== undefined && m.type !== "message")) fail("invalid-assistant-role");
      const id = nativeId(m.id); if (assistantId !== null && assistantId !== id) block("multiple-response-identities"); assistantId = id;
      if (m.model !== undefined) {
        if (report.model.value !== null && report.model.value !== m.model) block("multiple-response-models");
        observe(report.model, m.model, report.requested.model, "claude-assistant-message", "response");
      }
      if (!Array.isArray(m.content)) fail("invalid-assistant-content"); let text = ""; let hasText = false;
      for (const b of m.content) {
        object(b);
        if (b.type === "text") { fields(b, ["type", "text"]); if (typeof b.text !== "string") fail("invalid-native-text"); text += b.text; hasText = true; }
        else if (b.type === "thinking") {
          fields(b, ["type", "thinking", "signature"]);
          if (typeof b.thinking !== "string" || (b.signature !== undefined && typeof b.signature !== "string")) fail("invalid-native-thinking");
        }
        else if (b.type === "redacted_thinking") {
          fields(b, ["type", "data"]); if (typeof b.data !== "string") fail("invalid-native-thinking");
        }
        else block("non-text-assistant-block");
      }
      if (hasText) { if (assistantText !== null) block("duplicate-assistant-text"); assistantText = text; }
      if (m.usage !== undefined) validateUsage(m.usage, "claude");
      if (m.stop_reason !== undefined && m.stop_reason !== null && m.stop_reason !== "end_turn") block("assistant-not-finished");
      return;
    }
    if (e.type !== "result") block("unknown-native-event");
    fields(e, ["type", "subtype", "session_id", "uuid", "is_error", "num_turns", "result", "duration_ms", "duration_api_ms", "total_cost_usd", "usage", "modelUsage", "permission_denials", "errors", "api_error_status", "terminal_reason", "stop_reason"]);
    if (typeof e.is_error !== "boolean") fail("missing-native-error-status");
    turns(e.num_turns, limits); emptyNativeArray(e, "permission_denials", false);
    if (e.modelUsage !== undefined) {
      const names = Object.keys(object(e.modelUsage));
      if (names.length > 1) block("auxiliary-model-usage-forbidden");
      if (names.length && report.model.value !== null && names[0] !== report.model.value) block("model-usage-identity-conflict");
    }
    const known = ["success", "error_during_execution", "error_max_turns", "error_max_budget_usd", "error_max_structured_output_retries"];
    if (!known.includes(e.subtype)) block("unknown-native-terminal");
    const successful = e.subtype === "success" && !e.is_error && (e.api_error_status === undefined || e.api_error_status === null);
    if (e.errors !== undefined && !Array.isArray(e.errors)) fail("invalid-native-error-list");
    if (successful && e.errors?.length) block("contradictory-terminal");
    if (e.terminal_reason !== undefined && e.terminal_reason !== null && e.terminal_reason !== "completed") {
      ending(["aborted_streaming", "aborted_tools"].includes(e.terminal_reason) ? "interrupted" : "failed");
    } else ending(successful ? "completed" : "failed");
    if (e.duration_ms !== undefined) report.durationSeconds = nonnegative(e.duration_ms) / 1000;
    terminalUsage(report, e.usage, "claude");
    if (report.nativeState === "completed") {
      if (typeof e.result !== "string") fail("missing-native-text"); final = e.result;
      if (assistantText !== null && assistantText !== final) block("native-final-text-conflict");
      if (e.stop_reason !== undefined && e.stop_reason !== null && e.stop_reason !== "end_turn") block("result-not-finished");
    }
  }
  return {
    consume, get terminal() { return terminal; }, get final() { return final; },
    settled() { return [...items.values()].every(s => s.done); }
  };
}

function fields(value, allowed) { object(value); if (Object.keys(value).some(k => !allowed.includes(k))) block("unknown-native-field"); }
function object(v) { if (!v || typeof v !== "object" || Array.isArray(v)) fail("invalid-native-object"); return v; }
function nativeId(v) { if (typeof v !== "string" || !v || v.length > 256) fail("invalid-native-identifier"); return v; }
function emptyNativeArray(e, key, required) {
  if (e[key] === undefined && !required) return;
  if (!Array.isArray(e[key])) fail("missing-native-control-list");
  if (e[key].length) block("native-tools-or-customizations-present");
}
function nonnegative(v) { if (typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > 86_400_000) fail("invalid-native-number"); return v; }
function integer(v) { if (!Number.isSafeInteger(v) || v < 0) fail("invalid-native-counter"); return v; }
function turns(v, limits) { integer(v); if (v < 1 || v > limits.maxTurns) block("native-turn-count-exceeded"); }
function observe(target, value, requested, source, scope) {
  if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value)) fail("invalid-native-model-metadata");
  Object.assign(target, { value, verification: "reported", match: value === requested ? "matched" : "mismatched", source, scope });
  if (target.match === "mismatched") block("reported-model-or-effort-mismatch");
}
function validateUsage(usage, client) {
  object(usage);
  const allowed = {
    codex: ["input_tokens", "output_tokens", "cached_input_tokens", "reasoning_output_tokens"],
    claude: ["input_tokens", "output_tokens", "cache_read_input_tokens", "cache_creation_input_tokens", "service_tier", "inference_geo", "server_tool_use", "iterations", "speed"]
  }[client];
  fields(usage, allowed);
  for (const [k, v] of Object.entries(usage)) {
    if (k.endsWith("tokens")) integer(v);
    else if (k === "server_tool_use" && Object.values(object(v)).some(n => integer(n) > 0)) block("native-server-tool-usage-forbidden");
    else if (k === "iterations") block("native-usage-iterations-not-admitted");
  }
  return usage;
}
function terminalUsage(report, value, client) {
  if (value === undefined || value === null) return;
  const usage = validateUsage(value, client);
  const map = { inputTokens: "input_tokens", outputTokens: "output_tokens",
    cacheReadTokens: client === "codex" ? "cached_input_tokens" : "cache_read_input_tokens",
    reasoningTokens: client === "codex" ? "reasoning_output_tokens" : "thinking_tokens", totalTokens: "total_tokens" };
  for (const [out, key] of Object.entries(map)) report.usage[out] = usage[key] ?? null;
  report.usageScope = "terminal-native-report";
}
function descriptorKey(d) { return JSON.stringify([d.provider, d.client, d.variant, d.clientVersion]); }
function hash(value) { return createHash("sha256").update(value).digest("hex"); }
function canonicalJson(v) {
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(",")}]`;
  return `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${canonicalJson(v[k])}`).join(",")}}`;
}
function isTimestamp(v) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(v)) return false;
  const t = Date.parse(v); return Number.isFinite(t) && new Date(t).toISOString() === v.replace(/Z$/, ".000Z");
}
