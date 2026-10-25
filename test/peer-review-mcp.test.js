import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { createPeerReviewStore } from "../src/peer-review-store.js";
import { registerPeerReviewTools } from "../src/peer-review-mcp.js";

const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "agent-toolkit-peer-mcp-")));
after(() => fs.rm(root, { recursive: true, force: true }));
const entry = fileURLToPath(new URL("../bin/agent-toolkit-mcp.js", import.meta.url));
const decode = result => JSON.parse(result.content[0].text);
const input = { project: "Proyecto de mañana", title: "Revisión cruzada", objective: "Verificar una función",
  primaryAgent: "claude", context: "Contexto inicial de Claude." };

async function project() {
  const directory = await fs.mkdtemp(path.join(root, "case-"));
  const projectRoot = path.join(directory, "project");
  await fs.mkdir(projectRoot, { mode: 0o700 });
  await fs.writeFile(path.join(projectRoot, "app.js"), "export const answer = 42;\n");
  return { directory, projectRoot };
}

async function harness() {
  const f = await project();
  const store = createPeerReviewStore({ root: path.join(f.directory, "store") });
  const task = await store.startCollaboration({ ...input, projectRoot: f.projectRoot });
  const callbacks = new Map();
  let clock = Date.now();
  registerPeerReviewTools({ registerTool: (name, definition, handler) => callbacks.set(name, { definition, handler }) }, store, { now: () => clock });
  const call = async (name, args, context) => {
    const { definition, handler } = callbacks.get(name);
    return handler(definition.inputSchema.parse(args), context);
  };
  const bound = { taskId: task.id, projectRoot: f.projectRoot };
  const preview = async () => decode(await call("preview_peer_review", { ...bound, from: "claude", to: "codex", message: "Revisa answer.", paths: ["app.js"] }));
  const approveContext = { mcpReq: { elicitInput: async () => ({ action: "accept", content: { decision: "approve" } }) } };
  return { ...f, store, task, call, bound, preview, approveContext, advance: ms => { clock += ms; } };
}

test("peer preview requires one-time interactive approval and never sends on denial or missing confirmation", async () => {
  const f = await harness();
  const preview = await f.preview();
  assert.equal(preview.transport, "existing-session-inbox");
  assert.equal(preview.sessionIdentityVerified, false);
  assert.equal(preview.limits.startsModel, false);
  assert.equal(preview.limits.enforcedSandbox, false);
  assert.equal((await f.store.getCollaboration(f.bound)).reviews.length, 0);
  const blocked = decode(await f.call("approve_peer_review", { previewId: preview.previewId, confirmationCode: preview.confirmationCode }));
  assert.equal(blocked.state, "blocked");
  assert.equal(blocked.sent, false);
  assert.equal((await f.store.getCollaboration(f.bound)).reviews.length, 0);
  assert.equal((await f.call("approve_peer_review", { previewId: preview.previewId, confirmationCode: preview.confirmationCode }, f.approveContext)).isError, true);
  const cancelledPreview = await f.preview();
  const cancelled = decode(await f.call("approve_peer_review", { previewId: cancelledPreview.previewId, confirmationCode: cancelledPreview.confirmationCode }, {
    mcpReq: { elicitInput: async () => ({ action: "decline" }) }
  }));
  assert.equal(cancelled.state, "cancelled");
  assert.equal((await f.store.getCollaboration(f.bound)).reviews.length, 0);
  const badCode = await f.preview();
  assert.equal((await f.call("approve_peer_review", { previewId: badCode.previewId, confirmationCode: "00000000" }, f.approveContext)).isError, true);
});

