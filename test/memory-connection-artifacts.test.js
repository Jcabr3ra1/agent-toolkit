import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { constants } from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import https from "node:https";
import childProcess from "node:child_process";
import { createHash } from "node:crypto";
import { createMemoryConnectionDescriptor } from "../src/memory-connection-descriptor.js";
import {
  inspectMemoryConnectionArtifacts as inspect,
  MEMORY_CONNECTION_ARTIFACT_LIMITS as LIMITS,
  MEMORY_CONNECTION_ARTIFACT_OPEN_FLAGS as FLAGS
} from "../src/memory-connection-artifacts.js";

const localTest = (name, fn) => test(name, { skip: !["darwin", "linux"].includes(process.platform) || !process.getuid }, fn);
const keys = ["nodeSha256", "binSha256", "manifestSha256", "packageJsonSha256", "packageLockSha256"];
const hash = b => createHash("sha256").update(b).digest("hex");
const changedStat = (s, fields) => Object.assign(Object.create(s), fields);
const failure = code => Object.assign(Error("private-error-marker /foreign/private-path"), { code });
const rebuild = (f, change) => ({ ...f.input, descriptor: createMemoryConnectionDescriptor({ ...f.input.descriptor.identity, ...change }) });

async function fixture(t) {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "agent-toolkit-a1e-test-")));
  await fs.chmod(root, 0o700); const ownership = await fs.lstat(root);
  t.after(async () => {
    const s = await fs.lstat(root);
    assert.equal(s.isDirectory() && !s.isSymbolicLink(), true);
    assert.equal(await fs.realpath(root), root);
    assert.equal(path.dirname(root), await fs.realpath(os.tmpdir()));
    assert.match(path.basename(root), /^agent-toolkit-a1e-test-/);
    assert.equal(s.mode & 0o7777, 0o700);
    for (const k of ["uid", "dev", "ino"]) assert.equal(s[k], ownership[k]);
    await fs.rm(root, { recursive: true }); // Only this validated, owned fictitious fixture.
  });
  const toolkit = root + "/toolkit café 🐦", vault = root + "/vault café 🐦";
  for (const p of [root + "/runtime", toolkit, toolkit + "/bin", vault]) await fs.mkdir(p, { mode: 0o700 });
  const paths = [root + "/runtime/node", toolkit + "/bin/project-memory-mcp.js", vault + "/project-memory.json", toolkit + "/package.json", toolkit + "/package-lock.json"];
  const bytes = paths.map((_, i) => Buffer.from("opaque-fictitious-" + i + "\nNever execute or interpret private-marker\n"));
  for (let i = 0; i < paths.length; i++) await fs.writeFile(paths[i], bytes[i], { mode: [0o755, 0o644, 0o600, 0o644, 0o644][i] });
  const descriptor = createMemoryConnectionDescriptor({
    agent: "codex", mcpName: "demo-memory", skillName: "demo-skill", nodePath: paths[0], toolkitRoot: toolkit,
    manifestPath: paths[2], vaultPath: vault, sourcePath: root + "/source", homeDirectory: root + "/home"
  });
  return { root, toolkit, vault, paths, bytes, input: { descriptor, expectedHashes: Object.fromEntries(keys.map((k, i) => [k, hash(bytes[i])])) } };
}
function spy(hooks = {}) {
  const calls = { lstat: [], open: [], read: [], stat: [], close: [] };
  const io = {
    lstat: async p => {
      calls.lstat.push(p); const s = await fs.lstat(p);
      return hooks.lstat ? hooks.lstat(p, s, calls) : s;
    },
    open: async (p, flags) => {
      calls.open.push({ path: p, flags });
      if (hooks.beforeOpen) await hooks.beforeOpen(p, calls);
      const h = await fs.open(p, flags);
      return {
        stat: async () => { calls.stat.push(p); const s = await h.stat(); return hooks.stat ? hooks.stat(p, s, calls) : s; },
        read: async (b, o, l, pos) => {
          const call = { path: p, offset: o, length: l, position: pos, bytesRead: null }; calls.read.push(call);
          const r = hooks.read ? await hooks.read(p, h, b, o, l, pos, calls) : await h.read(b, o, l, pos);
          call.bytesRead = r.bytesRead; return r;
        },
        close: async () => { calls.close.push(p); await h.close(); if (hooks.afterClose) await hooks.afterClose(p, calls); }
      };
    }
  };
  return { io, calls };
}
function facts(r, native, matched = true) {
  assert.equal(r.facts.verificationScope, "base-artifacts-only");
  assert.equal(r.facts.artifactPathsVerified, matched && native);
  assert.equal(r.facts.localReadVerified, matched && native);
  assert.equal(r.facts.bytePinsMatched, matched);
  for (const k of ["physicalPathsVerified", "runtimeVerified", "nativeReadVerified", "installedDependenciesVerified", "manifestSemanticsVerified", "runtimeVersionVerified", "runtimeCompatibilityVerified", "inspectedCandidatesExecuted", "authorizationGranted", "applied", "executable", "wrote", "sent", "executed"]) assert.equal(r.facts[k], false);
}
function blocked(r, reason) {
  assert.equal(r.state, "blocked"); if (reason) assert.deepEqual(r.reasons, [reason]);
  assert.equal(r.hashes, null); assert.equal(r.metadataSha256, null); facts(r, false, false);
  assert.equal(r.facts.evidence, "none");
  assert.doesNotMatch(JSON.stringify(r), /private-marker|private-error-marker|foreign\/private|EACCES|stack|opaque-fictitious/);
}
function closedOnce(s) {
  assert.equal(s.calls.open.length, s.calls.close.length);
  assert.equal(new Set(s.calls.close).size, s.calls.close.length);
}

