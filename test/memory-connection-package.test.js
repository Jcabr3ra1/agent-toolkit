import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import fsp from "node:fs/promises";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import os from "node:os";
import childProcess from "node:child_process";
import Module from "node:module";
import { createHash } from "node:crypto";
import { createMemoryConnectionDescriptor, memoryConnectionHash } from "../src/memory-connection-descriptor.js";
import { validateMemoryConnectionPackage as validate, MEMORY_CONNECTION_PACKAGE_LIMITS as LIMITS } from "../src/memory-connection-package.js";

const hash = bytes => createHash("sha256").update(bytes).digest("hex");
function fixture(delta = {}) {
  const root = "/fictitious/a1g café 🐦";
  const descriptor = createMemoryConnectionDescriptor({
    agent: "codex", mcpName: "demo-memory", skillName: "demo-skill",
    nodePath: root + "/runtime/node", toolkitRoot: root + "/toolkit",
    vaultPath: root + "/vault", manifestPath: root + "/vault/project-memory.json",
    sourcePath: root + "/source", homeDirectory: root + "/home", ...delta
  });
  const pkg = { name: "fictitious-private-marker", version: "1.2.3", dependencies: { "demo-lib": "^8.17.1", "@demo/scoped": "2.0.0" }, engines: { node: "^24.0.0" } };
  const lock = { name: pkg.name, version: pkg.version, lockfileVersion: 3, packages: {
    "": structuredClone(pkg), "node_modules/demo-lib": { version: "8.18.0" }, "node_modules/@demo/scoped": { version: "2.0.0" }
  } };
  const input = (packageJsonBytes = Buffer.from(JSON.stringify(pkg)), packageLockBytes = Buffer.from(JSON.stringify(lock))) => ({
    descriptor, packageJsonBytes, packageLockBytes,
    expectedPackageJsonSha256: hash(packageJsonBytes), expectedPackageLockSha256: hash(packageLockBytes)
  });
  return { descriptor, pkg, lock, input };
}
function facts(r, matched = true, engine = matched) {
  assert.equal(r.facts.evidence, "provided-bytes"); assert.equal(r.facts.verificationScope, "package-root-declarations-only");
  for (const key of ["packageIdentityMatched", "directDependencyDeclarationsMatched"]) assert.equal(r.facts[key], matched);
  assert.equal(r.facts.engineDeclarationMatched, engine);
  for (const key of ["rangeSatisfactionVerified", "dependencyGraphVerified", "installedDependenciesVerified", "runtimeVersionVerified",
    "runtimeCompatibilityVerified", "runtimeVerified", "physicalPathsVerified", "localReadVerified", "nativeReadVerified", "authorizationGranted",
    "executable", "applied", "wrote", "sent", "executed"]) assert.equal(r.facts[key], false, key);
  assert.equal(r.facts.humanReviewRequired, true);
}
function rejected(r, code, state = "blocked") {
  assert.equal(r.state, state); assert.deepEqual(r.reasons, [code]); facts(r, false, false);
  for (const key of ["descriptorSha256", "packageJsonSha256", "packageLockSha256"]) assert.equal(r[key], null);
  assert.equal(Object.isFrozen(r), true); assert.equal(Object.isFrozen(r.facts), true); assert.equal(Object.isFrozen(r.reasons), true);
  assert.doesNotMatch(JSON.stringify(r), /private-marker|fixture-sensitive|fictitious\/|\.invalid|stack|Error:/);
}
function consistent(f, engine = true) { const r = validate(f.input()); assert.equal(r.state, "consistent"); facts(r, true, engine); return r; }