test("expired previews and context or file changes during approval cannot dispatch a review", async () => {
  const f = await harness();
  const expired = await f.preview();
  f.advance(20 * 60_000 + 1);
  assert.equal((await f.call("approve_peer_review", { previewId: expired.previewId, confirmationCode: expired.confirmationCode }, f.approveContext)).isError, true);
  const changed = await f.preview();
  const changeDuringApproval = { mcpReq: { elicitInput: async () => {
    await fs.writeFile(path.join(f.projectRoot, "app.js"), "changed while approving");
    return { action: "accept", content: { decision: "approve" } };
  } } };
  assert.equal((await f.call("approve_peer_review", { previewId: changed.previewId, confirmationCode: changed.confirmationCode }, changeDuringApproval)).isError, true);
  const revision = await f.preview();
  const contextDuringApproval = { mcpReq: { elicitInput: async () => {
    await f.store.publishContext({ ...f.bound, author: "claude", expectedRevision: 1, content: "Nuevo contexto" });
    return { action: "accept", content: { decision: "approve" } };
  } } };
  assert.equal((await f.call("approve_peer_review", { previewId: revision.previewId, confirmationCode: revision.confirmationCode }, contextDuringApproval)).isError, true);
  assert.equal((await f.store.getCollaboration(f.bound)).reviews.length, 0);
});

test("the preview cache is bounded and approval displays the complete exact prompt", async () => {
  const f = await harness();
  const oldest = await f.preview();
  let latest;
  for (let i = 0; i < 8; i++) latest = await f.preview();
  assert.equal((await f.call("approve_peer_review", { previewId: oldest.previewId, confirmationCode: oldest.confirmationCode }, f.approveContext)).isError, true);
  let shown;
  const dispatched = decode(await f.call("approve_peer_review", { previewId: latest.previewId, confirmationCode: latest.confirmationCode }, {
    mcpReq: { elicitInput: async request => {
      shown = request.message;
      return { action: "accept", content: { decision: "approve" } };
    } }
  }));
  assert.equal(dispatched.sent, true);
  assert.ok(shown.includes(latest.prompt));
  assert.ok(shown.includes(latest.snapshot.sha256));
  assert.equal(dispatched.review.prompt, latest.prompt);
  assert.equal(dispatched.review.approval.previewId, latest.previewId);
});

test("approval shows the recommended reviewer model and effort before sending", async () => {
  const f = await harness();
  const reviewer = { model: "gpt-5-codex", effort: "xhigh", reason: "Revisión de seguridad." };
  const preview = decode(await f.call("preview_peer_review", { ...f.bound, from: "claude", to: "codex", message: "Revisa answer.", paths: ["app.js"], reviewer }));
  assert.deepEqual(preview.reviewer, reviewer);
  let shown;
  const sent = decode(await f.call("approve_peer_review", { previewId: preview.previewId, confirmationCode: preview.confirmationCode }, {
    mcpReq: { elicitInput: async request => { shown = request.message; return { action: "accept", content: { decision: "approve" } }; } }
  }));
  assert.match(shown, /Recomendado para codex: modelo gpt-5-codex, esfuerzo xhigh\. Revisión de seguridad\./u);
  assert.match(shown, /cambia el modelo en la terminal del revisor antes de aprobar/u);
  assert.deepEqual(sent.review.reviewer, reviewer);
  assert.equal((await f.call("preview_peer_review", { ...f.bound, from: "claude", to: "codex", message: "x", paths: ["app.js"],
    reviewer: { ...reviewer, effort: "extreme" } }).catch(() => ({ isError: true }))).isError, true);
});

