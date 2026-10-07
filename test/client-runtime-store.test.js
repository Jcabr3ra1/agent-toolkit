import assert from "node:assert/strict";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import test from "node:test";
import Ajv2020 from "ajv/dist/2020.js";
import { hash } from "../src/client-runtime-core.js";
import { createClientRuntimeStore } from "../src/client-runtime-store.js";
import { createStoreFiles } from "../src/client-runtime-store-files.js";
import { schemas, fixture, config, store, initialize, snapshot, apply, directory, NOW, REPO } from "../testing/runtime-store/fixture.js";

const supported = process.platform === "darwin";
const localTest = (name, fn) => test(name, { skip: !supported, timeout: 20000 }, fn);
async function setup(t) {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "agent-runtime-store-")));
  await fs.chmod(root, 0o700); const owned = await fs.lstat(root);
  t.after(async () => {
    const s = await fs.lstat(root).catch(() => null);
    if (s?.isDirectory() && s.dev === owned.dev && s.ino === owned.ino) await fs.rm(root, { recursive: true });
  });
  return root;
}
function check(r, state, reason) {
  assert.equal(r.state, state, JSON.stringify(r)); if (reason) assert.ok(r.reasons.includes(reason), JSON.stringify(r));
  assert.equal(r.executed, false); assert.equal(r.nativeExecuted, false); assert.equal(r.runtimeReady, false); assert.equal(r.verifiedAdmission, false);
  if (["blocked", "indeterminate"].includes(state)) { assert.equal(r.snapshot, null); assert.equal(r.snapshotSha256, null); }
  return r;
}
async function initialized(t) {
  const root = await setup(t); const run = store(root); check(await run(initialize(root)), "committed"); return { root, run, dir: directory(root), file: path.join(directory(root), "ledger.json") };
}
const ledgerFile = root => path.join(directory(root), "ledger.json");
function settlementRequest(root, ledger) {
  const a = apply(root); a.transition = {
    schemaVersion: "1.0.0", operation: "settle", now: NOW, ledger, expectedRevision: ledger.revision, expectedLedgerSha256: hash(ledger), attemptId: "demo-attempt",
    startObservation: "not-started", actualCalls: 0, actualSeconds: 0, outcome: "not-started", terminationConfirmed: true,
    reconciliation: { status: "approved", revoked: false, referenceId: "demo-reconcile", source: "operator-attestation", checkedAt: NOW,
      expiresAt: "2026-10-02T15:00:00Z", evidenceRef: "demo-no-start", projectId: ledger.projectId, taskId: ledger.taskId, attemptId: "demo-attempt", ledgerSha256: hash(ledger) }
  }; return a;
}

