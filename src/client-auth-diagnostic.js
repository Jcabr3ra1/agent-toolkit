import { supportsAuthHost } from "./client-local-platform.js";
import fs from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import { spawn as systemSpawn } from "node:child_process";
import { createHash } from "node:crypto";
import { types } from "node:util";
import Ajv2020 from "ajv/dist/2020.js";
import { copyInertJson, copyBytes } from "./client-output-json.js";
import { hash } from "./client-runtime-core.js";
import { createStoreFiles } from "./client-runtime-store-files.js";
import { createAuthDiagnosticParser, AUTH_DIAGNOSTIC_ID } from "./client-auth-diagnostic-parser.js";

const SCHEMA_ID = AUTH_DIAGNOSTIC_ID;
const permits = new WeakMap(), monotonic = () => Number(process.hrtime.bigint() / 1000000n);
const environmentIdentity = () => hash({ home: process.env.HOME, uid: process.getuid?.() ?? null, profile: "auth-status-minimal-v1" });
const physicalName = p => typeof p === "string" && path.isAbsolute(p) && path.normalize(p) === p &&
  !/[\x00-\x1f\x7f]/.test(p) && Buffer.from(p, "utf8").toString("utf8") === p;
const signature = s => JSON.stringify([s.dev, s.ino, s.uid, s.mode, s.nlink, s.size, s.mtimeMs, s.ctimeMs]);
const chunkLength = b => {
  if (types.isProxy(b) || !types.isUint8Array(b)) throw Error("chunk");
  return Object.getOwnPropertyDescriptor(Object.getPrototypeOf(Uint8Array.prototype), "length").get.call(b);
};

/** Trusted orchestration must obtain human approval first. JSON/hash is not consent. */
export function createAuthDiagnosticPermit(schema, configuration) {
  let cfg;
  try {
    cfg = copyInertJson(configuration);
    validateConfiguration(schema, cfg);
  } catch { throw Error("Invalid auth diagnostic permission configuration"); }
  const handle = Object.freeze(Object.create(null)), issuedAt = monotonic();
  permits.set(handle, { binding: hash(cfg), environment: environmentIdentity(), issuedAt, expiresAt: issuedAt + cfg.limits.permitLifetimeMs, live: true, used: false });
  return handle;
}
export function revokeAuthDiagnosticPermit(handle) {
  if (types.isProxy(handle)) return;
  const p = permits.get(handle); if (p) p.live = false;
}

async function verifyArtifact(cfg, io, files, deadline, now) {
  const pin = cfg.artifact, link = cfg.entryLink;
  const verifyLink = async () => {
    await files.physical(path.dirname(link.path));
    const s = await io.lstat(link.path);
    if (!s.isSymbolicLink() || s.dev !== link.dev || s.ino !== link.ino || s.uid !== link.uid ||
        (s.mode & 4095) !== link.mode || s.size !== link.size || s.mtimeMs !== link.mtimeMs || s.ctimeMs !== link.ctimeMs ||
        path.resolve(path.dirname(link.path), await io.readlink(link.path)) !== pin.path) throw Error("link");
  };
  await verifyLink();
  await files.physical(pin.path);
  const before = await io.lstat(pin.path);
  if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1 || before.dev !== pin.dev || before.ino !== pin.ino ||
      before.uid !== pin.uid || (before.mode & 4095) !== pin.mode || !(pin.mode & 0o100) || pin.mode & 0o7022 || before.size !== pin.size ||
      before.mtimeMs !== pin.mtimeMs || before.ctimeMs !== pin.ctimeMs) throw Error("artifact");
  const handle = await io.open(pin.path, constants.O_RDONLY | constants.O_NOFOLLOW), digest = createHash("sha256");
  try {
    if (signature(before) !== signature(await handle.stat())) throw Error("artifact");
    const buffer = Buffer.alloc(65536); let offset = 0;
    while (offset < pin.size) {
      if (now() >= deadline) throw Error("deadline");
      const length = Math.min(buffer.length, pin.size - offset, 536870912 - offset);
      const { bytesRead } = await handle.read(buffer, 0, length, offset); if (!bytesRead) throw Error("artifact");
      offset += bytesRead; if (offset > pin.size || offset > 536870912) throw Error("artifact"); digest.update(buffer.subarray(0, bytesRead));
    }
    if (offset !== pin.size || digest.digest("hex") !== pin.sha256 || signature(before) !== signature(await handle.stat()) ||
        signature(before) !== signature(await io.lstat(pin.path))) throw Error("artifact");
    await files.physical(pin.path); await verifyLink();
  } finally { await handle.close(); }
}

