import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";

import {
  createMemoryConnectionDescriptor, copyMemoryConnectionData,
  freezeMemoryConnectionData, memoryConnectionHash, hasMemoryConnectionKeys,
  MEMORY_CONNECTION_FACTS, MEMORY_CONNECTION_LIMITS
} from "../src/memory-connection-descriptor.js";
import { MEMORY_READ_TOOLS } from "../src/memory-mcp-policy.js";

const fixture = () => ({
  agent: "codex", mcpName: "demo-memory", skillName: "demo",
  nodePath: "/fictitious/runtime/node", toolkitRoot: "/fictitious/toolkit",
  manifestPath: "/fictitious/memory/project-memory.json",
  vaultPath: "/fictitious/memory", sourcePath: "/fictitious/source",
  homeDirectory: "/fictitious/home"
});
const code = (expected) => (error) => {
  assert.equal(error.code, expected);
  assert.equal(error.message, expected);
  return true;
};

test("MC descriptor proposes the protected tuple, disabled, with nine canonical reads", () => {
  const result = createMemoryConnectionDescriptor(fixture());
  assert.deepEqual(result.server, {
    command: "/fictitious/runtime/node",
    args: ["/fictitious/toolkit/bin/project-memory-mcp.js", "--manifest", "/fictitious/memory/project-memory.json"],
    cwd: "/fictitious/toolkit", enabled_tools: [...MEMORY_READ_TOOLS], enabled: false
  });
  assert.equal(result.server.enabled_tools.length, 9);
  assert.deepEqual(result.facts, MEMORY_CONNECTION_FACTS);
  assert.equal(result.facts.evidence, "declared");
});

test("MC descriptor derives only the declared Codex slot and Skill paths", () => {
  const result = createMemoryConnectionDescriptor(fixture());
  assert.equal(result.configurationPath, "/fictitious/home/.codex/config.toml");
  assert.deepEqual(result.skill, {
    source: "/fictitious/memory/07-AGENTES/skills/demo",
    target: "/fictitious/home/.agents/skills/demo"
  });
});

test("MC descriptor does not freeze, mutate or share input identity", () => {
  const input = fixture(), before = structuredClone(input);
  const result = createMemoryConnectionDescriptor(input);
  assert.deepEqual(input, before);
  assert.equal(Object.isFrozen(input), false);
  input.nodePath = "/fictitious/changed-node";
  assert.equal(result.identity.nodePath, before.nodePath);
  assert.ok(Object.isFrozen(result) && Object.isFrozen(result.identity));
  assert.ok(Object.isFrozen(result.server) && Object.isFrozen(result.server.args));
  assert.ok(Object.isFrozen(result.server.enabled_tools) && Object.isFrozen(result.facts));
  assert.throws(() => { result.server.enabled = true; }, TypeError);
});

test("MC descriptor and hash are deterministic despite object insertion order", () => {
  const input = fixture();
  const reversed = Object.fromEntries(Object.entries(input).reverse());
  assert.deepEqual(createMemoryConnectionDescriptor(input), createMemoryConnectionDescriptor(reversed));
  assert.equal(memoryConnectionHash(createMemoryConnectionDescriptor(input)),
    memoryConnectionHash(createMemoryConnectionDescriptor(reversed)));
});

for (const key of Object.keys(fixture())) {
  test("MC descriptor requires explicit " + key, () => {
    const input = fixture(); delete input[key];
    assert.throws(() => createMemoryConnectionDescriptor(input), code("MC_DESCRIPTOR_INVALID"));
  });
}
for (const agent of ["claude", "gemini", "codex ", "unknown"]) {
  test("MC descriptor rejects unsupported agent " + agent, () => {
    assert.throws(() => createMemoryConnectionDescriptor({ ...fixture(), agent }), code("MC_AGENT_UNSUPPORTED"));
  });
}
for (const field of ["permission", "nativeReadVerified", "enabled", "env", "command"]) {
  test("MC descriptor rejects authority or invocation override " + field, () => {
    assert.throws(() => createMemoryConnectionDescriptor({ ...fixture(), [field]: true }), code("MC_DESCRIPTOR_INVALID"));
  });
}
for (const name of ["", "Uppercase", "bad.name", "bad/name", "x".repeat(65), "constructor", "prototype"]) {
  test("MC descriptor rejects unsafe name " + JSON.stringify(name), () => {
    assert.throws(() => createMemoryConnectionDescriptor({ ...fixture(), mcpName: name }), code("MC_NAME_INVALID"));
    assert.throws(() => createMemoryConnectionDescriptor({ ...fixture(), skillName: name }), code("MC_NAME_INVALID"));
  });
}
test("MC descriptor accepts the identifier length boundary", () => {
  assert.equal(createMemoryConnectionDescriptor({ ...fixture(), mcpName: "x".repeat(64) }).identity.mcpName.length, 64);
});

