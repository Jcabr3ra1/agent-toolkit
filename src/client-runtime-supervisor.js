import { supportsLocalPosix } from "./client-local-platform.js";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn as nativeSpawn } from "node:child_process";
import { claimFixturePermit } from "./client-runtime-fixture-permit.js";
import { createFixtureProtocol } from "./client-runtime-fixture-protocol.js";
import { copyBytes, ParseFailure } from "./client-output-json.js";
import { copyInertJson, hash } from "./client-runtime-core.js";

export const FIXTURES = Object.freeze(["success", "split-utf8", "silent", "blocked-stdin", "failure", "stdout-overflow", "stderr-overflow", "long-line", "event-overflow", "invalid-utf8", "forbidden-event", "duplicate-json", "after-terminal", "unterminated", "incomplete", "ignore-term", "parent-child", "child-after-parent", "stderr-invalid", "environment", "closed-stdin"]);
const script = fileURLToPath(new URL("./runtime-fixtures/runtime-supervisor/fixture.cjs", import.meta.url));
export const monotonicMs = () => Number(process.hrtime.bigint() / 1_000_000n);
const reason = e => e instanceof ParseFailure ? e.code : "fixture-local-error";

/** Trusted fixtures only. Internal dependencies cannot arrive in request JSON. */
export async function superviseFixture(handle, request, { signal, beganAt, checkpoint = () => {}, spawn = nativeSpawn,
  kill = process.kill.bind(process), monotonic = monotonicMs } = {}) {
  const r = { scope: "fixture-only", state: "not-started", fixtureExecuted: false, spawnAttempts: 0,
    nativeExecuted: false, runtimeReady: false, verifiedAdmission: false, modelCalls: 0,
    started: false, exitObserved: false, pipesClosed: false, groupObservation: "not-started",
    terminationConfirmed: false, stdoutBytes: 0, stderrBytes: 0, events: 0, elapsedMs: 0, reasons: [] };
  const start = beganAt ?? monotonic(); let l;
  let cwd, owned, capability, spawnReturned = false;
  try {
    request = copyInertJson(request); l = request.limits;
    if (!supportsLocalPosix(process.platform) || !FIXTURES.includes(request.fixtureId)) throw Error("fixture-not-admitted");
    const input = copyBytes(request.inputText, l.maxInputBytes);
    if (signal?.aborted) { r.reasons = ["fixture-canceled-before-start"]; r.terminationConfirmed = true; return r; }
    cwd = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "agent-fixture-work-")));
    await fs.chmod(cwd, 0o700); owned = await fs.lstat(cwd);
    // Fixed packaged program and Node executable; never a path or recipe from JSON.
    const source = await fs.lstat(script);
    if (!source.isFile() || source.isSymbolicLink() || (source.mode & 0o022)) throw Error("fixture-source-unsafe");
    if (monotonic() - start >= l.timeoutMs - l.graceMs - l.confirmationMs) throw Error("fixture-deadline-before-start");
    await checkpoint("fixture-before-claim"); capability = await claimFixturePermit(handle, hash(request));
    if (signal?.aborted || monotonic() - start >= l.timeoutMs - l.graceMs - l.confirmationMs) throw Error("fixture-stopped-before-start");
    r.spawnAttempts = 1;
    const child = spawn(process.execPath, [script, request.fixtureId], {
      shell: false, detached: true, cwd, env: { LANG: "C", LC_ALL: "C" }, stdio: ["pipe", "pipe", "pipe"]
    });
    spawnReturned = true;
    // No awaits between spawn and registration of all lifecycle/error handlers.
    await new Promise(resolve => {
      const protocol = createFixtureProtocol(l); const stderrDecoder = new TextDecoder("utf-8", { fatal: true });
      let done = false, canceled = false, cancelAt = null, forced = false, terminalFailure = false;
      let groupGone = false, spawnFailed = false, spawned = false, recordPending = false, recordFailed = false;
      let stdinClosed = false, stdoutClosed = false, stderrClosed = false, closeObserved = false, exitCode = null;
      let timer, hardTimer;
      const add = code => { if (!r.reasons.includes(code)) r.reasons.push(code); };
      const elapsed = () => Math.max(0, monotonic() - start);
      const observeGroup = () => {
        if (groupGone || spawnFailed) return false;
        if (!spawned) return true;
        try { kill(-child.pid, 0); return true; }
        catch (e) { if (e?.code === "ESRCH") { groupGone = true; return false; } add("fixture-group-unconfirmed"); return true; }
      };
      const send = sig => {
        if (!spawned || groupGone) return;
        try { kill(-child.pid, sig); }
        catch (e) { if (e?.code === "ESRCH") groupGone = true; else add("fixture-signal-unconfirmed"); }
      };
      const cancel = (code, state = "failed") => {
        if (done) return;
        add(code);
        if (done || canceled) return;
        canceled = true; terminalFailure = true; cancelAt = monotonic(); r.state = state;
        child.stdin.destroy(); send("SIGTERM");
      };
      const finalize = uncertain => {
        if (done) return; done = true; clearInterval(timer); clearTimeout(hardTimer); signal?.removeEventListener("abort", abort);
        const counts = protocol.counts(); Object.assign(r, { stdoutBytes: counts.stdoutBytes, events: counts.events,
          pipesClosed: stdinClosed && stdoutClosed && stderrClosed && closeObserved, elapsedMs: elapsed() });
        r.groupObservation = spawnFailed ? "not-started" : groupGone ? "absent" : "unconfirmed";
        // Process termination and uncertainty of storage/elapsed time are separate observations.
        r.terminationConfirmed = spawnFailed || r.exitObserved && r.pipesClosed && groupGone;
        if (uncertain || recordFailed || r.elapsedMs > l.timeoutMs) { r.state = "indeterminate"; add("fixture-reconciliation-required"); }
        else if (spawnFailed) r.state = "not-started";
        else if (!terminalFailure) r.state = "completed";
        if (!r.reasons.length) add("fixture-completed");
        // Never retain or print raw child data. Stop reads if closure is uncertain.
        child.stdin.destroy(); child.stdout.destroy(); child.stderr.destroy(); resolve();
      };
      const poll = () => {
        if (done) return;
        const ms = elapsed();
        if (ms >= l.timeoutMs - l.graceMs - l.confirmationMs && !canceled) cancel("fixture-deadline", "timed-out");
        if (canceled && !forced && monotonic() - cancelAt >= l.graceMs) { forced = true; send("SIGKILL"); }
        const alive = observeGroup();
        if (r.exitObserved && closeObserved && stdinClosed && stdoutClosed && stderrClosed && !recordPending && !alive) {
          if (!canceled && !spawnFailed) {
            try { if (exitCode !== 0) throw Error("failed"); protocol.finish(); stderrDecoder.decode(); }
            catch (e) { terminalFailure = true; r.state = "failed"; add(e instanceof ParseFailure ? e.code : "fixture-exit-or-stderr-invalid"); }
          }
          finalize(false);
        } else if (r.exitObserved && alive && !canceled) cancel("fixture-descendants-live");
        if (spawnFailed && closeObserved) finalize(false);
      };
      const abort = () => cancel("fixture-canceled", "canceled");
      child.on("spawn", () => {
        if (done) { spawned = true; send("SIGKILL"); return; }
        spawned = true; r.started = true; r.fixtureExecuted = true; recordPending = true;
        if (canceled) send("SIGTERM");
        Promise.resolve().then(() => checkpoint("fixture-spawned")).then(() => capability.started())
          .catch(() => { recordFailed = true; cancel("fixture-mark-started-unconfirmed"); })
          .finally(() => { recordPending = false; poll(); });
      });
      child.on("error", () => { if (done) return; if (!spawned) { spawnFailed = true; add("fixture-spawn-failed"); } else cancel("fixture-process-error"); });
      child.on("exit", code => { if (done) return; r.exitObserved = true; exitCode = code; poll(); });
      child.on("close", () => { closeObserved = true; poll(); });
      child.stdin.on("close", () => { stdinClosed = true; poll(); });
      child.stdout.on("close", () => { stdoutClosed = true; poll(); });
      child.stderr.on("close", () => { stderrClosed = true; poll(); });
      child.stdin.on("error", () => cancel("fixture-stdin-error"));
      child.stdout.on("error", () => cancel("fixture-stdout-error"));
      child.stderr.on("error", () => cancel("fixture-stderr-error"));
      child.stdout.on("data", chunk => {
        if (done || canceled) return;
        try { protocol.push(chunk); } catch (e) { cancel(reason(e)); }
      });
      child.stderr.on("data", chunk => {
        if (done || canceled) return;
        r.stderrBytes += chunk.length;
        if (r.stderrBytes > l.maxStderrBytes) cancel("fixture-stderr-limit");
        else try { stderrDecoder.decode(chunk, { stream: true }); } catch { cancel("fixture-stderr-invalid-utf8"); }
      });
      signal?.addEventListener("abort", abort, { once: true }); if (signal?.aborted) abort();
      timer = setInterval(poll, 10);
      hardTimer = setTimeout(() => { send("SIGKILL"); poll(); if (!done) finalize(true); }, Math.max(1, l.timeoutMs - elapsed()));
      try { child.stdin.end(input, error => { if (error) cancel("fixture-stdin-error"); }); }
      catch { cancel("fixture-stdin-error"); }
    });
  } catch (e) {
    r.reasons = [e instanceof ParseFailure ? e.code : "fixture-start-blocked"];
    r.terminationConfirmed = !spawnReturned; r.elapsedMs = Math.max(0, monotonic() - start);
    // A synchronous spawn failure is known not-started; an unexpected post-spawn error is uncertain.
    if (spawnReturned) r.state = "indeterminate";
  } finally {
    if (cwd && (!r.spawnAttempts || r.terminationConfirmed)) {
      try { const s = await fs.lstat(cwd); if (s.dev !== owned.dev || s.ino !== owned.ino || !s.isDirectory()) throw Error("replaced"); await fs.rmdir(cwd); }
      catch { r.state = "indeterminate"; r.reasons.push("fixture-workspace-cleanup-required"); }
    }
  }
  return copyInertJson(r);
}
