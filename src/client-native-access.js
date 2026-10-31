import { supportsDiagnosticHost } from "./client-local-platform.js";
import fs from "node:fs/promises";
import path from "node:path";
import { spawn as nativeSpawn } from "node:child_process";
import { types } from "node:util";
import Ajv2020 from "ajv/dist/2020.js";
import { hash } from "./client-runtime-core.js";
import { createStoreFiles } from "./client-runtime-store-files.js";
import { copyInertJson } from "./client-output-json.js";
import { createNativePreflightEvaluator, createNativeAccessExtractor, strictPreflightJson } from "./client-native-preflight.js";
import { verifyPreflightCandidate, absolutePhysicalName } from "./client-native-preflight-files.js";

const permits = new WeakMap(), monoMs = () => Number(process.hrtime.bigint() / 1000000n);
export const nativeAccessScope = cfg => hash({ candidate: cfg.candidate, recipe: ["auth", "status"], limits: cfg.limits, environmentProfile: "native-access-minimal-v1" });
// Trusted orchestration only; hashes/JSON never create human approval themselves.
export function createNativeAccessPermit(cfg, input) {
  const h = Object.freeze(Object.create(null)); permits.set(h, { binding: hash({ cfg: copyInertJson(cfg), input: strictPreflightJson(input) }), used: false, live: true }); return h;
}
export function revokeNativeAccessPermit(h) { const p = permits.get(h); if (p) p.live = false; }