test("A1g exact declarations yield owned frozen modest report without changing inputs", () => {
  const f = fixture(), input = f.input(), before = structuredClone(input), r = validate(input);
  assert.equal(r.state, "consistent"); assert.deepEqual(r.reasons, ["MC_PACKAGE_CONSISTENT"]); facts(r);
  assert.equal(r.descriptorSha256, memoryConnectionHash(f.descriptor));
  assert.equal(r.packageJsonSha256, input.expectedPackageJsonSha256); assert.equal(r.packageLockSha256, input.expectedPackageLockSha256);
  for (const key of ["packageJsonBytes", "packageLockBytes"]) assert.deepEqual(input[key], Buffer.from(before[key]));
  assert.deepEqual(input.descriptor, before.descriptor); assert.equal(Object.isFrozen(input), false);
  assert.equal(Object.isFrozen(input.packageJsonBytes), false); assert.equal(Object.isFrozen(input.packageLockBytes), false);
  for (const value of [r, r.reasons, r.facts, LIMITS]) assert.equal(Object.isFrozen(value), true);
  assert.throws(() => { r.facts.runtimeVerified = true; }, TypeError);
  assert.doesNotMatch(JSON.stringify(r), /private-marker|fictitious|demo-lib|8\.17|24\.0/);
  assert.ok(Buffer.byteLength(JSON.stringify(r)) <= LIMITS.reportBytes);
  input.packageJsonBytes.fill(0); input.packageLockBytes.fill(0);
  assert.equal(r.packageJsonSha256, hash(before.packageJsonBytes)); assert.equal(r.packageLockSha256, hash(before.packageLockBytes));
});
for (const representation of ["string", "uint8", "offset", "null-prototype", "mutable-descriptor", "CRLF", "whitespace"]) test("A1g representation " + representation, () => {
  const f = fixture(); let input = f.input();
  for (const key of ["packageJsonBytes", "packageLockBytes"]) {
    if (representation === "string") input[key] = input[key].toString("utf8");
    if (representation === "uint8") input[key] = new Uint8Array(input[key]);
    if (representation === "offset") { const view = new Uint8Array(input[key].length + 20); view.set(input[key], 7); input[key] = view.subarray(7, view.length - 13); }
  }
  if (representation === "null-prototype") input = Object.assign(Object.create(null), input);
  if (representation === "mutable-descriptor") input.descriptor = JSON.parse(JSON.stringify(input.descriptor));
  if (representation === "CRLF") input = f.input(Buffer.from(JSON.stringify(f.pkg, null, 2).replaceAll("\n", "\r\n")), Buffer.from(JSON.stringify(f.lock, null, 2).replaceAll("\n", "\r\n")));
  if (representation === "whitespace") input = f.input(Buffer.from(" \n\t" + JSON.stringify(f.pkg)), Buffer.from(JSON.stringify(f.lock) + "\n\t "));
  assert.equal(validate(input).state, "consistent");
  if (representation === "mutable-descriptor") assert.equal(Object.isFrozen(input.descriptor), false);
});
test("A1g closed envelope and descriptor reject hooks without invocation", () => {
  const f = fixture(), base = f.input(); let calls = 0;
  const deny = () => { calls++; throw Error("private-marker"); };
  const bad = [undefined, null, false, [], {}, { ...base, extra: true }, { ...base, toJSON: deny }, Object.assign(Object.create({}), base),
    { ...base, [Symbol("extra")]: true }, new Proxy(base, { ownKeys: deny, get: deny, getPrototypeOf: deny })];
  for (const key of Object.keys(base)) {
    const missing = { ...base }; delete missing[key]; bad.push(missing);
    bad.push(Object.defineProperty({ ...base }, key, { enumerable: true, get: deny }));
    bad.push(Object.defineProperty({ ...base }, key, { enumerable: false, value: base[key] }));
  }
  for (const key of ["expectedPackageJsonSha256", "expectedPackageLockSha256"]) {
    for (const value of [null, 7, "a".repeat(63), "A".repeat(64), "z".repeat(64), { toString: deny }]) bad.push({ ...base, [key]: value });
  }
  const hooked = { ...base.descriptor }; Object.defineProperty(hooked, "identity", { enumerable: true, get: deny });
  const circular = { ...base.descriptor }; circular.extra = circular;
  bad.push({ ...base, descriptor: hooked }, { ...base, descriptor: circular },
    { ...base, descriptor: new Proxy(base.descriptor, { ownKeys: deny, get: deny }) },
    { ...base, descriptor: { ...base.descriptor, facts: { ...base.descriptor.facts, authorizationGranted: true } } },
    { ...base, descriptor: { ...base.descriptor, server: { ...base.descriptor.server, enabled: true } } });
  const revocable = Proxy.revocable(base, {}); revocable.revoke(); bad.push(revocable.proxy);
  for (const input of bad) rejected(validate(input), "MC_PACKAGE_INPUT", "invalid");
  assert.equal(calls, 0);
});
for (const delta of [{ toolkitRoot: "/fictitious/a1g café 🐦/vault/toolkit" }, { manifestPath: "/fictitious/a1g café 🐦/outside.json" }]) test("A1g A1e root layout " + Object.keys(delta)[0], () => {
  const f = fixture(delta); rejected(validate(f.input()), "MC_PACKAGE_INPUT", "invalid");
});
for (const key of ["packageJsonBytes", "packageLockBytes"]) {
  test("A1g unsupported/shared bytes never invoke hooks " + key, () => {
    const f = fixture(), base = f.input(); let calls = 0;
    const deny = () => { calls++; throw Error("private-marker"); };
    class Subclass extends Uint8Array {}
    const bad = [undefined, null, 1, [], new ArrayBuffer(2), new Uint16Array(2), new DataView(new ArrayBuffer(2)), new Subclass(2),
      { toString: deny, valueOf: deny, toJSON: deny }, new Proxy(base[key], { get: deny, getPrototypeOf: deny })];
    if (typeof SharedArrayBuffer === "function") bad.push(new SharedArrayBuffer(2), new Uint8Array(new SharedArrayBuffer(2)), Buffer.from(new SharedArrayBuffer(2)));
    const detached = new Uint8Array(2); structuredClone(detached.buffer, { transfer: [detached.buffer] }); bad.push(detached);
    for (const value of bad) rejected(validate({ ...base, [key]: value }), "MC_PACKAGE_INPUT", "invalid");
    const bytes = new Uint8Array(base[key]);
    for (const name of ["length", "buffer", "toJSON", "toString", Symbol.iterator]) Object.defineProperty(bytes, name, { get: deny });
    assert.equal(validate({ ...base, [key]: bytes }).state, "consistent"); assert.equal(calls, 0);
    rejected(validate({ ...base, [key]: new Proxy(bytes, { get: deny }), expectedPackageJsonSha256: "bad" }), "MC_PACKAGE_INPUT", "invalid");
    assert.equal(calls, 0);
  });
}
for (const key of ["expectedPackageJsonSha256", "expectedPackageLockSha256"]) test("A1g both pins precede any JSON parse " + key, () => {
  const f = fixture(), input = f.input(Buffer.from([0xff]), Buffer.from('{"x":1,"x":2}'));
  input[key] = "0".repeat(64); const r = validate(input); rejected(r, "MC_PACKAGE_PIN_MISMATCH");
  assert.doesNotMatch(JSON.stringify(r), new RegExp(hash(input.packageJsonBytes) + "|" + hash(input.packageLockBytes)));
});
for (const [label, content] of [
  ["empty", ""], ["spaces", " \t\n"], ["array", "[]"], ["null", "null"], ["scalar", "1"], ["string", '"x"'],
  ["BOM", "\ufeff{}"], ["utf8", Buffer.from([0xff])], ["truncated", Buffer.from([0xf0, 0x9f])],
  ["duplicate", '{"x":1,"x":2}'], ["escaped-duplicate", '{"x":1,"\\u0078":2}'], ["nested-duplicate", '{"x":{"y":1,"y":2}}'],
  ["prototype", '{"prototype":1}'], ["constructor", '{"constructor":1}'], ["proto", '{"__proto__":1}'],
  ["surrogate", '{"x":"\\ud800"}'], ["comment", "{/*no*/}"], ["comma", '{"x":1,}'], ["trailing", "{}{}"],
  ["non-finite", '{"x":1e999}'], ["underflow", '{"x":1e-999}'], ["precision", '{"x":1.00000000000000000001}']
]) for (const key of ["packageJsonBytes", "packageLockBytes"]) test("A1g strict JSON " + key + " " + label, () => {
  const f = fixture(), base = f.input(), bytes = typeof content === "string" ? Buffer.from(content) : content;
  const input = { ...base, [key]: bytes, [key === "packageJsonBytes" ? "expectedPackageJsonSha256" : "expectedPackageLockSha256"]: hash(bytes) };
  rejected(validate(input), "MC_PACKAGE_FORMAT");
});
for (const key of ["packageJsonBytes", "packageLockBytes"]) test("A1g unmatched Unicode string fails during capture " + key, () => {
  const base = fixture().input(); rejected(validate({ ...base, [key]: "\ud800" }), "MC_PACKAGE_FORMAT");
});
for (const version of [undefined, 1, 2, 4, "3", null, true]) test("A1g lock profile version " + String(version), () => {
  const f = fixture(); if (version === undefined) delete f.lock.lockfileVersion; else f.lock.lockfileVersion = version;
  rejected(validate(f.input()), "MC_PACKAGE_PROFILE");
});
for (const field of ["packages", "root"]) for (const value of [undefined, null, [], 1, "x"]) test("A1g malformed profile " + field + " " + JSON.stringify(value), () => {
  const f = fixture(), obj = field === "packages" ? f.lock : f.lock.packages, key = field === "packages" ? "packages" : "";
  if (value === undefined) delete obj[key]; else obj[key] = value;
  rejected(validate(f.input()), "MC_PACKAGE_PROFILE");
});
for (const where of ["pkg", "lock", "root"]) for (const field of ["name", "version"]) test("A1g triple identity " + where + " " + field, () => {
  const f = fixture(), obj = where === "pkg" ? f.pkg : where === "lock" ? f.lock : f.lock.packages[""];
  for (const value of [undefined, null, 1, "", "different-private-marker", " leading", "trailing ", "control\u0000", "bidi\u202e"]) {
    if (value === undefined) delete obj[field]; else obj[field] = value;
    rejected(validate(f.input()), "MC_PACKAGE_IDENTITY");
  }
});
for (const side of ["pkg", "root"]) {
  for (const [label, modify] of [
    ["added", d => { d.extra = "1.0.0"; }], ["removed", d => { delete d["demo-lib"]; }], ["different", d => { d["demo-lib"] = ">=8.17.1"; }],
    ["type", d => { d["demo-lib"] = 1; }], ["empty", d => { d["demo-lib"] = ""; }], ["leading", d => { d["demo-lib"] = " ^8.17.1"; }],
    ["trailing", d => { d["demo-lib"] = "^8.17.1 "; }], ["control", d => { d["demo-lib"] = "bad\u0000"; }],
    ["empty-name", d => { d[""] = "1"; }], ["control-name", d => { d["bad\u202e"] = "1"; }], ["padded-name", d => { d[" bad"] = "1"; }]
  ]) test("A1g dependencies " + side + " " + label, () => {
    const f = fixture(), obj = side === "pkg" ? f.pkg : f.lock.packages[""]; modify(obj.dependencies); rejected(validate(f.input()), "MC_PACKAGE_DEPENDENCIES");
  });
  for (const value of [null, [], "x", 1]) test("A1g dependencies map type " + side + " " + JSON.stringify(value), () => {
    const f = fixture(); (side === "pkg" ? f.pkg : f.lock.packages[""]).dependencies = value; rejected(validate(f.input()), "MC_PACKAGE_DEPENDENCIES");
  });
  for (const field of ["devDependencies", "optionalDependencies", "peerDependencies"]) test("A1g root profile alternative " + side + " " + field, () => {
    const f = fixture(), obj = side === "pkg" ? f.pkg : f.lock.packages[""];
    for (const value of [{ extra: "1" }, [], null, 1, "x"]) { obj[field] = value; rejected(validate(f.input()), "MC_PACKAGE_PROFILE"); }
    obj[field] = {}; consistent(f);
  });
  for (const field of ["workspaces", "overrides", "bundleDependencies", "bundledDependencies"]) test("A1g root profile rejects presence " + side + " " + field, () => {
    const f = fixture(); (side === "pkg" ? f.pkg : f.lock.packages[""])[field] = {}; rejected(validate(f.input()), "MC_PACKAGE_PROFILE");
  });
}
test("A1g order is irrelevant, missing dependency map means empty", () => {
  const f = fixture(); f.lock.packages[""].dependencies = { "@demo/scoped": "2.0.0", "demo-lib": "^8.17.1" }; consistent(f);
  delete f.pkg.dependencies; f.lock.packages[""].dependencies = {}; consistent(f);
  delete f.lock.packages[""].dependencies; consistent(f);
  f.pkg.dependencies = {}; consistent(f);
});
for (const side of ["pkg", "root"]) test("A1g engine malformed, omitted or contradicted " + side, () => {
  const f = fixture(), obj = side === "pkg" ? f.pkg : f.lock.packages[""];
  for (const value of [null, [], 1, "x"]) { obj.engines = value; rejected(validate(f.input()), "MC_PACKAGE_ENGINES"); }
  for (const value of [null, 1, "", ">=24", " ^24.0.0", "^24.0.0 ", "bad\u0000"]) { obj.engines = { node: value }; rejected(validate(f.input()), "MC_PACKAGE_ENGINES"); }
  obj.engines = {}; rejected(validate(f.input()), "MC_PACKAGE_ENGINES");
  delete obj.engines; rejected(validate(f.input()), "MC_PACKAGE_ENGINES");
});
test("A1g engine missing in both is undeclared, not verified; other engines ignored", () => {
  const f = fixture(); delete f.pkg.engines; delete f.lock.packages[""].engines; consistent(f, false);
  f.pkg.engines = {}; f.lock.packages[""].engines = { npm: "declared-only" }; consistent(f, false);
});
for (const [label, modify, expected] of [
  ["identity-exact", f => { f.pkg.name = f.lock.name = f.lock.packages[""].name = "x".repeat(256); }, "consistent"],
  ["identity-excess", f => { f.pkg.name = "x".repeat(257); }, "limit"],
  ["engine-exact", f => { f.pkg.engines.node = f.lock.packages[""].engines.node = "x".repeat(1024); }, "consistent"],
  ["engine-excess", f => { f.pkg.engines.node = "x".repeat(1025); }, "limit"],
  ["dependency-name-exact", f => { f.pkg.dependencies = f.lock.packages[""].dependencies = { ["x".repeat(256)]: "1" }; }, "consistent"],
  ["dependency-name-excess", f => { f.pkg.dependencies["x".repeat(257)] = "1"; }, "limit"],
  ["specifier-exact", f => { f.pkg.dependencies["demo-lib"] = f.lock.packages[""].dependencies["demo-lib"] = "x".repeat(1024); }, "consistent"],
  ["specifier-excess", f => { f.pkg.dependencies["demo-lib"] = "x".repeat(1025); }, "limit"],
  ["dependency-count-exact", f => { f.pkg.dependencies = f.lock.packages[""].dependencies = Object.fromEntries(Array.from({ length: 256 }, (_, i) => ["lib" + i, "1"])); }, "consistent"],
  ["dependency-count-excess", f => { f.pkg.dependencies = Object.fromEntries(Array.from({ length: 257 }, (_, i) => ["lib" + i, "1"])); }, "limit"]
]) test("A1g literal budget " + label, () => {
  const f = fixture(); modify(f); if (expected === "consistent") consistent(f); else rejected(validate(f.input()), "MC_PACKAGE_LIMIT");
});
test("A1g declaration equality does not solve ranges, inspect transitive entries or interpret URLs/scripts", () => {
  const f = fixture(); f.pkg.dependencies = f.lock.packages[""].dependencies = {
    range: "^8.17.1", local: "file:../never-open", git: "git+https://source.invalid/repository.git", alias: "npm:other@1", remote: "https://source.invalid/archive.tgz"
  };
  f.lock.packages["node_modules/range"] = { version: "999.0.0", resolved: "https://never-fetch.invalid", integrity: "opaque-not-checked" };
  f.lock.packages["../../never-open"] = { link: true, peerDependencies: { ignored: "1" }, engines: { node: "impossible" } };
  f.pkg.$schema = "https://schema.invalid/never-fetch.json"; f.pkg.scripts = { install: "never-execute" }; f.pkg.bin = "/never-open";
  f.pkg.description = "different-private-marker"; f.lock.packages[""].description = "another-private-marker";
  const r = consistent(f); assert.doesNotMatch(JSON.stringify(r), /never-|999|npm:|source\.invalid|private-marker/);
});
for (const where of ["pkg", "lock", "transitive"]) test("A1g sensitive heuristic also checks ignored fields " + where, () => {
  const f = fixture(), obj = where === "pkg" ? f.pkg : where === "lock" ? f.lock : (f.lock.packages["node_modules/ignored"] = {});
  for (const value of [["ghp", "_"].join("") + "a".repeat(40), ["api", "_key=fixture-sensitive"].join(""),
    "https://user:" + "fixture-sensitive@source.invalid", "https://source.invalid?" + ["access", "_token=fixture-sensitive"].join("")]) {
    obj.extra = value; rejected(validate(f.input()), "MC_PACKAGE_SENSITIVE");
  }
});
for (const [key, cap] of [["packageJsonBytes", LIMITS.packageJsonBytes], ["packageLockBytes", LIMITS.packageLockBytes]]) test("A1g exact byte cap and excess " + key, () => {
  const f = fixture(), base = f.input(), text = base[key].toString("utf8"), exact = text + " ".repeat(cap - Buffer.byteLength(text));
  const pinKey = key === "packageJsonBytes" ? "expectedPackageJsonSha256" : "expectedPackageLockSha256";
  for (const bytes of [exact, Buffer.from(exact)]) assert.equal(validate({ ...base, [key]: bytes, [pinKey]: hash(bytes) }).state, "consistent");
  for (const bytes of [exact + " ", Buffer.from(exact + " "), "é".repeat(cap / 2 + 1)]) rejected(validate({ ...base, [key]: bytes, [pinKey]: hash(bytes) }), "MC_PACKAGE_LIMIT");
});
test("A1g both role maxima fit total budget together without claiming another reachable excess", () => {
  const f = fixture(), base = f.input();
  const a = Buffer.concat([base.packageJsonBytes, Buffer.alloc(LIMITS.packageJsonBytes - base.packageJsonBytes.length, 32)]);
  const b = Buffer.concat([base.packageLockBytes, Buffer.alloc(LIMITS.packageLockBytes - base.packageLockBytes.length, 32)]);
  assert.equal(a.length + b.length, LIMITS.totalBytes); assert.equal(validate(f.input(a, b)).state, "consistent");
});
for (const size of [256, 257]) test("A1g ignored array bound " + size, () => {
  const f = fixture(); f.pkg.extra = Array(size).fill(0);
  if (size === 256) consistent(f); else rejected(validate(f.input()), "MC_PACKAGE_LIMIT");
});
for (const depth of [64, 65]) test("A1g depth bound " + depth, () => {
  const f = fixture(); let value = 0; for (let i = 1; i < depth; i++) value = { x: value }; f.pkg.extra = value;
  if (depth === 64) consistent(f); else rejected(validate(f.input()), "MC_PACKAGE_LIMIT");
});
const nodes = value => 1 + (value !== null && typeof value === "object" ? Object.values(value).reduce((n, v) => n + nodes(v), 0) : 0);
for (const count of [30000, 30001]) test("A1g exact node budget " + count, () => {
  const f = fixture(); f.pkg.extra = {}; const needed = count - nodes(f.pkg);
  for (let i = 0; i < needed; i++) f.pkg.extra["n" + i] = 0;
  assert.equal(nodes(f.pkg), count); assert.ok(f.input().packageJsonBytes.length < LIMITS.packageJsonBytes);
  if (count === 30000) consistent(f); else rejected(validate(f.input()), "MC_PACKAGE_LIMIT");
});
function metadataBytes(value) {
  if (typeof value === "string") return Buffer.byteLength(value);
  if (value === null || typeof value !== "object") return 0;
  return Object.entries(value).reduce((n, [k, v]) => n + (Array.isArray(value) ? 0 : Buffer.byteLength(k)) + metadataBytes(v), 0);
}
for (const excess of [0, 1]) test("A1g lock metadata budget independent from byte cap " + excess, () => {
  const f = fixture(); f.lock.extra = ""; f.lock.extra = "x".repeat(LIMITS.metadataBytes - metadataBytes(f.lock) + excess);
  assert.equal(metadataBytes(f.lock), LIMITS.metadataBytes + excess); assert.ok(f.input().packageLockBytes.length < LIMITS.packageLockBytes);
  if (excess === 0) consistent(f); else rejected(validate(f.input()), "MC_PACKAGE_LIMIT");
});
test("A1g large lock beyond descriptor budget is parsed separately", () => {
  const f = fixture(); f.lock.extra = "x".repeat(150000); assert.ok(f.input().packageLockBytes.length > 128 * 1024); consistent(f);
});
test("A1g precedence is captures, pins, package JSON, lock JSON, sensitive, profile, identity, dependencies, engine", () => {
  const f = fixture(), bad = f.input(Buffer.from("{bad"), Buffer.from("{bad"));
  rejected(validate({ ...bad, packageLockBytes: Buffer.alloc(LIMITS.packageLockBytes + 1) }), "MC_PACKAGE_LIMIT");
  rejected(validate({ ...bad, expectedPackageLockSha256: "0".repeat(64) }), "MC_PACKAGE_PIN_MISMATCH");
  rejected(validate(bad), "MC_PACKAGE_FORMAT");
  f.pkg.extra = ["api", "_key=fixture-sensitive"].join(""); f.lock.lockfileVersion = 2; f.lock.name = "wrong";
  f.pkg.dependencies["demo-lib"] = "wrong"; f.pkg.engines.node = "wrong";
  rejected(validate(f.input()), "MC_PACKAGE_SENSITIVE"); delete f.pkg.extra;
  rejected(validate(f.input()), "MC_PACKAGE_PROFILE"); f.lock.lockfileVersion = 3;
  rejected(validate(f.input()), "MC_PACKAGE_IDENTITY"); f.lock.name = f.pkg.name;
  rejected(validate(f.input()), "MC_PACKAGE_DEPENDENCIES"); f.pkg.dependencies["demo-lib"] = "^8.17.1";
  rejected(validate(f.input()), "MC_PACKAGE_ENGINES");
});
test("A1g unexpected exception is redacted, blocked and has no partial facts", () => {
  const input = fixture().input(), original = JSON.stringify;
  JSON.stringify = function(value, ...args) { if (value?.name === "fictitious-private-marker") throw Error("fixture-sensitive"); return original(value, ...args); };
  let r; try { r = validate(input); } finally { JSON.stringify = original; }
  rejected(r, "MC_PACKAGE_VALIDATION");
});
test("A1g evaluator performs no filesystem, network, subprocess, loader, cwd or HOME access", () => {
  const input = fixture().input(), restore = []; let calls = 0;
  const deny = () => { calls++; throw Error("private-marker"); };
  const replace = (obj, key) => { const original = obj[key]; obj[key] = deny; restore.push(() => { obj[key] = original; }); };
  for (const key of ["readFile", "lstat", "stat", "open", "realpath", "readdir", "writeFile", "mkdir", "rm", "rename", "chmod"]) replace(fsp, key);
  for (const key of ["readFileSync", "lstatSync", "statSync", "openSync", "realpathSync", "readdirSync", "writeFileSync", "mkdirSync", "rmSync"]) replace(fs, key);
  for (const key of ["spawn", "spawnSync", "exec", "execSync", "execFile", "execFileSync", "fork"]) replace(childProcess, key);
  for (const obj of [http, https]) for (const key of ["request", "get"]) replace(obj, key);
  for (const key of ["connect", "createConnection"]) replace(net, key);
  replace(Module, "_load"); replace(Module, "createRequire"); replace(globalThis, "fetch"); replace(process, "cwd"); replace(os, "homedir");
  const originalEnv = process.env; process.env = new Proxy(originalEnv, { get: deny, ownKeys: deny }); restore.push(() => { process.env = originalEnv; });
  let r; try { r = validate(input); } finally { for (const fn of restore.reverse()) fn(); }
  assert.equal(calls, 0); assert.equal(r.state, "consistent"); facts(r);
});
