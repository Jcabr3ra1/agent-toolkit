import assert from "node:assert/strict";
import childProcess from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import test from "node:test";

import { createModelSelector } from "../src/model-selection.js";

const read = (path) => JSON.parse(fs.readFileSync(new URL(path, import.meta.url), "utf8"));
const schema = read("../schemas/agent-model-selection.schema.json");
const preferenceSchema = read("../schemas/agent-model-preference.schema.json");
const select = createModelSelector(schema, preferenceSchema);
const BASE = Object.fromEntries(["catalog", "policy", "request"].map((name) =>
  [name, read(`../examples/model-selection/${name}.preference.example.json`)]));
const fixture = () => structuredClone(BASE);
const profile = (d, id = "demo-light-new") => d.catalog.profiles.find((p) => p.profileId === id);
const family = (d) => d.policy.routes[0].families[0];
const rule = (d) => family(d).effortRules[0];
const options = (d) => family(d).effortRules.flatMap((r) => r.options);
const issue = (r, code) => r.issues.some((i) => i.code === code);
const excluded = (r, id = "demo-light-new") => r.excluded.find((p) => p.profileId === id)?.reasons ?? [];

test("CA-P15: v2 requiere cargar su esquema de confianza explícitamente", () => {
  const legacy = createModelSelector(schema);
  const result = legacy(fixture());
  assert.equal(result.state, "invalid");
  assert.ok(result.reasons.includes("preference-schema-not-loaded"));
  assert.throws(() => createModelSelector(schema, { ...preferenceSchema, $id: "https://example.invalid/remote" }), /Unsupported preference schema/);
});

for (const key of ["tools", "inputModalities", "outputFormats", "contextTokens", "riskFactors"]) {
  test(`CA-P16: v2 no inventa requirements.${key}`, () => {
    const d = fixture(); delete d.request.requirements[key];
    const result = select(d);
    assert.equal(result.state, "needs-info");
    assert.ok(result.missing.includes(`requirements.${key}`));
  });
}

test("CA-P11/12: aplicación autónoma conserva autoría y acciones declaradas", () => {
  const d = fixture();
  d.request.mode = "autonomous";
  d.request.role = "executor";
  d.request.category = "application";
  d.request.authorizationContext.activeWriter = "authorized-executor";
  d.request.authorizationContext.allowedActions = ["read", "apply", "verify"];
  d.policy.routes[0].role = "executor";
  d.policy.routes[0].modes = ["autonomous"];
  d.policy.routes[0].categories = ["application"];
  d.policy.routes[0].families.forEach((f) => f.effortRules.forEach((r) => { r.category = "application"; }));
  d.catalog.profiles.forEach((p) => p.evaluations.forEach((e) => { e.role = "executor"; e.category = "application"; }));
  const result = select(d);
  assert.equal(result.state, "recommended");
  assert.equal(result.executed, false);
  assert.deepEqual(result.constraints.authorizationContext, d.request.authorizationContext);
  d.request.authorizationContext.activeWriter = "user";
  assert.equal(select(d).state, "blocked");
  d.request.authorizationContext.activeWriter = "authorized-executor";
  d.request.authorizationContext.allowedActions = ["read", "verify"];
  assert.equal(select(d).state, "blocked");
});
function freeze(v) {
  if (v && typeof v === "object") { Object.values(v).forEach(freeze); Object.freeze(v); }
  return v;
}
function escalation(d) {
  d.request.history.previousProfileId = "demo-light-new";
  d.request.history.previousEffort = "brief";
  d.request.history.executionsUsed = 1;
  d.request.escalation = { reason: "quality", evidenceRefs: ["demo-review"], failedCriteria: ["ca-01"] };
}

