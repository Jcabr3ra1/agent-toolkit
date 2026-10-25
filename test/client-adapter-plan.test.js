import assert from "node:assert/strict";
import childProcess from "node:child_process";
import fs from "node:fs";
import fsPromises from "node:fs/promises";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import test from "node:test";

import Ajv2020 from "ajv/dist/2020.js";

import { createClientAdapterPlanner } from "../src/client-adapter-plan.js";
import { createModelSelector } from "../src/model-selection.js";

const read = (p) => JSON.parse(fs.readFileSync(new URL(p, import.meta.url), "utf8"));
const schemas = ["agent-model-selection", "agent-model-preference", "agent-client-adapter"]
  .map((name) => read(`../schemas/${name}.schema.json`));
const select = createModelSelector(schemas[0], schemas[1]);
const plan = createClientAdapterPlanner(...schemas);
const BASE = Object.fromEntries(["request", "catalog", "policy"].map((name) =>
  [name, read(`../examples/model-selection/${name}.preference.example.json`)]));
const CONTROLS = ["no-tools", "no-subagents", "no-mcp", "no-hooks", "no-personalizations", "no-updates", "stdin-text"];
const NOW = "2026-10-02T14:00:00Z";
const ROUTES = [
  ["openai", "codex-cli", "codex-native"],
  ["anthropic", "claude-code", "claude-native"]
];
const renew = (d) => { d.decision = select(d.selection); return d; };
const get = (d, field) => field.split(".").reduce((v, key) => v[key], d);
const remove = (d, field) => {
  const keys = field.split("."); const last = keys.pop(); delete get(d, keys.join("."))[last];
};

// Routes name native clients, but models, versions and all evidence are fiction.
// No registry for any real installation is shipped or certified by these tests.
function fixture(route = ROUTES[0], role = "tutor", mode = "tutor") {
  const [provider, client, variant] = route;
  const selection = structuredClone(BASE);
  const category = { tutor: "documentation", reviewer: "review", proposer: "proposal", executor: "application" }[role];
  Object.assign(selection.request, { provider, client, role, mode, category });
  selection.request.requirements.tools = [];
  selection.request.authorizationContext.allowedActions = role === "executor"
    ? ["read", "apply", "verify"] : ["read", "explain", "propose", "verify"];
  if (role === "executor") selection.request.authorizationContext.activeWriter = "authorized-executor";
  selection.catalog.profiles.forEach((p, i) => {
    Object.assign(p, { provider, client, requestedModel: `demo-model-${i}` });
    p.declaredCapabilities.tools = []; p.verifiedCapabilities.tools = [];
    p.evaluations.forEach((e) => Object.assign(e, { role, category }));
  });
  selection.policy.routes.forEach((r) => {
    Object.assign(r, { provider, client, role, modes: [mode], categories: [category] });
    r.families.forEach((f) => f.effortRules.forEach((rule) => { rule.category = category; }));
  });
  const adapter = { provider, client, variant, clientVersion: "0.0.0-demo" };
  return renew({
    schemaVersion: "1.0.0", selection, decision: {}, adapter,
    registry: {
      schemaVersion: "1.0.0", registryId: "demo-registry", revision: "r01",
      records: [{
        recordId: "demo-client-evaluation", ...adapter, status: "evaluated",
        supportedModels: selection.catalog.profiles.map((p) => p.requestedModel),
        efforts: ["brief", "standard", "deep"], roles: ["tutor", "proposer", "reviewer"],
        controls: [...CONTROLS], evaluatedAt: NOW, evidenceRefs: ["demo-controls-evidence"]
      }]
    },
    context: {
      scope: "text-only", promptRef: "demo-prompt",
      provenance: { checkedAt: NOW, evidenceRef: "demo-context" },
      authorization: { status: "approved", referenceId: selection.request.authorizationContext.referenceId,
        checkedAt: NOW, evidenceRef: "demo-approval" }
    },
    environment: { access: "subscription-session", externalBilling: "disabled", controls: [...CONTROLS],
      checkedAt: NOW, evidenceRef: "demo-local-admission" },
    historyEvidence: { status: "reconciled", history: structuredClone(selection.request.history),
      checkedAt: NOW, evidenceRef: "demo-task-ledger" },
    limits: { maxTurns: 1, timeoutSeconds: 60, maxOutputBytes: 8192, maxLineBytes: 1024,
      maxEvents: 100, maxStderrBytes: 1024 }
  });
}

