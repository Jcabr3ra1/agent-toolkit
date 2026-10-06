import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import fsPromises from "node:fs/promises";
import childProcess from "node:child_process";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import { createHash } from "node:crypto";
import Ajv2020 from "ajv/dist/2020.js";
import { createTaskVerifier, verifyRelativePath, VERIFY_FACTS, VERIFY_LIMITS, VERIFY_SCHEMA_ID, LOCAL_READ } from "../src/task-verify.js";
import { taskHash } from "../src/task-prepare.js";

const read = p => JSON.parse(fs.readFileSync(new URL(p, import.meta.url), "utf8"));
const schema = read("../schemas/agent-task-verify.schema.json"), EXAMPLE = read("../examples/task-verify/contract.example.json");
const core = createTaskVerifier(schema);
const sha = s => createHash("sha256").update(s).digest("hex");
const [A, B, C] = ["demo a\n", "demo b\n", "demo c\n"].map(sha);
const OPS = { inspect: [A, A], modify: [A, B], create: [null, B], delete: [A, null] };
const contract = entries => ({ kind: "agent-task-verify-contract", schemaVersion: "1.0.0",
  identity: { projectId: "demo-project", taskId: "demo-task", revision: "r01" }, scope: "listed-files-only", entries });
const entry = (id, operation, extra = {}) => ({ id, root: "source", path: `docs/${id}.md`, operation, before: OPS[operation][0], after: OPS[operation][1], ...extra });
const present = (id, value) => ({ id, status: "present", sha256: value });
const absent = id => ({ id, status: "absent", sha256: null });
const run = (c, phase, observations) => core.evaluate({ contract: c, phase, observations });
const freeze = v => { if (v && typeof v === "object") { Object.values(v).forEach(freeze); Object.freeze(v); } return v; };
function safe(r) {
  for (const [k, v] of Object.entries(VERIFY_FACTS)) assert.equal(r[k], v);
  assert.deepEqual(r.reasons, [...new Set(r.reasons)].sort());
  assert.equal(r.audit.contractByteSha256, null); assert.equal(r.audit.expectedPinSha256, null);
  if (["matched", "mismatched"].includes(r.state)) assert.equal(r.provenance, "declared-observations");
  else { assert.deepEqual(r.results, []); assert.equal(r.provenance, "none"); }
  return r;
}

for (const [operation, [before, after]] of Object.entries(OPS)) for (const phase of ["before", "after"]) {
  const expected = phase === "before" ? before : after;
  const cases = expected === null
    ? [[absent("x"), "matched", "matched-absent"], [present("x", null), "mismatched", "unexpected-present"], [present("x", C), "mismatched", "unexpected-present"]]
    : [[present("x", expected), "matched", "matched-hash"], [present("x", C), "mismatched", "hash-differs"], [absent("x"), "mismatched", "missing"]];
  for (const [observation, state, outcome] of cases) test(`TV ${operation}/${phase} → ${outcome} (${observation.status})`, () => {
    const r = safe(run(contract([entry("x", operation)]), phase, [observation]));
    assert.equal(r.state, state); assert.equal(r.phase, phase); assert.deepEqual(r.identity, contract([]).identity);
    assert.deepEqual(r.results, [{ id: "x", root: "source", operation, outcome, expected, observed: observation.sha256 }]);
    assert.ok(r.reasons.includes(state === "matched" ? "verify-matched" : "verify-" + outcome));
  });
}
test("TV one difference makes the whole listed set mismatched; results keep contract order", () => {
  const c = contract([entry("a", "inspect"), entry("b", "modify"), entry("c", "create"), entry("d", "delete")]);
  const r = safe(run(c, "after", [absent("d"), present("c", B), present("b", C), present("a", A)]));
  assert.equal(r.state, "mismatched"); assert.deepEqual(r.reasons, ["verify-hash-differs"]);
  assert.deepEqual(r.results.map(x => [x.id, x.outcome]), [["a", "matched-hash"], ["b", "hash-differs"], ["c", "matched-hash"], ["d", "matched-absent"]]);
});
test("TV modify without delta is reported, never promoted to approval", () => {
  const r = safe(run(contract([entry("x", "modify", { after: A })]), "after", [present("x", A)]));
  assert.equal(r.state, "matched"); assert.deepEqual(r.reasons, ["verify-matched", "verify-modify-without-delta"]); assert.equal(r.approvalGranted, false);
});
for (const [name, mutate] of [
  ["inspect-changed", e => { e.operation = "inspect"; e.after = B; }], ["inspect-null", e => { e.operation = "inspect"; e.before = null; e.after = null; }],
  ["modify-null-before", e => { e.before = null; }], ["modify-null-after", e => { e.after = null; }],
  ["create-with-before", e => { e.operation = "create"; }], ["create-null-after", e => { e.operation = "create"; e.before = null; e.after = null; }],
  ["delete-with-after", e => { e.operation = "delete"; }], ["delete-null-before", e => { e.operation = "delete"; e.before = null; e.after = null; }],
  ["wildcard", e => { e.after = "*"; }], ["uppercase", e => { e.after = B.toUpperCase(); }], ["missing-after", e => { delete e.after; }],
  ["unknown-operation", e => { e.operation = "rename"; }], ["unknown-root", e => { e.root = "home"; }], ["command-field", e => { e.command = "rm -rf ."; }]
]) test("TV invalid expectation " + name, () => {
  const e = entry("x", "modify"); mutate(e);
  const r = safe(run(contract([e]), "before", [present("x", A)])); assert.equal(r.state, "invalid"); assert.equal(r.identity, null);
});
for (const [name, mutate] of [["kind", c => { c.kind = "agent-task-brief"; }], ["version", c => { c.schemaVersion = "1.0.1"; }],
  ["scope", c => { c.scope = "complete-tree"; }], ["empty", c => { c.entries = []; }], ["extra", c => { c.observations = []; }],
  ["identity-extra", c => { c.identity.account = "demo"; }], ["identity-control", c => { c.identity.taskId = "demo\u001b"; }],
  ["revision", c => { c.identity.revision = "1"; }], ["too-many", c => { c.entries = Array.from({ length: 129 }, (_, i) => entry("x" + i, "inspect")); }]])
  test("TV invalid contract " + name, () => {
    const c = contract([entry("x", "inspect")]); mutate(c); assert.equal(safe(run(c, "before", [present("x", A)])).state, "invalid");
  });
