import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import fsp from "node:fs/promises";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import childProcess from "node:child_process";
import { createMemoryConnectionDescriptor, memoryConnectionHash, freezeMemoryConnectionData } from "../src/memory-connection-descriptor.js";
import { createMemoryConnectionPlan } from "../src/memory-connection-plan.js";
import { summarizeMemoryConnectionEvidence } from "../src/memory-connection-diagnostic.js";
import { runCli } from "../src/cli.js";

const ROOT = "/fictitious/a2b café 🐦", TARGET = ROOT + "/vault";
const planPins = ["manifestSha256", "binSha256", "nodeSha256", "dependenciesSha256", "pathMetadataSha256", "skillMetadataSha256"];
const artifactPins = ["nodeSha256", "binSha256", "manifestSha256", "packageJsonSha256", "packageLockSha256"];
const counters = ["create", "update", "migrate", "unchanged", "conflicts", "blocked"];
function descriptor() {
  return createMemoryConnectionDescriptor({ agent: "codex", mcpName: "demo-memory", skillName: "demo-skill",
    nodePath: ROOT + "/runtime/node", toolkitRoot: ROOT + "/toolkit", sourcePath: ROOT + "/source",
    vaultPath: TARGET, manifestPath: TARGET + "/project-memory.json", homeDirectory: ROOT + "/home" });
}
function planFixture(kind = "matched") {
  const d = descriptor();
  const input = { schemaVersion: "1.0.0", descriptor: d, migrateLegacy: false,
    observations: { configuration: { state: "present", sha256: "a".repeat(64), server: { ...structuredClone(d.server), enabled: true } },
      skill: { state: "matched", resolvedSource: d.skill.source } },
    pins: Object.fromEntries(planPins.map((key, i) => [key, String(i + 1).repeat(64)])) };
  if (kind === "missing" || kind === "missing-both") input.observations.configuration = { state: "absent", sha256: null, server: null };
  if (kind === "missing-both") input.observations.skill = { state: "absent", resolvedSource: null };
  if (kind === "disabled") input.observations.configuration.server.enabled = false;
  if (kind === "conflict") input.observations.configuration.server.command = ROOT + "/foreign-node";
  if (kind === "unsafe") input.observations.configuration = { state: "unsafe", sha256: null, server: null };
  if (kind === "legacy") input.observations.configuration.server = {
    command: "npx", args: ["-y", "@modelcontextprotocol/server-filesystem@2026.8.31", TARGET], enabled: true
  };
  if (kind === "invalid") input.extra = true;
  return input;
}
function diagnosticFixture(kind = "matched") {
  const d = descriptor(), bindingSha256 = memoryConnectionHash(d), metadataSha256 = "8".repeat(64);
  const reviewedPins = Object.fromEntries(["configurationSha256", "skillSha256", ...artifactPins].map((key, i) => [key, String(i + 1).repeat(64)]));
  const input = { schemaVersion: "1.0.0", descriptor: d, reviewedPins, components: {
    configuration: { bindingSha256, state: "observed", mcpName: "demo-memory", fileState: "present", entryState: "observed",
      configurationSha256: reviewedPins.configurationSha256, metadataSha256, server: { ...structuredClone(d.server), enabled: true } },
    skill: { bindingSha256, state: "matched", skillName: "demo-skill", sourceSha256: reviewedPins.skillSha256, metadataSha256, resolvedSource: d.skill.source },
    artifacts: { bindingSha256, state: "matched", hashes: Object.fromEntries(artifactPins.map(key => [key, reviewedPins[key]])), metadataSha256 },
    manifest: { bindingSha256, state: "validated", descriptorSha256: bindingSha256, manifestSha256: reviewedPins.manifestSha256 },
    package: { bindingSha256, state: "consistent", descriptorSha256: bindingSha256,
      packageJsonSha256: reviewedPins.packageJsonSha256, packageLockSha256: reviewedPins.packageLockSha256 }
  } };
  if (["missing", "missing-and-blocked"].includes(kind)) {
    Object.assign(input.components.configuration, { state: "absent", fileState: "absent", entryState: null, configurationSha256: null, server: null });
    reviewedPins.configurationSha256 = null;
  }
  if (kind === "missing-skill") Object.assign(input.components.skill, { state: "absent", resolvedSource: null });
  if (kind === "not-provided") input.components.package = null;
  if (kind === "disabled") input.components.configuration.server.enabled = false;
  if (kind === "conflict") input.components.configuration.server.command = ROOT + "/foreign-node";
  if (["blocked", "missing-and-blocked"].includes(kind)) Object.assign(input.components.manifest, { state: "blocked", descriptorSha256: null, manifestSha256: null });
  if (kind === "binding") input.components.skill.bindingSha256 = "f".repeat(64);
  if (kind === "pins") reviewedPins.packageLockSha256 = "f".repeat(64);
  if (kind === "invalid") input.extra = true;
  return input;
}