localTest("A1e native bytes match while invalid semantic content remains unverified and unchanged", async t => {
  const f = await fixture(t), before = await Promise.all(f.paths.map(p => fs.lstat(p)));
  const r = await inspect(f.input); assert.equal(r.state, "matched"); facts(r, true);
  assert.deepEqual(r.hashes, f.input.expectedHashes); assert.match(r.metadataSha256, /^[a-f0-9]{64}$/);
  assert.equal(r.bytesRead, f.bytes.reduce((sum, b) => sum + b.length, 0));
  assert.equal(r.facts.evidence, "local-artifact-files"); assert.deepEqual(await inspect(f.input), r);
  for (let i = 0; i < f.paths.length; i++) {
    const after = await fs.lstat(f.paths[i]);
    for (const k of ["dev", "ino", "mode", "uid", "gid", "nlink", "size", "mtimeMs", "ctimeMs"]) assert.equal(after[k], before[i][k]);
    assert.deepEqual(await fs.readFile(f.paths[i]), f.bytes[i]);
  }
  assert.equal(Object.isFrozen(f.input), false); assert.equal(Object.isFrozen(r), true);
  assert.equal(Object.isFrozen(r.hashes), true); assert.equal(Object.isFrozen(r.facts), true); assert.equal(Object.isFrozen(r.reasons), true);
  assert.throws(() => { r.hashes.nodeSha256 = "0".repeat(64); }, TypeError);
  f.input.expectedHashes.nodeSha256 = "0".repeat(64); assert.notEqual(r.hashes.nodeSha256, f.input.expectedHashes.nodeSha256);
  assert.ok(Buffer.byteLength(JSON.stringify(r)) < LIMITS.reportBytes); assert.doesNotMatch(JSON.stringify(r), /private-marker/);
});
localTest("A1e exact five paths preflight before open, readonly flags and simulated provenance", async t => {
  const f = await fixture(t);
  const s = spy({ beforeOpen: () => { for (const p of f.paths) assert.ok(s.calls.lstat.includes(p)); } });
  const r = await inspect(f.input, { io: s.io }); assert.equal(r.state, "matched"); facts(r, false);
  assert.equal(r.facts.evidence, "simulated-local-artifacts");
  assert.deepEqual(s.calls.open, f.paths.map(p => ({ path: p, flags: FLAGS }))); closedOnce(s);
  assert.equal(FLAGS & (constants.O_WRONLY | constants.O_RDWR | constants.O_CREAT | constants.O_TRUNC | constants.O_APPEND), 0);
  assert.equal(FLAGS & constants.O_NOFOLLOW, constants.O_NOFOLLOW); assert.equal(FLAGS & constants.O_NONBLOCK, constants.O_NONBLOCK);
  const allowed = new Set(["/"]);
  for (const p of f.paths) for (let i = 1, parts = p.slice(1).split("/"); i <= parts.length; i++) allowed.add("/" + parts.slice(0, i).join("/"));
  assert.ok(s.calls.lstat.every(p => allowed.has(p))); assert.ok(s.calls.read.every(r => f.paths.includes(r.path)));
});
localTest("A1e inert closed inputs, hooks and pins are rejected before IO", async t => {
  const f = await fixture(t); let ioCalls = 0, hooks = 0;
  const forbidden = () => { ioCalls++; throw failure("EACCES"); };
  const bad = [null, undefined, [], {}, { descriptor: f.input.descriptor }, { ...f.input, extra: 1 },
    { ...f.input, descriptor: { ...f.input.descriptor, facts: { authorizationGranted: true } } },
    { ...f.input, descriptor: { ...f.input.descriptor, server: { ...f.input.descriptor.server, cwd: "/wrong" } } },
    { ...f.input, expectedHashes: null }, { ...f.input, expectedHashes: [] },
    { ...f.input, toJSON() { hooks++; } },
    Object.defineProperty({ ...f.input }, "descriptor", { enumerable: true, get() { hooks++; } }),
    new Proxy(f.input, { ownKeys() { hooks++; throw failure("HOOK"); } })];
  for (const key of keys) {
    for (const value of [null, 1, "A".repeat(64), "a".repeat(63), "x".repeat(64)]) bad.push({ ...f.input, expectedHashes: { ...f.input.expectedHashes, [key]: value } });
    const missing = { ...f.input.expectedHashes }; delete missing[key]; bad.push({ ...f.input, expectedHashes: missing });
  }
  bad.push({ ...f.input, expectedHashes: { ...f.input.expectedHashes, extra: "a".repeat(64) } });
  for (const input of bad) {
    const r = await inspect(input, { io: { lstat: forbidden, open: forbidden } });
    assert.equal(r.state, "invalid"); assert.deepEqual(r.reasons, ["MC_ARTIFACT_INPUT"]); assert.equal(r.bytesRead, 0);
  }
  assert.equal(ioCalls, 0); assert.equal(hooks, 0);
});
for (const change of ["overlap", "outside-manifest", "duplicate", "ancestor", "components", "derived-length"]) {
  localTest("A1e invalid path layout before IO: " + change, async t => {
    const f = await fixture(t); let delta;
    if (change === "overlap") delta = { toolkitRoot: f.vault + "/toolkit" };
    if (change === "outside-manifest") delta = { manifestPath: f.root + "/manifest.json" };
    if (change === "duplicate") delta = { nodePath: f.paths[3] };
    if (change === "ancestor") delta = { nodePath: f.toolkit + "/bin" };
    if (change === "components") delta = { nodePath: "/" + Array(65).fill("x").join("/") };
    if (change === "derived-length") delta = { toolkitRoot: "/" + "x".repeat(4080) };
    const input = change === "derived-length"
      ? { ...f.input, descriptor: { ...f.input.descriptor, identity: { ...f.input.descriptor.identity, ...delta } } }
      : rebuild(f, delta);
    const s = spy(), r = await inspect(input, { io: s.io }); assert.equal(r.state, "invalid"); assert.equal(s.calls.lstat.length, 0);
  });
}
for (let role = 0; role < keys.length; role++) {
  for (const issue of ["missing", "symlink", "hardlink", "directory", "mode", "owner", "oversize"]) {
    localTest("A1e all-file preflight rejects " + keys[role] + " " + issue + " without opening any file", async t => {
      const f = await fixture(t), p = f.paths[role]; let hooks = {};
      if (issue === "missing") await fs.unlink(p);
      if (issue === "symlink") { await fs.rename(p, p + ".other"); await fs.symlink(p + ".other", p); }
      if (issue === "hardlink") await fs.link(p, p + ".other");
      if (issue === "directory") { await fs.unlink(p); await fs.mkdir(p, { mode: 0o700 }); }
      if (issue === "mode") await fs.chmod(p, role === 0 ? 0o644 : 0o666);
      if (issue === "owner") hooks.lstat = (full, s) => full === p ? changedStat(s, { uid: process.getuid() + 12345 }) : s;
      if (issue === "oversize") hooks.lstat = (full, s) => full === p ? changedStat(s, { size: (role === 0 ? LIMITS.nodeBytes : role === 4 ? LIMITS.lockBytes : LIMITS.smallBytes) + 1 }) : s;
      const s = spy(hooks), r = await inspect(f.input, { io: s.io }); blocked(r); assert.equal(s.calls.open.length, 0); assert.equal(r.bytesRead, 0);
    });
  }
  localTest("A1e each pin mismatch retains byte count but exposes no partial or replacement hashes " + keys[role], async t => {
    const f = await fixture(t); f.input.expectedHashes[keys[role]] = "0".repeat(64);
    const s = spy(), r = await inspect(f.input, { io: s.io }); blocked(r, "MC_ARTIFACT_PIN_MISMATCH"); closedOnce(s);
    assert.equal(r.bytesRead, f.bytes.slice(0, role + 1).reduce((sum, b) => sum + b.length, 0));
    assert.equal(s.calls.open.length, role + 1); assert.doesNotMatch(JSON.stringify(r), new RegExp(hash(f.bytes[role])));
  });
}
for (const [role, mode, accepted] of [[0, 0o500, true], [0, 0o700, true], [0, 0o755, true], [0, 0o775, false], [0, 0o4755, false], [0, 0o1755, false], [1, 0o600, true], [1, 0o644, true], [1, 0o755, false], [1, 0o1644, false], [2, 0o644, false], [2, 0o1600, false], [3, 0o600, true], [4, 0o600, true]]) {
  localTest("A1e simulated exact role permissions " + role + "/" + mode.toString(8), async t => {
    const f = await fixture(t), alter = (p, s) => p === f.paths[role] ? changedStat(s, { mode: (s.mode & ~0o7777) | mode }) : s;
    const s = spy({ lstat: alter, stat: alter }), r = await inspect(f.input, { io: s.io });
    if (accepted) assert.equal(r.state, "matched"); else { blocked(r, "MC_ARTIFACT_FILE_UNSAFE"); assert.equal(s.calls.open.length, 0); }
  });
}
localTest("A1e Node may be root-owned; other artifact roles may not be foreign-owned", async t => {
  const f = await fixture(t), alter = (p, s) => p === f.paths[0] ? changedStat(s, { uid: 0 }) : s;
  assert.equal((await inspect(f.input, { io: spy({ lstat: alter, stat: alter }).io })).state, "matched");
  if (process.getuid() !== 0) for (let i = 1; i < keys.length; i++) {
    const s = spy({ lstat: (p, s) => p === f.paths[i] ? changedStat(s, { uid: 0 }) : s });
    blocked(await inspect(f.input, { io: s.io }), "MC_ARTIFACT_FILE_UNSAFE"); assert.equal(s.calls.open.length, 0);
  }
});
for (const issue of ["symlink", "missing", "group-write", "sticky-owned", "setgid", "no-owner-execute", "foreign-owner", "special-file", "file-alias", "root-alias", "sticky-outside"]) {
  localTest("A1e parent, type and physical aliases " + issue, async t => {
    const f = await fixture(t); let hooks = {};
    if (issue === "symlink") { await fs.rename(f.toolkit + "/bin", f.toolkit + "/other"); await fs.symlink(f.toolkit + "/other", f.toolkit + "/bin"); }
    if (issue === "missing") { await fs.unlink(f.paths[1]); await fs.rmdir(f.toolkit + "/bin"); }
    const modes = { "group-write": 0o770, "sticky-owned": 0o1700, setgid: 0o2700, "no-owner-execute": 0o600 };
    if (Object.hasOwn(modes, issue)) hooks.lstat = (p, s) => p === f.vault ? changedStat(s, { mode: (s.mode & ~0o7777) | modes[issue] }) : s;
    if (issue === "foreign-owner") hooks.lstat = (p, s) => p === f.vault ? changedStat(s, { uid: process.getuid() + 12345 }) : s;
    if (issue === "special-file") hooks.lstat = (p, s) => p === f.paths[4] ? changedStat(s, { isFile: () => false }) : s;
    if (issue === "file-alias") { const source = await fs.lstat(f.paths[0]); hooks.lstat = (p, s) => p === f.paths[4] ? changedStat(s, { dev: source.dev, ino: source.ino }) : s; }
    if (issue === "root-alias") { const source = await fs.lstat(f.toolkit); hooks.lstat = (p, s) => p === f.vault ? changedStat(s, { dev: source.dev, ino: source.ino }) : s; }
    if (issue === "sticky-outside") hooks.lstat = (p, s) => p === f.root ? changedStat(s, { uid: 0, mode: (s.mode & ~0o7777) | 0o1777 }) : s;
    const s = spy(hooks), r = await inspect(f.input, { io: s.io });
    if (issue === "sticky-outside") assert.equal(r.state, "matched"); else { blocked(r); assert.equal(s.calls.open.length, 0); }
  });
}
for (const size of [0, 1, 65536, 65537, LIMITS.smallBytes]) {
  localTest("A1e exact native streaming size " + size, async t => {
    const f = await fixture(t), bytes = Buffer.alloc(size, 37); await fs.writeFile(f.paths[1], bytes);
    f.input.expectedHashes.binSha256 = hash(bytes); const s = spy(), r = await inspect(f.input, { io: s.io });
    assert.equal(r.state, "matched"); const reads = s.calls.read.filter(r => r.path === f.paths[1]);
    assert.equal(reads.length, Math.ceil(size / LIMITS.chunkBytes));
    assert.equal(reads.reduce((sum, r) => sum + r.length, 0), size);
    assert.ok(reads.every(r => r.offset === 0 && r.length <= LIMITS.chunkBytes && r.position + r.length <= size));
    closedOnce(s);
  });
}
localTest("A1e short reads continue at exact offsets with no sentinel read", async t => {
  const f = await fixture(t), s = spy({ read: (p, h, b, o, l, pos) => h.read(b, o, Math.min(l, 7), pos) });
  const r = await inspect(f.input, { io: s.io }); assert.equal(r.state, "matched");
  assert.equal(r.bytesRead, f.bytes.reduce((sum, b) => sum + b.length, 0));
  for (let i = 0; i < keys.length; i++) {
    const reads = s.calls.read.filter(r => r.path === f.paths[i]); let offset = 0;
    for (const read of reads) { assert.equal(read.position, offset); assert.equal(read.offset, 0); offset += read.bytesRead; }
    assert.equal(offset, f.bytes[i].length);
  }
});
localTest("A1e simulated maximum five-role stream uses one reusable 64 KiB buffer", async t => {
  const f = await fixture(t), sizes = [LIMITS.nodeBytes, LIMITS.smallBytes, LIMITS.smallBytes, LIMITS.smallBytes, LIMITS.lockBytes];
  const alter = (p, s) => f.paths.includes(p) ? changedStat(s, { size: sizes[f.paths.indexOf(p)] }) : s;
  const zero = Buffer.alloc(LIMITS.chunkBytes);
  for (let i = 0; i < keys.length; i++) {
    const digest = createHash("sha256"); for (let offset = 0; offset < sizes[i]; offset += zero.length) digest.update(zero.subarray(0, Math.min(zero.length, sizes[i] - offset)));
    f.input.expectedHashes[keys[i]] = digest.digest("hex");
  }
  const buffers = new Set(), s = spy({ lstat: alter, stat: alter, read: async (p, h, b, o, l, pos) => {
    buffers.add(b); assert.equal(o, 0); assert.ok(l <= LIMITS.chunkBytes); assert.ok(pos + l <= sizes[f.paths.indexOf(p)]);
    b.fill(0, o, o + l); return { bytesRead: l };
  } });
  const allocation = Buffer.alloc; const allocations = []; let r;
  Buffer.alloc = function(size, ...args) { allocations.push(size); return allocation(size, ...args); };
  try { r = await inspect(f.input, { io: s.io }); } finally { Buffer.alloc = allocation; }
  assert.equal(r.state, "matched"); facts(r, false); closedOnce(s);
  const total = sizes.reduce((sum, size) => sum + size, 0);
  assert.equal(total, 259.5 * 1048576); assert.ok(total < LIMITS.totalBytes); assert.equal(r.bytesRead, total);
  assert.equal(s.calls.read.reduce((sum, r) => sum + r.length, 0), total);
  assert.equal(buffers.size, 1); assert.deepEqual(allocations, [LIMITS.chunkBytes]);
});
for (const badCount of [-1, 0, 0.5, NaN, Infinity, 1000000]) {
  localTest("A1e invalid or premature read count " + badCount, async t => {
    const f = await fixture(t), s = spy({ read: async () => ({ bytesRead: badCount }) });
    const r = await inspect(f.input, { io: s.io }); blocked(r, badCount === 0 ? "MC_ARTIFACT_CHANGED" : "MC_ARTIFACT_READ");
    assert.equal(r.bytesRead, 0); closedOnce(s); assert.equal(s.calls.read.length, 1);
  });
}
for (const point of ["before-open", "open-rename", "during-grow", "during-truncate", "during-mode", "after-close", "earlier-after-last-close", "parent-after-open"]) {
  localTest("A1e native mutation detected " + point, async t => {
    const f = await fixture(t); let done = false; const hooks = {};
    if (point === "before-open") hooks.lstat = async (p, stat, calls) => {
      if (p === f.paths[4] && calls.lstat.filter(v => v === p).length === 2) await fs.writeFile(p, "changed"); return stat;
    };
    if (point === "open-rename") hooks.beforeOpen = async p => { if (p === f.paths[0]) { await fs.rename(p, p + ".old"); await fs.writeFile(p, f.bytes[0], { mode: 0o755 }); } };
    if (point.startsWith("during-")) hooks.read = async (p, h, b, o, l, pos) => {
      const r = await h.read(b, o, l, pos);
      if (!done) { done = true; if (point === "during-grow") await fs.appendFile(p, "growth"); if (point === "during-truncate") await fs.truncate(p, 0); if (point === "during-mode") await fs.chmod(p, 0o777); }
      return r;
    };
    if (point === "after-close") hooks.afterClose = p => fs.writeFile(p, "changed");
    if (point === "earlier-after-last-close") hooks.afterClose = async p => { if (p === f.paths[4]) await fs.writeFile(f.paths[0], "changed"); };
    if (point === "parent-after-open") hooks.beforeOpen = async p => { if (p === f.paths[0]) await fs.chmod(path.dirname(p), 0o770); };
    const s = spy(hooks), r = await inspect(f.input, { io: s.io }); blocked(r);
    closedOnce(s); assert.ok(s.calls.open.length <= keys.length);
    if (point === "before-open") assert.equal(s.calls.open.length, 0);
    if (point === "earlier-after-last-close") { assert.equal(s.calls.open.length, 5); assert.equal(r.bytesRead, f.bytes.reduce((sum, b) => sum + b.length, 0)); }
  });
}
for (const failurePoint of ["lstat", "open", "stat", "read", "close"]) {
  localTest("A1e redacted IO failure and no retries " + failurePoint, async t => {
    const f = await fixture(t), hooks = {};
    if (failurePoint === "lstat") hooks.lstat = () => { throw failure("EACCES"); };
    if (failurePoint === "open") hooks.beforeOpen = () => { throw failure("EACCES"); };
    if (failurePoint === "stat") hooks.stat = () => { throw failure("EACCES"); };
    if (failurePoint === "read") hooks.read = (p, h, b, o, l, pos) => { if (p === f.paths[1]) throw failure("EACCES"); return h.read(b, o, l, pos); };
    if (failurePoint === "close") hooks.afterClose = () => { throw failure("EACCES"); };
    const s = spy(hooks), r = await inspect(f.input, { io: s.io }); blocked(r);
    assert.ok(s.calls.open.length <= 2); assert.equal(new Set(s.calls.open.map(v => v.path)).size, s.calls.open.length);
    if (!["lstat", "open"].includes(failurePoint)) closedOnce(s);
    if (failurePoint === "read" || failurePoint === "close") assert.equal(r.bytesRead, f.bytes[0].length);
    if (failurePoint === "close") assert.deepEqual(r.reasons, ["MC_ARTIFACT_CLOSE"]);
  });
}
localTest("A1e growth at exact Node cap never requests an extra byte and keeps confirmed budget", async t => {
  const f = await fixture(t); let growth = false;
  const alter = (p, s) => p === f.paths[0] ? changedStat(s, { size: LIMITS.nodeBytes + (growth ? 1 : 0) }) : s;
  const s = spy({ lstat: alter, stat: alter, read: async (p, h, b, o, l, pos) => {
    assert.equal(p, f.paths[0]); assert.ok(pos + l <= LIMITS.nodeBytes); b.fill(0, 0, l);
    if (pos + l === LIMITS.nodeBytes) growth = true; return { bytesRead: l };
  } });
  const r = await inspect(f.input, { io: s.io }); blocked(r, "MC_ARTIFACT_FILE_LIMIT"); closedOnce(s);
  assert.equal(r.bytesRead, LIMITS.nodeBytes); assert.equal(s.calls.read.reduce((sum, r) => sum + r.length, 0), LIMITS.nodeBytes);
});
for (const field of ["negative-size", "nan-size", "unsafe-size", "zero-links", "special-type", "setgid-node", "setuid-code", "foreign-sticky-parent"]) {
  localTest("A1e unsafe metadata " + field + " blocks before any content", async t => {
    const f = await fixture(t), s = spy({ lstat: (p, stat) => {
      if (p === f.paths[0]) {
        if (field === "negative-size") return changedStat(stat, { size: -1 });
        if (field === "nan-size") return changedStat(stat, { size: NaN });
        if (field === "unsafe-size") return changedStat(stat, { size: Number.MAX_SAFE_INTEGER + 1 });
        if (field === "zero-links") return changedStat(stat, { nlink: 0 });
        if (field === "special-type") return changedStat(stat, { isFile: () => false });
        if (field === "setgid-node") return changedStat(stat, { mode: stat.mode | 0o2000 });
      }
      if (p === f.paths[1] && field === "setuid-code") return changedStat(stat, { mode: stat.mode | 0o4000 });
      if (p === f.root && field === "foreign-sticky-parent") return changedStat(stat, { uid: process.getuid() + 12345, mode: (stat.mode & ~0o7777) | 0o1777 });
      return stat;
    } });
    blocked(await inspect(f.input, { io: s.io })); assert.equal(s.calls.open.length, 0);
  });
}
for (const change of ["opened-identity", "parent-identity", "named-after-close", "later-file-during-read", "zero-file-growth"]) {
  localTest("A1e signature changes " + change + " invalidate whole result", async t => {
    const f = await fixture(t); let changed = false; const hooks = {};
    if (change === "opened-identity") hooks.stat = (p, s) => p === f.paths[0] ? changedStat(s, { ino: s.ino + 1 }) : s;
    if (change === "parent-identity") hooks.lstat = (p, s, calls) => p === f.toolkit && calls.open.length ? changedStat(s, { ino: s.ino + 1 }) : s;
    if (change === "named-after-close") {
      hooks.afterClose = async () => { changed = true; };
      hooks.lstat = (p, s) => p === f.paths[0] && changed ? changedStat(s, { ino: s.ino + 1 }) : s;
    }
    if (change === "later-file-during-read") hooks.read = async (p, h, b, o, l, pos) => {
      const r = await h.read(b, o, l, pos); if (!changed) { changed = true; await fs.chmod(f.paths[4], 0o666); } return r;
    };
    if (change === "zero-file-growth") {
      await fs.truncate(f.paths[0], 0); f.input.expectedHashes.nodeSha256 = hash("");
      hooks.stat = async (p, s, calls) => {
        if (p === f.paths[0] && calls.stat.filter(v => v === p).length === 2) await fs.appendFile(p, "grown"); return s;
      };
    }
    const s = spy(hooks), r = await inspect(f.input, { io: s.io }); blocked(r); closedOnce(s);
    if (change === "opened-identity") assert.equal(s.calls.read.length, 0);
    if (change === "zero-file-growth") { assert.equal(s.calls.read.length, 0); assert.equal(r.bytesRead, 0); }
  });
}
localTest("A1e a premature EOF after a confirmed partial read retains its bytes", async t => {
  const f = await fixture(t), s = spy({ read: (p, h, b, o, l, pos) => pos === 0 ? h.read(b, o, Math.min(l, 7), pos) : { bytesRead: 0 } });
  const r = await inspect(f.input, { io: s.io }); blocked(r, "MC_ARTIFACT_CHANGED"); closedOnce(s);
  assert.equal(r.bytesRead, 7); assert.equal(s.calls.read.length, 2);
});
localTest("A1e ELOOP on open is unsafe with no retry or replacement pin", async t => {
  const f = await fixture(t), s = spy({ beforeOpen: () => { throw failure("ELOOP"); } });
  blocked(await inspect(f.input, { io: s.io }), "MC_ARTIFACT_FILE_UNSAFE");
  assert.equal(s.calls.open.length, 1); assert.equal(s.calls.close.length, 0);
});
localTest("A1e missing dependency interface fails closed, not with a raw exception", async t => {
  const f = await fixture(t);
  for (const dependencies of [null, { io: {} }, { io: { lstat: () => { throw failure("EACCES"); } } }]) blocked(await inspect(f.input, dependencies), "MC_ARTIFACT_IO");
});
localTest("A1e no discovery, writes, imports, processes or network capability", async t => {
  const f = await fixture(t), replacements = []; let attempts = 0;
  const deny = () => { attempts++; throw failure("FORBIDDEN"); };
  const replace = (obj, k) => { const original = obj[k]; obj[k] = deny; replacements.push(() => { obj[k] = original; }); };
  for (const k of ["readdir", "readFile", "writeFile", "appendFile", "mkdir", "rm", "unlink", "rename", "chmod", "realpath", "readlink"]) replace(fs, k);
  for (const k of ["spawn", "spawnSync", "exec", "execSync", "execFile", "execFileSync", "fork"]) replace(childProcess, k);
  for (const obj of [http, https]) for (const k of ["request", "get"]) replace(obj, k);
  replace(process, "cwd"); replace(os, "homedir"); replace(globalThis, "fetch");
  let r; try { r = await inspect(f.input); } finally { for (const restore of replacements.reverse()) restore(); }
  assert.equal(r.state, "matched"); assert.equal(attempts, 0);
});
