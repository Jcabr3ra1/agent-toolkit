import fs from "node:fs/promises";
import { constants } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { parseTaskDocument, taskLstat, taskHandleStat } from "./task-prepare-files.js";
import { containsSensitiveData, isCredentialPath } from "./sensitive-data.js";
import { VERIFY_LIMITS, LOCAL_READ } from "./task-verify.js";
import { IS_WINDOWS, warnPlatformPermissions, toGitPath, isPortableAbsolutePath } from "./platform.js";

export class VerifyInputError extends Error {
  constructor(code) { super("Verify input rejected"); this.code = code; }
}
const reject = code => { throw new VerifyInputError(code); };
export const VERIFY_OPEN_FLAGS = constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0);
const signature = s => JSON.stringify([s.dev, s.ino, s.uid, s.gid, s.mode, s.nlink, s.size, s.mtimeMs, s.ctimeMs, s.mtimeNs, s.ctimeNs], (_key, value) => typeof value === "bigint" ? String(value) : value);
// Directory mtime changes with siblings; identity, owner and mode must stay stable.
const dirSignature = s => JSON.stringify([s.dev, s.ino, s.uid, s.gid, s.mode], (_key, value) => typeof value === "bigint" ? String(value) : value);
const control = /[\x00-\x1f\x7f-\x9f\u202a-\u202e\u2066-\u2069]/u;
const pathKey = s => s.normalize("NFC").toLowerCase();
const errno = e => e instanceof Error && typeof e.code === "string" ? e.code : "";
const forbidden = value => {
  const p = toGitPath(value);
  return isCredentialPath(p) || containsSensitiveData(p) || /\.keychain(?:-db)?$/i.test(p) ||
    /(?:^|\/)(?:\.git|\.obsidian|\.claude|\.codex|\.gemini|\.agents|\.(?:credentials?|secrets?)(?:\.[^/]*)?)(?:\/|$)/i.test(p);
};
const pathText = v => typeof v === "string" && v.length > 0 && v.length <= 4096 && v === v.trim() && !control.test(v);
const validRead = (n, room) => Number.isSafeInteger(n) && n >= 0 && n <= room;

