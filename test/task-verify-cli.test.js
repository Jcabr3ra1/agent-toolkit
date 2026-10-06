import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import childProcess, { spawn } from "node:child_process";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import { fileURLToPath } from "node:url";
import { runTaskCli } from "../src/task-cli.js";
import { verifyLocal, VERIFY_OPEN_FLAGS } from "../src/task-verify-files.js";
import { createTaskVerifier, VERIFY_LIMITS } from "../src/task-verify.js";

const schema = JSON.parse(fsSync.readFileSync(new URL("../schemas/agent-task-verify.schema.json", import.meta.url), "utf8"));
const verifier = createTaskVerifier(schema), bin = fileURLToPath(new URL("../bin/agent-task.js", import.meta.url));
const localTest = (name, fn) => test(name, { skip: !["darwin", "linux"].includes(process.platform) }, fn);
const sha = b => createHash("sha256").update(b).digest("hex");
const TEXT = { guide: "demo guide unchanged\n", v1: "demo readme v1\n", v2: "demo readme v2\n", fresh: "demo new note\n", old: "demo obsolete note\n", proposal: "demo proposal r01\n" };
const ENTRIES = [
  { id: "demo-guide", root: "source", path: "docs/guide.md", operation: "inspect", before: sha(TEXT.guide), after: sha(TEXT.guide) },
  { id: "demo-readme", root: "source", path: "docs/readme.md", operation: "modify", before: sha(TEXT.v1), after: sha(TEXT.v2) },
  { id: "demo-new-note", root: "source", path: "notes/new/note.md", operation: "create", before: null, after: sha(TEXT.fresh) },
  { id: "demo-obsolete", root: "source", path: "docs/obsolete.md", operation: "delete", before: sha(TEXT.old), after: null },
  { id: "demo-proposal", root: "handoff", path: "r01/02-propuesta.md", operation: "inspect", before: sha(TEXT.proposal), after: sha(TEXT.proposal) }];
const contractOf = (entries = ENTRIES) => ({ kind: "agent-task-verify-contract", schemaVersion: "1.0.0",
  identity: { projectId: "demo-project", taskId: "demo-task", revision: "r01" }, scope: "listed-files-only", entries });
const escape = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
function capture() { const out = [], err = []; return { out, err, io: { out: t => out.push(t), err: t => err.push(t) } }; }
async function fixture(t, { entries = ENTRIES } = {}) {
  const base = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "agent-task-verify-test-"))); await fs.chmod(base, 0o700); const owner = await fs.lstat(base);
  t.after(async () => { const s = await fs.lstat(base).catch(() => null); if (s?.isDirectory() && !s.isSymbolicLink() && s.dev === owner.dev && s.ino === owner.ino) await fs.rm(base, { recursive: true }); });
  const roots = { source: path.join(base, "source"), handoff: path.join(base, "handoff") };
  for (const r of Object.values(roots)) { await fs.mkdir(r); await fs.chmod(r, 0o700); }
  const file = (root, rel) => path.join(roots[root], ...rel.split("/"));
  const put = async (root, rel, data, mode = 0o600) => {
    const full = file(root, rel); await fs.mkdir(path.dirname(full), { recursive: true, mode: 0o700 }); await fs.writeFile(full, data); await fs.chmod(full, mode); return full;
  };
  const contractPath = path.join(base, "contract.json");
  const saveContract = async (value, raw) => { const bytes = Buffer.from(raw ?? JSON.stringify(value, null, 2) + "\n"); await fs.writeFile(contractPath, bytes); await fs.chmod(contractPath, 0o600); return sha(bytes); };
  await put("source", "docs/guide.md", TEXT.guide); await put("source", "docs/readme.md", TEXT.v1); await put("source", "docs/obsolete.md", TEXT.old);
  await put("handoff", "r01/02-propuesta.md", TEXT.proposal);
  const pin = await saveContract(contractOf(entries));
  const argv = (phase = "before", extra = [], over = {}) => ["verify", "--contract", over.contract ?? contractPath, "--expect", over.expect ?? pin,
    "--source", over.source ?? roots.source, "--handoff", over.handoff ?? roots.handoff, "--phase", phase, ...extra];
  const toAfter = async () => { await put("source", "docs/readme.md", TEXT.v2); await put("source", "notes/new/note.md", TEXT.fresh); await fs.unlink(file("source", "docs/obsolete.md")); };
  return { base, roots, file, put, contractPath, saveContract, pin, argv, toAfter };
}
// Wraps real read-only fs calls; hooks simulate races, metadata and errors. Reads log requested/returned bytes.
function spyIo(hooks = {}) {
  const log = { lstat: [], open: [], flags: [], reads: [], closes: 0 };
  const io = {
    async lstat(p) {
      log.lstat.push(p); const n = log.lstat.filter(x => x === p).length;
      if (hooks.lstatBefore) await hooks.lstatBefore(p, n);
      const s = await fs.lstat(p); return (hooks.lstat && await hooks.lstat(p, s, n)) || s;
    },
    async open(p, flags) {
      log.open.push(p); log.flags.push(flags); if (hooks.beforeOpen) await hooks.beforeOpen(p);
      const h = await fs.open(p, flags); let reads = 0, stats = 0;
      return { async stat() { const s = await h.stat(); return (hooks.stat && await hooks.stat(p, s, ++stats)) || s; },
        async read(buffer, offset, length, position) {
          const v = await h.read(buffer, offset, length, position); log.reads.push({ path: p, requested: length, bytesRead: v.bytesRead });
          if (hooks.afterRead && reads++ === 0) await hooks.afterRead(p);
          return v;
        },
        async close() { log.closes++; await h.close(); if (hooks.close) await hooks.close(p); } };
    } };
  return { io, log };
}
const readBytes = (log, p) => log.reads.filter(r => r.path === p).reduce((n, r) => n + r.bytesRead, 0);
const requestedBytes = (log, p) => log.reads.filter(r => r.path === p).reduce((n, r) => n + r.requested, 0);
const under = (p, roots) => Object.values(roots).some(r => p === r || p.startsWith(r + path.sep));