test("CA-P01/02/14: elige familia ligera, versión reciente y ajuste admisible menor", () => {
  const result = select(fixture());
  assert.equal(result.state, "recommended");
  assert.equal(result.recommendation.profileId, "demo-light-new");
  assert.equal(result.recommendation.versionOrdinal, 2);
  assert.equal(result.recommendation.effort, "brief");
  assert.equal(result.recommendation.familyRank, 10);
  assert.equal(result.recommendation.progressionRank, 0);
  assert.deepEqual(result.recommendation.versionEvidenceRefs, ["demo-version-review"]);
  assert.equal(result.recommendation.effortRuleId, "demo-light-low");
  assert.equal(result.recommendation.rank, undefined);
});

test("CA-P01: no interpreta números de versión ni ordena etiquetas", () => {
  const d = fixture();
  profile(d).requestedModel = "example-model-v2";
  profile(d, "demo-light-old").requestedModel = "example-model-v999";
  assert.equal(select(d).recommendation.profileId, "demo-light-new");
  d.catalog.profiles.reverse();
  family(d).profileIds.reverse();
  family(d).effortRules.reverse();
  family(d).effortRules.forEach((r) => r.options.reverse());
  assert.equal(select(d).recommendation.profileId, "demo-light-new");
});

for (const [name, mutate, reason] of [
  ["candidata", (d) => { profile(d).status = "candidate"; }, "profile-not-approved"],
  ["retirada", (d) => { profile(d).status = "deprecated"; }, "profile-not-approved"],
  ["deshabilitada", (d) => { profile(d).status = "disabled"; }, "profile-not-approved"],
  ["no disponible", (d) => { d.request.availability[1].status = "unavailable"; }, "availability-not-declared"],
  ["desconocida", (d) => { d.request.availability[1].status = "unknown"; }, "availability-not-declared"],
  ["caducada", (d) => { d.request.availability[1].checkedAt = "2026-10-02T12:00:00Z"; }, "availability-expired"],
  ["futura", (d) => { d.request.availability[1].checkedAt = "2026-10-02T15:00:00Z"; }, "availability-in-future"],
  ["contexto insuficiente", (d) => { profile(d).verifiedCapabilities.maxContextTokens = 100; }, "context-not-verified"],
  ["sin capacidad", (d) => { profile(d).verifiedCapabilities.tools = []; }, "tools-not-verified"],
  ["sin evidencia aplicable", (d) => { profile(d).evaluations.forEach((e) => { e.difficulties = ["high"]; }); }, "scope-not-evaluated"]
]) {
  test(`CA-P03: descarta reciente ${name} y explica versión anterior`, () => {
    const d = fixture(); mutate(d);
    const r = select(d);
    assert.equal(r.state, "recommended");
    assert.equal(r.recommendation.profileId, "demo-light-old");
    assert.ok(r.reasons.includes("older-than-known-version"));
    assert.ok(excluded(r).includes(reason));
  });
}

test("CA-P02: familia siguiente solo cuando la primera no cumple", () => {
  const d = fixture();
  d.catalog.profiles.filter((p) => p.familyId === "demo-light")
    .forEach((p) => { p.verifiedCapabilities.maxContextTokens = null; });
  assert.equal(select(d).recommendation.profileId, "demo-balanced-new");
});

test("CA-P04: ordinal desconocido impide elegir esa familia", () => {
  const d = fixture(); profile(d).versionOrdinal = null;
  const r = select(d);
  assert.equal(r.recommendation.familyId, "demo-balanced");
  assert.ok(excluded(r).includes("family-version-order-unknown"));
});

