import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { runTaskCli } from "../src/task-cli.js";
import { runExternalVerifierCli } from "../src/task-external-verifier.js";

const read = relative => JSON.parse(fsSync.readFileSync(new URL(relative, import.meta.url), "utf8"));
const sourceExample = Object.fromEntries(["task", "request", "catalog", "policy"].map(name => [name, read(`../examples/external-verifier/${name}.example.json`)]));
const localTest = test;
const hash = value => createHash("sha256").update(value).digest("hex");
function capture() {
  const out = [], err = [];
  return { out, err, io: { out: value => out.push(value), err: value => err.push(value) } };
}
function inspector(executable, account = "sesión ChatGPT de prueba", argsPrefix = []) {
  return async () => ({ executable, argsPrefix, version: "0.163.0", authMethod: "chatgpt", account,
    disable: ["apps", "hooks", "multi_agent", "plugins", "shell_tool"] });
}

async function fixture(t, prefix = "agent-external-test-") {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), prefix)));
  await fs.chmod(root, 0o700);
  const rootStat = await fs.lstat(root);
  t.after(async () => {
    const current = await fs.lstat(root).catch(() => null);
    if (current?.isDirectory() && !current.isSymbolicLink() && current.dev === rootStat.dev && current.ino === rootStat.ino)
      await fs.rm(root, { recursive: true });
  });
  const source = path.join(root, "source"), handoff = path.join(root, "handoff"), inputs = path.join(root, "inputs");
  for (const dir of [source, handoff, inputs]) { await fs.mkdir(dir); await fs.chmod(dir, 0o700); }
  const filePath = path.join(source, "review.js"), contents = Buffer.from("export function total(values) { return values.reduce((a, b) => a + b, 0); }\n");
  await fs.writeFile(filePath, contents, { mode: 0o600 });
  const data = structuredClone(sourceExample), expected = hash(contents);
  data.task.base.repositoryRoot = source;
  data.task.base.instructionRefs = [{ id: "demo-instructions", kind: "instructions", locator: "review.js", sha256: expected }];
  data.task.scope.files = [{ path: "review.js", operation: "inspect", expectedBase: expected }];
  data.task.contextRefs = [{ id: "demo-note", kind: "source", locator: "review.js", sha256: expected }];
  data.request.provider = "openai"; data.request.client = "codex-cli";
  data.catalog.profiles.forEach((profile, index) => {
    profile.provider = "openai"; profile.client = "codex-cli"; profile.requestedModel = ["gpt-6.1-sol", "gpt-6-sol", "gpt-5.6-sol"][index];
    const efforts = { brief: "low", standard: "medium", deep: "high" };
    profile.effortOptions = ["low", "medium", "high"];
    profile.evaluations.forEach(item => { item.effort = efforts[item.effort]; });
  });
  for (const route of data.policy.routes) {
    route.provider = "openai"; route.client = "codex-cli";
    for (const family of route.families) for (const rule of family.effortRules)
      for (const option of rule.options) option.effort = ({ brief: "low", standard: "medium", deep: "high" })[option.effort];
  }
  const paths = {};
  for (const name of ["task", "request", "catalog", "policy"]) {
    paths[name] = path.join(inputs, `${name}.json`);
    await fs.writeFile(paths[name], JSON.stringify(data[name], null, 2) + "\n", { mode: 0o600 });
  }
  const packageRoot = path.join(root, "node_modules", "@openai", "codex");
  await fs.mkdir(packageRoot, { recursive: true });
  const script = path.join(packageRoot, "cli.cjs");
  await fs.writeFile(path.join(packageRoot, "package.json"), JSON.stringify({ name: "@openai/codex", bin: { codex: "cli.cjs" } }));
  const codex = path.join(root, process.platform === "win32" ? "codex.cmd" : "fake-codex");
  const execLog = path.join(root, "codex-exec-called");
  const sourceCode = `const fs = require('node:fs');
const args = process.argv.slice(2);
if (args[0] === '--version') { console.log('codex-cli 0.163.0'); process.exit(0); }
if (args[0] === 'login') { console.log('Logged in using ChatGPT'); process.exit(0); }
if (args[0] === 'features') { console.log('apps stable true\\nhooks stable true\\nmulti_agent stable true\\nplugins stable true\\nshell_tool stable true\\nbrowser_use stable true\\nstandalone_web_search under development false'); process.exit(0); }
if (args[0] === 'exec') fs.writeFileSync(${JSON.stringify(execLog)}, 'invoked\\n');
fs.readFileSync(0);
fs.writeFileSync(args[args.indexOf('--output-last-message') + 1], '# Revisión simulada\\nSin hallazgos en la función total.\\n');
console.log('fake codex completed');
`;
  await fs.writeFile(script, sourceCode);
  await fs.writeFile(codex, process.platform === "win32" ? "@exit /b 99\r\n" : `#!${process.execPath}\n${sourceCode}`, { mode: 0o700 });
  await fs.chmod(codex, 0o700);
  const argv = ["preview", ...["task", "request", "catalog", "policy"].flatMap(name => ["--" + name, paths[name]]),
    "--source", source, "--handoff", handoff, "--delivery", "review/r01.md"];
  await fs.mkdir(path.join(handoff, "review"), { mode: 0o700 });
  return { root, source, handoff, inputs, paths, filePath, contents, expected, codex, script, execLog, argv, data };
}

