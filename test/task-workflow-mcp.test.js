import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";

import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";

import { createTaskWorkflowStore } from "../src/task-workflow-store.js";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "agent-toolkit-mcp-test-"));
const serverEntry = fileURLToPath(new URL("../bin/agent-toolkit-mcp.js", import.meta.url));
const taskInput = {
  title: "Ajustar tarjeta de dashboard",
  project: "AVISENS-Project",
  objective: "Mejorar la tarjeta principal de la dashboard.",
  mode: "tutor",
  acceptance: "La información principal se entiende y la tarjeta funciona en móvil."
};

after(() => fs.rmSync(root, { recursive: true, force: true }));

// Match the real CLI dependency so a malformed invocation cannot save a proposal.
const claudeStreamJsonGuard = `
print_mode=0
stream_json=0
verbose=0
next_format=0
for arg in "$@"; do
  if [ "$next_format" = 1 ]; then
    if [ "$arg" = 'stream-json' ]; then stream_json=1; fi
    next_format=0
    continue
  fi
  if [ "$arg" = '--print' ]; then print_mode=1; fi
  if [ "$arg" = '--verbose' ]; then verbose=1; fi
  if [ "$arg" = '--output-format' ]; then next_format=1; fi
done
if [ "$print_mode" = 1 ] && [ "$stream_json" = 1 ] && [ "$verbose" = 0 ]; then
  printf '%s\\n' 'Error: When using --print, --output-format=stream-json requires --verbose' >&2
  exit 1
fi
`;

async function waitForExecution(client, taskId, executionId) {
  let afterSequence = 0;
  const events = [];
  for (let attempt = 0; attempt < 40; attempt++) {
    const call = await client.callTool({ name: "wait_for_task_activity", arguments: {
      taskId, executionId, afterSequence, waitMs: 250
    } });
    assert.equal(call.isError, undefined, call.content?.[0]?.text);
    const snapshot = JSON.parse(call.content[0].text);
    events.push(...snapshot.events);
    afterSequence = snapshot.nextSequence;
    if (["completed", "failed", "cancelled"].includes(snapshot.state)) return { ...snapshot, events };
  }
  assert.fail("Claude execution did not finish in the test budget.");
}

function createStore(name) {
  return createTaskWorkflowStore({ root: path.join(root, name) });
}

test("task workflow stores ordered handoffs shared by project and task id", async () => {
  const store = createStore("manual");
  const task = await store.createTask(taskInput);
  assert.equal(task.currentStage, "codex-plan");
  assert.equal(task.task.mode, "tutor");
  assert.equal(task.authorization.status, "not_required");

  await assert.rejects(store.recordStageOutput({ taskId: task.id, stage: "claude-proposal", content: "out of order" }), /siguiente pendiente/u);
  const plan = await store.recordStageOutput({ taskId: task.id, stage: "codex-plan", content: "Plan de prueba" });
  assert.equal(plan.currentStage, "claude-proposal");
  assert.equal((await store.getTask({ project: taskInput.project })).outputs.plan.content, "Plan de prueba");

  const proposal = await store.recordStageOutput({ taskId: task.id, stage: "claude-proposal", content: "Propuesta de prueba" });
  assert.equal(proposal.currentStage, "claude-implementation");
  await store.recordStageOutput({ taskId: task.id, stage: "claude-implementation", content: "Código de tutoría" });
  const completed = await store.getTask({ taskId: task.id });
  assert.equal(completed.status, "completed");
  assert.equal(completed.currentStage, "completed");

  const mode = fs.statSync(path.join(root, "manual")).mode & 0o777;
  const taskMode = fs.statSync(path.join(root, "manual", `${task.id}.json`)).mode & 0o777;
  if (process.platform !== "win32") {
    assert.equal(mode, 0o700);
    assert.equal(taskMode, 0o600);
  }
});