localTest("C2-01/02/13: inicializa, lee, reserva y concilia sin arranque ni mutación", async t => {
  const root = await setup(t); const run = store(root); const f = fixture(); const initial = initialize(root, f.ledger); const before = structuredClone(initial);
  const created = check(await run(initial), "committed"); assert.deepEqual(initial, before);
  assert.equal(created.durability, "confirmed"); assert.equal(created.cleanup, "complete"); assert.equal(created.snapshotSha256, hash(f.ledger));
  assert.equal((await fs.lstat(root)).mode & 0o777, 0o700); assert.equal((await fs.lstat(directory(root))).mode & 0o777, 0o700);
  assert.equal((await fs.lstat(ledgerFile(root))).mode & 0o777, 0o600);
  const disk = await fs.readFile(ledgerFile(root)); check(await run(initialize(root)), "blocked", "store-already-initialized");
  assert.deepEqual(await fs.readFile(ledgerFile(root)), disk);
  const read = check(await run(snapshot(root)), "unchanged"); assert.deepEqual(read.snapshot, f.ledger);
  const request = apply(root); const original = structuredClone(request); const reserved = check(await run(request), "committed"); assert.deepEqual(request, original);
  assert.equal(reserved.snapshot.revision, 1); assert.equal(reserved.snapshot.attempts.length, 1); assert.equal(reserved.snapshot.history.executionsUsed, 0);
  check(await run(request), "blocked", "store-snapshot-conflict");
  const settled = check(await run(settlementRequest(root, reserved.snapshot)), "committed"); assert.equal(settled.snapshot.revision, 2);
  assert.equal(settled.snapshot.history.executionsUsed, 0); assert.equal(settled.snapshot.attempts.length, 1);
  assert.deepEqual(await fs.readdir(directory(root)), ["ledger.json"]);
});
localTest("C2-13: conserva historial importado sin crear presupuesto cero implícito", async t => {
  const root = await setup(t); const l = fixture().ledger; Object.assign(l.importedHistory, { executionsUsed: 1, durationUsedSeconds: 100 });
  l.history = structuredClone(l.importedHistory); l.importedMainStartsUsed = 1; l.mainStartsUsed = 1;
  const r = check(await store(root)(initialize(root, l)), "committed"); assert.equal(r.snapshot.history.executionsUsed, 1); assert.equal(r.snapshot.mainStartsUsed, 1);
});
for (const [key, value] of [["status", "pending"], ["revoked", true], ["operations", []], ["rootSha256", "c".repeat(64)],
  ["checkedAt", "2026-10-02T12:00:00Z"], ["expiresAt", NOW]]) localTest(`C2-02/12: permiso ${key} incompatible no crea recursos`, async t => {
  const root = await setup(t); const q = initialize(root); q.authorization[key] = value;
  check(await store(root)(q), "blocked", "store-not-authorized"); assert.deepEqual(await fs.readdir(root), []);
});
localTest("C2-02: importación necesita referencia coincidente y conciliación", async t => {
  const root = await setup(t); const q = initialize(root); q.importReferenceId = "foreign-import";
  check(await store(root)(q), "blocked", "store-import-not-reconciled");
  q.importReferenceId = q.ledger.importEvidenceRef; q.ledger.status = "reconciliation-required";
  check(await store(root)(q), "blocked", "store-import-not-reconciled"); assert.deepEqual(await fs.readdir(root), []);
});
for (const [label, alter] of [
  ["getter", q => Object.defineProperty(q, "extra", { enumerable: true, get() { throw Error("getter called"); } })],
  ["proxy", q => { q.ledger = new Proxy(q.ledger, { ownKeys() { throw Error("proxy called"); } }); }],
  ["cycle", q => { q.extra = q; }], ["campo extra", q => { q.secret = "private-never-echo"; }],
  ["coerción", q => { q.ledger.revision = "0"; }], ["JSON inseguro", q => Object.defineProperty(q, "__proto__", { value: {}, enumerable: true })]
]) localTest(`C2-02/12: entrada ${label} no ejecuta ni filtra`, async t => {
  const root = await setup(t); const q = initialize(root); alter(q); const r = check(await store(root)(q), "blocked");
  assert.equal(JSON.stringify(r).includes("private-never-echo"), false); assert.deepEqual(await fs.readdir(root), []);
});
localTest("C2-02: schema local equivocado y configuración arbitraria fallan sin IO", async t => {
  const root = await setup(t); const bad = structuredClone(schemas); bad[4].$id = "https://other.invalid/schema";
  assert.throws(() => createClientRuntimeStore(...bad, config(root)), /Unsupported/);
  assert.throws(() => store(root, {}, { ...config(root), command: "private-never-echo" }), /Invalid/);
  assert.deepEqual(await fs.readdir(root), []);
});
for (const [label, change] of [
  ["duplicado", b => b.toString().replace('"storageVersion":"1.0.0"', '"storageVersion":"1.0.0","storageVersion":"1.0.0"')],
  ["huella ajena", b => { const d = JSON.parse(b); d.ledgerSha256 = "c".repeat(64); return JSON.stringify(d); }],
  ["JSON truncado", b => b.subarray(0, 40)], ["UTF8 inválido", () => Buffer.from([0xff])],
  ["tamaño", () => Buffer.alloc(1024 * 1024 + 1, 32)],
  ["totales falsos", b => { const d = JSON.parse(b); d.ledger.mainStartsUsed = 1; d.ledgerSha256 = hash(d.ledger); return JSON.stringify(d); }],
  ["identidad ajena", b => { const d = JSON.parse(b); d.identity.taskId = "foreign"; return JSON.stringify(d); }]
]) localTest(`C2-02: documento ${label} bloquea sin sobrescribir`, async t => {
  const { root, run, file } = await initialized(t); await fs.writeFile(file, change(await fs.readFile(file))); const before = await fs.readFile(file);
  check(await run(snapshot(root)), "blocked"); check(await run(apply(root)), "blocked"); assert.deepEqual(await fs.readFile(file), before);
});
localTest("C2-02: revisión y huella obsoletas no publican", async t => {
  const { root, run, file } = await initialized(t); const before = await fs.readFile(file); const q = apply(root);
  q.transition.expectedRevision = 1; check(await run(q), "blocked", "store-snapshot-conflict");
  q.transition.expectedRevision = 0; q.transition.expectedLedgerSha256 = "c".repeat(64); check(await run(q), "blocked", "store-snapshot-conflict");
  assert.deepEqual(await fs.readFile(file), before);
});
localTest("C2-02: reloj vigente no usa el now antiguo del encargo", async t => {
  const { root, file } = await initialized(t); const before = await fs.readFile(file); const q = apply(root);
  q.authorization.checkedAt = "2026-10-02T15:00:00Z"; q.authorization.expiresAt = "2026-10-02T16:00:00Z";
  check(await store(root, { clock: () => Date.parse("2026-10-02T15:00:00Z") })(q), "blocked", "store-transition-blocked");
  assert.deepEqual(await fs.readFile(file), before);
});
localTest("C2-02: tiempo/permiso cambia antes de publicar y conserva ledger", async t => {
  const { root, file } = await initialized(t); const before = await fs.readFile(file); let time = Date.parse(NOW);
  const run = store(root, { clock: () => time, checkpoint: phase => { if (phase === "before-publish") time += 3600000; } });
  check(await run(apply(root)), "blocked", "store-not-authorized"); assert.deepEqual(await fs.readFile(file), before);
});
for (const clock of [() => NaN, () => "bad", () => { throw Error("private-clock-error"); }]) localTest("C2-02/12: reloj no disponible bloquea sin eco", async t => {
  const root = await setup(t); const r = check(await store(root, { clock })(initialize(root)), "blocked"); assert.equal(JSON.stringify(r).includes("private-clock-error"), false);
});
localTest("C2-03: rechaza raíz enlazada, repositorio y destino prohibido", async t => {
  const root = await setup(t); const alias = path.join(root, "alias"); await fs.symlink(root, alias);
  check(await store(alias)(initialize(alias)), "blocked", "store-symlink-path");
  const child = path.join(root, "repo"); await fs.mkdir(child, { mode: 0o700 }); await fs.mkdir(path.join(child, ".git"));
  check(await store(child)(initialize(child)), "blocked", "store-forbidden-root");
  check(await store(root, {}, { ...config(root), forbiddenRoots: [root] })(initialize(root)), "blocked", "store-forbidden-root");
  assert.equal((await fs.readdir(child)).length, 1);
});
for (const target of ["root", "task", "file"]) localTest(`C2-03: permisos inseguros ${target} no se reparan`, async t => {
  const { root, dir, file, run } = await initialized(t); const p = { root, task: dir, file }[target]; const mode = target === "file" ? 0o644 : 0o755;
  await fs.chmod(p, mode); check(await run(snapshot(root)), "blocked", "store-unsafe-resource"); assert.equal((await fs.lstat(p)).mode & 0o777, mode);
});
localTest("C2-03: symlink de ledger y enlaces duros se rechazan", async t => {
  const { root, file, run } = await initialized(t); const saved = path.join(root, "saved.json"); await fs.rename(file, saved); await fs.symlink(saved, file);
  check(await run(snapshot(root)), "blocked", "store-symlink-path"); await fs.unlink(file); await fs.link(saved, file);
  check(await run(snapshot(root)), "blocked", "store-unsafe-resource"); assert.equal((await fs.lstat(file)).nlink, 2);
});
localTest("C2-03: directorio de tarea sustituido por enlace no se sigue", async t => {
  const { root, dir, run } = await initialized(t); const saved = path.join(root, "saved"); await fs.rename(dir, saved); await fs.symlink(saved, dir);
  check(await run(snapshot(root)), "blocked", "store-symlink-path"); assert.equal((await fs.lstat(dir)).isSymbolicLink(), true);
});
localTest("C2-03: recurso no regular y temporal residual bloquean", async t => {
  const { root, file, dir, run } = await initialized(t); const old = await fs.readFile(file); await fs.unlink(file); await fs.mkdir(file, { mode: 0o700 });
  check(await run(snapshot(root)), "blocked", "store-unsafe-resource"); await fs.rmdir(file); await fs.writeFile(file, old, { mode: 0o600 });
  await fs.writeFile(path.join(dir, ".ledger-abandoned.tmp"), "owned-test", { mode: 0o600 });
  check(await run(snapshot(root)), "blocked", "store-residual-resource"); assert.ok((await fs.readdir(dir)).includes(".ledger-abandoned.tmp"));
});
localTest("C2-06: lock previo no se roba ni modifica", async t => {
  const { root, dir, run } = await initialized(t); const lock = path.join(dir, "write.lock"); await fs.writeFile(lock, "owner-from-another-writer", { mode: 0o600 });
  check(await run(apply(root)), "blocked", "store-locked"); check(await run(snapshot(root)), "blocked", "store-locked");
  assert.equal(await fs.readFile(lock, "utf8"), "owner-from-another-writer");
});

