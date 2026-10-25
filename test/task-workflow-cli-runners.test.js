import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { PassThrough } from "node:stream";
import { after, test } from "node:test";

import { createClaudeCodeRunner } from "../src/claude-code-runner.js";
import { createCodexCliRunner } from "../src/codex-cli-runner.js";

const root = await fs.mkdtemp(path.join(os.tmpdir(), "agent-toolkit-cli-runner-test-"));
const projectRoot = path.join(root, "project");
const home = path.join(root, "home");
await fs.mkdir(projectRoot, { mode: 0o700 });
await fs.mkdir(home, { mode: 0o700 });
await fs.mkdir(path.join(home, ".codex"), { mode: 0o700 });

after(() => fs.rm(root, { recursive: true, force: true }));

const task = {
  title: "Ajustar tarjeta",
  project: "fixture-project",
  objective: "Mejorar la tarjeta principal.",
  mode: "autonomous",
  scope: "Solo la tarjeta principal.",
  acceptance: "Se adapta a móvil.",
  checks: "npm test"
};

const plan = {
  summary: "Inspeccionar la tarjeta, corregir el diseño responsive y añadir cobertura.",
  claude: { model: "sonnet", effort: "high" },
  files: [{ path: "src/dashboard-card.js", action: "modify", reason: "Implementa la tarjeta principal." }],
  acceptance: ["La tarjeta se adapta a móvil."],
  checks: ["npm test"]
};

function fakeSyncForCodex(executable, args) {
  if (args[0] === "--version") return { status: 0, stdout: "codex-cli 0.163.0\n", stderr: "" };
  if (args[0] === "login" && args[1] === "status") return { status: 0, stdout: "", stderr: "Logged in using ChatGPT\n" };
  throw new Error(`Unexpected Codex preflight: ${args.join(" ")}`);
}

function fakeSyncForClaude(executable, args) {
  if (args[0] === "--version") return { status: 0, stdout: "2.1.300\n", stderr: "" };
  if (args[0] === "auth" && args[1] === "status") return {
    status: 0,
    stdout: JSON.stringify({ loggedIn: true, authMethod: "claude.ai", apiProvider: "firstParty" }),
    stderr: ""
  };
  throw new Error(`Unexpected Claude preflight: ${args.join(" ")}`);
}

test("Codex preview shows the exact read-only CLI call and its chosen model and effort", async () => {
  let invocations = 0;
  const runner = createCodexCliRunner({
    codexPath: process.execPath,
    env: { HOME: home, PATH: process.env.PATH ?? "" },
    home,
    runSync: fakeSyncForCodex,
    execute: async ({ args, prompt, cwd }) => {
      invocations++;
      assert.equal(cwd, await fs.realpath(projectRoot));
      assert.match(prompt, /Mejorar la tarjeta principal/u);
      assert.ok(args.includes("read-only"));
      assert.ok(args.includes("--ephemeral"));
      assert.ok(args.includes("gpt-6.1-sol"));
      return "";
    }
  });

  const preview = await runner.preview({ projectRoot, task, model: "gpt-6.1-sol", effort: "high" });
  assert.equal(invocations, 0);
  assert.equal(preview.state, "ready");
  assert.equal(preview.authMethod, "chatgpt");
  assert.equal(preview.model, "gpt-6.1-sol");
  assert.equal(preview.effort, "high");
  assert.ok(preview.claudeEfforts.includes("max"));
  assert.equal(preview.command.shell, false);
  assert.ok(preview.command.args.includes("--sandbox"));
  assert.ok(preview.command.args.includes("read-only"));
  assert.ok(preview.command.args.includes("--output-schema"));
  assert.ok(preview.command.args.includes("--output-last-message"));

  const outputArg = preview.command.args[preview.command.args.indexOf("--output-last-message") + 1];
  await fs.writeFile(outputArg, JSON.stringify(plan), { mode: 0o600 });
  const actual = await runner.run(preview);
  assert.equal(invocations, 1);
  assert.equal(actual.claude.model, "sonnet");
  assert.equal(actual.claude.effort, "high");
  assert.equal(actual.files[0].path, "src/dashboard-card.js");
  await runner.cleanup(preview);
  await assert.rejects(fs.access(path.dirname(outputArg)));
});