test("autonomous implementation stays blocked until the exact proposal is authorized", async () => {
  const store = createStore("autonomous");
  const task = await store.createTask({ ...taskInput, mode: "autonomous", allowImplementation: true, allowFinalReview: true });
  await store.recordStageOutput({ taskId: task.id, stage: "codex-plan", content: "Plan vigente" });
  const proposal = await store.recordStageOutput({ taskId: task.id, stage: "claude-proposal", content: "Propuesta vigente" });
  assert.equal(proposal.currentStage, "awaiting-authorization");
  assert.equal(proposal.authorization.status, "pending");

  await assert.rejects(store.recordStageOutput({ taskId: task.id, stage: "claude-implementation", content: "cambios" }), /necesita autorización explícita/u);
  await assert.rejects(store.authorizeImplementation({ taskId: task.id, proposalSha256: "0".repeat(64) }), /no coincide/u);

  const approved = await store.authorizeImplementation({ taskId: task.id, proposalSha256: proposal.authorization.proposalSha256 });
  assert.equal(approved.currentStage, "claude-implementation");
  assert.equal(approved.authorization.status, "approved");
  const result = await store.recordStageOutput({ taskId: task.id, stage: "claude-implementation", content: "Cambios y pruebas declaradas" });
  assert.equal(result.currentStage, "codex-review");
  const reviewed = await store.recordStageOutput({ taskId: task.id, stage: "codex-review", content: "Revisión final" });
  assert.equal(reviewed.currentStage, "completed");
  assert.equal(reviewed.status, "completed");
});

test("implementation and final review are opt-in when a task is created", async () => {
  const store = createStore("opt-in");
  const task = await store.createTask({ ...taskInput, mode: "autonomous" });
  assert.equal(task.task.allowImplementation, false);
  assert.equal(task.task.allowFinalReview, false);
  assert.equal(task.authorization.status, "not_required");
  await store.recordStageOutput({ taskId: task.id, stage: "codex-plan", content: "Plan" });
  const completed = await store.recordStageOutput({ taskId: task.id, stage: "claude-proposal", content: "Propuesta" });
  assert.equal(completed.status, "completed");
  await assert.rejects(store.authorizeImplementation({ taskId: task.id, proposalSha256: completed.outputs.proposal.sha256 }), /no coincide/u);

  await assert.rejects(store.createTask({ ...taskInput, mode: "autonomous", allowFinalReview: true }), /requiere habilitar/u);
});

test("concurrent submissions cannot advance the same stage twice", async () => {
  const store = createStore("concurrent");
  const task = await store.createTask(taskInput);
  const submissions = await Promise.allSettled([
    store.recordStageOutput({ taskId: task.id, stage: "codex-plan", content: "Plan A" }),
    store.recordStageOutput({ taskId: task.id, stage: "codex-plan", content: "Plan B" })
  ]);
  assert.equal(submissions.filter(result => result.status === "fulfilled").length, 1);
  assert.equal(submissions.filter(result => result.status === "rejected").length, 1);
  assert.equal((await store.getTask({ taskId: task.id })).currentStage, "claude-proposal");
});

