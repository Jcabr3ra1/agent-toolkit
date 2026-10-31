import path from "node:path";
import { supportsLocalPosix } from "./client-local-platform.js";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import Ajv2020 from "ajv/dist/2020.js";
import { constants } from "node:fs";
import { createClientRuntimeState } from "./client-runtime-state.js";
import { copyInertJson, ParseFailure, fail, canonical, hash, same, fresh, ledgerFacts } from "./client-runtime-core.js";
import { decode, parseEventJson } from "./client-output-json.js";
import { createStoreFiles, bytesHash, FILE_LIMIT, missing } from "./client-runtime-store-files.js";
import { createFixturePermit, revokeFixturePermit } from "./client-runtime-fixture-permit.js";

export const LOCAL_STORE_ID = "https://agent-toolkit.local/schemas/agent-client-runtime-local.schema.json";
const toolkit = fileURLToPath(new URL("../", import.meta.url)).replace(/\/$/, "");
const contained = (child, parent) => child === parent || child.startsWith(parent + path.sep);
const validPath = p => path.isAbsolute(p) && path.normalize(p) === p && !p.includes("\0");
const utc = value => {
  const t = Date.parse(value);
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(value) && Number.isFinite(t) && new Date(t).toISOString() === value.replace(/Z$/, ".000Z");
};

