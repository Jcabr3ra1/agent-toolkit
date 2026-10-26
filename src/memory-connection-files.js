import fs from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

import {
  copyMemoryConnectionData, freezeMemoryConnectionData,
  MEMORY_CONNECTION_FACTS, MEMORY_CONNECTION_VERSION
} from "./memory-connection-descriptor.js";
import { readMemoryConnectionToml, MEMORY_CONNECTION_TOML_LIMITS } from "./memory-connection-toml.js";
import { containsSensitiveData, isCredentialPath } from "./sensitive-data.js";

export const MEMORY_CONNECTION_FILE_LIMITS = Object.freeze({
  fileBytes: MEMORY_CONNECTION_TOML_LIMITS.inputBytes, chunkBytes: 65536,
  pathChars: 4096, components: 64, reportBytes: 131072
});
export const MEMORY_CONNECTION_OPEN_FLAGS = constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK;
const CONTROL = /[\x00-\x1f\x7f-\x9f\u202a-\u202e\u2066-\u2069]/u;
const PRIVATE_ROOT = /(?:^|\/)(?:\.git|\.obsidian|\.codex|\.claude|\.gemini|\.agents|\.credentials|\.secrets)(?:\/|$)/i;
class Rejected extends Error {
  constructor(code, state = "blocked") { super(code); this.code = code; this.state = state; }
}
const reject = (code, state) => { throw new Rejected(code, state); };
const errno = (error) => error instanceof Error && typeof error.code === "string" ? error.code : "";
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const directorySignature = (s) => JSON.stringify([s.dev, s.ino, s.uid, s.gid, s.mode]);
const fileSignature = (s) => JSON.stringify([s.dev, s.ino, s.uid, s.gid, s.mode, s.nlink, s.size, s.mtimeMs, s.ctimeMs]);

function validPath(value) {
  return typeof value === "string" && value.length > 1 && value.length <= MEMORY_CONNECTION_FILE_LIMITS.pathChars &&
    value === value.trim() && Buffer.from(value, "utf8").toString("utf8") === value &&
    !CONTROL.test(value) && !value.includes("\\") && path.posix.isAbsolute(value) &&
    path.posix.normalize(value) === value && !value.endsWith("/") &&
    value.split("/").slice(1).every((part) => part && part !== "." && part !== "..") &&
    value.split("/").length - 1 <= MEMORY_CONNECTION_FILE_LIMITS.components &&
    !containsSensitiveData(value) && !isCredentialPath(value);
}
function inputData(input) {
  let data;
  try { data = copyMemoryConnectionData(input); } catch { reject("MC_FILES_INPUT", "invalid"); }
  const required = ["homeDirectory", "configurationPath", "mcpName"];
  if (!data || Array.isArray(data) || Object.keys(data).length !== required.length ||
      !required.every((key) => Object.hasOwn(data, key)) ||
      !validPath(data.homeDirectory) || PRIVATE_ROOT.test(data.homeDirectory) ||
      !validPath(data.configurationPath) || data.configurationPath !== data.homeDirectory + "/.codex/config.toml" ||
      typeof data.mcpName !== "string" || !/^[a-z][a-z0-9-]{0,63}$/.test(data.mcpName) ||
      ["constructor", "prototype", "__proto__"].includes(data.mcpName)) reject("MC_FILES_INPUT", "invalid");
  return data;
}

function safeDirectory(s, uid, insideHome) {
  if (!s.isDirectory() || s.isSymbolicLink() || !(s.mode & 0o100)) reject("MC_FILES_PARENT_UNSAFE");
  if (insideHome) {
    if (s.uid !== uid || s.mode & 0o7022) reject("MC_FILES_PARENT_UNSAFE");
  } else {
    // Root-owned sticky temporary ancestors are allowed ONLY before the owned home.
    const sharedTemporary = s.uid === 0 && (s.mode & 0o7777) === 0o1777;
    if (![0, uid].includes(s.uid) || !sharedTemporary && s.mode & 0o7022) reject("MC_FILES_PARENT_UNSAFE");
  }
}
function safeFile(s, uid) {
  if (!s.isFile() || s.isSymbolicLink() || s.uid !== uid || s.nlink !== 1 || (s.mode & 0o7777) !== 0o600) {
    reject("MC_FILES_FILE_UNSAFE");
  }
  if (!Number.isSafeInteger(s.size) || s.size < 0 || s.size > MEMORY_CONNECTION_FILE_LIMITS.fileBytes) {
    reject("MC_FILES_LIMIT");
  }
}
async function inspect(io, data, uid) {
  const parents = [];
  let current = "/";
  const root = await io.lstat(current); safeDirectory(root, uid, false);
  parents.push({ path: current, signature: directorySignature(root) });
  const parts = data.configurationPath.slice(1).split("/");
  for (let index = 0; index < parts.length; index++) {
    current = path.posix.join(current, parts[index]);
    let s;
    try { s = await io.lstat(current); }
    catch (error) {
      if (errno(error) === "ENOENT" && [data.homeDirectory + "/.codex", data.configurationPath].includes(current)) {
        return { parents, file: null, missing: current };
      }
      reject("MC_FILES_UNREADABLE");
    }
    if (index === parts.length - 1) { safeFile(s, uid); return { parents, file: s, missing: null }; }
    safeDirectory(s, uid, current === data.homeDirectory || current.startsWith(data.homeDirectory + "/"));
    parents.push({ path: current, signature: directorySignature(s) });
  }
  reject("MC_FILES_INPUT", "invalid");
}
async function recheck(io, data, snapshot, uid) {
  for (const parent of snapshot.parents) {
    let s;
    try { s = await io.lstat(parent.path); } catch { reject("MC_FILES_CHANGED"); }
    safeDirectory(s, uid, parent.path === data.homeDirectory || parent.path.startsWith(data.homeDirectory + "/"));
    if (directorySignature(s) !== parent.signature) reject("MC_FILES_CHANGED");
  }
  if (snapshot.missing) {
    try { await io.lstat(snapshot.missing); }
    catch (error) { if (errno(error) === "ENOENT") return; reject("MC_FILES_CHANGED"); }
    reject("MC_FILES_CHANGED");
  }
  let named;
  try { named = await io.lstat(data.configurationPath); } catch { reject("MC_FILES_CHANGED"); }
  safeFile(named, uid);
  if (fileSignature(named) !== fileSignature(snapshot.file)) reject("MC_FILES_CHANGED");
}