/** Hash binding for a trusted review; computing it is NOT evidence of safe startup. */
export function authDiagnosticReviewBinding(configuration) {
  const c = copyInertJson(configuration);
  return hash({ source: c.source, recipe: c.recipe, version: c.version, artifact: c.artifact, entryLink: c.entryLink,
    workspaceParent: c.workspaceParent, excludedRoots: c.excludedRoots, environment: environmentIdentity() });
}
function validateConfiguration(schema, cfg) {
  const s = copyInertJson(schema);
  if (s.$id !== SCHEMA_ID) throw Error();
  const ajv = new Ajv2020({ strict: true, allErrors: true }); ajv.addSchema(s);
  if (!ajv.compile({ $ref: SCHEMA_ID + "#/$defs/configuration" })(cfg) ||
      ![cfg.artifact.path, cfg.entryLink.path, cfg.workspaceParent.path, ...cfg.excludedRoots].every(physicalName) ||
      cfg.artifact.path === cfg.entryLink.path || cfg.workspaceParent.path === path.parse(cfg.workspaceParent.path).root ||
      cfg.limits.graceMs + cfg.limits.confirmationMs + 20 >= cfg.limits.processTimeoutMs ||
      cfg.limits.processTimeoutMs > cfg.limits.totalTimeoutMs) throw Error();
  return { schema: s, validReport: ajv.compile({ $ref: SCHEMA_ID + "#/$defs/report" }) };
}
function reviewed(cfg) {
  const b = authDiagnosticReviewBinding(cfg);
  return cfg.identityReview.state === "reviewed" && cfg.identityReview.bindingSha256 === b &&
    cfg.startupReview.state === "reviewed" && cfg.startupReview.bindingSha256 === b &&
    cfg.startupReview.effectsEnumerated && !cfg.startupReview.unresolvedEffects;
}