for (const args of [["verify", "--help"], ["verify", "-h"]]) test("TV help without IO " + args.join(" "), async () => {
  let calls = 0; const deny = () => { calls++; throw Error("private"); }, c = capture();
  const code = await runTaskCli(args, c.io, { readVerifySchema: deny, readPackagedSchema: deny, fileIo: { lstat: deny, open: deny } });
  assert.equal(code, 0); assert.equal(calls, 0); assert.match(c.out[0], /sin ejecución ni escritura/); assert.match(c.out[0], /--expect/); assert.deepEqual(c.err, []);
});
test("TV general help lists verify and keeps prepare wording", async () => {
  const c = capture(); assert.equal(await runTaskCli(["--help"], c.io), 0);
  assert.match(c.out[0], /sin ejecución/); assert.match(c.out[0], /prepare --task/); assert.match(c.out[0], /verify --contract/);
});
const VALID = ["--contract", "/fictitious/contract.json", "--expect", "a".repeat(64), "--source", "/fictitious/source", "--handoff", "/fictitious/handoff", "--phase", "before"];
const without = flag => { const i = VALID.indexOf(flag); return [...VALID.slice(0, i), ...VALID.slice(i + 2)]; };
for (const args of [[], ...["--contract", "--expect", "--source", "--handoff", "--phase"].map(without), [...VALID, "--contract", "/fictitious/other.json"],
  [...VALID, "--json", "--json"], [...VALID, "--apply"], [...VALID, "--approve"], [...VALID, "--run"], [...VALID, "--force"], [...VALID, "--fix"],
  [...VALID, "--output", "/fictitious/out"], [...VALID, "--observations", "/fictitious/o.json"], [...VALID, "--show-brief"], [...VALID, "positional"],
  ["--help", ...VALID], [...VALID.slice(0, 9), "during"], [...VALID.slice(0, 3), "A".repeat(64), ...VALID.slice(4)], [...VALID.slice(0, 3), "a".repeat(63), ...VALID.slice(4)],
  ["--contract=/fictitious/contract.json", ...VALID.slice(2)], ["-c", ...VALID.slice(1)], ["--contract", "--json", ...VALID.slice(2)]])
  test("TV invalid verify arguments reject before IO " + JSON.stringify(args).slice(0, 90), async () => {
    let calls = 0; const deny = () => { calls++; throw Error("private"); }, c = capture();
    assert.equal(await runTaskCli(["verify", ...args], c.io, { readVerifySchema: deny, fileIo: { lstat: deny, open: deny } }), 2);
    assert.equal(calls, 0); assert.deepEqual(c.out, []); assert.deepEqual(c.err, ["agent-task: verify-invalid-option\n"]);
  });
