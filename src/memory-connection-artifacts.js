import { resolvePackageLock } from './package-lock-path.js';
import fs from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

import {
  createMemoryConnectionDescriptor, copyMemoryConnectionData, freezeMemoryConnectionData,
  memoryConnectionHash, MEMORY_CONNECTION_FACTS, MEMORY_CONNECTION_VERSION
} from "./memory-connection-descriptor.js";

const MIB = 1048576;
export const MEMORY_CONNECTION_ARTIFACT_LIMITS = Object.freeze({
  nodeBytes: 256 * MIB, smallBytes: MIB / 2, lockBytes: 2 * MIB,
  totalBytes: 260 * MIB, chunkBytes: 65536,
  pathChars: 4096, components: 64, reportBytes: 131072
});
export const MEMORY_CONNECTION_ARTIFACT_OPEN_FLAGS = constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK;
const HASH_KEYS = ["nodeSha256", "binSha256", "manifestSha256", "packageJsonSha256", "packageLockSha256"];
class Rejected extends Error {
  constructor(code, state = "blocked") { super(code); this.code = code; this.state = state; }
}
const reject = (code, state) => { throw new Rejected(code, state); };
const errno = (e) => e instanceof Error && typeof e.code === "string" ? e.code : "";
const within = (root, full) => full === root || full.startsWith(root + "/");
const fileSignature = (s) => JSON.stringify([s.dev, s.ino, s.uid, s.gid, s.mode, s.nlink, s.size, s.mtimeMs, s.ctimeMs]);
const dirSignature = (s) => JSON.stringify([s.dev, s.ino, s.uid, s.gid, s.mode]);
const inode = (s) => JSON.stringify([s.dev, s.ino]);