/**
 * Reads one explicit configuration in a verified POSIX path; never discovers,
 * writes, repairs or launches anything. IO overrides are TRUSTED test doubles,
 * not an authorization/sandbox boundary and never evidence of native local IO.
 * Name/descriptor checks detect observable races, not atomic openat/ABA isolation.
 */
export async function collectMemoryConnectionConfiguration(input, dependencies = {}) {
  let data = null;
  let nativeIO = false, io;
  const result = (state, details = {}) => {
    const success = state === "observed" || state === "absent";
    const read = state === "observed";
    const report = {
      schemaVersion: MEMORY_CONNECTION_VERSION, state, mcpName: data?.mcpName ?? null,
      fileState: read ? "present" : state === "absent" ? "absent" : "unknown",
      entryState: null, configurationSha256: null, metadataSha256: null,
      server: null, ranges: null, reasons: [], ...details,
      facts: {
        ...MEMORY_CONNECTION_FACTS, verificationScope: "configuration-only",
        evidence: success ? nativeIO ? read ? "local-file" : "local-metadata" : "simulated-local-file" : "none",
        configurationPathVerified: success && nativeIO,
        configurationSourceVerified: read && nativeIO,
        localReadVerified: read && nativeIO,
        byteSyntaxVerified: read
      }
    };
    if (Buffer.byteLength(JSON.stringify(report)) > MEMORY_CONNECTION_FILE_LIMITS.reportBytes) reject("MC_FILES_REPORT_LIMIT");
    return freezeMemoryConnectionData(report);
  };
  try {
    data = inputData(input);
    nativeIO = dependencies.io === undefined;
    io = dependencies.io ?? fs;
    const uid = process.getuid?.();
    if (!["darwin", "linux"].includes(process.platform) || !Number.isSafeInteger(uid) || constants.O_NOFOLLOW === undefined) {
      reject("MC_FILES_PLATFORM");
    }
    const snapshot = await inspect(io, data, uid);
    const metadataHash = () => digest(JSON.stringify({
      parents: snapshot.parents, path: data.configurationPath,
      file: snapshot.file ? fileSignature(snapshot.file) : null, missing: snapshot.missing
    }));
    await recheck(io, data, snapshot, uid);
    if (snapshot.missing) return result("absent", { metadataSha256: metadataHash(), reasons: ["MC_FILES_MISSING"] });
    let handle;
    try { handle = await io.open(data.configurationPath, MEMORY_CONNECTION_OPEN_FLAGS); }
    catch (error) { reject(errno(error) === "ELOOP" ? "MC_FILES_FILE_UNSAFE" : "MC_FILES_UNREADABLE"); }
    let bytes;
    try {
      const opened = await handle.stat(); safeFile(opened, uid);
      if (fileSignature(opened) !== fileSignature(snapshot.file)) reject("MC_FILES_CHANGED");
      // Recheck the whole named chain BEFORE the first content read, too.
      await recheck(io, data, snapshot, uid);
      bytes = Buffer.alloc(snapshot.file.size);
      let offset = 0;
      while (offset < bytes.length) {
        const request = Math.min(MEMORY_CONNECTION_FILE_LIMITS.chunkBytes, bytes.length - offset);
        const { bytesRead } = await handle.read(bytes, offset, request, offset);
        if (!Number.isSafeInteger(bytesRead) || bytesRead < 0 || bytesRead > request) reject("MC_FILES_READ");
        if (bytesRead === 0) reject("MC_FILES_CHANGED");
        offset += bytesRead;
      }
      const after = await handle.stat(); safeFile(after, uid);
      if (fileSignature(after) !== fileSignature(snapshot.file)) reject("MC_FILES_CHANGED");
      await recheck(io, data, snapshot, uid);
    } finally {
      try { await handle.close(); } catch { reject("MC_FILES_CLOSE"); }
    }
    await recheck(io, data, snapshot, uid);
    const parsed = readMemoryConnectionToml(bytes, { mcpName: data.mcpName });
    if (!["observed", "absent"].includes(parsed.state)) {
      return result("blocked", { reasons: ["MC_FILES_TOML", ...parsed.reasons] });
    }
    return result("observed", {
      entryState: parsed.state, configurationSha256: parsed.configurationSha256,
      metadataSha256: metadataHash(), server: parsed.server, ranges: parsed.ranges
    });
  } catch (error) {
    return result(error instanceof Rejected ? error.state : "blocked", {
      reasons: [error instanceof Rejected ? error.code : "MC_FILES_IO"]
    });
  }
}