localTest("TV before/after matched for inspect/modify/create/delete without writing or touching unlisted files", async t => {
  const f = await fixture(t); await f.put("source", ".git/HEAD", "ref: demo\n"); await f.put("source", "docs/unlisted.md", "private-sentinel\n");
  const snapshot = async () => {
    const out = {};
    for (const r of Object.values(f.roots)) for (const e of await fs.readdir(r, { recursive: true })) {
      const full = path.join(r, e), s = await fs.lstat(full); out[full] = s.isFile() ? sha(await fs.readFile(full)) + ":" + s.mtimeMs + ":" + s.mode : "dir:" + s.mode;
    }
    return out;
  };
  for (const phase of ["before", "after"]) {
    if (phase === "after") await f.toAfter();
    const before = await snapshot(), spy = spyIo(), c = capture();
    assert.equal(await runTaskCli(f.argv(phase, ["--json"]), c.io, { fileIo: spy.io }), 0);
    const r = JSON.parse(c.out[0]);
    assert.equal(r.state, "matched"); assert.equal(r.provenance, "local-read"); assert.equal(r.phase, phase);
    assert.equal(r.audit.contractByteSha256, f.pin); assert.equal(r.audit.expectedPinSha256, f.pin);
    assert.equal(r.humanReviewRequired, true); assert.equal(r.approvalGranted, false); assert.equal(r.unlistedChangesVerified, false);
    assert.deepEqual(await snapshot(), before); assert.equal(spy.log.open.length, spy.log.closes);
    assert.deepEqual(spy.log.open, [f.contractPath, ...ENTRIES.filter(e => e[phase] !== null).map(e => f.file(e.root, e.path))]);
    assert.ok(spy.log.flags.every(x => x === VERIFY_OPEN_FLAGS));
    for (const p of spy.log.open) { const size = (await fs.lstat(p)).size; assert.equal(readBytes(spy.log, p), size); assert.equal(requestedBytes(spy.log, p), size); }
    assert.ok(spy.log.reads.every(r => r.requested > 0 && r.requested <= VERIFY_LIMITS.chunkBytes));
    assert.ok([...spy.log.lstat, ...spy.log.open].every(p => !/\.git|unlisted/.test(p)));
    assert.doesNotMatch(c.out[0] + c.err.join(""), new RegExp(escape(f.base)));
  }
});
for (const kind of ["hash-differs", "missing", "unexpected-present"]) localTest("TV " + kind + " is mismatched with exit 1; unexpected files are not opened", async t => {
  const f = await fixture(t);
  if (kind === "hash-differs") await f.put("source", "docs/readme.md", "demo readme tampered private-sentinel\n");
  if (kind === "missing") await fs.unlink(f.file("source", "docs/guide.md"));
  if (kind === "unexpected-present") await f.put("source", "notes/new/note.md", "private-sentinel\n");
  const spy = spyIo(), c = capture(); assert.equal(await runTaskCli(f.argv("before"), c.io, { fileIo: spy.io }), 1);
  assert.match(c.out[0], /^agent-task verify: mismatched/); assert.match(c.out[0], new RegExp(kind)); assert.match(c.out[0], /Revisión humana requerida/);
  assert.doesNotMatch(c.out[0], /private-sentinel/); assert.ok(!spy.log.open.includes(f.file("source", "notes/new/note.md")));
});
localTest("TV phase is explicit: after-state checked as before is mismatched, never reinterpreted", async t => {
  const f = await fixture(t); await f.toAfter(); const c = capture();
  assert.equal(await runTaskCli(f.argv("before", ["--json"]), c.io), 1);
  const r = JSON.parse(c.out[0]);
  assert.deepEqual(r.results.filter(x => !x.outcome.startsWith("matched")).map(x => x.id).sort(), ["demo-new-note", "demo-obsolete", "demo-readme"]);
});
for (const kind of ["pin", "format", "duplicate-key", "invalid-contract", "collision", "utf8"]) localTest("TV " + kind + " stops before reading roots or entries", async t => {
  const f = await fixture(t); let expect = f.pin;
  if (kind === "pin") expect = "0".repeat(64);
  if (kind === "format") expect = await f.saveContract(null, "{");
  if (kind === "duplicate-key") expect = await f.saveContract(null, '{"kind":"agent-task-verify-contract","kind":"x"}');
  if (kind === "invalid-contract") expect = await f.saveContract({ ...contractOf(), scope: "complete-tree" });
  if (kind === "collision") expect = await f.saveContract(contractOf([ENTRIES[0], { ...ENTRIES[1], path: "DOCS/GUIDE.md" }]));
  if (kind === "utf8") expect = await f.saveContract(null, Buffer.from([0x7b, 0xff, 0x7d]));
  const spy = spyIo(), c = capture(); assert.equal(await runTaskCli(f.argv("before", ["--json"], { expect }), c.io, { fileIo: spy.io }), 2);
  const r = JSON.parse(c.out[0]); assert.equal(r.state, kind === "pin" ? "blocked" : "invalid"); assert.deepEqual(r.results, []);
  assert.equal(r.reasons[0], { pin: "verify-pin-mismatch", format: "verify-contract-format", "duplicate-key": "verify-contract-format",
    "invalid-contract": "verify-contract-invalid", collision: "verify-path-collision", utf8: "verify-contract-format" }[kind]);
  assert.ok([...spy.log.lstat, ...spy.log.open].every(p => !under(p, f.roots))); assert.deepEqual(spy.log.open, [f.contractPath]);
  if (kind === "pin") { assert.equal(r.audit.contractByteSha256, null); assert.doesNotMatch(c.out[0], new RegExp(f.pin)); }
});
for (const kind of ["symlink", "hardlink", "mode", "missing", "directory", "oversize", "empty", "credential-path", "git-path", "foreign-owner"])
  localTest("TV unsafe contract " + kind + " is blocked before roots", async t => {
    const f = await fixture(t); let contract = f.contractPath, expect = f.pin; const hooks = {};
    if (kind === "symlink") { contract = path.join(f.base, "alias.json"); await fs.symlink(f.contractPath, contract); }
    if (kind === "hardlink") await fs.link(f.contractPath, path.join(f.base, "copy.json"));
    if (kind === "mode") await fs.chmod(f.contractPath, 0o666);
    if (kind === "missing") await fs.unlink(f.contractPath);
    if (kind === "directory") { await fs.unlink(f.contractPath); await fs.mkdir(f.contractPath); }
    if (kind === "oversize") expect = await f.saveContract(null, JSON.stringify(contractOf()) + " ".repeat(VERIFY_LIMITS.contractBytes));
    if (kind === "empty") expect = await f.saveContract(null, "");
    if (kind === "credential-path") { contract = path.join(f.base, ".credentials.json"); await fs.copyFile(f.contractPath, contract); }
    if (kind === "git-path") { contract = path.join(f.base, ".git", "contract.json"); await fs.mkdir(path.dirname(contract)); await fs.copyFile(f.contractPath, contract); }
    if (kind === "foreign-owner") hooks.lstat = (p, s) => { if (p === f.contractPath) s.uid++; return s; };
    const spy = spyIo(hooks), c = capture();
    assert.equal(await runTaskCli(f.argv("before", ["--json"], { contract, expect }), c.io, { fileIo: spy.io }), 2);
    const r = JSON.parse(c.out[0]); assert.equal(r.state, "blocked"); assert.equal(r.provenance, "none");
    assert.ok([...spy.log.lstat, ...spy.log.open].every(p => !under(p, f.roots)));
    if (["credential-path", "git-path"].includes(kind)) assert.equal(spy.log.lstat.length, 0);
    assert.doesNotMatch(c.out[0] + c.err.join(""), /agent-task-verify-test|private/);
  });
