import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { schemas, NOW, config, fixture, apply, store, initialize } from "../runtime-store/fixture.js";
import { hash } from "../../src/client-runtime-core.js";
import { createFixtureCoordinator } from "../../src/client-runtime-coordinator.js";

export const fixtureSchema = JSON.parse(await fs.readFile(fileURLToPath(new URL("../../schemas/agent-client-runtime-fixture.schema.json", import.meta.url)), "utf8"));
export const allSchemas = [...schemas, fixtureSchema];
export const limits = () => ({ timeoutMs: 5000, graceMs: 100, confirmationMs: 500, maxInputBytes: 1048576,
  maxOutputBytes: 8192, maxLineBytes: 1024, maxEvents: 10, maxStderrBytes: 1024 });
export function request(root, fixtureId = "success") {
  const reservation = apply(root, fixture()); const l = limits();
  return { schemaVersion: "1.0.0", scope: "fixture-only", fixtureId, inputText: "fixture-private-stdin", limits: l, reservation,
    authorization: { status: "approved", revoked: false, referenceId: "demo-fixture-approval", evidenceRef: "demo-fixture-evidence",
      checkedAt: NOW, expiresAt: "2026-10-02T15:00:00Z", fixtureId, attemptId: reservation.transition.attemptId,
      identity: reservation.identity, rootSha256: hash(root), limitsSha256: hash(l), reconciliationApproved: true } };
}
export function bind(q) { q.authorization.limitsSha256 = hash(q.limits); return q; }
export const coordinator = (root, deps = {}) => createFixtureCoordinator(...allSchemas, config(root), { ...deps, store: { clock: () => Date.parse(NOW), ...deps.store } });
export async function initialized(root) { const r = await store(root)(initialize(root)); if (r.state !== "committed") throw Error("Test initialization failed"); }
export const taskDirectory = root => path.join(root, hash(request(root).reservation.identity));
