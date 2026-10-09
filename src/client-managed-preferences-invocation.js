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
import { createManagedPreferencesStreamReader } from "./client-managed-preferences.js";

export const INVOCATION_SCHEMA_ID = "https://agent-toolkit.local/schemas/agent-client-managed-preferences-invocation.schema.json";
const permits = new WeakMap(), monotonic = () => Number(process.hrtime.bigint() / 1000000n);
const environmentIdentity = () => hash({ home: process.env.HOME, uid: process.getuid?.() ?? null, profile: "preferences-minimal-v1" });
const physicalName = p => typeof p === "string" && path.isAbsolute(p) && path.normalize(p) === p &&
  !/[\x00-\x1f\x7f]/.test(p) && Buffer.from(p, "utf8").toString("utf8") === p;
const signature = s => JSON.stringify([s.dev, s.ino, s.uid, s.mode, s.nlink, s.size, s.mtimeMs, s.ctimeMs]);
const chunkLength = b => {
  if (types.isProxy(b) || !types.isUint8Array(b)) throw Error("chunk");
  return Object.getOwnPropertyDescriptor(Object.getPrototypeOf(Uint8Array.prototype), "length").get.call(b);
};

/** Trusted orchestration must obtain human approval first. JSON/hash is not consent. */
export function createManagedPreferencesInvocationPermit(configuration) {
  let cfg;
  try {
    cfg = copyInertJson(configuration);
    if (!Number.isSafeInteger(cfg.limits.permitLifetimeMs) || cfg.limits.permitLifetimeMs < 1 || cfg.limits.permitLifetimeMs > 3600000) throw Error();
  } catch { throw Error("Invalid helper permission configuration"); }
  const handle = Object.freeze(Object.create(null)), issuedAt = monotonic();
  permits.set(handle, { binding: hash(cfg), environment: environmentIdentity(), issuedAt, expiresAt: issuedAt + cfg.limits.permitLifetimeMs, live: true, used: false });
  return handle;
}
export function revokeManagedPreferencesInvocationPermit(handle) {
  if (types.isProxy(handle)) return;
  const p = permits.get(handle); if (p) p.live = false;
}

async function verifyArtifact(pin, io, files, deadline, now) {
  await files.physical(pin.path);
  const before = await io.lstat(pin.path);
  if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1 || before.dev !== pin.dev || before.ino !== pin.ino ||
      before.uid !== pin.uid || (before.mode & 4095) !== pin.mode || !(pin.mode & 0o100) || pin.mode & 0o022 || before.size !== pin.size ||
      before.mtimeMs !== pin.mtimeMs || before.ctimeMs !== pin.ctimeMs) throw Error("artifact");
  const handle = await io.open(pin.path, constants.O_RDONLY | constants.O_NOFOLLOW), digest = createHash("sha256");
  try {
    if (signature(before) !== signature(await handle.stat())) throw Error("artifact");
    const buffer = Buffer.alloc(65536); let offset = 0;
    while (offset < pin.size) {
      if (now() >= deadline) throw Error("deadline");
      const length = Math.min(buffer.length, pin.size - offset, 8388608 - offset);
      const { bytesRead } = await handle.read(buffer, 0, length, offset); if (!bytesRead) throw Error("artifact");
      offset += bytesRead; if (offset > pin.size || offset > 8388608) throw Error("artifact"); digest.update(buffer.subarray(0, bytesRead));
    }
    if (offset !== pin.size || digest.digest("hex") !== pin.sha256 || signature(before) !== signature(await handle.stat()) ||
        signature(before) !== signature(await io.lstat(pin.path))) throw Error("artifact");
    await files.physical(pin.path);
  } finally { await handle.close(); }
}

