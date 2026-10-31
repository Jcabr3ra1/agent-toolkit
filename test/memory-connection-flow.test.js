import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import syncFS, { constants } from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import childProcess from "node:child_process";
import { createHash } from "node:crypto";
import { createMemoryConnectionDescriptor, memoryConnectionHash } from "../src/memory-connection-descriptor.js";
import { collectMemoryConnectionConfiguration } from "../src/memory-connection-files.js";
import { inspectMemoryConnectionSkill } from "../src/memory-connection-skill.js";
import { inspectMemoryConnectionArtifacts } from "../src/memory-connection-artifacts.js";
import { validateMemoryConnectionManifest } from "../src/memory-connection-manifest.js";
import { validateMemoryConnectionPackage } from "../src/memory-connection-package.js";
import { summarizeMemoryConnectionEvidence } from "../src/memory-connection-diagnostic.js";

const roles = ["configuration", "skill", "artifacts", "manifest", "package"];
const artifactKeys = ["nodeSha256", "binSha256", "manifestSha256", "packageJsonSha256", "packageLockSha256"];
const pinKeys = ["configurationSha256", "skillSha256", ...artifactKeys];
const digest = b => createHash("sha256").update(b).digest("hex");
const json = value => Buffer.from(JSON.stringify(value) + "\n");
const posixSkip = !["darwin", "linux"].includes(process.platform) || !process.getuid || constants.O_NOFOLLOW === undefined
  ? "Requires real collector integration with POSIX uid/mode and O_NOFOLLOW filesystem attestation (darwin/linux)." : false;
const localTest = (name, fn) => test("A2a " + name, {
  skip: posixSkip
}, fn);

async function fixture(t, options = {}) {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "agent-toolkit-a2a-test-")));
  await fs.chmod(root, 0o700);
  const ownership = await fs.lstat(root);
  t.after(async () => {
    const s = await fs.lstat(root);
    assert.ok(s.isDirectory() && !s.isSymbolicLink());
    assert.equal(await fs.realpath(root), root);
    assert.equal(path.dirname(root), await fs.realpath(os.tmpdir()));
    assert.match(path.basename(root), /^agent-toolkit-a2a-test-/);
    assert.equal(s.mode & 0o7777, 0o700);
    for (const key of ["uid", "dev", "ino"]) assert.equal(s[key], ownership[key]);
    await fs.rm(root, { recursive: true }); // Only this exact validated, owned fixture.
  });
  const toolkit = root + "/toolkit café 🐦", vault = root + "/vault", home = root + "/home";
  const descriptor = createMemoryConnectionDescriptor({
    agent: "codex", mcpName: "demo-memory", skillName: "demo-skill",
    nodePath: root + "/runtime/node", toolkitRoot: toolkit, vaultPath: vault,
    manifestPath: vault + "/project-memory.json", sourcePath: root + "/source", homeDirectory: home
  });
  const manifest = {
    schemaVersion: "1.0.0", project: { id: "demo-project", name: "Fictitious project" },
    source: { repositoryPath: "../source", defaultBranch: "main" },
    memory: { vaultPath: ".", mcpServerName: "demo-memory", repositoryBranch: "main", syncMode: "none" },
    agents: [{ id: "codex", enabled: true, skillName: "demo-skill" }],
    security: { mcpAccess: "read-only", sensitiveDataPolicy: "forbidden", writeRequiresExplicitAuthorization: true, allowCredentialsInMemory: false }
  };
  const pkg = { name: "fictitious-package", version: "1.0.0", dependencies: { "demo-lib": "1.0.0" }, engines: { node: "^24.0.0" } };
  const lock = { name: pkg.name, version: pkg.version, lockfileVersion: 3,
    packages: { "": structuredClone(pkg), "node_modules/demo-lib": { version: "1.0.0" } } };
  if (options.manifestUnsafe) manifest.security.writeRequiresExplicitAuthorization = false;
  if (options.packageContradiction) lock.packages[""].dependencies["demo-lib"] = "2.0.0";
  let config = "[mcp_servers.demo-memory]\n";
  for (const [key, value] of Object.entries({ ...descriptor.server, enabled: !options.disabled })) {
    if (options.partial && key === "enabled_tools") continue;
    config += key + " = " + JSON.stringify(value) + "\n";
  }
  if (options.noEntry) config = "[mcp_servers.other-memory]\nenabled = false\n";
  const paths = {
    configurationSha256: descriptor.configurationPath,
    skillSha256: descriptor.skill.source + "/SKILL.md",
    nodeSha256: descriptor.identity.nodePath,
    binSha256: toolkit + "/bin/project-memory-mcp.js",
    manifestSha256: descriptor.identity.manifestPath,
    packageJsonSha256: toolkit + "/package.json",
    packageLockSha256: toolkit + "/package-lock.json"
  };
  const bytes = {
    configurationSha256: Buffer.from(config),
    skillSha256: Buffer.from("# Fictitious Skill\nInert fixture, never load or execute.\n"),
    nodeSha256: Buffer.from("Inert Node fixture, never execute.\n"),
    binSha256: Buffer.from("Inert bin fixture, never execute.\n"),
    manifestSha256: options.manifestMalformed ? Buffer.from("{not JSON}\n") : json(manifest),
    packageJsonSha256: json(pkg), packageLockSha256: json(lock)
  };
  // Reviewed fixture pins are fixed BEFORE filesystem writes or observations.
  const reviewedPins = Object.fromEntries(pinKeys.map(key => [key, digest(bytes[key])]));
  if (options.noConfig) reviewedPins.configurationSha256 = null;
  if (options.wrongPin) reviewedPins[options.wrongPin] = "f".repeat(64);
  for (const directory of [root + "/source", root + "/runtime", toolkit + "/bin",
    descriptor.skill.source, home + "/.codex", home + "/.agents/skills"]) {
    await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  }
  for (const key of pinKeys) {
    if (options.noConfig && key === "configurationSha256" || options.noSkillSource && key === "skillSha256") continue;
    await fs.writeFile(paths[key], bytes[key], { mode: key === "nodeSha256" ? 0o755 : 0o600 });
  }
  if (!options.noSkillLink) {
    await fs.symlink(options.foreignSkill ? root + "/foreign-skill" : descriptor.skill.source, descriptor.skill.target);
  }
  return { root, descriptor, paths, bytes, reviewedPins };
}

