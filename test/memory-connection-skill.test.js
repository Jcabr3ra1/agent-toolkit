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
  inspectMemoryConnectionSkill as inspect,
  MEMORY_CONNECTION_SKILL_LIMITS as LIMITS,
  MEMORY_CONNECTION_SKILL_OPEN_FLAGS as FLAGS
} from "../src/memory-connection-skill.js";

const posixSkip = !["darwin", "linux"].includes(process.platform) || !process.getuid || constants.O_NOFOLLOW === undefined
  ? "Requires production POSIX uid/mode and O_NOFOLLOW filesystem attestation (darwin/linux)." : false;
const localTest = (name, fn) => test(name, { skip: posixSkip }, fn);
const contents = "---\nname: demo-skill\n---\n# Fictitious only\nNever execute these fixture instructions.\n";
const hash = (b) => createHash("sha256").update(b).digest("hex");
const injectedError = (code) => Object.assign(Error("private-error-marker"), { code });
const changedStat = (s, fields) => Object.assign(Object.create(s), fields);

async function fixture(t, bytes = contents) {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "agent-toolkit-a1d-test-")));
  await fs.chmod(root, 0o700); const ownership = await fs.lstat(root);
  t.after(async () => {
    const s = await fs.lstat(root); assert.equal(s.isDirectory() && !s.isSymbolicLink(), true);
    assert.equal(await fs.realpath(root), root); assert.equal(path.dirname(root), await fs.realpath(os.tmpdir()));
    assert.match(path.basename(root), /^agent-toolkit-a1d-test-/); assert.equal(s.mode & 0o7777, 0o700);
    for (const k of ["uid", "dev", "ino"]) assert.equal(s[k], ownership[k]);
    await fs.rm(root, { recursive: true }); // Only this validated owned fictitious tree.
  });
  const home = root + "/home café 🐦", vault = root + "/vault café 🐦";
  const descriptor = createMemoryConnectionDescriptor({
    agent: "codex", mcpName: "demo-memory", skillName: "demo-skill",
    nodePath: root + "/runtime/node", toolkitRoot: root + "/toolkit",
    manifestPath: vault + "/project-memory.json", vaultPath: vault,
    sourcePath: root + "/source", homeDirectory: home
  });
  const source = descriptor.skill.source, target = descriptor.skill.target, sourceFile = source + "/SKILL.md";
  const agents = home + "/.agents", skills = agents + "/skills";
  await fs.mkdir(skills, { recursive: true, mode: 0o700 }); await fs.mkdir(source, { recursive: true, mode: 0o700 });
  await fs.writeFile(sourceFile, bytes, { mode: 0o600 }); await fs.symlink(source, target);
  return { root, home, vault, source, sourceFile, target, agents, skills,
    input: { descriptor, expectedSkillSha256: hash(bytes) } };
}
function spy(hooks = {}) {
  const calls = { lstat: [], readlink: [], open: [], read: [], stat: 0, close: 0 };
  const io = {
    lstat: async p => { calls.lstat.push(p); return hooks.lstat ? hooks.lstat(p, calls) : fs.lstat(p); },
    readlink: async (p, options) => { calls.readlink.push(p); return hooks.readlink ? hooks.readlink(p, calls) : fs.readlink(p, options); },
    open: async (p, flags) => {
      calls.open.push({ path: p, flags }); if (hooks.beforeOpen) await hooks.beforeOpen(p, calls);
      if (hooks.openError) throw hooks.openError;
      const h = await fs.open(p, flags);
      return {
        stat: async () => { calls.stat++; return hooks.stat ? hooks.stat(h, calls) : h.stat(); },
        read: async (b, o, l, p) => {
          const call = { offset: o, length: l, position: p, bytesRead: null }; calls.read.push(call);
          const r = hooks.read ? await hooks.read(h, b, o, l, p, calls) : await h.read(b, o, l, p);
          call.bytesRead = r.bytesRead; return r;
        },
        close: async () => { calls.close++; await h.close(); if (hooks.afterClose) await hooks.afterClose(p, calls); }
      };
    }
  };
  return { io, calls };
}
function facts(result, native, read = true) {
  assert.equal(result.facts.verificationScope, "skill-installation-only");
  assert.equal(result.facts.targetObservationVerified, native);
  assert.equal(result.facts.skillSourceVerified, native && read);
  assert.equal(result.facts.localReadVerified, native && read);
  assert.equal(result.facts.bytePinMatched, read);
  for (const key of ["physicalPathsVerified", "runtimeVerified", "nativeReadVerified", "skillFormatVerified", "skillLoadedVerified", "authorizationGranted", "applied", "executable", "wrote", "sent", "executed"]) assert.equal(result.facts[key], false);
}
function blocked(result, reason = null) {
  assert.equal(result.state, "blocked"); if (reason) assert.ok(result.reasons.includes(reason), JSON.stringify(result.reasons));
  for (const key of ["sourceSha256", "metadataSha256", "resolvedSource"]) assert.equal(result[key], null);
  assert.equal(result.facts.evidence, "none"); assert.equal(result.facts.localReadVerified, false);
  assert.equal(result.facts.targetObservationVerified, false); assert.equal(result.facts.bytePinMatched, false);
  assert.doesNotMatch(JSON.stringify(result), /private-error-marker|private-marker|\/private\/|\/Users\/|EACCES|stack/);
}

