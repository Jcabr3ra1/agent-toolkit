import fs from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { copyBytes, decode } from "./client-output-json.js";

import {
  createMemoryConnectionDescriptor, copyMemoryConnectionData,
  freezeMemoryConnectionData, memoryConnectionHash,
  MEMORY_CONNECTION_FACTS, MEMORY_CONNECTION_VERSION
} from "./memory-connection-descriptor.js";

export const MEMORY_CONNECTION_SKILL_LIMITS = Object.freeze({
  fileBytes: 131072, chunkBytes: 65536, pathChars: 4096,
  components: 64, reportBytes: 131072
});
export const MEMORY_CONNECTION_SKILL_OPEN_FLAGS = constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK;
class Rejected extends Error {
  constructor(code, state = "blocked") { super(code); this.code = code; this.state = state; }
}
const reject = (code, state) => { throw new Rejected(code, state); };
const errno = (e) => e instanceof Error && typeof e.code === "string" ? e.code : "";
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const dirSignature = (s) => JSON.stringify([s.dev, s.ino, s.uid, s.gid, s.mode]);
const fileSignature = (s) => JSON.stringify([s.dev, s.ino, s.uid, s.gid, s.mode, s.nlink, s.size, s.mtimeMs, s.ctimeMs]);

function inputs(input) {
  try {
    const data = copyMemoryConnectionData(input);
    if (!data || Array.isArray(data) || Object.keys(data).length !== 2 ||
        !Object.hasOwn(data, "descriptor") || !Object.hasOwn(data, "expectedSkillSha256") ||
        typeof data.expectedSkillSha256 !== "string" || !/^[a-f0-9]{64}$/.test(data.expectedSkillSha256)) {
      reject("MC_SKILL_INPUT", "invalid");
    }
    const descriptor = createMemoryConnectionDescriptor(data.descriptor?.identity);
    if (memoryConnectionHash(descriptor) !== memoryConnectionHash(data.descriptor)) reject("MC_SKILL_INPUT", "invalid");
    const sourceFile = descriptor.skill.source + "/SKILL.md";
    for (const full of [descriptor.skill.target, sourceFile]) {
      if (full.length > MEMORY_CONNECTION_SKILL_LIMITS.pathChars ||
          full.split("/").length - 1 > MEMORY_CONNECTION_SKILL_LIMITS.components) reject("MC_SKILL_INPUT", "invalid");
    }
    return { descriptor, expected: data.expectedSkillSha256, sourceFile };
  } catch { reject("MC_SKILL_INPUT", "invalid"); }
}