function deps(f, extra = {}) { return { cwd: f.inputs, codexPath: f.codex,
  inspectCodex: inspector(process.platform === "win32" ? process.execPath : f.codex, "sesión ChatGPT de prueba", process.platform === "win32" ? [f.script] : []), ...extra }; }
function ticketFrom(f) { return fs.readdir(f.handoff).then(names => names.find(name => name.startsWith(".agent-task-external-") && name.endsWith(".json"))).then(name => path.join(f.handoff, name)); }
async function runArgs(f, ticketPath) {
  const bytes = await fs.readFile(ticketPath), ticket = JSON.parse(bytes);
  return ["run", "--ticket", ticketPath, "--expect", hash(bytes), "--confirm", ticket.confirm];
}

localTest("external verifier preview prepares Codex argv and a one-use confirmation without launching it", async t => {
  const f = await fixture(t, "agent external's test "), c = capture(); let launches = 0;
  const result = await runExternalVerifierCli(f.argv, c.io, deps(f, { spawn() { launches++; throw Error("must not start during preview"); } }));
  assert.equal(result, 0); assert.deepEqual(c.err, []); assert.equal(launches, 0);
  assert.match(c.out[0], /preview preparada/); assert.match(c.out[0], /sesión ChatGPT de prueba/);
  assert.match(c.out[0], /gpt-6-sol/); assert.match(c.out[0], /--sandbox",\n  "read-only/);
  assert.match(c.out[0], /--disable[\s\S]*shell_tool/); assert.match(c.out[0], /ARGV exacto del cliente/);
  assert.match(c.out[0], /comando exacto para confirmar/i); assert.match(c.out[0], /Prompt por stdin/);
  const command = c.out[0].split("Comando exacto para confirmar y ejecutar una sola vez:\n")[1].split("\n")[0];
  if (process.platform === "win32") {
    // Parse only: never execute the confirmation or start a real model client.
    const parser = "$text = [Console]::In.ReadToEnd(); $tokens = $null; $errors = $null; " +
      "$ast = [System.Management.Automation.Language.Parser]::ParseInput($text, [ref]$tokens, [ref]$errors); " +
      "$command = $ast.Find({param($node) $node -is [System.Management.Automation.Language.CommandAst]}, $true); " +
      "@{errors = $errors.Count; operator = [string]$command.InvocationOperator; argv = @($command.CommandElements | ForEach-Object {$_.Value})} | ConvertTo-Json -Compress";
    const parsed = spawnSync(path.join(process.env.SystemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe"),
      ["-NoProfile", "-NonInteractive", "-Command", parser], { input: command, encoding: "utf8", shell: false, windowsHide: true, timeout: 10000 });
    assert.equal(parsed.status, 0, parsed.stderr);
    const result = JSON.parse(parsed.stdout);
    assert.equal(result.errors, 0, "confirmation must be valid PowerShell syntax");
    assert.equal(result.operator, "Ampersand");
    assert.deepEqual(result.argv, [process.execPath, fileURLToPath(new URL("../bin/agent-task.js", import.meta.url)),
      "external-verifier", ...await runArgs(f, await ticketFrom(f))]);
  } else {
    assert.equal(command.startsWith("& "), false);
  }
  const ticket = JSON.parse(await fs.readFile(await ticketFrom(f), "utf8"));
  assert.equal(path.dirname(ticket.workspace), await fs.realpath(os.tmpdir()));
  assert.ok(ticket.argv.includes(ticket.workspace));
  assert.equal(ticket.argv.includes(f.source), false);
  assert.equal(ticket.prompt.includes("export function total"), true);
  assert.equal(ticket.prompt.includes(f.source), false);
  assert.deepEqual(await fs.readFile(f.filePath), f.contents);
  assert.equal(await fs.stat(path.join(f.handoff, "review/r01.md")).then(() => true, () => false), false);
});

localTest("external verifier local Codex preflight reads version, ChatGPT login method and default capabilities without inference", async t => {
  const f = await fixture(t), c = capture();
  assert.equal(await runExternalVerifierCli(f.argv, c.io, { cwd: f.inputs, codexPath: f.codex }), 0, c.err.join(""));
  assert.match(c.out[0], /Codex CLI 0\.163\.0/); assert.match(c.out[0], /sesión ChatGPT autenticada/);
  assert.equal(await fs.stat(f.execLog).then(() => true, () => false), false);
});

localTest("external verifier reads Codex login status from stderr without accepting extra account output", async t => {
  const f = await fixture(t), c = capture();
  const runLocal = (_file, rawArgs) => {
    const args = rawArgs[0] === f.script ? rawArgs.slice(1) : rawArgs;
    if (args[0] === "--version") return { status: 0, stdout: "codex-cli 0.163.0\n", stderr: "" };
    if (args[0] === "login") return { status: 0, stdout: "", stderr: "Logged in using ChatGPT\n" };
    return { status: 0, stdout: "apps stable true\nhooks stable true\nmulti_agent stable true\nplugins stable true\nshell_tool stable true\ncode_mode_host stable true\nin_app_local_automation stable true\nmcp_2026_07_28 stable true\nskill_mcp_dependency_install stable true\nunified_exec stable true\ngoals stable true\nsleep_tool stable true\nworktrees stable true\nstep_model_switching stable true\n", stderr: "" };
  };
  const result = await runExternalVerifierCli(f.argv, c.io, { cwd: f.inputs, codexPath: f.codex, runLocal });
  assert.equal(result, 0, c.err.join("")); assert.match(c.out[0], /sesión ChatGPT autenticada/);
  const ticket = JSON.parse(await fs.readFile(await ticketFrom(f), "utf8"));
  for (const feature of ["shell_tool", "code_mode_host", "in_app_local_automation", "mcp_2026_07_28", "skill_mcp_dependency_install", "unified_exec", "goals", "sleep_tool", "worktrees", "step_model_switching"])
    assert.ok(ticket.client.disable.includes(feature), `${feature} must be disabled`);
  const f2 = await fixture(t), c2 = capture();
  const ambiguousLogin = (_file, rawArgs) => { const args = rawArgs[0] === f2.script ? rawArgs.slice(1) : rawArgs; return args[0] === "--version" ?
    { status: 0, stdout: "codex-cli 0.163.0\n", stderr: "" } : args[0] === "login" ?
    { status: 0, stdout: "Logged in using ChatGPT\n", stderr: "Logged in using API key\n" } :
    { status: 0, stdout: "apps stable true\nhooks stable true\nmulti_agent stable true\nplugins stable true\nshell_tool stable true\n", stderr: "" }; };
  assert.equal(await runExternalVerifierCli(f2.argv, c2.io, { cwd: f2.inputs, codexPath: f2.codex, runLocal: ambiguousLogin }), 2);
  assert.match(c2.err[0], /external-account-not-chatgpt/);
});

localTest("external verifier rejects an unconfirmed command before consuming the ticket or starting a child", async t => {
  const f = await fixture(t), preview = capture();
  assert.equal(await runExternalVerifierCli(f.argv, preview.io, deps(f)), 0);
  const ticketPath = await ticketFrom(f), bytes = await fs.readFile(ticketPath), ticket = JSON.parse(bytes), args = ["run", "--ticket", ticketPath, "--expect", hash(bytes), "--confirm", "0".repeat(16)];
  let launches = 0; const result = await runExternalVerifierCli(args, capture().io, deps(f, { spawn() { launches++; throw Error(); } }));
  assert.equal(result, 2); assert.equal(launches, 0); assert.equal(await fs.stat(ticketPath).then(() => true, () => false), true);
  assert.notEqual(ticket.confirm, "0".repeat(16));
});

localTest("external verifier uses the confirmed command with a read-only sandbox and saves a verified delivery", async t => {
  const f = await fixture(t), preview = capture(); let observed = null;
  assert.equal(await runExternalVerifierCli(f.argv, preview.io, deps(f)), 0);
  const ticketPath = await ticketFrom(f), workspacePath = JSON.parse(await fs.readFile(ticketPath, "utf8")).workspace;
  const args = await runArgs(f, ticketPath), runCapture = capture(), result = await runExternalVerifierCli(args, runCapture.io,
    deps(f, { spawn(executable, argv, options) {
      observed = { executable, argv, options };
      assert.equal(options.shell, false); assert.equal(options.detached, process.platform !== "win32");
      assert.equal(options.cwd, workspacePath);
      assert.equal(Object.hasOwn(options.env, "OPENAI_API_KEY"), false); assert.equal(Object.hasOwn(options.env, "HTTP_PROXY"), false);
      return spawn(executable, argv, options);
    } }));
  assert.equal(result, 0, runCapture.err.join("")); assert.ok(observed); assert.equal(observed.executable, process.platform === "win32" ? process.execPath : f.codex);
  assert.ok(observed.argv.includes("read-only")); assert.ok(observed.argv.includes("--ephemeral"));
  assert.ok(observed.argv.includes("--ignore-user-config")); assert.ok(observed.argv.includes("--disable"));
  assert.equal(observed.argv.at(-1), "-");
  assert.match(await fs.readFile(path.join(f.handoff, "review/r01.md"), "utf8"), /Revisión simulada/);
  assert.deepEqual(await fs.readFile(f.filePath), f.contents);
  assert.equal(await fs.stat(ticketPath).then(() => true, () => false), false);
  assert.equal((await fs.readdir(f.handoff)).some(name => name.startsWith(".agent-task-response-")), false);
  assert.equal(await fs.stat(workspacePath).then(() => true, () => false), false);
});

localTest("external verifier rechecks source immediately before invocation and spends nothing when stale", async t => {
  const f = await fixture(t), preview = capture();
  assert.equal(await runExternalVerifierCli(f.argv, preview.io, deps(f)), 0);
  const ticketPath = await ticketFrom(f), args = await runArgs(f, ticketPath); await fs.appendFile(f.filePath, "// changed\n");
  let launches = 0; const c = capture();
  assert.equal(await runExternalVerifierCli(args, c.io, deps(f, { spawn() { launches++; throw Error(); } })), 2);
  assert.equal(launches, 0); assert.match(c.err[0], /external-base-mismatch/);
  assert.equal(await fs.stat(path.join(f.handoff, "review/r01.md")).then(() => true, () => false), false);
});

for (const confirmed of [true, false]) test(`Windows external verifier cancellation ${confirmed ? "terminates the owned process tree" : "reports an unconfirmed process tree conservatively"}`, {
  skip: process.platform !== "win32" ? "Windows taskkill process-tree behavior; POSIX uses process groups." : false
}, async t => {
  const f = await fixture(t), ready = path.join(f.root, "ready.json");
  let child;
  t.after(() => { try { child?.kill("SIGKILL"); } catch {} });
  const fixtureCode = confirmed
    ? `const fs = require('node:fs'); const child = require('node:child_process').spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'inherit' }); fs.writeFileSync(${JSON.stringify(ready)}, JSON.stringify({ pid: child.pid })); setInterval(() => {}, 1000);`
    : `require('node:fs').writeFileSync(${JSON.stringify(ready)}, '{}'); setInterval(() => {}, 1000);`;
  await fs.writeFile(f.script, fixtureCode);
  assert.equal(await runExternalVerifierCli(f.argv, capture().io, deps(f)), 0);
  const args = await runArgs(f, await ticketFrom(f)), c = capture();
  const executing = runExternalVerifierCli(args, c.io, deps(f, {
    spawn(executable, argv, options) { child = spawn(executable, argv, options); return child; },
    ...(confirmed ? {} : { runTaskkill: () => ({ status: 1 }) })
  }));
  let state;
  for (let attempt = 0; attempt < 100; attempt++) {
    try { state = JSON.parse(await fs.readFile(ready, "utf8")); break; } catch {}
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  assert.ok(state, "owned test client must start before cancellation");
  process.emit("SIGINT");
  assert.equal(await executing, 2);
  assert.match(c.err.join(""), confirmed ? /external-client-canceled/ : /external-process-tree-unconfirmed/);
  if (confirmed) assert.throws(() => process.kill(state.pid, 0), { code: "ESRCH" });
  await assert.rejects(fs.lstat(path.join(f.handoff, "review/r01.md")), { code: "ENOENT" });
  assert.equal(c.out.length, 0);
});

localTest("external verifier refuses sensitive task metadata before making a prompt or ticket", async t => {
  const f = await fixture(t), task = JSON.parse(await fs.readFile(f.paths.task, "utf8"));
  task.objective = "api_key=abcdefghijk";
  await fs.writeFile(f.paths.task, JSON.stringify(task), { mode: 0o600 });
  const c = capture(); let launches = 0;
  assert.equal(await runExternalVerifierCli(f.argv, c.io, deps(f, { spawn() { launches++; throw Error(); } })), 2);
  assert.match(c.err[0], /external-(?:task-not-prepared|prompt-sensitive)/); assert.equal(launches, 0);
  assert.equal((await fs.readdir(f.handoff)).some(name => name.startsWith(".agent-task-external-")), false);
});
test("external verifier rejects private handoff components using native path separators", async t => {
  const f = await fixture(t), c = capture(), args = [...f.argv];
  args[args.indexOf("--handoff") + 1] = path.join(f.root, ".codex", "handoff");
  let forbiddenReads = 0;
  assert.equal(await runExternalVerifierCli(args, c.io, deps(f, { fileIo: {
    async lstat(full, options) { if (full.includes(`${path.sep}.codex${path.sep}`)) forbiddenReads++; return fs.lstat(full, options); }
  } })), 2);
  assert.match(c.err.join(""), /external-handoff-unsafe/); assert.equal(forbiddenReads, 0);
});

localTest("external verifier refuses API-key sessions and model routes other than OpenAI Codex", async t => {
  const f = await fixture(t), c = capture();
  assert.equal(await runExternalVerifierCli(f.argv, c.io, deps(f, { inspectCodex: async () => ({
    executable: f.codex, version: "0.163.0", authMethod: "api-key", account: "API key", disable: ["shell_tool"]
  }) })), 2);
  assert.match(c.err[0], /external-account-not-chatgpt/);
  const changed = structuredClone(f.data); changed.request.client = "example-cli";
  await fs.writeFile(f.paths.request, JSON.stringify(changed.request), { mode: 0o600 });
  const c2 = capture(); assert.equal(await runExternalVerifierCli(f.argv, c2.io, deps(f)), 2);
  assert.match(c2.err[0], /external-client-not-selected/);
});

localTest("task CLI keeps external execution opt-in and exposes its separate help", async () => {
  const c = capture(); assert.equal(await runTaskCli(["external-verifier", "--help"], c.io), 0);
  assert.match(c.out[0], /No llama al modelo/i);
  const invalid = capture(); assert.equal(await runTaskCli(["external-verifier", "run", "--ticket", "/tmp/ticket"], invalid.io), 2);
  assert.equal(invalid.out.length, 0); assert.match(invalid.err[0], /external-invalid-option/);
});
