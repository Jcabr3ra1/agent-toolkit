import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createModelSelector } from "../../src/model-selection.js";
import { createClientAdapterPlanner } from "../../src/client-adapter-plan.js";
import { createClientRuntimeStore } from "../../src/client-runtime-store.js";
import { hash, CONTROLS, EFFECTS } from "../../src/client-runtime-core.js";

export const REPO = fs.realpathSync(fileURLToPath(new URL("../../", import.meta.url)));
const read = p => JSON.parse(fs.readFileSync(path.join(REPO, p), "utf8"));
export const schemas = ["agent-model-selection", "agent-model-preference", "agent-client-adapter", "agent-client-runtime", "agent-client-runtime-local"].map(n => read(`schemas/${n}.schema.json`));
// Fictitious clock, never refreshed into evidence for an actual client.
export const NOW = "2026-10-02T14:00:00Z";
const select = createModelSelector(...schemas.slice(0, 2));
const plan = createClientAdapterPlanner(...schemas.slice(0, 3));
const temporal = () => ({ checkedAt: NOW, expiresAt: "2026-10-02T15:00:00Z", evidenceRef: "demo-evidence" });
const assessment = () => ({ ...temporal(), status: "locally-tested", source: "installation-test" });
export function fixture() {
  const selection = Object.fromEntries(["request", "catalog", "policy"].map(n => [n, read(`examples/model-selection/${n}.preference.example.json`)]));
  Object.assign(selection.request, { provider: "openai", client: "codex-cli" }); selection.request.requirements.tools = [];
  selection.catalog.profiles.forEach((p, i) => {
    Object.assign(p, { provider: "openai", client: "codex-cli", requestedModel: `demo-model-${i}` }); p.declaredCapabilities.tools = []; p.verifiedCapabilities.tools = [];
  });
  selection.policy.routes.forEach(r => Object.assign(r, { provider: "openai", client: "codex-cli" }));
  const client = { provider: "openai", client: "codex-cli", variant: "codex-native", clientVersion: "0.0.0-demo" };
  const p = {
    schemaVersion: "1.0.0", selection, decision: select(selection), adapter: client,
    registry: { schemaVersion: "1.0.0", registryId: "demo-registry", revision: "r01", records: [{ recordId: "demo-evaluation", ...client,
      status: "evaluated", supportedModels: selection.catalog.profiles.map(p => p.requestedModel), efforts: ["brief", "standard", "deep"],
      roles: ["tutor", "proposer", "reviewer"], controls: CONTROLS.slice(0, 7), evaluatedAt: NOW, evidenceRefs: ["demo-control-evidence"] }] },
    context: { scope: "text-only", promptRef: "demo-prompt", provenance: { checkedAt: NOW, evidenceRef: "demo-context" },
      authorization: { status: "approved", referenceId: selection.request.authorizationContext.referenceId, checkedAt: NOW, evidenceRef: "demo-approval" } },
    environment: { access: "subscription-session", externalBilling: "disabled", controls: CONTROLS.slice(0, 7), checkedAt: NOW, evidenceRef: "demo-admission" },
    historyEvidence: { status: "reconciled", history: selection.request.history, checkedAt: NOW, evidenceRef: "demo-ledger" },
    limits: { maxTurns: 1, timeoutSeconds: 60, maxOutputBytes: 8192, maxLineBytes: 1024, maxEvents: 100, maxStderrBytes: 1024 }
  };
  const report = plan(p); const installation = { installationId: "demo-installation", client, platform: "darwin", artifactSha256: "a".repeat(64), controlRevision: "r01" };
  const ledger = { schemaVersion: "1.0.0", projectId: selection.request.projectId, taskId: selection.request.taskId, revision: 0,
    status: "reconciled", importEvidenceRef: "demo-import", importedHistory: structuredClone(selection.request.history), importedMainStartsUsed: 0,
    history: structuredClone(selection.request.history), mainStartsUsed: 0, limits: { maxMainStarts: 1, maxModelCalls: 2, maxDurationSeconds: 900 }, attempts: [] };
  const evidence = {
    binding: { ...structuredClone(installation), identity: report.identity, planSha256: hash(report) }, installation: assessment(),
    authorization: { ...temporal(), status: "approved", referenceId: p.context.authorization.referenceId, revoked: false, effectsApproved: [...EFFECTS], limits: ledger.limits },
    access: { assessment: assessment(), access: "subscription-session", externalBilling: "disabled" },
    context: { assessment: assessment(), promptRef: "demo-prompt", promptSha256: "b".repeat(64), promptBytes: 100 },
    controls: CONTROLS.map(controlId => ({ controlId, assessment: assessment() })), effects: EFFECTS.map(effectId => ({ effectId, disposition: "allowed", assessment: assessment() })),
    accounting: { assessment: assessment(), maxCallsPerStart: 2, limitEnforced: true }
  };
  return { schemaVersion: "1.0.0", now: NOW, planningInput: p, plan: report, expectedInstallation: installation, evidence, ledger };
}
export const config = root => ({ root, forbiddenRoots: [REPO], evaluation: { platform: "darwin", nodeVersion: process.version, filesystem: "local", synchronized: false, evidenceRef: "demo-local-evaluation" } });
export const identity = ledger => ({ projectId: ledger.projectId, taskId: ledger.taskId });
export const authorization = (root, id) => ({ ...temporal(), status: "approved", revoked: false, referenceId: "demo-store-approval", source: "operator-attestation", identity: id,
  rootSha256: hash(root), operations: ["initialize", "read", "apply"] });
export const initialize = (root, ledger = fixture().ledger) => ({ schemaVersion: "1.0.0", operation: "initialize", identity: identity(ledger), authorization: authorization(root, identity(ledger)), ledger, importReferenceId: ledger.importEvidenceRef });
export const snapshot = (root, ledger = fixture().ledger) => ({ schemaVersion: "1.0.0", operation: "read", identity: identity(ledger), authorization: authorization(root, identity(ledger)) });
export function apply(root, f = fixture(), attemptId = "demo-attempt") {
  const t = { schemaVersion: "1.0.0", operation: "reserve", now: NOW, ledger: structuredClone(f.ledger), expectedRevision: f.ledger.revision,
    expectedLedgerSha256: hash(f.ledger), attemptId, admissionInput: structuredClone(f) };
  return { schemaVersion: "1.0.0", operation: "apply", identity: identity(f.ledger), authorization: authorization(root, identity(f.ledger)), transition: t };
}
export const store = (root, deps = {}, cfg = config(root)) => createClientRuntimeStore(...schemas, cfg, { clock: () => Date.parse(NOW), ...deps });
export const directory = (root, ledger = fixture().ledger) => path.join(root, hash(identity(ledger)));