function inputData(input) {
  try {
    const data = copyMemoryConnectionData(input);
    if (!data || Array.isArray(data) || Object.keys(data).length !== 2 ||
        !Object.hasOwn(data, "descriptor") || !Object.hasOwn(data, "expectedHashes")) reject("MC_ARTIFACT_INPUT", "invalid");
    const descriptor = createMemoryConnectionDescriptor(data.descriptor?.identity);
    if (memoryConnectionHash(data.descriptor) !== memoryConnectionHash(descriptor)) reject("MC_ARTIFACT_INPUT", "invalid");
    const hashes = data.expectedHashes;
    if (!hashes || Array.isArray(hashes) || Object.keys(hashes).length !== HASH_KEYS.length ||
        !HASH_KEYS.every(key => Object.hasOwn(hashes, key) && typeof hashes[key] === "string" && /^[a-f0-9]{64}$/.test(hashes[key]))) {
      reject("MC_ARTIFACT_INPUT", "invalid");
    }
    const { toolkitRoot, vaultPath, manifestPath, nodePath } = descriptor.identity;
    if (within(toolkitRoot, vaultPath) || within(vaultPath, toolkitRoot) ||
        !manifestPath.startsWith(vaultPath + "/")) reject("MC_ARTIFACT_INPUT", "invalid");
    const entries = [
      { key: "nodeSha256", full: nodePath, kind: "node", limit: MEMORY_CONNECTION_ARTIFACT_LIMITS.nodeBytes },
      { key: "binSha256", full: descriptor.server.args[0], kind: "code", limit: MEMORY_CONNECTION_ARTIFACT_LIMITS.smallBytes },
      { key: "manifestSha256", full: manifestPath, kind: "manifest", limit: MEMORY_CONNECTION_ARTIFACT_LIMITS.smallBytes },
      { key: "packageJsonSha256", full: toolkitRoot + "/package.json", kind: "code", limit: MEMORY_CONNECTION_ARTIFACT_LIMITS.smallBytes },
      { key: "packageLockSha256", full: toolkitRoot + "/package-lock.json", kind: "code", limit: MEMORY_CONNECTION_ARTIFACT_LIMITS.lockBytes }
    ];
    for (const entry of entries) {
      if (entry.full.length > MEMORY_CONNECTION_ARTIFACT_LIMITS.pathChars ||
          entry.full.split("/").length - 1 > MEMORY_CONNECTION_ARTIFACT_LIMITS.components ||
          entries.some(other => other !== entry && within(entry.full, other.full))) reject("MC_ARTIFACT_INPUT", "invalid");
    }
    return { descriptor, hashes, entries, roots: [toolkitRoot, vaultPath] };
  } catch { reject("MC_ARTIFACT_INPUT", "invalid"); }
}
function safeDir(s, uid, owned) {
  if (!s.isDirectory() || s.isSymbolicLink() || !(s.mode & 0o100)) reject("MC_ARTIFACT_PARENT_UNSAFE");
  if (owned) {
    if (s.uid !== uid || s.mode & 0o7022) reject("MC_ARTIFACT_PARENT_UNSAFE");
  } else {
    const sharedSticky = s.uid === 0 && (s.mode & 0o7777) === 0o1777;
    if (![0, uid].includes(s.uid) || !sharedSticky && s.mode & 0o7022) reject("MC_ARTIFACT_PARENT_UNSAFE");
  }
}
function safeFile(s, entry, uid) {
  if (!s.isFile() || s.isSymbolicLink() || s.nlink !== 1) reject("MC_ARTIFACT_FILE_UNSAFE");
  const mode = s.mode & 0o7777;
  if (entry.kind === "node") {
    if (![0, uid].includes(s.uid) || (mode & 0o500) !== 0o500 || mode & 0o7022) reject("MC_ARTIFACT_FILE_UNSAFE");
  } else if (s.uid !== uid || (entry.kind === "manifest" ? mode !== 0o600 : ![0o600, 0o644].includes(mode))) {
    reject("MC_ARTIFACT_FILE_UNSAFE");
  }
  if (!Number.isSafeInteger(s.size) || s.size < 0 || s.size > entry.limit) reject("MC_ARTIFACT_FILE_LIMIT");
}
async function snapshot(io, entry, roots, uid) {
  const parents = []; let current = "/";
  const root = await io.lstat(current); safeDir(root, uid, false);
  parents.push({ path: current, signature: dirSignature(root), inode: inode(root) });
  const parts = entry.full.slice(1).split("/");
  for (const part of parts.slice(0, -1)) {
    current = path.posix.join(current, part); const s = await io.lstat(current);
    safeDir(s, uid, roots.some(owned => within(owned, current)));
    parents.push({ path: current, signature: dirSignature(s), inode: inode(s) });
  }
  const stat = await io.lstat(entry.full); safeFile(stat, entry, uid);
  return { entry, parents, stat };
}
async function recheck(io, item, roots, uid) {
  for (const parent of item.parents) {
    let s; try { s = await io.lstat(parent.path); } catch { reject("MC_ARTIFACT_CHANGED"); }
    safeDir(s, uid, roots.some(owned => within(owned, parent.path)));
    if (dirSignature(s) !== parent.signature) reject("MC_ARTIFACT_CHANGED");
  }
  let named;
  try { named = await io.lstat(item.entry.full); } catch { reject("MC_ARTIFACT_CHANGED"); }
  safeFile(named, item.entry, uid);
  if (fileSignature(named) !== fileSignature(item.stat)) reject("MC_ARTIFACT_CHANGED");
}
async function recheckAll(io, items, roots, uid) {
  for (const item of items) await recheck(io, item, roots, uid);
}
function rejectAliases(items, roots) {
  const files = items.map(item => inode(item.stat));
  if (new Set(files).size !== files.length) reject("MC_ARTIFACT_ALIAS");
  const directories = roots.map(root => items.flatMap(item => item.parents).find(p => p.path === root)?.inode);
  if (directories.some(value => value === undefined) || new Set(directories).size !== directories.length) reject("MC_ARTIFACT_ALIAS");
}

/**
 * Verify five explicit byte pins, NOT executable semantics, active runtime,
 * manifest/schema validity or installed dependency/import closure. No discovery,
 * candidate execution/import, node_modules enumeration, install or write.
 * Trusted IO doubles are simulations, never native local-read attestations.
 * Rechecks are cooperative observations, not atomic openat or ABA isolation.
 */