// Every existing component is checked with lstat; none may be a symlink.
async function physical(io, full) {
  const top = path.parse(full).root, parts = full.slice(top.length).split(path.sep).filter(Boolean);
  if (!parts.length || parts.length > 64) reject("verify-path-unsafe");
  let curr = top, last;
  for (const [i, part] of parts.entries()) {
    curr = path.join(curr, part); last = await taskLstat(io, curr);
    if (last.isSymbolicLink() || i < parts.length - 1 && !last.isDirectory()) reject("verify-path-unsafe");
  }
  return last;
}
function rootPath(value, home) {
  if (!pathText(value) || !path.isAbsolute(value) || path.normalize(value) !== value || (IS_WINDOWS && !isPortableAbsolutePath(value)) || value.endsWith(path.sep) || forbidden(value) ||
      typeof home === "string" && home && pathKey(path.resolve(home)) === pathKey(value)) reject("verify-root-unsafe");
  return value;
}
async function readContract(io, full, uid) {
  const safe = s => {
    if (!s.isFile() || s.isSymbolicLink() || s.nlink !== 1 || (!IS_WINDOWS && (s.uid !== uid || s.mode & 0o7022))) reject("verify-contract-unsafe");
    if (s.size < 1 || s.size > VERIFY_LIMITS.contractBytes) reject("verify-contract-limit");
  };
  const walk = async () => {
    try { return await physical(io, full); } catch (e) { reject(e instanceof VerifyInputError ? "verify-contract-unsafe" : "verify-contract-unreadable"); }
  };
  const before = await walk(); safe(before);
  let handle;
  try { handle = await io.open(full, VERIFY_OPEN_FLAGS); } catch (e) { reject(errno(e) === "ELOOP" ? "verify-contract-unsafe" : "verify-contract-unreadable"); }
  try {
    const start = await taskHandleStat(handle); safe(start);
    if (signature(start) !== signature(before)) reject("verify-contract-changed");
    // Exactly the pinned size in requests of at most 64 KiB: no sentinel byte and no EOF probe past the cap.
    const buffer = Buffer.alloc(before.size); let offset = 0;
    while (offset < before.size) {
      const request = Math.min(VERIFY_LIMITS.chunkBytes, before.size - offset);
      const { bytesRead } = await handle.read(buffer, offset, request, offset);
      if (!validRead(bytesRead, request)) reject("verify-contract-unreadable");
      if (!bytesRead) reject("verify-contract-changed");
      offset += bytesRead;
    }
    // Growth, truncation or replacement after the last requested byte must show in descriptor/name metadata.
    const after = await taskHandleStat(handle), named = await taskLstat(io, full);
    if (signature(after) !== signature(before) || signature(named) !== signature(before)) reject("verify-contract-changed");
    await walk();
    const bytes = buffer.subarray(0, offset);
    return { bytes, sha256: createHash("sha256").update(bytes).digest("hex") };
  } finally { await handle.close(); }
}
async function checkRoot(io, full, uid, privateRoot) {
  let s;
  try { s = await physical(io, full); } catch (e) { reject(e instanceof VerifyInputError ? "verify-root-unsafe" : "verify-root-unreadable"); }
  // handoff must be exactly 0700: setuid/setgid/sticky bits also make it non-private for this contract.
  if (!s.isDirectory() || (!IS_WINDOWS && (s.uid !== uid || s.mode & 0o022 || privateRoot && (s.mode & 0o7777) !== 0o700))) reject("verify-root-unsafe");
  return { full, signature: dirSignature(s) };
}
async function recheckRoot(io, pinned) {
  let s;
  try { s = await physical(io, pinned.full); } catch { reject("verify-root-changed"); }
  if (dirSignature(s) !== pinned.signature) reject("verify-root-changed");
}
async function recheckDirs(io, dirs) {
  for (const d of dirs) {
    let s;
    try { s = await taskLstat(io, d.full); } catch { reject("verify-entry-changed"); }
    if (s.isSymbolicLink() || dirSignature(s) !== d.signature) reject("verify-entry-changed");
  }
}
// One listed entry: ENOENT is absence; any other error or unsafe component blocks.
async function observe(io, rootFull, entry, expected, uid, budget) {
  const parts = entry.path.split("/"), dirs = [];
  let curr = rootFull, s;
  for (const [i, part] of parts.entries()) {
    curr = path.join(curr, part);
    try { s = await taskLstat(io, curr); } catch (e) {
      if (errno(e) !== "ENOENT") reject("verify-entry-unreadable");
      await recheckDirs(io, dirs);
      return { id: entry.id, status: "absent", sha256: null };
    }
    if (i < parts.length - 1) {
      if (s.isSymbolicLink() || !s.isDirectory() || (!IS_WINDOWS && (s.uid !== uid || s.mode & 0o022))) reject("verify-entry-unsafe");
      dirs.push({ full: curr, signature: dirSignature(s) });
    }
  }
  const safe = st => { if (!st.isFile() || st.isSymbolicLink() || st.nlink !== 1 || (!IS_WINDOWS && (st.uid !== uid || st.mode & 0o7022))) reject("verify-entry-unsafe"); };
  safe(s);
  if (expected === null) { await recheckDirs(io, dirs); return { id: entry.id, status: "present", sha256: null }; }
  if (s.size > VERIFY_LIMITS.fileBytes) reject("verify-file-limit");
  if (budget.total + s.size > VERIFY_LIMITS.totalBytes) reject("verify-total-limit");
  let handle;
  try { handle = await io.open(curr, VERIFY_OPEN_FLAGS); } catch (e) { reject(errno(e) === "ELOOP" ? "verify-entry-unsafe" : "verify-entry-unreadable"); }
  let digest;
  try {
    const start = await taskHandleStat(handle); safe(start);
    if (signature(start) !== signature(s)) reject("verify-entry-changed");
    const chunk = Buffer.alloc(VERIFY_LIMITS.chunkBytes), hash = createHash("sha256");
    let offset = 0;
    // Requests never exceed the pinned size or the remaining budget; reaching the size ends reading without an EOF probe.
    while (offset < s.size) {
      const request = Math.min(chunk.length, s.size - offset, VERIFY_LIMITS.totalBytes - budget.total);
      if (request <= 0) reject("verify-total-limit");
      const { bytesRead } = await handle.read(chunk, 0, request, offset);
      if (!validRead(bytesRead, request)) reject("verify-entry-unreadable");
      budget.total += bytesRead; // counted before any later rejection
      if (!bytesRead) reject("verify-entry-changed");
      offset += bytesRead;
      hash.update(chunk.subarray(0, bytesRead));
    }
    // Growth, truncation or replacement after the last requested byte must show in descriptor/name metadata.
    const after = await taskHandleStat(handle), named = await taskLstat(io, curr);
    if (signature(after) !== signature(s) || signature(named) !== signature(s)) reject("verify-entry-changed");
    digest = hash.digest("hex");
  } finally { await handle.close(); }
  await recheckDirs(io, dirs);
  return { id: entry.id, status: "present", sha256: digest };
}