const semanticCases = [
  ["duplicate-version-ordinal", (d) => { profile(d).versionOrdinal = 1; }],
  ["duplicate-model-identity", (d) => { profile(d).requestedModel = profile(d, "demo-light-old").requestedModel; }],
  ["duplicate-profile-id", (d) => { d.catalog.profiles.push({ ...profile(d), requestedModel: "example-other", versionOrdinal: 3 }); }],
  ["family-profile-mismatch", (d) => { profile(d).familyId = "another-family"; }],
  ["priority-client-mismatch", (d) => { profile(d).provider = "another-provider"; }],
  ["unknown-priority-profile", (d) => { family(d).profileIds.push("unknown-profile"); }],
  ["unknown-effort-profile", (d) => { rule(d).options[0].profileId = "unknown-profile"; }],
  ["effort-profile-outside-family", (d) => { rule(d).options[0].profileId = "demo-balanced-new"; }],
  ["duplicate-family", (d) => { d.policy.routes[0].families.push({ ...structuredClone(family(d)), rank: 30 }); }],
  ["ambiguous-family-order", (d) => { d.policy.routes[0].families[1].rank = 10; }],
  ["duplicate-family-profile", (d) => { d.policy.routes[0].families[1].profileIds.push("demo-light-new"); }],
  ["overlapping-effort-rules", (d) => { family(d).effortRules.push({ ...structuredClone(rule(d)), ruleId: "another-rule" }); }],
  ["duplicate-effort-rule-id", (d) => { family(d).effortRules[1].ruleId = rule(d).ruleId; }],
  ["duplicate-effort-option", (d) => { rule(d).options.push({ ...rule(d).options[0], evidenceRefs: ["other-evidence"] }); }],
  ["inconsistent-effort-order", (d) => { family(d).effortRules[1].options[0].effortRank = 9; }],
  ["ambiguous-effort-order", (d) => { options(d).forEach((o) => { if (o.effort === "standard") o.effortRank = 0; }); }],
  ["contradictory-quality-progression", (d) => { options(d).forEach((o) => { if (o.effort === "deep") o.progressionRank = 0; }); }],
  ["unsupported-effort", (d) => { rule(d).options[0].effort = "extreme"; }],
  ["unsupported-evaluation-effort", (d) => { profile(d).evaluations[0].effort = "extreme"; }],
  ["rule-category-not-permitted", (d) => { rule(d).category = "diagnostic"; }],
  ["catalog-version-mismatch", (d) => { d.policy.catalogRevision = "r02"; }],
  ["duplicate-route", (d) => { d.policy.routes.push({ ...structuredClone(d.policy.routes[0]), modes: ["tutor", "autonomous"] }); }],
  ["duplicate-availability", (d) => { d.request.availability.push({ ...d.request.availability[0], evidenceRef: "other-evidence" }); }],
  ["unknown-availability-profile", (d) => { d.request.availability[0].profileId = "unknown-profile"; }],
  ["availability-client-mismatch", (d) => { profile(d).client = "other-client"; }],
  ["explicit-effort-without-profile", (d) => { d.request.explicitEffort = "brief"; }],
  ["previous-effort-without-profile", (d) => { d.request.history.previousEffort = "brief"; }],
  ["unknown-request-profile", (d) => { d.request.explicitProfileId = "unknown-profile"; }],
  ["risk-contradiction", (d) => { d.request.requirements.riskFactors = ["security"]; }],
  ["history-contradiction", (d) => { d.request.history.previousProfileId = "demo-light-new"; }],
  ["profile-reviewed-in-future", (d) => { profile(d).reviewedAt = "2026-10-03T13:00:00Z"; }],
  ["inconsistent-verified-capabilities", (d) => { profile(d).verifiedCapabilities.tools.push("write-files"); }]
];
for (const [code, mutate] of semanticCases) {
  test(`CA-P04/07/09: rechaza ${code}`, () => {
    const d = fixture(); mutate(d);
    const r = select(d);
    assert.equal(r.state, "invalid");
    assert.ok(issue(r, code), JSON.stringify(r.issues));
  });
}

for (const [difficulty, effort] of [["low", "brief"], ["medium", "standard"], ["high", "deep"]]) {
  test(`CA-P05: misma versión adapta esfuerzo a ${difficulty}`, () => {
    const d = fixture(); d.request.difficulty = difficulty;
    assert.equal(select(d).recommendation.profileId, "demo-light-new");
    assert.equal(select(d).recommendation.effort, effort);
  });
}

