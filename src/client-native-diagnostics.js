import fs from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { types } from "node:util";
import { spawn as nativeSpawn } from "node:child_process";
import Ajv2020 from "ajv/dist/2020.js";
import { copyInertJson } from "./client-output-json.js";
import { hash } from "./client-runtime-core.js";
import { createStoreFiles } from "./client-runtime-store-files.js";

const ID = "https://agent-toolkit.local/schemas/agent-client-native-diagnostics.schema.json";
const permits = new WeakMap();
const monoMs = () => Number(process.hrtime.bigint() / 1_000_000n);
class DiagnosticFailure extends Error { constructor(code) { super(code); this.code = code; } }
const fail = code => { throw new DiagnosticFailure(code); };
const metadata = s => [s.dev, s.ino, s.uid, s.gid, s.mode, s.size, s.mtimeMs, s.ctimeMs];
const sameStat = (a, b) => JSON.stringify(metadata(a)) === JSON.stringify(metadata(b));
const safePath = p => typeof p === "string" && path.isAbsolute(p) && path.normalize(p) === p && !/[\x00-\x1f\x7f]/.test(p);

/** The caller is trusted orchestration code holding the human's scoped approval. */
export function createDiagnosticPermit(configuration) {
  const h = Object.freeze(Object.create(null));
  permits.set(h, { binding: hash(copyInertJson(configuration)), live: true, used: false });
  return h;
}
export function revokeDiagnosticPermit(h) { const p = permits.get(h); if (p) p.live = false; }

/** Strip terminal controls before extracting closed metadata, never return raw output. */
export function extractDiagnosticMetadata(recipe, text, options) {
  if (!["version", "help"].includes(recipe) || typeof text !== "string" || Buffer.byteLength(text) > 131072 ||
      types.isProxy(options) || !Array.isArray(options)) fail("diagnostic-output-unexpected");
  const clean = text.replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, "")
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "");
  if (/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(clean)) fail("diagnostic-output-unexpected");
  if (recipe === "version") {
    const m = /^\s*(\d{1,4}\.\d{1,4}\.\d{1,4}(?:-[a-z0-9][a-z0-9.-]{0,31})?)(?: \(Claude Code\))?\s*$/.exec(clean);
    if (!m) fail("diagnostic-output-unexpected");
    return { declaredVersion: m[1], optionsPresent: [] };
  }
  if (recipe !== "help" || !/^Usage:\s*claude\b/m.test(clean) || /\b(?:api[_-]?key|token)\s*[:=]\s*\S+/i.test(clean)) fail("diagnostic-output-unexpected");
  const found = new Set();
  for (const line of clean.split(/\r?\n/)) {
    if (line.length > 8192) fail("diagnostic-output-unexpected");
    const m = /^\s{0,8}(?:-[A-Za-z],?\s*)?(--[A-Za-z][A-Za-z-]*)(?=[, \t=]|$)/.exec(line);
    if (m && options.includes(m[1])) found.add(m[1]);
  }
  if (!found.has("--print")) fail("diagnostic-output-unexpected");
  return { declaredVersion: null, optionsPresent: [...found].sort() };
}

