import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import childProcess from "node:child_process";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import { createSelectiveConfigParser, SELECTORS } from "../src/client-selective-config.js";
import { createSelectiveFileReader, createSelectiveReadPermit, revokeSelectiveReadPermit } from "../src/client-selective-files.js";
import { createNativeAccessPermit } from "../src/client-native-access.js";

const schema = JSON.parse(await fs.readFile(new URL("../schemas/agent-client-selective-config.schema.json", import.meta.url), "utf8"));
const limits = () => ({ maxBytes: 1048576, blockBytes: 4096, maxDepth: 32, maxNodes: 20000, maxKeyBytes: 256, maxKeys: 4096 });
function parse(text, source = "personal-settings", overrides = {}, block = 4096) {
  const p = createSelectiveConfigParser(schema, source, { ...limits(), ...overrides });
  const b = Buffer.isBuffer(text) ? text : Buffer.from(text);
  for (let i = 0; i < b.length; i += block) p.push(b.subarray(i, i + block));
  return p.finish();
}
const safe = r => {
  assert.equal(r.runtimeReady, false); assert.equal(r.verifiedAdmission, false); assert.equal(r.inferenceRequested, false);
  assert.equal(r.nativeExecuted, false); assert.equal(r.externalBillingVerified, false); assert.equal(r.effectiveControlsVerified, false);
  assert.doesNotMatch(JSON.stringify(r), /synthetic-secret|private@example|do-not-execute|\/Users\/|token-[A-Za-z]/);
  return r;
};
const field = (r, name) => r.fields.find(f => f.name === name);