test("two stdio MCP processes exchange visible-session handoffs both ways without invoking a CLI", async t => {
  const f = await project();
  const workflowRoot = path.join(f.directory, "workflows");
  const clientsDirectory = path.join(f.directory, "clients");
  const called = path.join(f.directory, "MODEL_CLI_CALLED");
  await fs.mkdir(clientsDirectory, { mode: 0o700 });
  const quote = value => "'" + value.replaceAll("'", "'\\''") + "'";
  for (const name of ["claude", "codex"]) {
    await fs.writeFile(path.join(clientsDirectory, name), `#!/bin/sh\nprintf called > ${quote(called)}\nexit 97\n`, { mode: 0o700 });
  }
  const diagnostics = [];
  const approvals = [];
  async function connect(name, canApprove = true) {
    const client = new Client({ name, version: "1.0.0" }, { capabilities: canApprove ? { elicitation: {} } : {} });
    if (canApprove) client.setRequestHandler("elicitation/create", async request => {
      approvals.push(request.params.message);
      return { action: "accept", content: { decision: "approve" } };
    });
    const transport = new StdioClientTransport({ command: process.execPath, args: [entry], cwd: path.dirname(entry),
      env: { PATH: `${clientsDirectory}${path.delimiter}/usr/bin:/bin`, HOME: os.homedir(), AGENT_TOOLKIT_WORKFLOW_DIR: workflowRoot }, stderr: "pipe" });
    transport.stderr?.on("data", chunk => diagnostics.push(String(chunk)));
    t.after(async () => { await client.close().catch(() => {}); await transport.close().catch(() => {}); });
    await client.connect(transport);
    const call = async (tool, args) => {
      const response = await client.callTool({ name: tool, arguments: args });
      assert.equal(response.isError, undefined, response.content?.[0]?.text);
      return decode(response);
    };
    return { client, call };
  }
  const claude = await connect("claude-session");
  const codex = await connect("codex-session");
  const task = await claude.call("start_collaboration", { ...input, projectRoot: f.projectRoot });
  const bound = { taskId: task.id, projectRoot: f.projectRoot };
  assert.equal((await codex.call("get_collaboration", { projectRoot: f.projectRoot })).tasks[0].taskId, task.id);
  assert.equal((await codex.call("get_collaboration", bound)).context.content, input.context);
  const original = await fs.readFile(path.join(f.projectRoot, "app.js"), "utf8");
  const preview = await claude.call("preview_peer_review", { ...bound, from: "claude", to: "codex", message: "Revisa el contrato sin editar.", paths: ["app.js"] });
  const wrongConnection = await codex.client.callTool({ name: "approve_peer_review", arguments: { previewId: preview.previewId, confirmationCode: preview.confirmationCode } });
  assert.equal(wrongConnection.isError, true);
  assert.equal((await codex.call("wait_for_peer_handoff", { ...bound, agent: "codex", waitMs: 0 })).review, null);
  const waiting = codex.call("wait_for_peer_handoff", { ...bound, agent: "codex", waitMs: 2_000 });
  const dispatched = await claude.call("approve_peer_review", { previewId: preview.previewId, confirmationCode: preview.confirmationCode });
  assert.equal(dispatched.startsModel, false);
  const received = await waiting;
  assert.equal(received.review.id, dispatched.review.id);
  assert.equal(received.review.prompt, preview.prompt);
  const claim = await codex.call("claim_peer_review", { ...bound, reviewId: received.review.id, agent: "codex" });
  const secondClaim = await claude.client.callTool({ name: "claim_peer_review", arguments: { ...bound, reviewId: received.review.id, agent: "codex" } });
  assert.equal(secondClaim.isError, true);
  const report = "Hallazgo P2 en app.js:1. Propuesta de mejora. No ejecuté pruebas.";
  assert.equal((await codex.call("submit_peer_review", { ...bound, reviewId: received.review.id, agent: "codex", claimToken: claim.claimToken, content: report })).saved, true);
  const finished = await claude.call("wait_for_peer_handoff", { ...bound, agent: "claude", reviewId: received.review.id, waitMs: 0 });
  assert.equal(finished.review.review.content, report);
  assert.equal((await claude.call("get_collaboration", bound)).reviews[0].current, true);
  await codex.call("publish_peer_context", { ...bound, author: "codex", expectedRevision: 1, content: "Codex propone el siguiente cambio." });
  const reverse = await codex.call("preview_peer_review", { ...bound, from: "codex", to: "claude", message: "Revisa mi propuesta.", paths: ["app.js"] });
  const reverseSent = await codex.call("approve_peer_review", { previewId: reverse.previewId, confirmationCode: reverse.confirmationCode });
  const reverseReceived = await claude.call("wait_for_peer_handoff", { ...bound, agent: "claude", waitMs: 0 });
  assert.equal(reverseReceived.review.id, reverseSent.review.id);
  const reverseClaim = await claude.call("claim_peer_review", { ...bound, reviewId: reverseSent.review.id, agent: "claude" });
  await claude.call("submit_peer_review", { ...bound, reviewId: reverseSent.review.id, agent: "claude", claimToken: reverseClaim.claimToken, content: "Claude devuelve su informe." });
  const restarted = await connect("reopened-session");
  const shared = await restarted.call("get_collaboration", bound);
  assert.equal(shared.reviews.length, 2);
  assert.equal(shared.reviews[0].contextCurrent, false);
  assert.equal(shared.reviews[1].review.content, "Claude devuelve su informe.");
  assert.equal(JSON.stringify(shared).includes(claim.claimToken), false);
  assert.equal(approvals.length, 2);
  assert.ok(approvals[0].includes(preview.prompt));
  await claude.call("close_collaboration", bound);
  assert.equal((await codex.call("wait_for_peer_handoff", { ...bound, agent: "codex", waitMs: 0 })).taskState, "closed");
  assert.equal(await fs.readFile(path.join(f.projectRoot, "app.js"), "utf8"), original);
  await assert.rejects(fs.access(called));
  assert.deepEqual(diagnostics, []);
});