test("CA-P06: no usa esfuerzo solo anunciado y respeta evidencia exacta", () => {
  const d = fixture();
  profile(d).evaluations = profile(d).evaluations.filter((e) => e.effort !== "brief");
  const r = select(d);
  assert.equal(r.recommendation.effort, "standard");
  assert.ok(r.effortExcluded.some((e) => e.profileId === "demo-light-new" && e.effort === "brief" &&
    e.reasons.includes("effort-scope-not-evaluated")));
});

test("CA-P06: techo no eleva esfuerzo para compensar falta de evaluación", () => {
  const d = fixture();
  rule(d).maxEffortRank = 0;
  profile(d).evaluations = profile(d).evaluations.filter((e) => e.effort !== "brief");
  const r = select(d);
  assert.equal(r.recommendation.profileId, "demo-light-old");
  assert.ok(r.effortExcluded.some((e) => e.reasons.includes("effort-limit-exceeded")));
});

test("CA-P06/16: riesgo alto requiere regla y evaluación de ese riesgo", () => {
  const d = fixture(); d.request.risk = "high"; d.request.requirements.riskFactors = ["security"];
  assert.equal(select(d).state, "blocked");
  for (const f of d.policy.routes[0].families) {
    const highRule = structuredClone(f.effortRules[2]);
    highRule.ruleId += "-security"; highRule.difficulty = "low"; highRule.risk = "high";
    f.effortRules.push(highRule);
  }
  assert.equal(select(d).recommendation.effort, "deep");
  d.catalog.profiles.forEach((p) => p.evaluations.forEach((e) => { e.risks = ["low"]; }));
  assert.equal(select(d).state, "blocked");
});

test("CA-P08: null solo con perfil sin ajuste y evaluación del default", () => {
  const d = fixture();
  for (const p of d.catalog.profiles) {
    p.effortOptions = []; p.evaluations = [{ ...p.evaluations[0], effort: null }];
  }
  for (const f of d.policy.routes[0].families) for (const r of f.effortRules) {
    r.options = f.profileIds.map((profileId) => ({ profileId, effort: null,
      effortRank: 0, progressionRank: 0, evidenceRefs: ["demo-default-review"] }));
  }
  const result = select(d);
  assert.equal(result.state, "recommended");
  assert.equal(result.recommendation.effort, null);
  profile(d).effortOptions = ["brief"];
  assert.equal(select(d).state, "invalid");
});

test("CA-P09: perfil de otro proveedor no entra por cambiar su etiqueta", () => {
  const d = fixture();
  const foreign = structuredClone(profile(d));
  foreign.profileId = "demo-foreign"; foreign.provider = "another-provider";
  foreign.requestedModel = "example-light-r100"; foreign.versionOrdinal = 100;
  d.catalog.profiles.push(foreign);
  const r = select(d);
  assert.equal(r.recommendation.profileId, "demo-light-new");
  assert.ok(excluded(r, "demo-foreign").includes("profile-not-permitted"));
  d.request.provider = "another-provider"; delete d.request.availability;
  assert.equal(select(d).state, "needs-info");
  d.request.availability = [{ ...fixture().request.availability[0], profileId: "demo-foreign" }];
  const blocked = select(d);
  assert.equal(blocked.state, "blocked");
  assert.ok(blocked.reasons.includes("route-not-permitted"));
});

test("CA-P10: elección compatible respeta versión y esfuerzo explícitos", () => {
  const d = fixture();
  d.request.explicitProfileId = "demo-light-old"; d.request.explicitEffort = "deep";
  const r = select(d);
  assert.equal(r.recommendation.profileId, "demo-light-old");
  assert.equal(r.recommendation.effort, "deep");
  assert.ok(r.reasons.includes("explicit-compatible-choice"));
  d.request.explicitEffort = "unknown";
  assert.equal(select(d).state, "blocked");
  d.request.explicitEffort = "deep"; d.request.availability[0].status = "unavailable";
  assert.equal(select(d).state, "blocked");
});