test("Codex refuses private client configuration directories as project roots", async () => {
  const runner = createCodexCliRunner({
    codexPath: process.execPath,
    env: { HOME: home, PATH: process.env.PATH ?? "" },
    home,
    runSync: fakeSyncForCodex,
    execute: async () => ""
  });

  await assert.rejects(
    runner.preview({ projectRoot: path.join(home, ".codex"), task, model: "gpt-6.1-sol", effort: "medium" }),
    /no se pudo preparar/u
  );
});

test("Codex rejects a model recommendation outside the caller's allowed list", async () => {
  const runner = createCodexCliRunner({
    codexPath: process.execPath,
    env: { HOME: home, PATH: process.env.PATH ?? "" },
    home,
    runSync: fakeSyncForCodex,
    execute: async () => ""
  });
  const preview = await runner.preview({ projectRoot, task, model: "gpt-6.1-sol", effort: "medium" });
  const outputArg = preview.command.args[preview.command.args.indexOf("--output-last-message") + 1];
  await fs.writeFile(outputArg, JSON.stringify({ ...plan, claude: { model: "unknown-model", effort: "high" } }), { mode: 0o600 });
  await assert.rejects(runner.run(preview), /no se pudo preparar/u);
  await runner.cleanup(preview);
});

test("Codex drains large CLI diagnostics without retaining them or aborting a valid plan", async () => {
  const runner = createCodexCliRunner({
    codexPath: process.execPath,
    env: { HOME: home, PATH: process.env.PATH ?? "" },
    home,
    runSync: fakeSyncForCodex,
    spawn: (_executable, args) => {
      const child = new EventEmitter();
      child.stdout = new PassThrough();
      child.stderr = new PassThrough();
      child.stdin = new PassThrough();
      setImmediate(() => {
        void (async () => {
          const outputPath = args[args.indexOf("--output-last-message") + 1];
          await fs.writeFile(outputPath, JSON.stringify(plan), { mode: 0o600 });
          child.stderr.write(Buffer.alloc(16_384, "x"));
          child.stdout.end("{}\n");
          child.stderr.end();
          child.emit("close", 0, null);
        })().catch(error => child.emit("error", error));
      });
      return child;
    }
  });

  const preview = await runner.preview({ projectRoot, task, model: "gpt-6.1-sol", effort: "medium" });
  const actual = await runner.run(preview);
  assert.equal(actual.claude.model, "sonnet");
  await runner.cleanup(preview);
});

test("Claude preview is read-only, uses the selected model and effort, and ignores API keys", async () => {
  let invocation = null;
  const runner = createClaudeCodeRunner({
    claudePath: process.execPath,
    env: { HOME: home, PATH: process.env.PATH ?? "", ANTHROPIC_API_KEY: "must-not-be-passed" },
    home,
    runSync: fakeSyncForClaude,
    execute: async value => { invocation = value; return "Propuesta de solo lectura."; }
  });
  const preview = await runner.preview({
    projectRoot,
    task: { ...task, objective: "Mejorar la tarjeta principal.\nMantener accesibilidad y diseño móvil." },
    plan: JSON.stringify(plan),
    model: "sonnet",
    effort: "high"
  });
  assert.equal(preview.state, "ready");
  assert.equal(preview.account.includes("Claude.ai"), true);
  assert.equal(preview.apiKeyEnvironmentIgnored, true);
  assert.equal(preview.model, "sonnet");
  assert.equal(preview.effort, "high");
  assert.equal(preview.command.shell, false);
  assert.ok(preview.command.args.includes("--restricted"));
  assert.ok(preview.command.args.includes("--permission-mode"));
  assert.ok(preview.command.args.includes("plan"));
  assert.ok(preview.command.args.includes("--strict-mcp-config"));
  assert.ok(preview.command.args.includes("--tools"));
  assert.equal(preview.command.args.includes("--setting-sources"), false);
  assert.match(preview.command.stdin, /Mantener accesibilidad y diseño móvil/u);
  assert.equal(preview.command.args.some(value => /Edit|Write|Bash/u.test(value)), false);

  const proposal = await runner.run(preview);
  assert.equal(proposal, "Propuesta de solo lectura.");
  assert.equal(invocation.cwd, await fs.realpath(projectRoot));
  assert.equal(invocation.env.ANTHROPIC_API_KEY, undefined);
});