/**
 * Reads only the explicit contract and its listed entries; never writes, executes, follows links or reads Git.
 * Before the pin matches, the only IO is lstat of the contract's own path components and a bounded read of
 * its bytes, even when the contract lives inside source/handoff. No listed entry or JSON-referenced path is
 * touched before the pin and contract validation.
 */
export async function verifyLocal(options, cwd, verifier, dependencies = {}) {
  warnPlatformPermissions();
  const io = { ...fs, ...dependencies.io }, uid = process.getuid?.(), home = dependencies.home ?? os.homedir();
  const audit = { contractByteSha256: null, expectedPinSha256: null };
  const phase = options?.phase === "before" || options?.phase === "after" ? options.phase : null;
  const fail = (state, codes, contract = null) => verifier.failure(state, codes, { phase, contract, audit });
  if (!["darwin", "linux", "win32"].includes(dependencies.platform ?? process.platform) || (!IS_WINDOWS && typeof uid !== "number")) return fail("blocked", ["verify-platform-unsupported"]);
  if (!phase || typeof options.expect !== "string" || !/^[a-f0-9]{64}$/.test(options.expect)) return fail("invalid", ["verify-invalid-input"]);
  audit.expectedPinSha256 = options.expect;
  let contractFull, roots;
  try {
    if (!pathText(options.contract) || !path.isAbsolute(cwd)) reject("verify-contract-path");
    contractFull = path.resolve(cwd, options.contract);
    if ((IS_WINDOWS && !isPortableAbsolutePath(contractFull)) || forbidden(contractFull)) reject("verify-contract-path");
    roots = { source: rootPath(options.source, home), handoff: rootPath(options.handoff, home) };
    const a = pathKey(roots.source), b = pathKey(roots.handoff);
    if (a === b || a.startsWith(b + path.sep) || b.startsWith(a + path.sep)) reject("verify-root-overlap");
  } catch (e) { return fail("blocked", [e instanceof VerifyInputError ? e.code : "verify-invalid-input"]); }
  let read;
  try { read = await readContract(io, contractFull, uid); }
  catch (e) { return fail("blocked", [e instanceof VerifyInputError ? e.code : "verify-contract-unreadable"]); }
  // Pin before parsing, root checks or any listed entry. The actual hash is not echoed on mismatch.
  if (read.sha256 !== options.expect) return fail("blocked", ["verify-pin-mismatch"]);
  audit.contractByteSha256 = read.sha256;
  let parsed;
  try { parsed = parseTaskDocument(read.bytes); } catch { return fail("invalid", ["verify-contract-format"]); }
  const checked = verifier.checkContract(parsed);
  if (!checked.ok) return fail("invalid", checked.reasons);
  const contract = checked.contract, observations = [];
  try {
    const pinned = { source: await checkRoot(io, roots.source, uid, false), handoff: await checkRoot(io, roots.handoff, uid, true) };
    if (pinned.source.signature === pinned.handoff.signature) reject("verify-root-overlap");
    const budget = { total: 0 };
    for (const entry of contract.entries) observations.push(await observe(io, roots[entry.root], entry, entry[phase], uid, budget));
    for (const pin of Object.values(pinned)) await recheckRoot(io, pin);
  } catch (e) { return fail("blocked", [e instanceof VerifyInputError ? e.code : "verify-entry-unreadable"], contract); }
  return verifier[LOCAL_READ]({ contract, phase, observations }, audit);
}
