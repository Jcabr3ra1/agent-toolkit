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

import {
  collectMemoryConnectionConfiguration as collect,
  MEMORY_CONNECTION_FILE_LIMITS as LIMITS,
  MEMORY_CONNECTION_OPEN_FLAGS as FLAGS
} from "../src/memory-connection-files.js";

const posixSkip = !["darwin", "linux"].includes(process.platform) || !process.getuid || constants.O_NOFOLLOW === undefined
  ? "Requires production POSIX uid/mode and O_NOFOLLOW filesystem attestation (darwin/linux)." : false;
const posixTest = (name, fn) => test(name, { skip: posixSkip }, fn);
const source = '[mcp_servers.demo-memory]\ncommand="node"\nargs=[]\nenabled=false\n';
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const error = (code) => Object.assign(Error("private-error-marker"), { code });
const withStat = (s, changes) => Object.assign(Object.create(s), changes);

async function fixture(t, contents = source) {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "agent-toolkit-a1c-test-")));
  await fs.chmod(root, 0o700); const owner = await fs.lstat(root);
  t.after(async () => {
    const now = await fs.lstat(root);
    assert.equal(now.isDirectory() && !now.isSymbolicLink(), true);
    assert.equal(await fs.realpath(root), root);
    assert.equal(path.dirname(root), await fs.realpath(os.tmpdir()));
    assert.match(path.basename(root), /^agent-toolkit-a1c-test-/);
    for (const key of ["dev", "ino", "uid"]) assert.equal(now[key], owner[key]);
    assert.equal(now.mode & 0o7777, 0o700);
    await fs.rm(root, { recursive: true }); // Only this exact owned fictitious tree.
  });
  const home = path.join(root, "home café 🐦"), codex = path.join(home, ".codex"), config = path.join(codex, "config.toml");
  await fs.mkdir(home, { mode: 0o700 }); await fs.mkdir(codex, { mode: 0o700 });
  await fs.writeFile(config, contents, { mode: 0o600 });
  return { root, home, codex, config, input: { homeDirectory: home, configurationPath: config, mcpName: "demo-memory" } };
}
function instrument(hooks = {}) {
  const seen = { lstat: [], opens: [], reads: [], closes: 0, stats: 0 };
  const io = {
    lstat: async (p) => { seen.lstat.push(p); return hooks.lstat ? hooks.lstat(p, seen) : fs.lstat(p); },
    open: async (p, flags) => {
      seen.opens.push({ path: p, flags });
      if (hooks.beforeOpen) await hooks.beforeOpen(p, seen);
      if (hooks.openError) throw hooks.openError;
      const handle = await fs.open(p, flags);
      return {
        stat: async () => { seen.stats++; return hooks.stat ? hooks.stat(handle, seen) : handle.stat(); },
        read: async (buffer, offset, length, position) => {
          const call = { offset, length, position, bytesRead: null }; seen.reads.push(call);
          const result = hooks.read ? await hooks.read(handle, buffer, offset, length, position, seen) : await handle.read(buffer, offset, length, position);
          call.bytesRead = result.bytesRead; return result;
        },
        close: async () => { seen.closes++; await handle.close(); if (hooks.afterClose) await hooks.afterClose(p, seen); }
      };
    }
  };
  return { io, seen };
}
function checkFacts(result, native, read = true) {
  assert.equal(result.facts.verificationScope, "configuration-only");
  assert.equal(result.facts.configurationPathVerified, native);
  assert.equal(result.facts.configurationSourceVerified, native && read);
  assert.equal(result.facts.localReadVerified, native && read);
  assert.equal(result.facts.byteSyntaxVerified, read);
  for (const name of ["physicalPathsVerified", "runtimeVerified", "nativeReadVerified", "authorizationGranted", "executable", "applied", "wrote", "sent", "executed"]) assert.equal(result.facts[name], false);
}
function blocked(result, code = null) {
  assert.equal(result.state, "blocked");
  if (code) assert.equal(result.reasons.includes(code), true, JSON.stringify(result.reasons));
  for (const key of ["server", "ranges", "configurationSha256", "metadataSha256", "entryState"]) assert.equal(result[key], null);
  assert.equal(result.fileState, "unknown"); assert.equal(result.facts.evidence, "none");
  assert.equal(result.facts.localReadVerified, false); assert.equal(result.facts.configurationPathVerified, false);
  assert.doesNotMatch(JSON.stringify(result), /private-error-marker|\/private\/|\/Users\/|stack|EACCES/);
}

