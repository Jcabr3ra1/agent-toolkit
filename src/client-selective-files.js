import fs from "node:fs/promises";
import path from "node:path";
import { constants } from "node:fs";
import { types } from "node:util";
import Ajv2020 from "ajv/dist/2020.js";
import { copyInertJson } from "./client-output-json.js";
import { hash } from "./client-runtime-core.js";
import { createSelectiveConfigParser, SELECTIVE_ID } from "./client-selective-config.js";

const permits = new WeakMap();
class ReadFailure extends Error { constructor(code) { super(code); this.code = code; } }
const fail = code => { throw new ReadFailure(code); };
const monoMs = () => Number(process.hrtime.bigint() / 1000000n);
const statIdentity = s => [s.dev, s.ino, s.uid, s.gid, s.mode, s.nlink, s.size, s.mtimeMs, s.ctimeMs];
const equal = (a, b) => JSON.stringify(statIdentity(a)) === JSON.stringify(statIdentity(b));
const safePath = p => typeof p === "string" && path.isAbsolute(p) && path.normalize(p) === p && !/[\x00-\x1f\x7f]/.test(p);

// Only trusted orchestration can turn the human's exact-path approval into a handle.
export function createSelectiveReadPermit(configuration) {
  const h = Object.freeze(Object.create(null)); permits.set(h, { binding: hash(copyInertJson(configuration)), used: false, live: true }); return h;
}
export function revokeSelectiveReadPermit(h) { const p = permits.get(h); if (p) p.live = false; }

