import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import fsPromises from "node:fs/promises";
import childProcess from "node:child_process";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import crypto from "node:crypto";
import { performance } from "node:perf_hooks";
import Ajv2020 from "ajv/dist/2020.js";
import { createClientNativeEvaluator } from "../src/client-native-evaluation.js";
import { CONTROLS, EFFECTS, hash } from "../src/client-runtime-core.js";

const schema = JSON.parse(fs.readFileSync(new URL("../schemas/agent-client-native-evaluation.schema.json", import.meta.url), "utf8"));
const POLICY = { maxEvidenceAgeSeconds: 3600, revokedEvidenceRefs: [] };
const evaluate = createClientNativeEvaluator(schema, POLICY);
const NOW = "2026-10-04T14:00:00Z"; const EXPIRY = "2026-10-04T15:00:00Z";
const ROUTES = [["openai", "codex-cli", "codex-native"], ["anthropic", "claude-code", "claude-native"], ["google", "antigravity-cli", "antigravity-native"]];
const ajv = new Ajv2020({ strict: true }); ajv.addFormat("date-time", true); ajv.addSchema(schema);
const validReport = ajv.compile({ $ref: `${schema.$id}#/$defs/report` });

// All identities, hashes and evidence in this suite are synthetic claims, not client evaluations.
function fixture(route = ROUTES[0]) {
  const [provider, client, variant] = route;
  const artifacts = [{ artifactId: "demo-binary", kind: "binary", sha256: "a".repeat(64) }];
  const binding = { client: { provider, client, variant, clientVersion: "0.0.0-demo" }, platform: "darwin",
    architecture: "arm64", installationId: "demo-installation", artifactSha256: hash(artifacts),
    configSha256: "b".repeat(64), environmentSha256: "c".repeat(64), controlRevision: "r01" };
  const scopeSha256 = hash(binding);
  const assessment = id => ({ status: "locally-tested", source: "installation-test", checkedAt: NOW, expiresAt: EXPIRY, evidenceRef: `demo-${id}`, scopeSha256 });
  return { schemaVersion: "1.0.0", evaluationId: "demo-evaluation", now: NOW, expectedBinding: structuredClone(binding), binding,
    installation: { assessment: assessment("installation"), artifacts },
    controls: CONTROLS.map(controlId => ({ controlId, assessment: assessment(controlId), mechanismId: `demo-${controlId}`,
      positiveEvidenceRef: `positive-${controlId}`, negativeEvidenceRef: `negative-${controlId}` })),
    effects: EFFECTS.map(effectId => ({ effectId, disposition: "allowed", presence: "present", assessment: assessment(effectId),
      authorization: { status: "approved", evidenceRef: `approval-${effectId}`, scopeSha256 } })),
    access: { access: "subscription-session", externalBilling: "disabled", assessment: assessment("access"), billingAssessment: assessment("billing") },
    accounting: { maxCallsPerStart: 2, limitEnforced: true, assessment: assessment("accounting") }, observations: [] };
}
const get = (v, path) => path.split(".").reduce((v, k) => v[k], v);
const set = (v, path, value) => { const keys = path.split("."); const last = keys.pop(); keys.reduce((v, k) => v[k], v)[last] = value; };
function check(f, state, reason, evaluator = evaluate) {
  const r = evaluator(f); assert.equal(r.state, state, JSON.stringify(r)); assert.equal(validReport(r), true);
  if (reason) assert.ok(r.reasons.includes(reason), JSON.stringify(r));
  assert.equal(r.executed, false); assert.equal(r.runtimeReady, false); assert.equal(r.verifiedAdmission, false);
  assert.deepEqual(r.reasons, [...new Set(r.reasons)].sort()); assert.deepEqual(r.missing, [...new Set(r.missing)].sort());
  assert.equal("reservation" in r, false); assert.equal("ticket" in r, false); return r;
}
function rebind(f) {
  f.expectedBinding = structuredClone(f.binding); const scope = hash(f.binding);
  for (const a of assessments(f)) a.scopeSha256 = scope;
  for (const e of f.effects) e.authorization.scopeSha256 = scope;
  return f;
}
function assessments(f) { return [f.installation.assessment, ...f.controls.map(c => c.assessment), ...f.effects.map(e => e.assessment),
  f.access.assessment, f.access.billingAssessment, f.accounting.assessment]; }