posixTest("A1c native fixture read pins exact bytes without modifying config", async t => {
  const f = await fixture(t); const before = await fs.lstat(f.config);
  const result = await collect(f.input); const after = await fs.lstat(f.config);
  assert.equal(result.state, "observed"); assert.equal(result.fileState, "present"); assert.equal(result.entryState, "observed");
  assert.deepEqual(result.server, { command: "node", args: [], enabled: false });
  assert.equal(result.configurationSha256, hash(source)); assert.match(result.metadataSha256, /^[a-f0-9]{64}$/);
  assert.equal(result.facts.evidence, "local-file"); checkFacts(result, true);
  for (const key of ["dev", "ino", "uid", "mode", "size", "mtimeMs", "ctimeMs"]) assert.equal(after[key], before[key]);
  assert.equal((await fs.readFile(f.config)).toString(), source);
  const second = await collect(f.input); assert.deepEqual(second, result);
});
posixTest("A1c IO instrumentation reads only the listed config and marks simulation", async t => {
  const f = await fixture(t), spy = instrument(); const result = await collect(f.input, { io: spy.io });
  assert.equal(result.state, "observed"); assert.equal(result.facts.evidence, "simulated-local-file"); checkFacts(result, false);
  assert.deepEqual(spy.seen.opens, [{ path: f.config, flags: FLAGS }]);
  const parents = new Set(["/", ...f.config.slice(1).split("/").map((_, i, parts) => "/" + parts.slice(0, i + 1).join("/"))]);
  assert.ok(spy.seen.lstat.every(p => parents.has(p)));
  assert.equal(spy.seen.closes, 1); assert.equal(FLAGS & constants.O_NOFOLLOW, constants.O_NOFOLLOW);
  assert.equal(FLAGS & constants.O_NONBLOCK, constants.O_NONBLOCK);
  assert.equal(FLAGS & (constants.O_WRONLY | constants.O_RDWR | constants.O_CREAT | constants.O_TRUNC | constants.O_APPEND), 0);
});
for (const contents of ["", "# empty\n", '[mcp_servers.other]\ncommand="foreign-marker"\n']) {
  posixTest("A1c present file without own slot stays distinct from absent file " + contents.length, async t => {
    const f = await fixture(t, contents), result = await collect(f.input);
    assert.equal(result.state, "observed"); assert.equal(result.fileState, "present"); assert.equal(result.entryState, "absent");
    assert.equal(result.server, null); assert.equal(result.configurationSha256, hash(contents)); checkFacts(result, true);
    assert.doesNotMatch(JSON.stringify(result), /foreign-marker/);
  });
}
for (const missing of ["codex", "config"]) {
  posixTest("A1c confirms absence without opening or creating " + missing, async t => {
    const f = await fixture(t); await fs.unlink(f.config); if (missing === "codex") await fs.rmdir(f.codex);
    const spy = instrument(), result = await collect(f.input, { io: spy.io });
    assert.equal(result.state, "absent"); assert.equal(result.fileState, "absent"); assert.equal(result.entryState, null);
    assert.equal(result.configurationSha256, null); assert.match(result.metadataSha256, /^[a-f0-9]{64}$/);
    assert.equal(spy.seen.opens.length, 0); assert.equal(spy.seen.reads.length, 0); checkFacts(result, false, false);
    await assert.rejects(fs.lstat(missing === "codex" ? f.codex : f.config), { code: "ENOENT" });
  });
}
posixTest("A1c native absent file does not claim a byte read", async t => {
  const f = await fixture(t); await fs.unlink(f.config); const result = await collect(f.input);
  assert.equal(result.state, "absent"); assert.equal(result.facts.evidence, "local-metadata"); checkFacts(result, true, false);
});
posixTest("A1c missing declared home blocks instead of manufacturing installation", async t => {
  const f = await fixture(t); const home = f.root + "/missing";
  const spy = instrument(), result = await collect({ ...f.input, homeDirectory: home, configurationPath: home + "/.codex/config.toml" }, { io: spy.io });
  blocked(result, "MC_FILES_UNREADABLE"); assert.equal(spy.seen.opens.length, 0);
});
test("A1c invalid data, proxies and hooks never reach IO or execute hooks", async () => {
  let calls = 0, hooks = 0; const forbidden = () => { calls++; throw Error("unexpected IO"); };
  const base = { homeDirectory: "/fictitious/home", configurationPath: "/fictitious/home/.codex/config.toml", mcpName: "demo-memory" };
  const inputs = [undefined, null, [], {}, { ...base, extra: true }, { ...base, mcpName: "constructor" }, { ...base, mcpName: "Demo" }, { ...base, mcpName: "x".repeat(65) },
    { ...base, homeDirectory: "relative" }, { ...base, configurationPath: "relative" }, { ...base, configurationPath: "/other/.codex/config.toml" },
    { ...base, configurationPath: "/fictitious/home/.env" }, { ...base, configurationPath: "/fictitious/home/other.toml" },
    { ...base, configurationPath: "/fictitious/home/./.codex/config.toml" }, { ...base, homeDirectory: "/fictitious/home/" },
    { ...base, homeDirectory: "/" }, { ...base, homeDirectory: "/fictitious/../home" },
    { ...base, homeDirectory: "/fictitious\\home" }, { ...base, homeDirectory: "/fictitious/home\n" },
    { ...base, homeDirectory: "/fictitious/\ud800" }, { ...base, homeDirectory: "/fictitious/" + "x".repeat(4096) },
    { ...base, homeDirectory: "/" + Array(65).fill("a").join("/") },
    { ...base, homeDirectory: "/fictitious/.git", configurationPath: "/fictitious/.git/.codex/config.toml" },
    { ...base, homeDirectory: "/fictitious/.env", configurationPath: "/fictitious/.env/.codex/config.toml" },
    Object.defineProperty({ ...base }, "homeDirectory", { enumerable: true, get() { hooks++; throw Error("hook"); } }),
    new Proxy(base, { get() { hooks++; throw Error("hook"); }, ownKeys() { hooks++; throw Error("hook"); } }),
    { ...base, toJSON() { hooks++; } }];
  for (const input of inputs) {
    const result = await collect(input, { io: { lstat: forbidden, open: forbidden } });
    assert.equal(result.state, "invalid"); assert.deepEqual(result.reasons, ["MC_FILES_INPUT"]);
    assert.equal(result.configurationSha256, null); assert.equal(result.facts.evidence, "none");
  }
  assert.equal(calls, 0); assert.equal(hooks, 0);
});
for (const where of ["config", "codex", "home", "ancestor"]) {
  posixTest("A1c no-follow symlink " + where, async t => {
    const f = await fixture(t); let input = f.input;
    if (where === "config") { await fs.rename(f.config, f.config + ".real"); await fs.symlink(f.config + ".real", f.config); }
    if (where === "codex") { await fs.rename(f.codex, f.codex + ".real"); await fs.symlink(f.codex + ".real", f.codex); }
    if (where === "home") { await fs.rename(f.home, f.home + ".real"); await fs.symlink(f.home + ".real", f.home); }
    if (where === "ancestor") { const alias = f.root + "/alias"; await fs.symlink(f.home, alias); const home = alias + "/child"; input = { ...input, homeDirectory: home, configurationPath: home + "/.codex/config.toml" }; }
    const spy = instrument(); blocked(await collect(input, { io: spy.io })); assert.equal(spy.seen.opens.length, 0);
  });
}
posixTest("A1c blocks a hardlinked config before open", async t => {
  const f = await fixture(t); await fs.link(f.config, f.root + "/second-link"); const spy = instrument();
  blocked(await collect(f.input, { io: spy.io }), "MC_FILES_FILE_UNSAFE"); assert.equal(spy.seen.opens.length, 0);
});
posixTest("A1c blocks directory where config file was expected", async t => {
  const f = await fixture(t); await fs.unlink(f.config); await fs.mkdir(f.config, { mode: 0o700 }); const spy = instrument();
  blocked(await collect(f.input, { io: spy.io }), "MC_FILES_FILE_UNSAFE"); assert.equal(spy.seen.opens.length, 0);
});
for (const mode of [0o000, 0o400, 0o640, 0o644, 0o660, 0o666, 0o700, 0o1600, 0o2600, 0o4600]) {
  posixTest("A1c exact config mode rejects " + mode.toString(8), async t => {
    const f = await fixture(t), spy = instrument({ lstat: async p => { const s = await fs.lstat(p); return p === f.config ? withStat(s, { mode: (s.mode & ~0o7777) | mode }) : s; } });
    blocked(await collect(f.input, { io: spy.io }), "MC_FILES_FILE_UNSAFE"); assert.equal(spy.seen.opens.length, 0);
  });
}
for (const target of ["config", "codex", "home", "root"]) {
  posixTest("A1c owner mismatch " + target + " rejects before open", async t => {
    const f = await fixture(t), spy = instrument({ lstat: async p => { const s = await fs.lstat(p); return p === f[target] ? withStat(s, { uid: process.getuid() + 1000 }) : s; } });
    blocked(await collect(f.input, { io: spy.io })); assert.equal(spy.seen.opens.length, 0);
  });
}
for (const target of ["codex", "home", "root"]) for (const mode of [0o777, 0o770, 0o1700, 0o2700, 0o4700, 0o600]) {
  posixTest("A1c parent permission rejection " + target + "=" + mode.toString(8), async t => {
    const f = await fixture(t), spy = instrument({ lstat: async p => { const s = await fs.lstat(p); return p === f[target] ? withStat(s, { mode: (s.mode & ~0o7777) | mode }) : s; } });
    blocked(await collect(f.input, { io: spy.io }), "MC_FILES_PARENT_UNSAFE"); assert.equal(spy.seen.opens.length, 0);
  });
}
posixTest("A1c permits root-owned sticky ancestor but not the owned home", async t => {
  const f = await fixture(t);
  const accepted = instrument({ lstat: async p => { const s = await fs.lstat(p); return p === path.dirname(f.root) ? withStat(s, { uid: 0, mode: (s.mode & ~0o7777) | 0o1777 }) : s; } });
  assert.equal((await collect(f.input, { io: accepted.io })).state, "observed");
  const refused = instrument({ lstat: async p => { const s = await fs.lstat(p); return p === f.home ? withStat(s, { uid: 0, mode: (s.mode & ~0o7777) | 0o1777 }) : s; } });
  blocked(await collect(f.input, { io: refused.io }), "MC_FILES_PARENT_UNSAFE");
});
for (const size of [0, 1, LIMITS.chunkBytes, LIMITS.fileBytes]) {
  posixTest("A1c bounded read at " + size + " bytes, without extra EOF probe", async t => {
    const contents = size === 0 ? "" : "#" + "x".repeat(size - 1), f = await fixture(t, contents), spy = instrument();
    const result = await collect(f.input, { io: spy.io }); assert.equal(result.state, "observed");
    assert.equal(result.configurationSha256, hash(contents)); assert.equal(spy.seen.closes, 1);
    assert.equal(spy.seen.reads.reduce((n, r) => n + r.length, 0), size);
    assert.equal(spy.seen.reads.reduce((n, r) => n + r.bytesRead, 0), size);
    assert.equal(spy.seen.reads.length, Math.ceil(size / LIMITS.chunkBytes));
    assert.ok(spy.seen.reads.every(r => r.length <= LIMITS.chunkBytes && r.length <= size - r.position && r.position === r.offset));
  });
}
posixTest("A1c oversized file blocks before open", async t => {
  const f = await fixture(t, "#" + "x".repeat(LIMITS.fileBytes)), spy = instrument();
  blocked(await collect(f.input, { io: spy.io }), "MC_FILES_LIMIT"); assert.equal(spy.seen.opens.length, 0);
});
posixTest("A1c partial reads keep explicit offsets and remaining size bound", async t => {
  const f = await fixture(t); const spy = instrument({ read: (h, b, o, l, p) => h.read(b, o, Math.min(l, 7), p) });
  const result = await collect(f.input, { io: spy.io }); assert.equal(result.state, "observed");
  assert.equal(result.configurationSha256, hash(source)); assert.equal(spy.seen.reads.reduce((n, r) => n + r.bytesRead, 0), Buffer.byteLength(source));
  assert.ok(spy.seen.reads.every(r => r.position === r.offset && r.length <= Buffer.byteLength(source) - r.position));
});
for (const byteCount of [-1, NaN, 0.5, "1", LIMITS.chunkBytes + 1]) {
  posixTest("A1c invalid read count blocks and closes " + String(byteCount), async t => {
    const f = await fixture(t), spy = instrument({ read: async () => ({ bytesRead: byteCount }) });
    blocked(await collect(f.input, { io: spy.io }), "MC_FILES_READ"); assert.equal(spy.seen.closes, 1);
  });
}
posixTest("A1c premature zero read is a changed file, not successful truncation", async t => {
  const f = await fixture(t), spy = instrument({ read: async () => ({ bytesRead: 0 }) });
  blocked(await collect(f.input, { io: spy.io }), "MC_FILES_CHANGED"); assert.equal(spy.seen.closes, 1);
});
for (const missing of ["codex", "config"]) {
  posixTest("A1c absent path appearing on recheck blocks " + missing, async t => {
    const f = await fixture(t); await fs.unlink(f.config); if (missing === "codex") await fs.rmdir(f.codex);
    let count = 0; const destination = f[missing];
    const spy = instrument({ lstat: async p => {
      if (p === destination && ++count === 2) {
        if (missing === "codex") await fs.mkdir(f.codex, { mode: 0o700 }); else await fs.writeFile(f.config, source, { mode: 0o600 });
      }
      return fs.lstat(p);
    } });
    blocked(await collect(f.input, { io: spy.io }), "MC_FILES_CHANGED"); assert.equal(spy.seen.opens.length, 0);
  });
}
for (const change of ["replace", "symlink", "directory"]) {
  posixTest("A1c file changes between lstat and open " + change, async t => {
    const f = await fixture(t), spy = instrument({ beforeOpen: async () => {
      await fs.rename(f.config, f.config + ".old");
      if (change === "replace") await fs.writeFile(f.config, source, { mode: 0o600 });
      if (change === "symlink") await fs.symlink(f.config + ".old", f.config);
      if (change === "directory") await fs.mkdir(f.config, { mode: 0o700 });
    } });
    blocked(await collect(f.input, { io: spy.io })); assert.equal(spy.seen.opens.length, 1); assert.equal(spy.seen.reads.length, 0);
    if (change !== "symlink") assert.equal(spy.seen.closes, 1);
  });
}
posixTest("A1c replaced parent between check and open is rejected before any content read", async t => {
  const f = await fixture(t), spy = instrument({ beforeOpen: async () => {
    await fs.rename(f.codex, f.codex + ".old"); await fs.symlink(f.codex + ".old", f.codex);
  } });
  blocked(await collect(f.input, { io: spy.io })); assert.equal(spy.seen.reads.length, 0); assert.equal(spy.seen.closes, 1);
});
for (const change of ["grow", "truncate", "replace", "chmod", "parent"]) {
  posixTest("A1c observable change during read " + change, async t => {
    const f = await fixture(t), spy = instrument({ read: async (h, b, o, l, p) => {
      const r = await h.read(b, o, l, p);
      if (change === "grow") await fs.appendFile(f.config, "# growth\n");
      if (change === "truncate") await fs.truncate(f.config, 0);
      if (change === "replace") { await fs.rename(f.config, f.config + ".old"); await fs.writeFile(f.config, source, { mode: 0o600 }); }
      if (change === "chmod") await fs.chmod(f.config, 0o644);
      if (change === "parent") await fs.chmod(f.codex, 0o770);
      return r;
    } });
    blocked(await collect(f.input, { io: spy.io })); assert.equal(spy.seen.closes, 1); assert.equal(spy.seen.opens.length, 1);
  });
}
posixTest("A1c growth at exact 1 MiB cap does not request the extra byte", async t => {
  const f = await fixture(t, "#" + "x".repeat(LIMITS.fileBytes - 1));
  const spy = instrument({ read: async (h, b, o, l, p, seen) => {
    const r = await h.read(b, o, l, p); if (seen.reads.length === 1) await fs.appendFile(f.config, "x"); return r;
  } });
  blocked(await collect(f.input, { io: spy.io })); assert.equal(spy.seen.closes, 1);
  assert.equal(spy.seen.reads.reduce((n, r) => n + r.length, 0), LIMITS.fileBytes);
  assert.equal(spy.seen.reads.reduce((n, r) => n + r.bytesRead, 0), LIMITS.fileBytes);
});
posixTest("A1c empty file growth detected without any content read", async t => {
  const f = await fixture(t, ""); const spy = instrument({ stat: async (h, seen) => {
    if (seen.stats === 2) await fs.appendFile(f.config, source); return h.stat();
  } });
  blocked(await collect(f.input, { io: spy.io }), "MC_FILES_CHANGED"); assert.equal(spy.seen.reads.length, 0); assert.equal(spy.seen.closes, 1);
});
posixTest("A1c post-close replacement blocks the report", async t => {
  const f = await fixture(t), spy = instrument({ afterClose: async () => {
    await fs.rename(f.config, f.config + ".old"); await fs.writeFile(f.config, source, { mode: 0o600 });
  } });
  blocked(await collect(f.input, { io: spy.io }), "MC_FILES_CHANGED"); assert.equal(spy.seen.closes, 1);
});
posixTest("A1c benign sibling creation does not invalidate parent identity", async t => {
  const f = await fixture(t), spy = instrument({ read: async (h, b, o, l, p) => {
    const r = await h.read(b, o, l, p); await fs.writeFile(f.codex + "/sibling", "fictitious", { mode: 0o600 }); return r;
  } });
  assert.equal((await collect(f.input, { io: spy.io })).state, "observed");
});
for (const stage of ["lstat", "open", "stat", "read", "close"]) {
  posixTest("A1c sanitizes IO error and does not retry " + stage, async t => {
    const f = await fixture(t); const hooks = {};
    if (stage === "lstat") hooks.lstat = async () => { throw error("EACCES"); };
    if (stage === "open") hooks.openError = error("EACCES");
    if (stage === "stat") hooks.stat = async () => { throw error("EACCES"); };
    if (stage === "read") hooks.read = async () => { throw error("EACCES"); };
    if (stage === "close") hooks.afterClose = async () => { throw error("EACCES"); };
    const spy = instrument(hooks), result = await collect(f.input, { io: spy.io }); blocked(result);
    assert.ok(spy.seen.opens.length <= 1); assert.equal(spy.seen.closes, ["stat", "read", "close"].includes(stage) ? 1 : 0);
    if (stage === "close") assert.deepEqual(result.reasons, ["MC_FILES_CLOSE"]);
  });
}
for (const contents of [Buffer.from([0xff]), "\ufeff" + source, source + 'command="duplicate-marker"\n', '[mcp_servers.demo-memory]\nenv={VALUE="private-marker"}\n', '[mcp_servers.demo-memory]\nargs=["password' + '=fictitious-secret-marker"]\n']) {
  posixTest("A1c maps parser rejection to blocked without partial hashes or messages " + Buffer.byteLength(contents), async t => {
    const f = await fixture(t, contents), spy = instrument(), result = await collect(f.input, { io: spy.io });
    blocked(result, "MC_FILES_TOML"); assert.equal(spy.seen.closes, 1);
    assert.doesNotMatch(JSON.stringify(result), /private-marker|duplicate-marker|fictitious-secret-marker/);
  });
}
posixTest("A1c immutable reports and no cross-request data retention", async t => {
  const f = await fixture(t), input = { ...f.input }; const result = await collect(input);
  input.mcpName = "changed"; assert.equal(result.mcpName, "demo-memory");
  const check = value => { if (value && typeof value === "object") { assert.equal(Object.isFrozen(value), true); Object.values(value).forEach(check); } };
  check(result); assert.ok(Buffer.byteLength(JSON.stringify(result)) <= LIMITS.reportBytes);
  assert.throws(() => result.server.args.push("changed"), TypeError);
  await fs.writeFile(f.config, "# another snapshot\n", { mode: 0o600 }); const next = await collect(f.input);
  assert.notEqual(next.configurationSha256, result.configurationSha256); assert.notEqual(next.metadataSha256, result.metadataSha256);
});
for (const kind of [0o010000, 0o020000, 0o060000, 0o140000]) {
  posixTest("A1c special file type rejected before open " + kind.toString(8), async t => {
    const f = await fixture(t), spy = instrument({ lstat: async p => {
      const s = await fs.lstat(p); return p === f.config ? withStat(s, { mode: kind | 0o600 }) : s;
    } });
    blocked(await collect(f.input, { io: spy.io }), "MC_FILES_FILE_UNSAFE"); assert.equal(spy.seen.opens.length, 0);
  });
}
for (const size of [-1, NaN, 0.5, Infinity]) {
  posixTest("A1c invalid size metadata rejected " + String(size), async t => {
    const f = await fixture(t), spy = instrument({ lstat: async p => {
      const s = await fs.lstat(p); return p === f.config ? withStat(s, { size }) : s;
    } });
    blocked(await collect(f.input, { io: spy.io }), "MC_FILES_LIMIT"); assert.equal(spy.seen.opens.length, 0);
  });
}
posixTest("A1c inaccessible target is not classified as missing", async t => {
  const f = await fixture(t), spy = instrument({ lstat: async p => {
    if (p === f.config) throw error("EACCES"); return fs.lstat(p);
  } });
  blocked(await collect(f.input, { io: spy.io }), "MC_FILES_UNREADABLE"); assert.equal(spy.seen.opens.length, 0);
});
for (const change of [{ nlink: 2 }, { uid: 99999 }, { mtimeMs: -1 }, { ino: -1 }]) {
  posixTest("A1c descriptor metadata differs before content read " + Object.keys(change)[0], async t => {
    const f = await fixture(t), spy = instrument({ stat: async h => withStat(await h.stat(), change) });
    blocked(await collect(f.input, { io: spy.io })); assert.equal(spy.seen.reads.length, 0); assert.equal(spy.seen.closes, 1);
  });
}
posixTest("A1c real non-private mode blocks without repairing it", async t => {
  const f = await fixture(t); await fs.chmod(f.config, 0o644); blocked(await collect(f.input), "MC_FILES_FILE_UNSAFE");
  assert.equal((await fs.lstat(f.config)).mode & 0o7777, 0o644);
});
posixTest("A1c exact native byte hash survives CRLF, Unicode and foreign markers", async t => {
  const text = '# café 🐦 foreign-marker\r\n[mcp_servers.other]\r\ncommand="unrelated-marker"\r\n' + source.replaceAll("\n", "\r\n");
  const f = await fixture(t, text), result = await collect(f.input);
  assert.equal(result.state, "observed"); assert.equal(result.configurationSha256, hash(Buffer.from(text)));
  assert.doesNotMatch(JSON.stringify(result), /foreign-marker|unrelated-marker/);
  assert.equal(text.slice(...result.ranges.fields.command.value), '"node"');
});
posixTest("A1c oversized extracted report stays blocked and bounded", async t => {
  const text = '[mcp_servers.demo-memory]\nenabled_tools=' + JSON.stringify(Array(32).fill("x".repeat(4096)));
  const f = await fixture(t, text), result = await collect(f.input);
  blocked(result, "MC_TOML_REPORT_LIMIT"); assert.ok(Buffer.byteLength(JSON.stringify(result)) < LIMITS.reportBytes);
});
posixTest("A1c malformed trusted dependency is sanitized, not an uncaught error", async t => {
  const f = await fixture(t); blocked(await collect(f.input, null), "MC_FILES_IO");
});
posixTest("A1c does not discover home/cwd, list directories, write, use network or spawn", async t => {
  const f = await fixture(t); const undo = []; let calls = 0;
  const forbidden = () => { calls++; throw Error("unexpected capability"); };
  const patch = (object, key) => { const old = object[key]; object[key] = forbidden; undo.push(() => { object[key] = old; }); };
  let result;
  try {
    patch(os, "homedir"); patch(process, "cwd");
    for (const name of ["readdir", "writeFile", "appendFile", "mkdir", "chmod", "rename", "unlink", "rm", "symlink", "realpath"]) patch(fs, name);
    for (const obj of [http, https]) for (const name of ["get", "request"]) patch(obj, name);
    for (const name of ["spawn", "spawnSync", "exec", "execSync", "execFile", "execFileSync", "fork"]) patch(childProcess, name);
    patch(globalThis, "fetch");
    result = await collect(f.input);
  } finally { undo.reverse().forEach(fn => fn()); }
  assert.equal(calls, 0); assert.equal(result.state, "observed");
});
