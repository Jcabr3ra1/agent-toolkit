import { createHash } from "node:crypto";
import path from "node:path";

import { copyInertJson } from "./client-output-json.js";
import { MEMORY_READ_TOOLS } from "./memory-mcp-policy.js";
import { containsSensitiveData, isCredentialPath } from "./sensitive-data.js";

export const MEMORY_CONNECTION_VERSION = "1.0.0";
export const MEMORY_CONNECTION_LIMITS = Object.freeze({
  inputBytes: 131072,
  reportBytes: 131072,
  pathChars: 4096
});
export const MEMORY_CONNECTION_FACTS = Object.freeze({
  evidence: "declared",
  physicalPathsVerified: false,
  localReadVerified: false,
  nativeReadVerified: false,
  runtimeVerified: false,
  authorizationGranted: false,
  executable: false,
  applied: false,
  wrote: false,
  sent: false,
  executed: false,
  humanReviewRequired: true
});

const INPUT_KEYS = [
  "agent", "mcpName", "skillName", "nodePath", "toolkitRoot",
  "manifestPath", "vaultPath", "sourcePath", "homeDirectory"
];
const ROOT_KEYS = ["toolkitRoot", "vaultPath", "sourcePath", "homeDirectory"];
const CONTROL = /[\x00-\x1f\x7f-\x9f\u202a-\u202e\u2066-\u2069]/u;
const PRIVATE_PATH = /(?:^|\/)(?:\.git|\.obsidian|\.codex|\.claude|\.gemini|\.agents|\.secrets|\.credentials|\.npmrc|\.netrc|\.envrc)(?:\/|$)/i;
const RESERVED_NAMES = new Set(["__proto__", "constructor", "prototype"]);

export class MemoryConnectionInputError extends Error {
  constructor(code) {
    super(code);
    this.name = "MemoryConnectionInputError";
    this.code = code;
  }
}

const reject = (code) => { throw new MemoryConnectionInputError(code); };

/** Reject conversion hooks before interpreting caller-supplied declarations. */
export function copyMemoryConnectionData(input) {
  let data;
  try { data = copyInertJson(input); }
  catch { reject("MC_DATA_INVALID"); }
  if (Buffer.byteLength(JSON.stringify(data)) > MEMORY_CONNECTION_LIMITS.inputBytes) {
    reject("MC_INPUT_LIMIT");
  }
  return data;
}

export function freezeMemoryConnectionData(data) {
  const owned = copyMemoryConnectionData(data);
  function freeze(value) {
    if (value !== null && typeof value === "object") {
      for (const child of Object.values(value)) freeze(child);
      Object.freeze(value);
    }
    return value;
  }
  return freeze(owned);
}

/** Stable pin over inert declarations only; this does not verify their truth. */
export function memoryConnectionHash(input) {
  const data = copyMemoryConnectionData(input);
  const canonical = (value) => {
    if (value === null || typeof value !== "object") return JSON.stringify(value);
    if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
    return "{" + Object.keys(value).sort().map((key) =>
      JSON.stringify(key) + ":" + canonical(value[key])).join(",") + "}";
  };
  return createHash("sha256").update(canonical(data)).digest("hex");
}

export function hasMemoryConnectionKeys(value, required, optional = []) {
  let data, keys;
  try {
    data = copyMemoryConnectionData(value);
    keys = copyMemoryConnectionData({ required, optional });
  } catch { return false; }
  return data !== null && typeof data === "object" && !Array.isArray(data) &&
    Array.isArray(keys.required) && Array.isArray(keys.optional) &&
    [...keys.required, ...keys.optional].every((key) => typeof key === "string") &&
    keys.required.every((key) => Object.hasOwn(data, key)) &&
    Object.keys(data).every((key) => keys.required.includes(key) || keys.optional.includes(key));
}

function isPath(value, allowClientDirectory = false) {
  return typeof value === "string" && value.length > 0 &&
    value.length <= MEMORY_CONNECTION_LIMITS.pathChars && value === value.trim() &&
    Buffer.from(value, "utf8").toString("utf8") === value &&
    !CONTROL.test(value) && !value.includes("\\") &&
    path.posix.isAbsolute(value) && path.posix.normalize(value) === value &&
    value.split("/").slice(1).every((part) => part && part !== "." && part !== "..") &&
    !containsSensitiveData(value) && !isCredentialPath(value) &&
    (allowClientDirectory || !PRIVATE_PATH.test(value));
}

function isName(value) {
  return typeof value === "string" && /^[a-z][a-z0-9-]{0,63}$/.test(value) &&
    !RESERVED_NAMES.has(value);
}

const within = (parent, child) => child === parent || child.startsWith(parent + "/");

/**
 * Builds a disabled protected invocation from explicit POSIX path declarations.
 * No discovery, realpath, file inspection, runtime admission or execution occurs.
 * A collector must independently verify paths and bytes before operational use.
 */
export function createMemoryConnectionDescriptor(input) {
  const data = copyMemoryConnectionData(input);
  if (!hasMemoryConnectionKeys(data, INPUT_KEYS)) reject("MC_DESCRIPTOR_INVALID");
  if (data.agent !== "codex") reject("MC_AGENT_UNSUPPORTED");
  if (!isName(data.mcpName) || !isName(data.skillName)) reject("MC_NAME_INVALID");
  for (const key of ["nodePath", "manifestPath", ...ROOT_KEYS]) {
    if (!isPath(data[key])) reject("MC_PATH_INVALID");
  }
  if (data.vaultPath === data.homeDirectory ||
      within(data.sourcePath, data.vaultPath) || within(data.vaultPath, data.sourcePath)) {
    reject("MC_PATH_OVERLAP");
  }

  const binPath = path.posix.join(data.toolkitRoot, "bin", "project-memory-mcp.js");
  const source = path.posix.join(data.vaultPath, "07-AGENTES", "skills", data.skillName);
  const target = path.posix.join(data.homeDirectory, ".agents", "skills", data.skillName);
  const configurationPath = path.posix.join(data.homeDirectory, ".codex", "config.toml");
  if (!isPath(binPath) || !isPath(source) ||
      !isPath(target, true) || !isPath(configurationPath, true)) {
    reject("MC_PATH_INVALID");
  }
  const descriptor = {
    schemaVersion: MEMORY_CONNECTION_VERSION,
    identity: data,
    server: {
      command: data.nodePath,
      args: [binPath, "--manifest", data.manifestPath],
      cwd: data.toolkitRoot,
      enabled_tools: [...MEMORY_READ_TOOLS],
      enabled: false
    },
    skill: { source, target },
    configurationPath,
    facts: { ...MEMORY_CONNECTION_FACTS }
  };
  if (Buffer.byteLength(JSON.stringify(descriptor)) > MEMORY_CONNECTION_LIMITS.reportBytes) {
    reject("MC_REPORT_LIMIT");
  }
  return freezeMemoryConnectionData(descriptor);
}
