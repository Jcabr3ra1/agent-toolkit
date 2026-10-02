import assert from "node:assert/strict";
import childProcess from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import test from "node:test";

import { createModelSelector } from "../src/model-selection.js";

const readJson = (file) => JSON.parse(fs.readFileSync(new URL(file, import.meta.url), "utf8"));
const schema = readJson("../schemas/agent-model-selection.schema.json");
const select = createModelSelector(schema);
const BASE = {
  catalog: readJson("../examples/model-selection/catalog.example.json"),
  policy: readJson("../examples/model-selection/policy.example.json"),
  request: readJson("../examples/model-selection/request.example.json")
};

function fixture() { return structuredClone(BASE); }
function makeAvailable(data) {
  data.request.availability.forEach((entry) => { entry.status = "available"; });
}
function hasIssue(report, code) { return report.issues.some((issue) => issue.code === code); }
function exclusions(report, profileId = "demo-light") {
  return report.excluded.find((item) => item.profileId === profileId)?.reasons ?? [];
}
function autonomous(data) {
  data.request.mode = "autonomous";
  data.request.role = "proposer";
  data.request.category = "proposal";
  data.policy.routes[0].role = "proposer";
  data.policy.routes[0].modes = ["autonomous"];
  data.policy.routes[0].categories = ["proposal"];
  data.catalog.profiles.forEach((profile) => {
    profile.evaluations[0].role = "proposer";
    profile.evaluations[0].category = "proposal";
  });
}
function escalation(data) {
  makeAvailable(data);
  data.request.history.previousProfileId = "demo-light";
  data.request.history.executionsUsed = 1;
  data.request.escalation = {
    reason: "quality", evidenceRefs: ["demo-review"], failedCriteria: ["ca-01"]
  };
}
function freeze(value) {
  if (value && typeof value === "object") {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

test("CA-01/02: recomienda el perfil ligero admisible de forma determinista", () => {
  const data = freeze(fixture());
  const first = select(data);
  assert.deepEqual(select(data), first);
  assert.equal(first.state, "recommended");
  assert.equal(first.recommendation.profileId, "demo-light");
  assert.equal(first.recommendation.effort, null);
  assert.equal(first.executed, false);
  assert.ok(first.reasons.includes("lowest-admissible-priority"));
});

test("CA-01: no usa archivos, red, procesos, reloj actual o aleatoriedad", () => {
  const data = fixture();
  const replaced = [];
  const calls = [
    [fs, "readFileSync"], [fs, "writeFileSync"], [fs, "readdirSync"],
    [fs.promises, "readFile"], [fs.promises, "writeFile"],
    [childProcess, "spawn"], [childProcess, "exec"], [childProcess, "execFileSync"],
    [http, "request"], [https, "request"], [net, "connect"],
    [globalThis, "fetch"], [Date, "now"], [Math, "random"]
  ];
  try {
    for (const [object, key] of calls) {
      replaced.push([object, key, object[key]]);
      object[key] = () => { throw new Error(`Forbidden effect: ${key}`); };
    }
    const isolatedSelect = createModelSelector(schema);
    assert.equal(isolatedSelect(data).state, "recommended");
  } finally {
    for (const [object, key, original] of replaced) object[key] = original;
  }
});

test("CA-01/09: no cambia entradas ni comparte referencias con la salida", () => {
  const data = fixture();
  const before = structuredClone(data);
  const result = select(data);
  result.constraints.authorizationContext.allowedActions.push("apply");
  result.constraints.history.correctionRound = 2;
  result.recommendation.availabilityEvidence.status = "unavailable";
  assert.deepEqual(data, before);
  assert.equal(select(data).recommendation.profileId, "demo-light");
});

test("CA-01: huellas canónicas independientes del orden de claves de objetos", () => {
  const data = fixture();
  const reordered = Object.fromEntries(Object.entries(data).reverse());
  reordered.request = Object.fromEntries(Object.entries(data.request).reverse());
  assert.deepEqual(select(data), select(reordered));
});

test("CA-02: desempata por profileId, no por orden del catálogo o política", () => {
  const data = fixture();
  makeAvailable(data);
  data.policy.routes[0].priorities.forEach((priority) => { priority.rank = 10; });
  const expected = "demo-balanced";
  assert.equal(select(data).recommendation.profileId, expected);
  data.catalog.profiles.reverse();
  data.policy.routes[0].priorities.reverse();
  assert.equal(select(data).recommendation.profileId, expected);
});

test("CA-02: no elige el más nuevo ni uno fuera de la prioridad explícita", () => {
  const data = fixture();
  makeAvailable(data);
  data.catalog.profiles[1].reviewedAt = "2026-10-02T13:59:59Z";
  assert.equal(select(data).recommendation.profileId, "demo-light");
  data.policy.routes[0].priorities = [data.policy.routes[0].priorities[0]];
  data.request.requirements.contextTokens = 9000;
  assert.equal(select(data).state, "blocked");
  assert.ok(exclusions(select(data), "demo-balanced").includes("profile-not-permitted"));
});

const capabilityCases = [
  ["herramienta", (d) => { d.request.requirements.tools = ["write-files"]; }, "tools-not-verified"],
  ["modalidad", (d) => { d.request.requirements.inputModalities = ["image"]; }, "inputModalities-not-verified"],
  ["formato", (d) => { d.request.requirements.outputFormats = ["json"]; }, "outputFormats-not-verified"],
  ["contexto", (d) => { d.request.requirements.contextTokens = 9000; }, "context-not-verified"],
  ["contexto desconocido", (d) => { d.catalog.profiles[0].verifiedCapabilities.maxContextTokens = null; }, "context-not-verified"]
];
for (const [name, change, reason] of capabilityCases) {
  test(`CA-03: exige capacidad verificada de ${name}`, () => {
    const data = fixture();
    change(data);
    const result = select(data);
    assert.equal(result.state, "blocked");
    assert.ok(exclusions(result).includes(reason));
  });
}

test("CA-02/03: sube al siguiente admisible cuando el ligero no cubre contexto", () => {
  const data = fixture();
  makeAvailable(data);
  data.request.requirements.contextTokens = 9000;
  const result = select(data);
  assert.equal(result.recommendation.profileId, "demo-balanced");
  assert.equal(result.recommendation.effort, "standard");
});

for (const [name, change] of [
  ["riesgo", (d) => { d.request.risk = "high"; }],
  ["dificultad", (d) => { d.request.difficulty = "high"; }],
  ["categoría", (d) => { d.request.category = "diagnostic"; d.policy.routes[0].categories.push("diagnostic"); }],
  ["rol", (d) => { d.request.role = "reviewer"; d.policy.routes[0].role = "reviewer"; }]
]) {
  test(`CA-03: no hereda una evaluación de otro ${name}`, () => {
    const data = fixture();
    makeAvailable(data);
    change(data);
    assert.equal(select(data).state, "blocked");
    assert.ok(exclusions(select(data)).includes("scope-not-evaluated"));
  });
}

test("CA-03: admite riesgo alto solo con evaluación explícita de ese alcance", () => {
  const data = fixture();
  makeAvailable(data);
  data.request.risk = "high";
  data.request.requirements.riskFactors = ["security"];
  data.catalog.profiles[1].evaluations[0].risks.push("high");
  assert.equal(select(data).recommendation.profileId, "demo-balanced");
});

for (const field of ["provider", "client", "category", "difficulty", "risk", "requirements", "authorizationContext", "history", "availability"]) {
  test(`CA-04: pide información sin inventar ${field}`, () => {
    const data = fixture();
    delete data.request[field];
    const result = select(data);
    assert.equal(result.state, "needs-info");
    assert.ok(result.missing.includes(field));
    assert.equal(result.recommendation, null);
  });
}
for (const field of ["tools", "inputModalities", "outputFormats", "contextTokens", "riskFactors"]) {
  test(`CA-04: distingue requisito ausente ${field}`, () => {
    const data = fixture();
    delete data.request.requirements[field];
    const result = select(data);
    assert.equal(result.state, "needs-info");
    assert.ok(result.missing.includes(`requirements.${field}`));
  });
}

test("CA-04: herramientas y riesgos vacíos son declaraciones válidas", () => {
  const data = fixture();
  data.request.requirements.tools = [];
  assert.equal(select(data).state, "recommended");
});

test("CA-04/08: no cae a un default cuando no hay disponibilidad", () => {
  const data = fixture();
  data.request.availability = [];
  const result = select(data);
  assert.equal(result.state, "blocked");
  assert.equal(result.recommendation, null);
  assert.ok(result.reasons.includes("no-admissible-profile"));
});

test("CA-05: mantiene tutor, escritor usuario y alcance declarado", () => {
  const data = fixture();
  const result = select(data);
  assert.equal(result.identity.mode, "tutor");
  assert.deepEqual(result.constraints.authorizationContext, data.request.authorizationContext);
  assert.equal(result.constraints.execution, "recommend-only");
});

for (const [name, change, expected] of [
  ["apply en tutor", (d) => { d.request.authorizationContext.allowedActions.push("apply"); }, "invalid"],
  ["ejecutor en tutor", (d) => { d.request.role = "executor"; }, "invalid"],
  ["permiso mínimo ausente", (d) => { d.request.authorizationContext.allowedActions = ["read"]; }, "blocked"],
  ["otro proveedor", (d) => { d.request.provider = "other-provider"; d.request.availability = []; }, "blocked"],
  ["otro cliente", (d) => { d.request.client = "other-cli"; d.request.availability = []; }, "blocked"],
  ["modo no permitido por ruta", (d) => { d.request.mode = "autonomous"; }, "blocked"]
]) {
  test(`CA-05: no amplía permiso ante ${name}`, () => {
    const data = fixture();
    change(data);
    assert.equal(select(data).state, expected);
    assert.equal(select(data).recommendation, null);
  });
}

test("CA-05: una aplicación autónoma necesita rol, evaluación y escritor autorizado", () => {
  const data = fixture();
  data.request.mode = "autonomous";
  data.request.role = "executor";
  data.request.category = "application";
  data.request.authorizationContext.activeWriter = "authorized-executor";
  data.request.authorizationContext.allowedActions = ["read", "apply", "verify"];
  data.policy.routes[0].role = "executor";
  data.policy.routes[0].modes = ["autonomous"];
  data.policy.routes[0].categories = ["application"];
  data.catalog.profiles[0].evaluations[0].role = "executor";
  data.catalog.profiles[0].evaluations[0].category = "application";
  const result = select(data);
  assert.equal(result.state, "recommended");
  assert.equal(result.executed, false);
  data.request.authorizationContext.activeWriter = "user";
  assert.ok(select(data).reasons.includes("executor-is-not-active-writer"));
});

test("CA-05: rol aplicación no transforma un proponente en ejecutor", () => {
  const data = fixture();
  autonomous(data);
  data.request.category = "application";
  data.request.authorizationContext.allowedActions.push("apply");
  assert.ok(select(data).reasons.includes("role-category-conflict"));
});

test("CA-06: escalada de calidad usa evidencia declarada y siguiente prioridad admisible", () => {
  const data = fixture();
  escalation(data);
  const result = select(data);
  assert.equal(result.state, "recommended");
  assert.equal(result.recommendation.profileId, "demo-balanced");
  assert.ok(result.reasons.includes("quality-escalation-with-declared-evidence"));
  assert.ok(exclusions(result).includes("not-higher-approved-priority"));
  assert.deepEqual(result.constraints.history, data.request.history);
});

for (const reason of ["permission", "environment", "quota", "authentication", "stale-base", "checks-not-run"]) {
  test(`CA-06: ${reason} no provoca escalada por calidad`, () => {
    const data = fixture();
    escalation(data);
    data.request.escalation.reason = reason;
    assert.equal(select(data).state, "blocked");
    assert.ok(select(data).reasons.includes("non-quality-failure"));
  });
}

test("CA-06: escalada sin perfil anterior pide información", () => {
  const data = fixture();
  escalation(data);
  delete data.request.history.previousProfileId;
  assert.ok(select(data).missing.includes("history.previousProfileId"));
});

test("CA-06: evidencia o criterio ausentes no habilitan escalada", () => {
  const data = fixture();
  escalation(data);
  data.request.escalation.failedCriteria = [];
  assert.equal(select(data).state, "invalid");
  data.request.escalation.failedCriteria = ["ca-01"];
  delete data.request.escalation.evidenceRefs;
  assert.equal(select(data).state, "invalid");
});

test("CA-06: empate no es un nivel de escalada superior", () => {
  const data = fixture();
  escalation(data);
  data.policy.routes[0].priorities[1].rank = 10;
  assert.equal(select(data).state, "blocked");
});

test("CA-06: perfil anterior fuera de ruta no permite escalada", () => {
  const data = fixture();
  escalation(data);
  data.policy.routes[0].priorities.shift();
  assert.ok(select(data).reasons.includes("previous-profile-not-in-route"));
});

test("CA-07: una ronda consumida se conserva al escalar y renovar revisión", () => {
  const data = fixture();
  autonomous(data);
  escalation(data);
  data.request.history.correctionRound = 1;
  data.request.revision = "r02";
  const result = select(data);
  assert.equal(result.state, "recommended");
  assert.equal(result.constraints.history.correctionRound, 1);
  assert.equal(result.constraints.history.executionsUsed, 1);
});

test("CA-07: agotadas dos correcciones no se selecciona otra por modelo o revisión", () => {
  const data = fixture();
  autonomous(data);
  escalation(data);
  data.request.history.correctionRound = 2;
  data.request.history.executionsUsed = 2;
  data.request.revision = "r99";
  data.request.explicitProfileId = "demo-balanced";
  assert.ok(select(data).reasons.includes("correction-limit-reached"));
  assert.equal(select(data).recommendation, null);
  delete data.request.escalation;
  assert.equal(select(data).state, "blocked");
});

test("CA-07: límite de rondas autónomas no escribe ni consume pasos del tutor", () => {
  const data = fixture();
  data.request.history.correctionRound = 2;
  data.request.history.executionsUsed = 2;
  const result = select(data);
  assert.equal(result.state, "recommended");
  assert.equal(result.constraints.history.correctionRound, 2);
  assert.equal(result.constraints.authorizationContext.activeWriter, "user");
});

for (const [name, change, reason] of [
  ["ejecuciones", (d) => { d.request.history.executionsUsed = 3; }, "execution-limit-reached"],
  ["tiempo", (d) => { d.request.history.durationUsedSeconds = 900; }, "duration-limit-reached"]
]) {
  test(`CA-06/07: respeta límite global de ${name}`, () => {
    const data = fixture();
    change(data);
    assert.equal(select(data).state, "blocked");
    assert.ok(select(data).reasons.includes(reason));
  });
}

test("CA-07: conserva elección explícita compatible, aunque no sea la primera", () => {
  const data = fixture();
  makeAvailable(data);
  data.request.explicitProfileId = "demo-balanced";
  const result = select(data);
  assert.equal(result.recommendation.profileId, "demo-balanced");
  assert.ok(result.reasons.includes("explicit-compatible-choice"));
});

test("CA-07: elección incompatible no se sustituye silenciosamente", () => {
  const data = fixture();
  data.request.explicitProfileId = "demo-balanced";
  assert.equal(select(data).state, "blocked");
  assert.ok(select(data).reasons.includes("explicit-choice-not-admissible"));
  assert.equal(select(data).recommendation, null);
});

for (const status of ["candidate", "deprecated", "disabled"]) {
  test(`CA-08: excluye estado ${status}`, () => {
    const data = fixture();
    data.catalog.profiles[0].status = status;
    assert.equal(select(data).state, "blocked");
    assert.ok(exclusions(select(data)).includes("profile-not-approved"));
  });
}
for (const [name, change, reason] of [
  ["unknown", (d) => { d.request.availability[0].status = "unknown"; }, "availability-not-declared"],
  ["unavailable", (d) => { d.request.availability[0].status = "unavailable"; }, "availability-not-declared"],
  ["caducada", (d) => { d.request.availability[0].checkedAt = "2026-10-02T12:59:59Z"; }, "availability-expired"],
  ["futura", (d) => { d.request.availability[0].checkedAt = "2026-10-02T14:00:01Z"; }, "availability-in-future"]
]) {
  test(`CA-08: disponibilidad ${name} no demuestra acceso`, () => {
    const data = fixture();
    change(data);
    assert.equal(select(data).state, "blocked");
    assert.ok(exclusions(select(data)).includes(reason));
  });
}

test("CA-08: admite fecha presente y antigüedad máxima inclusive", () => {
  const data = fixture();
  data.request.availability[0].checkedAt = data.request.evaluationTime;
  assert.equal(select(data).state, "recommended");
  data.request.availability[0].checkedAt = "2026-10-02T13:00:00Z";
  assert.equal(select(data).state, "recommended");
});

test("CA-09: identifica huellas/versiones sin afirmar modelo observado", () => {
  const data = fixture();
  const result = select(data);
  for (const key of ["schemaSha256", "requestSha256", "catalogSha256", "policySha256"]) {
    assert.match(result.audit[key], /^[a-f0-9]{64}$/);
  }
  assert.deepEqual(result.audit.catalog, { id: "demo-catalog", revision: "r01" });
  assert.deepEqual(result.audit.policy, { id: "demo-policy", revision: "r01" });
  assert.deepEqual(result.observedModels, []);
  assert.equal(result.modelVerification, "unknown");
  assert.equal(result.recommendation.availabilityEvidence.provenance, "user-declaration");
  data.request.requirements.contextTokens++;
  assert.notEqual(select(data).audit.requestSha256, result.audit.requestSha256);
  assert.equal(select(data).audit.catalogSha256, result.audit.catalogSha256);
});

const semanticInvalid = [
  ["duplicate-profile-id", (d) => { d.catalog.profiles[1].profileId = "demo-light"; }],
  ["catalog-version-mismatch", (d) => { d.policy.catalogRevision = "r02"; }],
  ["catalog-version-mismatch", (d) => { d.policy.catalogId = "other-catalog"; }],
  ["duplicate-route", (d) => { d.policy.routes.push({ ...structuredClone(d.policy.routes[0]), categories: ["diagnostic"] }); }],
  ["duplicate-priority", (d) => { d.policy.routes[0].priorities.push({ profileId: "demo-light", rank: 30 }); }],
  ["unknown-priority-profile", (d) => { d.policy.routes[0].priorities[0].profileId = "unknown-profile"; }],
  ["priority-client-mismatch", (d) => { d.catalog.profiles[0].client = "other-cli"; }],
  ["unsupported-effort", (d) => { d.policy.routes[0].priorities[0].effort = "deep"; }],
  ["duplicate-availability", (d) => { d.request.availability.push({ ...d.request.availability[0], status: "unknown" }); }],
  ["unknown-availability-profile", (d) => { d.request.availability[0].profileId = "unknown-profile"; }],
  ["availability-client-mismatch", (d) => { d.request.provider = "other-provider"; }],
  ["unknown-request-profile", (d) => { d.request.explicitProfileId = "unknown-profile"; }],
  ["unknown-request-profile", (d) => { d.request.history.previousProfileId = "unknown-profile"; d.request.history.executionsUsed = 1; }],
  ["request-profile-client-mismatch", (d) => {
    d.request.client = "other-cli";
    d.request.availability = [];
    d.request.explicitProfileId = "demo-light";
  }],
  ["risk-contradiction", (d) => { d.request.requirements.riskFactors = ["migration"]; }],
  ["history-contradiction", (d) => { d.request.history.previousProfileId = "demo-light"; }],
  ["history-contradiction", (d) => { autonomous(d); d.request.history.correctionRound = 1; }],
  ["inconsistent-verified-capabilities", (d) => { d.catalog.profiles[0].verifiedCapabilities.tools.push("write-files"); }],
  ["inconsistent-verified-capabilities", (d) => { d.catalog.profiles[0].verifiedCapabilities.maxContextTokens = 17000; }],
  ["profile-reviewed-in-future", (d) => { d.catalog.profiles[0].reviewedAt = "2026-10-02T14:00:01Z"; }]
];
semanticInvalid.forEach(([code, mutate], index) => {
  test(`CA-10: rechaza contradicción ${code} (${index + 1})`, () => {
    const data = fixture();
    mutate(data);
    const result = select(data);
    assert.equal(result.state, "invalid");
    assert.ok(hasIssue(result, code));
    assert.equal(result.recommendation, null);
  });
});

for (const [name, mutate] of [
  ["fecha imposible", (d) => { d.request.evaluationTime = "2026-02-30T14:00:00Z"; }],
  ["tipo no coercible", (d) => { d.policy.maxFutureExecutions = "3"; }],
  ["identidad faltante", (d) => { delete d.request.taskId; }],
  ["campo desconocido", (d) => { d.request.unknown = "example-private-value"; }],
  ["modelo latest", (d) => { d.catalog.profiles[0].requestedModel = "latest"; }]
]) {
  test(`CA-10: rechazo estructural de ${name} sin exponer contenido`, () => {
    const data = fixture();
    mutate(data);
    const result = select(data);
    assert.equal(result.state, "invalid");
    assert.ok(hasIssue(result, "schema-invalid"));
    assert.equal(JSON.stringify(result).includes("example-private-value"), false);
  });
}

test("CA-10: tipo de documento equivocado no satisface el contrato requerido", () => {
  const data = fixture();
  data.request = data.policy;
  assert.equal(select(data).state, "invalid");
});

for (const [name, value] of [
  ["undefined", undefined], ["null", null], ["array", []], ["missing", {}],
  ["unexpected-envelope", { ...BASE, extra: true }],
  ["NaN", { ...BASE, extra: NaN }],
  ["date-object", { ...BASE, extra: new Date("2026-10-02T14:00:00Z") }],
  ["bigint", { ...BASE, extra: 1n }]
]) {
  test(`CA-10: entrada no admitida ${name} devuelve invalid`, () => {
    assert.equal(select(value).state, "invalid");
    assert.equal(select(value).executed, false);
  });
}

test("CA-10: rechaza ciclos, getters y claves peligrosas sin ejecutar getters", () => {
  const cycle = fixture();
  cycle.request.cycle = cycle;
  assert.equal(select(cycle).state, "invalid");
  const data = fixture();
  let reads = 0;
  Object.defineProperty(data.request, "getter", { enumerable: true, get() { reads++; return "value"; } });
  assert.equal(select(data).state, "invalid");
  assert.equal(reads, 0);
  const unsafe = JSON.parse('{"request":{"__proto__":{"polluted":true}}}');
  assert.equal(select(unsafe).state, "invalid");
  assert.equal({}.polluted, undefined);
});

test("CA-10: limita tamaño y profundidad antes de validar", () => {
  const data = fixture();
  data.request.availability = Array.from({ length: 257 }, () => data.request.availability[0]);
  assert.equal(select(data).state, "invalid");
  const deep = fixture();
  let nested = deep;
  for (let index = 0; index < 70; index++) { nested.extra = {}; nested = nested.extra; }
  assert.equal(select(deep).state, "invalid");
});

test("CA-11: estados terminales mantienen executed false y observación desconocida", () => {
  const recommended = fixture();
  const missing = fixture(); delete missing.request.difficulty;
  const blocked = fixture(); blocked.request.availability = [];
  const invalid = fixture(); invalid.request.mode = "invalid";
  const results = [recommended, missing, blocked, invalid].map(select);
  assert.deepEqual(results.map((result) => result.state), ["recommended", "needs-info", "blocked", "invalid"]);
  for (const result of results) {
    assert.equal(result.executed, false);
    assert.equal(result.modelVerification, "unknown");
    assert.deepEqual(result.observedModels, []);
    assert.equal(typeof result.nextAction, "string");
  }
});
