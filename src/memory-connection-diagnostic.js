import { copyInertJson } from "./client-output-json.js";
import {
  createMemoryConnectionDescriptor, freezeMemoryConnectionData, memoryConnectionHash,
  MEMORY_CONNECTION_FACTS, MEMORY_CONNECTION_VERSION
} from "./memory-connection-descriptor.js";
import { containsSensitiveData } from "./sensitive-data.js";

export const MEMORY_CONNECTION_DIAGNOSTIC_LIMITS = Object.freeze({
  inputBytes: 128 * 1024, reportBytes: 128 * 1024,
  depth: 64, nodes: 30000, arrayItems: 256, stringChars: 4096, serverItems: 16
});
const ROLES = ["configuration", "skill", "artifacts", "manifest", "package"];
const ARTIFACT_KEYS = ["nodeSha256", "binSha256", "manifestSha256", "packageJsonSha256", "packageLockSha256"];
const PIN_KEYS = ["configurationSha256", "skillSha256", ...ARTIFACT_KEYS];
const FIELDS = {
  configuration: ["state", "mcpName", "fileState", "entryState", "configurationSha256", "metadataSha256", "server"],
  skill: ["state", "skillName", "sourceSha256", "metadataSha256", "resolvedSource"],
  artifacts: ["state", "hashes", "metadataSha256"],
  manifest: ["state", "descriptorSha256", "manifestSha256"],
  package: ["state", "descriptorSha256", "packageJsonSha256", "packageLockSha256"]
};
const STATES = {
  configuration: ["observed", "absent", "blocked", "invalid"],
  skill: ["matched", "absent", "conflict", "blocked", "invalid"],
  artifacts: ["matched", "blocked", "invalid"],
  manifest: ["validated", "blocked", "invalid"], package: ["consistent", "blocked", "invalid"]
};
const HASH = /^[a-f0-9]{64}$/;
const CONTROL = /[\x00-\x1f\x7f-\x9f\u202a-\u202e\u2066-\u2069]/u;
const code = name => "MC_DIAGNOSTIC_" + name;
const object = value => value !== null && typeof value === "object" && !Array.isArray(value);
const hash = value => typeof value === "string" && HASH.test(value);
const exact = (value, keys) => object(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const within = (root, full) => full === root || full.startsWith(root + "/");
class Rejected extends Error {
  constructor(reason, state = "invalid") { super(reason); this.reason = reason; this.state = state; }
}
const requireInput = condition => { if (!condition) throw new Rejected(code("INPUT")); };

function captured(input) {
  let data;
  try { data = copyInertJson(input); }
  catch (error) {
    if (error?.code === "metadata-limit") throw new Rejected(code("LIMIT"), "blocked");
    throw new Rejected(code("INPUT"));
  }
  if (Buffer.byteLength(JSON.stringify(data)) > MEMORY_CONNECTION_DIAGNOSTIC_LIMITS.inputBytes) {
    throw new Rejected(code("LIMIT"), "blocked");
  }
  requireInput(exact(data, ["schemaVersion", "descriptor", "reviewedPins", "components"]));
  requireInput(data.schemaVersion === MEMORY_CONNECTION_VERSION);
  let descriptor;
  try {
    descriptor = createMemoryConnectionDescriptor(data.descriptor?.identity);
    requireInput(memoryConnectionHash(descriptor) === memoryConnectionHash(data.descriptor));
    const { toolkitRoot, vaultPath, manifestPath } = descriptor.identity;
    requireInput(!within(toolkitRoot, vaultPath) && !within(vaultPath, toolkitRoot) && manifestPath.startsWith(vaultPath + "/"));
  } catch { throw new Rejected(code("INPUT")); }
  requireInput(exact(data.reviewedPins, PIN_KEYS));
  for (const key of PIN_KEYS) requireInput(hash(data.reviewedPins[key]) || key === "configurationSha256" && data.reviewedPins[key] === null);
  requireInput(exact(data.components, ROLES));
  // Every projection is checked before any partial classification is published.
  for (const role of ROLES) projection(role, data.components[role], descriptor);
  return { data, descriptor };
}

function strings(value) {
  if (typeof value === "string") {
    requireInput(value.length <= MEMORY_CONNECTION_DIAGNOSTIC_LIMITS.stringChars && value === value.trim() &&
      !CONTROL.test(value) && Buffer.from(value, "utf8").toString("utf8") === value);
  } else if (value !== null && typeof value === "object") {
    for (const child of Object.values(value)) strings(child);
  }
}

function projection(role, item, descriptor) {
  if (item === null) return;
  requireInput(exact(item, ["bindingSha256", ...FIELDS[role]]) && hash(item.bindingSha256) && STATES[role].includes(item.state));
  const negative = ["blocked", "invalid"].includes(item.state);
  if (role === "configuration") {
    requireInput(typeof item.mcpName === "string" || negative && item.mcpName === null);
    if (negative) requireInput(item.mcpName === null || item.mcpName === descriptor.identity.mcpName);
    if (item.state === "observed") {
      requireInput(item.fileState === "present" && hash(item.configurationSha256) && hash(item.metadataSha256));
      requireInput(item.entryState === "observed" && object(item.server) || item.entryState === "absent" && item.server === null);
      strings(item.server);
    } else if (item.state === "absent") {
      requireInput(item.fileState === "absent" && item.entryState === null && item.server === null && item.configurationSha256 === null && hash(item.metadataSha256));
    } else {
      requireInput(item.fileState === "unknown" && item.entryState === null && item.server === null && item.configurationSha256 === null && item.metadataSha256 === null);
    }
  } else if (role === "skill") {
    requireInput(typeof item.skillName === "string" || negative && item.skillName === null);
    if (negative) requireInput(item.skillName === null || item.skillName === descriptor.identity.skillName);
    if (["matched", "absent"].includes(item.state)) {
      requireInput(hash(item.sourceSha256) && hash(item.metadataSha256));
      requireInput(item.state === "matched" ? typeof item.resolvedSource === "string" : item.resolvedSource === null);
      strings(item.resolvedSource);
    } else requireInput(item.sourceSha256 === null && item.metadataSha256 === null && item.resolvedSource === null);
  } else if (role === "artifacts") {
    requireInput(item.state === "matched" ? exact(item.hashes, ARTIFACT_KEYS) && ARTIFACT_KEYS.every(key => hash(item.hashes[key])) && hash(item.metadataSha256) :
      item.hashes === null && item.metadataSha256 === null);
  } else {
    const hashes = role === "manifest" ? ["descriptorSha256", "manifestSha256"] : ["descriptorSha256", "packageJsonSha256", "packageLockSha256"];
    requireInput(hashes.every(key => negative ? item[key] === null : hash(item[key])));
  }
}

function serverMatches(server, expected) {
  if (!exact(server, ["command", "args", "cwd", "enabled_tools", "enabled"]) ||
      typeof server.command !== "string" || typeof server.cwd !== "string" || typeof server.enabled !== "boolean" ||
      !Array.isArray(server.args) || !Array.isArray(server.enabled_tools) ||
      server.args.length > MEMORY_CONNECTION_DIAGNOSTIC_LIMITS.serverItems || server.enabled_tools.length > MEMORY_CONNECTION_DIAGNOSTIC_LIMITS.serverItems ||
      !server.args.every(arg => typeof arg === "string") || !server.enabled_tools.every(tool => typeof tool === "string")) return false;
  return server.command === expected.command && server.cwd === expected.cwd &&
    server.args.length === expected.args.length && server.args.every((arg, i) => arg === expected.args[i]) &&
    server.enabled_tools.length === expected.enabled_tools.length && new Set(server.enabled_tools).size === server.enabled_tools.length &&
    expected.enabled_tools.every(tool => server.enabled_tools.includes(tool));
}

function component(role, item, descriptor, binding, pins) {
  const output = (status, reason) => ({ id: role, status, code: code(reason) });
  if (item === null) return output("not-provided", "MISSING");
  if (item.bindingSha256 !== binding || ["manifest", "package"].includes(role) && item.descriptorSha256 !== null && item.descriptorSha256 !== binding) {
    return output("blocked", "BINDING");
  }
  if (role === "configuration" && ["observed", "absent"].includes(item.state) && item.configurationSha256 !== pins.configurationSha256 ||
      role === "skill" && ["matched", "absent"].includes(item.state) && item.sourceSha256 !== pins.skillSha256 ||
      role === "artifacts" && item.state === "matched" && ARTIFACT_KEYS.some(key => item.hashes[key] !== pins[key]) ||
      role === "manifest" && item.state === "validated" && item.manifestSha256 !== pins.manifestSha256 ||
      role === "package" && item.state === "consistent" && ["packageJsonSha256", "packageLockSha256"].some(key => item[key] !== pins[key])) {
    return output("blocked", "PINS");
  }
  if (["blocked", "invalid"].includes(item.state)) return output("blocked", role.toUpperCase());
  if (role === "configuration") {
    if (item.mcpName !== descriptor.identity.mcpName) return output("conflict", "CONFIGURATION");
    if (item.state === "absent" || item.entryState === "absent") return output("missing", "MISSING");
    if (!serverMatches(item.server, descriptor.server)) return output("conflict", "CONFIGURATION");
    if (!item.server.enabled) return output("disabled", "DISABLED");
  }
  if (role === "skill") {
    if (item.skillName !== descriptor.identity.skillName || item.state === "conflict" ||
        item.state === "matched" && item.resolvedSource !== descriptor.skill.source) return output("conflict", "SKILL");
    if (item.state === "absent") return output("missing", "MISSING");
  }
  return output("declared-matched", "MATCH");
}

function report(state, reasons, components = [], hashes = {}) {
  const result = {
    schemaVersion: MEMORY_CONNECTION_VERSION, state, components, reasons: [...new Set(reasons)].sort(),
    descriptorSha256: null, bundleHash: null, ...hashes,
    facts: {
      ...MEMORY_CONNECTION_FACTS, evidence: "declared-reports", verificationScope: "cross-report-declarations-only",
      declarationsLinked: state === "coherent", provenanceVerified: false, snapshotAtomicVerified: false, freshnessVerified: false,
      skillLoadedVerified: false, runtimeVersionVerified: false, runtimeCompatibilityVerified: false, installedDependenciesVerified: false
    }
  };
  if (Buffer.byteLength(JSON.stringify(result)) > MEMORY_CONNECTION_DIAGNOSTIC_LIMITS.reportBytes) throw new Rejected(code("LIMIT"), "blocked");
  return freezeMemoryConnectionData(result);
}

/** Compare caller-declared projections, never authenticate origin or admit a runtime. */
export function summarizeMemoryConnectionEvidence(input) {
  try {
    const { data, descriptor } = captured(input);
    if (containsSensitiveData(JSON.stringify(data))) return report("blocked", [code("SENSITIVE")]);
    const binding = memoryConnectionHash(descriptor);
    const components = ROLES.map(role => component(role, data.components[role], descriptor, binding, data.reviewedPins));
    const state = components.some(c => ["blocked", "conflict"].includes(c.status)) ? "blocked" :
      components.some(c => ["missing", "disabled", "not-provided"].includes(c.status)) ? "incomplete" : "coherent";
    if (state !== "coherent") return report(state, components.filter(c => c.status !== "declared-matched").map(c => c.code), components);
    return report("coherent", [code("COHERENT")], components, { descriptorSha256: binding, bundleHash: memoryConnectionHash(data) });
  } catch (error) {
    return report(error instanceof Rejected ? error.state : "blocked", [error instanceof Rejected ? error.reason : code("VALIDATION")]);
  }
}
