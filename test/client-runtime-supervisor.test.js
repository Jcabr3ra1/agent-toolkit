import { supported } from "../testing/client-posix.js";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import test from "node:test";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import Ajv2020 from "ajv/dist/2020.js";
import { hash } from "../src/client-runtime-core.js";
import { claimFixturePermit, createFixturePermit, revokeFixturePermit } from "../src/client-runtime-fixture-permit.js";
import { createFixtureProtocol } from "../src/client-runtime-fixture-protocol.js";
import { superviseFixture, FIXTURES } from "../src/client-runtime-supervisor.js";
import { createFixtureCoordinator } from "../src/client-runtime-coordinator.js";
import { fixtureSchema, allSchemas, coordinator, request, bind, initialized, taskDirectory, limits } from "../testing/runtime-supervisor/setup.js";
import { store, apply, config, NOW } from "../testing/runtime-store/fixture.js";

const localTest = (name, fn) => test(name, { skip: supported ? false : "Requires POSIX uid/modes and process-group termination for the runtime integration fixture.", timeout: 20000 }, fn);
async function setup(t) {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "agent-fixture-test-")));
  await fs.chmod(root, 0o700); const owned = await fs.lstat(root);
  t.after(async () => {
    const s = await fs.lstat(root).catch(() => null);
    if (s?.dev === owned.dev && s?.ino === owned.ino && s.isDirectory()) await fs.rm(root, { recursive: true });
  });
  await initialized(root); return root;
}
async function ledger(root) { return JSON.parse(await fs.readFile(path.join(taskDirectory(root), "ledger.json"), "utf8")).ledger; }
function check(r) {
  assert.equal(r.scope, "fixture-only"); assert.equal(r.nativeExecuted, false); assert.equal(r.runtimeReady, false);
  assert.equal(r.verifiedAdmission, false); assert.equal(r.modelCalls, 0);
  assert.doesNotMatch(JSON.stringify(r), /fixture-private|do-not-run|write\.lock|agent-fixture-test|\/Users\/|NODE_OPTIONS/);
  return r;
}

