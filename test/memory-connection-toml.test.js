import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import http from "node:http";
import https from "node:https";
import childProcess from "node:child_process";

import { readMemoryConnectionToml as read, MEMORY_CONNECTION_TOML_LIMITS as LIMITS } from "../src/memory-connection-toml.js";
import { createMemoryConnectionDescriptor } from "../src/memory-connection-descriptor.js";
import { createMemoryConnectionPlan } from "../src/memory-connection-plan.js";

const options = { mcpName: "demo-memory" };
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const table = (body = 'command = "node"\nargs = []\nenabled = false', header = "[mcp_servers.demo-memory]") => header + "\n" + body;
const toml = (server) => table(Object.entries(server).map(([key, value]) => key + " = " + JSON.stringify(value)).join("\n"));
const descriptor = () => createMemoryConnectionDescriptor({
  agent: "codex", mcpName: "demo-memory", skillName: "demo",
  nodePath: "/fictitious/runtime/node", toolkitRoot: "/fictitious/toolkit",
  manifestPath: "/fictitious/memory/project-memory.json", vaultPath: "/fictitious/memory",
  sourcePath: "/fictitious/source", homeDirectory: "/fictitious/home"
});
const planned = (observation, migrateLegacy = false) => {
  const own = descriptor();
  return createMemoryConnectionPlan({
    schemaVersion: "1.0.0", descriptor: own, migrateLegacy,
    observations: {
      // These declarations are for tests only, not an operational adapter.
      configuration: { state: "present", sha256: observation.configurationSha256, server: observation.server },
      skill: { state: "matched", resolvedSource: own.skill.source }
    },
    pins: Object.fromEntries(["manifestSha256", "binSha256", "nodeSha256", "dependenciesSha256", "pathMetadataSha256", "skillMetadataSha256"].map((key) => [key, "a".repeat(64)]))
  });
};
const facts = (result, syntax = true) => {
  assert.equal(result.facts.evidence, "provided-bytes");
  assert.equal(result.facts.byteSyntaxVerified, syntax);
  for (const field of ["physicalPathsVerified", "localReadVerified", "nativeReadVerified", "runtimeVerified", "configurationSourceVerified", "authorizationGranted", "executable", "applied", "wrote", "sent", "executed"]) {
    assert.equal(result.facts[field], false, field);
  }
  assert.equal(result.facts.humanReviewRequired, true);
};
const rejected = (result, code, state = "blocked", syntax = true) => {
  assert.equal(result.state, state); assert.deepEqual(result.reasons, [code]);
  assert.equal(result.server, null); assert.equal(result.ranges, null); facts(result, syntax);
};