// Executable specification ONLY: not an exported adapter or a replacement for runCli.
function parseSimulation(argv) {
  if (!Array.isArray(argv) || argv.length > 24 || !argv.every(v => typeof v === "string") || !["connect", "status"].includes(argv[0])) throw Error("arguments");
  const options = { command: argv[0], json: false, strict: false, migrate: false }, seen = new Set();
  for (let i = 1; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith("--")) {
      if (seen.has("target") || arg !== TARGET) throw Error("arguments");
      seen.add("target"); continue;
    }
    if (seen.has(arg)) throw Error("arguments"); seen.add(arg);
    if (["--agent", "--transport"].includes(arg)) {
      const value = argv[++i];
      if (!value || value.startsWith("--")) throw Error("arguments");
      options[arg.slice(2)] = value;
    } else if (arg === "--json") options.json = true;
    else if (arg === "--strict") options.strict = true;
    else if (arg === "--migrate-legacy") options.migrate = true;
    else throw Error("arguments"); // Includes apply/expect, even together.
  }
  if (!seen.has("target") || options.agent !== "codex") throw Error("arguments");
  if (options.command === "connect" ? options.transport !== "protected" || options.strict : seen.has("--transport") || options.migrate) throw Error("arguments");
  return Object.freeze(options);
}
function present(command, source) {
  const report = { schemaVersion: "1.0.0", simulation: true, command, status: "error", notice: "unavailable", summary: null, planHash: null,
    facts: { evidence: "simulation", sourceEvidence: "none", nativeRead: "not-tested", authorizationGranted: false, applied: false, executed: false, humanReviewRequired: true } };
  if (command === "connect" && ["preview", "unchanged"].includes(source?.state)) {
    if (!/^[a-f0-9]{64}$/.test(source.planHash) || !counters.every(key => Number.isSafeInteger(source.summary?.[key]) && source.summary[key] >= 0)) return report;
    report.status = source.state; report.notice = source.candidateServer?.enabled === false ? "disabled" : "declarations-only";
    report.summary = Object.fromEntries(counters.map(key => [key, source.summary[key]])); report.planHash = source.planHash;
    report.facts.sourceEvidence = "declared";
  } else if (command === "status" && ["coherent", "incomplete", "blocked", "invalid"].includes(source?.state)) {
    report.status = { coherent: "ok", incomplete: "warning", blocked: "error", invalid: "error" }[source.state];
    report.notice = source.state === "coherent" ? "declarations-only" : source.state === "incomplete"
      ? source.components.some(c => c.status === "disabled") ? "disabled" : "pending" : "blocked";
    report.facts.sourceEvidence = "declared-reports";
  } else if (command === "connect" && ["conflict", "blocked", "invalid"].includes(source?.state)) {
    report.notice = source.state; report.facts.sourceEvidence = "declared";
  }
  return report;
}
async function simulate(argv, providers) {
  let options;
  try { options = parseSimulation(argv); }
  catch {
    const report = freezeMemoryConnectionData({ ...present("invalid", null), notice: "arguments" });
    return { exitCode: 2, report, stdout: JSON.stringify(report) + "\n" };
  }
  let source;
  try { source = await (options.command === "connect" ? providers.plan(options) : providers.diagnostic(options)); }
  catch { source = null; } // Original errors never become user-facing data.
  let presentation;
  try { presentation = present(options.command, source); }
  catch { presentation = present(options.command, null); }
  const report = freezeMemoryConnectionData(presentation);
  const exitCode = report.status === "error" || options.command === "status" && options.strict && report.status === "warning" ? 1 : 0;
  const stdout = options.json ? JSON.stringify(report, null, 2) + "\n"
    : `Simulación: ${report.command}: ${report.status} (${report.notice}); lectura nativa: no probada.\n`;
  return { exitCode, report, stdout };
}
const args = (command, extras = []) => [command, TARGET, "--agent", "codex", ...(command === "connect" ? ["--transport", "protected"] : []), ...extras];
function providers(kind, command) {
  const input = command === "connect" ? planFixture(kind) : diagnosticFixture(kind), calls = [];
  return { input, calls,
    plan: options => { calls.push("plan"); return createMemoryConnectionPlan({ ...input, migrateLegacy: options.migrate }); },
    diagnostic: () => { calls.push("diagnostic"); return summarizeMemoryConnectionEvidence(input); } };
}
async function guarded(t, fn) {
  let forbidden = 0; const deny = () => { forbidden++; throw Error("Forbidden IO in simulation"); };
  const home = process.env.HOME, cwd = process.cwd();
  try {
    for (const name of ["readFileSync", "openSync", "statSync", "lstatSync", "readlinkSync", "readdirSync", "realpathSync", "writeFileSync", "mkdirSync", "rmSync", "renameSync", "createReadStream", "createWriteStream"]) t.mock.method(fs, name, deny);
    for (const name of ["readFile", "open", "stat", "lstat", "readlink", "readdir", "realpath", "writeFile", "mkdir", "rm", "rename", "symlink", "chmod"]) t.mock.method(fsp, name, deny);
    for (const name of ["spawn", "spawnSync", "exec", "execSync", "execFile", "execFileSync", "fork"]) t.mock.method(childProcess, name, deny);
    for (const obj of [http, https]) for (const name of ["request", "get"]) t.mock.method(obj, name, deny);
    for (const name of ["connect", "createConnection", "createServer"]) t.mock.method(net, name, deny);
    t.mock.method(net.Socket.prototype, "connect", deny); t.mock.method(globalThis, "fetch", deny); t.mock.method(process, "chdir", deny);
    const value = await fn(); assert.equal(forbidden, 0); return value;
  } finally { t.mock.restoreAll(); assert.equal(process.env.HOME, home); assert.equal(process.cwd(), cwd); }
}
function safe(result) {
  const r = result.report;
  assert.equal(r.simulation, true); assert.equal(r.facts.evidence, "simulation"); assert.equal(r.facts.nativeRead, "not-tested");
  for (const key of ["authorizationGranted", "applied", "executed"]) assert.equal(r.facts[key], false);
  assert.equal(r.facts.humanReviewRequired, true); assert.ok(Object.isFrozen(r)); assert.ok(Object.isFrozen(r.facts));
  if (r.summary) assert.ok(Object.isFrozen(r.summary));
  assert.doesNotMatch(JSON.stringify(r), /fictitious|demo-memory|demo-skill|candidateServer|configurationSha256|dependenciesSha256|foreign-node|private-marker|connected|stack/);
  assert.doesNotMatch(result.stdout, /fictitious|private-marker|connected|stack/);
  if (r.status === "error" || r.command === "status") assert.equal(r.planHash, null);
}