for (const kind of ["same", "nested", "parent", "handoff-mode", "source-group-write", "symlink-root", "ancestor-symlink", "relative", "trailing-slash",
  "filesystem-root", "home", "git-component", "missing", "file", "foreign-owner", "same-identity"])
  localTest("TV unsafe root " + kind + " is blocked and opens no entry", async t => {
    const f = await fixture(t); const over = {}, hooks = {}, deps = {};
    if (kind === "same") over.handoff = f.roots.source;
    if (kind === "nested") { over.handoff = path.join(f.roots.source, "private"); await fs.mkdir(over.handoff, { mode: 0o700 }); }
    if (kind === "parent") over.source = f.base;
    if (kind === "handoff-mode") await fs.chmod(f.roots.handoff, 0o750);
    if (kind === "source-group-write") await fs.chmod(f.roots.source, 0o770);
    if (kind === "symlink-root") { over.source = path.join(f.base, "alias"); await fs.symlink(f.roots.source, over.source); }
    if (kind === "ancestor-symlink") { const link = path.join(f.base, "link"); await fs.symlink(f.base, link); over.source = path.join(link, "source"); }
    if (kind === "relative") over.source = "source";
    if (kind === "trailing-slash") over.source = f.roots.source + "/";
    if (kind === "filesystem-root") over.source = "/";
    if (kind === "home") deps.home = f.roots.source;
    if (kind === "git-component") { over.source = path.join(f.base, ".git"); await fs.mkdir(over.source, { mode: 0o700 }); }
    if (kind === "missing") over.source = path.join(f.base, "absent");
    if (kind === "file") over.source = f.contractPath;
    if (kind === "foreign-owner") hooks.lstat = (p, s) => { if (p === f.roots.source) s.uid++; return s; };
    if (kind === "same-identity") hooks.lstat = async p => p === f.roots.handoff ? fs.lstat(f.roots.source) : undefined;
    const spy = spyIo(hooks), c = capture();
    assert.equal(await runTaskCli(f.argv("before", [], over), c.io, { fileIo: spy.io, ...deps }), 2);
    assert.match(c.out[0], /^agent-task verify: blocked/); assert.match(c.out[0], /verify-root-(unsafe|unreadable|overlap)/);
    assert.ok(spy.log.open.every(p => p === f.contractPath)); assert.doesNotMatch(c.out[0] + c.err.join(""), /agent-task-verify-test/);
  });
