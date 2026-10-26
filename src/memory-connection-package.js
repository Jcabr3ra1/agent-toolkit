import { createHash } from "node:crypto";
import { types } from "node:util";
import { copyBytes, copyInertJson, decode, parseEventJson } from "./client-output-json.js";
import {
  createMemoryConnectionDescriptor, copyMemoryConnectionData, freezeMemoryConnectionData,
  memoryConnectionHash, MEMORY_CONNECTION_FACTS, MEMORY_CONNECTION_VERSION
} from "./memory-connection-descriptor.js";
import { containsSensitiveData } from "./sensitive-data.js";

export const MEMORY_CONNECTION_PACKAGE_LIMITS = Object.freeze({
  packageJsonBytes: 512 * 1024, packageLockBytes: 2 * 1024 * 1024,
  totalBytes: 2560 * 1024, reportBytes: 128 * 1024,
  depth: 64, nodes: 30000, arrayItems: 256, metadataBytes: 2000000,
  dependencies: 256, nameChars: 256, specifierChars: 1024
});
const KEYS = ["descriptor", "packageJsonBytes", "packageLockBytes", "expectedPackageJsonSha256", "expectedPackageLockSha256"];
const HASH = /^[a-f0-9]{64}$/;
const CONTROL = /[\x00-\x1f\x7f-\x9f\u202a-\u202e\u2066-\u2069]/u;
const object = value => value !== null && typeof value === "object" && !Array.isArray(value);
const within = (root, full) => full === root || full.startsWith(root + "/");
const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");
class Rejected extends Error {
  constructor(code, state = "blocked") { super(code); this.code = code; this.state = state; }
}
const reject = (code, state) => { throw new Rejected(code, state); };

function inputs(input) {
  try {
    if (!object(input) || types.isProxy(input) ||
        ![Object.prototype, null].includes(Object.getPrototypeOf(input)) || Object.getOwnPropertySymbols(input).length) {
      reject("MC_PACKAGE_INPUT", "invalid");
    }
    const fields = Object.getOwnPropertyDescriptors(input);
    if (Object.keys(fields).length !== KEYS.length || !KEYS.every(key =>
      Object.hasOwn(fields, key) && fields[key].enumerable && Object.hasOwn(fields[key], "value"))) reject("MC_PACKAGE_INPUT", "invalid");
    // Copy only small metadata here: file bytes have their own larger budgets.
    const data = copyMemoryConnectionData({
      descriptor: fields.descriptor.value,
      packagePin: fields.expectedPackageJsonSha256.value,
      lockPin: fields.expectedPackageLockSha256.value
    });
    if (typeof data.packagePin !== "string" || !HASH.test(data.packagePin) ||
        typeof data.lockPin !== "string" || !HASH.test(data.lockPin)) reject("MC_PACKAGE_INPUT", "invalid");
    const descriptor = createMemoryConnectionDescriptor(data.descriptor?.identity);
    if (memoryConnectionHash(descriptor) !== memoryConnectionHash(data.descriptor)) reject("MC_PACKAGE_INPUT", "invalid");
    const { toolkitRoot, vaultPath, manifestPath } = descriptor.identity;
    if (within(toolkitRoot, vaultPath) || within(vaultPath, toolkitRoot) || !manifestPath.startsWith(vaultPath + "/")) {
      reject("MC_PACKAGE_INPUT", "invalid");
    }
    return { descriptor, packagePin: data.packagePin, lockPin: data.lockPin,
      packageValue: fields.packageJsonBytes.value, lockValue: fields.packageLockBytes.value };
  } catch { reject("MC_PACKAGE_INPUT", "invalid"); }
}

function capture(value, limit) {
  try {
    if (value && typeof value === "object" && !types.isProxy(value) && types.isUint8Array(value)) {
      const typed = Object.getPrototypeOf(Uint8Array.prototype);
      const backing = Object.getOwnPropertyDescriptor(typed, "buffer").get.call(value);
      if (types.isSharedArrayBuffer(backing)) reject("MC_PACKAGE_INPUT", "invalid");
    }
    return copyBytes(value, limit);
  } catch (error) {
    if (error instanceof Rejected) throw error;
    if (error?.code === "byte-limit") reject("MC_PACKAGE_LIMIT");
    if (["invalid-unicode", "invalid-utf8"].includes(error?.code)) reject("MC_PACKAGE_FORMAT");
    reject("MC_PACKAGE_INPUT", "invalid");
  }
}

function parse(bytes) {
  try { return copyInertJson(parseEventJson(decode(bytes))); }
  catch (error) { reject(["event-json-limit", "metadata-limit"].includes(error?.code) ? "MC_PACKAGE_LIMIT" : "MC_PACKAGE_FORMAT"); }
}

function profile(pkg, lock) {
  if (lock.lockfileVersion !== 3 || !object(lock.packages) || !Object.hasOwn(lock.packages, "") || !object(lock.packages[""])) {
    reject("MC_PACKAGE_PROFILE");
  }
  const root = lock.packages[""];
  for (const item of [pkg, root]) {
    for (const field of ["devDependencies", "optionalDependencies", "peerDependencies"]) {
      if (Object.hasOwn(item, field) && (!object(item[field]) || Object.keys(item[field]).length)) reject("MC_PACKAGE_PROFILE");
    }
    for (const field of ["workspaces", "overrides", "bundleDependencies", "bundledDependencies"]) {
      if (Object.hasOwn(item, field)) reject("MC_PACKAGE_PROFILE");
    }
  }
  return root;
}