test("local stdio MCP exposes opt-in implementation and final-review stages", async t => {
  const workflowRoot = path.join(root, "stdio");
  const cliDirectory = path.join(root, "fake-clients");
  const projectRoot = path.join(root, "project-for-cli");
  const codexRuns = path.join(root, "codex-runs.txt");
  const claudeRuns = path.join(root, "claude-runs.txt");
  const claudeFailureFlag = path.join(root, "claude-failure-flag.txt");
  fs.mkdirSync(cliDirectory, { recursive: true, mode: 0o700 });
  fs.mkdirSync(projectRoot, { recursive: true, mode: 0o700 });
  const planned = {
    summary: "Inspeccionar la tarjeta y mejorar su diseño adaptable.",
    claude: { model: "sonnet", effort: "high" },
    files: [{ path: "src/dashboard-card.js", action: "modify", reason: "Contiene la tarjeta principal." }],
    acceptance: ["La tarjeta funciona en móvil."],
    checks: ["npm test"]
  };
  const quote = value => `'${value.replaceAll("'", "'\\''")}'`;
  const codexFixture = path.join(cliDirectory, "codex");
  fs.writeFileSync(codexFixture, `#!/bin/sh
if [ "$1" = "--version" ]; then printf '%s\\n' 'codex-cli 0.163.0'; exit 0; fi
if [ "$1" = "login" ] && [ "$2" = "status" ]; then printf '%s\\n' 'Logged in using ChatGPT' >&2; exit 0; fi
if [ "$1" = "exec" ]; then
  printf '%s\\n' invoked >> ${quote(codexRuns)}
  output=''
  next=0
  for arg in "$@"; do
    if [ "$next" = 1 ]; then output="$arg"; next=0; continue; fi
    if [ "$arg" = '--output-last-message' ]; then next=1; fi
  done
  cat >/dev/null
  printf '%s\\n' ${quote(JSON.stringify(planned))} > "$output"
  exit 0
fi
exit 1
`, { mode: 0o700 });
  const claudeFixture = path.join(cliDirectory, "claude");
  fs.writeFileSync(claudeFixture, `#!/bin/sh
if [ "$1" = "--version" ]; then printf '%s\\n' '2.1.300'; exit 0; fi
if [ "$1" = "auth" ] && [ "$2" = "status" ]; then printf '%s\\n' '{"loggedIn":true,"authMethod":"claude.ai","apiProvider":"firstParty"}'; exit 0; fi
${claudeStreamJsonGuard}
printf '%s\\n' invoked >> ${quote(claudeRuns)}
cat >/dev/null
if [ -f ${quote(claudeFailureFlag)} ]; then
  if [ "$(cat ${quote(claudeFailureFlag)})" = "unclassified" ]; then
    printf '%s\\n' 'PRIVATE_UNCLASSIFIED_DIAGNOSTIC_MARKER' >&2
    exit 1
  fi
  printf '%s\\n' 'Not logged in; PRIVATE_DIAGNOSTIC_MARKER' >&2
  exit 23
fi
printf '%s\\n' ${quote(JSON.stringify({ type: "assistant", message: { content: [{ type: "tool_use", name: "Read", input: { file_path: "docs/agent-team-handoffs.md" } }] } }))}
printf '%s\\n' ${quote(JSON.stringify({ type: "user", message: { content: [{ type: "tool_result", content: "PRIVATE_SOURCE_TEXT_MUST_NOT_APPEAR" }] } }))}
printf '%s\\n' ${quote(JSON.stringify({ type: "result", subtype: "success", is_error: false, result: "Propuesta de lectura: usar una grilla responsiva y conservar los datos actuales." }))}
`, { mode: 0o700 });

  const incompatibleCall = spawnSync(claudeFixture, ["--print", "--output-format", "stream-json"], {
    encoding: "utf8", input: "Fixture-only argument validation.", timeout: 5_000
  });
  assert.equal(incompatibleCall.status, 1);
  assert.match(incompatibleCall.stderr, /stream-json requires --verbose/u);
  assert.equal(fs.existsSync(claudeRuns), false);

  let approvalDecision = "cancel";
  const approvalPrompts = [];
  const client = new Client({ name: "agent-toolkit-test", version: "1.0.0" }, { capabilities: { elicitation: {} } });
  client.setRequestHandler("elicitation/create", async request => {
    approvalPrompts.push(request.params.message);
    return { action: "accept", content: { decision: approvalDecision } };
  });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [serverEntry],
    cwd: path.dirname(serverEntry),
    env: { PATH: `${cliDirectory}${path.delimiter}/usr/bin:/bin`, HOME: os.homedir(), AGENT_TOOLKIT_WORKFLOW_DIR: workflowRoot },
    stderr: "pipe"
  });
  const diagnostics = [];
  transport.stderr?.on("data", chunk => diagnostics.push(String(chunk)));
  t.after(async () => {
    await client.close().catch(() => {});
    await transport.close().catch(() => {});
  });

  await client.connect(transport);
  const { tools } = await client.listTools();
  assert.deepEqual(tools.map(tool => tool.name).sort(), [
    "approve_peer_review",
    "cancel_peer_review",
    "cancel_task_execution",
    "claim_peer_review",
    "close_collaboration",
    "get_collaboration",
    "get_task",
    "preview_claude_implementation",
    "preview_claude_proposal",
    "preview_codex_plan",
    "preview_codex_review",
    "preview_peer_review",
    "publish_peer_context",
    "run_claude_implementation",
    "run_claude_proposal",
    "run_codex_plan",
    "run_codex_review",
    "start_collaboration",
    "start_task",
    "submit_peer_review",
    "wait_for_peer_handoff",
    "wait_for_task_activity"
  ]);

  const created = await client.callTool({ name: "start_task", arguments: {
    ...taskInput, mode: "autonomous", allowImplementation: true, allowFinalReview: true
  } });
  assert.equal(created.isError, undefined);
  const task = JSON.parse(created.content[0].text);
  assert.equal(task.currentStage, "codex-plan");

  const firstPlanPreview = await client.callTool({ name: "preview_codex_plan", arguments: {
    taskId: task.id,
    projectRoot,
    model: "gpt-6.1-sol",
    effort: "high"
  } });
  assert.equal(firstPlanPreview.isError, undefined);
  const rejectedPreview = JSON.parse(firstPlanPreview.content[0].text);
  assert.equal(rejectedPreview.state, "ready");
  assert.equal(rejectedPreview.authMethod, "chatgpt");
  assert.ok(rejectedPreview.command.args.includes("--sandbox"));
  assert.ok(rejectedPreview.command.args.includes("read-only"));
  assert.equal(fs.existsSync(codexRuns), false);
  const wrongApproval = await client.callTool({ name: "run_codex_plan", arguments: {
    previewId: rejectedPreview.previewId,
    confirmationCode: "DEADBEEF"
  } });
  assert.equal(wrongApproval.isError, true);
  assert.equal(fs.existsSync(codexRuns), false);

  const planPreviewCall = await client.callTool({ name: "preview_codex_plan", arguments: {
    taskId: task.id,
    projectRoot,
    model: "gpt-6.1-sol",
    effort: "high"
  } });
  const planPreview = JSON.parse(planPreviewCall.content[0].text);
  const declinedPlan = await client.callTool({ name: "run_codex_plan", arguments: {
    previewId: planPreview.previewId,
    confirmationCode: planPreview.confirmationCode
  } });
  assert.equal(declinedPlan.isError, true);
  assert.match(declinedPlan.content[0].text, /cancelada/u);
  assert.match(approvalPrompts[0], /Comando exacto/u);
  assert.match(approvalPrompts[0], /Mejorar la tarjeta principal de la dashboard/u);
  assert.equal(fs.existsSync(codexRuns), false);

  approvalDecision = "approve";
  const approvedPlanPreviewCall = await client.callTool({ name: "preview_codex_plan", arguments: {
    taskId: task.id,
    projectRoot,
    model: "gpt-6.1-sol",
    effort: "high"
  } });
  const approvedPlanPreview = JSON.parse(approvedPlanPreviewCall.content[0].text);
  const plannedResult = await client.callTool({ name: "run_codex_plan", arguments: {
    previewId: approvedPlanPreview.previewId,
    confirmationCode: approvedPlanPreview.confirmationCode
  } });
  assert.equal(plannedResult.isError, undefined);
  const planResponse = JSON.parse(plannedResult.content[0].text);
  assert.equal(planResponse.task.currentStage, "claude-proposal");
  assert.deepEqual(planResponse.plan, planned);
  assert.equal(fs.readFileSync(codexRuns, "utf8").trim(), "invoked");
  assert.equal(fs.existsSync(path.dirname(planPreview.command.outputFile)), false);

  const proposalPreviewCall = await client.callTool({ name: "preview_claude_proposal", arguments: {
    taskId: task.id,
    projectRoot
  } });
  assert.equal(proposalPreviewCall.isError, undefined, proposalPreviewCall.content?.[0]?.text);
  const proposalPreview = JSON.parse(proposalPreviewCall.content[0].text);
  assert.equal(proposalPreview.state, "ready");
  assert.equal(proposalPreview.model, "sonnet");
  assert.equal(proposalPreview.effort, "high");
  assert.equal(fs.existsSync(claudeRuns), false);
  const proposedResult = await client.callTool({ name: "run_claude_proposal", arguments: {
    previewId: proposalPreview.previewId,
    confirmationCode: proposalPreview.confirmationCode
  } });
  assert.equal(proposedResult.isError, undefined);
  const proposalStarted = JSON.parse(proposedResult.content[0].text);
  assert.ok(proposalStarted.executionId);
  assert.match(proposalStarted.message, /segundo plano/u);
  const proposalResponse = await waitForExecution(client, task.id, proposalStarted.executionId);
  assert.equal(proposalResponse.state, "completed");
  assert.equal(proposalResponse.currentStage, "awaiting-authorization");
  assert.match(proposalResponse.output, /grilla responsiva/u);
  assert.ok(proposalResponse.events.some(event => /Claude solicitó leer: "docs\/agent-team-handoffs\.md"/u.test(event.message)));
  assert.doesNotMatch(JSON.stringify(proposalResponse.events), /PRIVATE_SOURCE_TEXT_MUST_NOT_APPEAR/u);
  assert.equal(fs.readFileSync(claudeRuns, "utf8").trim(), "invoked");
  assert.deepEqual(fs.readdirSync(projectRoot), []);

  const implementationPreviewCall = await client.callTool({ name: "preview_claude_implementation", arguments: {
    taskId: task.id,
    projectRoot
  } });
  assert.equal(implementationPreviewCall.isError, undefined);
  const implementationPreview = JSON.parse(implementationPreviewCall.content[0].text);
  assert.equal(implementationPreview.state, "blocked");
  assert.match(implementationPreview.blockedReason, /repositorio Git/u);
  assert.deepEqual(fs.readdirSync(projectRoot), []);

  const fetched = await client.callTool({ name: "get_task", arguments: { project: taskInput.project } });
  const shared = JSON.parse(fetched.content[0].text);
  assert.equal(shared.currentStage, "awaiting-authorization");
  assert.equal(shared.outputs.plan.content, JSON.stringify(planned));
  assert.match(shared.outputs.proposal.content, /grilla responsiva/u);

  const failedTaskCall = await client.callTool({ name: "start_task", arguments: {
    ...taskInput, title: "Diagnóstico seguro", project: "mcp-failure-diagnostics"
  } });
  const failedTask = JSON.parse(failedTaskCall.content[0].text);
  const failedPlanPreviewCall = await client.callTool({ name: "preview_codex_plan", arguments: {
    taskId: failedTask.id, projectRoot, model: "gpt-6.1-sol", effort: "high"
  } });
  const failedPlanPreview = JSON.parse(failedPlanPreviewCall.content[0].text);
  const failedPlanRun = await client.callTool({ name: "run_codex_plan", arguments: {
    previewId: failedPlanPreview.previewId, confirmationCode: failedPlanPreview.confirmationCode
  } });
  assert.equal(failedPlanRun.isError, undefined, failedPlanRun.content?.[0]?.text);
  fs.writeFileSync(claudeFailureFlag, "fail safely\n", { mode: 0o600 });
  const failedClaudePreviewCall = await client.callTool({ name: "preview_claude_proposal", arguments: {
    taskId: failedTask.id, projectRoot
  } });
  const failedClaudePreview = JSON.parse(failedClaudePreviewCall.content[0].text);
  const failedClaudeRun = await client.callTool({ name: "run_claude_proposal", arguments: {
    previewId: failedClaudePreview.previewId, confirmationCode: failedClaudePreview.confirmationCode
  } });
  assert.equal(failedClaudeRun.isError, undefined, failedClaudeRun.content?.[0]?.text);
  const failedExecution = JSON.parse(failedClaudeRun.content[0].text);
  const failedSnapshot = await waitForExecution(client, failedTask.id, failedExecution.executionId);
  assert.equal(failedSnapshot.state, "failed");
  assert.deepEqual(failedSnapshot.diagnostic, {
    kind: "process-exit", exitCode: 23, category: "authentication"
  });
  assert.match(failedSnapshot.error, /posible problema de inicio de sesión/u);
  assert.doesNotMatch(JSON.stringify(failedSnapshot), /PRIVATE_DIAGNOSTIC_MARKER/u);
  const failedStoredTaskCall = await client.callTool({ name: "get_task", arguments: { taskId: failedTask.id } });
  const failedStoredTask = JSON.parse(failedStoredTaskCall.content[0].text);
  assert.equal(failedStoredTask.currentStage, "claude-proposal");
  assert.equal(failedStoredTask.outputs.proposal, null);
  assert.deepEqual(diagnostics, []);

  fs.writeFileSync(claudeFailureFlag, "unclassified\n", { mode: 0o600 });
  const unclassifiedPreviewCall = await client.callTool({ name: "preview_claude_proposal", arguments: {
    taskId: failedTask.id, projectRoot
  } });
  const unclassifiedPreview = JSON.parse(unclassifiedPreviewCall.content[0].text);
  const unclassifiedRunCall = await client.callTool({ name: "run_claude_proposal", arguments: {
    previewId: unclassifiedPreview.previewId, confirmationCode: unclassifiedPreview.confirmationCode
  } });
  const unclassifiedRun = JSON.parse(unclassifiedRunCall.content[0].text);
  const unclassifiedSnapshot = await waitForExecution(client, failedTask.id, unclassifiedRun.executionId);
  assert.equal(unclassifiedSnapshot.state, "failed");
  assert.deepEqual(unclassifiedSnapshot.diagnostic, {
    kind: "process-exit", exitCode: 1, category: "unclassified"
  });
  assert.match(unclassifiedSnapshot.error, /no coincide con una categoría reconocida/u);
  assert.doesNotMatch(JSON.stringify(unclassifiedSnapshot), /PRIVATE_UNCLASSIFIED_DIAGNOSTIC_MARKER/u);
  const unclassifiedTaskCall = await client.callTool({ name: "get_task", arguments: { taskId: failedTask.id } });
  const unclassifiedTask = JSON.parse(unclassifiedTaskCall.content[0].text);
  assert.equal(unclassifiedTask.currentStage, "claude-proposal");
  assert.equal(unclassifiedTask.outputs.proposal, null);
  assert.deepEqual(diagnostics, []);
});