for (const phase of ["lock-created", "lock-durable", "snapshot-read", "temp-created", "temp-synced", "before-publish"]) localTest(`C2-04: fallo antes de publicación ${phase} no cambia ledger`, async t => {
  const { root, file, dir } = await initialized(t); const before = await fs.readFile(file);
  const run = store(root, { checkpoint: p => { if (p === phase) throw Error("private-never-echo"); } });
  const r = check(await run(apply(root)), "blocked", "store-io-failed"); assert.equal(r.writeObservation, "unchanged"); assert.equal(r.cleanup, "complete");
  assert.deepEqual(await fs.readFile(file), before); assert.deepEqual(await fs.readdir(dir), ["ledger.json"]); assert.equal(JSON.stringify(r).includes("private-never-echo"), false);
});
for (const phase of ["published", "directory-synced", "confirmed", "before-cleanup"]) localTest(`C2-04: fallo posterior ${phase} no oculta escritura ni libera incertidumbre`, async t => {
  const { root, file, dir } = await initialized(t); const run = store(root, { checkpoint: p => { if (p === phase) throw Error("private-never-echo"); } });
  const r = check(await run(apply(root)), "indeterminate"); assert.equal(r.writeObservation, "replaced"); assert.equal(r.cleanup, "intervention-required");
  assert.equal(JSON.parse(await fs.readFile(file)).ledger.revision, 1); assert.ok((await fs.readdir(dir)).includes("write.lock"));
  check(await store(root)(apply(root)), "blocked", "store-locked");
});
for (const afterRename of [false, true]) localTest(`C2-04: rename falla ${afterRename ? "después" : "antes"} de publicar`, async t => {
  const { root, file, dir } = await initialized(t); const run = store(root, { io: { rename: async (...args) => { if (afterRename) await fs.rename(...args); throw Error("private-rename-failure"); } } });
  const r = check(await run(apply(root)), "indeterminate", "store-io-failed"); assert.equal(r.writeObservation, afterRename ? "replaced" : "unchanged");
  assert.equal(r.durability, "unconfirmed"); assert.equal(JSON.parse(await fs.readFile(file)).ledger.revision, afterRename ? 1 : 0);
  assert.ok((await fs.readdir(dir)).includes("write.lock"));
});
localTest("C2-03/04: snapshot editado antes de publicación no se sobrescribe", async t => {
  const { root, file } = await initialized(t); let edited;
  const run = store(root, { checkpoint: async p => { if (p === "before-publish") { const d = JSON.parse(await fs.readFile(file)); d.ledger.revision = 2; d.ledgerSha256 = hash(d.ledger); edited = JSON.stringify(d); await fs.writeFile(file, edited); } } });
  check(await run(apply(root)), "blocked", "store-snapshot-conflict"); assert.equal(await fs.readFile(file, "utf8"), edited);
});
localTest("C2-03/04: lock sustituido se conserva, no se limpia por nombre", async t => {
  const { root, dir, file } = await initialized(t); const before = await fs.readFile(file); const lock = path.join(dir, "write.lock");
  const run = store(root, { checkpoint: async p => { if (p === "before-publish") { await fs.unlink(lock); await fs.writeFile(lock, "foreign-lock", { mode: 0o600 }); } } });
  check(await run(apply(root)), "indeterminate", "store-cleanup-required"); assert.equal(await fs.readFile(lock, "utf8"), "foreign-lock"); assert.deepEqual(await fs.readFile(file), before);
});
localTest("C2-03/04: temporal editado no se instala ni se borra como propio", async t => {
  const { root, dir, file } = await initialized(t); const before = await fs.readFile(file); let changed;
  const run = store(root, { checkpoint: async p => { if (p === "before-publish") { changed = path.join(dir, (await fs.readdir(dir)).find(n => n.endsWith(".tmp"))); await fs.writeFile(changed, "foreign-temporary"); } } });
  check(await run(apply(root)), "indeterminate", "store-cleanup-required"); assert.equal(await fs.readFile(changed, "utf8"), "foreign-temporary"); assert.deepEqual(await fs.readFile(file), before);
});