/** Trusted factory configuration/dependencies, inert JSON operations. No client launcher. */
export function createClientRuntimeStore(base, preference, adapter, runtime, local, configuration, dependencies = {}) {
  const schemas = [base, preference, adapter, runtime, local].map(copyInertJson);
  if (schemas[4].$id !== LOCAL_STORE_ID) throw Error("Unsupported local runtime schema");
  const ajv = new Ajv2020({ strict: true, allErrors: true }); ajv.addFormat("date-time", { type: "string", validate: utc });
  schemas.forEach(s => ajv.addSchema(s));
  const check = Object.fromEntries(["configuration", "request", "document", "report"].map(n => [n, ajv.compile({ $ref: `${LOCAL_STORE_ID}#/$defs/${n}` })]));
  const cfg = copyInertJson(configuration); if (!check.configuration(cfg)) throw Error("Invalid local runtime configuration");
  const transition = createClientRuntimeState(...schemas.slice(0, 4));
  const files = createStoreFiles(dependencies.io); const clock = dependencies.clock ?? Date.now;
  const checkpoint = dependencies.checkpoint ?? (() => {});

  async function execute(input, sessionConsumer, sessionGate) {
    const r = { schemaVersion: "1.0.0", engineVersion: "1.0.0", scope: "cooperative-local-data-only", state: "blocked",
      executed: false, nativeExecuted: false, runtimeReady: false, verifiedAdmission: false, writeObservation: "unchanged",
      durability: "unconfirmed", cleanup: "complete", identity: null, snapshot: null, snapshotSha256: null, reasons: [] };
    let root, rootStat, dir, dirStat, lock, temp, before = null, after = null, target, publishing = false, published = false;
    let keep = false;
    const sessionResources = [];
    const phase = name => checkpoint(name);
    function now() { const ms = clock(); if (typeof ms !== "number" || !Number.isFinite(ms)) fail("store-clock-unavailable"); const date = new Date(ms); if (!Number.isFinite(date.getTime())) fail("store-clock-unavailable"); return date.toISOString().replace(/\.\d{3}Z$/, "Z"); }
    const document = ledger => ({ storageVersion: "1.0.0", identity: r.identity, ledgerSha256: hash(ledger), ledger });
    function inspect(bytes, time) {
      const d = copyInertJson(parseEventJson(decode(bytes)));
      if (!check.document(d) || !same(d.identity, r.identity) || !same({ projectId: d.ledger.projectId, taskId: d.ledger.taskId }, r.identity) || d.ledgerSha256 !== hash(d.ledger)) fail("store-invalid-document");
      ledgerFacts(d.ledger, time); return d;
    }
    async function roots() {
      if (!validPath(cfg.root) || cfg.root === path.parse(cfg.root).root || !cfg.forbiddenRoots.every(validPath)) fail("store-invalid-root");
      await files.physical(cfg.root); root = await files.io.realpath(cfg.root); rootStat = await files.directory(root);
      const forbidden = [toolkit, ...cfg.forbiddenRoots];
      for (const p of forbidden) {
        let resolved = p; try { resolved = await files.io.realpath(p); } catch (e) { if (!missing(e)) throw e; }
        if (contained(root, resolved) || contained(resolved, root)) fail("store-forbidden-root");
      }
      // Refuse roots within an existing repository or Obsidian vault without invoking Git.
      for (let p = root; p !== path.parse(p).root; p = path.dirname(p)) {
        if (await files.exists(path.join(p, ".git")) || await files.exists(path.join(p, ".obsidian"))) fail("store-forbidden-root");
      }
    }
    function permission(d, time) {
      const a = d.authorization;
      if (a.status !== "approved" || a.revoked || !a.operations.includes(d.operation) || !fresh(a, time, 3600) ||
        !same(a.identity, d.identity) || a.rootSha256 !== hash(root)) fail("store-not-authorized");
    }
    async function fence() {
      await files.directory(root, rootStat); await files.directory(dir, dirStat); await files.owned(lock);
    }
    async function current(time) { const read = await files.read(target); return { ...read, data: inspect(read.bytes, time) }; }
    async function unchanged(time) {
      if (before === null) { if (await files.exists(target)) fail("store-snapshot-conflict"); }
      else { const read = await current(time); if (!files.equal(before.stat, read.stat) || bytesHash(before.bytes) !== bytesHash(read.bytes)) fail("store-snapshot-conflict"); }
    }
    try {
      const d = copyInertJson(input); if (!check.request(d)) fail("store-invalid-request"); r.identity = d.identity;
      if (!supportsLocalPosix(process.platform) || cfg.evaluation.platform !== process.platform || cfg.evaluation.nodeVersion !== process.version ||
        !constants.O_NOFOLLOW || !constants.O_DIRECTORY) fail("store-platform-not-evaluated");
      let time = now(); await roots(); permission(d, time);
      if (d.operation === "initialize") {
        const imported = inspect(Buffer.from(canonical(document(d.ledger))), time);
        const facts = ledgerFacts(imported.ledger, time);
        if (d.importReferenceId !== imported.ledger.importEvidenceRef || imported.ledger.status !== "reconciled" || facts.active || facts.uncertain || facts.overrun) fail("store-import-not-reconciled");
      } else if (d.operation === "apply" && !same({ projectId: d.transition.ledger.projectId, taskId: d.transition.ledger.taskId }, d.identity)) fail("store-transition-identity-mismatch");
      dir = path.join(root, hash(d.identity)); target = path.join(dir, "ledger.json");
      if (d.operation === "initialize") {
        try { await files.io.mkdir(dir, { mode: 0o700 }); await files.syncDirectory(root, rootStat); }
        catch (e) { if (e?.code !== "EEXIST") throw e; }
      }
      try { dirStat = await files.directory(dir); } catch (e) { if (missing(e)) fail("store-ledger-missing"); throw e; }
      await files.contents(dir, ["ledger.json", "write.lock"]);
      try { lock = await files.exclusive(path.join(dir, "write.lock")); }
      catch (e) { if (e instanceof ParseFailure && e.code === "store-resource-exists") fail("store-locked"); throw e; }
      await phase("lock-created"); await files.write(lock, Buffer.from(canonical({ protocolVersion: "1.0.0", ownerId: randomUUID() }) + "\n"));
      await files.syncDirectory(dir, dirStat); await phase("lock-durable");
      await fence(); time = now(); permission(d, time);
      if (await files.exists(target)) before = await current(time);
      await phase("snapshot-read");
      if (d.operation === "initialize") {
        if (before !== null) fail("store-already-initialized"); after = document(d.ledger);
      } else {
        if (before === null) fail("store-ledger-missing");
        if (d.operation === "read") { r.state = "unchanged"; r.snapshot = before.data.ledger; r.snapshotSha256 = before.data.ledgerSha256; r.reasons = ["store-snapshot-read"]; }
        else {
          const t = copyInertJson(d.transition);
          if (!same(t.ledger, before.data.ledger) || t.expectedRevision !== before.data.ledger.revision || t.expectedLedgerSha256 !== before.data.ledgerSha256) fail("store-snapshot-conflict");
          t.now = time;
          if (t.operation === "reserve") { t.admissionInput.now = time; t.admissionInput.ledger = copyInertJson(before.data.ledger); }
          const proposal = transition(t); if (proposal.state !== "proposed") fail("store-transition-blocked");
          after = document(proposal.nextLedger);
        }
      }
      if (after) {
        const bytes = Buffer.from(canonical(after) + "\n"); if (bytes.length > FILE_LIMIT) fail("store-file-limit");
        inspect(bytes, time);
        temp = await files.exclusive(path.join(dir, `.ledger-${randomUUID()}.tmp`)); await phase("temp-created");
        await files.write(temp, bytes); await phase("temp-synced");
        const readback = await files.owned(temp); if (!same(inspect(readback.bytes, time), after)) fail("store-invalid-temporary");
        await phase("before-publish"); time = now(); permission(d, time);
        // Recheck temporal admission at publication, without refreshing evidence stamps.
        if (d.operation === "apply") {
          const t = copyInertJson(d.transition); t.now = time;
          if (t.operation === "reserve") t.admissionInput.now = time;
          const again = transition(t); if (again.state !== "proposed") fail("store-transition-blocked");
          if (!same(again.nextLedger, after.ledger)) {
            // Time-sensitive proposals must be regenerated, not silently installed stale.
            fail("store-publication-time-changed");
          }
        } else inspect(bytes, time);
        await fence(); await files.owned(temp); await unchanged(time);
        publishing = true; await files.io.rename(temp.full, target); published = true; r.writeObservation = "replaced";
        await phase("published"); await files.syncDirectory(dir, dirStat); r.durability = "confirmed";
        await phase("directory-synced"); await fence(); const final = await current(now());
        if (!same(final.data, after) || bytesHash(final.bytes) !== temp.digest) fail("store-publication-mismatch");
        await phase("confirmed"); r.state = "committed"; r.snapshot = final.data.ledger; r.snapshotSha256 = final.data.ledgerSha256; r.reasons = ["store-transition-committed"];
        if (sessionConsumer) {
          // Internal session: lock remains held. A public committed JSON cannot enter here.
          let active = true;
          const pending = new Set();
          const attemptId = d.transition.attemptId;
          const getSnapshot = () => copyInertJson(r.snapshot);
          const guard = async () => {
            if (!active) fail("store-session-closed");
            const time = now(); permission(d, time); await sessionGate(time);
            await fence(); const observed = await current(time);
            if (!same(observed.data.ledger, r.snapshot)) fail("store-snapshot-conflict");
          };
          const performSession = async value => {
            await guard();
            const t = copyInertJson(value);
            if (!["mark-started", "interrupt", "settle"].includes(t.operation) || t.attemptId !== attemptId ||
                !check.request({ ...d, transition: t }) || !same(t.ledger, r.snapshot) ||
                t.expectedRevision !== r.snapshot.revision || t.expectedLedgerSha256 !== hash(r.snapshot)) fail("store-session-transition-invalid");
            let time = now(); t.now = time;
            const proposed = transition(t); if (proposed.state !== "proposed") fail("store-transition-blocked");
            const previous = await current(time); after = document(proposed.nextLedger);
            const bytes = Buffer.from(canonical(after) + "\n"); if (bytes.length > FILE_LIMIT) fail("store-file-limit"); inspect(bytes, time);
            const next = await files.exclusive(path.join(dir, `.ledger-${randomUUID()}.tmp`)); sessionResources.push(next);
            await files.write(next, bytes); await phase(`session-${t.operation}-before-publish`);
            const readback = await files.owned(next); if (!same(inspect(readback.bytes, time), after)) fail("store-invalid-temporary");
            time = now(); t.now = time; await guard();
            const checked = transition(t);
            if (checked.state !== "proposed" || !same(checked.nextLedger, after.ledger)) fail("store-publication-time-changed");
            const old = await current(time);
            if (!files.equal(previous.stat, old.stat) || bytesHash(previous.bytes) !== bytesHash(old.bytes)) fail("store-snapshot-conflict");
            await files.owned(next); r.durability = "unconfirmed";
            await files.io.rename(next.full, target); await phase(`session-${t.operation}-published`);
            await files.syncDirectory(dir, dirStat); r.durability = "confirmed"; await fence();
            const confirmed = await current(now());
            if (!same(confirmed.data, after) || bytesHash(confirmed.bytes) !== next.digest) fail("store-publication-mismatch");
            r.snapshot = confirmed.data.ledger; r.snapshotSha256 = confirmed.data.ledgerSha256;
            await phase(`session-${t.operation}-confirmed`);
            return getSnapshot();
          };
          const applySession = value => {
            const operation = performSession(value); pending.add(operation);
            operation.then(() => pending.delete(operation), () => pending.delete(operation));
            return operation;
          };
          const bindingSha256 = await sessionGate(now());
          const handle = createFixturePermit(async () => {
            await guard();
            if (r.snapshot.attempts.find(a => a.attemptId === attemptId)?.state !== "reserved") fail("store-session-not-reserved");
          }, () => applySession({ schemaVersion: "1.0.0", operation: "mark-started", now: now(), ledger: getSnapshot(),
            expectedRevision: r.snapshot.revision, expectedLedgerSha256: r.snapshotSha256, attemptId }), bindingSha256);
          try {
            await phase("session-reserved");
            await sessionConsumer(Object.freeze({ handle, snapshot: getSnapshot, apply: applySession }));
            if (r.snapshot.attempts.find(a => a.attemptId === attemptId)?.state !== "settled") fail("store-session-reconciliation-required");
            await guard();
          } finally {
            active = false; revokeFixturePermit(handle);
            // Do not close descriptors or return while a started-observation write is still in flight.
            await Promise.allSettled([...pending]);
          }
        }
      }
    } catch (e) {
      const primary = files.code(e); r.reasons = [primary]; r.state = "blocked"; r.snapshot = null; r.snapshotSha256 = null;
      if (primary === "store-created-resource-unusable") { r.state = "indeterminate"; r.cleanup = "intervention-required"; }
      if (publishing) {
        keep = true; r.state = "indeterminate";
        try {
          const observed = await current(now());
          if (after && same(observed.data, after)) { published = true; r.writeObservation = "replaced"; }
          else if (before && bytesHash(observed.bytes) === bytesHash(before.bytes)) r.writeObservation = "unchanged";
          else r.writeObservation = "unknown";
        } catch { r.writeObservation = "unknown"; }
      }
    } finally {
      try {
        if (lock) {
          await phase("before-cleanup");
          await files.directory(root, rootStat); await files.directory(dir, dirStat);
          if (!keep) {
            if (temp && !published) await files.remove(temp, dir, dirStat);
            await files.remove(lock, dir, dirStat); await files.syncDirectory(dir, dirStat);
            await phase("after-cleanup");
          } else r.cleanup = "intervention-required";
        }
      } catch { r.cleanup = "intervention-required"; r.state = "indeterminate"; r.reasons.push("store-cleanup-required"); r.snapshot = null; r.snapshotSha256 = null; }
      for (const resource of [...sessionResources, temp, lock]) if (resource) {
        try { await resource.handle.close(); } catch { r.cleanup = "intervention-required"; r.state = "indeterminate"; r.reasons.push("store-close-unconfirmed"); }
      }
    }
    if (r.state === "indeterminate" || r.state === "blocked") { r.snapshot = null; r.snapshotSha256 = null; }
    r.reasons = [...new Set(r.reasons)];
    if (!check.report(r)) throw Error("Local runtime store invariant failed");
    return r;
  }
  const store = input => execute(input, null, null);
  // Trusted C2.2 coordinator only. JSON operation API and all C2.1 reports stay unchanged.
  store.withFixtureSession = async (input, consumer, gate) => {
    const d = copyInertJson(input);
    if (d?.operation !== "apply" || d?.transition?.operation !== "reserve" || typeof consumer !== "function" || typeof gate !== "function") throw Error("Invalid trusted fixture session");
    return execute(d, consumer, gate);
  };
  return store;
}
