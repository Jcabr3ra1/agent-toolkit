import { createHash } from "node:crypto";
import { types } from "node:util";

import Ajv2020 from "ajv/dist/2020.js";

import { createModelSelector } from "./model-selection.js";

const SCHEMA_ID = "https://agent-toolkit.local/schemas/agent-client-adapter.schema.json";
const ROUTES = {
  "codex-cli": ["openai", "codex-native"],
  "claude-code": ["anthropic", "claude-native"],
  "antigravity-cli": ["google", "antigravity-native"]
};
const CONTROLS = [
  "no-tools", "no-subagents", "no-mcp", "no-hooks",
  "no-personalizations", "no-updates", "stdin-text"
];
const GATES = [
  "human-authorization", "client-preflight", "billing-policy",
  "preventive-controls", "atomic-history-and-reservation",
  "private-context-resolution", "process-cancellation"
];

/**
 * Supply trusted packaged schemas as JSON. Registry/context/access claims are
 * declarations only: this factory and its planner do no IO or authentication.
 * A prepared intent is NOT a runnable command or permission to launch a client.
 */
export function createClientAdapterPlanner(baseSchema, preferenceSchema, adapterSchema) {
  const schemas = [baseSchema, preferenceSchema, adapterSchema].map(copyJson);
  if (schemas[2].$id !== SCHEMA_ID) throw new Error("Unsupported adapter schema");
  const select = createModelSelector(schemas[0], schemas[1]);
  const ajv = new Ajv2020({ strict: true, allErrors: true });
  ajv.addFormat("date-time", { type: "string", validate: isUtcTimestamp });
  schemas.forEach((schema) => ajv.addSchema(schema));
  const validateInput = ajv.compile({ $ref: `${SCHEMA_ID}#/$defs/input` });
  const validateReport = ajv.compile({ $ref: `${SCHEMA_ID}#/$defs/report` });
  const adapterSchemaSha256 = hashJson(schemas[2]);

  function finish(report, state, reasons = []) {
    report.state = state;
    report.reasons = [...new Set([...report.reasons, ...reasons])].sort();
    report.missing = [...new Set(report.missing)].sort();
    if (!validateReport(report)) throw new Error("Adapter planner invariant failed");
    return report;
  }

  return function planClientAdapter(input) {
    const report = {
      schemaVersion: "1.0.0", plannerVersion: "1.0.0", state: "invalid",
      executed: false, runtimeReady: false, identity: null, intent: null,
      observedModels: [], modelVerification: "unknown", observedEffort: null,
      effortVerification: "unknown", reasons: [], missing: [], selectorState: null,
      externalGates: [...GATES],
      audit: { adapterSchemaSha256, inputSha256: null, registrySha256: null, decisionSha256: null }
    };
    let data;
    try { data = copyJson(input); }
    catch { return finish(report, "invalid", ["non-json-or-input-limit"]); }
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      return finish(report, "invalid", ["invalid-envelope"]);
    }
    if (data.selection && ["request", "catalog", "policy"].some((name) =>
      data.selection[name]?.schemaVersion !== "2.0.0")) {
      return finish(report, "invalid", ["unsupported-selection-version"]);
    }
    if (!validateInput(data)) return finish(report, "invalid", ["invalid-structure"]);
    report.audit.inputSha256 = hashJson(data);
    report.audit.registrySha256 = hashJson(data.registry);
    report.audit.decisionSha256 = hashJson(data.decision);

    const selected = select(data.selection);
    report.selectorState = selected.state;
    report.identity = selected.identity;
    // Compare the WHOLE recomputed report, including constraints and audit.
    if (canonicalJson(selected.identity) !== canonicalJson(data.decision.identity ?? null)) {
      return finish(report, "blocked", ["decision-identity-mismatch"]);
    }
    if (canonicalJson(selected) !== canonicalJson(data.decision)) {
      return finish(report, "invalid", ["decision-mismatch"]);
    }
    if (selected.state !== "recommended") {
      report.missing = selected.missing.map((key) => `selection.${key}`);
      return finish(report, selected.state, ["selection-not-recommended", ...selected.reasons]);
    }

    const { request, catalog, policy } = data.selection;
    const { recommendation } = selected;
    const blocks = [];
    const block = (code) => blocks.push(code);
    const profile = catalog.profiles.find((p) => p.profileId === recommendation.profileId);
    if (!["tutor", "proposer", "reviewer"].includes(request.role) ||
        request.category === "application" || data.context?.scope === "application") {
      block("textual-scope-only");
    }
    if (request.mode === "tutor" && (request.authorizationContext.activeWriter !== "user" ||
        request.authorizationContext.allowedActions.includes("apply"))) {
      block("tutor-authorship-conflict");
    }
    if (profile.versionPolicy !== "pinned" ||
        /(?:^|[-.:])(?:latest|default|auto)(?:$|[-.:])/i.test(recommendation.requestedModel)) {
      block("model-not-pinned");
    }
    if (recommendation.effort === null) block("explicit-effort-required");
    if (request.requirements.tools.length ||
        request.requirements.inputModalities.some((value) => value !== "text") ||
        request.requirements.outputFormats.some((value) => !["text", "markdown"].includes(value))) {
      block("unsupported-textual-requirements");
    }

    const required = [
      "adapter", "context.scope", "context.promptRef", "context.provenance",
      "context.authorization", "environment.access", "environment.externalBilling",
      "environment.controls", "environment.checkedAt", "environment.evidenceRef", "limits", "historyEvidence"
    ];
    report.missing = required.filter((field) => getField(data, field) === undefined);
    if (data.adapter && !sameRoute(data.adapter, recommendation)) block("adapter-route-mismatch");

    // Duplicates are contradictory even if they belong to another route.
    const records = data.registry.records;
    if (hasDuplicates(records.map((r) => r.recordId)) ||
        hasDuplicates(records.map((r) => JSON.stringify([
          r.provider, r.client, r.variant, r.clientVersion
        ])))) {
      return finish(report, "invalid", ["ambiguous-compatibility-registry"]);
    }
    if (records.some((r) => !sameRoute(r, r))) {
      return finish(report, "invalid", ["invalid-registry-route"]);
    }
    const now = Date.parse(request.evaluationTime);
    if (records.some((r) => Date.parse(r.evaluatedAt) > now)) {
      return finish(report, "invalid", ["registry-evaluated-in-future"]);
    }
    let record;
    if (data.adapter) {
      record = records.find((r) => ["provider", "client", "variant", "clientVersion"]
        .every((key) => r[key] === data.adapter[key]));
      if (!record) block("client-version-not-admitted");
      else {
        if (record.status !== "evaluated") block("client-controls-not-evaluated");
        if (!record.supportedModels.includes(recommendation.requestedModel)) block("client-model-not-admitted");
        if (!record.efforts.includes(recommendation.effort)) block("client-effort-not-admitted");
        if (!record.roles.includes(request.role)) block("client-role-not-admitted");
        if (CONTROLS.some((control) => !record.controls.includes(control))) block("client-controls-incomplete");
      }
    }
    if (recommendation.provider === "google" &&
        !recommendation.requestedModel.startsWith("gemini-")) block("non-google-model-route");

    const context = data.context;
    if (context?.authorization) {
      if (context.authorization.status !== "approved") block("authorization-not-declared-approved");
      if (context.authorization.referenceId !== request.authorizationContext.referenceId) {
        block("authorization-reference-mismatch");
      }
      if (!fresh(context.authorization.checkedAt, now, policy.availabilityMaxAgeSeconds)) {
        block("authorization-evidence-not-current");
      }
    }
    if (context?.provenance && !fresh(context.provenance.checkedAt, now, policy.availabilityMaxAgeSeconds)) {
      block("context-evidence-not-current");
    }
    const environment = data.environment;
    if (environment?.access !== undefined && environment.access !== "subscription-session") {
      block("subscription-access-not-declared");
    }
    if (environment?.externalBilling !== undefined && environment.externalBilling !== "disabled") {
      block("external-billing-not-declared-disabled");
    }
    if (environment?.controls && CONTROLS.some((c) => !environment.controls.includes(c))) {
      block("preventive-controls-not-declared");
    }
    if (environment?.checkedAt && !fresh(environment.checkedAt, now, policy.availabilityMaxAgeSeconds)) {
      block("environment-evidence-not-current");
    }
    const remainingTime = policy.maxFutureDurationSeconds - request.history.durationUsedSeconds;
    const remainingExecutions = policy.maxFutureExecutions - request.history.executionsUsed;
    if (data.historyEvidence) {
      if (canonicalJson(data.historyEvidence.history) !== canonicalJson(request.history)) {
        return finish(report, "invalid", ["history-evidence-mismatch"]);
      }
      if (data.historyEvidence.status !== "reconciled") block("history-not-declared-reconciled");
      if (!fresh(data.historyEvidence.checkedAt, now, policy.availabilityMaxAgeSeconds)) {
        block("history-evidence-not-current");
      }
    }
    if (data.limits) {
      if (data.limits.timeoutSeconds > remainingTime) block("timeout-exceeds-remaining-budget");
      if (data.limits.maxLineBytes > data.limits.maxOutputBytes) block("line-limit-exceeds-output-limit");
    }
    if (blocks.length) return finish(report, "blocked", blocks);
    if (report.missing.length) return finish(report, "needs-info", ["missing-adapter-information"]);

    report.intent = {
      operation: "text-response", client: data.adapter,
      profileId: recommendation.profileId, requestedModel: recommendation.requestedModel,
      requestedEffort: recommendation.effort,
      arguments: [
        { name: "model", value: recommendation.requestedModel },
        { name: "effort", value: recommendation.effort }
      ],
      input: { transport: "stdin-text", promptRef: context.promptRef, provenance: context.provenance },
      authorizationRef: context.authorization.referenceId, compatibilityRecordId: record.recordId,
      scope: "text-only", requiredControls: [...CONTROLS], limits: data.limits,
      budget: {
        executionsRemaining: remainingExecutions, durationRemainingSeconds: remainingTime,
        history: request.history
      },
      automaticRetry: false, allowProviderSwitch: false, allowImplicitFallback: false
    };
    return finish(report, "prepared", ["declared-plan-only"]);
  };
}