for (const [kind, state, exitCode, notice, changes] of [
  ["missing", "preview", 0, "disabled", { create: 2 }],
  ["missing-both", "preview", 0, "disabled", { create: 3 }],
  ["matched", "unchanged", 0, "declarations-only", { unchanged: 3 }],
  ["disabled", "unchanged", 0, "disabled", { unchanged: 3 }],
  ["conflict", "error", 1, "conflict", null], ["unsafe", "error", 1, "blocked", null],
  ["invalid", "error", 1, "invalid", null], ["legacy", "error", 1, "conflict", null]
]) test("A2b simulated preview using real plan: " + kind, async t => {
  const p = providers(kind, "connect"), before = structuredClone(p.input);
  const r = await guarded(t, () => simulate(args("connect", ["--json"]), p)); safe(r);
  assert.equal(r.report.status, state); assert.equal(r.exitCode, exitCode); assert.equal(r.report.notice, notice);
  assert.deepEqual(JSON.parse(r.stdout), r.report); assert.deepEqual(p.calls, ["plan"]); assert.deepEqual(p.input, before);
  if (changes) for (const [key, expected] of Object.entries(changes)) assert.equal(r.report.summary[key], expected);
});

test("A2b legacy opt-in proposes migration only and never applies", async t => {
  const p = providers("legacy", "connect"), before = structuredClone(p.input);
  const r = await guarded(t, () => simulate(args("connect", ["--migrate-legacy", "--json"]), p)); safe(r);
  assert.equal(r.report.status, "preview"); assert.equal(r.report.summary.migrate, 2); assert.equal(r.report.notice, "disabled");
  assert.equal(r.exitCode, 0); assert.deepEqual(p.calls, ["plan"]); assert.deepEqual(p.input, before);
});