export async function inspectMemoryConnectionArtifacts(input, dependencies = {}) {
  let data = null, nativeIO = false;
  const budget = { read: 0 };
  const report = (state, details = {}) => {
    const matched = state === "matched";
    const result = {
      schemaVersion: MEMORY_CONNECTION_VERSION, state, hashes: null,
      metadataSha256: null, bytesRead: budget.read, reasons: [], ...details,
      facts: {
        ...MEMORY_CONNECTION_FACTS, verificationScope: "base-artifacts-only",
        evidence: matched ? nativeIO ? "local-artifact-files" : "simulated-local-artifacts" : "none",
        artifactPathsVerified: matched && nativeIO, localReadVerified: matched && nativeIO,
        bytePinsMatched: matched, installedDependenciesVerified: false,
        manifestSemanticsVerified: false, runtimeVersionVerified: false,
        runtimeCompatibilityVerified: false, inspectedCandidatesExecuted: false
      }
    };
    if (Buffer.byteLength(JSON.stringify(result)) > MEMORY_CONNECTION_ARTIFACT_LIMITS.reportBytes) reject("MC_ARTIFACT_REPORT_LIMIT");
    return freezeMemoryConnectionData(result);
  };
  try {
    data = inputData(input);
    nativeIO = dependencies.io === undefined;
    const io = dependencies.io ?? fs, uid = process.getuid?.();
    if (!["darwin", "linux"].includes(process.platform) || !Number.isSafeInteger(uid) || constants.O_NOFOLLOW === undefined) reject("MC_ARTIFACT_PLATFORM");
    data.entries.find(entry => entry.key === 'packageLockSha256').full = await resolvePackageLock(data.descriptor.identity.toolkitRoot, io);
    const items = [];
    for (const entry of data.entries) items.push(await snapshot(io, entry, data.roots, uid));
    rejectAliases(items, data.roots);
    if (items.reduce((sum, item) => sum + item.stat.size, 0) > MEMORY_CONNECTION_ARTIFACT_LIMITS.totalBytes) reject("MC_ARTIFACT_TOTAL_LIMIT");
    await recheckAll(io, items, data.roots, uid);
    // One reusable small buffer, not an allocation of a Node binary's size.
    const chunk = Buffer.alloc(MEMORY_CONNECTION_ARTIFACT_LIMITS.chunkBytes), hashes = {};
    for (const item of items) {
      await recheckAll(io, items, data.roots, uid);
      let handle;
      try { handle = await io.open(item.entry.full, MEMORY_CONNECTION_ARTIFACT_OPEN_FLAGS); }
      catch (e) { reject(errno(e) === "ELOOP" ? "MC_ARTIFACT_FILE_UNSAFE" : "MC_ARTIFACT_UNREADABLE"); }
      const hash = createHash("sha256");
      try {
        const opened = await handle.stat(); safeFile(opened, item.entry, uid);
        if (fileSignature(opened) !== fileSignature(item.stat)) reject("MC_ARTIFACT_CHANGED");
        await recheck(io, item, data.roots, uid);
        let offset = 0;
        while (offset < item.stat.size) {
          const request = Math.min(chunk.length, item.stat.size - offset, MEMORY_CONNECTION_ARTIFACT_LIMITS.totalBytes - budget.read);
          if (request <= 0) reject("MC_ARTIFACT_TOTAL_LIMIT");
          const { bytesRead } = await handle.read(chunk, 0, request, offset);
          if (!Number.isSafeInteger(bytesRead) || bytesRead < 0 || bytesRead > request) reject("MC_ARTIFACT_READ");
          budget.read += bytesRead; // Retained even if metadata/pin/hash later fails.
          if (!bytesRead) reject("MC_ARTIFACT_CHANGED");
          offset += bytesRead; hash.update(chunk.subarray(0, bytesRead));
        }
        const after = await handle.stat(); safeFile(after, item.entry, uid);
        if (fileSignature(after) !== fileSignature(item.stat)) reject("MC_ARTIFACT_CHANGED");
        await recheck(io, item, data.roots, uid);
      } finally {
        try { await handle.close(); } catch { reject("MC_ARTIFACT_CLOSE"); }
      }
      await recheck(io, item, data.roots, uid);
      const value = hash.digest("hex");
      if (value !== data.hashes[item.entry.key]) reject("MC_ARTIFACT_PIN_MISMATCH");
      hashes[item.entry.key] = value;
    }
    await recheckAll(io, items, data.roots, uid);
    const metadataSha256 = createHash("sha256").update(JSON.stringify(items.map(item => ({
      role: item.entry.key, path: item.entry.full, parents: item.parents, signature: fileSignature(item.stat)
    })))).digest("hex");
    return report("matched", { hashes, metadataSha256, reasons: ["MC_ARTIFACT_MATCH"] });
  } catch (e) {
    return report(e instanceof Rejected ? e.state : "blocked", { reasons: [e instanceof Rejected ? e.code : "MC_ARTIFACT_IO"] });
  }
}