// Test-only projection, explicit and closed: no facts, reasons or defaults promoted.
function projectReports(descriptor, raw) {
  const bindingSha256 = memoryConnectionHash(descriptor), c = raw.configuration, s = raw.skill;
  const a = raw.artifacts, m = raw.manifest, p = raw.package;
  return {
    configuration: { bindingSha256, state: c.state, mcpName: c.mcpName, fileState: c.fileState,
      entryState: c.entryState, configurationSha256: c.configurationSha256, metadataSha256: c.metadataSha256, server: c.server },
    skill: { bindingSha256, state: s.state, skillName: s.skillName, sourceSha256: s.sourceSha256,
      metadataSha256: s.metadataSha256, resolvedSource: s.resolvedSource },
    artifacts: { bindingSha256, state: a.state, hashes: a.hashes, metadataSha256: a.metadataSha256 },
    manifest: { bindingSha256, state: m.state, descriptorSha256: m.descriptorSha256, manifestSha256: m.manifestSha256 },
    package: { bindingSha256, state: p.state, descriptorSha256: p.descriptorSha256,
      packageJsonSha256: p.packageJsonSha256, packageLockSha256: p.packageLockSha256 }
  };
}

async function pipeline(f) {
  const { descriptor, reviewedPins: pins, bytes } = f;
  const raw = {};
  raw.configuration = await collectMemoryConnectionConfiguration({
    homeDirectory: descriptor.identity.homeDirectory, configurationPath: descriptor.configurationPath, mcpName: descriptor.identity.mcpName
  });
  raw.skill = await inspectMemoryConnectionSkill({ descriptor, expectedSkillSha256: pins.skillSha256 });
  raw.artifacts = await inspectMemoryConnectionArtifacts({ descriptor,
    expectedHashes: Object.fromEntries(artifactKeys.map(key => [key, pins[key]])) });
  // Provided reviewed bytes, NOT an atomic filesystem capture or automatic approval.
  raw.manifest = validateMemoryConnectionManifest({ descriptor, manifestBytes: bytes.manifestSha256, expectedManifestSha256: pins.manifestSha256 });
  raw.package = validateMemoryConnectionPackage({ descriptor, packageJsonBytes: bytes.packageJsonSha256,
    packageLockBytes: bytes.packageLockSha256, expectedPackageJsonSha256: pins.packageJsonSha256, expectedPackageLockSha256: pins.packageLockSha256 });
  const envelope = { schemaVersion: "1.0.0", descriptor, reviewedPins: pins, components: projectReports(descriptor, raw) };
  return { raw, envelope, report: summarizeMemoryConnectionEvidence(envelope) };
}