test("SC parser returns only four selectors and distinguishes syntax from IO", () => {
  const r = safe(parse('{"hooks":{},"apiKeyHelper":"do-not-execute synthetic-secret","disableAllHooks":true,"token":"synthetic-secret"}'));
  assert.equal(r.state, "observed"); assert.equal(r.provenance, "provided-bytes-structure");
  assert.equal(field(r, "hooks").empty, true); assert.equal(field(r, "apiKeyHelper").empty, false);
  assert.equal(field(r, "disableAllHooks").booleanValue, true);
  assert.equal(r.stats.retainedRawBytes, 0); assert.equal(r.stats.retainedValueTextBytes, 0);
  const global = safe(parse('{"mcpServers":{"server":{"url":"synthetic-secret","headers":{"token":"synthetic-secret"}}},"oauth":{"token":"synthetic-secret"}}', "global-state"));
  assert.deepEqual(global.fields.map(f => f.name), ["mcpServers"]); assert.equal(field(global, "mcpServers").empty, false);
});
test("SC every byte split preserves escaped names, Unicode and discarded payloads", () => {
  const b = Buffer.from('{"h\\u006foks":{"custom":[{"command":"synthetic-secret á🐣 \\\" } ["}]},"apiKeyHelper":"\\ud83d\\udc23","disableAllHooks":false,"unrelated":{"disableAllHooks":true}}');
  const expected = parse(b);
  assert.equal(expected.state, "observed");
  for (let n = 0; n <= b.length; n++) {
    const p = createSelectiveConfigParser(schema, "personal-settings", limits());
    p.push(b.subarray(0, n)); p.push(b.subarray(n)); assert.deepEqual(p.finish(), expected);
  }
  assert.deepEqual(parse(b, "personal-settings", {}, 1), expected);
});
for (const [value, type, empty, booleanValue] of [
  ['""', "string", true, null], ['" "', "string", false, null], ["{}", "object", true, null],
  ["[]", "array", true, null], ["[1]", "array", false, null], ['{"x":null}', "object", false, null],
  ["0", "number", null, null], ["-1.2e+30", "number", null, null], ["1e999", "number", null, null],
  ["null", "null", null, null], ["true", "boolean", null, true], ["false", "boolean", null, false]
]) test("SC selected values are structural, not decoded: " + type + " " + value.length, () => {
  const r = safe(parse('{"disableAllHooks":' + value + '}')); assert.equal(r.state, "observed");
  assert.deepEqual(field(r, "disableAllHooks"), { name: "disableAllHooks", present: true, type, empty, booleanValue });
});
test("SC absent only at root, not inherited or nested", () => {
  const r = parse('{"nested":{"hooks":{},"apiKeyHelper":"synthetic-secret","disableAllHooks":true},"__proto__":{"hooks":{}},"constructor":{}}');
  assert.equal(r.state, "observed"); assert.ok(r.fields.every(f => f.present === false && f.type === null));
  const g = parse('{"projects":{"synthetic":{"mcpServers":{"s":{}}}}}', "global-state"); assert.equal(field(g, "mcpServers").present, false);
});
for (const raw of [
  '{"hooks":{},"hooks":{}}', '{"hooks":{},"h\\u006foks":{}}', '{"unknown":1,"unknown":2}',
  '{"nested":{"x":1,"x":2}}', '{"x":1,}', '{"x":[1,]}', '{"x":truefalse}',
  '{"x":01}', '{"x":-}', '{"x":.1}', '{"x":1.}', '{"x":1e}', '{"x":1e+}',
  '{"x":NaN}', '{"x":Infinity}', '{"x":/*comment*/1}', '{} garbage', '{}{}',
  '{"x":"\\q"}', '{"x":"\\u000g"}', '{"x":"\\ud800"}', '{"x":"\\udc00"}',
  '{"x":"\\ud800\\u0061"}', '{"x":"\\ud800x"}', '{"x":"\u0000"}',
  '{"hooks":{},"x":', '{"hooks":{}', '', '[]', 'null', '\ufeff{}'
]) test("SC malformed JSON never yields provisional fields: " + JSON.stringify(raw).slice(0, 42), () => {
  const r = safe(parse(raw, "personal-settings", {}, 1)); assert.equal(r.state, "invalid"); assert.deepEqual(r.fields, []); assert.equal(r.projectionSha256, null);
});
for (const b of [Buffer.from([0xff]), Buffer.from([123, 34, 120, 34, 58, 34, 0xc0, 0x80, 34, 125]),
  Buffer.from([123, 34, 120, 34, 58, 34, 0xed, 0xa0, 0x80, 34, 125]), Buffer.from([0xf4, 0x90, 0x80, 0x80]), Buffer.from([0xc3])]) {
  test("SC rejects invalid UTF8 without text decoding", () => assert.equal(parse(b, "personal-settings", {}, 1).state, "invalid"));
}
test("SC bound key bytes, names, nodes, depth and file bytes", () => {
  assert.equal(parse('{"x":"ignored"}', "personal-settings", { maxBytes: 14, blockBytes: 4 }, 4).state, "invalid");
  assert.equal(parse('{"abcdef":1}', "personal-settings", { maxKeyBytes: 5 }).reasons[0], "selective-key-bytes-limit");
  assert.equal(parse('{"a":1,"b":2}', "personal-settings", { maxKeys: 1 }).reasons[0], "selective-key-limit");
  assert.equal(parse('{"a":1}', "personal-settings", { maxNodes: 2 }).reasons[0], "selective-node-limit");
  assert.equal(parse('{"a":{}}', "personal-settings", { maxDepth: 1 }).reasons[0], "selective-depth-limit");
  const p = createSelectiveConfigParser(schema, "personal-settings", limits()); p.push(Buffer.alloc(4097)); assert.equal(p.finish().reasons[0], "selective-block-invalid");
});
test("SC long ignored strings do not retain values or add raw content hashes", () => {
  const a = parse('{"ignored":"' + "synthetic-secret ".repeat(20000) + '","hooks":{}}', "personal-settings", {}, 4096);
  const b = parse('{"ignored":"other-private-value","hooks":{}}');
  assert.equal(a.state, "observed"); assert.equal(a.projectionSha256, b.projectionSha256);
  assert.equal(a.stats.retainedValueTextBytes, 0); assert.equal(a.stats.retainedRawBytes, 0);
  assert.equal(a.stats.peakKeyDigests, 2); safe(a);
});
test("SC parser construction and push reject objects/proxies without hooks", () => {
  let hooks = 0; const p = createSelectiveConfigParser(schema, "personal-settings", limits());
  const proxy = new Proxy({}, { getPrototypeOf() { hooks++; throw Error("no"); }, ownKeys() { hooks++; throw Error("no"); } });
  p.push(proxy); assert.equal(p.finish().state, "invalid"); assert.equal(hooks, 0);
  assert.throws(() => createSelectiveConfigParser(schema, { toString() { hooks++; return "personal-settings"; } }, limits())); assert.equal(hooks, 0);
  assert.throws(() => createSelectiveConfigParser(schema, "other", limits()));
});
test("SC parser APIs retain no raw chunk and returned objects are copies", () => {
  const p = createSelectiveConfigParser(schema, "personal-settings", limits());
  const raw = Buffer.from('{"hooks":{}}'); assert.equal(p.push(raw).fields.length, 0); raw.fill(120);
  const r = p.finish(); assert.equal(r.state, "observed"); r.fields[0].present = false;
  assert.equal(p.finish().state, "invalid"); assert.equal(p.finish().fields.length, 0);
});
test("SC pure parser calls no whole-read, processes, network, clock or JSON.parse", () => {
  const hooks = [[fs, "readFile"], [http, "request"], [https, "request"], [net, "connect"], [globalThis, "fetch"], [JSON, "parse"], [Date, "now"], [childProcess, "spawn"], [childProcess, "exec"], [childProcess, "execFile"]];
  const saved = hooks.map(([o, k]) => o[k]); let calls = 0;
  const deny = () => { calls++; throw Error("prohibited"); };
  for (const [o, k] of hooks) o[k] = deny;
  try { assert.equal(parse('{"hooks":{},"ignored":"synthetic-secret"}').state, "observed"); assert.equal(calls, 0); }
  finally { hooks.forEach(([o, k], i) => { o[k] = saved[i]; }); }
});

