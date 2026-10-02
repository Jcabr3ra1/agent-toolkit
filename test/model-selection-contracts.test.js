import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import Ajv2020 from "ajv/dist/2020.js";

const schema = readJson("../schemas/agent-model-selection.schema.json");
const examples = {
  catalog: readJson("../examples/model-selection/catalog.example.json"),
  policy: readJson("../examples/model-selection/policy.example.json"),
  request: readJson("../examples/model-selection/request.example.json")
};

// This format is local test support, not a production selector or CLI adapter.
// Exact round-trip rejects invalid calendar dates normalized by Date.parse.
const ajv = new Ajv2020({ strict: true, allErrors: true });
ajv.addFormat("date-time", {
  type: "string",
  validate(value) {
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(value)) return false;
    const time = Date.parse(value);
    return Number.isFinite(time) &&
      new Date(time).toISOString() === value.replace(/Z$/, ".000Z");
  }
});
const validate = ajv.compile(schema);

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(new URL(relativePath, import.meta.url), "utf8"));
}

function check(kind, mutate, expected) {
  const value = structuredClone(examples[kind]);
  mutate(value);
  const before = JSON.stringify(value);
  assert.equal(validate(value), expected, JSON.stringify(validate.errors));
  assert.equal(JSON.stringify(value), before, "La validación no transforma datos");
}

for (const kind of Object.keys(examples)) {
  test(`contrato: acepta el ejemplo ficticio de ${kind}`, () => {
    check(kind, () => {}, true);
  });
  test(`contrato: rechaza campos desconocidos en ${kind}`, () => {
    check(kind, (value) => { value.unknown = true; }, false);
  });
  test(`contrato: rechaza versión desconocida en ${kind}`, () => {
    check(kind, (value) => { value.schemaVersion = "2.0.0"; }, false);
  });
  test(`contrato: rechaza identidad de documento incorrecta en ${kind}`, () => {
    check(kind, (value) => { value.kind = "other"; }, false);
  });
}

const rejectedCases = [
  ["catálogo sin perfiles", "catalog", (v) => { v.profiles = []; }],
  ["perfil con campos desconocidos", "catalog", (v) => { v.profiles[0].apiKey = "not-a-secret"; }],
  ["perfil aprobado sin evaluación", "catalog", (v) => { v.profiles[0].evaluations = []; }],
  ["evaluación sin evidencia", "catalog", (v) => { v.profiles[0].evaluations[0].evidenceRefs = []; }],
  ["evaluación con rol inexistente", "catalog", (v) => { v.profiles[0].evaluations[0].role = "all"; }],
  ["estado de perfil desconocido", "catalog", (v) => { v.profiles[0].status = "latest"; }],
  ["modelo default latest", "catalog", (v) => { v.profiles[0].requestedModel = "latest"; }],
  ["alias latest compuesto", "catalog", (v) => { v.profiles[0].requestedModel = "example-LATEST"; }],
  ["modelo con argumentos de shell", "catalog", (v) => { v.profiles[0].requestedModel = "example; echo test"; }],
  ["contexto conocido cero", "catalog", (v) => { v.profiles[0].verifiedCapabilities.maxContextTokens = 0; }],
  ["esfuerzo duplicado", "catalog", (v) => { v.profiles[1].effortOptions.push("standard"); }],
  ["capacidad desconocida", "catalog", (v) => { v.profiles[0].declaredCapabilities.unknown = true; }],
  ["evaluación con dificultades repetidas", "catalog", (v) => { v.profiles[0].evaluations[0].difficulties = ["low", "low"]; }],
  ["fecha imposible del catálogo", "catalog", (v) => { v.profiles[0].reviewedAt = "2026-02-30T13:00:00Z"; }],
  ["política ejecutora", "policy", (v) => { v.execution = "execute"; }],
  ["cambio de proveedor implícito", "policy", (v) => { v.allowProviderSwitch = true; }],
  ["fallback implícito", "policy", (v) => { v.allowImplicitFallback = true; }],
  ["acceso con facturación API", "policy", (v) => { v.accessType = "paid-api"; }],
  ["aumento de rondas", "policy", (v) => { v.maxCorrectionRounds = 3; }],
  ["política sin prioridades", "policy", (v) => { v.routes[0].priorities = []; }],
  ["prioridad negativa", "policy", (v) => { v.routes[0].priorities[0].rank = -1; }],
  ["prioridad como texto", "policy", (v) => { v.routes[0].priorities[0].rank = "10"; }],
  ["vigencia ilimitada", "policy", (v) => { v.availabilityMaxAgeSeconds = 999999999; }],
  ["solicitud sin identidad", "request", (v) => { delete v.taskId; }],
  ["modo desconocido", "request", (v) => { v.mode = "auto"; }],
  ["ejecutor en tutor", "request", (v) => { v.role = "executor"; }],
  ["escritor automático en tutor", "request", (v) => { v.authorizationContext.activeWriter = "authorized-executor"; }],
  ["escritura permitida en tutor", "request", (v) => { v.authorizationContext.allowedActions.push("apply"); }],
  ["alcance vacío", "request", (v) => { v.authorizationContext.scopeRefs = []; }],
  ["tercera ronda", "request", (v) => { v.history.correctionRound = 3; }],
  ["ejecuciones negativas", "request", (v) => { v.history.executionsUsed = -1; }],
  ["historial con contador fraccionario", "request", (v) => { v.history.durationUsedSeconds = 1.5; }],
  ["cuenta privada incrustada", "request", (v) => { v.availability[0].email = "demo@example.invalid"; }],
  ["procedencia sin declarar", "request", (v) => { delete v.availability[0].provenance; }],
  ["escalada sin evidencia", "request", (v) => { v.escalation = { reason: "quality", evidenceRefs: [] }; }],
  ["escalada de calidad sin criterio", "request", (v) => { v.escalation = { reason: "quality", evidenceRefs: ["demo-review"] }; }],
  ["fecha sin zona", "request", (v) => { v.evaluationTime = "2026-10-02T14:00:00"; }],
  ["día imposible", "request", (v) => { v.evaluationTime = "2026-02-29T14:00:00Z"; }],
  ["hora imposible", "request", (v) => { v.evaluationTime = "2026-10-02T25:00:00Z"; }],
  ["fecha con fracciones fuera del contrato", "request", (v) => { v.evaluationTime = "2026-10-02T14:00:00.123Z"; }]
];