test("CA-P11: escala esfuerzo con evidencia y conserva todos los contadores", () => {
  const d = fixture(); escalation(d);
  d.request.history.correctionRound = 1; d.request.history.durationUsedSeconds = 10;
  const r = select(d);
  assert.equal(r.recommendation.profileId, "demo-light-new");
  assert.equal(r.recommendation.effort, "standard");
  assert.deepEqual(r.constraints.history, d.request.history);
  assert.deepEqual(r.constraints.authorizationContext, d.request.authorizationContext);
  assert.ok(r.reasons.includes("quality-escalation-with-declared-evidence"));
  d.request.history.previousEffort = "deep";
  assert.equal(select(d).recommendation.familyId, "demo-balanced");
});

test("CA-P11: nueva versión con progresión igual no es escalada", () => {
  const d = fixture(); escalation(d);
  d.request.history.previousProfileId = "demo-light-old";
  d.request.explicitProfileId = "demo-light-new"; d.request.explicitEffort = "brief";
  assert.equal(select(d).state, "blocked");
});

test("CA-P11: ausencia o incompatibilidad de combinación previa no inventa historial", () => {
  const d = fixture(); escalation(d); delete d.request.history.previousEffort;
  assert.ok(select(d).missing.includes("history.previousEffort"));
  d.request.history.previousEffort = "not-listed";
  assert.ok(select(d).reasons.includes("previous-combination-not-in-route"));
  delete d.request.history.previousProfileId;
  assert.equal(select(d).state, "invalid");
});

test("CA-P11: dos rondas autónomas, techo de llamadas y tiempo bloquean", () => {
  for (const [field, value, code] of [
    ["executionsUsed", 3, "execution-limit-reached"],
    ["durationUsedSeconds", 900, "duration-limit-reached"]
  ]) {
    const d = fixture(); d.request.history[field] = value;
    assert.ok(select(d).reasons.includes(code));
  }
  const d = fixture();
  d.request.mode = "autonomous"; d.request.role = "proposer"; d.request.category = "proposal";
  d.request.history.correctionRound = 2; d.request.history.executionsUsed = 2;
  assert.ok(select(d).reasons.includes("correction-limit-reached"));
});

for (const failure of ["permission", "environment", "quota", "authentication", "stale-base", "checks-not-run"]) {
  test(`CA-P12: ${failure} no escala por calidad`, () => {
    const d = fixture(); escalation(d); d.request.escalation.reason = failure;
    assert.ok(select(d).reasons.includes("non-quality-failure"));
    assert.equal(select(d).recommendation, null);
  });
}

test("CA-P12: permiso de explicación ausente bloquea, no cambia modo/escritor", () => {
  const d = fixture(); d.request.authorizationContext.allowedActions = ["read"];
  assert.ok(select(d).reasons.includes("insufficient-declared-actions"));
  d.request.authorizationContext.activeWriter = "authorized-executor";
  assert.equal(select(d).state, "invalid");
});

test("CA-P13: determinismo con entradas congeladas y salidas independientes", () => {
  const d = freeze(fixture());
  const a = select(d);
  assert.deepEqual(select(d), a);
  a.recommendation.familyEvidenceRefs.push("mutated");
  assert.deepEqual(select(d).recommendation.familyEvidenceRefs, ["demo-family-review"]);
  const reordered = fixture();
  reordered.catalog.profiles.reverse(); reordered.policy.routes[0].families.reverse();
  assert.deepEqual(select(reordered).recommendation, select(d).recommendation);
});