export function createNativeAccessCollector(schema, candidateSchema, configuration, authorization, dependencies = {}) {
  const platformAdmitted = supportsDiagnosticHost(process.platform, process.arch, dependencies);
  const cfg = copyInertJson(configuration), cs = copyInertJson(candidateSchema);
  if (cs.$id !== "https://agent-toolkit.local/schemas/agent-client-native-diagnostics.schema.json") throw Error("Invalid candidate schema");
  const ajv = new Ajv2020({ strict: true }); ajv.addSchema(cs);
  ajv.addFormat("date-time", { type: "string", validate: v => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString() === v.replace(/Z$/, ".000Z") });
  const ps = copyInertJson(schema); ajv.addSchema(ps);
  const reportValid = ajv.compile({ $ref: ps.$id + "#/$defs/accessReport" });
  const pinValid = ajv.compile({ $ref: cs.$id + "#/$defs/pin" });
  const l = cfg.limits;
  if (Object.keys(cfg).sort().join() !== "candidate,limits,workspaceParent" || !pinValid(cfg.candidate) ||
      ![cfg.workspaceParent, cfg.candidate.entryPath, cfg.candidate.artifactPath].every(absolutePhysicalName) ||
      Object.keys(l).sort().join() !== "confirmationMs,graceMs,maxErrorBytes,maxOutputBytes,timeoutMs,totalTimeoutMs" ||
      Object.values(l).some(v => !Number.isSafeInteger(v) || v < 1) || l.timeoutMs > 15000 || l.totalTimeoutMs > 90000 ||
      l.timeoutMs > l.totalTimeoutMs || l.graceMs > 1000 || l.confirmationMs > 1000 || l.graceMs + l.confirmationMs >= l.timeoutMs ||
      l.maxOutputBytes > 32768 || l.maxErrorBytes > 32768) throw Error("Invalid access configuration");
  const policy = { expectedScopeSha256: nativeAccessScope(cfg), maxEvidenceAgeSeconds: 3600, revokedReferences: dependencies.revokedReferences ?? [] };
  const evaluate = createNativePreflightEvaluator(schema, policy), extract = createNativeAccessExtractor(schema);
  const spawn = dependencies.spawn ?? nativeSpawn, kill = dependencies.kill ?? process.kill.bind(process);
  const mono = dependencies.monotonic ?? monoMs, clock = dependencies.clock ?? Date.now;
  const io = { ...fs, ...dependencies.io }, files = createStoreFiles(dependencies.io); let invoked = false;
  return Object.freeze({ async run(input) {
    const began = mono(), deadline = began + l.totalTimeoutMs;
    const r = { scope: "native-access-only", state: "blocked", nativeExecuted: false, spawnAttempts: 0,
      inferenceRequested: false, actualModelCalls: null, runtimeReady: false, verifiedAdmission: false,
      externalBillingVerified: false, remoteCancellationVerified: false, terminationConfirmed: true,
      stdoutBytes: 0, stderrBytes: 0, elapsedMs: 0, preflight: null, reasons: [] };
    let workspace, owned, parent, claimed = false, auth = null;
    try {
      if (invoked) throw Error("permission"); invoked = true;
      const d = strictPreflightJson(input), p = !types.isProxy(authorization) && permits.get(authorization);
      if (!p || !p.live || p.used || p.binding !== hash({ cfg, input: d })) throw Error("permission");
      p.used = true; claimed = true;
      if (!platformAdmitted) throw Error("platform");
      const current = new Date(clock()).toISOString().replace(/\.\d{3}Z$/, "Z");
      r.preflight = evaluate({ ...d, now: current });
      if (!r.preflight.queryEligible) { r.reasons = ["access-controls-insufficient"]; return { report: r, auth }; }
      await verifyPreflightCandidate(cfg.candidate, { io: dependencies.io, deadline, monotonic: mono });
      if (/(CloudStorage|Mobile Documents|Dropbox|OneDrive|iCloud)/i.test(cfg.workspaceParent)) throw Error("parent");
      parent = await files.directory(cfg.workspaceParent);
      if (parent.dev !== cfg.candidate.expectedDev || parent.uid !== cfg.candidate.expectedUid) throw Error("parent");
      for (let dir = cfg.workspaceParent; dir !== path.parse(dir).root; dir = path.dirname(dir)) {
        try { await io.lstat(path.join(dir, ".git")); throw Error("git"); } catch (e) { if (e.code !== "ENOENT") throw e; }
      }
      workspace = await io.mkdtemp(path.join(cfg.workspaceParent, "access-work-")); await io.chmod(workspace, 0o700); owned = await files.directory(workspace);
      if (!p.live || dependencies.signal?.aborted || mono() >= deadline - l.graceMs - l.confirmationMs) throw Error("deadline");
      const env = { HOME: process.env.HOME, TMPDIR: workspace, PATH: "/usr/bin:/bin:/usr/sbin:/sbin", LANG: "C", LC_ALL: "C",
        DISABLE_UPDATES: "1", DISABLE_AUTOUPDATER: "1", CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1", ENABLE_CLAUDEAI_MCP_SERVERS: "false" };
      if (!absolutePhysicalName(env.HOME)) throw Error("home");
      const end = Math.min(deadline, mono() + l.timeoutMs); r.spawnAttempts = 1; r.terminationConfirmed = false;
      let child;
      try { child = spawn(cfg.candidate.artifactPath, ["auth", "status"], { shell: false, detached: true, cwd: workspace, env, stdio: ["ignore", "pipe", "pipe"] }); }
      catch { r.terminationConfirmed = true; throw Error("spawn-failed"); }
      let decoded = "";
      await new Promise(resolve => {
        const out = new TextDecoder("utf-8", { fatal: true }), err = new TextDecoder("utf-8", { fatal: true });
        let done = false, canceled = false, at = null, forced = false, gone = false, failedSpawn = false;
        let exited = false, closed = false, outClosed = false, errClosed = false, exitCode = null, timer, hard;
        const add = c => { if (!r.reasons.includes(c)) r.reasons.push(c); };
        const send = sig => { if (!r.nativeExecuted || gone) return; try { kill(-child.pid, sig); } catch (e) { if (e.code === "ESRCH") gone = true; else add("access-signal-unconfirmed"); } };
        const alive = () => { if (gone || failedSpawn) return false; if (!r.nativeExecuted) return true; try { kill(-child.pid, 0); return true; } catch (e) { if (e.code === "ESRCH") { gone = true; return false; } add("access-group-unconfirmed"); return true; } };
        const stop = (c, state = "failed") => { if (done) return; add(c); if (canceled) return; canceled = true; at = mono(); r.state = state; send("SIGTERM"); };
        const finish = uncertain => {
          if (done) return; done = true; clearInterval(timer); clearTimeout(hard); dependencies.signal?.removeEventListener("abort", abort);
          r.terminationConfirmed = failedSpawn || exited && closed && outClosed && errClosed && gone;
          if (uncertain || !r.terminationConfirmed || mono() > end) { r.state = "indeterminate"; add("access-termination-unconfirmed"); }
          else if (failedSpawn) r.state = "failed";
          else if (!canceled) {
            try { if (exitCode !== 0) throw Error("exit"); decoded += out.decode(); err.decode(); auth = extract(decoded); r.state = "completed"; }
            catch { r.state = "failed"; add("access-response-invalid"); auth = null; }
          }
          decoded = ""; child.stdout.destroy(); child.stderr.destroy(); resolve();
        };
        const poll = () => {
          if (done) return;
          if (mono() >= end - l.graceMs - l.confirmationMs && !canceled) stop("access-deadline", "timed-out");
          if (canceled && !forced && mono() - at >= l.graceMs) { forced = true; send("SIGKILL"); }
          const live = alive();
          if (exited && closed && outClosed && errClosed && !live) finish(false);
          else if (exited && live && !canceled) stop("access-descendants-unconfirmed");
          if (failedSpawn && closed) finish(false);
        };
        const abort = () => stop("access-canceled", "canceled");
        child.on("spawn", () => { r.nativeExecuted = true; if (done) send("SIGKILL"); else if (canceled) send("SIGTERM"); });
        child.on("error", () => { if (!r.nativeExecuted) { failedSpawn = true; add("access-spawn-failed"); } else stop("access-process-error"); });
        child.on("exit", code => { exited = true; exitCode = code; poll(); }); child.on("close", () => { closed = true; poll(); });
        child.stdout.on("close", () => { outClosed = true; poll(); }); child.stderr.on("close", () => { errClosed = true; poll(); });
        child.stdout.on("error", () => stop("access-process-error")); child.stderr.on("error", () => stop("access-process-error"));
        child.stdout.on("data", b => { if (done || canceled) return; r.stdoutBytes += b.length; if (r.stdoutBytes > l.maxOutputBytes) stop("access-output-limit"); else try { decoded += out.decode(b, { stream: true }); } catch { stop("access-utf8-invalid"); } });
        child.stderr.on("data", b => { if (done || canceled) return; r.stderrBytes += b.length; if (r.stderrBytes > l.maxErrorBytes) stop("access-stderr-limit"); else try { err.decode(b, { stream: true }); } catch { stop("access-utf8-invalid"); } });
        dependencies.signal?.addEventListener("abort", abort, { once: true }); if (dependencies.signal?.aborted) abort();
        timer = setInterval(poll, 10); hard = setTimeout(() => { send("SIGKILL"); poll(); if (!done) finish(true); }, Math.max(1, end - mono()));
      });
      if (r.state === "completed") {
        await verifyPreflightCandidate(cfg.candidate, { io: dependencies.io, deadline, monotonic: mono });
        const observedAt = new Date(clock()).toISOString().replace(/\.\d{3}Z$/, "Z");
        r.preflight = evaluate({ ...d, now: observedAt, access: { data: auth,
          assessment: { source: "locally-observed", referenceId: "native-access-observation", checkedAt: observedAt, scopeSha256: policy.expectedScopeSha256 } } });
        if (r.preflight.state === "blocked") { r.state = "blocked"; r.reasons.push("access-preflight-incompatible"); }
      }
      if (!r.reasons.length) r.reasons = ["access-completed"];
    } catch { auth = null; r.state = r.nativeExecuted ? "indeterminate" : "blocked"; r.reasons = ["access-local-check-failed"]; }
    finally {
      if (claimed) revokeNativeAccessPermit(authorization);
      if (workspace && r.terminationConfirmed) try { await files.directory(cfg.workspaceParent, parent); await files.directory(workspace, owned); await io.rmdir(workspace); }
      catch { r.state = "indeterminate"; r.reasons.push("access-workspace-cleanup-required"); }
      r.elapsedMs = Math.max(0, Math.ceil(mono() - began));
      if (r.elapsedMs > l.totalTimeoutMs) { r.state = "indeterminate"; r.reasons.push("access-deadline"); }
      r.reasons = [...new Set(r.reasons)].sort();
      if (!reportValid(r)) throw Error("Access report invariant failed");
    }
    return { report: r, auth }; // auth is a private projection, never raw stdout.
  } });
}