test("automatic collaborations need one confirmation and the inbox finds requests without a taskId", async () => {
  const f = await harness();
  const auto = { ...input, projectRoot: f.projectRoot, title: "Revisión automática", autoReviews: 2 };
  const blocked = decode(await f.call("start_collaboration", auto));
  assert.deepEqual({ state: blocked.state, created: blocked.created }, { state: "blocked", created: false });
  let shown;
  const declined = decode(await f.call("start_collaboration", auto, { mcpReq: { elicitInput: async request => {
    shown = request.message;
    return { action: "decline" };
  } } }));
  assert.equal(declined.created, false);
  assert.match(shown, /claude envíe a codex hasta 2 encargos/u);
  assert.deepEqual((await f.store.listCollaborations({ projectRoot: f.projectRoot })).tasks.map(task => task.taskId), [f.task.id]);
  const task = decode(await f.call("start_collaboration", auto, f.approveContext));
  assert.equal(task.autoApprove.maxReviews, 2);
  const bound = { taskId: task.id, projectRoot: f.projectRoot };
  const request = { ...bound, from: "claude", to: "codex", message: "Revisa answer.", paths: ["app.js"] };
  assert.equal((await f.call("request_peer_review", { ...request, taskId: f.task.id })).isError, true);
  const idle = decode(await f.call("wait_for_peer_handoff", { projectRoot: f.projectRoot, agent: "codex", waitMs: 0 }));
  assert.deepEqual({ review: idle.review, timedOut: idle.timedOut }, { review: null, timedOut: true });
  const waiting = f.call("wait_for_peer_handoff", { projectRoot: f.projectRoot, agent: "codex", waitMs: 2_000 });
  const sent = decode(await f.call("request_peer_review", request));
  assert.deepEqual({ sent: sent.sent, automatic: sent.automatic, startsModel: sent.startsModel }, { sent: true, automatic: true, startsModel: false });
  const received = decode(await waiting);
  assert.equal(received.taskId, task.id);
  assert.equal(received.review.id, sent.review.id);
  assert.equal((await f.call("wait_for_peer_handoff", { projectRoot: f.projectRoot, agent: "codex", reviewId: sent.review.id })).isError, true);
  assert.equal((await f.call("wait_for_peer_handoff", { projectRoot: f.projectRoot, agent: "codex", waitMs: 60_001 }).catch(() => ({ isError: true }))).isError, true);
});