/** Reads exactly two approved sources. No settings edits, clients or account queries. */
export function createSelectiveFileReader(schema, configuration, authorization, dependencies = {}) {
  const s = copyInertJson(schema), cfg = copyInertJson(configuration);
  if (s.$id !== SELECTIVE_ID) throw Error("Unsupported selective schema");
  const ajv = new Ajv2020({ strict: true }); ajv.addSchema(s); const limitsValid = ajv.compile({ $ref: SELECTIVE_ID + "#/$defs/limits" });
  const reportValid = ajv.compile({ $ref: SELECTIVE_ID + "#/$defs/fileReport" });
  if (Object.keys(cfg).sort().join() !== "aggregateBytes,limits,sources,timeoutMs" || !limitsValid(cfg.limits) || cfg.limits.blockBytes > cfg.limits.maxBytes ||
      !Number.isSafeInteger(cfg.timeoutMs) || cfg.timeoutMs < 1 || cfg.timeoutMs > 30000 || !Number.isSafeInteger(cfg.aggregateBytes) || cfg.aggregateBytes < 1 || cfg.aggregateBytes > 2097152 ||
      !Array.isArray(cfg.sources) || cfg.sources.length !== 2 || cfg.sources[0].sourceId !== "personal-settings" || cfg.sources[1].sourceId !== "global-state" ||
      cfg.sources.some(e => Object.keys(e).sort().join() !== "path,sourceId" || !safePath(e.path)) || cfg.sources[0].path === cfg.sources[1].path) throw Error("Invalid selective file configuration");
  const io = { ...fs, ...dependencies.io }, mono = dependencies.monotonic ?? monoMs, checkpoint = dependencies.checkpoint ?? (async () => {});
  const uid = process.getuid?.(); let invoked = false;
  const clock = () => { const n = mono(); if (!Number.isFinite(n) || n < 0) fail("selective-clock-unavailable"); return n; };
  const errorCode = e => e instanceof ReadFailure ? e.code : "selective-file-unconfirmed";
  async function physical(name) {
    let curr = path.parse(name).root; const identities = [];
    const parts = name.slice(curr.length).split(path.sep).filter(Boolean);
    if (parts.length > 64) fail("selective-path-unsafe");
    for (const [i, part] of parts.entries()) {
      curr = path.join(curr, part); const st = await io.lstat(curr);
      if (st.isSymbolicLink() || i < parts.length - 1 && !st.isDirectory()) fail("selective-path-unsafe");
      if (i < parts.length - 1) identities.push([st.dev, st.ino, st.uid, st.mode]);
    }
    return identities;
  }
  function allowed(st) {
    if (!st.isFile() || st.isSymbolicLink() || st.uid !== uid || st.nlink !== 1 || st.mode & 0o022) fail("selective-file-unsafe");
    if (st.size > cfg.limits.maxBytes) fail("selective-file-limit");
  }
  return Object.freeze({ async run(...args) {
    const r = { scope: "selective-local-structure-only", state: "blocked", sources: [],
      inferenceRequested: false, nativeExecuted: false, runtimeReady: false, verifiedAdmission: false,
      externalBillingVerified: false, effectiveControlsVerified: false, bytesRead: 0, elapsedMs: 0, reasons: [] };
    const observations = []; let began, claimed = false, activeSource = null;
    try {
      began = clock();
      if (invoked) fail("selective-permit-unavailable"); invoked = true;
      const p = !types.isProxy(authorization) && permits.get(authorization);
      if (!p || !p.live || p.used || p.binding !== hash(cfg)) fail("selective-permit-unavailable");
      p.used = true; claimed = true;
      if (args.length) fail("selective-input-forbidden");
      if (!Number.isInteger(uid)) fail("selective-owner-unavailable");
      const budget = () => { if (!p.live || dependencies.signal?.aborted) fail("selective-canceled"); if (clock() - began >= cfg.timeoutMs) fail("selective-deadline"); };
      for (const source of cfg.sources) {
        activeSource = source.sourceId; budget();
        let before;
        try { before = await io.lstat(source.path); } catch (e) { if (e.code === "ENOENT") fail("selective-source-missing"); throw e; }
        const parents = await physical(source.path); allowed(before);
        const parser = createSelectiveConfigParser(s, source.sourceId, cfg.limits);
        const h = await io.open(source.path, constants.O_RDONLY | constants.O_NOFOLLOW);
        const buffer = Buffer.alloc(cfg.limits.blockBytes); let read = 0, projection;
        try {
          if (!equal(before, await h.stat())) fail("selective-file-changed");
          await checkpoint("opened", source.sourceId);
          for (;;) {
            budget();
            const remaining = Math.min(cfg.limits.maxBytes - read, cfg.aggregateBytes - r.bytesRead);
            if (remaining <= 0) {
              if (read !== before.size) fail("selective-read-limit"); break;
            }
            const { bytesRead } = await h.read(buffer, 0, Math.min(buffer.length, remaining), read);
            if (!bytesRead) break;
            read += bytesRead; r.bytesRead += bytesRead;
            const partial = parser.push(buffer.subarray(0, bytesRead)); buffer.fill(0);
            if (partial.state === "invalid") fail(partial.reasons[0]);
            await checkpoint("block-read", source.sourceId);
          }
          projection = parser.finish();
          if (projection.state !== "observed") fail(projection.reasons[0]);
          budget(); await checkpoint("before-revalidate", source.sourceId);
          const after = await h.stat(), named = await io.lstat(source.path); allowed(after); allowed(named);
          if (read !== before.size || !equal(before, after) || !equal(after, named) || JSON.stringify(parents) !== JSON.stringify(await physical(source.path))) fail("selective-file-changed");
          budget();
        } finally { buffer.fill(0); await h.close(); }
        budget(); // A delayed close cannot turn an over-deadline source into evidence.
        // Bytes scanner cannot claim an installation observation. Only this IO
        // wrapper attaches local provenance after full descriptor revalidation.
        r.sources.push({ sourceId: source.sourceId, state: "observed", provenance: "local-structure-observation", fields: projection.fields,
          projectionSha256: projection.projectionSha256, stats: projection.stats });
        observations.push({ sourceId: source.sourceId, dev: before.dev, ino: before.ino, uid: before.uid, mode: before.mode & 4095,
          size: before.size, mtimeMs: before.mtimeMs, ctimeMs: before.ctimeMs });
        activeSource = null;
      }
      r.state = "observed"; r.reasons = ["selective-local-observed"];
    } catch (e) {
      const code = errorCode(e); r.state = code === "selective-source-missing" ? "incomplete" : "blocked"; r.reasons = [code];
      if (activeSource) r.sources.push({ sourceId: activeSource, state: r.state, provenance: "pending", fields: [], projectionSha256: null, stats: null });
    } finally {
      if (claimed) revokeSelectiveReadPermit(authorization);
      if (began !== undefined) {
        try {
          r.elapsedMs = Math.max(0, Math.ceil(clock() - began));
          if (r.elapsedMs > cfg.timeoutMs) { r.state = "blocked"; r.reasons = ["selective-deadline"]; }
        }
        catch { r.state = "blocked"; r.reasons = ["selective-clock-unavailable"]; }
      }
    }
    if (!reportValid(r)) throw Error("Selective file report invariant failed");
    return { report: r, privateObservations: observations };
  } });
}