function literal(value, limit, reason) {
  if (typeof value === "string" && value.length > limit) reject("MC_PACKAGE_LIMIT");
  if (typeof value !== "string" || !value || value !== value.trim() || CONTROL.test(value)) reject(reason);
  return value;
}

function identity(pkg, lock, root) {
  for (const field of ["name", "version"]) {
    const values = [pkg, lock, root].map(item => literal(item[field], MEMORY_CONNECTION_PACKAGE_LIMITS.nameChars, "MC_PACKAGE_IDENTITY"));
    if (values.some(value => value !== values[0])) reject("MC_PACKAGE_IDENTITY");
  }
}

function dependencies(item) {
  if (!Object.hasOwn(item, "dependencies")) return {};
  const value = item.dependencies;
  if (!object(value)) reject("MC_PACKAGE_DEPENDENCIES");
  const keys = Object.keys(value);
  if (keys.length > MEMORY_CONNECTION_PACKAGE_LIMITS.dependencies) reject("MC_PACKAGE_LIMIT");
  for (const key of keys) {
    literal(key, MEMORY_CONNECTION_PACKAGE_LIMITS.nameChars, "MC_PACKAGE_DEPENDENCIES");
    literal(value[key], MEMORY_CONNECTION_PACKAGE_LIMITS.specifierChars, "MC_PACKAGE_DEPENDENCIES");
  }
  return value;
}

function engines(pkg, root) {
  for (const item of [pkg, root]) {
    if (Object.hasOwn(item, "engines") && !object(item.engines)) reject("MC_PACKAGE_ENGINES");
  }
  const has = item => Object.hasOwn(item, "engines") && Object.hasOwn(item.engines, "node");
  const a = has(pkg), b = has(root);
  if (!a && !b) return false;
  if (!a || !b) reject("MC_PACKAGE_ENGINES");
  const left = literal(pkg.engines.node, MEMORY_CONNECTION_PACKAGE_LIMITS.specifierChars, "MC_PACKAGE_ENGINES");
  const right = literal(root.engines.node, MEMORY_CONNECTION_PACKAGE_LIMITS.specifierChars, "MC_PACKAGE_ENGINES");
  if (left !== right) reject("MC_PACKAGE_ENGINES");
  return true;
}

function report(state, reason, hashes = {}, engineMatched = false) {
  const matched = state === "consistent";
  const result = {
    schemaVersion: MEMORY_CONNECTION_VERSION, state, reasons: [reason],
    descriptorSha256: null, packageJsonSha256: null, packageLockSha256: null, ...hashes,
    facts: {
      ...MEMORY_CONNECTION_FACTS, evidence: "provided-bytes", verificationScope: "package-root-declarations-only",
      packageIdentityMatched: matched, directDependencyDeclarationsMatched: matched,
      engineDeclarationMatched: matched && engineMatched,
      rangeSatisfactionVerified: false, dependencyGraphVerified: false, installedDependenciesVerified: false,
      runtimeVersionVerified: false, runtimeCompatibilityVerified: false
    }
  };
  if (Buffer.byteLength(JSON.stringify(result)) > MEMORY_CONNECTION_PACKAGE_LIMITS.reportBytes) reject("MC_PACKAGE_LIMIT");
  return freezeMemoryConnectionData(result);
}

/**
 * Compare two reviewed byte captures and root declarations only. No candidate IO,
 * npm/Node execution, range solving, installed-tree inspection or plan integration.
 */
export function validateMemoryConnectionPackage(input) {
  try {
    const data = inputs(input);
    const packageBytes = capture(data.packageValue, MEMORY_CONNECTION_PACKAGE_LIMITS.packageJsonBytes);
    const lockBytes = capture(data.lockValue, MEMORY_CONNECTION_PACKAGE_LIMITS.packageLockBytes);
    if (packageBytes.length + lockBytes.length > MEMORY_CONNECTION_PACKAGE_LIMITS.totalBytes) reject("MC_PACKAGE_LIMIT");
    const packageHash = sha256(packageBytes), lockHash = sha256(lockBytes);
    if (packageHash !== data.packagePin || lockHash !== data.lockPin) reject("MC_PACKAGE_PIN_MISMATCH");
    const pkg = parse(packageBytes), lock = parse(lockBytes);
    if (containsSensitiveData(JSON.stringify(pkg)) || containsSensitiveData(JSON.stringify(lock))) reject("MC_PACKAGE_SENSITIVE");
    const root = profile(pkg, lock);
    identity(pkg, lock, root);
    const left = dependencies(pkg), right = dependencies(root), keys = Object.keys(left);
    if (keys.length !== Object.keys(right).length || keys.some(key => !Object.hasOwn(right, key) || left[key] !== right[key])) {
      reject("MC_PACKAGE_DEPENDENCIES");
    }
    const engineMatched = engines(pkg, root);
    return report("consistent", "MC_PACKAGE_CONSISTENT", {
      descriptorSha256: memoryConnectionHash(data.descriptor), packageJsonSha256: data.packagePin, packageLockSha256: data.lockPin
    }, engineMatched);
  } catch (error) {
    return report(error instanceof Rejected ? error.state : "blocked", error instanceof Rejected ? error.code : "MC_PACKAGE_VALIDATION");
  }
}