test("opted-in stdio workflow runs approved implementation and read-only Codex review", async t => {
  const workflowRoot = path.join(root, "complete-flow-state");
  const cliDirectory = path.join(root, "complete-flow-clients");
  const projectRoot = path.join(root, "complete-flow-project");
  const implementationPath = path.join(projectRoot, "src", "dashboard-card.js");
  const claudeRuns = path.join(root, "complete-flow-claude-runs.txt");
  const codexRuns = path.join(root, "complete-flow-codex-runs.txt");
  fs.mkdirSync(cliDirectory, { recursive: true, mode: 0o700 });
  fs.mkdirSync(path.dirname(implementationPath), { recursive: true, mode: 0o700 });
  fs.writeFileSync(implementationPath, "export const dashboardCard = 'original';\n", { mode: 0o600 });
  const git = args => {
    const result = spawnSync("git", args, { cwd: projectRoot, encoding: "utf8", maxBuffer: 32_768 });
    assert.equal(result.status, 0, result.stderr);
  };
  git(["init"]);
  git(["checkout", "-b", "codex/approved-flow"]);
  git(["add", "."]);
  git(["-c", "user.name=Agent Toolkit Test", "-c", "user.email=agent-toolkit-test@example.invalid", "commit", "-m", "baseline"]);

  const planned = {
    summary: "Mejorar la tarjeta sin cambiar su contrato.",
    claude: { model: "sonnet", effort: "medium" },
    files: [{ path: "src/dashboard-card.js", action: "modify", reason: "Es la tarjeta objetivo." }],
    acceptance: ["La tarjeta conserva su contrato."],
    checks: ["npm test"]
  };
  const quote = value => `'${value.replaceAll("'", "'\\''")}'`;
  const codexFixture = path.join(cliDirectory, "codex");
  fs.writeFileSync(codexFixture, `#!/bin/sh
if [ "$1" = "--version" ]; then printf '%s\\n' 'codex-cli 0.163.0'; exit 0; fi
if [ "$1" = "login" ] && [ "$2" = "status" ]; then printf '%s\\n' 'Logged in using ChatGPT' >&2; exit 0; fi
if [ "$1" = "exec" ]; then
  output=''
  next=0
  plan=0
  for arg in "$@"; do
    if [ "$next" = 1 ]; then output="$arg"; next=0; continue; fi
    if [ "$arg" = '--output-last-message' ]; then next=1; fi
    if [ "$arg" = '--output-schema' ]; then plan=1; fi
  done
  cat >/dev/null
  if [ "$plan" = 1 ]; then
    printf '%s\\n' ${quote(JSON.stringify(planned))} > "$output"
    printf '%s\\n' plan >> ${quote(codexRuns)}
  else
    printf '%s\\n' 'No encuentro hallazgos; no ejecuté pruebas.' > "$output"
    printf '%s\\n' review >> ${quote(codexRuns)}
  fi
  exit 0
fi
exit 1
`, { mode: 0o700 });
  const claudeFixture = path.join(cliDirectory, "claude");
  fs.writeFileSync(claudeFixture, `#!/bin/sh
if [ "$1" = "--version" ]; then printf '%s\\n' '2.1.300'; exit 0; fi
if [ "$1" = "auth" ] && [ "$2" = "status" ]; then printf '%s\\n' '{"loggedIn":true,"authMethod":"claude.ai","apiProvider":"firstParty"}'; exit 0; fi
${claudeStreamJsonGuard}
implementation=0
for arg in "$@"; do if [ "$arg" = 'acceptEdits' ]; then implementation=1; fi; done
cat >/dev/null
if [ "$implementation" = 1 ]; then
  printf '%s\\n' 'export const dashboardCard = "improved";' > ${quote(implementationPath)}
  printf '%s\\n' ${quote(JSON.stringify({ type: "assistant", message: { content: [{ type: "tool_use", name: "Edit", input: { file_path: "src/dashboard-card.js" } }] } }))}
  printf '%s\\n' ${quote(JSON.stringify({ type: "result", subtype: "success", is_error: false, result: "Actualicé src/dashboard-card.js; no ejecuté pruebas." }))}
  printf '%s\\n' implementation >> ${quote(claudeRuns)}
else
  printf '%s\\n' ${quote(JSON.stringify({ type: "assistant", message: { content: [{ type: "tool_use", name: "Read", input: { file_path: "src/dashboard-card.js" } }] } }))}
  printf '%s\\n' ${quote(JSON.stringify({ type: "result", subtype: "success", is_error: false, result: "Propuesta: conservar el contrato y mejorar el contenido de la tarjeta." }))}
  printf '%s\\n' proposal >> ${quote(claudeRuns)}
fi
`, { mode: 0o700 });

  const approvalPrompts = [];
  const client = new Client({ name: "agent-toolkit-complete-test", version: "1.0.0" }, { capabilities: { elicitation: {} } });
  client.setRequestHandler("elicitation/create", async request => {
    approvalPrompts.push(request.params.message);
    return { action: "accept", content: { decision: "approve" } };
  });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [serverEntry],
    cwd: path.dirname(serverEntry),
    env: {
      PATH: `${cliDirectory}${path.delimiter}/usr/bin:/bin`,
      HOME: os.homedir(),
      USER: "agent-toolkit-test",
      AGENT_TOOLKIT_WORKFLOW_DIR: workflowRoot
    },
    stderr: "pipe"
  });
  const diagnostics = [];
  transport.stderr?.on("data", chunk => diagnostics.push(String(chunk)));
  t.after(async () => {
    await client.close().catch(() => {});
    await transport.close().catch(() => {});
  });
  await client.connect(transport);

  const created = await client.callTool({ name: "start_task", arguments: {
    title: "Prueba completa", project: "complete-flow", objective: "Mejorar la tarjeta de dashboard.",
    mode: "autonomous", allowImplementation: true, allowFinalReview: true
  } });
  const task = JSON.parse(created.content[0].text);
  const planPreviewCall = await client.callTool({ name: "preview_codex_plan", arguments: {
    taskId: task.id, projectRoot, model: "gpt-6-luna", effort: "high"
  } });
  const planPreview = JSON.parse(planPreviewCall.content[0].text);
  const planCall = await client.callTool({ name: "run_codex_plan", arguments: {
    previewId: planPreview.previewId, confirmationCode: planPreview.confirmationCode
  } });
  assert.equal(planCall.isError, undefined, planCall.content?.[0]?.text);
  assert.equal(JSON.parse(planCall.content[0].text).task.outputs.plan.model, "gpt-6-luna");
  assert.equal(JSON.parse(planCall.content[0].text).task.outputs.plan.effort, "high");

  const proposalPreviewCall = await client.callTool({ name: "preview_claude_proposal", arguments: { taskId: task.id, projectRoot } });
  const proposalPreview = JSON.parse(proposalPreviewCall.content[0].text);
  const proposalCall = await client.callTool({ name: "run_claude_proposal", arguments: {
    previewId: proposalPreview.previewId, confirmationCode: proposalPreview.confirmationCode
  } });
  assert.equal(proposalCall.isError, undefined, proposalCall.content?.[0]?.text);
  const proposalStart = JSON.parse(proposalCall.content[0].text);
  const proposalResult = await waitForExecution(client, task.id, proposalStart.executionId);
  assert.equal(proposalResult.currentStage, "awaiting-authorization");

  const implementationPreviewCall = await client.callTool({ name: "preview_claude_implementation", arguments: {
    taskId: task.id, projectRoot
  } });
  assert.equal(implementationPreviewCall.isError, undefined, implementationPreviewCall.content?.[0]?.text);
  const implementationPreview = JSON.parse(implementationPreviewCall.content[0].text);
  assert.equal(implementationPreview.state, "ready");
  assert.equal(implementationPreview.workspace.branch, "codex/approved-flow");
  assert.equal(implementationPreview.workspace.clean, true);
  assert.equal(implementationPreview.limits.projectWrite, true);
  assert.equal(implementationPreview.command.args.includes("Read,Glob,Grep,Edit,Write"), true);
  assert.deepEqual(fs.readFileSync(claudeRuns, "utf8").trim().split("\n"), ["proposal"]);
  const implementationCall = await client.callTool({ name: "run_claude_implementation", arguments: {
    previewId: implementationPreview.previewId, confirmationCode: implementationPreview.confirmationCode
  } });
  assert.equal(implementationCall.isError, undefined, implementationCall.content?.[0]?.text);
  const implementationStart = JSON.parse(implementationCall.content[0].text);
  const implementationResult = await waitForExecution(client, task.id, implementationStart.executionId);
  assert.equal(implementationResult.currentStage, "codex-review");
  assert.equal(implementationResult.filesChanged, true);
  assert.deepEqual(implementationResult.changedFiles, ["src/dashboard-card.js"]);
  assert.equal(fs.readFileSync(implementationPath, "utf8"), 'export const dashboardCard = "improved";\n');

  const reviewPreviewCall = await client.callTool({ name: "preview_codex_review", arguments: {
    taskId: task.id, projectRoot
  } });
  assert.equal(reviewPreviewCall.isError, undefined, reviewPreviewCall.content?.[0]?.text);
  const reviewPreview = JSON.parse(reviewPreviewCall.content[0].text);
  assert.equal(reviewPreview.kind, "codex-review");
  assert.equal(reviewPreview.limits.readOnly, true);
  assert.equal(reviewPreview.model, "gpt-6-luna");
  assert.equal(reviewPreview.effort, "high");
  const reviewCall = await client.callTool({ name: "run_codex_review", arguments: {
    previewId: reviewPreview.previewId, confirmationCode: reviewPreview.confirmationCode
  } });
  assert.equal(reviewCall.isError, undefined, reviewCall.content?.[0]?.text);
  const finalResult = JSON.parse(reviewCall.content[0].text);
  assert.equal(finalResult.task.status, "completed");
  assert.match(finalResult.review, /No encuentro hallazgos/u);
  assert.equal(finalResult.filesChanged, false);
  assert.deepEqual(fs.readFileSync(codexRuns, "utf8").trim().split("\n"), ["plan", "review"]);
  assert.deepEqual(fs.readFileSync(claudeRuns, "utf8").trim().split("\n"), ["proposal", "implementation"]);
  assert.equal(approvalPrompts.length, 4);
  assert.match(approvalPrompts[2], /projectWrite.*true/u);
  assert.deepEqual(diagnostics, []);
});