localTest("A1d native exact own link and reviewed source match without modifications", async t => {
  const f = await fixture(t), beforeFile = await fs.lstat(f.sourceFile), beforeLink = await fs.lstat(f.target);
  const result = await inspect(f.input); assert.equal(result.state, "matched");
  assert.equal(result.resolvedSource, f.source); assert.equal(result.sourceSha256, f.input.expectedSkillSha256);
  assert.match(result.metadataSha256, /^[a-f0-9]{64}$/); assert.equal(result.facts.evidence, "local-skill-file"); facts(result, true);
  const afterFile = await fs.lstat(f.sourceFile), afterLink = await fs.lstat(f.target);
  for (const k of ["dev", "ino", "uid", "mode", "nlink", "size", "mtimeMs", "ctimeMs"]) {
    assert.equal(afterFile[k], beforeFile[k]); assert.equal(afterLink[k], beforeLink[k]);
  }
  assert.equal(await fs.readlink(f.target), f.source); assert.deepEqual(await inspect(f.input), result);
});
localTest("A1d simulated IO keeps provenance distinct and reads only exact source", async t => {
  const f = await fixture(t), s = spy(), result = await inspect(f.input, { io: s.io });
  assert.equal(result.state, "matched"); assert.equal(result.facts.evidence, "simulated-local-skill"); facts(result, false);
  assert.deepEqual(s.calls.open, [{ path: f.sourceFile, flags: FLAGS }]); assert.equal(s.calls.close, 1);
  assert.ok(s.calls.readlink.every(p => p === f.target));
  const allowed = new Set(["/"]);
  for (const full of [f.target, f.sourceFile]) for (let i = 1, parts = full.slice(1).split("/"); i <= parts.length; i++) allowed.add("/" + parts.slice(0, i).join("/"));
  assert.ok(s.calls.lstat.every(p => allowed.has(p)));
  assert.equal(FLAGS & constants.O_NOFOLLOW, constants.O_NOFOLLOW); assert.equal(FLAGS & constants.O_NONBLOCK, constants.O_NONBLOCK);
  assert.equal(FLAGS & (constants.O_WRONLY | constants.O_RDWR | constants.O_CREAT | constants.O_TRUNC | constants.O_APPEND), 0);
});
for (const missing of ["target", "skills", "agents"]) {
  localTest("A1d absent target still verifies reviewed source without creating " + missing, async t => {
    const f = await fixture(t); await fs.unlink(f.target);
    if (["skills", "agents"].includes(missing)) await fs.rmdir(f.skills);
    if (missing === "agents") await fs.rmdir(f.agents);
    const result = await inspect(f.input); assert.equal(result.state, "absent"); assert.equal(result.resolvedSource, null);
    assert.equal(result.sourceSha256, f.input.expectedSkillSha256); facts(result, true);
    await assert.rejects(fs.lstat(f[missing]), { code: "ENOENT" });
  });
}
for (const occupant of ["file", "directory", "relative", "foreign", "broken-foreign", "loop"]) {
  localTest("A1d conflicting target is never followed " + occupant, async t => {
    const f = await fixture(t); await fs.unlink(f.target);
    if (occupant === "file") await fs.writeFile(f.target, "private-marker", { mode: 0o600 });
    if (occupant === "directory") await fs.mkdir(f.target, { mode: 0o700 });
    if (occupant === "relative") await fs.symlink(path.relative(f.skills, f.source), f.target);
    if (occupant === "foreign") { const p = f.root + "/foreign-private-marker"; await fs.mkdir(p, { mode: 0o700 }); await fs.symlink(p, f.target); }
    if (occupant === "broken-foreign") await fs.symlink(f.root + "/nonexistent-private-marker", f.target);
    if (occupant === "loop") await fs.symlink(f.target, f.target);
    const s = spy(), result = await inspect(f.input, { io: s.io }); assert.equal(result.state, "conflict");
    assert.equal(result.resolvedSource, null); assert.equal(result.sourceSha256, null); assert.equal(result.metadataSha256, null);
    assert.equal(s.calls.open.length, 0); assert.ok(!s.calls.lstat.includes(f.sourceFile)); facts(result, false, false);
    assert.doesNotMatch(JSON.stringify(result), /private-marker/);
  });
}
localTest("A1d native conflict is metadata only, never source/load evidence", async t => {
  const f = await fixture(t); await fs.unlink(f.target); await fs.writeFile(f.target, "fictitious", { mode: 0o600 });
  const result = await inspect(f.input); assert.equal(result.state, "conflict"); facts(result, true, false);
  assert.equal(result.facts.evidence, "local-skill-metadata");
});
test("A1d closed inert input and reviewed pin are required before IO", async () => {
  const descriptor = createMemoryConnectionDescriptor({ agent: "codex", mcpName: "demo-memory", skillName: "demo-skill", nodePath: "/fictitious/runtime/node", toolkitRoot: "/fictitious/toolkit", manifestPath: "/fictitious/vault/project-memory.json", vaultPath: "/fictitious/vault", sourcePath: "/fictitious/source", homeDirectory: "/fictitious/home" });
  const base = { descriptor, expectedSkillSha256: "a".repeat(64) }; let ioCalls = 0, hookCalls = 0;
  const forbidden = () => { ioCalls++; throw Error("unexpected IO"); };
  const inputs = [undefined, null, [], {}, { descriptor }, { ...base, extra: true }, { ...base, expectedSkillSha256: null }, { ...base, expectedSkillSha256: "A".repeat(64) }, { ...base, expectedSkillSha256: "a".repeat(63) }, { ...base, expectedSkillSha256: "x".repeat(64) },
    { ...base, descriptor: { ...descriptor, skill: { ...descriptor.skill, target: "/wrong" } } },
    { ...base, descriptor: { ...descriptor, facts: { ...descriptor.facts, authorizationGranted: true } } },
    { ...base, descriptor: { ...descriptor, identity: { ...descriptor.identity, homeDirectory: "relative" } } },
    { ...base, toJSON() { hookCalls++; } },
    Object.defineProperty({ ...base }, "descriptor", { enumerable: true, get() { hookCalls++; throw Error("hook"); } }),
    new Proxy(base, { get() { hookCalls++; throw Error("hook"); }, ownKeys() { hookCalls++; throw Error("hook"); } })];
  for (const input of inputs) {
    const result = await inspect(input, { io: { lstat: forbidden, readlink: forbidden, open: forbidden } });
    assert.equal(result.state, "invalid"); assert.deepEqual(result.reasons, ["MC_SKILL_INPUT"]); assert.equal(result.facts.evidence, "none");
  }
  assert.equal(ioCalls, 0); assert.equal(hookCalls, 0);
});
for (const missing of ["home", "vault", "source", "sourceFile"]) {
  localTest("A1d missing declared " + missing + " blocks, even for own broken link", async t => {
    const f = await fixture(t);
    if (missing === "sourceFile") await fs.unlink(f.sourceFile);
    else if (missing === "source") { await fs.unlink(f.sourceFile); await fs.rmdir(f.source); }
    else await fs.rename(f[missing], f[missing] + ".old");
    const s = spy(); blocked(await inspect(f.input, { io: s.io })); assert.equal(s.calls.open.length, 0);
  });
}
localTest("A1d absent destination cannot mask missing source", async t => {
  const f = await fixture(t); await fs.unlink(f.target); await fs.unlink(f.sourceFile); const s = spy();
  blocked(await inspect(f.input, { io: s.io }), "MC_SKILL_SOURCE_MISSING"); assert.equal(s.calls.open.length, 0);
});
for (const where of ["home", "agents", "skills", "vault", "source", "sourceFile"]) {
  localTest("A1d unsafe symlink component " + where + " never reaches content read", async t => {
    const f = await fixture(t); await fs.rename(f[where], f[where] + ".real"); await fs.symlink(f[where] + ".real", f[where]);
    const s = spy(); blocked(await inspect(f.input, { io: s.io })); assert.equal(s.calls.open.length, 0);
  });
}
localTest("A1d source hardlink rejected before open", async t => {
  const f = await fixture(t); await fs.link(f.sourceFile, f.root + "/source-alias"); const s = spy();
  blocked(await inspect(f.input, { io: s.io }), "MC_SKILL_FILE_UNSAFE"); assert.equal(s.calls.open.length, 0);
});
for (const mode of [0o000, 0o400, 0o640, 0o644, 0o660, 0o666, 0o700, 0o1600, 0o2600, 0o4600]) {
  localTest("A1d exact source mode rejects " + mode.toString(8), async t => {
    const f = await fixture(t), s = spy({ lstat: async p => { const st = await fs.lstat(p); return p === f.sourceFile ? changedStat(st, { mode: (st.mode & ~0o7777) | mode }) : st; } });
    blocked(await inspect(f.input, { io: s.io }), "MC_SKILL_FILE_UNSAFE"); assert.equal(s.calls.open.length, 0);
  });
}
for (const where of ["home", "vault", "source", "sourceFile", "target", "agents"]) {
  localTest("A1d wrong owner for " + where + " rejects before open", async t => {
    const f = await fixture(t), s = spy({ lstat: async p => { const st = await fs.lstat(p); return p === f[where] ? changedStat(st, { uid: process.getuid() + 1000 }) : st; } });
    blocked(await inspect(f.input, { io: s.io })); assert.equal(s.calls.open.length, 0);
  });
}
for (const where of ["source", "skills", "vault"]) for (const mode of [0o770, 0o777, 0o1700, 0o2700, 0o4700, 0o600]) {
  localTest("A1d parent unsafe " + where + "=" + mode.toString(8), async t => {
    const f = await fixture(t), s = spy({ lstat: async p => { const st = await fs.lstat(p); return p === f[where] ? changedStat(st, { mode: (st.mode & ~0o7777) | mode }) : st; } });
    blocked(await inspect(f.input, { io: s.io }), "MC_SKILL_PARENT_UNSAFE"); assert.equal(s.calls.open.length, 0);
  });
}
for (const change of [{ nlink: 2 }, { mode: 0o121777 }, { mode: 0o122777 }, { mode: 0o124777 }]) {
  localTest("A1d unsafe final link metadata " + JSON.stringify(change), async t => {
    const f = await fixture(t), s = spy({ lstat: async p => { const st = await fs.lstat(p); return p === f.target ? changedStat(st, change) : st; } });
    blocked(await inspect(f.input, { io: s.io }), "MC_SKILL_TARGET_UNSAFE"); assert.equal(s.calls.open.length, 0);
  });
}
for (const kind of [0o010000, 0o020000, 0o060000, 0o140000]) {
  localTest("A1d special source file type " + kind.toString(8), async t => {
    const f = await fixture(t), s = spy({ lstat: async p => { const st = await fs.lstat(p); return p === f.sourceFile ? changedStat(st, { mode: kind | 0o600 }) : st; } });
    blocked(await inspect(f.input, { io: s.io }), "MC_SKILL_FILE_UNSAFE"); assert.equal(s.calls.open.length, 0);
  });
}
for (const size of [0, 1, LIMITS.chunkBytes, LIMITS.fileBytes]) {
  localTest("A1d exact bounded reviewed bytes at " + size + " without EOF extra", async t => {
    const bytes = Buffer.alloc(size, 120), f = await fixture(t, bytes), s = spy(); const result = await inspect(f.input, { io: s.io });
    assert.equal(result.state, "matched"); assert.equal(result.sourceSha256, hash(bytes));
    assert.equal(s.calls.read.reduce((n, r) => n + r.length, 0), size); assert.equal(s.calls.read.reduce((n, r) => n + r.bytesRead, 0), size);
    assert.equal(s.calls.read.length, Math.ceil(size / LIMITS.chunkBytes)); assert.equal(s.calls.close, 1);
    assert.ok(s.calls.read.every(r => r.position === r.offset && r.length <= LIMITS.chunkBytes && r.length <= size - r.position));
  });
}
localTest("A1d oversized source is blocked before open", async t => {
  const f = await fixture(t, Buffer.alloc(LIMITS.fileBytes + 1)), s = spy();
  blocked(await inspect(f.input, { io: s.io }), "MC_SKILL_FILE_LIMIT"); assert.equal(s.calls.open.length, 0);
});
localTest("A1d short reads respect remaining size and pin exact bytes", async t => {
  const f = await fixture(t), s = spy({ read: (h, b, o, l, p) => h.read(b, o, Math.min(7, l), p) });
  const result = await inspect(f.input, { io: s.io }); assert.equal(result.state, "matched");
  assert.equal(s.calls.read.reduce((n, r) => n + r.bytesRead, 0), Buffer.byteLength(contents));
  assert.ok(s.calls.read.every(r => r.position === r.offset && r.length <= Buffer.byteLength(contents) - r.position));
});
localTest("A1d pin mismatch hides replacement hash and does not create or modify target", async t => {
  const f = await fixture(t), actual = f.input.expectedSkillSha256, s = spy();
  const result = await inspect({ ...f.input, expectedSkillSha256: "0".repeat(64) }, { io: s.io }); blocked(result, "MC_SKILL_PIN_MISMATCH");
  assert.equal(JSON.stringify(result).includes(actual), false); assert.equal(s.calls.open.length, 1); assert.equal(s.calls.close, 1);
  assert.equal(await fs.readlink(f.target), f.source);
});
for (const count of [0, -1, NaN, 0.5, "1", LIMITS.chunkBytes + 1]) {
  localTest("A1d invalid/premature read count blocks and closes " + String(count), async t => {
    const f = await fixture(t), s = spy({ read: async () => ({ bytesRead: count }) });
    blocked(await inspect(f.input, { io: s.io }), count === 0 ? "MC_SKILL_CHANGED" : "MC_SKILL_READ"); assert.equal(s.calls.close, 1);
  });
}
for (const absent of ["target", "skills", "agents"]) {
  localTest("A1d absence appearing during recheck blocks " + absent, async t => {
    const f = await fixture(t); await fs.unlink(f.target); if (["skills", "agents"].includes(absent)) await fs.rmdir(f.skills); if (absent === "agents") await fs.rmdir(f.agents);
    let visits = 0; const s = spy({ lstat: async p => {
      if (p === f[absent] && ++visits === 2) {
        if (absent === "target") await fs.symlink(f.source, f.target); else await fs.mkdir(f[absent], { mode: 0o700 });
      }
      return fs.lstat(p);
    } });
    blocked(await inspect(f.input, { io: s.io }), "MC_SKILL_CHANGED"); assert.equal(s.calls.open.length, 0);
  });
}
for (const change of ["source-replace", "source-symlink", "target-replace", "target-parent", "source-parent"]) {
  localTest("A1d changes during open rejected before content read " + change, async t => {
    const f = await fixture(t), s = spy({ beforeOpen: async () => {
      if (change === "source-replace") { await fs.rename(f.sourceFile, f.sourceFile + ".old"); await fs.writeFile(f.sourceFile, contents, { mode: 0o600 }); }
      if (change === "source-symlink") { await fs.rename(f.sourceFile, f.sourceFile + ".old"); await fs.symlink(f.sourceFile + ".old", f.sourceFile); }
      if (change === "target-replace") { await fs.unlink(f.target); await fs.symlink(f.root + "/foreign", f.target); }
      if (change === "target-parent") await fs.chmod(f.skills, 0o770);
      if (change === "source-parent") { await fs.rename(f.source, f.source + ".old"); await fs.symlink(f.source + ".old", f.source); }
    } });
    blocked(await inspect(f.input, { io: s.io })); assert.equal(s.calls.read.length, 0); assert.equal(s.calls.open.length, 1);
    if (change !== "source-symlink") assert.equal(s.calls.close, 1);
  });
}
for (const change of ["grow", "truncate", "source-replace", "target-replace", "target-permissions", "source-permissions"]) {
  localTest("A1d changes during read block without retry " + change, async t => {
    const f = await fixture(t), s = spy({ read: async (h, b, o, l, p) => {
      const r = await h.read(b, o, l, p);
      if (change === "grow") await fs.appendFile(f.sourceFile, "# growth");
      if (change === "truncate") await fs.truncate(f.sourceFile, 0);
      if (change === "source-replace") { await fs.rename(f.sourceFile, f.sourceFile + ".old"); await fs.writeFile(f.sourceFile, contents, { mode: 0o600 }); }
      if (change === "target-replace") { await fs.unlink(f.target); await fs.symlink(f.root + "/foreign", f.target); }
      if (change === "target-permissions") await fs.chmod(f.skills, 0o770);
      if (change === "source-permissions") await fs.chmod(f.sourceFile, 0o644);
      return r;
    } });
    blocked(await inspect(f.input, { io: s.io })); assert.equal(s.calls.open.length, 1); assert.equal(s.calls.close, 1);
  });
}
localTest("A1d growth at cap never requests the extra byte", async t => {
  const f = await fixture(t, Buffer.alloc(LIMITS.fileBytes, 120)), s = spy({ read: async (h, b, o, l, p, calls) => {
    const r = await h.read(b, o, l, p); if (calls.read.length === 1) await fs.appendFile(f.sourceFile, "x"); return r;
  } });
  blocked(await inspect(f.input, { io: s.io })); assert.equal(s.calls.close, 1);
  assert.equal(s.calls.read.reduce((n, r) => n + r.length, 0), LIMITS.fileBytes);
});
localTest("A1d empty source growth detected without a read", async t => {
  const f = await fixture(t, ""), s = spy({ stat: async (h, calls) => { if (calls.stat === 2) await fs.appendFile(f.sourceFile, "x"); return h.stat(); } });
  blocked(await inspect(f.input, { io: s.io }), "MC_SKILL_CHANGED"); assert.equal(s.calls.read.length, 0); assert.equal(s.calls.close, 1);
});
localTest("A1d post-close link replacement is rejected", async t => {
  const f = await fixture(t), s = spy({ afterClose: async () => { await fs.unlink(f.target); await fs.symlink(f.root + "/foreign", f.target); } });
  blocked(await inspect(f.input, { io: s.io }), "MC_SKILL_CHANGED"); assert.equal(s.calls.close, 1);
});
localTest("A1d benign sibling creation preserves directory identity", async t => {
  const f = await fixture(t), s = spy({ read: async (h, b, o, l, p) => { const r = await h.read(b, o, l, p); await fs.writeFile(f.source + "/sibling", "fictitious", { mode: 0o600 }); return r; } });
  assert.equal((await inspect(f.input, { io: s.io })).state, "matched");
});
for (const stage of ["lstat", "readlink", "open", "stat", "read", "close"]) {
  localTest("A1d sanitized IO failure at " + stage, async t => {
    const f = await fixture(t), hooks = {};
    if (stage === "lstat") hooks.lstat = async () => { throw injectedError("EACCES"); };
    if (stage === "readlink") hooks.readlink = async () => { throw injectedError("EACCES"); };
    if (stage === "open") hooks.openError = injectedError("EACCES");
    if (stage === "stat") hooks.stat = async () => { throw injectedError("EACCES"); };
    if (stage === "read") hooks.read = async () => { throw injectedError("EACCES"); };
    if (stage === "close") hooks.afterClose = async () => { throw injectedError("EACCES"); };
    const s = spy(hooks); blocked(await inspect(f.input, { io: s.io }));
    assert.ok(s.calls.open.length <= 1); assert.equal(s.calls.close, ["stat", "read", "close"].includes(stage) ? 1 : 0);
  });
}
localTest("A1d immutable owned reports never reveal or interpret source text", async t => {
  const bytes = Buffer.from("private-marker\nthrow new Error('never execute');\n"), f = await fixture(t, bytes);
  const input = structuredClone(f.input), result = await inspect(input); assert.equal(result.state, "matched");
  assert.doesNotMatch(JSON.stringify(result), /private-marker|never execute|throw new Error/);
  const check = value => { if (value && typeof value === "object") { assert.equal(Object.isFrozen(value), true); Object.values(value).forEach(check); } };
  check(result); input.descriptor.identity.skillName = "changed"; assert.equal(result.skillName, "demo-skill");
  assert.ok(Buffer.byteLength(JSON.stringify(result)) <= LIMITS.reportBytes);
  assert.throws(() => result.reasons.push("changed"), TypeError);
});
localTest("A1d malformed trusted dependency has sanitized failure", async t => {
  const f = await fixture(t); blocked(await inspect(f.input, null), "MC_SKILL_IO");
});
for (const bad of [Buffer.from([0xff]), Buffer.from([0xc0, 0xaf]), "\ud800", "x".repeat(4097), new Uint16Array([1]), { toString() { throw Error("hook must not execute"); } }]) {
  localTest("A1d invalid/oversized link bytes cannot be silently decoded " + (typeof bad === "string" ? bad.length : typeof bad), async t => {
    const f = await fixture(t), s = spy({ readlink: async () => bad });
    blocked(await inspect(f.input, { io: s.io }), "MC_SKILL_TARGET_UNSAFE"); assert.equal(s.calls.open.length, 0);
  });
}
localTest("A1d native readlink explicitly requests bytes rather than replacement decoding", async t => {
  const f = await fixture(t); const original = fs.readlink; const encodings = [];
  fs.readlink = async (p, options) => { encodings.push(options?.encoding); return original(p, options); };
  let result; try { result = await inspect(f.input); } finally { fs.readlink = original; }
  assert.equal(result.state, "matched"); assert.ok(encodings.length > 1); assert.ok(encodings.every(e => e === "buffer"));
});
localTest("A1d real invalid link bytes cannot impersonate an expected U+FFFD path", async t => {
  const f = await fixture(t), vault = f.root + "/vault \ufffd";
  await fs.rename(f.vault, vault); await fs.unlink(f.target);
  const descriptor = createMemoryConnectionDescriptor({ ...f.input.descriptor.identity,
    vaultPath: vault, manifestPath: vault + "/project-memory.json" });
  const encoded = Buffer.from(descriptor.skill.source), marker = Buffer.from("\ufffd");
  const at = encoded.indexOf(marker); assert.ok(at >= 0);
  const wrongBytes = Buffer.concat([encoded.subarray(0, at), Buffer.from([0xff]), encoded.subarray(at + marker.length)]);
  await fs.symlink(wrongBytes, descriptor.skill.target);
  // This is the misleading value that default replacement decoding would return.
  assert.equal(await fs.readlink(descriptor.skill.target), descriptor.skill.source);
  blocked(await inspect({ ...f.input, descriptor }), "MC_SKILL_TARGET_UNSAFE");
});
localTest("A1d missing destination does not mask a changed source pin", async t => {
  const f = await fixture(t); await fs.unlink(f.target); const actual = f.input.expectedSkillSha256;
  const result = await inspect({ ...f.input, expectedSkillSha256: "0".repeat(64) });
  blocked(result, "MC_SKILL_PIN_MISMATCH"); assert.equal(JSON.stringify(result).includes(actual), false);
});
localTest("A1d directory occupying source SKILL.md is never opened", async t => {
  const f = await fixture(t); await fs.unlink(f.sourceFile); await fs.mkdir(f.sourceFile, { mode: 0o700 });
  const s = spy(); blocked(await inspect(f.input, { io: s.io }), "MC_SKILL_FILE_UNSAFE"); assert.equal(s.calls.open.length, 0);
});
for (const invalidSize of [-1, NaN, 0.5, Infinity]) {
  localTest("A1d malformed file size is bounded before open " + String(invalidSize), async t => {
    const f = await fixture(t), s = spy({ lstat: async p => { const st = await fs.lstat(p); return p === f.sourceFile ? changedStat(st, { size: invalidSize }) : st; } });
    blocked(await inspect(f.input, { io: s.io }), "MC_SKILL_FILE_LIMIT"); assert.equal(s.calls.open.length, 0);
  });
}
localTest("A1d exact hash of binary bytes is not a claim of valid Skill syntax", async t => {
  const bytes = Buffer.from([0xff, 0x00, 0x80]), f = await fixture(t, bytes), result = await inspect(f.input);
  assert.equal(result.state, "matched"); assert.equal(result.sourceSha256, hash(bytes));
  assert.equal(result.facts.skillFormatVerified, false); assert.equal(result.facts.skillLoadedVerified, false);
});
localTest("A1d no home/cwd discovery, readdir, writes, network or client execution", async t => {
  const f = await fixture(t); let calls = 0; const undo = [], forbidden = () => { calls++; throw Error("unexpected capability"); };
  const patch = (obj, key) => { const old = obj[key]; obj[key] = forbidden; undo.push(() => { obj[key] = old; }); };
  let result;
  try {
    patch(os, "homedir"); patch(process, "cwd");
    for (const name of ["readdir", "readFile", "writeFile", "appendFile", "mkdir", "chmod", "rename", "unlink", "rm", "symlink", "realpath"]) patch(fs, name);
    for (const obj of [http, https]) for (const name of ["request", "get"]) patch(obj, name);
    for (const name of ["spawn", "spawnSync", "exec", "execSync", "execFile", "execFileSync", "fork"]) patch(childProcess, name);
    patch(globalThis, "fetch"); result = await inspect(f.input);
  } finally { undo.reverse().forEach(fn => fn()); }
  assert.equal(calls, 0); assert.equal(result.state, "matched");
});
