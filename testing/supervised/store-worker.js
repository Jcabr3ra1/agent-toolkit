// Cross-process store races and crash points; no client, provider or network.
import { schema, store, request, fakeComplete } from "./setup.js";
import { createSupervisedCoordinator } from "../../src/client-supervised-coordinator.js";
const [root, mode] = process.argv.slice(2);
const d = request();
const checkpoint = async name => {
  if (name === mode) process.exit(23);
};
const result = mode === "coordinate"
  ? await createSupervisedCoordinator(schema, { root }, { supervisor: { workspaceParent: root } })(d)
  : mode === "supervisor-spawn"
  ? await createSupervisedCoordinator(schema, { root }, { supervisor: { workspaceParent: root, checkpoint: async name => {
    // Success fixture terminates by itself; no hanging/orphaned crash fixture.
    if (name === "spawn-observed") { await new Promise(r => setTimeout(r, 150)); process.exit(23); }
  } } })(d)
  : await store(root, { checkpoint }).withReservation(d, fakeComplete(d));
process.stdout.write(JSON.stringify({ state: result.state, fixtureExecuted: result.fixtureExecuted ?? false, reasons: result.reasons }) + "\n");
