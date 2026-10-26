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
import { createMemoryConnectionDescriptor, memoryConnectionHash } from "../src/memory-connection-descriptor.js";
import { summarizeMemoryConnectionEvidence as summarize, MEMORY_CONNECTION_DIAGNOSTIC_LIMITS as LIMITS } from "../src/memory-connection-diagnostic.js";

const ROLES = ["configuration", "skill", "artifacts", "manifest", "package"];
const ARTIFACTS = ["nodeSha256", "binSha256", "manifestSha256", "packageJsonSha256", "packageLockSha256"];
const code = name => "MC_DIAGNOSTIC_" + name;
const wrong = "f".repeat(64);
function fixture(delta = {}) {
  const root = "/fictitious/a1h café 🐦";
  const descriptor = createMemoryConnectionDescriptor({ agent: "codex", mcpName: "demo-memory", skillName: "demo-skill",
    nodePath: root + "/runtime/node", toolkitRoot: root + "/toolkit", sourcePath: root + "/source",
    vaultPath: root + "/vault", manifestPath: root + "/vault/project-memory.json", homeDirectory: root + "/home", ...delta });
  const bindingSha256 = memoryConnectionHash(descriptor), metadataSha256 = "8".repeat(64);
  const reviewedPins = Object.fromEntries(["configurationSha256", "skillSha256", ...ARTIFACTS].map((key, i) => [key, String(i + 1).repeat(64)]));
  return { schemaVersion: "1.0.0", descriptor, reviewedPins, components: {
    configuration: { bindingSha256, state: "observed", mcpName: descriptor.identity.mcpName, fileState: "present", entryState: "observed",
      configurationSha256: reviewedPins.configurationSha256, metadataSha256, server: { ...structuredClone(descriptor.server), enabled: true } },
    skill: { bindingSha256, state: "matched", skillName: descriptor.identity.skillName,
      sourceSha256: reviewedPins.skillSha256, metadataSha256, resolvedSource: descriptor.skill.source },
    artifacts: { bindingSha256, state: "matched", metadataSha256, hashes: Object.fromEntries(ARTIFACTS.map(key => [key, reviewedPins[key]])) },
    manifest: { bindingSha256, state: "validated", descriptorSha256: bindingSha256, manifestSha256: reviewedPins.manifestSha256 },
    package: { bindingSha256, state: "consistent", descriptorSha256: bindingSha256,
      packageJsonSha256: reviewedPins.packageJsonSha256, packageLockSha256: reviewedPins.packageLockSha256 }
  } };
}
function facts(r, linked = false) {
  assert.equal(r.facts.evidence, "declared-reports"); assert.equal(r.facts.verificationScope, "cross-report-declarations-only");
  assert.equal(r.facts.declarationsLinked, linked); assert.equal(r.facts.humanReviewRequired, true);
  for (const key of ["provenanceVerified", "snapshotAtomicVerified", "freshnessVerified", "physicalPathsVerified", "localReadVerified",
    "nativeReadVerified", "skillLoadedVerified", "runtimeVerified", "runtimeVersionVerified", "runtimeCompatibilityVerified", "installedDependenciesVerified",
    "authorizationGranted", "executable", "applied", "wrote", "sent", "executed"]) assert.equal(r.facts[key], false, key);
}
function check(r) {
  assert.deepEqual(Object.keys(r).sort(), ["schemaVersion", "state", "components", "reasons", "descriptorSha256", "bundleHash", "facts"].sort());
  assert.equal(r.schemaVersion, "1.0.0"); assert.deepEqual(r.reasons, [...new Set(r.reasons)].sort());
  assert.ok(Buffer.byteLength(JSON.stringify(r)) <= LIMITS.reportBytes);
  assert.doesNotMatch(JSON.stringify(r), /fictitious|demo-memory|demo-skill|private-marker|fixture-sensitive|\.invalid|candidateServer|planHash|stack/);
  for (const value of [r, r.components, r.reasons, r.facts, ...r.components]) assert.equal(Object.isFrozen(value), true);
  for (const c of r.components) assert.deepEqual(Object.keys(c).sort(), ["id", "status", "code"].sort());
  if (r.state !== "coherent") { assert.equal(r.descriptorSha256, null); assert.equal(r.bundleHash, null); }
  facts(r, r.state === "coherent"); return r;
}
function result(input, state, reason, count = 5) {
  const r = check(summarize(input)); assert.equal(r.state, state); assert.ok(r.reasons.includes(code(reason)), r.reasons.join(","));
  assert.equal(r.components.length, count); if (count === 5) assert.deepEqual(r.components.map(c => c.id), ROLES); return r;
}
const invalid = input => result(input, "invalid", "INPUT", 0);
function negative(f, role, state = "blocked") {
  const c = f.components[role]; c.state = state;
  if (role === "configuration") Object.assign(c, { mcpName: null, fileState: "unknown", entryState: null, configurationSha256: null, metadataSha256: null, server: null });
  if (role === "skill") Object.assign(c, { skillName: state === "conflict" ? f.descriptor.identity.skillName : null, sourceSha256: null, metadataSha256: null, resolvedSource: null });
  if (role === "artifacts") Object.assign(c, { hashes: null, metadataSha256: null });
  if (role === "manifest") Object.assign(c, { descriptorSha256: null, manifestSha256: null });
  if (role === "package") Object.assign(c, { descriptorSha256: null, packageJsonSha256: null, packageLockSha256: null });
  return c;
}

