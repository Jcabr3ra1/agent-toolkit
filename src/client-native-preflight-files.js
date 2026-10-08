import fs from "node:fs/promises";
import path from "node:path";
import { constants } from "node:fs";
import { createHash } from "node:crypto";
import { copyInertJson } from "./client-output-json.js";

const changed = () => { throw Error("Pinned candidate unavailable"); };
const sig = s => JSON.stringify([s.dev, s.ino, s.uid, s.mode, s.size, s.mtimeMs, s.ctimeMs]);
export const absolutePhysicalName = p => typeof p === "string" && path.isAbsolute(p) && path.normalize(p) === p && !/[\x00-\x1f\x7f]/.test(p);

async function physical(name, io) {
  if (!absolutePhysicalName(name) || name.split(path.sep).length > 64) changed();
  let p = path.parse(name).root;
  for (const part of name.slice(p.length).split(path.sep).filter(Boolean)) {
    p = path.join(p, part); const s = await io.lstat(p);
    if (s.isSymbolicLink()) changed();
  }
}

/** Reads only the approved executable, never settings or credential files. */
export async function verifyPreflightCandidate(input, { io: overrides = {}, deadline = Infinity, monotonic = () => Number(process.hrtime.bigint() / 1000000n) } = {}) {
  const c = copyInertJson(input), io = { ...fs, ...overrides };
  await physical(path.dirname(c.entryPath), io); await physical(c.artifactPath, io);
  const link = await io.lstat(c.entryPath), s = await io.lstat(c.artifactPath);
  if (!link.isSymbolicLink() || link.ino !== c.expectedLinkIno || link.uid !== c.expectedUid || link.dev !== c.expectedDev ||
      path.resolve(path.dirname(c.entryPath), await io.readlink(c.entryPath)) !== c.artifactPath ||
      !s.isFile() || s.isSymbolicLink() || s.nlink !== 1 || s.size !== c.expectedSize || s.size > 536870912 ||
      s.uid !== c.expectedUid || s.dev !== c.expectedDev || s.ino !== c.expectedIno || (s.mode & 4095) !== c.expectedMode ||
      (s.mode & 0o022) || !(s.mode & 0o111)) changed();
  const h = await io.open(c.artifactPath, constants.O_RDONLY | constants.O_NOFOLLOW);
  const digest = createHash("sha256"), b = Buffer.alloc(1048576); let n = 0;
  try {
    if (sig(s) !== sig(await h.stat())) changed();
    for (;;) {
      if (monotonic() >= deadline) changed();
      const r = await h.read(b, 0, b.length, null); if (!r.bytesRead) break;
      n += r.bytesRead; if (n > c.expectedSize || n > 536870912) changed(); digest.update(b.subarray(0, r.bytesRead));
    }
    if (n !== c.expectedSize || digest.digest("hex") !== c.expectedSha256 || sig(s) !== sig(await h.stat()) ||
        sig(s) !== sig(await io.lstat(c.artifactPath)) || sig(link) !== sig(await io.lstat(c.entryPath)) ||
        path.resolve(path.dirname(c.entryPath), await io.readlink(c.entryPath)) !== c.artifactPath) changed();
    await physical(c.artifactPath, io); await physical(path.dirname(c.entryPath), io);
  } finally { await h.close(); }
  return { unchanged: true };
}

/** Caller-specified, approved paths: lstat only, no contents, glob or recursion. */
export async function inspectPreflightMetadata(input, { lstat = fs.lstat } = {}) {
  const entries = copyInertJson(input);
  if (!Array.isArray(entries) || entries.length > 16 || new Set(entries.map(v => v.id)).size !== entries.length ||
      entries.some(e => Object.keys(e).sort().join() !== "id,path" || typeof e.id !== "string" || !/^[a-z][a-z0-9-]{0,63}$/.test(e.id) || !absolutePhysicalName(e.path) || e.path === path.parse(e.path).root)) throw Error("Invalid metadata inventory");
  const output = [];
  for (const e of entries) {
    let p = path.parse(e.path).root, result = "missing";
    try {
      const parts = e.path.slice(p.length).split(path.sep).filter(Boolean);
      if (parts.length > 64) throw Error("depth");
      for (const [i, part] of parts.entries()) {
        p = path.join(p, part); const s = await lstat(p);
        if (s.isSymbolicLink()) { result = "unsafe"; break; }
        if (i === parts.length - 1) result = s.isFile() ? "file" : s.isDirectory() ? "directory" : "unsafe";
        else if (!s.isDirectory()) { result = "unsafe"; break; }
      }
    } catch (e2) { result = e2?.code === "ENOENT" ? "missing" : "unknown"; }
    output.push({ id: e.id, kind: result });
  }
  return output;
}