async function setup(t, first = '{"hooks":{},"disableAllHooks":true,"apiKeyHelper":"synthetic-secret"}', second = '{"mcpServers":{},"token":"synthetic-secret"}') {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "agent-selective-test-"))); await fs.chmod(root, 0o700); const owned = await fs.lstat(root);
  t.after(async () => { const s = await fs.lstat(root).catch(() => null); if (s?.dev === owned.dev && s?.ino === owned.ino && s.isDirectory() && !s.isSymbolicLink()) await fs.rm(root, { recursive: true }); });
  const sources = [{ sourceId: "personal-settings", path: path.join(root, "settings.json") }, { sourceId: "global-state", path: path.join(root, "global.json") }];
  await fs.writeFile(sources[0].path, first, { mode: 0o600 }); await fs.writeFile(sources[1].path, second, { mode: 0o600 });
  return { sources, limits: limits(), aggregateBytes: 2097152, timeoutMs: 30000 };
}
const reader = (cfg, deps = {}, p = createSelectiveReadPermit(cfg)) => createSelectiveFileReader(schema, cfg, p, deps);
const localTest = (name, fn) => test(name, { timeout: 10000,
  skip: process.platform === 'win32' && /stops on (symlink|writable)|read-only public mode/u.test(name) ? 'POSIX file symlinks or mode bits require POSIX permissions' : false }, fn);