test("CA-P13: inicializa y selecciona sin archivos, red, procesos ni reloj actual", () => {
  const d = fixture(); const originals = [];
  function block(obj, keys) {
    for (const key of keys) { originals.push([obj, key, obj[key]]); obj[key] = () => { throw new Error("Forbidden side effect"); }; }
  }
  try {
    block(fs, ["readFileSync", "writeFileSync", "mkdirSync", "readdirSync", "statSync"]);
    block(childProcess, ["exec", "execSync", "execFile", "execFileSync", "spawn", "spawnSync", "fork"]);
    block(http, ["request", "get"]); block(https, ["request", "get"]);
    block(net, ["connect", "createConnection"]); block(globalThis, ["fetch"]);
    block(Date, ["now"]); block(Math, ["random"]);
    assert.equal(createModelSelector(schema, preferenceSchema)(d).state, "recommended");
  } finally { for (const [obj, key, original] of originals) obj[key] = original; }
});

test("CA-P13: rechaza getters, ciclos y límites antes de despachar v2", () => {
  const d = fixture(); let calls = 0;
  Object.defineProperty(d.request, "secret", { enumerable: true, get() { calls++; return "private-value"; } });
  assert.equal(select(d).state, "invalid"); assert.equal(calls, 0);
  const cycle = fixture(); cycle.extra = cycle;
  assert.equal(select(cycle).state, "invalid");
  const huge = fixture(); huge.request.availability = Array(257).fill(huge.request.availability[0]);
  assert.equal(select(huge).state, "invalid");
});

test("CA-P14: todos los estados siguen sin ejecutar ni certificar modelos", () => {
  const missing = fixture(); delete missing.request.risk;
  const blocked = fixture(); blocked.request.availability = [];
  const invalid = fixture(); invalid.catalog.profiles[0].requestedModel = "latest";
  const reports = [fixture(), missing, blocked, invalid].map(select);
  assert.deepEqual(reports.map((r) => r.state), ["recommended", "needs-info", "blocked", "invalid"]);
  for (const r of reports) {
    assert.equal(r.executed, false); assert.equal(r.modelVerification, "unknown");
    assert.deepEqual(r.observedModels, []); assert.match(r.audit.baseSchemaSha256, /^[a-f0-9]{64}$/);
  }
});

test("CA-P15: cargar v2 no cambia decisiones ni informes de v1", () => {
  const legacy = createModelSelector(schema);
  const data = Object.fromEntries(["catalog", "policy", "request"].map((name) =>
    [name, read(`../examples/model-selection/${name}.example.json`)]));
  for (const change of [() => {}, (d) => { d.request.risk = "high"; },
    (d) => { delete d.request.difficulty; }, (d) => { d.request.mode = "unknown"; }]) {
    const d = structuredClone(data); change(d); assert.deepEqual(select(d), legacy(d));
  }
  assert.equal(legacy(fixture()).state, "invalid");
});

for (const name of ["request", "catalog", "policy"]) {
  test(`CA-P15: mezcla de versiones en ${name} rechazada sin convertir`, () => {
    const d = fixture(); d[name].schemaVersion = "1.0.0";
    assert.equal(select(d).state, "invalid");
  });
}

for (const field of ["provider", "client", "category", "difficulty", "risk", "requirements", "history", "authorizationContext", "availability"]) {
  test(`CA-P16: pide ${field} sin asumirlo`, () => {
    const d = fixture(); delete d.request[field];
    assert.equal(select(d).state, "needs-info");
    assert.ok(select(d).missing.includes(field));
  });
}

test("CA-P16: regla inexistente, sin opciones admisibles o sin ruta bloquea", () => {
  const d = fixture(); d.policy.routes[0].families.forEach((f) => { f.effortRules = []; });
  assert.equal(select(d).state, "blocked");
  const noOption = fixture(); rule(noOption).options = rule(noOption).options.filter((o) => o.profileId === "demo-light-old");
  assert.equal(select(noOption).recommendation.profileId, "demo-light-old");
  const noRoute = fixture(); noRoute.request.role = "reviewer";
  assert.ok(select(noRoute).reasons.includes("route-not-permitted"));
});