test("C2-07: handles falsificados, serializados y revocados no se consumen", async () => {
  for (const fake of [null, {}, { state: "committed", durability: "confirmed" }]) await assert.rejects(claimFixturePermit(fake));
  const h = createFixturePermit(async () => {}, async () => {});
  await assert.rejects(claimFixturePermit(JSON.parse(JSON.stringify(h)))); revokeFixturePermit(h); await assert.rejects(claimFixturePermit(h));
});
test("C2-07: dos consumidores simultáneos, solo uno reclama el handle", async () => {
  let checks = 0; const h = createFixturePermit(async () => { checks++; await new Promise(r => setTimeout(r, 10)); }, async () => {});
  const results = await Promise.allSettled([claimFixturePermit(h), claimFixturePermit(h)]);
  assert.equal(results.filter(r => r.status === "fulfilled").length, 1); assert.equal(checks, 1);
  await assert.rejects(claimFixturePermit(h)); revokeFixturePermit(h);
});
test("C2-07: check fallido no devuelve un permiso ya consumido", async () => {
  let calls = 0; const h = createFixturePermit(async () => { calls++; throw Error("denied"); }, async () => {});
  await assert.rejects(claimFixturePermit(h)); await assert.rejects(claimFixturePermit(h)); assert.equal(calls, 1);
});
test("C2-09: UTF-8 y CRLF en todos los puntos de corte", () => {
  const b = Buffer.from('{"v":1,"type":"start"}\r\n{"v":1,"type":"data","text":"á🐣"}\r\n{"v":1,"type":"end","ok":true}\r\n');
  for (let i = 1; i < b.length; i++) { const p = createFixtureProtocol(limits()); p.push(b.subarray(0, i)); p.push(b.subarray(i)); p.finish(); assert.equal(p.counts().events, 3); }
});
for (const [name, data, code] of [
  ["evento desconocido", '{"v":1,"type":"tool"}\n', "fixture-forbidden-event"],
  ["fin antes de inicio", '{"v":1,"type":"end","ok":true}\n', "fixture-forbidden-event"],
  ["inicio duplicado", '{"v":1,"type":"start"}\n{"v":1,"type":"start"}\n', "fixture-forbidden-event"],
  ["claves duplicadas", '{"v":1,"v":1,"type":"start"}\n', "duplicate-json-key"],
  ["metadata extra", '{"v":1,"type":"start","command":"x"}\n', "fixture-forbidden-event"],
  ["UTF-8 inválido", Buffer.from([0xff, 10]), "invalid-utf8"],
  ["salida después de final", '{"v":1,"type":"start"}\n{"v":1,"type":"end","ok":true}\n{}\n', "fixture-after-terminal"]
]) test(`C2-09: protocolo rechaza ${name}`, () => {
  assert.throws(() => createFixtureProtocol(limits()).push(Buffer.from(data)), e => e.code === code);
});
test("C2-09: línea y salida limitadas antes de acumular", () => {
  const p = createFixtureProtocol({ ...limits(), maxLineBytes: 10 }); assert.throws(() => p.push(Buffer.alloc(11)), /fixture-line-limit/);
  const q = createFixtureProtocol({ ...limits(), maxOutputBytes: 10 }); assert.throws(() => q.push(Buffer.alloc(11)), /fixture-output-limit/);
  assert.equal(p.counts().retainedLineBytes, 0); assert.equal(q.counts().retainedLineBytes, 0);
});
test("C2-09: una línea sin newline y un final ausente no son éxito", () => {
  const p = createFixtureProtocol(limits()); p.push(Buffer.from('{"v":1,"type":"start"}')); assert.throws(() => p.finish(), /fixture-unterminated-line/);
  const q = createFixtureProtocol(limits()); q.push(Buffer.from('{"v":1,"type":"start"}\n')); assert.throws(() => q.finish(), /fixture-incomplete-protocol/);
});
test("C2-12: registro de fixtures coincide con contrato cerrado", () => assert.deepEqual(FIXTURES, fixtureSchema.$defs.request.properties.fixtureId.enum));