function safeDir(s, uid, owned) {
  if (!s.isDirectory() || s.isSymbolicLink() || !(s.mode & 0o100)) reject("MC_SKILL_PARENT_UNSAFE");
  if (owned) {
    if (s.uid !== uid || s.mode & 0o7022) reject("MC_SKILL_PARENT_UNSAFE");
  } else {
    const sharedSticky = s.uid === 0 && (s.mode & 0o7777) === 0o1777;
    if (![0, uid].includes(s.uid) || !sharedSticky && s.mode & 0o7022) reject("MC_SKILL_PARENT_UNSAFE");
  }
}
function safeSourceFile(s, uid) {
  if (!s.isFile() || s.isSymbolicLink() || s.uid !== uid || s.nlink !== 1 || (s.mode & 0o7777) !== 0o600) {
    reject("MC_SKILL_FILE_UNSAFE");
  }
  if (!Number.isSafeInteger(s.size) || s.size < 0 || s.size > MEMORY_CONNECTION_SKILL_LIMITS.fileBytes) reject("MC_SKILL_FILE_LIMIT");
}
async function parents(io, full, ownedRoot, uid, missingAllowed = []) {
  const chain = []; let current = "/";
  const root = await io.lstat(current); safeDir(root, uid, false);
  chain.push({ path: current, signature: dirSignature(root) });
  const parts = full.slice(1).split("/");
  for (const part of parts.slice(0, -1)) {
    current = path.posix.join(current, part); let s;
    try { s = await io.lstat(current); }
    catch (e) {
      if (errno(e) === "ENOENT" && missingAllowed.includes(current)) return { chain, missing: current };
      reject(errno(e) === "ENOENT" ? "MC_SKILL_PATH_MISSING" : "MC_SKILL_UNREADABLE");
    }
    safeDir(s, uid, current === ownedRoot || current.startsWith(ownedRoot + "/"));
    chain.push({ path: current, signature: dirSignature(s) });
  }
  return { chain, missing: null };
}
async function recheckParents(io, snapshot, ownedRoot, uid) {
  for (const parent of snapshot.chain) {
    let s; try { s = await io.lstat(parent.path); } catch { reject("MC_SKILL_CHANGED"); }
    safeDir(s, uid, parent.path === ownedRoot || parent.path.startsWith(ownedRoot + "/"));
    if (dirSignature(s) !== parent.signature) reject("MC_SKILL_CHANGED");
  }
}
async function targetSnapshot(io, descriptor, uid) {
  const home = descriptor.identity.homeDirectory, target = descriptor.skill.target;
  const snapshot = await parents(io, target, home, uid, [home + "/.agents", home + "/.agents/skills"]);
  snapshot.stat = null; snapshot.link = null;
  if (snapshot.missing) return snapshot;
  let s;
  try { s = await io.lstat(target); }
  catch (e) { if (errno(e) === "ENOENT") { snapshot.missing = target; return snapshot; } reject("MC_SKILL_UNREADABLE"); }
  if (s.uid !== uid) reject("MC_SKILL_TARGET_UNSAFE");
  snapshot.stat = s;
  if (s.isSymbolicLink()) {
    if (s.nlink !== 1 || s.mode & 0o7000) reject("MC_SKILL_TARGET_UNSAFE");
    snapshot.link = await linkText(io, target);
  } else if (!s.isFile() && !s.isDirectory()) reject("MC_SKILL_TARGET_UNSAFE");
  return snapshot;
}
async function linkText(io, target) {
  // Native readlink must not silently replace invalid path bytes with U+FFFD.
  const raw = await io.readlink(target, { encoding: "buffer" });
  try {
    const text = decode(copyBytes(raw, MEMORY_CONNECTION_SKILL_LIMITS.pathChars * 4));
    if (text.length > MEMORY_CONNECTION_SKILL_LIMITS.pathChars) reject("MC_SKILL_TARGET_UNSAFE");
    return text;
  } catch { reject("MC_SKILL_TARGET_UNSAFE"); }
}
async function recheckTarget(io, descriptor, snapshot, uid) {
  await recheckParents(io, snapshot, descriptor.identity.homeDirectory, uid);
  if (snapshot.missing) {
    try { await io.lstat(snapshot.missing); }
    catch (e) { if (errno(e) === "ENOENT") return; reject("MC_SKILL_CHANGED"); }
    reject("MC_SKILL_CHANGED");
  }
  let s;
  try { s = await io.lstat(descriptor.skill.target); } catch { reject("MC_SKILL_CHANGED"); }
  if (fileSignature(s) !== fileSignature(snapshot.stat)) reject("MC_SKILL_CHANGED");
  if (snapshot.link !== null && await linkText(io, descriptor.skill.target) !== snapshot.link) reject("MC_SKILL_CHANGED");
}
async function sourceSnapshot(io, data, uid) {
  const snapshot = await parents(io, data.sourceFile, data.descriptor.identity.vaultPath, uid);
  let s;
  try { s = await io.lstat(data.sourceFile); }
  catch (e) { reject(errno(e) === "ENOENT" ? "MC_SKILL_SOURCE_MISSING" : "MC_SKILL_UNREADABLE"); }
  safeSourceFile(s, uid); snapshot.stat = s; return snapshot;
}
async function recheckSource(io, data, snapshot, uid) {
  await recheckParents(io, snapshot, data.descriptor.identity.vaultPath, uid);
  let s;
  try { s = await io.lstat(data.sourceFile); } catch { reject("MC_SKILL_CHANGED"); }
  safeSourceFile(s, uid);
  if (fileSignature(s) !== fileSignature(snapshot.stat)) reject("MC_SKILL_CHANGED");
}

/**
 * Check only the exact own link and reviewed SKILL.md bytes. Never enumerate,
 * interpret Skill text, follow foreign destinations, install, repair or execute.
 * IO overrides are trusted simulations, not a sandbox or native-read evidence.
 * Rechecks detect observable races; they are not atomic openat/ABA protection.
 */
