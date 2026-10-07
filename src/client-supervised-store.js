import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createStoreFiles, bytesHash } from "./client-runtime-store-files.js";
import { createSupervisedPermit, revokeSupervisedPermit } from "./client-supervised-permit.js";
import { createSupervisedContract, hash, same, taskKey, zeroMetrics, terminalStates, errorCode, fail, copyInertJson } from "./client-supervised-contract.js";

const names = ["0000.json", "0001.json", "0002.json", "0003.json"];
const unfinished = new Set(["reserved", "start-claimed", "started"]);

/** Separate one-attempt store; construction never initializes or repairs paths. */
export function createSupervisedStore(schema, configuration, dependencies = {}) {
  const contract = createSupervisedContract(schema), cfg = copyInertJson(configuration);
  if (Object.keys(cfg).join() !== "root" || typeof cfg.root !== "string" || !path.isAbsolute(cfg.root) || path.normalize(cfg.root) !== cfg.root) throw Error("Invalid supervised store configuration");
  const files = createStoreFiles(dependencies.io), checkpoint = dependencies.checkpoint ?? (async () => {});
  const clock = dependencies.clock ?? Date.now;
  let rootIdentity;
  async function root() {
    const tmp = await fs.realpath(os.tmpdir());
    // S2 is experiments only: do not activate a permanent project/user store.
    if (path.dirname(cfg.root) !== tmp || !/^agent-supervised-[a-zA-Z0-9-]+$/.test(path.basename(cfg.root))) fail("supervised-root-not-temporary");
    const s = await files.directory(cfg.root, rootIdentity); rootIdentity ??= s; return s;
  }
  function stamp() {
    const n = clock(); if (!Number.isFinite(n)) fail("supervised-clock-unavailable");
    return new Date(n).toISOString().replace(/\.\d{3}Z$/, "Z");
  }
  async function readChain(dir, identity, expectedDirectory) {
    await root(); await files.directory(dir, expectedDirectory); await files.contents(dir, [...names, "confirmed.json"]);
    const events = [], bytesHashes = []; let missingSeen = false;
    for (const name of names) {
      const p = path.join(dir, name);
      if (!await files.exists(p)) { missingSeen = true; continue; }
      if (missingSeen) fail("supervised-event-gap");
      const { bytes } = await files.read(p, 131072); const e = contract.event(bytes);
      if (e.limits.graceMs + e.limits.confirmationMs >= e.limits.timeoutMs || e.limits.maxLineBytes > e.limits.maxOutputBytes) fail("supervised-incompatible-limits");
      const prior = events.at(-1);
      if (e.sequence !== events.length || taskKey(e.identity) !== taskKey(identity) ||
          e.previousSha256 !== (bytesHashes.at(-1) ?? null)) fail("supervised-event-chain-mismatch");
      if (!prior) {
        if (e.state !== "reserved" || !same(e.metrics, zeroMetrics()) || e.reasons.length) fail("supervised-invalid-reservation");
      } else {
        if (!same(e.identity, prior.identity) || e.attemptId !== prior.attemptId || e.fixtureId !== prior.fixtureId ||
            e.requestSha256 !== prior.requestSha256 || !same(e.limits, prior.limits) || Date.parse(e.observedAt) < Date.parse(prior.observedAt)) fail("supervised-event-binding-mismatch");
        const allowed = prior.state === "reserved" ? ["start-claimed", "canceled", "failed", "timed-out", "indeterminate"]
          : prior.state === "start-claimed" ? ["started", "failed", "canceled", "timed-out", "indeterminate"]
            : prior.state === "started" ? [...terminalStates] : [];
        if (!allowed.includes(e.state) || e.metrics.spawnAttempts < prior.metrics.spawnAttempts ||
            e.metrics.mainStartsObserved < prior.metrics.mainStartsObserved || e.metrics.mainStartsObserved > e.metrics.spawnAttempts ||
            ["stdoutBytes", "stderrBytes", "events", "elapsedMs"].some(k => e.metrics[k] < prior.metrics[k])) fail("supervised-invalid-transition");
        if (e.state === "start-claimed" && (e.metrics.spawnAttempts !== 1 || e.metrics.mainStartsObserved !== 0 || e.reasons.length)) fail("supervised-invalid-claim");
        if (e.state === "started" && (e.metrics.spawnAttempts !== 1 || e.metrics.mainStartsObserved !== 1 || e.reasons.length)) fail("supervised-invalid-start");
        if (terminalStates.has(e.state)) {
          if (!e.reasons.length || e.state !== "indeterminate" && !e.metrics.terminationConfirmed) fail("supervised-unconfirmed-terminal");
          if (e.state === "completed-for-review" && (prior.state !== "started" || e.metrics.mainStartsObserved !== 1 ||
              e.metrics.stdoutBytes > e.limits.maxOutputBytes || e.metrics.stderrBytes > e.limits.maxStderrBytes ||
              e.metrics.events > e.limits.maxEvents || e.metrics.elapsedMs > e.limits.timeoutMs)) fail("supervised-invalid-completion");
        }
      }
      events.push(e); bytesHashes.push(bytesHash(bytes));
    }
    if (!events.length) fail("supervised-empty-reservation");
    let receipt = false;
    if (await files.exists(path.join(dir, "confirmed.json"))) {
      const seal = contract.receipt((await files.read(path.join(dir, "confirmed.json"), 131072)).bytes);
      if (!terminalStates.has(events.at(-1).state) || events.at(-1).state === "indeterminate" || seal.terminalSha256 !== bytesHashes.at(-1)) fail("supervised-receipt-mismatch");
      receipt = true;
    }
    return { events, bytesHashes, last: events.at(-1), receipt };
  }
  async function observe(input) {
    const r = { state: "clear", budgetConsumed: false, eventCount: 0, lastState: null, spawnAttempts: null,
      mainStartsObserved: null, fixtureModelCalls: 0, actualModelCalls: null, internalCallCeiling: null,
      remoteCancellationVerified: false, reasons: [] };
    try {
      const i = contract.identity(input); await root(); const dir = path.join(cfg.root, taskKey(i));
      if (!await files.exists(dir)) return contract.observation(r);
      r.budgetConsumed = true;
      const c = await readChain(dir, i); const e = c.last;
      r.eventCount = c.events.length; r.lastState = e.state;
      r.spawnAttempts = e.metrics.spawnAttempts; r.mainStartsObserved = e.metrics.mainStartsObserved;
      // Recorded zeros before observation do not prove that no process started.
      if (unfinished.has(e.state) || e.state === "indeterminate" || !c.receipt) {
        r.state = "reconciliation-required"; r.mainStartsObserved = e.metrics.mainStartsObserved === 1 ? 1 : null;
        if (e.state === "reserved") r.spawnAttempts = null;
      } else r.state = "consumed";
      r.reasons = [r.state === "consumed" ? "supervised-budget-consumed" : "supervised-reconciliation-required"];
    } catch (e) {
      r.state = "reconciliation-required"; r.budgetConsumed = true; r.reasons = [errorCode(e)];
      r.spawnAttempts = null; r.mainStartsObserved = null;
    }
    return contract.observation(r);
  }
  async function withReservation(input, consumer) {
    const r = { state: "blocked", durability: "unconfirmed", reasons: [], value: null };
    let handle, created = false;
    try {
      const d = contract.request(input); if (typeof consumer !== "function") fail("supervised-consumer-required");
      const rootStat = await root(), dir = path.join(cfg.root, taskKey(d.identity));
      await checkpoint("before-reserve");
      try { await files.io.mkdir(dir, { mode: 0o700 }); created = true; }
      catch (e) { if (e.code === "EEXIST") fail("supervised-budget-reserved"); throw e; }
      const dirStat = await files.directory(dir); await files.syncDirectory(cfg.root, rootStat);
      await checkpoint("after-directory");
      let chain = [];
      async function append(state, metrics, reasons = []) {
        await root(); await files.directory(dir, dirStat);
        if (chain.length) {
          const current = await readChain(dir, d.identity, dirStat);
          if (!same(current.events, chain)) fail("supervised-reservation-changed");
        } else await files.contents(dir, []);
        const prev = chain.at(-1);
        const e = contract.event({ schemaVersion: "1.0.0", scope: "fixture-only", sequence: chain.length,
          previousSha256: prev ? bytesHash((await files.read(path.join(dir, names[chain.length - 1]), 131072)).bytes) : null,
          identity: d.identity, attemptId: d.attemptId, fixtureId: d.fixtureId, requestSha256: hash(d), limits: d.limits,
          state, observedAt: stamp(), metrics, reasons: [...new Set(reasons)].sort(), fixtureModelCalls: 0,
          actualModelCalls: null, internalCallCeiling: null, remoteCancellationVerified: false });
        if (chain.length >= names.length) fail("supervised-event-limit");
        const resource = await files.exclusive(path.join(dir, names[chain.length]));
        try {
          await files.write(resource, Buffer.from(JSON.stringify(e) + "\n"));
          await checkpoint("after-write-" + state);
          await files.syncDirectory(dir, dirStat); await files.owned(resource);
        } finally { await resource.handle.close(); }
        const read = await readChain(dir, d.identity, dirStat);
        if (!same(read.last, e)) fail("supervised-write-not-confirmed");
        chain = read.events;
        await checkpoint("durable-" + state);
      }
      await append("reserved", zeroMetrics()); r.durability = "confirmed";
      handle = createSupervisedPermit(hash(d), async () => {
        await append("start-claimed", { ...zeroMetrics(), spawnAttempts: 1 });
      }, async () => {
        await append("started", { ...zeroMetrics(), spawnAttempts: 1, mainStartsObserved: 1 });
      });
      await checkpoint("before-consumer");
      const value = contract.processReport(await consumer(handle)); r.value = value;
      revokeSupervisedPermit(handle);
      // An unfinished started write may still be completing. Do not race it by
      // appending a terminal event; keep the reservation for reconciliation.
      if (value.state === "indeterminate") {
        r.state = "reconciliation-required"; r.reasons = ["supervised-reconciliation-required"]; return r;
      }
      const c = await readChain(dir, d.identity, dirStat);
      if (!same(c.events, chain)) fail("supervised-reservation-changed");
      const finalState = value.state === "not-started" ? "failed" : value.state;
      await append(finalState, value.metrics, value.reasons.length ? value.reasons : ["supervised-local-result"]);
      // Only write the receipt after terminal data, directory sync and readback
      // have completed. A partial terminal append alone never proves settlement.
      const terminal = await readChain(dir, d.identity, dirStat);
      const receipt = contract.receipt({ schemaVersion: "1.0.0", scope: "fixture-only", terminalSha256: terminal.bytesHashes.at(-1) });
      const seal = await files.exclusive(path.join(dir, "confirmed.json"));
      try {
        await files.write(seal, Buffer.from(JSON.stringify(receipt) + "\n"));
        await files.syncDirectory(dir, dirStat); await files.owned(seal);
      } finally { await seal.handle.close(); }
      if (!(await readChain(dir, d.identity, dirStat)).receipt) fail("supervised-write-not-confirmed");
      r.state = finalState === "indeterminate" ? "reconciliation-required" : "recorded";
      r.reasons = r.state === "recorded" ? ["supervised-result-recorded"] : ["supervised-reconciliation-required"];
    } catch (e) {
      r.state = created ? "reconciliation-required" : "blocked";
      r.durability = "unconfirmed"; r.reasons = [errorCode(e)];
    } finally { if (handle) revokeSupervisedPermit(handle); }
    return r;
  }
  return Object.freeze({ observe, withReservation });
}