function wrappedOpen(override) {
  return async (...args) => {
    const handle = await fs.open(...args); const replacements = override(args[0], handle, args[1]) ?? {};
    return new Proxy(handle, { get(target, key) {
      if (Object.hasOwn(replacements, key)) return replacements[key];
      const value = Reflect.get(target, key, target); return typeof value === "function" ? value.bind(target) : value;
    } });
  };
}
localTest("C2-04: escritura parcial se completa antes de publicar", async t => {
  const { root } = await initialized(t); let writes = 0;
  const open = wrappedOpen((p, h) => p.endsWith(".tmp") ? { write: (buffer, offset, length, position) => {
    writes++; return h.write(buffer, offset, Math.min(17, length), position);
  } } : {});
  check(await store(root, { io: { open } })(apply(root)), "committed"); assert.ok(writes > 1);
});
for (const fault of ["zero-write", "write-error", "temp-sync"]) localTest(`C2-04: IO real inyectado ${fault} no publica`, async t => {
  const { root, dir, file } = await initialized(t); const before = await fs.readFile(file);
  const open = wrappedOpen((p, h) => p.endsWith(".tmp") ? {
    write: fault === "zero-write" ? async () => ({ bytesWritten: 0 }) : fault === "write-error" ? async () => { throw Error("private-io-error"); } : h.write.bind(h),
    sync: fault === "temp-sync" ? async () => { throw Error("private-sync-error"); } : h.sync.bind(h)
  } : {});
  const r = check(await store(root, { io: { open } })(apply(root)), "blocked", fault === "zero-write" ? "store-short-write" : "store-io-failed");
  assert.deepEqual(await fs.readFile(file), before); assert.deepEqual(await fs.readdir(dir), ["ledger.json"]);
  assert.equal(JSON.stringify(r).includes("private-"), false);
});
localTest("C2-04: fsync de directorio tras rename no confirma durabilidad", async t => {
  const { root, dir, file } = await initialized(t); let syncs = 0;
  const open = wrappedOpen((p, h) => p === dir ? { sync: async () => { if (++syncs === 2) throw Error("fsync fault"); await h.sync(); } } : {});
  const r = check(await store(root, { io: { open } })(apply(root)), "indeterminate", "store-io-failed");
  assert.equal(r.writeObservation, "replaced"); assert.equal(r.durability, "unconfirmed");
  assert.equal(JSON.parse(await fs.readFile(file)).ledger.revision, 1); assert.ok((await fs.readdir(dir)).includes("write.lock"));
});
localTest("C2-04: fallo de lectura tras rename conserva resultado desconocido", async t => {
  const { root, dir, file } = await initialized(t); let published = false;
  const run = store(root, { checkpoint: p => { if (p === "published") published = true; }, io: {
    open: async (...args) => { if (published && args[0] === file) throw Error("readback fault"); return fs.open(...args); }
  } });
  const r = check(await run(apply(root)), "indeterminate", "store-io-failed");
  assert.equal(r.writeObservation, "unknown"); assert.equal(r.durability, "confirmed");
  assert.equal(JSON.parse(await fs.readFile(file)).ledger.revision, 1); assert.ok((await fs.readdir(dir)).includes("write.lock"));
});
localTest("C2-04: unlink fallido de lock no declara limpieza completa", async t => {
  const { root, dir } = await initialized(t);
  const r = check(await store(root, { io: { unlink: async p => { if (p.endsWith("write.lock")) throw Error("unlink fault"); return fs.unlink(p); } } })(apply(root)), "indeterminate", "store-cleanup-required");
  assert.equal(r.writeObservation, "replaced"); assert.equal(r.durability, "confirmed"); assert.ok((await fs.readdir(dir)).includes("write.lock"));
});
localTest("C2-04: cierre no confirmado no devuelve committed", async t => {
  const { root, file } = await initialized(t);
  const open = wrappedOpen((p, h, flags) => p.endsWith(".tmp") && (flags & fsSync.constants.O_WRONLY) ? { close: async () => { await h.close(); throw Error("close fault"); } } : {});
  const r = check(await store(root, { io: { open } })(apply(root)), "indeterminate", "store-close-unconfirmed");
  assert.equal(r.writeObservation, "replaced"); assert.equal(JSON.parse(await fs.readFile(file)).ledger.revision, 1);
});
localTest("C2-03: propietario ajeno falla sin reparar recursos", async t => {
  const root = await setup(t);
  const lstat = async p => { const s = await fs.lstat(p); return p === root ? new Proxy(s, { get: (target, k) => k === "uid" ? s.uid + 1 : Reflect.get(target, k) }) : s; };
  check(await store(root, { io: { lstat } })(initialize(root)), "blocked", "store-unsafe-resource"); assert.deepEqual(await fs.readdir(root), []);
});
localTest("C2-03: bits especiales de permisos también se rechazan", async t => {
  const root = await setup(t); await fs.chmod(root, 0o1700);
  check(await store(root)(initialize(root)), "blocked", "store-unsafe-resource"); assert.equal((await fs.lstat(root)).mode & 0o7777, 0o1700);
});
localTest("C2-03: enlace duro añadido durante lectura se detecta", async t => {
  const { root, file } = await initialized(t); let linked = false;
  const open = wrappedOpen((p, h) => p === file ? { read: async (...args) => {
    const result = await h.read(...args); if (!linked) { linked = true; await fs.link(file, path.join(root, "foreign-hardlink")); } return result;
  } } : {});
  await assert.rejects(createStoreFiles({ open }).read(file), e => e.code === "store-unsafe-resource");
  assert.equal((await fs.lstat(file)).nlink, 2);
});
localTest("C2-03/04: directorio sustituido antes de publicación no recibe el ledger", async t => {
  const { root, dir, file } = await initialized(t); const before = await fs.readFile(file);
  const saved = path.join(root, "original-task");
  const checkpoint = async p => { if (p === "before-publish") {
    await fs.rename(dir, saved); await fs.mkdir(dir, { mode: 0o700 }); await fs.writeFile(file, "foreign-ledger", { mode: 0o600 });
  } };
  check(await store(root, { checkpoint })(apply(root)), "indeterminate", "store-directory-replaced");
  assert.equal(await fs.readFile(file, "utf8"), "foreign-ledger"); assert.deepEqual(await fs.readFile(path.join(saved, "ledger.json")), before);
  assert.ok((await fs.readdir(saved)).includes("write.lock"));
});
localTest("C2-02: propuesta sensible al reloj no se publica un segundo después", async t => {
  const { root, dir, file } = await initialized(t); const before = await fs.readFile(file); let time = Date.parse(NOW);
  const r = check(await store(root, { clock: () => time, checkpoint: p => { if (p === "before-publish") time += 1000; } })(apply(root)), "blocked", "store-publication-time-changed");
  assert.equal(r.writeObservation, "unchanged"); assert.deepEqual(await fs.readFile(file), before); assert.deepEqual(await fs.readdir(dir), ["ledger.json"]);
});
localTest("C2-02: lectura ausente y transición ajena no crean recursos", async t => {
  const root = await setup(t); const run = store(root);
  check(await run(snapshot(root)), "blocked", "store-ledger-missing"); const q = apply(root); q.transition.ledger.taskId = "foreign-task";
  check(await run(q), "blocked", "store-transition-identity-mismatch"); assert.deepEqual(await fs.readdir(root), []);
});
localTest("C2-02: importación de reserva activa no reinicia historial", async t => {
  const { root, run } = await initialized(t); const reserved = check(await run(apply(root)), "committed");
  const another = await setup(t); check(await store(another)(initialize(another, reserved.snapshot)), "blocked", "store-import-not-reconciled");
  assert.deepEqual(await fs.readdir(another), []);
});
localTest("C2-03: configuración de versión no evaluada bloquea antes de IO", async t => {
  const root = await setup(t); const cfg = config(root); cfg.evaluation.nodeVersion = "v0.0.0";
  check(await store(root, {}, cfg)(initialize(root)), "blocked", "store-platform-not-evaluated"); assert.deepEqual(await fs.readdir(root), []);
});
localTest("C2-02: esquema de informe rechaza correlaciones contradictorias", async t => {
  const { root, run } = await initialized(t); const good = await run(snapshot(root));
  const ajv = new Ajv2020({ strict: true }); ajv.addFormat("date-time", { type: "string", validate: () => true }); schemas.forEach(s => ajv.addSchema(s));
  const validate = ajv.compile({ $ref: schemas[4].$id + "#/$defs/report" }); assert.equal(validate(good), true);
  for (const update of [{ writeObservation: "replaced" }, { cleanup: "intervention-required" }, { snapshot: null }, { state: "blocked" }, { identity: null }]) {
    assert.equal(validate({ ...good, ...update }), false);
  }
});