for (const route of ROUTES) for (const role of ["tutor", "proposer", "reviewer"]) {
  test(`CA-A01/03/06: ${route[1]} ${role} prepara solo texto con metadata desconocida`, () => {
    const d = fixture(route, role, role === "proposer" ? "autonomous" : "tutor");
    const r = plan(d);
    assert.equal(r.state, "prepared", JSON.stringify(r));
    assert.equal(r.executed, false); assert.equal(r.runtimeReady, false);
    assert.equal(r.modelVerification, "unknown"); assert.equal(r.effortVerification, "unknown");
    assert.deepEqual(r.observedModels, []); assert.equal(r.observedEffort, null);
    assert.ok(r.externalGates.includes("human-authorization"));
    assert.ok(r.externalGates.includes("atomic-history-and-reservation"));
    assert.equal(r.intent.requestedModel, d.decision.recommendation.requestedModel);
    assert.equal(r.intent.requestedEffort, "brief");
    assert.deepEqual(r.intent.arguments, [{ name: "model", value: r.intent.requestedModel }, { name: "effort", value: "brief" }]);
    assert.equal(r.intent.input.transport, "stdin-text"); assert.equal(r.intent.scope, "text-only");
    assert.equal(r.intent.automaticRetry, false); assert.equal(r.intent.allowProviderSwitch, false);
    assert.equal(r.intent.allowImplicitFallback, false);
    assert.deepEqual(r.intent.budget.history, d.selection.request.history);
  });
}

test("CA-A01: determinismo, JSON canónico y ninguna mutación de entrada o schemas", () => {
  const d = fixture(); const original = structuredClone(d); const schemaCopies = structuredClone(schemas);
  function freeze(v) { if (v && typeof v === "object") { Object.values(v).forEach(freeze); Object.freeze(v); } return v; }
  const r = plan(freeze(d)); assert.deepEqual(r, plan(d)); assert.deepEqual(d, original);
  const shuffled = Object.fromEntries(Object.entries(original).reverse());
  shuffled.decision = Object.fromEntries(Object.entries(shuffled.decision).reverse());
  assert.deepEqual(plan(shuffled), r);
  createClientAdapterPlanner(...freeze(schemas)); assert.deepEqual(schemas, schemaCopies);
  r.intent.client.clientVersion = "9.9.9";
  assert.equal(plan(d).intent.client.clientVersion, "0.0.0-demo");
});

for (const key of ["recommendation", "audit", "constraints", "reasons", "executed", "extra"]) {
  test(`CA-A02: rechaza decisión alterada en ${key}`, () => {
    const d = fixture(); d.decision[key] = key === "executed" ? true : { secret: "never-echo-this" };
    const r = plan(d); assert.equal(r.state, "invalid"); assert.ok(r.reasons.includes("decision-mismatch"));
    assert.equal(JSON.stringify(r).includes("never-echo-this"), false); assert.equal(r.intent, null);
  });
}
test("CA-A02: identidad ajena bloqueada sin reproducirla", () => {
  const d = fixture(); d.decision.identity.taskId = "another-task";
  const r = plan(d); assert.equal(r.state, "blocked"); assert.ok(r.reasons.includes("decision-identity-mismatch"));
  assert.equal(r.identity.taskId, d.selection.request.taskId);
});
test("CA-A02: candidatos no se activan por un registro de cliente evaluado", () => {
  const d = fixture(); d.selection.catalog.profiles.forEach((p) => { p.status = "candidate"; }); renew(d);
  assert.equal(d.decision.state, "blocked");
  const r = plan(d); assert.equal(r.state, "blocked"); assert.equal(r.intent, null);
});
test("CA-A02/05: información faltante y errores del selector se conservan", () => {
  const d = fixture(); delete d.selection.request.history; renew(d);
  assert.equal(plan(d).state, "needs-info"); assert.ok(plan(d).missing.includes("selection.history"));
  const invalid = fixture(); invalid.selection.policy.catalogRevision = "r99"; renew(invalid);
  assert.equal(plan(invalid).state, "invalid"); assert.equal(plan(invalid).selectorState, "invalid");
});
for (const key of ["request", "catalog", "policy"]) {
  test(`CA-A02: no migra ${key} v1`, () => {
    const d = fixture(); d.selection[key].schemaVersion = "1.0.0";
    assert.equal(plan(d).state, "invalid"); assert.ok(plan(d).reasons.includes("unsupported-selection-version"));
  });
}