for (const [kind, status, notice] of [
  ["matched", "ok", "declarations-only"], ["missing", "warning", "pending"], ["missing-skill", "warning", "pending"],
  ["not-provided", "warning", "pending"], ["disabled", "warning", "disabled"], ["conflict", "error", "blocked"],
  ["blocked", "error", "blocked"], ["missing-and-blocked", "error", "blocked"], ["binding", "error", "blocked"],
  ["pins", "error", "blocked"], ["invalid", "error", "blocked"]
]) test("A2b simulated status using real diagnostic: " + kind, async t => {
  const p = providers(kind, "status"), before = structuredClone(p.input);
  const normal = await guarded(t, () => simulate(args("status", ["--json"]), p));
  const strict = await guarded(t, () => simulate(args("status", ["--json", "--strict"]), p));
  for (const r of [normal, strict]) { safe(r); assert.equal(r.report.status, status); assert.equal(r.report.notice, notice); assert.deepEqual(JSON.parse(r.stdout), r.report); }
  assert.equal(normal.exitCode, status === "error" ? 1 : 0); assert.equal(strict.exitCode, status === "ok" ? 0 : 1);
  assert.deepEqual(normal.report, strict.report); assert.deepEqual(p.calls, ["diagnostic", "diagnostic"]); assert.deepEqual(p.input, before);
});

for (const command of ["connect", "status"]) test("A2b text and JSON preserve simulated semantics: " + command, async t => {
  const p = providers("matched", command);
  const text = await guarded(t, () => simulate(args(command), p));
  const json = await guarded(t, () => simulate(args(command, ["--json"]), p));
  safe(text); safe(json); assert.match(text.stdout, /^Simulación:/); assert.deepEqual(JSON.parse(json.stdout), text.report);
  assert.equal(text.exitCode, json.exitCode); assert.deepEqual(text.report, json.report);
});

const invalidArguments = [[], ["unknown"], ["status"], args("status", ["--agent", "codex"]),
  args("status", ["--json", "--json"]), args("status", ["--strict", "--strict"]), args("connect", ["--transport", "protected"]),
  args("status", ["--transport", "protected"]), args("connect", ["--strict"]), args("status", ["--migrate-legacy"]),
  args("connect", ["--migrate-legacy", "--migrate-legacy"]), args("connect", ["--apply"]), args("connect", ["--expect", "a".repeat(64)]),
  args("connect", ["--apply", "--expect", "a".repeat(64)]), args("status", ["--unknown"]), args("connect", ["--unknown"]),
  ["connect", TARGET, "--agent"], ["connect", TARGET, "--agent", "codex", "--transport"],
  ["connect", TARGET, "--agent", "codex"], ["connect", TARGET, "--transport", "protected"],
  ["connect", TARGET, "--agent", "claude", "--transport", "protected"], ["status", TARGET, "--agent", "gemini"],
  ["connect", TARGET, "--agent", "codex", "--transport", "legacy"], args("status", [TARGET]),
  ["status", "/not-the-fixture", "--agent", "codex"], ["status", TARGET, "--agent", "--json"], ["status", TARGET, null]];