for (const special of [0o1000, 0o2000, 0o4000]) localTest(`TV handoff ${(0o700 | special).toString(8)} (simulated metadata) is not exactly 0700`, async t => {
  const f = await fixture(t);
  const spy = spyIo({ lstat: (p, s) => { if (p === f.roots.handoff) s.mode = (s.mode & ~0o7777) | 0o700 | special; return s; } }), c = capture();
  assert.equal(await runTaskCli(f.argv("before", ["--json"]), c.io, { fileIo: spy.io }), 2);
  const r = JSON.parse(c.out[0]); assert.equal(r.state, "blocked"); assert.deepEqual(r.reasons, ["verify-root-unsafe"]);
  assert.ok(spy.log.open.every(p => p === f.contractPath));
});
localTest("TV handoff with a real sticky bit (1700) is rejected when the OS keeps that bit", async t => {
  const f = await fixture(t); await fs.chmod(f.roots.handoff, 0o1700);
  const kept = ((await fs.lstat(f.roots.handoff)).mode & 0o7777) === 0o1700;
  if (!kept) { t.skip("el SO no conservó 1700 con chmod; cubierto por la prueba de metadata simulada"); return; }
  const c = capture(); assert.equal(await runTaskCli(f.argv("before", ["--json"]), c.io), 2);
  assert.deepEqual(JSON.parse(c.out[0]).reasons, ["verify-root-unsafe"]);
});
for (const kind of ["symlink", "symlink-dir", "hardlink", "group-write", "setuid", "directory", "fifo", "foreign-owner", "dir-group-write", "dir-is-file", "symlink-where-absent"])
  localTest("TV unsafe entry " + kind + " blocks without opening the unsafe resource", async t => {
    const f = await fixture(t); const target = f.file("source", "docs/readme.md"), hooks = {};
    if (kind === "symlink") { await fs.rename(target, target + ".real"); await fs.symlink(target + ".real", target); }
    if (kind === "symlink-dir") { await fs.rename(f.file("source", "docs"), f.file("source", "real-docs")); await fs.symlink(f.file("source", "real-docs"), f.file("source", "docs")); }
    if (kind === "hardlink") await fs.link(target, f.file("source", "docs/copy.md"));
    if (kind === "group-write") await fs.chmod(target, 0o620);
    if (kind === "setuid") hooks.lstat = (p, s) => { if (p === target) s.mode |= 0o4000; return s; };
    if (kind === "directory") { await fs.unlink(target); await fs.mkdir(target); }
    if (kind === "fifo") hooks.lstat = (p, s) => { if (p === target) { s.isFile = () => false; s.isFIFO = () => true; } return s; };
    if (kind === "foreign-owner") hooks.lstat = (p, s) => { if (p === target) s.uid++; return s; };
    if (kind === "dir-group-write") await fs.chmod(f.file("source", "docs"), 0o770);
    if (kind === "dir-is-file") { await fs.mkdir(f.file("source", "notes"), { mode: 0o700 }); await fs.writeFile(f.file("source", "notes/new"), "x"); }
    if (kind === "symlink-where-absent") { await fs.mkdir(f.file("source", "notes/new"), { recursive: true, mode: 0o700 }); await fs.symlink(f.file("source", "docs/guide.md"), f.file("source", "notes/new/note.md")); }
    const spy = spyIo(hooks), c = capture(); assert.equal(await runTaskCli(f.argv("before", ["--json"]), c.io, { fileIo: spy.io }), 2);
    const r = JSON.parse(c.out[0]); assert.equal(r.state, "blocked"); assert.deepEqual(r.reasons, ["verify-entry-unsafe"]); assert.deepEqual(r.results, []);
    // Only the concrete unsafe resource of each scenario is forbidden; earlier safe entries may be read legitimately.
    const docs = f.file("source", "docs"), notes = f.file("source", "notes");
    const unsafe = { symlink: [target], "symlink-dir": [docs, f.file("source", "real-docs")], hardlink: [target, f.file("source", "docs/copy.md")],
      "group-write": [target], setuid: [target], directory: [target], fifo: [target], "foreign-owner": [target], "dir-group-write": [docs],
      "dir-is-file": [notes], "symlink-where-absent": [f.file("source", "notes/new/note.md")] }[kind];
    assert.ok(!spy.log.open.some(p => unsafe.some(u => p === u || p.startsWith(u + path.sep) || p.startsWith(u + "."))));
    assert.ok(spy.log.open.every(p => p === f.contractPath || ENTRIES.some(e => f.file(e.root, e.path) === p)));
    assert.equal(spy.log.open.length, spy.log.closes);
  });
localTest("TV missing intermediate directories are a safe observed absence", async t => {
  const f = await fixture(t); const spy = spyIo(), c = capture();
  assert.equal(await runTaskCli(f.argv("before", ["--json"]), c.io, { fileIo: spy.io }), 0);
  assert.equal(JSON.parse(c.out[0]).results.find(x => x.id === "demo-new-note").outcome, "matched-absent");
  assert.ok(spy.log.lstat.includes(f.file("source", "notes"))); assert.ok(!spy.log.lstat.includes(f.file("source", "notes/new")));
});
for (const code of ["EACCES", "EPERM", "EIO", "ENOTDIR", "ELOOP", null]) for (const where of ["final", "intermediate"])
  localTest(`TV ${code ?? "generic error"} on ${where} component is never absence`, async t => {
    const f = await fixture(t); await f.put("source", "notes/new/keep.md", "x");
    const target = where === "final" ? f.file("source", "notes/new/note.md") : f.file("source", "notes");
    const spy = spyIo({ lstatBefore(p) { if (p === target) throw Object.assign(new Error("private-sentinel"), code ? { code } : {}); } }), c = capture();
    assert.equal(await runTaskCli(f.argv("before", ["--json"]), c.io, { fileIo: spy.io }), 2);
    const r = JSON.parse(c.out[0]); assert.equal(r.state, "blocked"); assert.deepEqual(r.reasons, ["verify-entry-unreadable"]);
    assert.doesNotMatch(c.out[0] + c.err.join(""), /private-sentinel/);
  });