/** No request JSON, no prompts, no model selection, no account or inference commands. */
export function createNativeDiagnostics(schema, configuration, authorization, dependencies = {}) {
  const s = copyInertJson(schema), cfg = copyInertJson(configuration);
  if (s.$id !== ID) throw Error("Unsupported diagnostic schema");
  const ajv = new Ajv2020({ strict: true, allErrors: true }); ajv.addSchema(s);
  const valid = Object.fromEntries(["configuration", "report", "observation"].map(k => [k, ajv.compile({ $ref: `${ID}#/$defs/${k}` })]));
  if (!valid.configuration(cfg) || ![cfg.candidate.entryPath, cfg.candidate.artifactPath, cfg.workspaceParent].every(safePath) ||
      cfg.limits.graceMs + cfg.limits.confirmationMs >= cfg.limits.processTimeoutMs || cfg.limits.processTimeoutMs > cfg.limits.totalTimeoutMs) throw Error("Invalid diagnostic configuration");
  const options = s.$defs.observation.properties.optionsPresent.items.enum;
  const reasons = s.$defs.reason.enum;
  const io = { ...fs, ...dependencies.io }, spawn = dependencies.spawn ?? nativeSpawn;
  const kill = dependencies.kill ?? process.kill.bind(process), mono = dependencies.monotonic ?? monoMs;
  const files = createStoreFiles(dependencies.io), c = cfg.candidate, l = cfg.limits;
  const clock = () => { const n = mono(); if (!Number.isFinite(n) || n < 0) fail("diagnostic-local-error"); return n; };
  const code = e => e instanceof DiagnosticFailure && reasons.includes(e.code) ? e.code : "diagnostic-local-error";
  let invoked = false;

  async function physical(p) {
    let curr = path.parse(p).root;
    const parts = p.slice(curr.length).split(path.sep).filter(Boolean);
    if (parts.length > 64) fail("diagnostic-path-unsafe");
    for (let i = 0; i < parts.length; i++) {
      curr = path.join(curr, parts[i]); const stat = await io.lstat(curr);
      if (stat.isSymbolicLink() || i < parts.length - 1 && !stat.isDirectory()) fail("diagnostic-path-unsafe");
    }
  }
  async function artifact(deadline) {
    await physical(path.dirname(c.entryPath)); await physical(c.artifactPath);
    const link = await io.lstat(c.entryPath);
    if (!link.isSymbolicLink() || link.dev !== c.expectedDev || link.ino !== c.expectedLinkIno || link.uid !== c.expectedUid ||
        path.resolve(path.dirname(c.entryPath), await io.readlink(c.entryPath)) !== c.artifactPath) fail("diagnostic-artifact-changed");
    const before = await io.lstat(c.artifactPath);
    if (!before.isFile() || before.isSymbolicLink() || before.uid !== c.expectedUid || before.nlink !== 1 ||
        (before.mode & 0o7777) !== c.expectedMode || (before.mode & 0o022) || !(before.mode & 0o111) ||
        before.size !== c.expectedSize || before.dev !== c.expectedDev || before.ino !== c.expectedIno) fail("diagnostic-artifact-changed");
    const h = await io.open(c.artifactPath, constants.O_RDONLY | constants.O_NOFOLLOW);
    let total = 0; const digest = createHash("sha256"), buffer = Buffer.alloc(1048576);
    try {
      if (!sameStat(before, await h.stat())) fail("diagnostic-artifact-changed");
      for (;;) {
        if (clock() >= deadline) fail("diagnostic-deadline");
        const { bytesRead } = await h.read(buffer, 0, buffer.length, null); if (!bytesRead) break;
        total += bytesRead; if (total > 536870912 || total > c.expectedSize) fail("diagnostic-artifact-limit");
        digest.update(buffer.subarray(0, bytesRead));
      }
      if (total !== c.expectedSize || digest.digest("hex") !== c.expectedSha256 || !sameStat(before, await h.stat()) ||
          !sameStat(before, await io.lstat(c.artifactPath)) || !sameStat(link, await io.lstat(c.entryPath)) ||
          path.resolve(path.dirname(c.entryPath), await io.readlink(c.entryPath)) !== c.artifactPath) fail("diagnostic-artifact-changed");
      await physical(c.artifactPath); await physical(path.dirname(c.entryPath));
    } finally { await h.close(); }
  }
  async function privateParent() {
    if (/(?:CloudStorage|Mobile Documents|Dropbox|OneDrive|iCloud)/i.test(cfg.workspaceParent)) fail("diagnostic-private-parent-unsafe");
    await physical(cfg.workspaceParent);
    const stat = await files.directory(cfg.workspaceParent);
    if (stat.dev !== c.expectedDev || stat.uid !== c.expectedUid) fail("diagnostic-private-parent-unsafe");
    for (let p = cfg.workspaceParent; p !== path.parse(p).root; p = path.dirname(p)) {
      try { await io.lstat(path.join(p, ".git")); fail("diagnostic-private-parent-unsafe"); }
      catch (e) { if (e?.code !== "ENOENT") throw e; }
    }
    return stat;
  }
  function runOperation(recipe, workspace, environment, deadline, signal) {
    const r = { recipe, state: "not-started", spawnAttempts: 1, startObserved: false, elapsedMs: 0,
      stdoutBytes: 0, stderrBytes: 0, terminationConfirmed: false, reasons: [] };
    const start = clock(); const end = Math.min(deadline, start + l.processTimeoutMs);
    const chunks = [], stdoutDecoder = new TextDecoder("utf-8", { fatal: true }), stderrDecoder = new TextDecoder("utf-8", { fatal: true });
    let text = "";
    return new Promise(resolve => {
      let child, done = false, canceled = false, cancelAt = null, forced = false, groupGone = false;
      let spawned = false, spawnFailed = false, exited = false, closed = false, outClosed = false, errClosed = false, exitCode = null;
      let timer, hardTimer;
      const add = v => { if (!r.reasons.includes(v)) r.reasons.push(v); };
      const elapsed = () => Math.max(0, Math.ceil(clock() - start));
      const send = sig => {
        if (!spawned || groupGone) return;
        try { kill(-child.pid, sig); }
        catch (e) { if (e?.code === "ESRCH") groupGone = true; else add("diagnostic-signal-unconfirmed"); }
      };
      const alive = () => {
        if (spawnFailed || groupGone) return false; if (!spawned) return true;
        try { kill(-child.pid, 0); return true; }
        catch (e) { if (e?.code === "ESRCH") { groupGone = true; return false; } add("diagnostic-group-unconfirmed"); return true; }
      };
      const cancel = (why, state = "failed") => {
        if (done) return; add(why); if (canceled) return;
        canceled = true; cancelAt = clock(); r.state = state; send("SIGTERM");
      };
      const finish = uncertain => {
        if (done) return; done = true; clearInterval(timer); clearTimeout(hardTimer); signal?.removeEventListener("abort", abort);
        r.elapsedMs = elapsed(); r.terminationConfirmed = spawnFailed || exited && closed && outClosed && errClosed && groupGone;
        if (uncertain || !r.terminationConfirmed || clock() > end) { r.state = "indeterminate"; add("diagnostic-termination-unconfirmed"); }
        else if (spawnFailed) r.state = "failed";
        else if (!canceled) {
          try {
            if (exitCode !== 0) fail("diagnostic-exit-failed");
            chunks.push(stdoutDecoder.decode()); stderrDecoder.decode(); text = chunks.join("");
            r.state = "completed";
          } catch (e) { r.state = "failed"; add(e instanceof DiagnosticFailure ? code(e) : "diagnostic-invalid-utf8"); }
        }
        chunks.length = 0;
        child?.stdout?.destroy(); child?.stderr?.destroy();
        if (!r.reasons.length) add("diagnostic-completed");
        resolve({ operation: r, text: r.state === "completed" ? text : "" });
      };
      const poll = () => {
        if (done) return;
        if (clock() >= end - l.graceMs - l.confirmationMs && !canceled) cancel("diagnostic-deadline", "timed-out");
        if (canceled && !forced && clock() - cancelAt >= l.graceMs) { forced = true; send("SIGKILL"); }
        const live = alive();
        if (exited && closed && outClosed && errClosed && !live) finish(false);
        else if (exited && live && !canceled) cancel("diagnostic-group-unconfirmed");
        if (spawnFailed && closed) finish(false);
      };
      const abort = () => cancel("diagnostic-canceled", "canceled");
      try {
        child = spawn(c.artifactPath, [recipe === "version" ? "--version" : "--help"], {
          shell: false, detached: true, cwd: workspace, env: environment, stdio: ["ignore", "pipe", "pipe"]
        });
      } catch { spawnFailed = true; r.state = "failed"; r.terminationConfirmed = true; r.elapsedMs = elapsed(); add("diagnostic-spawn-failed"); resolve({ operation: r, text: "" }); return; }
      // No awaits before handlers; no diagnostic text is ever sent to stdin.
      child.on("spawn", () => { spawned = true; r.startObserved = true; if (done) send("SIGKILL"); else if (canceled) send("SIGTERM"); });
      child.on("error", () => { if (done) return; if (!spawned) { spawnFailed = true; add("diagnostic-spawn-failed"); } else cancel("diagnostic-process-error"); });
      child.on("exit", n => { exited = true; exitCode = n; poll(); });
      child.on("close", () => { closed = true; poll(); });
      child.stdout.on("close", () => { outClosed = true; poll(); });
      child.stderr.on("close", () => { errClosed = true; poll(); });
      child.stdout.on("error", () => cancel("diagnostic-process-error"));
      child.stderr.on("error", () => cancel("diagnostic-process-error"));
      child.stdout.on("data", b => {
        if (done || canceled) return; r.stdoutBytes += b.length;
        if (r.stdoutBytes > l.maxStdoutBytes) cancel("diagnostic-output-limit");
        else try { chunks.push(stdoutDecoder.decode(b, { stream: true })); } catch { cancel("diagnostic-invalid-utf8"); }
      });
      child.stderr.on("data", b => {
        if (done || canceled) return; r.stderrBytes += b.length;
        if (r.stderrBytes > l.maxStderrBytes) cancel("diagnostic-stderr-limit");
        else try { stderrDecoder.decode(b, { stream: true }); } catch { cancel("diagnostic-invalid-utf8"); }
      });
      signal?.addEventListener("abort", abort, { once: true }); if (signal?.aborted) abort();
      timer = setInterval(poll, 10);
      hardTimer = setTimeout(() => { send("SIGKILL"); poll(); if (!done) finish(true); }, Math.max(1, end - clock()));
    });
  }
  return Object.freeze({ async run(...args) {
    const r = { scope: "native-diagnostics-only", state: "blocked", nativeExecuted: false, inferenceRequested: false,
      actualModelCalls: null, runtimeReady: false, verifiedAdmission: false, externalBillingVerified: false,
      remoteCancellationVerified: false, spawnAttempts: 0, startsObserved: 0, elapsedMs: 0, operations: [], reasons: [] };
    const observation = { declaredVersion: null, optionsPresent: [] };
    let began, workspace, ownWorkspace, parentIdentity, claimed = false;
    try {
      began = clock(); const deadline = began + l.totalTimeoutMs;
      if (invoked) fail("diagnostic-permit-unavailable"); invoked = true;
      if (types.isProxy(authorization)) fail("diagnostic-permit-unavailable");
      const permit = permits.get(authorization);
      if (!permit || !permit.live || permit.used || permit.binding !== hash(cfg)) fail("diagnostic-permit-unavailable");
      permit.used = true; claimed = true;
      if (args.length) fail("diagnostic-input-forbidden");
      if (process.platform !== "darwin" || process.arch !== "arm64") fail("diagnostic-platform-not-admitted");
      if (dependencies.signal?.aborted) fail("diagnostic-canceled");
      const home = process.env.HOME;
      if (!safePath(home)) fail("diagnostic-path-unsafe");
      parentIdentity = await privateParent(); await artifact(deadline);
      workspace = await io.mkdtemp(path.join(cfg.workspaceParent, "diagnostic-work-"));
      await io.chmod(workspace, 0o700); ownWorkspace = await files.directory(workspace);
      const environment = { HOME: home, TMPDIR: workspace, PATH: "/usr/bin:/bin:/usr/sbin:/sbin", LANG: "C", LC_ALL: "C",
        DISABLE_AUTOUPDATER: "1", DISABLE_UPDATES: "1", CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1", ENABLE_CLAUDEAI_MCP_SERVERS: "false" };
      for (const recipe of ["version", "help"]) {
        await files.directory(cfg.workspaceParent, parentIdentity); await files.directory(workspace, ownWorkspace);
        if (!permit.live || dependencies.signal?.aborted) fail("diagnostic-canceled");
        if (clock() >= deadline - l.graceMs - l.confirmationMs) fail("diagnostic-deadline");
        const result = await runOperation(recipe, workspace, environment, deadline, dependencies.signal);
        r.operations.push(result.operation); r.spawnAttempts += result.operation.spawnAttempts;
        r.startsObserved += result.operation.startObserved ? 1 : 0; r.nativeExecuted = r.startsObserved > 0;
        if (result.operation.state !== "completed") { r.state = result.operation.state; r.reasons = result.operation.reasons; break; }
        await artifact(deadline);
        const extracted = extractDiagnosticMetadata(recipe, result.text, options);
        if (recipe === "version") observation.declaredVersion = extracted.declaredVersion;
        else observation.optionsPresent = extracted.optionsPresent;
      }
      if (r.operations.length === 2 && r.operations.every(o => o.state === "completed")) { r.state = "completed"; r.reasons = ["diagnostic-completed"]; }
    } catch (e) { r.reasons = [code(e)]; r.state = r.nativeExecuted ? "failed" : "blocked"; }
    finally {
      if (workspace && r.operations.every(o => o.terminationConfirmed)) {
        try {
          await files.directory(cfg.workspaceParent, parentIdentity); await files.directory(workspace, ownWorkspace);
          await io.rmdir(workspace);
        } catch { r.state = "indeterminate"; r.reasons = [...new Set([...r.reasons, "diagnostic-workspace-cleanup-required"])]; }
      }
      if (claimed) revokeDiagnosticPermit(authorization);
      if (began !== undefined) {
        r.elapsedMs = Math.max(0, Math.ceil(clock() - began));
        if (r.elapsedMs > l.totalTimeoutMs) { r.state = "indeterminate"; r.reasons = [...new Set([...r.reasons, "diagnostic-deadline"])]; }
      }
    }
    r.reasons.sort();
    if (!valid.report(r) || !valid.observation(observation)) throw Error("Diagnostic report invariant failed");
    return { report: r, observation }; // Observation is private; no raw streams or paths.
  } });
}