test("Claude preview remains blocked when the CLI is not logged into Claude.ai", async () => {
  const runner = createClaudeCodeRunner({
    claudePath: process.execPath,
    env: { HOME: home, PATH: process.env.PATH ?? "" },
    home,
    runSync: (executable, args) => args[0] === "--version"
      ? { status: 0, stdout: "2.1.300\n", stderr: "" }
      : { status: 1, stdout: JSON.stringify({ loggedIn: false, authMethod: "none", apiProvider: "firstParty" }), stderr: "" }
  });
  const preview = await runner.preview({ projectRoot, task, plan: JSON.stringify(plan), model: "sonnet", effort: "high" });
  assert.equal(preview.state, "blocked");
  assert.equal(preview.canExecute, false);
  assert.match(preview.account, /no detecta una sesión iniciada/u);
  await assert.rejects(runner.run(preview), /no se pudo preparar/u);
});

test("Claude preflight retains the local USER needed to detect its existing session", async () => {
  const seenUsers = [];
  const runner = createClaudeCodeRunner({
    claudePath: process.execPath,
    env: { HOME: home, PATH: process.env.PATH ?? "", USER: "toolkit-test-user" },
    home,
    runSync: (executable, args, env) => {
      if (args[0] === "--version") return { status: 0, stdout: "2.1.300\n", stderr: "" };
      if (args[0] === "auth" && args[1] === "status") {
        seenUsers.push(env.USER);
        return {
          status: 0,
          stdout: JSON.stringify({ loggedIn: Boolean(env.USER), authMethod: env.USER ? "claude.ai" : "none", apiProvider: "firstParty" }),
          stderr: ""
        };
      }
      throw new Error(`Unexpected Claude preflight: ${args.join(" ")}`);
    }
  });

  const preview = await runner.preview({ projectRoot, task, plan: JSON.stringify(plan), model: "sonnet", effort: "medium" });
  assert.equal(preview.state, "ready");
  assert.deepEqual(seenUsers, ["toolkit-test-user"]);
});

test("Claude implementation preview requires a clean feature branch and only grants file tools", async () => {
  const branch = "codex/feature-test";
  const baseCommit = "a".repeat(40);
  let workspaceChecks = 0;
  let invocation = null;
  const runner = createClaudeCodeRunner({
    claudePath: process.execPath,
    env: { HOME: home, PATH: process.env.PATH ?? "", ANTHROPIC_API_KEY: "must-not-be-passed" },
    home,
    runSync: fakeSyncForClaude,
    inspectWorkspace: async cwd => {
      workspaceChecks++;
      assert.equal(cwd, await fs.realpath(projectRoot));
      if (workspaceChecks < 3) return { root: cwd, branch, head: baseCommit, clean: true, changedFiles: [] };
      return { root: cwd, branch, head: baseCommit, clean: false, changedFiles: ["src/dashboard-card.js"] };
    },
    execute: async value => {
      invocation = value;
      assert.ok(value.args.includes("acceptEdits"));
      assert.ok(value.args.includes("Read,Glob,Grep,Edit,Write"));
      assert.equal(value.args.some(argument => ["Bash", "WebSearch", "WebFetch", "--mcp-config"].includes(argument)), false);
      assert.equal(value.env.ANTHROPIC_API_KEY, undefined);
      return "Actualicé la tarjeta. No ejecuté pruebas.";
    }
  });

  const preview = await runner.previewImplementation({
    projectRoot,
    task: { ...task, allowImplementation: true },
    plan: JSON.stringify(plan),
    proposal: "Limitar el cambio a la tarjeta principal.",
    proposalSha256: "b".repeat(64),
    model: "sonnet",
    effort: "medium"
  });
  assert.equal(invocation, null);
  assert.equal(preview.state, "ready");
  assert.equal(preview.stage, "claude-implementation");
  assert.equal(preview.workspace.branch, branch);
  assert.equal(preview.limits.projectWrite, true);
  assert.equal(preview.limits.readOnly, false);
  assert.equal(preview.proposalSha256, "b".repeat(64));
  assert.match(preview.command.stdin, /propuesta aprobada/u);
  assert.match(preview.command.stdin, /src\/dashboard-card.js/u);

  const result = await runner.run(preview);
  assert.equal(result.response, "Actualicé la tarjeta. No ejecuté pruebas.");
  assert.equal(result.filesChanged, true);
  assert.deepEqual(result.changedFiles, ["src/dashboard-card.js"]);
  assert.equal(result.branch, branch);
  assert.equal(result.baseCommit, baseCommit);
  assert.equal(workspaceChecks, 3);
  assert.ok(invocation);
});

