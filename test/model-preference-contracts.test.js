import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import Ajv2020 from "ajv/dist/2020.js";

const read = (path) => JSON.parse(fs.readFileSync(new URL(path, import.meta.url), "utf8"));
const baseSchema = read("../schemas/agent-model-selection.schema.json");
const schema = read("../schemas/agent-model-preference.schema.json");
const examples = Object.fromEntries(["catalog", "policy", "request"].map((kind) =>
  [kind, read(`../examples/model-selection/${kind}.preference.example.json`)]));
const ajv = new Ajv2020({ strict: true, allErrors: true });
ajv.addFormat("date-time", {
  type: "string",
  validate(value) {
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(value)) return false;
    const time = Date.parse(value);
    return Number.isFinite(time) && new Date(time).toISOString() === value.replace(/Z$/, ".000Z");
  }
});
// Both schemas are packaged, trusted data. No loadSchema or asynchronous fetch.
ajv.addSchema(baseSchema);
const validate = ajv.compile(schema);
function check(kind, mutate, expected) {
  const value = structuredClone(examples[kind]);
  mutate(value);
  const before = JSON.stringify(value);
  assert.equal(validate(value), expected, JSON.stringify(validate.errors));
  assert.equal(JSON.stringify(value), before, "La validación no transforma datos");
}
const family = (v) => v.routes[0].families[0];
const rule = (v) => family(v).effortRules[0];
const option = (v) => rule(v).options[0];

for (const kind of Object.keys(examples)) {
  test(`contrato v2: acepta ${kind} ficticio sin mutarlo`, () => check(kind, () => {}, true));
  test(`contrato v2: rechaza propiedad desconocida en ${kind}`, () => check(kind, (v) => { v.unknown = true; }, false));
  test(`contrato v2: rechaza versión anterior en ${kind}`, () => check(kind, (v) => { v.schemaVersion = "1.0.0"; }, false));
  test(`contrato v2: rechaza versión futura en ${kind}`, () => check(kind, (v) => { v.schemaVersion = "3.0.0"; }, false));
}