for (const [code, reason] of [["EACCES", "verify-entry-unreadable"], ["ELOOP", "verify-entry-unsafe"]]) localTest(`TV open ${code} blocks as ${reason}`, async t => {
  const f = await fixture(t); const target = f.file("source", "docs/readme.md"), c = capture();
  const spy = spyIo({ beforeOpen(p) { if (p === target) throw Object.assign(new Error("private-sentinel"), { code }); } });
  assert.equal(await runTaskCli(f.argv("before", ["--json"]), c.io, { fileIo: spy.io }), 2); assert.deepEqual(JSON.parse(c.out[0]).reasons, [reason]);
});
for (const kind of ["before-open", "handle-stat", "after-read", "truncate-during-read", "named-after-read", "close-error", "dir-swapped", "root-changed"])
  localTest("TV change during " + kind + " blocks; every descriptor closes", async t => {
    const f = await fixture(t); const target = f.file("source", "docs/readme.md"), hooks = {};
    if (kind === "before-open") hooks.beforeOpen = p => p === target && fs.appendFile(p, "x");
    if (kind === "handle-stat") hooks.stat = (p, s) => { if (p === target) s.ino++; return s; };
    if (kind === "after-read") hooks.afterRead = p => p === target && fs.appendFile(p, "x");
    if (kind === "truncate-during-read") hooks.afterRead = p => p === target && fs.truncate(p, 1);
    if (kind === "named-after-read") hooks.lstat = (p, s, n) => { if (p === target && n === 2) s.mtimeMs++; return s; };
    if (kind === "close-error") hooks.close = p => { if (p === target) throw Error("private-sentinel"); };
    if (kind === "dir-swapped") hooks.lstat = (p, s, n) => { if (p === f.file("source", "docs") && n === 2) s.ino++; return s; };
    if (kind === "root-changed") hooks.lstat = (p, s, n) => { if (p === f.roots.source && n === 2) s.ino++; return s; };
    const expected = { "close-error": "verify-entry-unreadable", "root-changed": "verify-root-changed" }[kind] ?? "verify-entry-changed";
    const spy = spyIo(hooks), c = capture(); assert.equal(await runTaskCli(f.argv("before", ["--json"]), c.io, { fileIo: spy.io }), 2);
    const r = JSON.parse(c.out[0]); assert.deepEqual(r.reasons, [expected]); assert.deepEqual(r.results, []);
    assert.equal(spy.log.open.length, spy.log.closes); assert.doesNotMatch(c.out[0] + c.err.join(""), /private-sentinel/);
    assert.ok(readBytes(spy.log, target) <= Buffer.byteLength(TEXT.v1)); assert.ok(requestedBytes(spy.log, target) <= Buffer.byteLength(TEXT.v1));
  });