for (const mode of ["success", "split-utf8", "environment"]) localTest(`C2-07/08/12: ${mode}, reserva durable y cierre conciliado`, async t => {
  const root = await setup(t); let spawns = 0; const q = request(root, mode); const before = structuredClone(q);
  const r = check(await coordinator(root, { supervisor: { spawn: (...args) => {
    spawns++; assert.equal(args[2].shell, false); assert.equal(args[2].detached, true);
    assert.deepEqual(args[2].env, { LANG: "C", LC_ALL: "C" }); assert.equal(args[2].stdio.length, 3);
    return spawn(...args);
  }, checkpoint: async name => { if (name === "fixture-before-claim") {
    const d = await ledger(root); assert.equal(d.attempts[0].state, "reserved");
    assert.ok(await fs.lstat(path.join(taskDirectory(root), "write.lock")));
    assert.equal((await store(root)(apply(root))).state, "blocked");
  } } } })(q));
  assert.deepEqual(q, before); assert.equal(spawns, 1); assert.equal(r.state, "completed", JSON.stringify(r));
  assert.equal(r.storage.state, "committed"); assert.equal(r.process.terminationConfirmed, true); assert.equal(r.process.groupObservation, "absent");
  const l = await ledger(root); assert.equal(l.attempts.length, 1); assert.equal(l.attempts[0].actualCalls, 0); assert.equal(l.attempts[0].state, "settled");
  assert.equal(l.mainStartsUsed, 1); assert.equal(l.history.executionsUsed, 0); assert.ok(l.history.durationUsedSeconds >= 1);
  assert.deepEqual(await fs.readdir(taskDirectory(root)), ["ledger.json"]);
  const again = check(await coordinator(root)(q)); assert.equal(again.state, "not-started"); assert.equal(again.fixtureExecuted, false);
});
const invalidRequests = [
  ["ruta arbitraria", q => { q.script = "/do-not-run"; }, "fixture-invalid-request"], ["cliente real", q => { q.fixtureId = "codex"; }, "fixture-invalid-request"],
  ["shell", q => { q.command = "do-not-run"; }, "fixture-invalid-request"], ["tipo coercible", q => { q.limits.timeoutMs = "3000"; }, "fixture-invalid-request"],
  ["permiso denegado", q => { q.authorization.status = "denied"; }, "fixture-not-authorized"], ["permiso revocado", q => { q.authorization.revoked = true; }, "fixture-not-authorized"],
  ["permiso expirado", q => { q.authorization.expiresAt = q.authorization.checkedAt; }, "fixture-not-authorized"], ["otra fixture", q => { q.authorization.fixtureId = "silent"; }, "fixture-not-authorized"],
  ["otro intento", q => { q.authorization.attemptId = "other"; }, "fixture-not-authorized"], ["otra identidad", q => { q.authorization.identity = { ...q.authorization.identity, taskId: "other" }; }, "fixture-not-authorized"],
  ["otra raíz", q => { q.authorization.rootSha256 = "c".repeat(64); }, "fixture-not-authorized"], ["otros límites", q => { q.authorization.limitsSha256 = "c".repeat(64); }, "fixture-not-authorized"],
  ["sin conciliación", q => { q.authorization.reconciliationApproved = false; }, "fixture-not-authorized"], ["sin reserva", q => { q.reservation.operation = "read"; delete q.reservation.transition; }, "fixture-reservation-required"],
  ["gracia fuera del plazo", q => { q.limits.timeoutMs = 3000; q.limits.graceMs = 1000; q.limits.confirmationMs = 2000; bind(q); }, "fixture-incompatible-limits"],
  ["input bytes", q => { q.limits.maxInputBytes = 1; bind(q); }, "byte-limit"], ["unicode inválido", q => { q.inputText = "\ud800"; }, "invalid-unicode"],
  ["getter", (q, hook) => Object.defineProperty(q, "secret", { enumerable: true, get: hook }), "non-json-metadata"],
  ["proxy", (q, hook) => { q.authorization = new Proxy(q.authorization, { ownKeys: hook, getPrototypeOf: hook, get: hook }); }, "non-json-metadata"],
  ["cycle", q => { q.extra = q; }, "non-json-metadata"]
];
function validationHarness() {
  const root = path.resolve(os.tmpdir(), "fixture-coordinator-validation-only"), cfg = config(root);
  // Inert deployment declaration for validation only, never native admission.
  cfg.evaluation.platform = "linux";
  const counts = { io: 0, spawn: 0 };
  const io = Object.fromEntries(Object.keys(fs).map(key => [key, () => { counts.io++; throw Error("unexpected IO"); }]));
  const run = createFixtureCoordinator(...allSchemas, cfg, { store: { clock: () => Date.parse(NOW), io },
    supervisor: { spawn() { counts.spawn++; throw Error("unexpected spawn"); } } });
  assert.equal(typeof run, "function");
  const ajv = new Ajv2020({ strict: true, allErrors: true }); ajv.addFormat("date-time", () => true); allSchemas.forEach(s => ajv.addSchema(s));
  const validate = ajv.compile({ $ref: `${fixtureSchema.$id}#/$defs/request` });
  assert.equal(validate(request(root)), true, JSON.stringify(validate.errors));
  return { root, counts, run };
}
function checkUnstarted(r, reason) {
  check(r); assert.equal(r.state, "not-started"); assert.equal(r.fixtureExecuted, false);
  assert.equal(r.storage, null); assert.equal(r.process, null); assert.deepEqual(r.reasons, [reason]);
}
for (const [name, change, reason] of invalidRequests) test(`C2-07/12: ${name} no reserva ni inicia`, { timeout: 20000 }, async () => {
  const { root, counts, run } = validationHarness(); let hooks = 0;
  const q = request(root); change(q, () => { hooks++; throw Error("must not call"); });
  checkUnstarted(await run(q), reason); assert.deepEqual(counts, { io: 0, spawn: 0 }); assert.equal(hooks, 0);
});
localTest("C2-07/12: entradas rechazadas conservan el ledger real y sus recursos", async t => {
  const root = await setup(t), file = path.join(taskDirectory(root), "ledger.json"), before = await fs.readFile(file); let spawns = 0;
  const run = coordinator(root, { supervisor: { spawn() { spawns++; throw Error("must not spawn"); } } });
  for (const [name, change, reason] of invalidRequests) {
    let hooks = 0; const q = request(root); change(q, () => { hooks++; throw Error("must not call"); });
    checkUnstarted(await run(q), reason); assert.equal(hooks, 0, name); assert.equal(spawns, 0, name);
    assert.deepEqual(await fs.readFile(file), before, name);
    assert.deepEqual(await fs.readdir(taskDirectory(root)), ["ledger.json"], name);
  }
  // Preserve the original shared-identity adversary too: request() aliases these
  // identities, so this changes the reservation and reaches the store boundary.
  const sharedIdentity = request(root); sharedIdentity.authorization.identity.taskId = "other";
  const r = check(await run(sharedIdentity));
  assert.equal(r.state, "not-started"); assert.equal(r.fixtureExecuted, false); assert.equal(r.process, null); assert.equal(spawns, 0);
  assert.equal(r.storage.state, "blocked"); assert.deepEqual(r.reasons, ["store-transition-identity-mismatch"]);
  assert.deepEqual(await fs.readFile(file), before);
  assert.deepEqual(await fs.readdir(taskDirectory(root)), ["ledger.json"]);
});
for (const [mode, cause] of [
  ["failure", "fixture-exit-or-stderr-invalid"], ["stdout-overflow", "fixture-output-limit"], ["stderr-overflow", "fixture-stderr-limit"],
  ["long-line", "fixture-output-limit"], ["event-overflow", "fixture-event-limit"], ["invalid-utf8", "invalid-utf8"],
  ["forbidden-event", "fixture-forbidden-event"], ["duplicate-json", "duplicate-json-key"], ["after-terminal", "fixture-after-terminal"],
  ["unterminated", "fixture-unterminated-line"], ["incomplete", "fixture-incomplete-protocol"], ["stderr-invalid", "fixture-stderr-invalid-utf8"]
]) localTest(`C2-08/09: cancela o rechaza ${mode}`, async t => {
  const root = await setup(t); const r = check(await coordinator(root)(request(root, mode)));
  assert.equal(r.state, "failed", JSON.stringify(r)); assert.ok(r.reasons.includes(cause), JSON.stringify(r));
  assert.equal(r.process.terminationConfirmed, true); assert.equal(r.storage.state, "committed");
  assert.equal((await ledger(root)).attempts[0].actualCalls, 0);
});
for (const mode of ["silent", "ignore-term", "blocked-stdin"]) localTest(`C2-08: plazo incluye ${mode} y fuerza terminación`, async t => {
  const root = await setup(t); const q = request(root, mode); q.limits.timeoutMs = 2500;
  if (mode === "blocked-stdin") q.inputText = "x".repeat(1048576); bind(q);
  const r = check(await coordinator(root)(q)); assert.equal(r.state, "timed-out", JSON.stringify(r));
  assert.equal(r.process.terminationConfirmed, true); assert.ok(r.process.elapsedMs <= q.limits.timeoutMs);
  assert.equal(r.process.spawnAttempts, 1); assert.equal(r.storage.state, "committed");
});
localTest("C2-08: cancelación humana conserva un único inicio y cero IA", async t => {
  const root = await setup(t); const abort = new AbortController();
  const run = coordinator(root, { supervisor: { checkpoint: name => { if (name === "fixture-spawned") setTimeout(() => abort.abort(), 100); } } });
  const r = check(await run(request(root, "silent"), { signal: abort.signal })); assert.equal(r.state, "canceled", JSON.stringify(r));
  assert.equal(r.process.terminationConfirmed, true); assert.equal((await ledger(root)).mainStartsUsed, 1);
});
localTest("C2-08: cancelación antes de reservar no toca el ledger", async t => {
  const root = await setup(t); const abort = new AbortController(); abort.abort();
  const r = check(await coordinator(root)(request(root), { signal: abort.signal })); assert.equal(r.process, null); assert.equal((await ledger(root)).revision, 0);
});
test("C2-08: cancelación antes de reservar no invoca almacenamiento ni procesos", { timeout: 20000 }, async () => {
  const { root, counts, run } = validationHarness(), abort = new AbortController(); abort.abort();
  checkUnstarted(await run(request(root), { signal: abort.signal }), "fixture-canceled-before-reservation");
  assert.deepEqual(counts, { io: 0, spawn: 0 });
});
for (const mode of ["parent-child", "child-after-parent"]) localTest(`C2-10: ${mode}, no confunde exit del padre con cierre del grupo`, async t => {
  const root = await setup(t); const q = request(root, mode); q.limits.timeoutMs = 2500; bind(q);
  const r = check(await coordinator(root)(q)); assert.ok(["timed-out", "failed"].includes(r.state), JSON.stringify(r));
  assert.equal(r.process.terminationConfirmed, true); assert.equal(r.process.pipesClosed, true); assert.equal(r.process.groupObservation, "absent");
});
localTest("C2-11: falla mark-started después del spawn, cancela y retiene lock", async t => {
  const root = await setup(t); const r = check(await coordinator(root, { store: { checkpoint: name => {
    if (name === "session-mark-started-before-publish") throw Error("fixture-private-disk-failure");
  } } })(request(root, "silent")));
  assert.equal(r.state, "indeterminate"); assert.equal(r.fixtureExecuted, true); assert.equal(r.process.terminationConfirmed, true);
  assert.ok(r.reasons.includes("fixture-mark-started-unconfirmed")); assert.equal(r.storage.cleanup, "intervention-required");
  assert.equal((await ledger(root)).attempts[0].state, "reserved");
  const again = check(await coordinator(root)(request(root))); assert.equal(again.fixtureExecuted, false); assert.equal(again.state, "not-started");
});
localTest("C2-07: sync de reserva fallido impide todo spawn", async t => {
  const root = await setup(t); let spawns = 0;
  const r = check(await coordinator(root, { store: { checkpoint: name => { if (name === "published") throw Error("sync failed"); } },
    supervisor: { spawn: () => { spawns++; throw Error("must not spawn"); } } })(request(root)));
  assert.equal(spawns, 0); assert.equal(r.state, "indeterminate"); assert.equal(r.fixtureExecuted, false);
});
localTest("C2-07: permiso expira tras reservar y no inicia", async t => {
  const root = await setup(t); let now = Date.parse("2026-10-02T14:00:00Z"), spawns = 0;
  const r = check(await coordinator(root, { store: { clock: () => now, checkpoint: name => { if (name === "session-reserved") now += 3600000; } },
    supervisor: { spawn: () => { spawns++; throw Error("must not spawn"); } } })(request(root)));
  assert.equal(spawns, 0); assert.equal(r.state, "indeterminate"); assert.equal((await ledger(root)).attempts[0].state, "reserved");
});
localTest("C2-07: supervisor sin handle no lanza proceso", async t => {
  const root = await setup(t); let calls = 0;
  const r = await superviseFixture({}, request(root), { spawn: () => { calls++; throw Error("must not spawn"); } });
  assert.equal(r.state, "not-started"); assert.equal(r.terminationConfirmed, true); assert.equal(calls, 0);
});
localTest("C2-08: error síncrono de spawn concilia no-start sin devolver otro intento", async t => {
  const root = await setup(t); let calls = 0;
  const r = check(await coordinator(root, { supervisor: { spawn: () => { calls++; throw Error("fixture-private-spawn-error"); } } })(request(root)));
  assert.equal(calls, 1); assert.equal(r.state, "not-started", JSON.stringify(r)); assert.equal(r.storage.state, "committed");
  assert.equal((await ledger(root)).attempts[0].state, "settled"); assert.equal((await ledger(root)).attempts[0].actualCalls, 0);
});
test("C2-07: handle ligado al encargo exacto, no a otro hash o límites", async () => {
  let checks = 0; const h = createFixturePermit(async () => { checks++; }, async () => {}, "a".repeat(64));
  await assert.rejects(claimFixturePermit(h, "b".repeat(64)), /binding-mismatch/);
  await assert.rejects(claimFixturePermit(h, "a".repeat(64))); assert.equal(checks, 0);
});
localTest("C2-09: línea larga falla por bytes de línea aunque cupo total alcance", async t => {
  const root = await setup(t); const q = request(root, "long-line"); q.limits.maxOutputBytes = 65536; bind(q);
  const r = check(await coordinator(root)(q)); assert.equal(r.state, "failed"); assert.ok(r.reasons.includes("fixture-line-limit"));
});
localTest("C2-08: stdin cerrado antes de entrega cancela sin espera indefinida", async t => {
  const root = await setup(t); const q = request(root, "closed-stdin"); q.inputText = "x".repeat(1048576); bind(q);
  const r = check(await coordinator(root)(q)); assert.equal(r.state, "failed", JSON.stringify(r));
  assert.ok(r.reasons.includes("fixture-stdin-error")); assert.equal(r.process.terminationConfirmed, true);
});
localTest("C2-08: fallo asíncrono del ejecutable no inventa arranque", async t => {
  const root = await setup(t); const r = check(await coordinator(root, { supervisor: { spawn: (_exe, _args, opts) => spawn("/fixture-not-an-executable", [], opts) } })(request(root)));
  assert.equal(r.state, "not-started", JSON.stringify(r)); assert.equal(r.process.spawnAttempts, 1);
  assert.equal(r.fixtureExecuted, false); assert.equal(r.process.terminationConfirmed, true); assert.equal(r.storage.state, "committed");
});
localTest("C2-10: alcance de grupo incierto bloquea, harness no deja procesos vivos", async t => {
  const root = await setup(t); const q = request(root); q.limits.timeoutMs = 1200; bind(q);
  let ownedChild, closed = false;
  const r = check(await coordinator(root, { supervisor: {
    spawn: (...args) => { ownedChild = spawn(...args); ownedChild.on("close", () => { closed = true; }); return ownedChild; },
    kill: (pid, sig) => {
      if (sig === 0) { const e = Error("fixture-private-probe-failure"); e.code = "EPERM"; throw e; }
      try { return process.kill(pid, sig); } catch (e) { if (e.code === "ESRCH") return false; throw e; }
    }
  } })(q));
  assert.equal(r.state, "indeterminate"); assert.equal(r.process.groupObservation, "unconfirmed");
  assert.equal(r.storage.cleanup, "intervention-required");
  if (!closed) await once(ownedChild, "close"); // Real controlled fixture is already terminated; only probe was uncertain.
  assert.equal(closed, true); assert.ok(await fs.lstat(path.join(taskDirectory(root), "write.lock")));
});
for (const phase of ["session-mark-started-published", "session-settle-before-publish", "session-settle-published", "before-cleanup"]) localTest(`C2-11: fallo en ${phase} no oculta consumo ni reinicia cupo`, async t => {
  const root = await setup(t); const r = check(await coordinator(root, { store: { checkpoint: name => { if (name === phase) throw Error("fixture-private-fault"); } } })(request(root)));
  assert.equal(r.state, "indeterminate"); assert.equal(r.fixtureExecuted, true); assert.equal(r.process.terminationConfirmed, true);
  const l = await ledger(root); assert.equal(l.attempts.length, 1); assert.equal(l.mainStartsUsed, 1);
  assert.ok(await fs.lstat(path.join(taskDirectory(root), "write.lock")));
  assert.equal((await coordinator(root)(request(root))).fixtureExecuted, false);
});
localTest("C2-07: sustitución del lock después de reserva impide spawn y conserva recurso ajeno", async t => {
  const root = await setup(t); let calls = 0;
  const r = check(await coordinator(root, { supervisor: {
    checkpoint: async name => { if (name === "fixture-before-claim") {
      const lock = path.join(taskDirectory(root), "write.lock"); await fs.rename(lock, lock + ".owned"); await fs.writeFile(lock, "fixture-foreign-lock", { mode: 0o600 });
    } }, spawn: () => { calls++; throw Error("must not spawn"); }
  } })(request(root)));
  assert.equal(calls, 0); assert.equal(r.state, "indeterminate");
  assert.equal(await fs.readFile(path.join(taskDirectory(root), "write.lock"), "utf8"), "fixture-foreign-lock");
});
async function worker(t, root, mode) {
  const source = fileURLToPath(new URL("../testing/runtime-supervisor/coordinator-worker.js", import.meta.url));
  const child = spawn(process.execPath, [source, root, mode], { env: { LANG: "C", LC_ALL: "C" }, stdio: ["ignore", "ignore", "ignore", "ipc"] });
  const messages = []; let wake; child.on("message", m => { messages.push(m); wake?.(); });
  let exited = false; child.on("exit", () => { exited = true; wake?.(); });
  t.after(async () => { if (!exited) { child.kill("SIGKILL"); await once(child, "exit"); } });
  return { child, async message(type) {
    const deadline = Date.now() + 8000;
    while (!messages.some(m => m.type === type)) {
      if (exited || Date.now() > deadline) throw Error("Fixture worker did not answer");
      await new Promise(resolve => { wake = resolve; setTimeout(resolve, 50); });
    }
    return messages.find(m => m.type === type);
  } };
}
localTest("C2-01/06/07: dos coordinadores independientes, solo uno reserva e inicia", async t => {
  const root = await setup(t); const first = await worker(t, root, "wait"); await first.message("reserved");
  const second = await worker(t, root, "run"); const blocked = check((await second.message("result")).report);
  assert.equal(blocked.fixtureExecuted, false); assert.equal(blocked.state, "not-started");
  first.child.send({ type: "release" }); const finished = check((await first.message("result")).report);
  assert.equal(finished.state, "completed"); assert.equal((await ledger(root)).mainStartsUsed, 1); assert.equal((await ledger(root)).attempts.length, 1);
});
localTest("C2-05/06/07: caída real después de reserva durable no concede nuevo spawn", async t => {
  const root = await setup(t); const first = await worker(t, root, "wait"); await first.message("reserved");
  const exited = once(first.child, "exit"); first.child.kill("SIGKILL"); await exited;
  const second = await worker(t, root, "run"); const r = check((await second.message("result")).report);
  assert.equal(r.fixtureExecuted, false); assert.equal(r.state, "not-started");
  assert.equal((await ledger(root)).attempts[0].state, "reserved"); assert.ok(await fs.lstat(path.join(taskDirectory(root), "write.lock")));
});
localTest("C2-11: observación de arranque lenta no publica después de cerrar sesión", async t => {
  const root = await setup(t); const q = request(root); q.limits.timeoutMs = 1200; bind(q);
  const r = check(await coordinator(root, { store: { checkpoint: async name => {
    if (name === "session-mark-started-before-publish") await new Promise(resolve => setTimeout(resolve, 1400));
  } } })(q));
  assert.equal(r.state, "indeterminate"); assert.equal(r.process.terminationConfirmed, true);
  const file = path.join(taskDirectory(root), "ledger.json"); const before = await fs.readFile(file);
  await new Promise(resolve => setTimeout(resolve, 100)); assert.deepEqual(await fs.readFile(file), before);
  assert.equal((await ledger(root)).attempts[0].state, "reserved"); assert.ok(await fs.lstat(path.join(taskDirectory(root), "write.lock")));
});
localTest("C2-09/12: esquema exige informe seguro y no acepta éxito sin terminación", async t => {
  const root = await setup(t); const r = check(await coordinator(root)(request(root)));
  const ajv = new Ajv2020({ strict: true, allErrors: true }); ajv.addFormat("date-time", () => true); allSchemas.forEach(s => ajv.addSchema(s));
  const validate = ajv.compile({ $ref: `${fixtureSchema.$id}#/$defs/report` }); assert.equal(validate(r), true);
  for (const change of [x => { x.process.terminationConfirmed = false; }, x => { x.process.groupObservation = "unconfirmed"; },
    x => { x.modelCalls = 1; }, x => { x.nativeExecuted = true; }, x => { x.stdout = "fixture-private-response"; },
    x => { x.storage.cleanup = "intervention-required"; }, x => { x.process.spawnAttempts = 2; }]) {
    const altered = structuredClone(r); change(altered); assert.equal(validate(altered), false);
  }
});
localTest("C2-12: APIs instrumentadas no intentan red y spawn solo usa programa empaquetado", async t => {
  const root = await setup(t); let network = 0, starts = 0;
  const failNetwork = () => { network++; throw Error("must not network"); };
  for (const [object, key] of [[http, "request"], [https, "request"], [net, "connect"], [net, "createConnection"], [globalThis, "fetch"]]) t.mock.method(object, key, failNetwork);
  const r = check(await coordinator(root, { supervisor: { spawn: (exe, args, opts) => {
    starts++; assert.equal(exe, process.execPath); assert.match(args[0], /testing\/runtime-supervisor\/fixture\.cjs$/);
    assert.deepEqual(args.slice(1), ["success"]); assert.deepEqual(Object.keys(opts.env).sort(), ["LANG", "LC_ALL"]); return spawn(exe, args, opts);
  } } })(request(root)));
  assert.equal(r.state, "completed"); assert.equal(network, 0); assert.equal(starts, 1);
});
for (const phase of ["crash-after-spawn", "crash-after-mark"]) localTest(`C2-05/10/11: caída real ${phase}, reserva retenida y grupo limpiado por harness`, async t => {
  const root = await setup(t); const first = await worker(t, root, phase); const owned = await first.message("started");
  assert.ok(Number.isSafeInteger(owned.groupId) && owned.groupId > 1);
  let gone = false;
  const clean = async () => {
    if (!gone) {
      try { process.kill(-owned.groupId, "SIGKILL"); } catch (e) { if (e.code !== "ESRCH") throw e; gone = true; }
      const deadline = Date.now() + 3000;
      while (!gone && Date.now() < deadline) {
        try { process.kill(-owned.groupId, 0); } catch (e) { if (e.code === "ESRCH") gone = true; else if (e.code !== "EPERM") throw e; }
        if (!gone) await new Promise(resolve => setTimeout(resolve, 10));
      }
    }
    assert.equal(gone, true, "own fixture group did not terminate");
    const s = await fs.lstat(owned.workspace).catch(() => null);
    if (s?.dev === owned.dev && s?.ino === owned.ino && s.isDirectory()) await fs.rmdir(owned.workspace);
  };
  t.after(clean);
  const exit = once(first.child, "exit"); first.child.kill("SIGKILL"); await exit; await clean();
  const l = await ledger(root); assert.equal(l.attempts[0].state, phase === "crash-after-spawn" ? "reserved" : "started");
  assert.ok(await fs.lstat(path.join(taskDirectory(root), "write.lock")));
  const r = check(await coordinator(root)(request(root))); assert.equal(r.state, "not-started"); assert.equal(r.fixtureExecuted, false);
});