/** A single approved helper, not an AI client launcher or an isolation certificate. */
export function createManagedPreferencesInvocation(schema, preferencesSchema, configuration, authorization, dependencies = {}) {
  let cfg, validReport, prefSchema;
  try {
    cfg = copyInertJson(configuration);
    const s = copyInertJson(schema), ps = copyInertJson(preferencesSchema); prefSchema = ps;
    if (s.$id !== INVOCATION_SCHEMA_ID || ps.$id !== "https://agent-toolkit.local/schemas/agent-client-managed-preferences.schema.json") throw Error();
    const ajv = new Ajv2020({ strict: true, allErrors: true }); ajv.addSchema(ps); ajv.addSchema(s);
    const valid = ajv.compile({ $ref: `${INVOCATION_SCHEMA_ID}#/$defs/configuration` });
    if (!valid(cfg) || !physicalName(cfg.artifact.path) || !physicalName(cfg.workspaceParent.path) ||
        cfg.limits.graceMs + cfg.limits.confirmationMs + 20 >= cfg.limits.totalTimeoutMs) throw Error();
    createManagedPreferencesStreamReader(ps, cfg.expectedSource); // Validate the decoder contract before IO.
    validReport = ajv.compile({ $ref: `${INVOCATION_SCHEMA_ID}#/$defs/report` });
  } catch { throw Error("Invalid managed-preferences invocation configuration"); }
  const limits = cfg.limits, io = { ...fs, ...dependencies.io }, files = createStoreFiles(dependencies.io);
  const spawn = dependencies.spawn ?? systemSpawn, kill = dependencies.kill ?? process.kill.bind(process), now = dependencies.monotonic ?? monotonic;
  let invoked = false;
  return Object.freeze({ async run(...args) {
    const began = now(), deadline = began + limits.totalTimeoutMs;
    const r = { scope: "managed-preferences-helper-only", state: "blocked", decision: "no-client-start", spawnAttempts: 0,
      helperStarted: false, helperExecutionVerified: false, artifactMatchedBefore: false, artifactMatchedAfter: false,
      terminationConfirmed: true, cleanupRequired: false, stdoutBytes: 0, stderrBytes: 0, elapsedMs: 0, projection: null, reasons: [],
      nativeClientStarted: false, inferenceRequested: false, runtimeReady: false, verifiedAdmission: false,
      effectiveIsolationVerified: false, externalBillingVerified: false, preferencesQueriedVerified: false };
    let workspace, owned, parent, permission, claimed = false;
    const add = code => { if (!r.reasons.includes(code)) r.reasons.push(code); };
    try {
      if (invoked) throw Error("permission"); invoked = true;
      permission = !types.isProxy(authorization) && permits.get(authorization);
      if (!permission || !permission.live || permission.used || permission.binding !== hash(cfg) ||
          permission.environment !== environmentIdentity() ||
          began < permission.issuedAt || began >= permission.expiresAt) { add("helper-permission-rejected"); return r; }
      permission.used = true; claimed = true;
      if (args.length) { add("helper-input-forbidden"); return r; }
      if (process.platform !== "darwin" || cfg.artifact.uid !== process.getuid() || cfg.workspaceParent.uid !== process.getuid()) throw Error("identity");
      if (dependencies.signal?.aborted) { r.state = "canceled"; add("helper-canceled"); return r; }
      const home = process.env.HOME;
      if (!physicalName(home) || /(CloudStorage|Mobile Documents|Dropbox|OneDrive|iCloud)/i.test(cfg.workspaceParent.path)) throw Error("parent");
      parent = await files.directory(cfg.workspaceParent.path);
      if (parent.dev !== cfg.workspaceParent.dev || parent.ino !== cfg.workspaceParent.ino || parent.uid !== cfg.workspaceParent.uid ||
          (parent.mode & 4095) !== cfg.workspaceParent.mode) throw Error("parent");
      for (let dir = cfg.workspaceParent.path; ; dir = path.dirname(dir)) {
        try { await io.lstat(path.join(dir, ".git")); throw Error("git"); } catch (e) { if (e.code !== "ENOENT") throw e; }
        if (dir === path.parse(dir).root) break;
      }
      await verifyArtifact(cfg.artifact, io, files, deadline, now); r.artifactMatchedBefore = true;
      workspace = await io.mkdtemp(path.join(cfg.workspaceParent.path, "preferences-work-")); await io.chmod(workspace, 0o700); owned = await files.directory(workspace);
      if (!permission.live || dependencies.signal?.aborted || now() >= Math.min(deadline, permission.expiresAt) - limits.graceMs - limits.confirmationMs) throw Error("pre-start");
      const stream = createManagedPreferencesStreamReader(prefSchema, cfg.expectedSource);
      const env = { HOME: home, TMPDIR: workspace, PATH: "/usr/bin:/bin", LANG: "C", LC_ALL: "C" };
      r.spawnAttempts = 1; r.terminationConfirmed = false;
      let child;
      try { child = spawn(cfg.artifact.path, [], { shell: false, detached: true, cwd: workspace, env, stdio: ["ignore", "pipe", "pipe"] }); }
      catch { r.terminationConfirmed = true; add("helper-spawn-failed"); throw Error("spawn"); }
      await new Promise(resolve => {
        let done = false, stopped = false, stoppedAt = null, forced = false, gone = false, failedSpawn = false, pid = null;
        let exited = false, closed = false, outClosed = false, errClosed = false, exitCode = null, timer, hard;
        const send = signal => {
          if (pid === null || gone) return;
          try { kill(-pid, signal); } catch (e) { if (e.code === "ESRCH") gone = true; else add("helper-signal-unconfirmed"); }
        };
        const alive = () => {
          if (gone || failedSpawn) return false;
          if (pid === null) return true;
          try { kill(-pid, 0); return true; } catch (e) { if (e.code === "ESRCH") { gone = true; return false; } add("helper-group-unconfirmed"); return true; }
        };
        const stop = (code, state = "failed", decoderCode = "preferences-transport-error") => {
          if (done) return; add(code);
          if (stopped) return;
          stopped = true; stoppedAt = now(); r.state = state; stream.abort(decoderCode); send("SIGTERM");
        };
        const finish = uncertain => {
          if (done) return; done = true; clearInterval(timer); clearTimeout(hard); dependencies.signal?.removeEventListener("abort", abort);
          r.terminationConfirmed = failedSpawn || exited && closed && outClosed && errClosed && gone;
          if (uncertain || !r.terminationConfirmed || now() > deadline) { r.state = "indeterminate"; add("helper-termination-unconfirmed"); stream.abort("preferences-transport-unconfirmed"); }
          else if (failedSpawn) r.state = "failed";
          else if (!stopped) {
            const projection = stream.finish(exitCode);
            if (projection.state === "invalid") { r.state = "failed"; add("helper-protocol-invalid"); }
            else { r.projection = projection; r.state = projection.state === "helper-failed" ? "helper-failed" : "completed"; }
          }
          if (stopped || uncertain || failedSpawn) stream.finish(null);
          child.stdout.destroy(); child.stderr.destroy(); resolve();
        };
        const poll = () => {
          if (done) return;
          if (!permission.live || now() >= permission.expiresAt) stop("helper-permission-revoked", "canceled");
          if (now() >= deadline - limits.graceMs - limits.confirmationMs && !stopped) stop("helper-deadline", "timed-out", "preferences-transport-timeout");
          if (stopped && !forced && now() - stoppedAt >= limits.graceMs) { forced = true; send("SIGKILL"); }
          const live = alive();
          if (exited && closed && outClosed && errClosed && !live) finish(false);
          else if (exited && live && !stopped) stop("helper-descendants-unconfirmed");
          if (failedSpawn && closed) finish(false);
          if (!done && stopped && forced && now() - stoppedAt >= limits.graceMs + limits.confirmationMs) finish(true);
        };
        const abort = () => stop("helper-canceled", "canceled");
        child.on("spawn", () => {
          if (!Number.isSafeInteger(child.pid) || child.pid <= 1) { stop("helper-pid-unavailable"); return; }
          pid = child.pid;
          if (done) { send("SIGKILL"); return; }
          r.helperStarted = true; if (stopped) send("SIGTERM");
        });
        child.on("error", () => { if (done) return; if (!r.helperStarted) { failedSpawn = true; add("helper-spawn-failed"); } else stop("helper-process-error"); });
        child.on("exit", code => { exited = true; exitCode = code; poll(); }); child.on("close", () => { closed = true; poll(); });
        child.stdout.on("close", () => { outClosed = true; poll(); }); child.stderr.on("close", () => { errClosed = true; poll(); });
        child.stdout.on("error", () => stop("helper-stream-error")); child.stderr.on("error", () => stop("helper-stream-error"));
        child.stdout.on("data", chunk => {
          if (done || stopped) return;
          try {
            r.stdoutBytes += chunkLength(chunk);
            if (r.stdoutBytes > limits.maxOutputBytes) stop("helper-output-limit", "failed", "preferences-transport-overflow");
            else if (!stream.push(copyBytes(chunk, limits.maxOutputBytes))) stop("helper-output-invalid");
          } catch { stop("helper-output-invalid"); }
        });
        child.stderr.on("data", chunk => {
          if (done || stopped) return;
          try { const size = chunkLength(chunk); r.stderrBytes += size; if (size) stop(r.stderrBytes > limits.maxErrorBytes ? "helper-stderr-limit" : "helper-stderr-not-empty"); }
          catch { stop("helper-stderr-invalid"); }
        });
        dependencies.signal?.addEventListener("abort", abort, { once: true }); if (dependencies.signal?.aborted) abort();
        timer = setInterval(poll, 10);
        hard = setTimeout(() => { send("SIGKILL"); poll(); if (!done) finish(true); }, Math.max(1, deadline - now()));
      });
      if (r.state === "completed" || r.state === "helper-failed") {
        await verifyArtifact(cfg.artifact, io, files, deadline, now); r.artifactMatchedAfter = true;
        if (!permission.live || now() >= permission.expiresAt) throw Error("revoked");
        r.helperExecutionVerified = true;
      }
    } catch {
      r.state = r.helperStarted ? "indeterminate" : r.spawnAttempts ? "failed" : "blocked";
      r.projection = null; r.helperExecutionVerified = false; add("helper-local-check-failed");
    } finally {
      if (claimed) revokeManagedPreferencesInvocationPermit(authorization);
      if (workspace) {
        if (r.terminationConfirmed) try { await files.directory(cfg.workspaceParent.path, parent); await files.directory(workspace, owned); await io.rmdir(workspace); }
        catch { r.state = "indeterminate"; r.cleanupRequired = true; add("helper-workspace-cleanup-required"); }
        else { r.cleanupRequired = true; add("helper-workspace-retained"); }
      }
      r.elapsedMs = Math.max(0, Math.ceil(now() - began));
      if (r.elapsedMs > limits.totalTimeoutMs) { r.state = "indeterminate"; add("helper-deadline"); }
      if (!["completed", "helper-failed"].includes(r.state)) { r.projection = null; r.helperExecutionVerified = false; }
      if (!r.reasons.length) add(r.state === "completed" ? "helper-completed" : "helper-failed");
      r.reasons.sort(); if (!validReport(r)) throw Error("Managed-preferences invocation report invariant failed");
    }
    return r;
  } });
}