test("MC TOML reads only explicit own standard fields from supplied bytes", () => {
  const source = table(); const result = read(source, options);
  assert.equal(result.schemaVersion, "1.0.0"); assert.equal(result.state, "observed");
  assert.equal(result.mcpName, options.mcpName); assert.equal(result.configurationSha256, hash(source));
  assert.deepEqual(result.server, { command: "node", args: [], enabled: false });
  assert.deepEqual(result.reasons, []); facts(result);
});
for (const enabled of [true, false]) {
  test("MC TOML protected supplied tuple feeds declared plan, enabled=" + enabled, () => {
    const own = descriptor(); const result = read(toml({ ...own.server, enabled }), options);
    assert.equal(result.state, "observed"); assert.deepEqual(result.server, { ...own.server, enabled });
    const plan = planned(result); assert.equal(plan.state, "unchanged"); assert.equal(plan.connectionClass, "protected");
    assert.equal(plan.facts.evidence, "declared"); facts(result);
  });
}
for (const migrate of [false, true]) {
  test("MC TOML exact pinned legacy remains opt-in in declared plan, migrate=" + migrate, () => {
    const server = { command: "npx", args: ["-y", "@modelcontextprotocol/server-filesystem@2026.8.31", "/fictitious/memory"], enabled: true };
    const result = read(toml(server), options); assert.deepEqual(result.server, server);
    const plan = planned(result, migrate); assert.equal(plan.state, migrate ? "preview" : "conflict");
    assert.equal(plan.connectionClass, "legacy-direct");
  });
}
test("MC TOML missing fields are not defaulted or falsely admitted", () => {
  const result = read(table('command = "node"\nargs = []'), options);
  assert.equal(result.state, "observed"); assert.equal(Object.hasOwn(result.server, "enabled"), false);
  assert.equal(planned(result).state, "conflict");
  assert.deepEqual(read(table(""), options).server, {});
});
for (const source of ["", " \t\r\n", "# empty\n", '[mcp_servers.other]\ncommand="other"', '[mcp_servers]\nother.command="other"', 'mcp_servers.other.command="other"', '"mcp_servers.demo-memory" = "unrelated"']) {
  test("MC TOML absent slot in valid bytes " + JSON.stringify(source), () => {
    const result = read(source, options); assert.equal(result.state, "absent");
    assert.equal(result.server, null); assert.equal(result.ranges, null); assert.equal(result.configurationSha256, hash(source)); facts(result);
  });
}
for (const header of ['[mcp_servers."demo-memory"]', "['mcp_servers'.'demo-memory']", '["mcp_servers"."demo\\u002dmemory"]', '[ mcp_servers . demo-memory ]']) {
  test("MC TOML resolved quoted/bare key " + header, () => {
    assert.deepEqual(read(table(undefined, header), options).server, { command: "node", args: [], enabled: false });
  });
}
test("MC TOML decoded quoted field names and literal strings", () => {
  const result = read(table('"comm\\u0061nd" = \'node\'\n\'args\' = [\'--manifest\', "fictitious"]\n"enabled" = true'), options);
  assert.equal(result.state, "observed"); assert.deepEqual(result.server, { command: "node", args: ["--manifest", "fictitious"], enabled: true });
});
for (const name of ["demo-memory-other", "demo", "demo-memory.extra", "Demo-memory"]) {
  test("MC TOML never confuses a similarly named quoted slot " + name, () => {
    assert.equal(read(table(undefined, '[mcp_servers."' + name + '"]'), options).state, "absent");
  });
}
for (const quote of ['"""', "'''"]) {
  test("MC TOML fake header in multiline " + quote, () => {
    const source = 'message = ' + quote + '\n[mcp_servers.demo-memory]\ncommand = "fake-marker"\n' + quote + '\n# [mcp_servers.demo-memory]\n' + table();
    const result = read(source, options); assert.equal(result.server.command, "node");
    assert.doesNotMatch(JSON.stringify(result), /fake-marker/);
    assert.equal(read(source.slice(0, source.lastIndexOf("[mcp_servers.demo-memory]")), options).state, "absent");
  });
}
test("MC TOML unrelated global/foreign values and dates are never serialized", () => {
  const source = 'private = "foreign-marker"\ntime = 1979-05-27T07:32:00Z\n[mcp_servers.other]\nsecret = "other-marker"\n\n' + table();
  const result = read(source, options); assert.equal(result.state, "observed");
  assert.doesNotMatch(JSON.stringify(result), /foreign-marker|other-marker|1979|private|secret/);
});
for (const ending of ["\n", "\r\n"]) for (const final of [true, false]) {
  test("MC TOML exact bytes, Unicode ranges and line ending " + JSON.stringify(ending) + "/" + final, () => {
    const source = ('# café 🐦\n' + table('command = "nódé-🐦"\nargs = ["café"]\nenabled = false') + (final ? "\n" : "")).replaceAll("\n", ending);
    const bytes = Buffer.from(source); const result = read(bytes, options);
    assert.equal(result.state, "observed"); assert.equal(result.configurationSha256, hash(bytes));
    assert.equal(source.slice(...result.ranges.fields.command.value), '"nódé-🐦"');
    assert.equal(source.slice(...result.ranges.fields.command.key), "command");
    assert.equal(source.slice(...result.ranges.fields.args.value), '["café"]');
    assert.equal(source.slice(...result.ranges.table).startsWith("[mcp_servers.demo-memory]"), true);
    assert.notEqual(result.ranges.fields.command.value[0], Buffer.byteLength(source.slice(0, result.ranges.fields.command.value[0])));
  });
}
test("MC TOML comment-only changes retain fields but change byte pin", () => {
  const a = read(table(), options), b = read("# comment\n" + table(), options);
  assert.deepEqual(a.server, b.server); assert.notEqual(a.configurationSha256, b.configurationSha256);
});
for (const [label, source, code] of [
  ["inline namespace", 'mcp_servers = { other = { command="other" } }', "MC_TOML_NAMESPACE"],
  ["inline own", 'mcp_servers = { demo-memory = { command="node" } }', "MC_TOML_NAMESPACE"],
  ["scalar namespace", 'mcp_servers="marker"', "MC_TOML_NAMESPACE"],
  ["array namespace value", 'mcp_servers=[]', "MC_TOML_NAMESPACE"],
  ["array namespace table", '[[mcp_servers]]\ncommand="node"', "MC_TOML_NAMESPACE"],
  ["root dotted own", 'mcp_servers.demo-memory.command="node"', "MC_TOML_LAYOUT"],
  ["root inline own", 'mcp_servers.demo-memory={command="node"}', "MC_TOML_LAYOUT"],
  ["parent dotted own", '[mcp_servers]\ndemo-memory.command="node"', "MC_TOML_LAYOUT"],
  ["parent inline own", '[mcp_servers]\ndemo-memory={command="node"}', "MC_TOML_LAYOUT"],
  ["parent scalar own", '[mcp_servers]\ndemo-memory="marker"', "MC_TOML_LAYOUT"],
  ["own array table", '[[mcp_servers.demo-memory]]\ncommand="node"', "MC_TOML_LAYOUT"],
  ["descendant alone", '[mcp_servers.demo-memory.env]\nvalue="marker"', "MC_TOML_LAYOUT"],
  ["descendant after own", table() + '\n[mcp_servers.demo-memory.env]\nvalue="marker"', "MC_TOML_LAYOUT"],
  ["own dotted field", table('command.path="marker"'), "MC_TOML_FIELD"],
  ["own env", table('env={VALUE="marker"}'), "MC_TOML_FIELD"],
  ["own unknown", table('timeout=1'), "MC_TOML_FIELD"],
  ["own prototype", table('"__proto__" = "marker"'), "MC_TOML_FIELD"]
]) {
  test("MC TOML fail-closed layout " + label, () => {
    const result = read(source, options); rejected(result, code); assert.doesNotMatch(JSON.stringify(result), /marker/);
  });
}
for (const [label, source] of [
  ["duplicate table", table() + "\n" + table()],
  ["duplicate field", table('command="a"\ncommand="b"')],
  ["decoded duplicate", table('command="a"\n"comm\\u0061nd"="b"')],
  ["duplicate foreign field", 'foreign="a"\nforeign="b"\n' + table()],
  ["unclosed string", table('command="private-marker')],
  ["foreign syntax", 'other=[1,,2]\n' + table()],
  ["invalid escape", table('command="\\q"')],
  ["1.1 escape", table('command="\\x41"')],
  ["1.1 escape e", table('command="\\e"')],
  ["1.1 inline trailing comma", 'other={a=1,}\n' + table()]
]) {
  test("MC TOML rejects whole document syntax under dialect 1.0 " + label, () => {
    const result = read(source, options); rejected(result, "MC_TOML_SYNTAX", "invalid", false);
    assert.doesNotMatch(JSON.stringify(result), /private-marker|Unexpected|SyntaxError|stack|lineNumber/);
  });
}
for (const [field, values] of [
  ["command", ["1", "true", "[]", "{}", "1979-05-27"]],
  ["cwd", ["1", "false", "[]", "{}"]],
  ["enabled", ['"true"', "1", "[]", "{}"]],
  ["args", ['"x"', "1", "true", "{}", "[1]", '["x",false]', "[[]]"]],
  ["enabled_tools", ['"x"', "1", "false", "{}", "[1]", '["x",true]', "[{}]"]]
]) for (const value of values) {
  test("MC TOML rejects field type " + field + "=" + value, () => {
    rejected(read(table(field + "=" + value), options), "MC_TOML_FIELD_TYPE");
  });
}
for (const field of ["command", "cwd", "args", "enabled_tools"]) {
  for (const value of ["bad\nvalue", "bad\tvalue", "bad\u0000value", "bad\u202evalue", "bad\u2066value"]) {
    test("MC TOML rejects decoded controls in " + field + "/" + JSON.stringify(value), () => {
      const literal = JSON.stringify(value);
      rejected(read(table(field + "=" + (["args", "enabled_tools"].includes(field) ? "[" + literal + "]" : literal)), options), "MC_TOML_FIELD_VALUE");
    });
  }
}
for (const field of ["command", "args", "cwd", "enabled_tools"]) {
  test("MC TOML redacts high-confidence sensitive value in " + field, () => {
    const value = "password" + "=fictitious-secret-marker";
    const literal = JSON.stringify(["args", "enabled_tools"].includes(field) ? [value] : value);
    const result = read(table(field + "=" + literal), options);
    rejected(result, "MC_TOML_SENSITIVE"); assert.doesNotMatch(JSON.stringify(result), /fictitious-secret-marker|password/);
  });
}
for (const [field, cap] of [["args", LIMITS.args], ["enabled_tools", LIMITS.tools]]) {
  test("MC TOML array bound accepted exactly for " + field, () => {
    const result = read(table(field + "=" + JSON.stringify(Array(cap).fill("x"))), options);
    assert.equal(result.state, "observed"); assert.equal(result.server[field].length, cap);
  });
  test("MC TOML array bound rejects one extra for " + field, () => {
    rejected(read(table(field + "=" + JSON.stringify(Array(cap + 1).fill("x"))), options), "MC_TOML_ARRAY_LIMIT");
  });
}
test("MC TOML string byte cap counts multibyte Unicode", () => {
  assert.equal(read(table("command=" + JSON.stringify("é".repeat(LIMITS.stringBytes / 2))), options).state, "observed");
  rejected(read(table("command=" + JSON.stringify("é".repeat(LIMITS.stringBytes / 2) + "x")), options), "MC_TOML_STRING_LIMIT");
});
test("MC TOML total input cap before parser and exact-cap comment accepted", () => {
  const source = "#" + "x".repeat(LIMITS.inputBytes - 1);
  assert.equal(read(source, options).state, "absent");
  for (const value of [source + "x", Buffer.from(source + "x"), new Uint8Array(LIMITS.inputBytes + 1)]) {
    rejected(read(value, options), "MC_TOML_INPUT_LIMIT", "invalid", false);
  }
});
test("MC TOML semantic AST size cap applies to foreign data without disclosure", () => {
  const source = 'other=[' + Array(31000).fill("1").join(",") + ']\n' + table();
  rejected(read(source, options), "MC_TOML_AST_LIMIT");
});
test("MC TOML semantic AST depth cap applies after parsing", () => {
  const source = "other=" + "[".repeat(70) + "1" + "]".repeat(70) + "\n" + table();
  rejected(read(source, options), "MC_TOML_AST_LIMIT");
});
test("MC TOML report cap returns a bounded sanitized failure, not a partial server", () => {
  const source = table("enabled_tools=" + JSON.stringify(Array(32).fill("x".repeat(LIMITS.stringBytes))));
  const result = read(source, options); rejected(result, "MC_TOML_REPORT_LIMIT");
  assert.ok(Buffer.byteLength(JSON.stringify(result)) < LIMITS.reportBytes);
});
for (const input of [Buffer.from([0xff]), Buffer.from([0xc3, 0x28]), Buffer.from([0xed, 0xa0, 0x80])]) {
  test("MC TOML rejects invalid UTF8 " + input.toString("hex"), () => {
    rejected(read(input, options), "MC_TOML_UTF8", "invalid", false);
  });
}
for (const input of ["\ufeff" + table(), Buffer.from("\ufeff" + table())]) {
  test("MC TOML does not silently strip BOM " + typeof input, () => {
    rejected(read(input, options), "MC_TOML_BOM", "invalid", false);
  });
}
for (const input of ["\ud800", "\udfff", {}, [], null, undefined, 1, new Uint16Array([1]), new DataView(new ArrayBuffer(1))]) {
  test("MC TOML rejects non-byte/lossy input " + String(input), () => {
    rejected(read(input, options), "MC_TOML_BYTES", "invalid", false);
  });
}
test("MC TOML input/options hooks and proxies never execute", () => {
  let calls = 0; const trap = () => { calls++; throw Error("private-marker"); };
  for (const input of [{ toString: trap }, new Proxy(Buffer.from(table()), { get: trap, getPrototypeOf: trap }), new (class extends Uint8Array {})([1])]) {
    rejected(read(input, options), "MC_TOML_BYTES", "invalid", false);
  }
  for (const opts of [Object.defineProperty({}, "mcpName", { enumerable: true, get: trap }), { mcpName: "demo-memory", toJSON: trap }, new Proxy(options, { get: trap, ownKeys: trap })]) {
    const result = read(table(), opts); rejected(result, "MC_TOML_OPTIONS", "invalid", false);
    assert.equal(result.configurationSha256, null); assert.equal(result.mcpName, null);
  }
  assert.equal(calls, 0);
});
for (const opts of [undefined, null, [], {}, { mcpName: "" }, { mcpName: "Demo" }, { mcpName: "constructor" }, { mcpName: "prototype" }, { mcpName: "__proto__" }, { mcpName: "x".repeat(65) }, { mcpName: "demo-memory", extra: true }]) {
  test("MC TOML closed explicit options " + JSON.stringify(opts), () => {
    rejected(read(table(), opts), "MC_TOML_OPTIONS", "invalid", false);
  });
}
for (const name of ["a", "x".repeat(64)]) {
  test("MC TOML explicit name boundary " + name.length, () => {
    assert.equal(read(table(undefined, "[mcp_servers." + name + "]"), { mcpName: name }).state, "observed");
  });
}
test("MC TOML owns byte/options copies and recursively frozen reports", () => {
  const bytes = new Uint8Array(Buffer.from(table())); const opts = { ...options };
  const result = read(bytes, opts); const before = JSON.stringify(result);
  bytes.fill(0); opts.mcpName = "changed"; assert.equal(JSON.stringify(result), before);
  function check(value) {
    if (value && typeof value === "object") { assert.equal(Object.isFrozen(value), true); Object.values(value).forEach(check); }
  }
  check(result); assert.throws(() => result.server.args.push("changed"), TypeError);
  assert.equal(Object.isFrozen(opts), false); assert.equal(Object.isFrozen(bytes), false);
});
test("MC TOML byte views pin only the supplied slice", () => {
  const source = table(); const wrapper = Buffer.from("before" + source + "after");
  const result = read(wrapper.subarray(6, -5), options);
  assert.equal(result.state, "observed"); assert.equal(result.configurationSha256, hash(source));
});
test("MC TOML pure invocation performs no filesystem, network, process or cwd discovery", () => {
  const undo = []; let calls = 0; const forbidden = () => { calls++; throw Error("unexpected capability"); };
  const replace = (obj, key) => { const original = obj[key]; obj[key] = forbidden; undo.push(() => { obj[key] = original; }); };
  let result;
  try {
    for (const name of ["readFileSync", "openSync", "statSync", "lstatSync", "realpathSync", "writeFileSync", "readdirSync"]) replace(fs, name);
    for (const name of ["readFile", "open", "stat", "lstat", "realpath", "writeFile", "readdir"]) replace(fsp, name);
    for (const obj of [http, https]) for (const name of ["request", "get"]) replace(obj, name);
    for (const name of ["spawn", "spawnSync", "exec", "execSync", "execFile", "execFileSync", "fork"]) replace(childProcess, name);
    replace(process, "cwd");
    result = read(table(), options);
  } finally { undo.reverse().forEach((restore) => restore()); }
  assert.equal(calls, 0); assert.equal(result.state, "observed"); facts(result);
});
test("MC TOML adoption versions, lock integrity and runtime declaration", () => {
  const pkg = JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url)));
  const lock = JSON.parse(fs.readFileSync(new URL("../package-lock.json", import.meta.url)));
  assert.equal(pkg.engines.node, "^24.0.0");
  for (const [name, version, integrity] of [
    ["toml-eslint-parser", "1.0.3", "sha512-A5F0cM6+mDleacLIEUkmfpkBbnHJFV1d2rprHU2MXNk7mlxHq2zGojA+SRvQD1RoMo9gqjZPWEaKG4v1BQ48lw=="],
    ["eslint-visitor-keys", "5.0.1", "sha512-tD40eHxA35h0PEIZNeIjkHoDR4YjjJp34biM0mDvplBe//mB+IHCqHDGV7pxF+7MklTvighcCPPZC7ynWyjdTA=="]
  ]) {
    assert.equal(pkg.dependencies[name], version); assert.equal(lock.packages["node_modules/" + name].version, version);
    assert.equal(lock.packages["node_modules/" + name].integrity, integrity);
    const installed = JSON.parse(fs.readFileSync(new URL("../node_modules/" + name + "/package.json", import.meta.url)));
    assert.equal(installed.version, version);
  }
});
test("MC TOML public memory entrypoints have no reader/core dispatch integration", () => {
  for (const name of ["connect.js", "status.js", "cli.js"]) {
    const source = fs.readFileSync(new URL("../src/" + name, import.meta.url), "utf8");
    assert.doesNotMatch(source, /memory-connection-(?:toml|descriptor|plan)/);
  }
});