for (const [name, kind, mutate] of rejectedCases) {
  test(`contrato: rechaza ${name}`, () => { check(kind, mutate, false); });
}

const acceptedCases = [
  ["candidato sin evaluaciones", "catalog", (v) => {
    v.profiles[0].status = "candidate";
    v.profiles[0].evaluations = [];
  }],
  ["contexto desconocido explícito", "catalog", (v) => {
    v.profiles[0].verifiedCapabilities.maxContextTokens = null;
  }],
  ["alias deliberado sin latest", "catalog", (v) => {
    v.profiles[0].versionPolicy = "approved-alias";
    v.profiles[0].requestedModel = "example-light";
  }],
  ["inventario vacío sin asumir acceso", "request", (v) => { v.availability = []; }],
  ["solicitud incompleta para needs-info", "request", (v) => {
    for (const key of ["client", "provider", "category", "difficulty", "risk", "requirements", "authorizationContext", "history", "availability"]) delete v[key];
  }],
  ["requiere información sobre herramientas", "request", (v) => { delete v.requirements.tools; }],
  ["requisitos vacíos para needs-info", "request", (v) => { v.requirements = {}; }],
  ["elección explícita estructural", "request", (v) => { v.explicitProfileId = "demo-light"; }],
  ["escalada con criterio y evidencia", "request", (v) => {
    v.history.previousProfileId = "demo-light";
    v.escalation = { reason: "quality", evidenceRefs: ["demo-review"], failedCriteria: ["ca-01"] };
  }],
  ["fallo de cuota como dato, no aprobación de escalada", "request", (v) => {
    v.escalation = { reason: "quota", evidenceRefs: ["demo-quota-error"] };
  }],
  ["aplicación autónoma declarada", "request", (v) => {
    v.mode = "autonomous";
    v.role = "executor";
    v.category = "application";
    v.authorizationContext.activeWriter = "authorized-executor";
    v.authorizationContext.allowedActions = ["read", "apply", "verify"];
  }]
];

for (const [name, kind, mutate] of acceptedCases) {
  test(`contrato: admite ${name} sin afirmar recomendación`, () => {
    check(kind, mutate, true);
  });
}

test("contrato: documenta que IDs duplicados requieren validación semántica", () => {
  check("catalog", (v) => {
    v.profiles[1].profileId = v.profiles[0].profileId;
  }, true);
});

test("contrato: una referencia inexistente es estructural, no una selección válida", () => {
  check("policy", (v) => {
    v.routes[0].priorities[0].profileId = "nonexistent-profile";
  }, true);
});