async function snapshot(root) {
  const entries = {};
  async function visit(p) {
    const s = await fs.lstat(p);
    entries[p] = Object.fromEntries(["dev", "ino", "mode", "uid", "gid", "nlink", "size", "mtimeMs", "ctimeMs"].map(key => [key, s[key]]));
    if (s.isSymbolicLink()) entries[p].target = await fs.readlink(p);
    else if (s.isFile()) entries[p].sha256 = digest(await fs.readFile(p));
    else if (s.isDirectory()) for (const name of (await fs.readdir(p)).sort()) await visit(path.join(p, name));
    else assert.fail("Unexpected fixture resource");
  }
  await visit(root); return entries;
}

async function guardedPipeline(t, f) {
  const before = await snapshot(f.root), homeBefore = process.env.HOME, cwdBefore = process.cwd();
  const allowedFiles = new Set(Object.values(f.paths)), allowedMetadata = new Set(["/"]);
  for (const full of [...allowedFiles, f.descriptor.skill.target]) {
    const parts = full.slice(1).split("/");
    for (let i = 1; i <= parts.length; i++) allowedMetadata.add("/" + parts.slice(0, i).join("/"));
  }
  const calls = { opened: [], closed: [], links: [], forbidden: 0 };
  const deny = () => { calls.forbidden++; throw Error("Forbidden operation in fictitious read-only flow"); };
  const originalOpen = fs.open.bind(fs), originalLstat = fs.lstat.bind(fs), originalReadlink = fs.readlink.bind(fs);
  try {
    for (const name of ["writeFile", "appendFile", "mkdir", "chmod", "chown", "unlink", "rm", "rmdir", "rename", "copyFile", "cp", "symlink", "link", "truncate", "utimes", "readFile", "readdir", "realpath"]) t.mock.method(fs, name, deny);
    for (const name of ["writeFileSync", "appendFileSync", "mkdirSync", "chmodSync", "unlinkSync", "rmSync", "renameSync", "openSync", "readFileSync", "createWriteStream", "createReadStream"]) t.mock.method(syncFS, name, deny);
    for (const name of ["spawn", "spawnSync", "exec", "execSync", "execFile", "execFileSync", "fork"]) t.mock.method(childProcess, name, deny);
    for (const obj of [http, https]) for (const name of ["request", "get"]) t.mock.method(obj, name, deny);
    for (const name of ["connect", "createConnection", "createServer"]) t.mock.method(net, name, deny);
    t.mock.method(net.Socket.prototype, "connect", deny);
    t.mock.method(globalThis, "fetch", deny); t.mock.method(process, "chdir", deny);
    t.mock.method(fs, "lstat", p => { assert.ok(allowedMetadata.has(p), "Unlisted metadata path"); return originalLstat(p); });
    t.mock.method(fs, "readlink", p => {
      assert.equal(p, f.descriptor.skill.target); calls.links.push(p); return originalReadlink(p);
    });
    t.mock.method(fs, "open", async (p, flags) => {
      assert.ok(allowedFiles.has(p), "Unlisted content path");
      assert.equal(flags, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
      calls.opened.push(p); const h = await originalOpen(p, flags);
      return { stat: () => h.stat(), read: (...args) => h.read(...args), close: async () => { calls.closed.push(p); await h.close(); } };
    });
    const result = await pipeline(f);
    assert.equal(calls.forbidden, 0); assert.deepEqual(calls.closed, calls.opened);
    return { ...result, calls };
  } finally {
    t.mock.restoreAll();
    assert.equal(process.env.HOME, homeBefore); assert.equal(process.cwd(), cwdBefore);
    assert.deepEqual(await snapshot(f.root), before);
  }
}

function check(report, expected) {
  assert.equal(report.state, expected, JSON.stringify(report));
  assert.deepEqual(report.components.map(c => c.id), roles);
  assert.equal(report.facts.evidence, "declared-reports");
  assert.equal(report.facts.verificationScope, "cross-report-declarations-only");
  assert.equal(report.facts.declarationsLinked, expected === "coherent");
  assert.equal(report.facts.humanReviewRequired, true);
  for (const key of ["provenanceVerified", "snapshotAtomicVerified", "freshnessVerified", "physicalPathsVerified", "localReadVerified",
    "nativeReadVerified", "skillLoadedVerified", "runtimeVerified", "runtimeVersionVerified", "runtimeCompatibilityVerified",
    "installedDependenciesVerified", "authorizationGranted", "executable", "applied", "wrote", "sent", "executed"]) assert.equal(report.facts[key], false, key);
  for (const value of [report, report.facts, report.components, report.reasons, ...report.components]) assert.ok(Object.isFrozen(value));
  assert.doesNotMatch(JSON.stringify(report), /agent-toolkit-a2a-test-|demo-memory|demo-skill|fictitious|Inert|stack|server|resolvedSource/);
  if (expected === "coherent") {
    assert.match(report.descriptorSha256, /^[a-f0-9]{64}$/); assert.match(report.bundleHash, /^[a-f0-9]{64}$/);
  } else { assert.equal(report.descriptorSha256, null); assert.equal(report.bundleHash, null); }
}

localTest("real collectors and pure validators form a coherent fictitious journey", async t => {
  const f = await fixture(t), result = await guardedPipeline(t, f);
  assert.deepEqual(roles.map(role => result.raw[role].state), ["observed", "matched", "matched", "validated", "consistent"]);
  assert.deepEqual(result.raw.artifacts.hashes, Object.fromEntries(artifactKeys.map(key => [key, f.reviewedPins[key]])));
  assert.equal(result.raw.skill.sourceSha256, f.reviewedPins.skillSha256);
  assert.equal(result.raw.configuration.configurationSha256, f.reviewedPins.configurationSha256);
  assert.deepEqual(result.calls.opened, [f.paths.configurationSha256, f.paths.skillSha256, ...artifactKeys.map(key => f.paths[key])]);
  assert.ok(result.calls.links.length > 0);
  check(result.report, "coherent");
  assert.equal(result.report.descriptorSha256, memoryConnectionHash(f.descriptor));
  assert.equal(result.report.bundleHash, memoryConnectionHash(result.envelope));
  const repeated = await guardedPipeline(t, f); assert.deepEqual(repeated.report, result.report);
});

for (const [label, options, role, rawState, status] of [
  ["missing configuration", { noConfig: true }, "configuration", "absent", "missing"],
  ["missing own configuration entry", { noEntry: true }, "configuration", "observed", "missing"],
  ["disabled server", { disabled: true }, "configuration", "observed", "disabled"],
  ["missing Skill link", { noSkillLink: true }, "skill", "absent", "missing"]
]) localTest(label + " stays incomplete without repair", async t => {
  const f = await fixture(t, options), { raw, report } = await guardedPipeline(t, f);
  assert.equal(raw[role].state, rawState); check(report, "incomplete");
  assert.equal(report.components.find(c => c.id === role).status, status);
  if (options.noConfig) assert.equal(f.reviewedPins.configurationSha256, null);
  if (options.noEntry) assert.equal(raw.configuration.entryState, "absent");
  if (options.noSkillLink) assert.equal(raw.skill.sourceSha256, f.reviewedPins.skillSha256);
});

for (const key of pinKeys) localTest("wrong pre-reviewed pin blocks " + key, async t => {
  const f = await fixture(t, { wrongPin: key }), { raw, report } = await guardedPipeline(t, f);
  check(report, "blocked");
  if (key === "configurationSha256") {
    assert.equal(raw.configuration.state, "observed"); assert.ok(report.reasons.includes("MC_DIAGNOSTIC_PINS"));
  } else if (key === "skillSha256") assert.equal(raw.skill.state, "blocked");
  else assert.equal(raw.artifacts.state, "blocked");
  assert.equal(f.reviewedPins[key], "f".repeat(64)); // Never adopt the returned hash.
});

for (const [label, options, role, rawState] of [
  ["partial server tuple", { partial: true }, "configuration", "observed"],
  ["foreign Skill link", { foreignSkill: true }, "skill", "conflict"],
  ["missing Skill source", { noSkillSource: true }, "skill", "blocked"],
  ["unsafe manifest declarations", { manifestUnsafe: true }, "manifest", "blocked"],
  ["malformed manifest", { manifestMalformed: true }, "manifest", "blocked"],
  ["contradictory package root", { packageContradiction: true }, "package", "blocked"]
]) localTest(label + " blocks without changing existing modules", async t => {
  const f = await fixture(t, options), { raw, report, calls } = await guardedPipeline(t, f);
  assert.equal(raw[role].state, rawState); check(report, "blocked");
  if (role === "manifest" || role === "package") assert.equal(raw.artifacts.state, "matched");
  if (options.foreignSkill) assert.ok(!calls.opened.includes(f.paths.skillSha256));
});

localTest("an absent configuration never masks a manifest impediment", async t => {
  const f = await fixture(t, { noConfig: true, manifestUnsafe: true });
  const { report } = await guardedPipeline(t, f); check(report, "blocked");
  assert.equal(report.components[0].status, "missing");
  assert.ok(report.reasons.includes("MC_DIAGNOSTIC_MANIFEST"));
});

for (const key of ["configurationSha256", "skillSha256", "manifestSha256"]) {
  localTest("changed on-disk bytes after reviewed pins block " + key, async t => {
    const f = await fixture(t), reviewed = structuredClone(f.reviewedPins);
    const changed = key === "configurationSha256"
      ? Buffer.concat([f.bytes[key], Buffer.from("# Later fictitious change\n")])
      : Buffer.from("Later fictitious bytes, never execute.\n");
    await fs.writeFile(f.paths[key], changed); // Deliberate setup, BEFORE read-only guards.
    const { raw, report } = await guardedPipeline(t, f);
    check(report, "blocked"); assert.deepEqual(f.reviewedPins, reviewed);
    if (key === "configurationSha256") {
      assert.equal(raw.configuration.state, "observed"); assert.ok(report.reasons.includes("MC_DIAGNOSTIC_PINS"));
    } else if (key === "skillSha256") assert.equal(raw.skill.state, "blocked");
    else {
      assert.equal(raw.artifacts.state, "blocked");
      assert.equal(raw.manifest.state, "validated"); // Only provided reviewed bytes, not current file semantics.
    }
    assert.deepEqual(await fs.readFile(f.paths[key]), changed); // No repair or pin adoption.
  });
}

for (const role of roles) localTest("two real fictitious fixtures cannot mix " + role + " reports", async t => {
  const first = await fixture(t), second = await fixture(t);
  const a = await guardedPipeline(t, first), b = await guardedPipeline(t, second);
  check(a.report, "coherent"); check(b.report, "coherent");
  const mixed = structuredClone(a.envelope);
  mixed.components[role] = b.envelope.components[role]; // Preserve its foreign binding, never relabel it.
  const report = summarizeMemoryConnectionEvidence(mixed); check(report, "blocked");
  assert.ok(report.reasons.includes("MC_DIAGNOSTIC_BINDING"));
});

localTest("raw collector reports are not an accepted implicit projection", async t => {
  const f = await fixture(t), result = await guardedPipeline(t, f);
  const report = summarizeMemoryConnectionEvidence({ ...result.envelope, components: result.raw });
  assert.equal(report.state, "invalid"); assert.deepEqual(report.components, []);
  assert.deepEqual(report.reasons, ["MC_DIAGNOSTIC_INPUT"]);
  assert.equal(report.descriptorSha256, null); assert.equal(report.bundleHash, null);
  assert.equal(report.facts.authorizationGranted, false);
});