test("TV 128 entries with maximal IDs and paths stay inside the report cap", () => {
  const id = i => ("e" + String(i).padStart(3, "0")).padEnd(64, "x");
  const entries = Array.from({ length: VERIFY_LIMITS.entries }, (_, i) => ({ ...entry("x", "modify"), id: id(i), path: "d/" + String(i).padStart(3, "0") + "/" + "n".repeat(500) }));
  const r = safe(run(contract(entries), "after", entries.map(e => present(e.id, C))));
  assert.equal(r.state, "mismatched"); assert.equal(r.results.length, 128); assert.ok(Buffer.byteLength(JSON.stringify(r)) <= VERIFY_LIMITS.reportBytes);
});
for (const [name, observations] of [["missing", []], ["extra", [present("x", A), present("y", A)]], ["duplicate", [present("x", A), present("x", A)]],
  ["other-id", [present("y", A)]], ["present-without-hash", [present("x", null)]], ["absent-with-hash", [{ id: "x", status: "absent", sha256: A }]],
  ["blocked-with-hash", [{ id: "x", status: "blocked", sha256: A }]], ["unknown-status", [{ id: "x", status: "readable", sha256: A }]],
  ["claimed-provenance", [{ ...present("x", A), provenance: "local-read" }]]])
  test("TV observations are exact per ID: " + name, () => assert.equal(safe(run(contract([entry("x", "inspect")]), "before", observations)).state, "invalid"));
