import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn as nativeSpawn } from "node:child_process";
import { claimSupervisedPermit } from "./client-supervised-permit.js";
import { createSupervisedProtocol } from "./client-supervised-protocol.js";
import { createSupervisedContract, hash, monotonicMs, zeroMetrics, errorCode, fail } from "./client-supervised-contract.js";

const script = fileURLToPath(new URL("../testing/supervised/fixture.cjs", import.meta.url));
const childScript = fileURLToPath(new URL("../testing/supervised/child.cjs", import.meta.url));

/** Trusted fixture runner, not a native subscription runner. */
export function createSupervisedSupervisor(schema, dependencies = {}) {
  const contract = createSupervisedContract(schema);
  const spawn = dependencies.spawn ?? nativeSpawn, kill = dependencies.kill ?? process.kill.bind(process);
  const mono = dependencies.monotonic ?? monotonicMs, checkpoint = dependencies.checkpoint ?? (async () => {});
  return async function supervise(handle, input, { signal, beganAt = mono() } = {}) {
    const r = { scope: "fixture-only", state: "not-started", fixtureExecuted: false, nativeExecuted: false,
      runtimeReady: false, verifiedAdmission: false, actualModelCalls: null, fixtureModelCalls: 0,
      internalCallCeiling: null, remoteCancellationVerified: false, metrics: zeroMetrics(),
      exitObserved: false, pipesClosed: false, groupObservation: "not-started", reasons: [] };
    const elapsed = () => Math.max(0, Math.ceil(mono() - beganAt));
    let cwd, owned, spawnReturned = false, attempted = false;
    try {
      const d = contract.request(input), l = d.limits;
      if (process.platform !== "darwin" || process.arch !== "arm64") fail("supervised-platform-not-admitted");
      if (!Number.isFinite(beganAt) || beganAt > mono()) fail("supervised-invalid-deadline");
      const budget = () => {
        if (signal?.aborted) fail("supervised-canceled-before-start");
        if (elapsed() >= l.timeoutMs - l.graceMs - l.confirmationMs) fail("supervised-deadline-before-start");
      };
      budget();
      for (const file of [script, childScript]) {
        const s = await fs.lstat(file);
        if (!s.isFile() || s.isSymbolicLink() || (s.mode & 0o022)) fail("supervised-fixture-source-unsafe");
      }
      const parent = await fs.lstat(path.dirname(script));
      if (!parent.isDirectory() || parent.isSymbolicLink() || (parent.mode & 0o022)) fail("supervised-fixture-directory-unsafe");
      const workspaceParent = dependencies.workspaceParent ?? await fs.realpath(os.tmpdir());
      if (dependencies.workspaceParent !== undefined) {
        const s = await fs.lstat(workspaceParent);
        if (await fs.realpath(workspaceParent) !== workspaceParent || !s.isDirectory() || s.isSymbolicLink() ||
            (s.mode & 0o7777) !== 0o700 || s.uid !== process.getuid()) fail("supervised-workspace-parent-unsafe");
      }
      cwd = await fs.realpath(await fs.mkdtemp(path.join(workspaceParent, "agent-supervised-work-")));
      await fs.chmod(cwd, 0o700); owned = await fs.lstat(cwd);
      budget(); await checkpoint("before-claim");
      const capability = await claimSupervisedPermit(handle, hash(d));
      // Claim consumed the only local start right; no reuse if later checks fail.
      budget(); await checkpoint("before-spawn"); budget();
      r.metrics.spawnAttempts = 1; attempted = true;
      const child = spawn(process.execPath, [script, d.fixtureId], {
        shell: false, detached: true, cwd, env: { LANG: "C", LC_ALL: "C" }, stdio: ["pipe", "pipe", "pipe"]
      });
      spawnReturned = true;
      // Register all lifecycle handlers synchronously, before awaiting storage.
      await new Promise(resolve => {
        const protocol = createSupervisedProtocol(l), stderr = new TextDecoder("utf-8", { fatal: true });
        let done = false, spawned = false, spawnFailed = false, canceled = false, cancelAt = null, forced = false;
        let groupGone = false, startedWritePending = false, startedWriteFailed = false;
        let stdinClosed = false, stdoutClosed = false, stderrClosed = false, closed = false, exitCode = null;
        let timer, hardTimer;
        const add = c => { if (!r.reasons.includes(c)) r.reasons.push(c); };
        const groupAlive = () => {
          if (groupGone || spawnFailed) return false;
          if (!spawned) return true;
          try { kill(-child.pid, 0); return true; }
          catch (e) { if (e?.code === "ESRCH") { groupGone = true; return false; } add("supervised-group-unconfirmed"); return true; }
        };
        const send = sig => {
          if (!spawned || groupGone) return;
          try { kill(-child.pid, sig); }
          catch (e) { if (e?.code === "ESRCH") groupGone = true; else add("supervised-signal-unconfirmed"); }
        };
        const cancel = (code, state = "failed") => {
          if (done) return; add(code);
          if (canceled) return;
          canceled = true; cancelAt = mono(); r.state = state;
          child.stdin.destroy(); send("SIGTERM");
        };
        const finish = uncertain => {
          if (done) return; done = true;
          clearInterval(timer); clearTimeout(hardTimer); signal?.removeEventListener("abort", abort);
          const counts = protocol.counts();
          Object.assign(r.metrics, { stdoutBytes: counts.stdoutBytes, events: counts.events, elapsedMs: elapsed() });
          r.pipesClosed = stdinClosed && stdoutClosed && stderrClosed && closed;
          r.groupObservation = spawnFailed ? "not-started" : groupGone ? "absent" : "unconfirmed";
          r.metrics.terminationConfirmed = spawnFailed || r.exitObserved && r.pipesClosed && groupGone;
          if (uncertain || startedWriteFailed || r.metrics.elapsedMs > l.timeoutMs) {
            r.state = "indeterminate"; add("supervised-reconciliation-required");
          } else if (spawnFailed) { r.state = "not-started"; }
          else if (!canceled && r.state !== "failed") r.state = "completed-for-review";
          if (!r.reasons.length) add("supervised-fixture-completed");
          child.stdin.destroy(); child.stdout.destroy(); child.stderr.destroy(); resolve();
        };
        const poll = () => {
          if (done) return;
          if (elapsed() >= l.timeoutMs - l.graceMs - l.confirmationMs && !canceled) cancel("supervised-deadline", "timed-out");
          if (canceled && !forced && mono() - cancelAt >= l.graceMs) { forced = true; send("SIGKILL"); }
          const alive = groupAlive();
          if (r.exitObserved && closed && stdinClosed && stdoutClosed && stderrClosed && !startedWritePending && !alive) {
            if (!canceled && !spawnFailed) {
              try { if (exitCode !== 0) fail("supervised-exit-failed"); protocol.finish(); stderr.decode(); }
              catch (e) { r.state = "failed"; add(errorCode(e)); }
            }
            finish(false);
          } else if (r.exitObserved && alive && !canceled) cancel("supervised-descendants-live");
          if (spawnFailed && closed) finish(false);
        };
        const abort = () => cancel("supervised-canceled", "canceled");
        child.on("spawn", () => {
          spawned = true;
          if (done) { send("SIGKILL"); return; }
          r.fixtureExecuted = true; r.metrics.mainStartsObserved = 1; startedWritePending = true;
          if (canceled) send("SIGTERM");
          Promise.resolve().then(() => checkpoint("spawn-observed")).then(() => capability.started())
            .catch(() => { startedWriteFailed = true; cancel("supervised-start-record-unconfirmed"); })
            .finally(() => { startedWritePending = false; poll(); });
        });
        child.on("error", () => { if (done) return; if (!spawned) { spawnFailed = true; add("supervised-spawn-failed"); } else cancel("supervised-process-error"); });
        child.on("exit", code => { if (done) return; r.exitObserved = true; exitCode = code; poll(); });
        child.on("close", () => { closed = true; poll(); });
        child.stdin.on("close", () => { stdinClosed = true; poll(); });
        child.stdout.on("close", () => { stdoutClosed = true; poll(); });
        child.stderr.on("close", () => { stderrClosed = true; poll(); });
        for (const [stream, name] of [[child.stdin, "stdin"], [child.stdout, "stdout"], [child.stderr, "stderr"]]) {
          stream.on("error", () => cancel("supervised-" + name + "-error"));
        }
        child.stdout.on("data", chunk => {
          if (done || canceled) return;
          try { protocol.push(chunk); } catch (e) { cancel(errorCode(e)); }
        });
        child.stderr.on("data", chunk => {
          if (done || canceled) return;
          r.metrics.stderrBytes += chunk.length;
          if (r.metrics.stderrBytes > l.maxStderrBytes) cancel("supervised-stderr-limit");
          else try { stderr.decode(chunk, { stream: true }); } catch { cancel("supervised-stderr-invalid-utf8"); }
        });
        signal?.addEventListener("abort", abort, { once: true }); if (signal?.aborted) abort();
        timer = setInterval(poll, 10);
        hardTimer = setTimeout(() => { send("SIGKILL"); poll(); if (!done) finish(true); }, Math.max(1, l.timeoutMs - elapsed()));
        try { child.stdin.end(d.inputText, e => { if (e) cancel("supervised-stdin-error"); }); }
        catch { cancel("supervised-stdin-error"); }
      });
    } catch (e) {
      r.reasons = [errorCode(e)]; r.metrics.elapsedMs = elapsed();
      r.metrics.terminationConfirmed = !spawnReturned;
      if (spawnReturned) r.state = "indeterminate";
      else if (e?.code === "supervised-canceled-before-start") r.state = "canceled";
      else if (e?.code === "supervised-deadline-before-start") r.state = "timed-out";
      // attempted is distinct from a returned ChildProcess and a spawn event.
      if (attempted) r.metrics.spawnAttempts = 1;
    } finally {
      if (cwd && (!spawnReturned || r.metrics.terminationConfirmed)) {
        try {
          const s = await fs.lstat(cwd);
          if (s.dev !== owned.dev || s.ino !== owned.ino || !s.isDirectory() || s.isSymbolicLink()) throw Error("changed");
          await fs.rmdir(cwd);
        } catch { r.state = "indeterminate"; r.reasons.push("supervised-workspace-cleanup-required"); }
      }
    }
    r.reasons = [...new Set(r.reasons)].sort();
    return contract.processReport(r);
  };
}