test("Claude implementation is blocked on the main branch, dirty trees, or a changed workspace", async () => {
  for (const workspace of [
    { branch: "main", clean: true },
    { branch: "codex/feature-test", clean: false }
  ]) {
    const runner = createClaudeCodeRunner({
      claudePath: process.execPath,
      env: { HOME: home, PATH: process.env.PATH ?? "" },
      home,
      runSync: fakeSyncForClaude,
      inspectWorkspace: async cwd => ({ root: cwd, head: "a".repeat(40), changedFiles: workspace.clean ? [] : ["README.md"], ...workspace }),
      execute: async () => assert.fail("A blocked preview must not run Claude")
    });
    const preview = await runner.previewImplementation({
      projectRoot,
      task: { ...task, allowImplementation: true },
      plan: JSON.stringify(plan),
      proposal: "Propuesta aprobada.",
      proposalSha256: "c".repeat(64),
      model: "sonnet",
      effort: "medium"
    });
    assert.equal(preview.state, "blocked");
    assert.equal(preview.canExecute, false);
  }
});

test("Claude tutor implementation returns code without write tools or a Git requirement", async () => {
  let workspaceInspectionCount = 0;
  let invocation = null;
  const runner = createClaudeCodeRunner({
    claudePath: process.execPath,
    env: { HOME: home, PATH: process.env.PATH ?? "" },
    home,
    runSync: fakeSyncForClaude,
    inspectWorkspace: async () => { workspaceInspectionCount++; throw new Error("Tutor mode must not inspect Git for writes"); },
    execute: async value => {
      invocation = value;
      assert.ok(value.args.includes("plan"));
      assert.ok(value.args.includes("Read,Glob,Grep"));
      assert.equal(value.args.includes("Read,Glob,Grep,Edit,Write"), false);
      return "Cambia src/dashboard-card.js de esta forma; no he escrito archivos.";
    }
  });
  const preview = await runner.previewImplementation({
    projectRoot,
    task: { ...task, mode: "tutor", allowImplementation: false },
    plan: JSON.stringify(plan),
    proposal: "Mejorar la tarjeta sin cambiar su contrato.",
    proposalSha256: "d".repeat(64),
    model: "sonnet",
    effort: "medium"
  });
  assert.equal(preview.state, "ready");
  assert.equal(preview.limits.readOnly, true);
  assert.equal(preview.limits.projectWrite, false);
  assert.match(preview.command.stdin, /No edites ni crees archivos/u);
  const result = await runner.run(preview);
  assert.equal(result.response, "Cambia src/dashboard-card.js de esta forma; no he escrito archivos.");
  assert.equal(result.filesChanged, false);
  assert.equal(workspaceInspectionCount, 0);
  assert.ok(invocation);
});

test("Codex final review preview is read-only and stores the review response", async () => {
  let invocations = 0;
  const runner = createCodexCliRunner({
    codexPath: process.execPath,
    env: { HOME: home, PATH: process.env.PATH ?? "" },
    home,
    runSync: fakeSyncForCodex,
    execute: async ({ args, prompt }) => {
      invocations++;
      assert.ok(args.includes("--sandbox"));
      assert.ok(args.includes("read-only"));
      assert.ok(args.includes("--ephemeral"));
      assert.equal(args.includes("--output-schema"), false);
      assert.match(prompt, /Entrega de implementación/u);
      assert.match(prompt, /No edites archivos/u);
      const outputFile = args[args.indexOf("--output-last-message") + 1];
      await fs.writeFile(outputFile, "No encuentro hallazgos. No ejecuté pruebas.", { mode: 0o600 });
      return "";
    }
  });
  const preview = await runner.previewReview({
    projectRoot,
    task: { ...task, allowFinalReview: true },
    plan: JSON.stringify(plan),
    proposal: "Propuesta aprobada.",
    implementation: "Edité src/dashboard-card.js.",
    model: "gpt-6-luna",
    effort: "xhigh"
  });
  assert.equal(invocations, 0);
  assert.equal(preview.state, "ready");
  assert.equal(preview.kind, "codex-review");
  assert.equal(preview.model, "gpt-6-luna");
  assert.equal(preview.effort, "xhigh");
  assert.equal(preview.limits.projectWrite, false);
  const review = await runner.run(preview);
  assert.equal(invocations, 1);
  assert.equal(review, "No encuentro hallazgos. No ejecuté pruebas.");
  await runner.cleanup(preview);
});