test("TV a declared blocked observation blocks the set without partial results", () => {
  const r = safe(run(contract([entry("a", "inspect"), entry("b", "inspect")]), "before", [present("a", A), { id: "b", status: "blocked", sha256: null }]));
  assert.equal(r.state, "blocked"); assert.deepEqual(r.reasons, ["verify-observation-blocked"]); assert.deepEqual(r.results, []);
});
test("TV evaluate cannot claim local provenance or pin evidence; local key requires matching pin", () => {
  const c = contract([entry("x", "inspect")]), obs = [present("x", A)];
  for (const extra of [{ provenance: "local-read" }, { audit: { contractByteSha256: A } }, { expect: A }])
    assert.equal(safe(core.evaluate({ contract: c, phase: "before", observations: obs, ...extra })).state, "invalid");
  assert.equal(safe(run(c, "before", obs)).provenance, "declared-observations");
  const local = core[LOCAL_READ]({ contract: c, phase: "before", observations: obs }, { contractByteSha256: B, expectedPinSha256: B });
  assert.equal(local.state, "matched"); assert.equal(local.provenance, "local-read"); assert.equal(local.audit.contractByteSha256, B);
  for (const audit of [null, {}, { contractByteSha256: B, expectedPinSha256: C }, { contractByteSha256: "x", expectedPinSha256: "x" }]) {
    const r = core[LOCAL_READ]({ contract: c, phase: "before", observations: obs }, audit);
    assert.equal(r.state, "blocked"); assert.deepEqual(r.reasons, ["verify-pin-mismatch"]); assert.equal(r.provenance, "none");
  }
});
for (const phase of ["during", "", null, "BEFORE"]) test("TV invalid phase " + JSON.stringify(phase), () => {
  const r = safe(core.evaluate({ contract: contract([entry("x", "inspect")]), phase, observations: [present("x", A)] }));
  assert.equal(r.state, "invalid"); assert.equal(r.phase, null);
});
for (const p of ["../a.md", "/a.md", "./a.md", "a//b.md", "a/", "a\\b.md", "a/*.md", "a/../b.md", ".env", "keys/id_rsa", "cert.pem", ".git/config",
  ".obsidian/app.json", ".claude/settings.json", ".codex/config.toml", ".gemini/settings.json", ".agents/skills/x.md", ".credentials.json",
  "a\u202eb.md", " a.md", "a.md ", "C:/a.md", "a?.md", "x".repeat(513)])
  test("TV unsafe listed path " + JSON.stringify(p.slice(0, 40)), () => {
    assert.equal(safe(run(contract([entry("x", "inspect", { path: p })]), "before", [present("x", A)])).state, "invalid");
  });
