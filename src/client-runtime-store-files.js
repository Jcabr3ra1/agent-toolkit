import fs from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { ParseFailure, fail } from "./client-output-json.js";

export const FILE_LIMIT = 1024 * 1024;
export const bytesHash = bytes => createHash("sha256").update(bytes).digest("hex");
const missing = e => e?.code === "ENOENT";
export { missing };

// Local cooperative writers only. These checks are not openat-style containment.
export function createStoreFiles(overrides = {}) {
  const io = { ...fs, ...overrides };
  const uid = process.getuid?.() ?? null;
  // Directory link counts change when our own task directory is created.
  // File link count is independently required to remain one by privateType.
  const identity = s => ({ dev: s.dev, ino: s.ino, uid: s.uid, mode: s.mode });
  const equal = (a, b) => JSON.stringify(identity(a)) === JSON.stringify(identity(b));
  function privateType(s, directory) {
    if (s.uid !== uid || (s.mode & 0o7777) !== (directory ? 0o700 : 0o600) ||
      (directory ? !s.isDirectory() : !s.isFile() || s.nlink !== 1)) fail("store-unsafe-resource");
  }
  async function physical(full) {
    let current = path.parse(full).root;
    for (const part of full.slice(current.length).split(path.sep).filter(Boolean)) {
      current = path.join(current, part); const s = await io.lstat(current);
      if (s.isSymbolicLink()) fail("store-symlink-path");
      if (current !== full && !s.isDirectory()) fail("store-invalid-parent");
    }
  }
  async function directory(full, expected) {
    await physical(full); const s = await io.lstat(full); privateType(s, true);
    if (expected && !equal(s, expected)) fail("store-directory-replaced");
    return s;
  }
  async function syncDirectory(full, expected) {
    await directory(full, expected);
    const h = await io.open(full, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
    try { const s = await h.stat(); privateType(s, true); if (!equal(s, expected)) fail("store-directory-replaced"); await h.sync(); }
    finally { await h.close(); }
    await directory(full, expected);
  }
  async function read(full, limit = FILE_LIMIT) {
    await physical(full); const before = await io.lstat(full); privateType(before, false);
    if (before.size > limit) fail("store-file-limit");
    const h = await io.open(full, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const opened = await h.stat(); privateType(opened, false);
      if (!equal(before, opened) || opened.size > limit) fail("store-resource-changed");
      const buffer = Buffer.alloc(limit + 1); let offset = 0;
      while (offset < buffer.length) { const { bytesRead } = await h.read(buffer, offset, buffer.length - offset, offset); if (!bytesRead) break; offset += bytesRead; }
      if (offset > limit) fail("store-file-limit");
      const after = await h.stat(); const named = await io.lstat(full);
      privateType(after, false); privateType(named, false);
      if (!equal(opened, after) || !equal(after, named) || after.size !== offset || opened.size !== after.size || opened.mtimeMs !== after.mtimeMs) fail("store-resource-changed");
      return { bytes: buffer.subarray(0, offset), stat: after };
    } finally { await h.close(); }
  }
  async function exclusive(full) {
    let h;
    try { h = await io.open(full, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600); }
    catch (e) { if (e?.code === "EEXIST") fail("store-resource-exists"); throw e; }
    try { const stat = await h.stat(); privateType(stat, false); return { handle: h, stat, full, digest: null }; }
    catch { await h.close(); fail("store-created-resource-unusable"); }
  }
  async function write(resource, bytes) {
    let offset = 0;
    while (offset < bytes.length) {
      const { bytesWritten } = await resource.handle.write(bytes, offset, bytes.length - offset, offset);
      if (!bytesWritten) fail("store-short-write"); offset += bytesWritten;
    }
    resource.digest = bytesHash(bytes); await resource.handle.sync();
  }
  async function owned(resource) {
    const r = await read(resource.full); if (!equal(r.stat, resource.stat)) fail("store-resource-replaced");
    if (resource.digest !== null && bytesHash(r.bytes) !== resource.digest) fail("store-resource-replaced");
    return r;
  }
  async function remove(resource, dir, expected) {
    await directory(dir, expected); await owned(resource); await io.unlink(resource.full);
  }
  async function contents(dir, allowed) {
    const h = await io.opendir(dir);
    try { let n = 0; for (;;) { const e = await h.read(); if (!e) break; if (++n > allowed.length || !allowed.includes(e.name)) fail("store-residual-resource"); } }
    finally { await h.close(); }
  }
  return { io, uid, equal, physical, directory, syncDirectory, read, exclusive, write, owned, remove, contents,
    async exists(full) { try { return await io.lstat(full); } catch (e) { if (missing(e)) return null; throw e; } },
    code(e) { return e instanceof ParseFailure ? e.code : "store-io-failed"; } };
}