function sameRoute(adapter, recommendation) {
  const expected = ROUTES[adapter.client];
  return !!expected && expected[0] === adapter.provider && expected[1] === adapter.variant &&
    adapter.provider === recommendation.provider && adapter.client === recommendation.client;
}
function getField(data, field) { return field.split(".").reduce((v, key) => v?.[key], data); }
function hasDuplicates(values) { return new Set(values).size !== values.length; }
function fresh(timestamp, now, maxAge) {
  const age = (now - Date.parse(timestamp)) / 1000;
  return age >= 0 && age <= maxAge;
}
function isUtcTimestamp(value) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(value)) return false;
  const time = Date.parse(value);
  return Number.isFinite(time) && new Date(time).toISOString() === value.replace(/Z$/, ".000Z");
}
function hashJson(value) { return createHash("sha256").update(canonicalJson(value)).digest("hex"); }
function canonicalJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
}

// This boundary accepts inert, bounded JSON, without invoking accessors/toJSON.
// JavaScript proxies are not JSON and are rejected before inspecting properties.
function copyJson(value) {
  const ancestors = new Set();
  let nodes = 0;
  let bytes = 0;
  function text(value) {
    bytes += Buffer.byteLength(value, "utf8");
    if (bytes > 2_000_000) throw new Error("JSON limit");
  }
  function visit(item, depth) {
    if (++nodes > 30_000 || depth > 64) throw new Error("JSON limit");
    if (typeof item === "string") { text(item); return item; }
    if (item === null || typeof item === "boolean") return item;
    if (typeof item === "number" && Number.isFinite(item)) return item;
    if (typeof item !== "object" || types.isProxy(item) || ancestors.has(item)) throw new Error("Non-JSON data");
    const array = Array.isArray(item);
    if (array && item.length > 256) throw new Error("JSON limit");
    if (!array && ![Object.prototype, null].includes(Object.getPrototypeOf(item))) throw new Error("Non-JSON object");
    if (Object.getOwnPropertySymbols(item).length) throw new Error("Non-JSON keys");
    const keys = Object.getOwnPropertyNames(item).filter((key) => !array || key !== "length");
    if (array && (keys.length !== item.length || keys.some((key, i) => key !== String(i)))) throw new Error("Non-JSON array");
    if (keys.length > 30_000) throw new Error("JSON limit");
    ancestors.add(item);
    const result = array ? [] : {};
    for (const key of keys) {
      if (["__proto__", "prototype", "constructor"].includes(key)) throw new Error("Unsafe JSON key");
      const descriptor = Object.getOwnPropertyDescriptor(item, key);
      if (!descriptor.enumerable || !("value" in descriptor)) throw new Error("Non-JSON property");
      text(key);
      result[key] = visit(descriptor.value, depth + 1);
    }
    ancestors.delete(item);
    return result;
  }
  return visit(value, 0);
}
