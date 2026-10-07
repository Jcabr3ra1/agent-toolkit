import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createSupervisedStore } from "../../src/client-supervised-store.js";
import { createSupervisedCoordinator } from "../../src/client-supervised-coordinator.js";
import { claimSupervisedPermit } from "../../src/client-supervised-permit.js";
import { hash, zeroMetrics, taskKey } from "../../src/client-supervised-contract.js";

export const schema = JSON.parse(await fs.readFile(new URL("../../schemas/agent-client-supervised-local.schema.json", import.meta.url), "utf8"));
export function limits() { return { maxMainStarts: 1, concurrency: 1, retries: 0, corrections: 0,
  timeoutMs: 1500, graceMs: 100, confirmationMs: 150, maxInputBytes: 16384,
  maxOutputBytes: 262144, maxStderrBytes: 32768, maxLineBytes: 32768, maxEvents: 512 }; }
export function request(fixtureId = "success") {
  return { schemaVersion: "1.0.0", scope: "fixture-only", identity: { projectId: "synthetic", taskId: "demo", taskRevision: "r-one" },
    attemptId: "a-one", fixtureId, inputText: "synthetic-private-input", limits: limits() };
}
export const taskDirectory = (root, d = request()) => path.join(root, taskKey(d.identity));
export const store = (root, deps) => createSupervisedStore(schema, { root }, deps);
export const coordinator = (root, deps = {}) => createSupervisedCoordinator(schema, { root }, {
  ...deps, supervisor: { workspaceParent: root, ...deps.supervisor }
});
export function report(state = "completed-for-review", started = true) {
  return { scope: "fixture-only", state, fixtureExecuted: started, nativeExecuted: false, runtimeReady: false,
    verifiedAdmission: false, actualModelCalls: null, fixtureModelCalls: 0, internalCallCeiling: null,
    remoteCancellationVerified: false, metrics: { ...zeroMetrics(), spawnAttempts: started ? 1 : 0,
      mainStartsObserved: started ? 1 : 0, elapsedMs: 1, terminationConfirmed: true },
    exitObserved: started, pipesClosed: started, groupObservation: started ? "absent" : "not-started", reasons: ["synthetic-result"] };
}
export const fakeComplete = d => async handle => { const p = await claimSupervisedPermit(handle, hash(d)); await p.started(); return report(); };
export async function setup(t) {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "agent-supervised-test-")));
  await fs.chmod(root, 0o700); const owned = await fs.lstat(root);
  t.after(async () => {
    const s = await fs.lstat(root).catch(() => null);
    // Only this test's explicit fresh directory; replaced paths are not removed.
    if (s?.dev === owned.dev && s?.ino === owned.ino && s.isDirectory() && !s.isSymbolicLink()) await fs.rm(root, { recursive: true });
  });
  return root;
}