for (const [label, change, code] of [
  ["ruta", (d) => { d.adapter.provider = "anthropic"; }, "adapter-route-mismatch"],
  ["variante", (d) => { d.adapter.variant = "claude-native"; }, "adapter-route-mismatch"],
  ["versión", (d) => { d.adapter.clientVersion = "0.0.1-demo"; }, "client-version-not-admitted"],
  ["pendiente", (d) => { d.registry.records[0].status = "pending"; }, "client-controls-not-evaluated"],
  ["retirado", (d) => { d.registry.records[0].status = "disabled"; }, "client-controls-not-evaluated"],
  ["modelo", (d) => { d.registry.records[0].supportedModels = ["other-model"]; }, "client-model-not-admitted"],
  ["esfuerzo", (d) => { d.registry.records[0].efforts = ["deep"]; }, "client-effort-not-admitted"],
  ["rol", (d) => { d.registry.records[0].roles = ["reviewer"]; }, "client-role-not-admitted"]
]) {
  test(`CA-A03: bloquea ${label} sin cambiar de cliente ni esfuerzo`, () => {
    const d = fixture(ROUTES[0]); change(d);
    const r = plan(d); assert.equal(r.state, "blocked"); assert.ok(r.reasons.includes(code)); assert.equal(r.intent, null);
  });
}
for (const control of CONTROLS) for (const location of ["environment", "registry"]) {
  test(`CA-A03/05: control ${control} ausente en ${location} bloquea`, () => {
    const d = fixture(); const target = location === "registry" ? d.registry.records[0] : d.environment;
    target.controls = target.controls.filter((c) => c !== control);
    assert.equal(plan(d).state, "blocked");
  });
}
test("CA-A03: registro contradictorio o futuro es inválido", () => {
  for (const change of [
    (d) => d.registry.records.push({ ...structuredClone(d.registry.records[0]), recordId: "duplicate-route" }),
    (d) => { d.registry.records[0].provider = "anthropic"; },
    (d) => { d.registry.records[0].evaluatedAt = "2026-10-02T14:00:01Z"; }
  ]) { const d = fixture(); change(d); assert.equal(plan(d).state, "invalid"); }
});
test("CA-A03: aliases aprobados por selector no sustituyen modelo fijado del adaptador", () => {
  const d = fixture(); d.selection.catalog.profiles.forEach((p) => { p.versionPolicy = "approved-alias"; }); renew(d);
  assert.equal(plan(d).state, "blocked"); assert.ok(plan(d).reasons.includes("model-not-pinned"));
});
test("CA-A04: ningún ejecutor autónomo ni scope de aplicación prepara escritura", () => {
  const d = fixture(ROUTES[0], "executor", "autonomous"); assert.equal(d.decision.state, "recommended");
  assert.equal(plan(d).state, "blocked");
  const scope = fixture(); scope.context.scope = "application"; assert.equal(plan(scope).state, "blocked");
});
test("CA-A04: modo tutor conserva autoría y no admite herramientas de lectura", () => {
  const d = fixture(); d.selection.request.authorizationContext.activeWriter = "authorized-executor"; renew(d);
  assert.equal(plan(d).state, "invalid"); // Existing v2 contract rejects this tutor author.
  const tools = fixture(); tools.selection.request.requirements.tools = ["read-files"];
  tools.selection.catalog.profiles.forEach((p) => { p.verifiedCapabilities.tools = ["read-files"]; p.declaredCapabilities.tools = ["read-files"]; });
  renew(tools); assert.equal(tools.decision.state, "recommended");
  assert.ok(plan(tools).reasons.includes("unsupported-textual-requirements"));
});