const invalidPaths = {
  relative: "relative/node", root: "/", traversal: "/fictitious/../node",
  dot: "/fictitious/./node", repeatedSeparator: "/fictitious//node",
  trailingSeparator: "/fictitious/node/", whitespace: " /fictitious/node",
  control: "/fictitious/node\n", nul: "/fictitious/node\0",
  bidi: "/fictitious/\u202enode", windows: "C:\\fictitious\\node",
  backslash: "/fictitious/n\\ode", surrogate: "/fictitious/\ud800",
  oversized: "/" + "x".repeat(MEMORY_CONNECTION_LIMITS.pathChars),
  credential: "/fictitious/.env", privateDirectory: "/fictitious/.git/node",
  clientDirectory: "/fictitious/.codex/node",
  sensitive: "/fictitious/password=fictional-sentinel-value"
};
for (const [kind, value] of Object.entries(invalidPaths)) {
  test("MC descriptor rejects path " + kind, () => {
    assert.throws(() => createMemoryConnectionDescriptor({ ...fixture(), nodePath: value }), code("MC_PATH_INVALID"));
  });
}
for (const field of ["manifestPath", "toolkitRoot", "vaultPath", "sourcePath", "homeDirectory"]) {
  test("MC descriptor validates " + field + " rather than only nodePath", () => {
    assert.throws(() => createMemoryConnectionDescriptor({ ...fixture(), [field]: "relative" }), code("MC_PATH_INVALID"));
  });
}
for (const [name, changes] of [
  ["same source", { sourcePath: "/fictitious/memory" }],
  ["vault under source", { vaultPath: "/fictitious/source/memory" }],
  ["source under vault", { sourcePath: "/fictitious/memory/source" }],
  ["home as vault", { vaultPath: "/fictitious/home" }]
]) {
  test("MC descriptor rejects lexical overlap " + name, () => {
    assert.throws(() => createMemoryConnectionDescriptor({ ...fixture(), ...changes }), code("MC_PATH_OVERLAP"));
  });
}
test("MC descriptor does not confuse a sibling prefix with an overlapping root", () => {
  const result = createMemoryConnectionDescriptor({ ...fixture(), vaultPath: "/fictitious/source-memory" });
  assert.equal(result.identity.vaultPath, "/fictitious/source-memory");
});
test("MC descriptor preserves spaces, accents and astral characters in literal arguments", () => {
  const input = { ...fixture(), toolkitRoot: "/fictitious/toolkit formación 🐔", manifestPath: "/fictitious/memory/plan á🚀.json" };
  const result = createMemoryConnectionDescriptor(input);
  assert.equal(result.server.args[0], input.toolkitRoot + "/bin/project-memory-mcp.js");
  assert.equal(result.server.args[2], input.manifestPath);
});
test("MC descriptor validates derived path lengths", () => {
  const toolkitRoot = "/" + "x".repeat(MEMORY_CONNECTION_LIMITS.pathChars - 1);
  assert.throws(() => createMemoryConnectionDescriptor({ ...fixture(), toolkitRoot }), code("MC_PATH_INVALID"));
});