async function writer(t, root, request, pauseAt) {
  const filename = path.join(root, `writer-${request.transition.attemptId}-${pauseAt}.json`);
  await fs.writeFile(filename, JSON.stringify({ configuration: config(root), request, pauseAt }), { mode: 0o600 });
  const child = spawn(process.execPath, [fileURLToPath(new URL("../testing/runtime-store/writer.js", import.meta.url)), filename], { env: {}, stdio: ["ignore", "ignore", "ignore", "ipc"] });
  const messages = []; const pending = [];
  child.on("message", m => { messages.push(m); for (const w of [...pending]) if (w.type === m.type) { clearTimeout(w.timer); pending.splice(pending.indexOf(w), 1); w.resolve(m); } });
  const closed = new Promise(resolve => child.once("close", (code, signal) => resolve({ code, signal })));
  t.after(async () => { if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL"); await closed; for (const w of pending) { clearTimeout(w.timer); w.reject(Error("writer stopped")); } });
  return { child, closed, wait(type) { const prior = messages.find(m => m.type === type); if (prior) return Promise.resolve(prior);
    return new Promise((resolve, reject) => { const w = { type, resolve, reject, timer: setTimeout(() => reject(Error(`writer timeout ${type}`)), 5000) }; pending.push(w); }); } };
}
localTest("C2-01/06: escritores de procesos distintos no aceptan el mismo último cupo", async t => {
  const { root, file } = await initialized(t); const first = await writer(t, root, apply(root, fixture(), "first"), "lock-durable"); await first.wait("paused");
  const second = await writer(t, root, apply(root, fixture(), "second"), "none"); check((await second.wait("result")).result, "blocked", "store-locked"); await second.closed;
  first.child.send("continue"); const winner = check((await first.wait("result")).result, "committed"); await first.closed;
  assert.equal(winner.snapshot.attempts.length, 1); assert.equal(winner.snapshot.attempts[0].attemptId, "first");
  const third = await writer(t, root, apply(root, fixture(), "third"), "none"); check((await third.wait("result")).result, "blocked", "store-snapshot-conflict"); await third.closed;
  const disk = JSON.parse(await fs.readFile(file)); assert.equal(disk.ledger.revision, 1); assert.equal(disk.ledger.attempts.length, 1);
});
for (const phase of ["lock-created", "lock-durable", "snapshot-read", "temp-created", "temp-synced", "published", "directory-synced", "confirmed"]) localTest(`C2-05/06: caída real de escritor en ${phase} retiene bloqueo`, async t => {
  const { root, file, dir } = await initialized(t); const w = await writer(t, root, apply(root), phase); await w.wait("paused"); w.child.kill("SIGKILL");
  assert.equal((await w.closed).signal, "SIGKILL");
  const disk = JSON.parse(await fs.readFile(file)); assert.equal(disk.ledger.revision, ["published", "directory-synced", "confirmed"].includes(phase) ? 1 : 0);
  assert.equal(disk.ledgerSha256, hash(disk.ledger)); assert.ok((await fs.readdir(dir)).includes("write.lock"));
  check(await store(root)(apply(root)), "blocked", ["temp-created", "temp-synced"].includes(phase) ? "store-residual-resource" : "store-locked");
});
localTest("C2-12: store no intenta red ni expone el entorno o rutas privadas", async t => {
  const root = await setup(t); const restore = []; let calls = 0;
  for (const [obj, names] of [[http, ["get", "request"]], [https, ["get", "request"]], [net, ["connect", "createConnection"]], [globalThis, ["fetch"]]]) {
    for (const k of names) { const old = obj[k]; obj[k] = () => { calls++; throw Error("network forbidden"); }; restore.push(() => { obj[k] = old; }); }
  }
  try { const r = check(await store(root)(initialize(root)), "committed"); assert.equal(calls, 0); assert.equal(JSON.stringify(r).includes(root), false); }
  finally { restore.reverse().forEach(f => f()); }
});
test("C2-12: código store no importa lanzadores, configuración de clientes ni helpers Git", () => {
  for (const n of ["client-runtime-store.js", "client-runtime-store-files.js"]) {
    const source = fsSync.readFileSync(path.join(REPO, "src", n), "utf8"); assert.doesNotMatch(source, /child_process|execFile|spawn\(|process\.env|sync-files|sync-record/);
  }
});
