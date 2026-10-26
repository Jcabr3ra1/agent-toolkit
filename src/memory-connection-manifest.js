import { createHash } from "node:crypto";
import path from "node:path";
import { types } from "node:util";
import Ajv2020 from "ajv/dist/2020.js";
import ownSchema from "../schemas/project-memory.schema.json" with { type: "json" };
import { copyBytes, copyInertJson, decode, parseEventJson } from "./client-output-json.js";
import {
  createMemoryConnectionDescriptor, copyMemoryConnectionData, freezeMemoryConnectionData,
  memoryConnectionHash, MEMORY_CONNECTION_FACTS, MEMORY_CONNECTION_VERSION
} from "./memory-connection-descriptor.js";
import { containsSensitiveData, isCredentialPath } from "./sensitive-data.js";

export const MEMORY_CONNECTION_MANIFEST_LIMITS = Object.freeze({
  manifestBytes: 512 * 1024, reportBytes: 128 * 1024,
  depth: 64, nodes: 30000, arrayItems: 256, pathChars: 4096, components: 64
});
// Trusted module/schema loading is distinct from evaluating caller-supplied bytes.
const trustedSchema = freezeMemoryConnectionData(ownSchema);
const validateSchema = new Ajv2020({
  strict: true, allErrors: false, ownProperties: true,
  coerceTypes: false, useDefaults: false, removeAdditional: false
}).compile(trustedSchema);
const KEYS = ["descriptor", "manifestBytes", "expectedManifestSha256"];
const CONTROL = /[\x00-\x1f\x7f-\x9f\u202a-\u202e\u2066-\u2069]/u;
const PRIVATE_PATH = /(?:^|\/)(?:\.git|\.obsidian|\.codex|\.claude|\.gemini|\.agents|\.secrets|\.credentials|\.npmrc|\.netrc|\.envrc)(?:\/|$)/i;
const within = (root, full) => full === root || full.startsWith(root + "/");
class Rejected extends Error {
  constructor(code, state = "blocked") { super(code); this.code = code; this.state = state; }
}
const reject = (code, state) => { throw new Rejected(code, state); };

function inputs(input) {
  try {
    if (!input || typeof input !== "object" || types.isProxy(input) ||
        ![Object.prototype, null].includes(Object.getPrototypeOf(input)) || Object.getOwnPropertySymbols(input).length) reject("MC_MANIFEST_INPUT", "invalid");
    const fields = Object.getOwnPropertyDescriptors(input), names = Object.keys(fields);
    if (names.length !== KEYS.length || !KEYS.every(k => Object.hasOwn(fields, k) && fields[k].enumerable && Object.hasOwn(fields[k], "value"))) reject("MC_MANIFEST_INPUT", "invalid");
    const data = copyMemoryConnectionData({ descriptor: fields.descriptor.value, expectedManifestSha256: fields.expectedManifestSha256.value });
    if (typeof data.expectedManifestSha256 !== "string" || !/^[a-f0-9]{64}$/.test(data.expectedManifestSha256)) reject("MC_MANIFEST_INPUT", "invalid");
    const descriptor = createMemoryConnectionDescriptor(data.descriptor?.identity);
    if (memoryConnectionHash(descriptor) !== memoryConnectionHash(data.descriptor)) reject("MC_MANIFEST_INPUT", "invalid");
    const { toolkitRoot, vaultPath, manifestPath } = descriptor.identity;
    if (within(toolkitRoot, vaultPath) || within(vaultPath, toolkitRoot) || !manifestPath.startsWith(vaultPath + "/")) reject("MC_MANIFEST_INPUT", "invalid");
    return { descriptor, pin: data.expectedManifestSha256, bytes: fields.manifestBytes.value };
  } catch { reject("MC_MANIFEST_INPUT", "invalid"); }
}
function capturedBytes(value) {
  try {
    if (value && typeof value === "object" && !types.isProxy(value) && types.isUint8Array(value)) {
      const typed = Object.getPrototypeOf(Uint8Array.prototype);
      const backing = Object.getOwnPropertyDescriptor(typed, "buffer").get.call(value);
      if (types.isSharedArrayBuffer(backing)) reject("MC_MANIFEST_INPUT", "invalid");
    }
    return copyBytes(value, MEMORY_CONNECTION_MANIFEST_LIMITS.manifestBytes);
  } catch (e) {
    if (e instanceof Rejected) throw e;
    if (e?.code === "byte-limit") reject("MC_MANIFEST_LIMIT");
    if (["invalid-unicode", "invalid-utf8"].includes(e?.code)) reject("MC_MANIFEST_FORMAT");
    reject("MC_MANIFEST_INPUT", "invalid");
  }
}
function resolveDeclaration(base, value) {
  if (typeof value !== "string" || !value || value !== value.trim() || value.length > MEMORY_CONNECTION_MANIFEST_LIMITS.pathChars ||
      CONTROL.test(value) || value.includes("\\") || /^[A-Za-z][A-Za-z0-9+.-]*:/.test(value) || value.includes("//") || value.endsWith("/") ||
      PRIVATE_PATH.test(value) || isCredentialPath(value) || containsSensitiveData(value)) reject("MC_MANIFEST_IDENTITY");
  if (path.posix.isAbsolute(value) && path.posix.normalize(value) !== value) reject("MC_MANIFEST_IDENTITY");
  const full = path.posix.resolve(base, value);
  if (full === "/" || full.length > MEMORY_CONNECTION_MANIFEST_LIMITS.pathChars || full.split("/").length - 1 > MEMORY_CONNECTION_MANIFEST_LIMITS.components ||
      PRIVATE_PATH.test(full) || isCredentialPath(full)) reject("MC_MANIFEST_IDENTITY");
  return full;
}