test("MC descriptor never invokes getters or toJSON", () => {
  let calls = 0;
  const getter = fixture();
  Object.defineProperty(getter, "nodePath", { enumerable: true, get() { calls++; throw Error("fictitious marker"); } });
  const hook = { ...fixture(), toJSON() { calls++; throw Error("fictitious marker"); } };
  assert.throws(() => createMemoryConnectionDescriptor(getter), code("MC_DATA_INVALID"));
  assert.throws(() => createMemoryConnectionDescriptor(hook), code("MC_DATA_INVALID"));
  assert.throws(() => memoryConnectionHash(hook), code("MC_DATA_INVALID"));
  assert.equal(calls, 0);
});
test("MC descriptor rejects proxies before traps execute", () => {
  let calls = 0;
  const input = new Proxy(fixture(), { ownKeys() { calls++; throw Error(); }, getPrototypeOf() { calls++; throw Error(); } });
  assert.throws(() => createMemoryConnectionDescriptor(input), code("MC_DATA_INVALID"));
  assert.equal(calls, 0);
});
test("MC descriptor rejects cyclic data, symbols, sparse arrays and unsafe keys", () => {
  const cyclic = fixture(); cyclic.circular = cyclic;
  const symbol = fixture(); symbol[Symbol("fixture")] = true;
  const unsafe = JSON.parse('{"__proto__":{"polluted":"fictitious"}}');
  for (const input of [cyclic, symbol, unsafe, { ...fixture(), extra: Array(2) }]) {
    assert.throws(() => createMemoryConnectionDescriptor(input), code("MC_DATA_INVALID"));
  }
  assert.equal(Object.prototype.polluted, undefined);
});
test("MC descriptor accepts inert null-prototype input without invoking anything", () => {
  assert.deepEqual(createMemoryConnectionDescriptor(Object.assign(Object.create(null), fixture())),
    createMemoryConnectionDescriptor(fixture()));
});
test("MC input budget is applied to copied JSON", () => {
  assert.throws(() => copyMemoryConnectionData({ value: "x".repeat(MEMORY_CONNECTION_LIMITS.inputBytes) }), code("MC_INPUT_LIMIT"));
});
test("MC canonical pin binds values and array order without mutating caller data", () => {
  const input = { b: ["one", "two"], a: true }, before = structuredClone(input);
  assert.equal(memoryConnectionHash(input), memoryConnectionHash({ a: true, b: ["one", "two"] }));
  assert.notEqual(memoryConnectionHash(input), memoryConnectionHash({ a: false, b: ["one", "two"] }));
  assert.notEqual(memoryConnectionHash(input), memoryConnectionHash({ a: true, b: ["two", "one"] }));
  assert.deepEqual(input, before);
});
test("MC canonical SHA-256 has a fixed independent reference vector", () => {
  assert.equal(memoryConnectionHash({ z: 1, a: [true, null, "x"] }),
    "cc31fc728ab32ccfd6543dd8cce686b9633b3c47fbec82c88a466688f3a8cb81");
});
test("MC freeze helper owns its clone and leaves the caller mutable", () => {
  const input = { nested: ["fictitious"] }, result = freezeMemoryConnectionData(input);
  assert.ok(Object.isFrozen(result.nested));
  assert.equal(Object.isFrozen(input.nested), false);
  input.nested.push("later");
  assert.deepEqual(result.nested, ["fictitious"]);
});
test("MC key checker rejects proxy, getter and malicious key-list inputs inertly", () => {
  let calls = 0;
  const proxy = new Proxy({ field: true }, { ownKeys() { calls++; throw Error(); } });
  const getter = {};
  Object.defineProperty(getter, "field", { enumerable: true, get() { calls++; throw Error(); } });
  const names = new Proxy(["field"], { get() { calls++; throw Error(); } });
  assert.equal(hasMemoryConnectionKeys(proxy, ["field"]), false);
  assert.equal(hasMemoryConnectionKeys(getter, ["field"]), false);
  assert.equal(hasMemoryConnectionKeys({ field: true }, names), false);
  assert.equal(calls, 0);
});
test("MC descriptor performs no discovery or filesystem calls", () => {
  const saved = new Map(); let calls = 0;
  const patches = [[process, "cwd"], [os, "homedir"], [fs, "readFileSync"],
    [fs, "writeFileSync"], [fs, "realpathSync"], [fs, "statSync"]];
  let result;
  try {
    for (const [object, key] of patches) {
      const original = object[key];
      saved.set(key, original);
      object[key] = () => { calls++; throw Error("discovery must not occur"); };
    }
    result = createMemoryConnectionDescriptor(fixture());
  } finally {
    for (const [object, key] of patches) object[key] = saved.get(key);
  }
  assert.equal(calls, 0);
  assert.equal(result.server.enabled, false);
});