for (const field of ["adapter", "context", "context.scope", "context.promptRef", "context.provenance", "context.authorization",
  "environment", "environment.access", "environment.externalBilling", "environment.controls", "environment.checkedAt", "environment.evidenceRef", "limits", "historyEvidence"]) {
  test(`CA-A05: pide ${field} sin completar defaults`, () => {
    const d = fixture(); if (!field.includes(".")) delete d[field]; else remove(d, field);
    const r = plan(d); assert.equal(r.state, "needs-info"); assert.equal(r.intent, null);
    assert.ok(r.missing.some((key) => key === field || key.startsWith(`${field}.`)));
  });
}
for (const [field, value, code] of [
  ["environment.access", "unknown", "subscription-access-not-declared"],
  ["environment.externalBilling", "enabled", "external-billing-not-declared-disabled"],
  ["environment.externalBilling", "unknown", "external-billing-not-declared-disabled"],
  ["context.authorization.status", "pending", "authorization-not-declared-approved"],
  ["context.authorization.referenceId", "other-approval", "authorization-reference-mismatch"],
  ["historyEvidence.status", "pending", "history-not-declared-reconciled"],
  ["historyEvidence.status", "unknown", "history-not-declared-reconciled"],
  ["limits.timeoutSeconds", 901, "timeout-exceeds-remaining-budget"],
  ["limits.maxLineBytes", 8193, "line-limit-exceeds-output-limit"]
]) {
  test(`CA-A05: declaración ${field} incompatible bloquea`, () => {
    const d = fixture(); const keys = field.split("."); const last = keys.pop(); get(d, keys.join("."))[last] = value;
    const r = plan(d); assert.equal(r.state, "blocked"); assert.ok(r.reasons.includes(code));
  });
}
for (const field of ["environment.checkedAt", "context.authorization.checkedAt", "context.provenance.checkedAt", "historyEvidence.checkedAt"]) {
  test(`CA-A05: ${field} vencida/futura no se renueva`, () => {
    for (const time of ["2026-10-02T12:59:59Z", "2026-10-02T14:00:01Z"]) {
      const d = fixture(); const keys = field.split("."); const last = keys.pop(); get(d, keys.join("."))[last] = time;
      assert.equal(plan(d).state, "blocked");
    }
    const boundary = fixture(); const keys = field.split("."); const last = keys.pop();
    get(boundary, keys.join("."))[last] = "2026-10-02T13:00:00Z";
    assert.equal(plan(boundary).state, "prepared");
  });
}
test("CA-A05: límites agotados bloquean y el historial completo no se reinicia", () => {
  for (const change of [
    (d) => { d.selection.request.history.executionsUsed = 3; },
    (d) => { d.selection.request.history.durationUsedSeconds = 900; }
  ]) { const d = fixture(); change(d); renew(d); assert.equal(plan(d).state, "blocked"); }
  const d = fixture(); Object.assign(d.selection.request.history, { executionsUsed: 1, durationUsedSeconds: 840,
    previousProfileId: "demo-light-new", previousEffort: "brief" }); renew(d);
  d.historyEvidence.history = structuredClone(d.selection.request.history);
  const r = plan(d); assert.equal(r.state, "prepared", JSON.stringify(r));
  assert.equal(r.intent.budget.executionsRemaining, 2); assert.equal(r.intent.budget.durationRemainingSeconds, 60);
  assert.equal(r.intent.budget.history.previousEffort, "brief");
  d.limits.timeoutSeconds = 61; assert.equal(plan(d).state, "blocked");
});
test("CA-A05: no acepta una referencia de historial con contadores diferentes", () => {
  const d = fixture(); d.historyEvidence.history.executionsUsed = 1;
  const r = plan(d); assert.equal(r.state, "invalid"); assert.ok(r.reasons.includes("history-evidence-mismatch"));
});