/**
 * Validate a captured, reviewed byte pin and declarations only. No target IO,
 * discovery, runtime/dependency admission, client launch or plan application.
 * Schema loading is trusted startup; $schema in the input never selects a schema.
 */
export function validateMemoryConnectionManifest(input) {
  const report = (state, details = {}) => {
    const validated = state === "validated";
    const result = {
      schemaVersion: MEMORY_CONNECTION_VERSION, state,
      manifestSha256: null, descriptorSha256: null, reasons: [], ...details,
      facts: {
        ...MEMORY_CONNECTION_FACTS, evidence: "provided-bytes",
        verificationScope: "manifest-declarations-only",
        manifestSchemaValidated: validated, manifestSecurityValidated: validated,
        manifestDescriptorMatched: validated, manifestSemanticsVerified: false,
        installedDependenciesVerified: false, runtimeVersionVerified: false,
        runtimeCompatibilityVerified: false
      }
    };
    if (Buffer.byteLength(JSON.stringify(result)) > MEMORY_CONNECTION_MANIFEST_LIMITS.reportBytes) reject("MC_MANIFEST_REPORT_LIMIT");
    return freezeMemoryConnectionData(result);
  };
  try {
    const { descriptor, pin, bytes: value } = inputs(input), bytes = capturedBytes(value);
    if (!bytes.length) reject("MC_MANIFEST_FORMAT");
    if (createHash("sha256").update(bytes).digest("hex") !== pin) reject("MC_MANIFEST_PIN_MISMATCH");
    let manifest;
    try { manifest = copyInertJson(parseEventJson(decode(bytes))); }
    catch (e) { reject(["event-json-limit", "metadata-limit"].includes(e?.code) ? "MC_MANIFEST_LIMIT" : "MC_MANIFEST_FORMAT"); }
    if (containsSensitiveData(JSON.stringify(manifest))) reject("MC_MANIFEST_SENSITIVE");
    if (!validateSchema(manifest)) reject("MC_MANIFEST_SCHEMA");
    const identity = descriptor.identity, base = path.posix.dirname(identity.manifestPath);
    if (resolveDeclaration(base, manifest.source.repositoryPath) !== identity.sourcePath ||
        resolveDeclaration(base, manifest.memory.vaultPath) !== identity.vaultPath ||
        manifest.memory.mcpServerName !== identity.mcpName) reject("MC_MANIFEST_IDENTITY");
    if (new Set(manifest.agents.map(a => a.id)).size !== manifest.agents.length) reject("MC_MANIFEST_AGENTS");
    const codex = manifest.agents.filter(a => a.id === "codex");
    if (codex.length !== 1 || codex[0].enabled !== true || codex[0].skillName !== identity.skillName) reject("MC_MANIFEST_AGENTS");
    return report("validated", {
      manifestSha256: pin, descriptorSha256: memoryConnectionHash(descriptor), reasons: ["MC_MANIFEST_VALIDATED"]
    });
  } catch (e) {
    return report(e instanceof Rejected ? e.state : "blocked", { reasons: [e instanceof Rejected ? e.code : "MC_MANIFEST_VALIDATION"] });
  }
}
