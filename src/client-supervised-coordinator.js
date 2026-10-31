import { supportsLocalPosix } from "./client-local-platform.js";
import { createSupervisedStore } from "./client-supervised-store.js";
import { createSupervisedSupervisor } from "./client-supervised-supervisor.js";
import { createSupervisedContract, monotonicMs, errorCode, fail } from "./client-supervised-contract.js";

/** Only trusted local harnesses invoke this; no CLI or native-client adapter. */
export function createSupervisedCoordinator(schema, configuration, dependencies = {}) {
  const contract = createSupervisedContract(schema), store = createSupervisedStore(schema, configuration, dependencies.store);
  const supervise = createSupervisedSupervisor(schema, dependencies.supervisor);
  return async function coordinate(input, { signal } = {}) {
    const mono = dependencies.supervisor?.monotonic ?? monotonicMs;
    const beganAt = mono();
    const r = { scope: "fixture-only", state: "not-started", fixtureExecuted: false, nativeExecuted: false,
      runtimeReady: false, verifiedAdmission: false, actualModelCalls: null, fixtureModelCalls: 0,
      internalCallCeiling: null, remoteCancellationVerified: false, process: null, storage: null, elapsedMs: 0, reasons: [] };
    try {
      const d = contract.request(input);
      if (!supportsLocalPosix(process.platform)) fail("supervised-platform-not-admitted");
      if (signal?.aborted) fail("supervised-canceled-before-reservation");
      const storage = await store.withReservation(d, async handle => {
        const p = await supervise(handle, d, { signal, beganAt });
        r.process = p; r.fixtureExecuted = p.fixtureExecuted; r.state = p.state;
        return p;
      });
      r.storage = { state: storage.state, durability: storage.durability, reasons: storage.reasons };
      r.reasons = [...new Set([...(r.process?.reasons ?? []), ...storage.reasons])].sort();
      if (storage.state === "reconciliation-required") r.state = "indeterminate";
      r.elapsedMs = Math.max(0, Math.ceil(mono() - beganAt));
      if (r.elapsedMs > d.limits.timeoutMs) {
        r.state = "indeterminate"; r.reasons = [...new Set([...r.reasons, "supervised-deadline"])].sort();
      }
    } catch (e) { r.reasons = [errorCode(e)]; }
    r.elapsedMs = Math.max(r.elapsedMs, Math.max(0, Math.ceil(mono() - beganAt)));
    return contract.report(r);
  };
}