test("TV relative path helper accepts exact repository paths only", () => {
  assert.equal(verifyRelativePath("docs/a.md"), true); assert.equal(verifyRelativePath("docs/.codex/a.md"), false); assert.equal(verifyRelativePath("."), false);
});
test("TV case/NFC collisions and file-as-directory conflicts are invalid; equal paths in different roots are allowed", () => {
  for (const [p, q] of [["README.md", "readme.md"], ["caf\u00e9.md", "cafe\u0301.md"], ["docs", "docs/a.md"], ["docs/a.md", "docs/a.md"]]) {
    const r = safe(run(contract([entry("a", "inspect", { path: p }), entry("b", "inspect", { path: q })]), "before", [present("a", A), present("b", A)]));
    assert.equal(r.state, "invalid"); assert.ok(r.reasons.includes("verify-path-collision"));
  }
  const c = contract([entry("a", "inspect", { path: "README.md" }), entry("b", "inspect", { path: "README.md", root: "handoff" })]);
  assert.equal(safe(run(c, "before", [present("a", A), present("b", A)])).state, "matched");
  const dup = contract([entry("a", "inspect"), entry("a", "inspect", { path: "docs/other.md" })]);
  assert.ok(safe(run(dup, "before", [present("a", A)])).reasons.includes("verify-duplicate-id"));
});
test("TV deterministic core with frozen inputs; caller mutations and schema changes do not leak", () => {
  const input = { contract: contract([entry("x", "modify")]), phase: "after", observations: [present("x", B)] }, copy = structuredClone(input);
  const r = core.evaluate(freeze(input)); assert.deepEqual(input, copy); assert.deepEqual(core.evaluate(copy), r);
  assert.equal(r.audit.contractSha256, taskHash(copy.contract)); assert.equal(r.audit.verifySchemaSha256, taskHash(schema));
  r.results[0].outcome = "hash-differs"; r.identity.taskId = "changed"; assert.equal(core.evaluate(copy).results[0].outcome, "matched-hash");
  const s = structuredClone(schema), v = createTaskVerifier(s); s.$defs.phase.enum.push("during");
  assert.equal(v.evaluate({ ...copy, phase: "during" }).state, "invalid");
  assert.throws(() => createTaskVerifier({ ...schema, $id: "https://example.invalid/other" }), /Invalid trusted verify schema/);
});
test("TV proxies/getters/toJSON/cycles/symbols/holes/BigInt are rejected without invoking hooks", () => {
  let traps = 0; const base = { contract: contract([entry("x", "inspect")]), phase: "before", observations: [present("x", A)] };
  const proxy = new Proxy(structuredClone(base), { get() { traps++; throw Error("private"); }, getPrototypeOf() { traps++; throw Error("private"); } });
  const getter = { ...structuredClone(base), get phase() { traps++; return "before"; } };
  const toJSON = { ...structuredClone(base), toJSON() { traps++; return base; } };
  const cycle = structuredClone(base); cycle.contract.self = cycle;
  const symbol = structuredClone(base); symbol[Symbol("private")] = 1;
  const holes = structuredClone(base); holes.observations = [, ];
  for (const value of [proxy, getter, toJSON, cycle, symbol, holes, { ...base, phase: 1n }, undefined, null, "contract"]) assert.equal(safe(core.evaluate(value)).state, "invalid");
  assert.equal(traps, 0);
});
test("TV Unicode, control and size bounds of contract data", () => {
  for (const id of ["\ud800", "demo\u202e", "demo\x00"]) assert.equal(safe(run(contract([entry("x", "inspect", { id })]), "before", [present("x", A)])).state, "invalid");
  const big = contract([entry("x", "inspect")]); big.identity.projectId = "a".repeat(2000001);
  assert.equal(safe(run(big, "before", [present("x", A)])).state, "invalid");
  let deep = {}; for (let i = 0; i < 33; i++) deep = { x: deep };
  assert.equal(safe(core.evaluate({ contract: deep, phase: "before", observations: [] })).state, "invalid");
});
test("TV core never touches IO, processes, network, clock or randomness", () => {
  const replace = [], deny = () => { throw Error("Unexpected effect"); };
  const patch = (o, k) => { const old = o[k]; replace.push(() => { o[k] = old; }); o[k] = deny; };
  try {
    for (const [o, ks] of [[fs, ["readFileSync", "writeFileSync", "lstatSync", "openSync", "readdirSync"]], [fsPromises, ["readFile", "writeFile", "open", "lstat", "readdir"]],
      [childProcess, ["spawn", "exec", "execFile", "spawnSync", "execSync"]], [http, ["request", "get"]], [https, ["request", "get"]], [net, ["connect"]],
      [Date, ["now"]], [Math, ["random"]]]) for (const k of ks) patch(o, k);
    const v = createTaskVerifier(schema);
    assert.equal(v.evaluate({ contract: contract([entry("x", "create")]), phase: "before", observations: [absent("x")] }).state, "matched");
  } finally { replace.reverse().forEach(f => f()); }
});
test("TV closed report schema keeps every approval/quality/execution flag fixed", () => {
  const ajv = new Ajv2020({ strict: true }); ajv.addSchema(schema); const valid = ajv.compile({ $ref: VERIFY_SCHEMA_ID + "#/$defs/report" });
  const r = run(contract([entry("x", "inspect")]), "before", [present("x", A)]); assert.equal(valid(r), true);
  const mutations = [...Object.keys(VERIFY_FACTS).map(k => x => { x[k] = k === "scopeCoverage" ? "complete-tree" : !x[k]; }),
    x => { x.state = "approved"; }, x => { x.extra = "private"; }, x => { x.results[0].outcome = "hash-differs"; },
    x => { x.provenance = "local-read"; }, x => { x.state = "blocked"; }, x => { x.results = []; },
    x => { x.reasons = ["verify-hash-differs"]; }, x => { x.results[0].body = "private"; }];
  for (const mutate of mutations) { const c = structuredClone(r); mutate(c); assert.equal(valid(c), false); }
});
test("TV failure reports are limited to blocked/invalid and never carry results", () => {
  assert.throws(() => core.failure("matched", ["verify-matched"]));
  const r = core.failure("blocked", ["verify-pin-mismatch"], { phase: "after", contract: contract([entry("x", "inspect")]), audit: { contractByteSha256: null, expectedPinSha256: A } });
  assert.equal(r.state, "blocked"); assert.deepEqual(r.results, []); assert.equal(r.identity.taskId, "demo-task"); assert.equal(r.audit.expectedPinSha256, A);
  assert.throws(() => core.failure("blocked", ["Error: private /Users/x"]));
});
test("TV fictitious example contract is valid and its hashes are those of the documented strings", () => {
  assert.equal(core.checkContract(EXAMPLE).ok, true);
  const expected = { "demo-guide": ["demo guide unchanged\n", "demo guide unchanged\n"], "demo-readme": ["demo readme v1\n", "demo readme v2\n"],
    "demo-new-note": [null, "demo new note\n"], "demo-obsolete": ["demo obsolete note\n", null], "demo-proposal": ["demo proposal r01\n", "demo proposal r01\n"] };
  assert.deepEqual(Object.fromEntries(EXAMPLE.entries.map(e => [e.id, [e.before, e.after]])),
    Object.fromEntries(Object.entries(expected).map(([id, pair]) => [id, pair.map(s => s === null ? null : sha(s))])));
});