for (let i = 0; i < invalidArguments.length; i++) test("A2b invalid simulated arguments reject before providers: " + i, async t => {
  let calls = 0; const deny = () => { calls++; throw Error("private-marker"); };
  const r = await guarded(t, () => simulate(invalidArguments[i], { plan: deny, diagnostic: deny })); safe(r);
  assert.equal(r.exitCode, 2); assert.equal(r.report.notice, "arguments"); assert.equal(calls, 0);
});

for (const command of ["connect", "status"]) test("A2b provider failure or unknown output is redacted: " + command, async t => {
  for (const provider of [() => { throw Error("private-marker /fictitious/other"); }, () => null, () => ({ state: "future-state", private: "private-marker" })]) {
    const r = await guarded(t, () => simulate(args(command, ["--json"]), { plan: provider, diagnostic: provider })); safe(r);
    assert.equal(r.exitCode, 1); assert.equal(r.report.status, "error"); assert.equal(r.report.notice, "unavailable");
  }
});

for (const command of ["connect", "status"]) test("A2b malformed recognized provider output fails closed: " + command, async t => {
  const source = command === "connect" ? { state: "preview", planHash: "a".repeat(64), summary: { create: -1 } }
    : { state: "incomplete", components: null };
  const provider = () => source;
  const r = await guarded(t, () => simulate(args(command, ["--json"]), { plan: provider, diagnostic: provider })); safe(r);
  assert.equal(r.exitCode, 1); assert.equal(r.report.notice, "unavailable"); assert.equal(r.report.planHash, null);
});

test("A2b non-array or oversized simulated argv never invokes providers", async t => {
  let calls = 0; const deny = () => { calls++; throw Error("private-marker"); };
  for (const argv of [null, undefined, "status", {}, Array(25).fill("--json")]) {
    const r = await guarded(t, () => simulate(argv, { plan: deny, diagnostic: deny })); safe(r); assert.equal(r.exitCode, 2);
  }
  assert.equal(calls, 0);
});

test("A2b plan pins and diagnostic pins are separate, not a manufactured bridge", async t => {
  const p = planFixture(), d = diagnosticFixture();
  assert.notDeepEqual(Object.keys(p.pins).sort(), Object.keys(d.reviewedPins).sort());
  assert.ok(Object.hasOwn(p.pins, "dependenciesSha256")); assert.equal(Object.hasOwn(d.reviewedPins, "dependenciesSha256"), false);
  const plan = await guarded(t, () => createMemoryConnectionPlan(d)); assert.equal(plan.state, "invalid");
  const diagnostic = await guarded(t, () => summarizeMemoryConnectionEvidence(p)); assert.equal(diagnostic.state, "invalid");
  const before = structuredClone({ p, d });
  await guarded(t, () => simulate(args("connect"), { plan: options => createMemoryConnectionPlan({ ...p, migrateLegacy: options.migrate }) }));
  await guarded(t, () => simulate(args("status"), { diagnostic: () => summarizeMemoryConnectionEvidence(d) }));
  assert.deepEqual({ p, d }, before);
});

for (const command of ["connect", "status"]) test("A2b actual runCli rejects unavailable protected option without IO: " + command, async t => {
  const out = [], err = [], io = { out: s => out.push(s), err: s => err.push(s) };
  const exitCode = await guarded(t, () => runCli([command, TARGET, "--agent", "codex", "--transport", "protected", "--json"], io));
  assert.equal(exitCode, 2); assert.deepEqual(out, []); assert.deepEqual(err, ["Opción desconocida: --transport"]);
});