localTest("TV empty file, exact 8 MiB files and 32 MiB total are accepted; one more byte blocks before open", async t => {
  const big = Buffer.alloc(VERIFY_LIMITS.fileBytes, 97);
  const entries = [0, 1, 2, 3].map(i => ({ id: "demo-big-" + i, root: "source", path: `big/${i}.bin`, operation: "inspect", before: sha(big), after: sha(big) }));
  const empty = { id: "demo-empty", root: "source", path: "docs/empty.md", operation: "inspect", before: sha(""), after: sha("") };
  const f = await fixture(t, { entries: [...entries, empty] });
  for (let i = 0; i < 4; i++) await f.put("source", `big/${i}.bin`, big);
  await f.put("source", "docs/empty.md", "");
  let c = capture(); assert.equal(await runTaskCli(f.argv("before"), c.io), 0);
  const extra = { id: "demo-extra", root: "source", path: "docs/extra.md", operation: "inspect", before: sha("x"), after: sha("x") };
  await f.put("source", "docs/extra.md", "x"); const expect = await f.saveContract(contractOf([...entries, empty, extra]));
  const spy = spyIo(); c = capture(); assert.equal(await runTaskCli(f.argv("before", ["--json"], { expect }), c.io, { fileIo: spy.io }), 2);
  assert.deepEqual(JSON.parse(c.out[0]).reasons, ["verify-total-limit"]); assert.ok(!spy.log.open.includes(f.file("source", "docs/extra.md")));
  await f.put("source", "big/0.bin", Buffer.concat([big, Buffer.from("a")]));
  const spy2 = spyIo(); c = capture(); assert.equal(await runTaskCli(f.argv("before", ["--json"], { expect }), c.io, { fileIo: spy2.io }), 2);
  assert.deepEqual(JSON.parse(c.out[0]).reasons, ["verify-file-limit"]); assert.ok(!spy2.log.open.includes(f.file("source", "big/0.bin")));
});
localTest("TV growth at the 8 MiB cap near the 32 MiB total never reads past the pinned size or budget", async t => {
  const big = Buffer.alloc(VERIFY_LIMITS.fileBytes, 97);
  const entries = [0, 1, 2, 3].map(i => ({ id: "demo-big-" + i, root: "source", path: `big/${i}.bin`, operation: "inspect", before: sha(big), after: sha(big) }));
  const f = await fixture(t, { entries }); for (let i = 0; i < 4; i++) await f.put("source", `big/${i}.bin`, big);
  const last = f.file("source", "big/3.bin");
  // Grows by one chunk after the descriptor stat and before the first read of the last file.
  const spy = spyIo({ async stat(p, s, n) { if (p === last && n === 1) await fs.appendFile(p, Buffer.alloc(VERIFY_LIMITS.chunkBytes, 98)); return s; } }), c = capture();
  assert.equal(await runTaskCli(f.argv("before", ["--json"]), c.io, { fileIo: spy.io }), 2);
  assert.deepEqual(JSON.parse(c.out[0]).reasons, ["verify-entry-changed"]);
  assert.equal(readBytes(spy.log, last), VERIFY_LIMITS.fileBytes); assert.ok(requestedBytes(spy.log, last) <= VERIFY_LIMITS.fileBytes);
  const entryReads = spy.log.reads.filter(r => r.path !== f.contractPath);
  assert.equal(entryReads.reduce((n, r) => n + r.bytesRead, 0), VERIFY_LIMITS.totalBytes);
  assert.ok(entryReads.reduce((n, r) => n + r.requested, 0) <= VERIFY_LIMITS.totalBytes);
  assert.ok(spy.log.reads.every(r => r.requested > 0 && r.requested <= VERIFY_LIMITS.chunkBytes));
  assert.equal(spy.log.open.length, spy.log.closes);
});
localTest("TV empty file is matched with zero read requests and blocked if it grows during observation", async t => {
  const empty = { id: "demo-empty", root: "source", path: "docs/empty.md", operation: "inspect", before: sha(""), after: sha("") };
  const f = await fixture(t, { entries: [empty] }); const target = await f.put("source", "docs/empty.md", "");
  let spy = spyIo(), c = capture();
  assert.equal(await runTaskCli(f.argv("before"), c.io, { fileIo: spy.io }), 0); assert.equal(spy.log.reads.filter(r => r.path === target).length, 0);
  spy = spyIo({ async stat(p, s, n) { if (p === target && n === 1) await fs.appendFile(p, "x"); return s; } }); c = capture();
  assert.equal(await runTaskCli(f.argv("before", ["--json"]), c.io, { fileIo: spy.io }), 2);
  assert.deepEqual(JSON.parse(c.out[0]).reasons, ["verify-entry-changed"]); assert.equal(spy.log.reads.filter(r => r.path === target).length, 0);
  assert.equal(spy.log.open.length, spy.log.closes);
});
localTest("TV contract exactly at 512 KiB is read within its cap; one byte more is refused before open; growth is changed", async t => {
  const f = await fixture(t), body = JSON.stringify(contractOf());
  const raw = body + " ".repeat(VERIFY_LIMITS.contractBytes - Buffer.byteLength(body));
  let expect = await f.saveContract(null, raw), spy = spyIo(), c = capture();
  assert.equal(await runTaskCli(f.argv("before", [], { expect }), c.io, { fileIo: spy.io }), 0);
  assert.equal(readBytes(spy.log, f.contractPath), VERIFY_LIMITS.contractBytes); assert.equal(requestedBytes(spy.log, f.contractPath), VERIFY_LIMITS.contractBytes);
  assert.ok(spy.log.reads.every(r => r.requested > 0 && r.requested <= VERIFY_LIMITS.chunkBytes));
  expect = await f.saveContract(null, raw + " "); spy = spyIo(); c = capture();
  assert.equal(await runTaskCli(f.argv("before", ["--json"], { expect }), c.io, { fileIo: spy.io }), 2);
  assert.deepEqual(JSON.parse(c.out[0]).reasons, ["verify-contract-limit"]); assert.deepEqual(spy.log.open, []);
  expect = await f.saveContract(null, raw);
  spy = spyIo({ async stat(p, s, n) { if (p === f.contractPath && n === 1) await fs.appendFile(p, " "); return s; } }); c = capture();
  assert.equal(await runTaskCli(f.argv("before", ["--json"], { expect }), c.io, { fileIo: spy.io }), 2);
  assert.deepEqual(JSON.parse(c.out[0]).reasons, ["verify-contract-changed"]);
  assert.ok(readBytes(spy.log, f.contractPath) <= VERIFY_LIMITS.contractBytes); assert.ok([...spy.log.lstat, ...spy.log.open].every(p => !under(p, f.roots)));
});
for (const where of ["source", "handoff"]) localTest(`TV contract inside ${where}: before the pin only its own components and bytes are touched`, async t => {
  const f = await fixture(t), inner = f.file(where, "lote/contract.json");
  await fs.mkdir(path.dirname(inner), { mode: 0o700 }); await fs.copyFile(f.contractPath, inner); await fs.chmod(inner, 0o600);
  const allowed = new Set([f.roots[where], path.dirname(inner), inner]);
  const spy = spyIo(), c = capture();
  assert.equal(await runTaskCli(f.argv("before", ["--json"], { contract: inner, expect: "0".repeat(64) }), c.io, { fileIo: spy.io }), 2);
  const r = JSON.parse(c.out[0]); assert.deepEqual(r.reasons, ["verify-pin-mismatch"]); assert.equal(r.audit.contractByteSha256, null);
  assert.doesNotMatch(c.out[0], new RegExp(f.pin)); assert.deepEqual(spy.log.open, [inner]);
  assert.ok(spy.log.lstat.filter(p => under(p, f.roots)).every(p => allowed.has(p)));
  const ok = capture(); assert.equal(await runTaskCli(f.argv("before", ["--json"], { contract: inner }), ok.io), 0);
});
localTest("TV contract that is also a listed entry is read once before the pin and observed as an entry only after it", async t => {
  const other = sha("not this contract\n");
  const entries = [...ENTRIES, { id: "demo-contract", root: "handoff", path: "r01/contract.json", operation: "inspect", before: other, after: other }];
  const f = await fixture(t, { entries }), inner = f.file("handoff", "r01/contract.json");
  await fs.copyFile(f.contractPath, inner); await fs.chmod(inner, 0o600);
  let spy = spyIo(), c = capture();
  assert.equal(await runTaskCli(f.argv("before", ["--json"], { contract: inner, expect: "0".repeat(64) }), c.io, { fileIo: spy.io }), 2);
  assert.deepEqual(spy.log.open, [inner]); assert.doesNotMatch(c.out[0], new RegExp(f.pin)); assert.equal(JSON.parse(c.out[0]).audit.contractByteSha256, null);
  spy = spyIo(); c = capture();
  // This inspect fixture expects the hash of other bytes, so observing this contract yields hash-differs.
  assert.equal(await runTaskCli(f.argv("before", ["--json"], { contract: inner }), c.io, { fileIo: spy.io }), 1);
  const self = JSON.parse(c.out[0]).results.find(x => x.id === "demo-contract");
  assert.equal(self.outcome, "hash-differs"); assert.equal(self.observed, f.pin);
  assert.equal(spy.log.open[0], inner); assert.equal(spy.log.open.filter(p => p === inner).length, 2);
});
localTest("TV output, schema and pipe failures are redacted and never retried", async t => {
  const f = await fixture(t); let outputs = 0; const err = [];
  assert.equal(await runTaskCli(f.argv("before"), { out() { outputs++; throw Error("private-sentinel"); }, err: s => err.push(s) }), 2);
  assert.equal(outputs, 1); assert.deepEqual(err, ["agent-task: verify-output-failed\n"]);
  const c = capture(); assert.equal(await runTaskCli(f.argv("before"), c.io, { readVerifySchema() { throw Error("private-sentinel"); } }), 2);
  assert.deepEqual(c.out, []); assert.deepEqual(c.err, ["agent-task: verify-preparation-failed\n"]);
  const child = spawn(process.execPath, [bin, ...f.argv("before")], { stdio: ["ignore", "pipe", "pipe"] }); child.stdout.destroy();
  let text = ""; child.stderr.on("data", b => { text += b; });
  assert.equal(await new Promise(resolve => child.on("close", resolve)), 2); assert.equal(text, "agent-task: verify-output-failed\n");
});
localTest("TV local bin returns 0/1 for matched/mismatched using only fictitious fixtures", async t => {
  const f = await fixture(t);
  const runBin = args => new Promise(resolve => {
    const c = spawn(process.execPath, [bin, ...args], { stdio: ["ignore", "pipe", "pipe"] }); let out = "", err = "";
    c.stdout.on("data", b => { out += b; }); c.stderr.on("data", b => { err += b; }); c.on("close", code => resolve({ code, out, err }));
  });
  let r = await runBin(f.argv("before", ["--json"])); assert.equal(r.code, 0); assert.equal(JSON.parse(r.out).state, "matched"); assert.equal(r.err, "");
  r = await runBin(f.argv("after", ["--json"])); assert.equal(r.code, 1); assert.equal(JSON.parse(r.out).state, "mismatched");
});
localTest("TV verify never reads selector/model schemas or prepare inputs", async t => {
  const f = await fixture(t), seen = [], c = capture(); let prepareReads = 0;
  const code = await runTaskCli(f.argv("before"), c.io, { readPackagedSchema() { prepareReads++; throw Error(); }, readVerifySchema: p => { seen.push(path.basename(p)); return fs.readFile(p); } });
  assert.equal(code, 0); assert.equal(prepareReads, 0); assert.deepEqual(seen, ["agent-task-verify.schema.json"]);
});
localTest("TV collector runs no commands, network or write APIs, even with script-like listed files", async t => {
  const script = "#!/bin/sh\necho private-sentinel > hacked\n";
  const f = await fixture(t, { entries: [{ id: "demo-script", root: "source", path: "tools/run.sh", operation: "inspect", before: sha(script), after: sha(script) }] });
  await f.put("source", "tools/run.sh", script, 0o700);
  const replace = [], deny = () => { throw Error("Unexpected effect"); }, patch = (o, k) => { const old = o[k]; replace.push(() => { o[k] = old; }); o[k] = deny; };
  let report;
  try {
    for (const [o, ks] of [[childProcess, ["spawn", "exec", "execFile", "fork", "spawnSync", "execSync", "execFileSync"]], [http, ["request", "get"]], [https, ["request", "get"]],
      [net, ["connect", "createConnection"]], [fs, ["writeFile", "appendFile", "mkdir", "rm", "rmdir", "unlink", "rename", "chmod", "chown", "copyFile", "symlink", "link", "truncate", "utimes"]]])
      for (const k of ks) patch(o, k);
    report = await verifyLocal({ contract: f.contractPath, expect: f.pin, source: f.roots.source, handoff: f.roots.handoff, phase: "before" }, f.base, verifier);
  } finally { replace.reverse().forEach(r => r()); }
  assert.equal(report.state, "matched"); assert.equal(report.executed, false); await assert.rejects(fs.lstat(path.join(f.roots.source, "tools", "hacked")));
});
localTest("TV relative contract resolves only against the explicit cwd", async t => {
  const f = await fixture(t), c = capture(); assert.equal(await runTaskCli(f.argv("before", [], { contract: "contract.json" }), c.io, { cwd: f.base }), 0);
});
test("TV unsupported platform blocks before reading anything", async () => {
  let calls = 0; const deny = () => { calls++; throw Error(); };
  const r = await verifyLocal({ contract: "/fictitious/c.json", expect: "a".repeat(64), source: "/fictitious/s", handoff: "/fictitious/h", phase: "before" },
    "/fictitious", verifier, { platform: "win32", io: { lstat: deny, open: deny } });
  assert.equal(r.state, "blocked"); assert.deepEqual(r.reasons, ["verify-platform-unsupported"]); assert.equal(calls, 0);
});