/** Only trusted orchestration may supply assessment/consent/dependencies. No model JSON is proof. */
export function createAuthDiagnosticCollector(schema, configuration, authorization, dependencies = {}) {
  let cfg, validReport, parserSchema;
  try {
    cfg = copyInertJson(configuration);
    const validated = validateConfiguration(schema, cfg);
    parserSchema = validated.schema; validReport = validated.validReport;
    createAuthDiagnosticParser(parserSchema, { maxBytes: cfg.limits.maxOutputBytes, blockBytes: cfg.limits.maxOutputBytes,
      maxDepth: 32, maxNodes: 20000, maxKeyBytes: 256, maxKeys: 4096 });
  } catch { throw Error("Invalid auth diagnostic configuration"); }
  const limits = cfg.limits, io = { ...fs, ...dependencies.io }, files = createStoreFiles(dependencies.io);
  const spawn = dependencies.spawn ?? systemSpawn, kill = dependencies.kill ?? process.kill.bind(process), now = dependencies.monotonic ?? monotonic;
  let invoked = false;
  return Object.freeze({ async run(...args) {
    const began = now(), deadline = began + limits.totalTimeoutMs;
    const r = { scope: "auth-status-only", source: cfg.source, state: "blocked-before-start", spawnAttempts: 0,
      processStarted: false, nativeExecuted: false, artifactMatchedBefore: false, artifactMatchedAfter: false,
      terminationConfirmed: true, cleanupRequired: false, stdoutBytes: 0, stderrBytes: 0, elapsedMs: 0, projection: null, reasons: [],
      inferenceRequested: false, runtimeReady: false, verifiedAdmission: false,
      externalBillingVerified: false, remoteCancellationVerified: false, actualModelCalls: null };
    let workspace, owned, parent, permission, claimed = false;
    const add = code => { if (!r.reasons.includes(code)) r.reasons.push(code); };
    try {
      if (invoked) throw Error("permission"); invoked = true;
      permission = !types.isProxy(authorization) && permits.get(authorization);
      if (!permission || !permission.live || permission.used || permission.binding !== hash(cfg) ||
          permission.environment !== environmentIdentity() ||
          began < permission.issuedAt || began >= permission.expiresAt) { add("auth-permission-rejected"); return r; }
      permission.used = true; claimed = true;
      if (args.length) { add("auth-input-forbidden"); return r; }
      if (!reviewed(cfg)) { add("auth-startup-not-reviewed"); return r; }
      if (!supportsAuthHost(process.platform, cfg.source) || cfg.artifact.uid !== process.getuid() || cfg.workspaceParent.uid !== process.getuid()) throw Error("identity");
      if (dependencies.signal?.aborted) { r.state = "canceled"; add("auth-canceled"); return r; }
      const home = process.env.HOME;
      if (!physicalName(home) || cfg.workspaceParent.path === home || /(CloudStorage|Mobile Documents|Dropbox|OneDrive|iCloud|Obsidian)/i.test(cfg.workspaceParent.path) ||
          cfg.excludedRoots.some(root => cfg.workspaceParent.path === root || cfg.workspaceParent.path.startsWith(root + path.sep))) throw Error("parent");
      parent = await files.directory(cfg.workspaceParent.path);
      if (parent.dev !== cfg.workspaceParent.dev || parent.ino !== cfg.workspaceParent.ino || parent.uid !== cfg.workspaceParent.uid ||
          (parent.mode & 4095) !== cfg.workspaceParent.mode) throw Error("parent");
      for (let dir = cfg.workspaceParent.path; ; dir = path.dirname(dir)) {
        for (const marker of [".git", ".obsidian"]) {
          try { await io.lstat(path.join(dir, marker)); throw Error("project"); } catch (e) { if (e.code !== "ENOENT") throw e; }
        }
        if (dir === path.parse(dir).root) break;
      }
      await verifyArtifact(cfg, io, files, deadline, now); r.artifactMatchedBefore = true;
      workspace = await io.mkdtemp(path.join(cfg.workspaceParent.path, "auth-work-")); await io.chmod(workspace, 0o700); owned = await files.directory(workspace);
      const stream = createAuthDiagnosticParser(parserSchema, { maxBytes: limits.maxOutputBytes, blockBytes: limits.maxOutputBytes,
        maxDepth: 32, maxNodes: 20000, maxKeyBytes: 256, maxKeys: 4096 });
      if (!permission.live || dependencies.signal?.aborted || environmentIdentity() !== permission.environment ||
          now() >= Math.min(deadline, permission.expiresAt) - limits.graceMs - limits.confirmationMs) throw Error("pre-start");
      const processDeadline = Math.min(deadline, now() + limits.processTimeoutMs);
      const env = { HOME: home, TMPDIR: workspace, PATH: "/usr/bin:/bin", LANG: "C", LC_ALL: "C" };
      r.spawnAttempts = 1; r.terminationConfirmed = false;
      let child;
      try { child = spawn(cfg.entryLink.path, ["auth", "status"], { shell: false, detached: true, cwd: workspace, env, stdio: ["ignore", "pipe", "pipe"] }); }
      catch { r.terminationConfirmed = true; add("auth-spawn-failed"); throw Error("spawn"); }
      await new Promise(resolve => {
        let done = false, stopped = false, stoppedAt = null, forced = false, gone = false, failedSpawn = false, pid = null;
        let exited = false, closed = false, outClosed = false, errClosed = false, exitCode = null, timer, hard;
        const send = signal => {
          if (pid === null || gone) return;
          try { kill(-pid, signal); } catch (e) { if (e.code === "ESRCH") gone = true; else add("auth-signal-unconfirmed"); }
        };
        const alive = () => {
          if (gone || failedSpawn) return false;
          if (pid === null) return true;
          try { kill(-pid, 0); return true; } catch (e) { if (e.code === "ESRCH") { gone = true; return false; } add("auth-group-unconfirmed"); return true; }
        };
        const stop = (code, state = "failed") => {
          if (done) return; add(code);
          if (stopped) return;
          stopped = true; stoppedAt = now(); r.state = state; stream.abort(); send("SIGTERM");
        };
        const finish = uncertain => {
          if (done) return; done = true; clearInterval(timer); clearTimeout(hard); dependencies.signal?.removeEventListener("abort", abort);
          r.terminationConfirmed = failedSpawn || exited && closed && outClosed && errClosed && gone;
          if (uncertain || !r.terminationConfirmed || now() > deadline) { r.state = "indeterminate"; add("auth-termination-unconfirmed"); stream.abort(); }
          else if (failedSpawn) r.state = "failed";
          else if (!stopped) {
            const projection = stream.finish(exitCode);
            if (projection.state === "invalid") { r.state = "failed"; add("auth-protocol-invalid"); }
            else { r.projection = projection.projection; r.state = "observation-complete"; }
          }
          if (stopped || uncertain || failedSpawn) stream.finish(null);
          child.stdout.destroy(); child.stderr.destroy(); resolve();
        };
        const poll = () => {
          if (done) return;
          if (!permission.live || now() >= permission.expiresAt) stop("auth-permission-revoked", "canceled");
          if (now() >= processDeadline - limits.graceMs - limits.confirmationMs && !stopped) stop("auth-deadline", "timed-out");
          if (stopped && !forced && now() - stoppedAt >= limits.graceMs) { forced = true; send("SIGKILL"); }
          const live = alive();
          if (exited && closed && outClosed && errClosed && !live) finish(false);
          else if (exited && live && !stopped) stop("auth-descendants-unconfirmed");
          if (failedSpawn && closed) finish(false);
          if (!done && stopped && forced && now() - stoppedAt >= limits.graceMs + limits.confirmationMs) finish(true);
        };
        const abort = () => stop("auth-canceled", "canceled");
        child.on("spawn", () => {
          if (done) {
            // A late transport callback cannot mutate an already returned report.
            if (!gone && Number.isSafeInteger(child.pid) && child.pid > 1) {
              // Best effort only: no new reason or termination claim after delivery.
              try { kill(-child.pid, "SIGKILL"); } catch { /* Keep the delivered uncertainty intact. */ }
            }
            return;
          }
          r.processStarted = true; r.nativeExecuted = cfg.source === "native-client-declaration";
          if (!Number.isSafeInteger(child.pid) || child.pid <= 1) { stop("auth-pid-unavailable"); return; }
          pid = child.pid;
          if (stopped) send("SIGTERM");
        });
        child.on("error", () => { if (done) return; if (!r.processStarted) { failedSpawn = true; add("auth-spawn-failed"); } else stop("auth-process-error"); });
        child.on("exit", code => { exited = true; exitCode = code; poll(); }); child.on("close", () => { closed = true; poll(); });
        child.stdout.on("close", () => { outClosed = true; poll(); }); child.stderr.on("close", () => { errClosed = true; poll(); });
        child.stdout.on("error", () => stop("auth-stream-error")); child.stderr.on("error", () => stop("auth-stream-error"));
        child.stdout.on("data", chunk => {
          if (done || stopped) return;
          try {
            r.stdoutBytes += chunkLength(chunk);
            if (r.stdoutBytes > limits.maxOutputBytes) stop("auth-output-limit");
            else if (stream.push(copyBytes(chunk, limits.maxOutputBytes)).state === "invalid") stop("auth-output-invalid");
          } catch { stop("auth-output-invalid"); }
        });
        child.stderr.on("data", chunk => {
          if (done || stopped) return;
          try { const size = chunkLength(chunk); r.stderrBytes += size; if (size) stop(r.stderrBytes > limits.maxErrorBytes ? "auth-stderr-limit" : "auth-stderr-not-empty"); }
          catch { stop("auth-stderr-invalid"); }
        });
        dependencies.signal?.addEventListener("abort", abort, { once: true }); if (dependencies.signal?.aborted) abort();
        timer = setInterval(poll, 10);
        hard = setTimeout(() => { send("SIGKILL"); poll(); if (!done) finish(true); }, Math.max(1, deadline - now()));
      });
      if (r.state === "observation-complete") {
        await verifyArtifact(cfg, io, files, deadline, now); r.artifactMatchedAfter = true;
        if (!permission.live || dependencies.signal?.aborted || now() >= permission.expiresAt ||
            environmentIdentity() !== permission.environment) throw Error("revoked");
      }
    } catch {
      r.state = r.processStarted ? "indeterminate" : r.spawnAttempts ? "failed" : "blocked-before-start";
      r.projection = null; add("auth-local-check-failed");
    } finally {
      if (workspace) {
        if (r.terminationConfirmed && owned) try { await files.directory(cfg.workspaceParent.path, parent); await files.directory(workspace, owned); await io.rmdir(workspace); }
        catch { r.state = "indeterminate"; r.cleanupRequired = true; add("auth-workspace-cleanup-required"); }
        else { r.cleanupRequired = true; add("auth-workspace-retained"); }
      }
      r.elapsedMs = Math.max(0, Math.ceil(now() - began));
      if (claimed && r.state === "observation-complete" && (!permission.live || dependencies.signal?.aborted ||
          now() >= permission.expiresAt || environmentIdentity() !== permission.environment)) {
        r.state = "canceled"; add("auth-permission-revoked");
      }
      if (claimed) revokeAuthDiagnosticPermit(authorization);
      if (r.elapsedMs > limits.totalTimeoutMs) { r.state = "indeterminate"; add("auth-deadline"); }
      if (r.state !== "observation-complete") r.projection = null;
      if (!r.reasons.length) add(r.state === "observation-complete" ? "auth-observation-complete" : "auth-failed");
      r.reasons.sort(); if (!validReport(r)) throw Error("Auth diagnostic report invariant failed");
    }
    return r;
  } });
}