test("A1h coherent declarations have frozen owned modest report, never operational evidence", () => {
  const f = fixture(), before = structuredClone(f), r = result(f, "coherent", "COHERENT");
  assert.equal(r.descriptorSha256, memoryConnectionHash(f.descriptor)); assert.equal(r.bundleHash, memoryConnectionHash(f));
  assert.deepEqual(r.components.map(c => [c.status, c.code]), ROLES.map(() => ["declared-matched", code("MATCH")]));
  assert.deepEqual(f, before); assert.equal(Object.isFrozen(f), false); assert.equal(Object.isFrozen(f.components), false);
  assert.throws(() => { r.facts.authorizationGranted = true; }, TypeError);
  f.components.configuration.server.enabled = false; f.reviewedPins.manifestSha256 = wrong;
  assert.equal(r.bundleHash, memoryConnectionHash(before)); assert.equal(r.state, "coherent");
});
test("A1h canonical object order, mutable descriptor and null-prototype envelope", () => {
  const f = fixture(), original = result(f, "coherent", "COHERENT"), reversed = Object.fromEntries(Object.entries(f).reverse());
  reversed.components = Object.fromEntries(Object.entries(f.components).reverse()); reversed.reviewedPins = Object.fromEntries(Object.entries(f.reviewedPins).reverse());
  reversed.descriptor = JSON.parse(JSON.stringify(f.descriptor));
  assert.equal(result(Object.assign(Object.create(null), reversed), "coherent", "COHERENT").bundleHash, original.bundleHash);
  assert.equal(Object.isFrozen(reversed.descriptor), false);
});
test("A1h changed metadata or tools order changes declaration pin, not provenance or permission", () => {
  const f = fixture(), a = result(f, "coherent", "COHERENT");
  f.components.artifacts.metadataSha256 = "9".repeat(64); const b = result(f, "coherent", "COHERENT"); assert.notEqual(b.bundleHash, a.bundleHash);
  f.components.configuration.server.enabled_tools.reverse(); const c = result(f, "coherent", "COHERENT"); assert.notEqual(c.bundleHash, b.bundleHash);
  // These entirely synthetic, caller-constructed reports still do not prove origin.
  facts(c, true);
});
test("A1h closed metadata rejects getters, proxies, hooks, cycles, symbols and byte captures without executing them", () => {
  const f = fixture(); let calls = 0; const deny = () => { calls++; throw Error("private-marker"); };
  const bad = [undefined, null, true, [], "{}", Buffer.from("{}"), new Uint8Array(2), {},
    { ...f, extra: true }, { ...f, toJSON: deny }, { ...f, [Symbol("extra")]: 1 }, Object.assign(Object.create({}), f),
    new Proxy(f, { ownKeys: deny, get: deny, getPrototypeOf: deny })];
  for (const key of Object.keys(f)) {
    const missing = { ...f }; delete missing[key]; bad.push(missing);
    bad.push(Object.defineProperty({ ...f }, key, { enumerable: true, get: deny }));
    bad.push(Object.defineProperty({ ...f }, key, { enumerable: false, value: f[key] }));
  }
  const cyclic = { ...f }; cyclic.components = cyclic; bad.push(cyclic);
  const revoked = Proxy.revocable(f, {}); revoked.revoke(); bad.push(revoked.proxy);
  const hooked = { ...f.descriptor }; Object.defineProperty(hooked, "identity", { enumerable: true, get: deny }); bad.push({ ...f, descriptor: hooked });
  bad.push({ ...f, descriptor: new Proxy(f.descriptor, { get: deny, ownKeys: deny }) });
  for (const role of ROLES) {
    const copy = structuredClone(f); copy.components[role] = new Proxy(copy.components[role], { get: deny, ownKeys: deny }); bad.push(copy);
    const other = structuredClone(f); Object.defineProperty(other.components[role], "state", { enumerable: true, get: deny }); bad.push(other);
  }
  for (const input of bad) invalid(input); assert.equal(calls, 0);
});
for (const value of [null, true, 1, "2.0.0"]) test("A1h schema version " + JSON.stringify(value), () => invalid({ ...fixture(), schemaVersion: value }));
for (const field of ["reviewedPins", "components"]) test("A1h required closed object " + field, () => {
  for (const value of [null, [], "x", 1]) invalid({ ...fixture(), [field]: value });
  const f = fixture(); f[field].extra = null; invalid(f);
});
for (const key of ["configurationSha256", "skillSha256", ...ARTIFACTS]) test("A1h reviewed pin exact " + key, () => {
  for (const value of [null, 1, "A".repeat(64), "a".repeat(63), "z".repeat(64), " " + wrong]) {
    if (key === "configurationSha256" && value === null) continue;
    const f = fixture(); f.reviewedPins[key] = value; invalid(f);
  }
  const f = fixture(); delete f.reviewedPins[key]; invalid(f);
});
for (const delta of [{ toolkitRoot: "/fictitious/a1h café 🐦/vault/toolkit" }, { manifestPath: "/fictitious/a1h café 🐦/outside.json" }]) test("A1h root layout " + Object.keys(delta)[0], () => invalid(fixture(delta)));
test("A1h altered descriptor and dangerous keys never become trusted metadata", () => {
  const f = fixture(); f.descriptor = structuredClone(f.descriptor); f.descriptor.facts.nativeReadVerified = true; invalid(f);
  for (const key of ["__proto__", "constructor", "prototype"]) { const g = fixture(); Object.defineProperty(g, key, { enumerable: true, value: {} }); invalid(g); }
});
for (const role of ROLES) {
  test("A1h exact projection shape " + role, () => {
    const original = fixture();
    for (const key of Object.keys(original.components[role])) { const f = fixture(); delete f.components[role][key]; invalid(f); }
    for (const value of [[], "x", 1, false]) { const f = fixture(); f.components[role] = value; invalid(f); }
    for (const extra of ["facts", "reasons", "schemaVersion", "authorizationGranted"]) { const f = fixture(); f.components[role][extra] = {}; invalid(f); }
    for (const value of [null, "unknown", true, 1]) { const f = fixture(); f.components[role].state = value; invalid(f); }
  });
  test("A1h malformed binding " + role, () => {
    for (const value of [null, 1, "A".repeat(64), "x", "a".repeat(65)]) { const f = fixture(); f.components[role].bindingSha256 = value; invalid(f); }
  });
  test("A1h binding from another descriptor blocks " + role, () => {
    const f = fixture(); f.components[role].bindingSha256 = wrong;
    const r = result(f, "blocked", "BINDING"); assert.equal(r.components.find(c => c.id === role).code, code("BINDING"));
    const g = fixture(); negative(g, role); g.components[role].bindingSha256 = wrong; result(g, "blocked", "BINDING");
  });
  test("A1h whole report mixed from another project " + role, () => {
    const f = fixture(), other = fixture({ homeDirectory: "/fictitious/other-home" });
    f.components[role] = other.components[role]; result(f, "blocked", "BINDING");
    const missing = fixture(); delete missing.components[role]; invalid(missing);
  });
  test("A1h missing report is incomplete " + role, () => {
    const f = fixture(); f.components[role] = null; const r = result(f, "incomplete", "MISSING");
    assert.equal(r.components.find(c => c.id === role).status, "not-provided");
  });
  for (const state of ["blocked", "invalid", ...(role === "skill" ? ["conflict"] : [])]) test("A1h negative component " + role + " " + state, () => {
    const f = fixture(); negative(f, role, state); const r = result(f, "blocked", role.toUpperCase());
    assert.equal(r.components.find(c => c.id === role).status, state === "conflict" ? "conflict" : "blocked");
  });
}
for (const [role, fields] of [
  ["configuration", ["configurationSha256", "metadataSha256"]], ["skill", ["sourceSha256", "metadataSha256"]],
  ["manifest", ["descriptorSha256", "manifestSha256"]], ["package", ["descriptorSha256", "packageJsonSha256", "packageLockSha256"]]
]) for (const field of fields) test("A1h positive hash typing " + role + " " + field, () => {
  for (const value of [null, "x", "A".repeat(64), 1]) { const f = fixture(); f.components[role][field] = value; invalid(f); }
});
for (const key of ARTIFACTS) test("A1h artifact exact hashes and pins " + key, () => {
  const f = fixture(); f.components.artifacts.hashes[key] = wrong; result(f, "blocked", "PINS");
  for (const value of [null, "x", "A".repeat(64), 1]) { const g = fixture(); g.components.artifacts.hashes[key] = value; invalid(g); }
  const g = fixture(); delete g.components.artifacts.hashes[key]; invalid(g);
});
test("A1h artifact malformed hash container or metadata is invalid", () => {
  for (const value of [null, [], "x", 1]) { const f = fixture(); f.components.artifacts.hashes = value; invalid(f); }
  const f = fixture(); f.components.artifacts.hashes.extra = wrong; invalid(f);
  for (const value of [null, "x", 1]) { const g = fixture(); g.components.artifacts.metadataSha256 = value; invalid(g); }
});
for (const role of ["manifest", "package"]) test("A1h result descriptor binding " + role, () => {
  const f = fixture(); f.components[role].descriptorSha256 = wrong; result(f, "blocked", "BINDING");
});
for (const [role, fields] of [["configuration", ["configurationSha256"]], ["skill", ["sourceSha256"]],
  ["manifest", ["manifestSha256"]], ["package", ["packageJsonSha256", "packageLockSha256"]]]) {
  for (const field of fields) test("A1h pin contradiction " + role + " " + field, () => {
    const f = fixture(); f.components[role][field] = wrong; result(f, "blocked", "PINS");
  });
}
for (const key of ["configurationSha256", "skillSha256", ...ARTIFACTS]) test("A1h reviewed pin changed without matching report " + key, () => {
  const f = fixture(); f.reviewedPins[key] = wrong; result(f, "blocked", "PINS");
});
test("A1h manifests/packages cannot hide disagreement behind matched artifacts", () => {
  const f = fixture(); f.reviewedPins.manifestSha256 = wrong; f.components.manifest.manifestSha256 = wrong;
  const r = result(f, "blocked", "PINS"); assert.equal(r.components.find(c => c.id === "artifacts").status, "blocked");
  f.components.artifacts.hashes.manifestSha256 = wrong; result(f, "coherent", "COHERENT");
});
test("A1h negative components cannot carry positive hashes or sources", () => {
  for (const role of ROLES) {
    const base = fixture().components[role];
    const f = fixture(); negative(f, role);
    for (const key of Object.keys(f.components[role]).filter(key => f.components[role][key] === null && base[key] !== null)) {
      const g = fixture(); negative(g, role); g.components[role][key] = base[key];
      if (["mcpName", "skillName"].includes(key)) result(g, "blocked", role.toUpperCase()); else invalid(g);
    }
  }
});
test("A1h configuration observed/absent/negative tuples are strict", () => {
  for (const [key, values] of [["fileState", [null, "absent", "unknown"]], ["entryState", [null, "other", 1]], ["server", [null, [], "x", 1]], ["mcpName", [null, 1]]]) {
    for (const value of values) { const f = fixture(); f.components.configuration[key] = value; invalid(f); }
  }
  const f = fixture(); f.components.configuration.entryState = "absent"; invalid(f);
  f.components.configuration.server = null; result(f, "incomplete", "MISSING");
  f.components.configuration.fileState = "absent"; invalid(f);
  for (const role of ["configuration", "skill"]) { const g = fixture(); negative(g, role); g.components[role][role === "configuration" ? "mcpName" : "skillName"] = "other-name"; invalid(g); }
});
test("A1h absent configuration must match null pin and keeps metadata only", () => {
  const f = fixture(), c = f.components.configuration;
  Object.assign(c, { state: "absent", fileState: "absent", entryState: null, server: null, configurationSha256: null });
  result(f, "blocked", "PINS"); f.reviewedPins.configurationSha256 = null; result(f, "incomplete", "MISSING");
  c.metadataSha256 = null; invalid(f);
});
test("A1h expected absence cannot accept an observed configuration", () => {
  const f = fixture(); f.reviewedPins.configurationSha256 = null; result(f, "blocked", "PINS");
});
test("A1h absent skill preserves source pin but has no installation or resolved path", () => {
  const f = fixture(); f.components.skill.state = "absent"; invalid(f);
  f.components.skill.resolvedSource = null; const r = result(f, "incomplete", "MISSING"); assert.equal(r.components[1].status, "missing");
  f.components.skill.sourceSha256 = null; invalid(f);
});
for (const [field, value] of [["mcpName", "different-memory"], ["skillName", "different-skill"], ["resolvedSource", "/fictitious/other-source"]]) test("A1h named identity contradiction " + field, () => {
  const f = fixture(), role = field === "mcpName" ? "configuration" : "skill"; f.components[role][field] = value;
  result(f, "blocked", role.toUpperCase());
});
for (const field of ["skillName", "resolvedSource"]) test("A1h skill fields not coerced " + field, () => {
  for (const value of [null, 1, {}, []]) { const f = fixture(); f.components.skill[field] = value; invalid(f); }
});
for (const [label, modify] of [
  ["command", s => { s.command = "/different/runtime"; }], ["cwd", s => { s.cwd += "/other"; }], ["cwd-missing", s => { delete s.cwd; }],
  ["args-reordered", s => { s.args.reverse(); }], ["args-extra", s => { s.args.push("--extra"); }], ["args-short", s => { s.args.pop(); }],
  ["tools-extra", s => { s.enabled_tools.push("write_file"); }], ["tools-short", s => { s.enabled_tools.pop(); }],
  ["tools-duplicate", s => { s.enabled_tools[0] = s.enabled_tools[1]; }], ["enabled-missing", s => { delete s.enabled; }],
  ["enabled-string", s => { s.enabled = "true"; }], ["env-extra", s => { s.env = { EXTRA: "declared-only" }; }],
  ["args-type", s => { s.args = "argument"; }], ["args-entry", s => { s.args[0] = 1; }], ["args-limit", s => { s.args = Array(17).fill("arg"); }],
  ["tools-type", s => { s.enabled_tools = {}; }], ["tools-entry", s => { s.enabled_tools[0] = 1; }], ["tools-limit", s => { s.enabled_tools = Array(17).fill("tool"); }],
  ["command-type", s => { s.command = 1; }], ["cwd-type", s => { s.cwd = null; }],
  ["legacy", s => { s.command = "npx"; s.args = ["-y", "@modelcontextprotocol/server-filesystem@2026.8.31", "/fictitious/vault"]; }],
  ["empty-table", s => { for (const key of Object.keys(s)) delete s[key]; }]
]) test("A1h protected tuple conflict " + label, () => {
  const f = fixture(); modify(f.components.configuration.server); const r = result(f, "blocked", "CONFIGURATION"); assert.equal(r.components[0].status, "conflict");
});
test("A1h disabled is incomplete, no enabled default or mismatch with disabled descriptor", () => {
  const f = fixture(); assert.equal(f.descriptor.server.enabled, false); f.components.configuration.server.enabled = false;
  const r = result(f, "incomplete", "DISABLED"); assert.equal(r.components[0].status, "disabled");
  f.components.configuration.server.enabled = true; result(f, "coherent", "COHERENT");
});
for (const [field, values] of [["command", [" leading", "trailing ", "x\u0000", "x\u202e", "\ud800"]], ["args", [["x\n"]]], ["enabled_tools", [["x\t"]]]]) test("A1h strings safe before tuple classification " + field, () => {
  for (const value of values) { const f = fixture(); f.components.configuration.server[field] = value; invalid(f); }
});
test("A1h string bounds include ignored server fields and resolvedSource", () => {
  const f = fixture(); f.components.configuration.server.extra = "x".repeat(4096); result(f, "blocked", "CONFIGURATION");
  f.components.configuration.server.extra += "x"; invalid(f);
  const g = fixture(); g.components.skill.resolvedSource = "x".repeat(4096); result(g, "blocked", "SKILL");
  g.components.skill.resolvedSource += "x"; invalid(g);
});
test("A1h raw reports are not silently stripped or promoted", () => {
  const f = fixture(); f.components.package = { schemaVersion: "1.0.0", state: "consistent", descriptorSha256: memoryConnectionHash(f.descriptor),
    packageJsonSha256: f.reviewedPins.packageJsonSha256, packageLockSha256: f.reviewedPins.packageLockSha256,
    facts: { localReadVerified: true, nativeReadVerified: true }, reasons: ["private-marker"] }; invalid(f);
});
test("A1h missing reports and disabled duplicates aggregate fixed reasons deterministically", () => {
  const f = fixture(); f.components.artifacts = null; f.components.manifest = null; f.components.configuration.server.enabled = false;
  const r = result(f, "incomplete", "MISSING"); assert.deepEqual(r.reasons, [code("DISABLED"), code("MISSING")]);
  for (const role of ROLES) f.components[role] = null;
  const empty = result(f, "incomplete", "MISSING"); assert.deepEqual(empty.reasons, [code("MISSING")]); assert.ok(empty.components.every(c => c.status === "not-provided"));
});
test("A1h invalid dominates blocked; blocked dominates missing; per-role binding then pin then role then pending", () => {
  const f = fixture(); f.components.artifacts = null; f.components.configuration.server.enabled = false; negative(f, "manifest");
  let r = result(f, "blocked", "MANIFEST"); assert.deepEqual(r.reasons, [code("DISABLED"), code("MANIFEST"), code("MISSING")]);
  f.components.skill.extra = true; invalid(f); delete f.components.skill.extra;
  const c = f.components.configuration; c.bindingSha256 = wrong; c.configurationSha256 = wrong; c.mcpName = "other-name";
  r = result(f, "blocked", "BINDING"); assert.equal(r.components[0].code, code("BINDING"));
  c.bindingSha256 = memoryConnectionHash(f.descriptor); r = result(f, "blocked", "PINS"); assert.equal(r.components[0].code, code("PINS"));
  c.configurationSha256 = f.reviewedPins.configurationSha256; r = result(f, "blocked", "CONFIGURATION"); assert.equal(r.components[0].code, code("CONFIGURATION"));
});
for (const value of [["ghp", "_"].join("") + "a".repeat(40), ["api", "_key=fixture-sensitive"].join(""), "https://user:" + "fixture-sensitive@remote.invalid",
  "https://remote.invalid?" + ["access", "_token=fixture-sensitive"].join("")]) test("A1h sensitive declared fields block globally " + value.slice(0, 5), () => {
  const f = fixture(); f.components.configuration.server.extra = value; result(f, "blocked", "SENSITIVE", 0);
});
function padded(target) {
  const f = fixture(), server = f.components.configuration.server;
  let i = 0;
  while (Buffer.byteLength(JSON.stringify(f)) + 4200 < target) server["padding" + i++] = "x".repeat(4000);
  server.paddingLastA = ""; server.paddingLastB = "";
  const needed = target - Buffer.byteLength(JSON.stringify(f)); assert.ok(needed >= 0 && needed <= 8192);
  server.paddingLastA = "x".repeat(Math.min(4096, needed)); server.paddingLastB = "x".repeat(Math.max(0, needed - 4096));
  assert.equal(Buffer.byteLength(JSON.stringify(f)), target); return f;
}
test("A1h exact total byte limit, not per component; one extra byte blocks globally", () => {
  const exact = padded(LIMITS.inputBytes); result(exact, "blocked", "CONFIGURATION");
  result(padded(LIMITS.inputBytes + 1), "blocked", "LIMIT", 0);
  const unicode = fixture(); unicode.components.configuration.server.extra = "é".repeat(LIMITS.inputBytes / 2);
  result(unicode, "blocked", "LIMIT", 0);
});
for (const size of [256, 257]) test("A1h array copy budget " + size, () => {
  const f = fixture(); f.components.configuration.server.noise = Array(size).fill(0);
  result(f, "blocked", size === 256 ? "CONFIGURATION" : "LIMIT", size === 256 ? 5 : 0);
});
const depth = value => value !== null && typeof value === "object" ? Math.max(0, ...Object.values(value).map(v => 1 + depth(v))) : 0;
for (const limit of [64, 65]) test("A1h depth copy budget " + limit, () => {
  const f = fixture(), server = f.components.configuration.server; server.noise = 0;
  while (depth(f) < limit) server.noise = { x: server.noise };
  result(f, "blocked", limit === 64 ? "CONFIGURATION" : "LIMIT", limit === 64 ? 5 : 0);
});
const nodes = value => 1 + (value !== null && typeof value === "object" ? Object.values(value).reduce((n, v) => n + nodes(v), 0) : 0);
for (const count of [30000, 30001]) test("A1h node copy budget " + count, () => {
  const f = fixture(), noise = []; f.components.configuration.server.noise = noise;
  let remaining = count - nodes(f);
  while (remaining > 0) { if (remaining === 1) { noise.push(0); remaining--; } else { const n = Math.min(255, remaining - 1); noise.push(Array(n).fill(0)); remaining -= n + 1; } }
  assert.equal(nodes(f), count); assert.ok(noise.length <= 256); assert.ok(Buffer.byteLength(JSON.stringify(f)) < LIMITS.inputBytes);
  result(f, "blocked", count === 30000 ? "CONFIGURATION" : "LIMIT", count === 30000 ? 5 : 0);
});
test("A1h unexpected exceptions are blocked, global and redacted", () => {
  const input = fixture(), original = JSON.stringify;
  JSON.stringify = function(value, ...args) { if (value?.components?.package) throw Error("fixture-sensitive"); return original(value, ...args); };
  let r; try { r = summarize(input); } finally { JSON.stringify = original; }
  check(r); assert.equal(r.state, "blocked"); assert.deepEqual(r.reasons, [code("VALIDATION")]); assert.deepEqual(r.components, []);
});
test("A1h evaluation does no destination IO, discovery, network, subprocess or module loading", () => {
  const input = fixture(), restore = []; let calls = 0;
  const deny = () => { calls++; throw Error("private-marker"); };
  const replace = (obj, key) => { const original = obj[key]; obj[key] = deny; restore.push(() => { obj[key] = original; }); };
  for (const key of ["readFile", "lstat", "stat", "open", "realpath", "readdir", "writeFile", "mkdir", "rm", "rename", "chmod"]) replace(fsp, key);
  for (const key of ["readFileSync", "lstatSync", "statSync", "openSync", "realpathSync", "readdirSync", "writeFileSync", "mkdirSync", "rmSync"]) replace(fs, key);
  for (const key of ["spawn", "spawnSync", "exec", "execSync", "execFile", "execFileSync", "fork"]) replace(childProcess, key);
  for (const obj of [http, https]) for (const key of ["request", "get"]) replace(obj, key);
  for (const key of ["connect", "createConnection"]) replace(net, key);
  replace(Module, "_load"); replace(Module, "createRequire"); replace(globalThis, "fetch"); replace(process, "cwd"); replace(os, "homedir");
  const originalEnv = process.env; process.env = new Proxy(originalEnv, { get: deny, ownKeys: deny }); restore.push(() => { process.env = originalEnv; });
  let r; try { r = summarize(input); } finally { for (const fn of restore.reverse()) fn(); }
  assert.equal(calls, 0); check(r); assert.equal(r.state, "coherent");
});