export async function inspectMemoryConnectionSkill(input, dependencies = {}) {
  let data = null, nativeIO = false;
  const report = (state, details = {}) => {
    const read = ["matched", "absent"].includes(state), observed = read || state === "conflict";
    const result = {
      schemaVersion: MEMORY_CONNECTION_VERSION, state, skillName: data?.descriptor.identity.skillName ?? null,
      sourceSha256: null, metadataSha256: null, resolvedSource: null, reasons: [], ...details,
      facts: {
        ...MEMORY_CONNECTION_FACTS, verificationScope: "skill-installation-only",
        evidence: observed ? nativeIO ? read ? "local-skill-file" : "local-skill-metadata" : "simulated-local-skill" : "none",
        targetObservationVerified: observed && nativeIO, skillSourceVerified: read && nativeIO,
        localReadVerified: read && nativeIO, bytePinMatched: read,
        skillFormatVerified: false, skillLoadedVerified: false
      }
    };
    if (Buffer.byteLength(JSON.stringify(result)) > MEMORY_CONNECTION_SKILL_LIMITS.reportBytes) reject("MC_SKILL_REPORT_LIMIT");
    return freezeMemoryConnectionData(result);
  };
  try {
    data = inputs(input);
    nativeIO = dependencies.io === undefined;
    const io = dependencies.io ?? fs, uid = process.getuid?.();
    if (!["darwin", "linux"].includes(process.platform) || !Number.isSafeInteger(uid) || constants.O_NOFOLLOW === undefined) reject("MC_SKILL_PLATFORM");
    const descriptor = data.descriptor, target = await targetSnapshot(io, descriptor, uid);
    await recheckTarget(io, descriptor, target, uid);
    if (target.stat && target.link !== descriptor.skill.source) {
      return report("conflict", { reasons: ["MC_SKILL_TARGET_CONFLICT"] });
    }
    const source = await sourceSnapshot(io, data, uid);
    await recheckSource(io, data, source, uid); await recheckTarget(io, descriptor, target, uid);
    let handle;
    try { handle = await io.open(data.sourceFile, MEMORY_CONNECTION_SKILL_OPEN_FLAGS); }
    catch (e) { reject(errno(e) === "ELOOP" ? "MC_SKILL_FILE_UNSAFE" : "MC_SKILL_UNREADABLE"); }
    let bytes;
    try {
      const start = await handle.stat(); safeSourceFile(start, uid);
      if (fileSignature(start) !== fileSignature(source.stat)) reject("MC_SKILL_CHANGED");
      await recheckSource(io, data, source, uid); await recheckTarget(io, descriptor, target, uid);
      bytes = Buffer.alloc(source.stat.size); let offset = 0;
      while (offset < bytes.length) {
        const request = Math.min(MEMORY_CONNECTION_SKILL_LIMITS.chunkBytes, bytes.length - offset);
        const { bytesRead } = await handle.read(bytes, offset, request, offset);
        if (!Number.isSafeInteger(bytesRead) || bytesRead < 0 || bytesRead > request) reject("MC_SKILL_READ");
        if (!bytesRead) reject("MC_SKILL_CHANGED");
        offset += bytesRead;
      }
      const after = await handle.stat(); safeSourceFile(after, uid);
      if (fileSignature(after) !== fileSignature(source.stat)) reject("MC_SKILL_CHANGED");
      await recheckSource(io, data, source, uid); await recheckTarget(io, descriptor, target, uid);
    } finally {
      try { await handle.close(); } catch { reject("MC_SKILL_CLOSE"); }
    }
    await recheckSource(io, data, source, uid); await recheckTarget(io, descriptor, target, uid);
    const sha256 = digest(bytes);
    if (sha256 !== data.expected) reject("MC_SKILL_PIN_MISMATCH");
    const metadataSha256 = digest(JSON.stringify({
      source: { path: data.sourceFile, parents: source.chain, signature: fileSignature(source.stat) },
      target: { path: descriptor.skill.target, parents: target.chain, missing: target.missing,
        signature: target.stat ? fileSignature(target.stat) : null, link: target.link }
    }));
    return report(target.missing ? "absent" : "matched", {
      sourceSha256: sha256, metadataSha256,
      resolvedSource: target.missing ? null : descriptor.skill.source,
      reasons: [target.missing ? "MC_SKILL_TARGET_MISSING" : "MC_SKILL_MATCH"]
    });
  } catch (e) {
    return report(e instanceof Rejected ? e.state : "blocked", { reasons: [e instanceof Rejected ? e.code : "MC_SKILL_IO"] });
  }
}