localTest("SC wrapper reads two files incrementally, no writes or whole-file functions", async t => {
  const cfg = await setup(t); let reads = 0, writes = 0;
  const read = reader(cfg, { io: { readFile: async () => { throw Error("whole read"); }, writeFile: async () => { writes++; throw Error("no write"); }, open: async (...a) => {
    assert.equal(a[1], 0 | (await import("node:fs")).constants.O_NOFOLLOW); const h = await fs.open(...a); const original = h.read.bind(h);
    h.read = async (...args) => { assert.ok(args[2] <= 4096); reads++; return original(...args); }; return h;
  } } });
  const r = await read.run(); safe(r.report); assert.equal(r.report.state, "observed"); assert.ok(reads > 0); assert.equal(writes, 0);
  assert.equal(r.report.sources[0].provenance, "local-structure-observation"); assert.equal(r.privateObservations.length, 2);
  assert.doesNotMatch(JSON.stringify(r), /synthetic-secret|agent-selective-test/);
  assert.equal((await read.run()).report.state, "blocked");
});
for (const [name, change] of [
  ["symlink", async c => { await fs.rename(c.sources[0].path, c.sources[0].path + "-old"); await fs.symlink(c.sources[0].path + "-old", c.sources[0].path); }],
  ["hardlink", c => fs.link(c.sources[0].path, c.sources[0].path + "-linked")], ["writable", c => fs.chmod(c.sources[0].path, 0o666)],
  ["missing", c => fs.unlink(c.sources[0].path)], ["too large", c => fs.writeFile(c.sources[0].path, Buffer.alloc(1048577))]
]) localTest("SC wrapper stops on " + name + " without another source", async t => {
  const cfg = await setup(t); await change(cfg); const r = await reader(cfg).run(); assert.notEqual(r.report.state, "observed"); assert.equal(r.report.sources.length, 1); assert.equal(r.report.sources[0].fields.length, 0);
});
localTest("SC wrapper failed second source keeps only the first fully verified observation", async t => {
  const cfg = await setup(t, '{"hooks":{}}', '{"mcpServers":{}'); const r = await reader(cfg).run();
  assert.equal(r.report.state, "blocked"); assert.equal(r.report.sources[0].state, "observed"); assert.deepEqual(r.report.sources[1].fields, []);
});
localTest("SC wrapper revalidation race invalidates an otherwise successful source", async t => {
  const cfg = await setup(t);
  const r = await reader(cfg, { checkpoint: async (phase, id) => { if (phase === "before-revalidate" && id === "personal-settings") await fs.appendFile(cfg.sources[0].path, " "); } }).run();
  assert.equal(r.report.state, "blocked"); assert.ok(r.report.reasons.includes("selective-file-changed")); assert.deepEqual(r.report.sources[0].fields, []);
});
localTest("SC wrapper reports changed UID/IO error without raw error text", async t => {
  for (const io of [{ lstat: async p => { const s = await fs.lstat(p); if (s.isFile()) s.uid++; return s; } }, { open: async () => { throw Error("synthetic-secret in error"); } }]) {
    const cfg = await setup(t); const r = await reader(cfg, { io }).run(); safe(r.report); assert.equal(r.report.state, "blocked");
  }
});
localTest("SC wrapper permit is unforgeable, bound, nontransferable and revoked", async t => {
  const cfg = await setup(t), p = createSelectiveReadPermit(cfg); revokeSelectiveReadPermit(p);
  const other = { ...cfg, timeoutMs: 29999 };
  for (const h of [{}, p, JSON.parse(JSON.stringify(createSelectiveReadPermit(cfg))), createSelectiveReadPermit(other), createNativeAccessPermit({}, {})]) {
    assert.equal((await reader(cfg, {}, h).run()).report.bytesRead, 0);
  }
});
localTest("SC wrapper one permit, two consumers, only one reads", async t => {
  const cfg = await setup(t), p = createSelectiveReadPermit(cfg);
  const r = await Promise.all([reader(cfg, {}, p).run(), reader(cfg, {}, p).run()]); assert.equal(r.filter(v => v.report.state === "observed").length, 1);
});
localTest("SC wrapper cancellation, deadline and aggregate budgets stop during reading", async t => {
  const cfg = await setup(t), a = new AbortController(); a.abort(); assert.equal((await reader(cfg, { signal: a.signal }).run()).report.bytesRead, 0);
  let ticks = 0; assert.equal((await reader(cfg, { monotonic: () => ++ticks * 30000 }).run()).report.state, "blocked");
  const q = { ...cfg, aggregateBytes: 5 }; const r = await reader(q).run(); assert.equal(r.report.state, "blocked"); assert.ok(r.report.bytesRead <= 5);
});
localTest("SC wrapper requires exact ordered sources and rejects input recipes", async t => {
  const cfg = await setup(t);
  for (const change of [q => { q.sources = q.sources.slice(0, 1); }, q => { q.sources.reverse(); }, q => { q.sources[0].path = "relative"; }, q => { q.sources[0].sourceId = "other"; }, q => { q.script = "unsafe"; }]) {
    const q = structuredClone(cfg); change(q); assert.throws(() => reader(q));
  }
  const r = await reader(cfg).run({ sources: [] }); assert.equal(r.report.bytesRead, 0); assert.ok(r.report.reasons.includes("selective-input-forbidden"));
});
test("SC invalid limits/source/schema stay outside execution", () => {
  for (const change of [l => { l.blockBytes = "4096"; }, l => { l.maxBytes = 1048577; }, l => { l.maxDepth = 33; }, l => { l.maxNodes = 20001; }, l => { l.maxKeys = 4097; }, l => { l.maxKeyBytes = 257; }, l => { l.extra = true; }]) {
    const l = limits(); change(l); assert.throws(() => createSelectiveConfigParser(schema, "personal-settings", l));
  }
  assert.throws(() => createSelectiveConfigParser({ ...schema, $id: "other" }, "personal-settings", limits()));
});
test("SC exact parser limits and boundary UTF8 count logical key bytes", () => {
  const b = Buffer.from('{"hooks":{}}'); const l = { ...limits(), maxBytes: b.length, blockBytes: 1, maxNodes: 3, maxKeys: 1, maxDepth: 2, maxKeyBytes: 5 };
  assert.equal(parse(b, "personal-settings", l, 1).state, "observed");
  assert.equal(parse('{"á":1}', "personal-settings", { maxKeyBytes: 1 }, 1).state, "invalid");
  assert.equal(parse('{"\\u00e1":1}', "personal-settings", { maxKeyBytes: 2 }, 1).state, "observed");
});
test("SC JSON primitive grammar handles all scalar phases without retaining digits", () => {
  for (const n of ["0", "-0", "1", "-1234", "0.0", "-0.001", "4e1", "4E-1", "4e+99", "4.2e999", "999999999999999999999999"]) {
    assert.equal(parse('{"apiKeyHelper":' + n + '}', "personal-settings", {}, 1).state, "observed");
  }
  for (const n of ["00", "+1", "-.1", "1.e2", "1e++2", "1e-", "1..0", "1e1e2"]) assert.equal(parse('{"x":' + n + '}', "personal-settings", {}, 1).state, "invalid");
});
test("SC duplicate escaped/raw Unicode keys compare without exporting digests", () => {
  const r = parse('{"á":1,"\\u00e1":2}', "personal-settings", {}, 1);
  assert.equal(r.state, "invalid"); assert.equal(r.reasons[0], "selective-duplicate-key"); assert.equal(r.projectionSha256, null);
});
localTest("SC wrapper short reads preserve the byte state machine", async t => {
  const cfg = await setup(t); const r = await reader(cfg, { io: { open: async (...a) => {
    const h = await fs.open(...a), read = h.read.bind(h); h.read = (b, off, len, pos) => read(b, off, Math.min(1, len), pos); return h;
  } } }).run(); assert.equal(r.report.state, "observed"); safe(r.report);
});
localTest("SC missing second file never yields source-wide absent selectors", async t => {
  const cfg = await setup(t); await fs.unlink(cfg.sources[1].path); const r = await reader(cfg).run();
  assert.equal(r.report.state, "incomplete"); assert.equal(r.report.sources[0].state, "observed"); assert.deepEqual(r.report.sources[1].fields, []);
});
localTest("SC wrapper empty/truncated/error after useful prefix invalidates the source", async t => {
  for (const text of ["", '{"hooks":{},"secret":"unfinished']) {
    const cfg = await setup(t, text); const r = await reader(cfg).run(); assert.equal(r.report.state, "blocked"); assert.deepEqual(r.report.sources[0].fields, []);
  }
  const cfg = await setup(t); const r = await reader(cfg, { io: { open: async (...a) => {
    const h = await fs.open(...a), read = h.read.bind(h); let n = 0;
    h.read = (...x) => { if (++n > 1) throw Error("synthetic-secret"); return read(...x); }; return h;
  } } }).run(); assert.equal(r.report.state, "blocked"); assert.deepEqual(r.report.sources[0].fields, []); safe(r.report);
});
localTest("SC revocation during stream discards that source, no fallback", async t => {
  const cfg = await setup(t), permit = createSelectiveReadPermit(cfg);
  const r = await reader(cfg, { checkpoint: async phase => { if (phase === "block-read") revokeSelectiveReadPermit(permit); } }, permit).run();
  assert.equal(r.report.state, "blocked"); assert.ok(r.report.reasons.includes("selective-canceled")); assert.equal(r.report.sources[0].fields.length, 0);
});
localTest("SC source descriptor identity mismatch blocks observations", async t => {
  const cfg = await setup(t); const r = await reader(cfg, { io: { open: async (...a) => {
    const h = await fs.open(...a), stat = h.stat.bind(h); h.stat = async () => { const s = await stat(); s.ino = 0; return s; }; return h;
  } } }).run(); assert.equal(r.report.state, "blocked"); assert.ok(r.report.reasons.includes("selective-file-changed"));
});
localTest("SC wrapper allows read-only public mode but never repairs original permissions", async t => {
  const cfg = await setup(t); await fs.chmod(cfg.sources[0].path, 0o644); let chmods = 0;
  const r = await reader(cfg, { io: { chmod: async () => { chmods++; throw Error("not authorized"); } } }).run();
  assert.equal(r.report.state, "observed"); assert.equal(chmods, 0); assert.equal((await fs.lstat(cfg.sources[0].path)).mode & 0o777, 0o644);
});
test("SC deterministic differential cases agree with structural JSON reference", () => {
  let seed = 1747;
  const next = n => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed % n; };
  const values = [null, true, false, 0, -2.4e-5, "", "synthetic-secret á🐣", [], [null, "synthetic-secret"], {}, { nested: [true, null, "synthetic-secret"] }];
  for (let i = 0; i < 80; i++) {
    const root = { ignored: values[next(values.length)], nested: { hooks: values[next(values.length)] } };
    for (const name of SELECTORS["personal-settings"]) if (next(3)) root[name] = values[next(values.length)];
    const text = JSON.stringify(root), r = parse(text, "personal-settings", {}, 1 + next(30));
    assert.equal(r.state, "observed", "differential case " + i);
    for (const f of r.fields) {
      const exists = Object.hasOwn(root, f.name), v = root[f.name];
      assert.equal(f.present, exists);
      if (!exists) continue;
      const type = v === null ? "null" : Array.isArray(v) ? "array" : typeof v;
      assert.equal(f.type, type);
      assert.equal(f.empty, typeof v === "string" ? v.length === 0 : type === "object" || type === "array" ? Object.keys(v).length === 0 : null);
      assert.equal(f.booleanValue, f.name === "disableAllHooks" && typeof v === "boolean" ? v : null);
    }
    safe(r);
  }
});
test("SC UTF8 codepoints and every escape are validated without retaining values", () => {
  const valid = '{"ignored":"\\\"\\\\\\/\\b\\f\\n\\r\\t\\u0000\\ud83d\\udc23 Ω 𐀀","hooks":{}}';
  assert.equal(parse(valid, "personal-settings", {}, 1).state, "observed");
  const p = createSelectiveConfigParser(schema, "personal-settings", limits());
  p.push(Buffer.from('{"ignored":"synthetic-secret')); assert.equal(p.push(Buffer.from('"}')).state, "incomplete");
  assert.equal(p.finish().state, "observed");
});
localTest("SC full wrapper makes no network/process/whole-read/write calls", async t => {
  const cfg = await setup(t); const hooks = [[fs, "readFile"], [fs, "writeFile"], [fs, "appendFile"], [http, "request"], [https, "request"], [net, "connect"], [globalThis, "fetch"], [childProcess, "spawn"], [childProcess, "execFile"]];
  const saved = hooks.map(([o, k]) => o[k]); let calls = 0;
  for (const [o, k] of hooks) o[k] = () => { calls++; throw Error("prohibited"); };
  try { assert.equal((await reader(cfg).run()).report.state, "observed"); assert.equal(calls, 0); }
  finally { hooks.forEach(([o, k], i) => { o[k] = saved[i]; }); }
});
localTest("SC unread bytes after exact approved limit and file growth are rejected", async t => {
  const cfg = await setup(t); const before = await fs.lstat(cfg.sources[0].path); cfg.limits.maxBytes = before.size; cfg.limits.blockBytes = before.size;
  const r = await reader(cfg, { checkpoint: async (phase, id) => { if (phase === "block-read" && id === "personal-settings") await fs.appendFile(cfg.sources[0].path, " "); } }).run();
  assert.equal(r.report.state, "blocked"); assert.deepEqual(r.report.sources[0].fields, []);
});
localTest("SC closing a descriptor after total deadline invalidates its source", async t => {
  const cfg = await setup(t); let ticks = 0;
  const r = await reader(cfg, { monotonic: () => ticks, io: { open: async (...a) => {
    const h = await fs.open(...a), close = h.close.bind(h); h.close = async () => { await close(); ticks = 30001; }; return h;
  } } }).run(); assert.equal(r.report.state, "blocked"); assert.equal(r.report.reasons[0], "selective-deadline"); assert.deepEqual(r.report.sources[0].fields, []);
});
