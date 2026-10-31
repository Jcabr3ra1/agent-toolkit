import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readMemoryConnectionToml } from "../src/memory-connection-toml.js";
import { collectMemoryConnectionConfiguration } from "../src/memory-connection-files.js";
import { inspectMemoryConnectionSkill } from "../src/memory-connection-skill.js";
import { inspectMemoryConnectionArtifacts } from "../src/memory-connection-artifacts.js";

const source = '[mcp_servers.demo-memory]\ncommand="node"\nargs=[]\nenabled=false\n';
const options = { mcpName: "demo-memory" };
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
function frozen(value) {
  if (value && typeof value === "object") {
    assert.equal(Object.isFrozen(value), true);
    for (const child of Object.values(value)) frozen(child);
  }
}

// These are the byte-contract portions of the POSIX collector tests. Calling
// the exported parser covers their actual cause on every OS; the collector's
// MC_FILES_TOML mapping and native read evidence remain in the POSIX tests.
for (const [name, contents, state, reason] of [
  ["invalid UTF-8", Buffer.from([0xff]), "invalid", "MC_TOML_UTF8"],
  ["BOM", "\ufeff" + source, "invalid", "MC_TOML_BOM"],
  ["duplicate field", source + 'command="duplicate-marker"\n', "invalid", "MC_TOML_SYNTAX"],
  ["unsupported environment", '[mcp_servers.demo-memory]\nenv={VALUE="private-marker"}\n', "blocked", "MC_TOML_FIELD"],
  ["sensitive argument", '[mcp_servers.demo-memory]\nargs=["password=fictitious-secret-marker"]\n', "blocked", "MC_TOML_SENSITIVE"]
]) {
  test("MC contract supplied-byte rejection is causal and redacted: " + name, () => {
    const control = readMemoryConnectionToml(source, options);
    assert.equal(control.state, "observed"); assert.deepEqual(control.reasons, []);
    const report = readMemoryConnectionToml(contents, options);
    assert.equal(report.state, state); assert.deepEqual(report.reasons, [reason]);
    // A byte digest is deliberately retained by this pure parser; it is not
    // evidence that a native configuration file was opened or verified.
    assert.equal(report.configurationSha256, hash(contents));
    assert.equal(report.server, null); assert.equal(report.ranges, null);
    assert.equal(report.facts.evidence, "provided-bytes");
    assert.equal(report.facts.localReadVerified, false);
    assert.equal(report.facts.configurationSourceVerified, false);
    assert.doesNotMatch(JSON.stringify(report), /private-marker|duplicate-marker|fictitious-secret-marker|stack/);
    frozen(report);
  });
}

test("MC contract supplied CRLF and Unicode bytes have exact isolated immutable observations", () => {
  const text = '# café 🐦 foreign-marker\r\n[mcp_servers.other]\r\ncommand="unrelated-marker"\r\n' + source.replaceAll("\n", "\r\n");
  const bytes = Buffer.from(text), inputOptions = { ...options };
  const report = readMemoryConnectionToml(bytes, inputOptions);
  assert.equal(report.state, "observed"); assert.deepEqual(report.reasons, []);
  assert.equal(report.configurationSha256, hash(bytes));
  assert.deepEqual(report.server, { command: "node", args: [], enabled: false });
  assert.equal(text.slice(...report.ranges.fields.command.value), '"node"');
  assert.doesNotMatch(JSON.stringify(report), /foreign-marker|unrelated-marker/);
  assert.equal(report.facts.evidence, "provided-bytes");
  assert.equal(report.facts.localReadVerified, false);
  frozen(report); assert.throws(() => report.server.args.push("changed"), TypeError);
  bytes.fill(0); inputOptions.mcpName = "changed";
  assert.equal(report.configurationSha256, hash(text)); assert.equal(report.mcpName, options.mcpName);
  const next = readMemoryConnectionToml("# another snapshot\n", options);
  assert.equal(next.state, "absent"); assert.equal(next.server, null);
  assert.notEqual(next.configurationSha256, report.configurationSha256);
  assert.deepEqual(report.server, { command: "node", args: [], enabled: false });
});

// Rejected-input reports are observable without the platform guard or any IO.
// This checks the real report constructors, not a copied result-shape helper.
for (const [name, inspect, reason] of [
  ["configuration", collectMemoryConnectionConfiguration, "MC_FILES_INPUT"],
  ["skill", inspectMemoryConnectionSkill, "MC_SKILL_INPUT"],
  ["artifacts", inspectMemoryConnectionArtifacts, "MC_ARTIFACT_INPUT"]
]) {
  test("MC contract invalid " + name + " reports are redacted immutable and independent", async () => {
    let ioCalls = 0, hooks = 0;
    const forbidden = () => { ioCalls++; throw Error("private-error-marker"); };
    const input = { extra: "private-marker" };
    Object.defineProperty(input, "descriptor", { enumerable: true, get() { hooks++; throw Error("private-error-marker"); } });
    const report = await inspect(input, { io: { lstat: forbidden, open: forbidden, readlink: forbidden } });
    assert.equal(report.state, "invalid"); assert.deepEqual(report.reasons, [reason]);
    assert.equal(ioCalls, 0); assert.equal(hooks, 0);
    assert.equal(report.facts.evidence, "none"); assert.equal(report.facts.localReadVerified, false);
    assert.equal(report.facts.authorizationGranted, false);
    assert.doesNotMatch(JSON.stringify(report), /private-marker|private-error-marker|stack/);
    frozen(report); assert.throws(() => report.reasons.push("changed"), TypeError);
    assert.throws(() => { report.facts.authorizationGranted = true; }, TypeError);
    const next = await inspect(null, { io: { lstat: forbidden, open: forbidden, readlink: forbidden } });
    assert.notStrictEqual(next, report); assert.notStrictEqual(next.facts, report.facts);
    assert.notStrictEqual(next.reasons, report.reasons); assert.deepEqual(next.reasons, [reason]);
    assert.equal(ioCalls, 0); assert.equal(hooks, 0);
  });
}