const LOCATIONS = ["installation.assessment", "access.assessment", "access.billingAssessment", "accounting.assessment", "controls.0.assessment", "effects.0.assessment"];
function freeze(v) { if (v && typeof v === "object") { for (const item of Object.values(v)) freeze(item); Object.freeze(v); } return v; }

for (const route of ROUTES) test(`NE-01/02: ${route[1]} ready solo describe datos ficticios`, () => {
  const f = fixture(route); const original = structuredClone(f); freeze(f);
  const r = check(f, "ready-for-installation-review", "declared-evidence-only");
  assert.deepEqual(evaluate(f), r); assert.deepEqual(f, original); assert.equal(r.audit.inputSha256, hash(f));
  for (const encoded of [JSON.stringify(f), Buffer.from(JSON.stringify(f)), new Uint8Array(Buffer.from(JSON.stringify(f)))]) {
    assert.deepEqual(evaluate(encoded), r);
  }
});
test("NE-01: contrato mantiene exactamente los controles/efectos C1", () => {
  assert.deepEqual(schema.$defs.controlId.enum, CONTROLS); assert.deepEqual(schema.$defs.effectId.enum, EFFECTS);
});
for (const path of ["installation", "controls", "effects", "access", "accounting", "observations"]) test(`NE-01: falta sección ${path}`, () => {
  const f = fixture(); delete f[path]; const r = check(f, "incomplete", "native-evidence-incomplete"); assert.ok(r.missing.includes(path));
});
for (const id of CONTROLS) test(`NE-01: control faltante ${id}`, () => {
  const f = fixture(); f.controls = f.controls.filter(c => c.controlId !== id);
  assert.ok(check(f, "incomplete").missing.includes(`controls.${id}`));
});
for (const id of EFFECTS) test(`NE-01: efecto faltante ${id}`, () => {
  const f = fixture(); f.effects = f.effects.filter(e => e.effectId !== id);
  assert.ok(check(f, "incomplete").missing.includes(`effects.${id}`));
});
for (const [section, reason] of [["controls", "duplicate-native-control"], ["effects", "duplicate-native-effect"]]) test(`NE-01: duplicados ${section}`, () => {
  const f = fixture(); f[section][1] = structuredClone(f[section][0]); check(f, "invalid", reason);
});
test("NE-01: artefactos duplicados rechazados", () => {
  const f = fixture(); f.installation.artifacts.push(structuredClone(f.installation.artifacts[0])); check(f, "invalid", "duplicate-native-artifact");
});
for (const path of ["client.clientVersion", "platform", "architecture", "installationId", "artifactSha256", "configSha256", "environmentSha256", "controlRevision"]) {
  const value = { "client.clientVersion": "0.0.1-demo", platform: "linux", architecture: "x64", installationId: "other-installation",
    artifactSha256: "d".repeat(64), configSha256: "d".repeat(64), environmentSha256: "d".repeat(64), controlRevision: "r02" }[path];
  test(`NE-03: vinculación diverge ${path}`, () => { const f = fixture(); set(f.expectedBinding, path, value); check(f, "blocked", "native-binding-mismatch"); });
}
test("NE-03: cambiar cliente rompe el vínculo aunque la ruta sea válida", () => {
  const f = fixture(); f.expectedBinding.client = fixture(ROUTES[1]).binding.client; check(f, "blocked", "native-binding-mismatch");
});
test("NE-03: artefactos se contrastan independientemente de expectedBinding", () => {
  const f = fixture(); f.installation.artifacts[0].sha256 = "d".repeat(64); check(f, "blocked", "native-artifact-set-mismatch");
});
test("NE-03: wrapper sin intérprete/paquete no pasa", () => {
  const f = fixture(); f.installation.artifacts[0].kind = "wrapper";
  f.binding.artifactSha256 = hash(f.installation.artifacts); rebind(f); check(f, "blocked", "native-wrapper-dependencies-incomplete");
});
test("NE-03: conjunto wrapper/intérprete/paquete y orden de artefactos", () => {
  const f = fixture(); f.installation.artifacts = [
    { artifactId: "demo-interpreter", kind: "interpreter", sha256: "a".repeat(64) },
    { artifactId: "demo-package", kind: "package", sha256: "b".repeat(64) },
    { artifactId: "demo-wrapper", kind: "wrapper", sha256: "c".repeat(64) }];
  f.binding.artifactSha256 = hash(f.installation.artifacts); rebind(f); check(f, "ready-for-installation-review");
  f.installation.artifacts.reverse(); check(f, "ready-for-installation-review");
});
test("NE-03: solo paquete no acredita ejecutable", () => {
  const f = fixture(); f.installation.artifacts[0].kind = "package";
  f.binding.artifactSha256 = hash(f.installation.artifacts); rebind(f); check(f, "blocked", "native-entry-artifact-missing");
});
for (const path of LOCATIONS) {
  for (const status of ["documented", "pending"]) test(`NE-02: ${path} ${status} no se promueve`, () => {
    const f = fixture(); set(f, `${path}.status`, status); set(f, `${path}.source`, "provider-documentation");
    const original = structuredClone(f); check(f, "incomplete"); assert.deepEqual(f, original);
  });
  test(`NE-02: ${path} rechazo bloquea`, () => { const f = fixture(); set(f, `${path}.status`, "rejected"); check(f, "blocked"); });
  for (const source of ["provider-documentation", "operator-attestation"]) test(`NE-02: ${path} locally-tested con ${source} contradice`, () => {
    const f = fixture(); set(f, `${path}.source`, source); check(f, "blocked");
  });
  for (const [label, key, value] of [["futura", "checkedAt", "2026-10-04T14:00:01Z"], ["vencida", "expiresAt", NOW],
    ["antigua", "checkedAt", "2026-10-04T12:59:59Z"], ["inversa", "expiresAt", "2026-10-04T13:59:59Z"], ["otro scope", "scopeSha256", "d".repeat(64)]]) {
    test(`NE-03: ${path} ${label}`, () => { const f = fixture(); set(f, `${path}.${key}`, value); check(f, "blocked"); });
  }
  test(`NE-03: ${path} revocada por política externa`, () => {
    const f = fixture(); const evaluator = createClientNativeEvaluator(schema, { ...POLICY, revokedEvidenceRefs: [get(f, path).evidenceRef] });
    check(f, "blocked", undefined, evaluator);
  });
}
for (const key of ["mechanismId", "positiveEvidenceRef", "negativeEvidenceRef"]) test(`NE-02: falta ${key} no acredita barrera`, () => {
  const f = fixture(); f.controls[0][key] = null; check(f, "incomplete");
});
for (const key of ["positiveEvidenceRef", "negativeEvidenceRef"]) test(`NE-03: prueba ${key} revocada`, () => {
  const f = fixture(); const evaluator = createClientNativeEvaluator(schema, { ...POLICY, revokedEvidenceRefs: [f.controls[0][key]] });
  check(f, "blocked", undefined, evaluator);
});
for (const id of EFFECTS) {
  for (const disposition of ["rejected", "unknown"]) test(`NE-04: ${id} ${disposition}`, () => {
    const f = fixture(); f.effects.find(e => e.effectId === id).disposition = disposition; check(f, "blocked", `native-effect-unconfirmed:${id}`);
  });
  for (const status of ["pending", "denied"]) test(`NE-04: ${id} permiso ${status}`, () => {
    const f = fixture(); f.effects.find(e => e.effectId === id).authorization.status = status; check(f, "blocked", `native-effect-not-authorized:${id}`);
  });
  test(`NE-04: ${id} presencia desconocida`, () => {
    const f = fixture(); f.effects.find(e => e.effectId === id).presence = "unknown"; check(f, "blocked");
  });
  test(`NE-04: ${id} ausencia declarada no activa el efecto`, () => {
    const f = fixture(); f.effects.find(e => e.effectId === id).presence = "absent";
    check(f, ["native-auth", "provider-inference"].includes(id) ? "blocked" : "ready-for-installation-review");
  });
  test(`NE-04: ${id} autorización de otra instalación`, () => {
    const f = fixture(); f.effects.find(e => e.effectId === id).authorization.scopeSha256 = "d".repeat(64); check(f, "blocked");
  });
  test(`NE-04: ${id} autorización revocada`, () => {
    const f = fixture(); const evaluator = createClientNativeEvaluator(schema, { ...POLICY, revokedEvidenceRefs: [`approval-${id}`] });
    check(f, "blocked", undefined, evaluator);
  });
  test(`NE-04: ${id} aprobación sin evidencia`, () => {
    const f = fixture(); f.effects.find(e => e.effectId === id).authorization.evidenceRef = null; check(f, "blocked");
  });
}
for (const [path, value] of [["access.access", "api-key"], ["access.access", "unknown"], ["access.externalBilling", "enabled"],
  ["access.externalBilling", "unknown"], ["accounting.maxCallsPerStart", null], ["accounting.limitEnforced", false]]) test(`NE-04: bloquea ${path}=${value}`, () => {
  const f = fixture(); set(f, path, value); check(f, "blocked");
});
for (const observation of schema.$defs.input.properties.observations.items.enum) test(`NE-03/04: limitación ${observation}`, () => {
  const f = fixture(); f.observations.push(observation); check(f, "blocked", `native-unresolved:${observation}`);
});
test("NE-01: precedencia estructura > bloqueo > incompleto", () => {
  const f = fixture(); delete f.controls; f.access.access = "unknown"; check(f, "blocked");
  f.extra = "private-sentinel"; const r = check(f, "invalid"); assert.equal(JSON.stringify(r).includes("private-sentinel"), false);
});
test("NE-03: edad máxima externa tiene límite inclusivo y vencimiento exclusivo", () => {
  const f = fixture(); for (const a of assessments(f)) a.checkedAt = "2026-10-04T13:00:00Z"; check(f, "ready-for-installation-review");
  f.now = "2026-10-04T14:00:01Z"; check(f, "blocked");
  const g = fixture(); g.now = EXPIRY; check(g, "blocked");
});
test("NE-03: construcción copia política y esquema, no dependen de mutación posterior", () => {
  const policy = structuredClone(POLICY); const contract = structuredClone(schema); const evaluator = createClientNativeEvaluator(contract, policy);
  policy.revokedEvidenceRefs.push("demo-installation"); policy.maxEvidenceAgeSeconds = 1; contract.$defs.input.required.push("extra");
  check(fixture(), "ready-for-installation-review", undefined, evaluator);
});
for (const policy of [null, {}, { ...POLICY, maxEvidenceAgeSeconds: "3600" }, { ...POLICY, maxEvidenceAgeSeconds: 0 },
  { ...POLICY, revokedEvidenceRefs: ["same", "same"] }, { ...POLICY, revokedEvidenceRefs: Array(257).fill("demo") }, { ...POLICY, extra: true }]) {
  test(`NE-01: política inválida ${JSON.stringify(policy).slice(0, 100)}`, () => { assert.throws(() => createClientNativeEvaluator(schema, policy)); });
}
for (const [path, value] of [["schemaVersion", "2.0.0"], ["now", "2026-02-30T14:00:00Z"], ["now", "2026-10-04T14:00:00.001Z"],
  ["binding.platform", "other"], ["binding.client.provider", "google"], ["binding.client.clientVersion", "latest"],
  ["binding.artifactSha256", "A".repeat(64)], ["accounting.maxCallsPerStart", 0], ["accounting.maxCallsPerStart", 1.5],
  ["accounting.maxCallsPerStart", 1000001], ["accounting.maxCallsPerStart", "2"], ["controls.0.controlId", "tools-please"],
  ["effects.0.effectId", "secret-io"], ["observations", ["arbitrary-error"]], ["observations", ["internal-calls-unknown", "internal-calls-unknown"]]]) {
  test(`NE-01: valor inválido ${path}=${JSON.stringify(value)}`, () => { const f = fixture(); set(f, path, value); check(f, "invalid"); });
}
for (const section of ["", "binding", "binding.client", "installation", "installation.artifacts.0", "controls.0", "effects.0", "effects.0.authorization", "access", "accounting"]) {
  test(`NE-01/06: campo inesperado en ${section || "root"} no filtra`, () => {
    const f = fixture(); (section ? get(f, section) : f).extra = "secret-sentinel";
    assert.equal(JSON.stringify(check(f, "invalid")).includes("secret-sentinel"), false);
  });
}
for (const value of [null, true, false, 1, "null", "[]", "{}", undefined, () => {}, 1n, NaN, Infinity, Symbol("sentinel"), new Date(0)]) {
  test(`NE-01/06: raíz inválida ${typeof value} ${String(value)}`, () => { check(value, "invalid"); });
}
test("NE-01/06: getters/toJSON/proxies no se ejecutan", () => {
  let invoked = 0; const f = fixture(); Object.defineProperty(f, "extra", { enumerable: true, get() { invoked++; throw Error("secret-sentinel"); } });
  check(f, "invalid"); const g = fixture(); g.toJSON = () => { invoked++; return fixture(); }; check(g, "invalid");
  const proxy = new Proxy(fixture(), { get() { invoked++; throw Error("secret-sentinel"); }, ownKeys() { invoked++; throw Error("secret-sentinel"); } });
  check(proxy, "invalid"); assert.equal(invoked, 0);
});
test("NE-01/06: ciclo, prototipo, símbolos, arrays huecos y propiedades ocultas", () => {
  const a = fixture(); a.extra = a; check(a, "invalid");
  const b = fixture(); Object.setPrototypeOf(b, { secret: true }); check(b, "invalid");
  const c = fixture(); c[Symbol("secret")] = true; check(c, "invalid");
  const d = fixture(); d.controls = Array(11); check(d, "invalid");
  const e = fixture(); Object.defineProperty(e, "hidden", { value: "secret" }); check(e, "invalid");
});
for (const input of ['{"schemaVersion":"1.0.0","schemaVersion":"1.0.0"}', '{"nested":{"a":1,"\\u0061":2}}', '{"__proto__":{}}',
  '{"nested":{"constructor":{}}}', '{"nested":{"prototype":{}}}', '{"s":"\\ud800"}', '{"n":1e999}', '{"n":1e-999}', '{}{}', '{"x":1,}', '\uFEFF{}']) {
  test(`NE-01/06: JSON adverso ${input}`, () => { check(input, "invalid"); });
}
test("NE-01/06: límites de bytes, profundidad y arrays", () => {
  check("x".repeat(131073), "invalid"); const a = fixture(); a.extra = "x".repeat(131073); check(a, "invalid");
  check(Buffer.from([0xff]), "invalid"); check(new DataView(new ArrayBuffer(1)), "invalid");
  const b = fixture(); b.extra = Array(257).fill(1); check(b, "invalid");
  const c = fixture(); let node = c; for (let i = 0; i < 66; i++) { node.extra = {}; node = node.extra; } check(c, "invalid");
  check('{"extra":' + '['.repeat(66) + '0' + ']'.repeat(66) + '}', "invalid");
});
test("NE-02/05: orden de campos estable; respuestas sin datos privados o permisos", () => {
  const f = fixture(); const reversed = Object.fromEntries(Object.entries(f).reverse());
  assert.deepEqual(check(reversed, "ready-for-installation-review"), evaluate(f));
  const r = evaluate(f); const text = JSON.stringify(r);
  for (const forbidden of ["demo-binary", "positive-no-tools", "approval-native-auth", "subscription-session", "clientVersion", "artifacts"]) assert.equal(text.includes(forbidden), false);
  r.reasons.push("caller-mutation"); assert.deepEqual(evaluate(f).reasons, ["declared-evidence-only"]);
});
test("NE-06: evaluación y construcción no hacen IO, procesos, red, reloj actual o azar", () => {
  const f = fixture(); const text = JSON.stringify(f); const restorers = []; let calls = 0;
  const guard = (object, key) => {
    const descriptor = Object.getOwnPropertyDescriptor(object, key);
    if (!descriptor || typeof descriptor.value !== "function" || !descriptor.configurable) return;
    Object.defineProperty(object, key, { ...descriptor, value() { calls++; throw Error(`Unexpected effect: ${key}`); } });
    restorers.push(() => Object.defineProperty(object, key, descriptor));
  };
  try {
    for (const object of [fs, fsPromises]) for (const key of Object.keys(object)) if (!/^[A-Z]/.test(key)) guard(object, key);
    for (const key of ["spawn", "spawnSync", "exec", "execSync", "execFile", "execFileSync", "fork"]) guard(childProcess, key);
    for (const object of [http, https]) for (const key of ["request", "get"]) guard(object, key);
    for (const key of ["connect", "createConnection", "createServer"]) guard(net, key);
    for (const key of ["randomBytes", "randomFill", "randomFillSync", "randomUUID", "randomInt"]) guard(crypto, key);
    for (const key of ["fetch", "setTimeout", "setInterval", "setImmediate"]) guard(globalThis, key);
    guard(Date, "now"); guard(Math, "random"); guard(process, "hrtime"); guard(performance, "now");
    const NativeDate = globalThis.Date;
    globalThis.Date = new Proxy(NativeDate, {
      construct(target, args) { if (!args.length) { calls++; throw Error("Current clock forbidden"); } return Reflect.construct(target, args); },
      apply() { calls++; throw Error("Current clock forbidden"); }
    });
    restorers.push(() => { globalThis.Date = NativeDate; });
    const evaluator = createClientNativeEvaluator(schema, POLICY);
    assert.equal(evaluator(f).state, "ready-for-installation-review");
    assert.equal(evaluator(text).state, "ready-for-installation-review");
    assert.equal(evaluator({}).state, "invalid"); assert.equal(calls, 0);
  } finally { restorers.reverse().forEach(restore => restore()); }
});
test("NE-01/06: proxy revocado, byte arrays alterados y schema inválido", () => {
  const { proxy, revoke } = Proxy.revocable({}, {}); revoke(); check(proxy, "invalid");
  class CustomBytes extends Uint8Array {} check(new CustomBytes([123, 125]), "invalid");
  for (const contract of [null, {}, { ...schema, $id: "other" }]) assert.throws(() => createClientNativeEvaluator(contract, POLICY));
});
test("NE-06: número de nodos, Unicode multibyte y caracteres de control acotados", () => {
  const a = fixture(); a.extra = "🙂".repeat(40000); check(a, "invalid");
  const b = fixture(); b.extra = Object.fromEntries(Array.from({ length: 30001 }, (_, i) => [`k${i}`, 1])); check(b, "invalid");
  check('{"s":"a\nb"}', "invalid");
});
test("NE-03: omitir todas las matrices y tener bloqueo sigue explicando faltantes", () => {
  const f = fixture(); f.controls = []; f.effects = []; f.binding.configSha256 = "d".repeat(64);
  const r = check(f, "blocked", "native-binding-mismatch"); assert.equal(r.missing.length, CONTROLS.length + EFFECTS.length);
});