const rejected = [
  ["perfil sin familia", "catalog", (v) => { delete v.profiles[0].familyId; }],
  ["perfil sin ordinal", "catalog", (v) => { delete v.profiles[0].versionOrdinal; }],
  ["ordinal fraccionario", "catalog", (v) => { v.profiles[0].versionOrdinal = 1.5; }],
  ["ordinal negativo", "catalog", (v) => { v.profiles[0].versionOrdinal = -1; }],
  ["ordinal como etiqueta", "catalog", (v) => { v.profiles[0].versionOrdinal = "2.0"; }],
  ["ordinal sin límite", "catalog", (v) => { v.profiles[0].versionOrdinal = 1000001; }],
  ["versión sin evidencia", "catalog", (v) => { v.profiles[0].versionEvidenceRefs = []; }],
  ["evaluación sin esfuerzo", "catalog", (v) => { delete v.profiles[0].evaluations[0].effort; }],
  ["evaluación sin evidencia", "catalog", (v) => { v.profiles[0].evaluations[0].evidenceRefs = []; }],
  ["perfil aprobado sin evaluaciones", "catalog", (v) => { v.profiles[0].evaluations = []; }],
  ["alias latest", "catalog", (v) => { v.profiles[0].requestedModel = "example-latest"; }],
  ["argumentos de shell", "catalog", (v) => { v.profiles[0].requestedModel = "example; echo test"; }],
  ["campo de cuenta en perfil", "catalog", (v) => { v.profiles[0].email = "demo@example.invalid"; }],
  ["prioridades antiguas", "policy", (v) => { v.routes[0].priorities = []; }],
  ["ruta sin familias", "policy", (v) => { v.routes[0].families = []; }],
  ["familia sin perfiles", "policy", (v) => { family(v).profileIds = []; }],
  ["familia con perfiles repetidos", "policy", (v) => { family(v).profileIds.push(family(v).profileIds[0]); }],
  ["familia sin evidencia", "policy", (v) => { family(v).evidenceRefs = []; }],
  ["familia con campo desconocido", "policy", (v) => { family(v).automatic = true; }],
  ["rango de familia negativo", "policy", (v) => { family(v).rank = -1; }],
  ["regla sin evidencia", "policy", (v) => { rule(v).evidenceRefs = []; }],
  ["regla comodín", "policy", (v) => { rule(v).difficulty = "*"; }],
  ["regla sin opciones", "policy", (v) => { rule(v).options = []; }],
  ["regla con opciones repetidas", "policy", (v) => { rule(v).options.push(structuredClone(option(v))); }],
  ["opción sin esfuerzo explícito", "policy", (v) => { delete option(v).effort; }],
  ["opción sin evidencia", "policy", (v) => { option(v).evidenceRefs = []; }],
  ["progresión negativa", "policy", (v) => { option(v).progressionRank = -1; }],
  ["orden de esfuerzo fraccionario", "policy", (v) => { option(v).effortRank = 0.5; }],
  ["opción con campo desconocido", "policy", (v) => { option(v).force = true; }],
  ["techo excesivo", "policy", (v) => { rule(v).maxEffortRank = 10001; }],
  ["política ejecutora", "policy", (v) => { v.execution = "execute"; }],
  ["API de pago", "policy", (v) => { v.accessType = "paid-api"; }],
  ["cambio de proveedor", "policy", (v) => { v.allowProviderSwitch = true; }],
  ["fallback implícito", "policy", (v) => { v.allowImplicitFallback = true; }],
  ["tercera ronda", "policy", (v) => { v.maxCorrectionRounds = 3; }],
  ["esfuerzo explícito inválido", "request", (v) => { v.explicitEffort = 2; }],
  ["esfuerzo previo inválido", "request", (v) => { v.history.previousEffort = []; }],
  ["contador negativo", "request", (v) => { v.history.executionsUsed = -1; }],
  ["historial con campo desconocido", "request", (v) => { v.history.reset = true; }],
  ["ejecutor en tutor", "request", (v) => { v.role = "executor"; }],
  ["escritura automática en tutor", "request", (v) => { v.authorizationContext.activeWriter = "authorized-executor"; }],
  ["aplicación en tutor", "request", (v) => { v.authorizationContext.allowedActions.push("apply"); }],
  ["fecha imposible", "request", (v) => { v.evaluationTime = "2026-02-30T14:00:00Z"; }],
  ["fecha sin zona", "request", (v) => { v.evaluationTime = "2026-10-02T14:00:00"; }],
  ["inventario con identidad privada", "request", (v) => { v.availability[0].email = "demo@example.invalid"; }],
  ["escalamiento de calidad sin criterio", "request", (v) => { v.escalation = { reason: "quality", evidenceRefs: ["demo-review"] }; }]
];
for (const [name, kind, mutate] of rejected) {
  test(`contrato v2: rechaza ${name}`, () => check(kind, mutate, false));
}
const accepted = [
  ["ordinal desconocido como dato, no admisibilidad", "catalog", (v) => { v.profiles[0].versionOrdinal = null; }],
  ["candidato sin evaluación", "catalog", (v) => { v.profiles[0].status = "candidate"; v.profiles[0].evaluations = []; }],
  ["esfuerzo default explícito", "catalog", (v) => {
    v.profiles[0].effortOptions = [];
    v.profiles[0].evaluations = [{ ...v.profiles[0].evaluations[0], effort: null }];
  }],
  ["familia sin regla todavía", "policy", (v) => { family(v).effortRules = []; }],
  ["opción default explícita", "policy", (v) => { option(v).effort = null; }],
  ["referencia que requiere validación semántica", "policy", (v) => { option(v).profileId = "unknown-profile"; }],
  ["solicitud incompleta", "request", (v) => { delete v.requirements; delete v.provider; }],
  ["inventario vacío", "request", (v) => { v.availability = []; }],
  ["elección explícita default", "request", (v) => { v.explicitProfileId = "demo-light-new"; v.explicitEffort = null; }],
  ["historial con default previo", "request", (v) => { v.history.previousProfileId = "demo-light-new"; v.history.previousEffort = null; v.history.executionsUsed = 1; }],
  ["autónomo declarado, no ejecutado", "request", (v) => {
    v.mode = "autonomous"; v.role = "executor"; v.category = "application";
    v.authorizationContext.activeWriter = "authorized-executor";
    v.authorizationContext.allowedActions = ["read", "apply", "verify"];
  }]
];
for (const [name, kind, mutate] of accepted) {
  test(`contrato v2: admite ${name} sin recomendar todavía`, () => check(kind, mutate, true));
}