for (const field of ["token", "command", "argv", "env", "cwd", "prompt", "apiKey"]) {
  test(`CA-A07: campos arbitrarios ${field} no ejecutan ni filtran valores`, () => {
    const d = fixture(); d[field] = "private-secret-value";
    const r = plan(d); assert.equal(r.state, "invalid"); assert.equal(JSON.stringify(r).includes("private-secret-value"), false);
  });
}
for (const [name, change] of [
  ["limite string", (d) => { d.limits.timeoutSeconds = "60"; }],
  ["limite negativo", (d) => { d.limits.timeoutSeconds = -1; }],
  ["sin limite", (d) => { delete d.limits.maxOutputBytes; }],
  ["turnos extra", (d) => { d.limits.maxTurns = 2; }],
  ["stdout enorme", (d) => { d.limits.maxOutputBytes = 1048577; }],
  ["eventos enormes", (d) => { d.limits.maxEvents = 10001; }],
  ["fecha imposible", (d) => { d.environment.checkedAt = "2026-02-30T14:00:00Z"; }],
  ["version vaga", (d) => { d.adapter.clientVersion = "latest"; }],
  ["prompt ruta", (d) => { d.context.promptRef = "/private/demo-prompt"; }],
  ["registro remoto", (d) => { d.registry.url = "https://example.invalid/registry"; }],
  ["array largo", (d) => { d.registry.records = Array(257).fill(d.registry.records[0]); }],
  ["texto gigante", (d) => { d.secret = "s".repeat(2_000_001); }],
  ["ciclo", (d) => { d.circular = d; }],
  ["objeto especial", (d) => { d.extra = new Date(); }],
  ["toJSON", (d) => { d.extra = { toJSON() { throw new Error("must not call"); } }; }],
  ["NaN", (d) => { d.limits.timeoutSeconds = NaN; }]
]) {
  test(`CA-A07: rechaza ${name} sin coerción`, () => {
    const d = fixture(); change(d); const r = plan(d); assert.equal(r.state, "invalid"); assert.equal(r.intent, null);
  });
}
test("CA-A07: no invoca getters, proxies ni claves peligrosas", () => {
  const d = fixture(); let called = 0;
  Object.defineProperty(d, "token", { enumerable: true, get() { called++; return "secret"; } });
  assert.equal(plan(d).state, "invalid"); assert.equal(called, 0);
  assert.equal(plan(new Proxy({}, { ownKeys() { called++; return []; } })).state, "invalid"); assert.equal(called, 0);
  const pollution = fixture(); pollution.extra = JSON.parse('{"__proto__":{"polluted":true}}');
  assert.equal(plan(pollution).state, "invalid"); assert.equal({}.polluted, undefined);
  const tooDeep = fixture(); let cursor = tooDeep; for(let i=0;i<66;i++) cursor = cursor.extra = {};
  assert.equal(plan(tooDeep).state, "invalid");
});
test("CA-A07: esquemas equivocados fallan al inicializar sin fallback remoto", () => {
  assert.throws(() => createClientAdapterPlanner(schemas[0], schemas[1], { ...schemas[2], $id: "https://example.invalid/other" }), /Unsupported adapter schema/);
  assert.throws(() => createClientAdapterPlanner({ ...schemas[0], $id: "https://example.invalid/other" }, schemas[1], schemas[2]), /Unsupported selector schema/);
});
test("CA-A06/07: todos los estados cumplen el esquema de salida y no ejecutan", () => {
  const ajv = new Ajv2020({ strict: true }); ajv.addFormat("date-time", { type: "string", validate: () => true });
  schemas.forEach((s) => ajv.addSchema(s));
  const validate = ajv.compile({ $ref: `${schemas[2].$id}#/$defs/report` });
  const missing = fixture(); delete missing.adapter;
  const blocked = fixture(); blocked.environment.externalBilling = "enabled";
  const reports = [fixture(), missing, blocked, {}].map(plan);
  assert.deepEqual(reports.map((r) => r.state), ["prepared", "needs-info", "blocked", "invalid"]);
  for (const r of reports) { assert.equal(validate(r), true, JSON.stringify(validate.errors)); assert.equal(r.executed, false); }
});
test("CA-A08: inicializar y planificar no usa archivos, red, procesos, reloj o azar", () => {
  const d = fixture(); const originals = []; let attempts = 0;
  function block(object, keys) {
    for(const key of keys) {
      originals.push([object, key, object[key]]);
      object[key] = () => { attempts++; throw new Error("Forbidden side effect"); };
    }
  }
  try {
    block(fs, ["readFileSync", "readFile", "writeFileSync", "writeFile", "openSync", "open", "mkdirSync", "readdirSync", "statSync"]);
    block(fsPromises, ["readFile", "writeFile", "open", "mkdir", "readdir", "stat"]);
    block(childProcess, ["exec", "execSync", "execFile", "execFileSync", "spawn", "spawnSync", "fork"]);
    block(http, ["request", "get"]); block(https, ["request", "get"]); block(net, ["connect", "createConnection"]);
    block(globalThis, ["fetch"]); block(Date, ["now"]); block(Math, ["random"]);
    const guarded = createClientAdapterPlanner(...schemas);
    assert.equal(guarded(d).state, "prepared"); assert.equal(guarded({}).state, "invalid");
    const missing = structuredClone(d); delete missing.context;
    assert.equal(guarded(missing).state, "needs-info");
    const blocked = structuredClone(d); blocked.environment.externalBilling = "enabled";
    assert.equal(guarded(blocked).state, "blocked"); assert.equal(attempts, 0);
  } finally { for(const [object, key, original] of originals) object[key] = original; }
});
