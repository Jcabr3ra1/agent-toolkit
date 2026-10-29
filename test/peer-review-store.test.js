import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import { createPeerReviewStore, PEER_LIMITS } from "../src/peer-review-store.js";

const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "agent-toolkit-peers-")));
after(() => fs.rm(root, { recursive: true, force: true }));

async function fixture() {
  const directory = await fs.mkdtemp(path.join(root, "case-"));
  const projectRoot = path.join(directory, "project");
  const storage = path.join(directory, "storage");
  await fs.mkdir(projectRoot, { mode: 0o700 });
  await fs.mkdir(path.join(projectRoot, "src"));
  await fs.writeFile(path.join(projectRoot, "src", "app.js"), "export const answer = 42;\n");
  const store = createPeerReviewStore({ root: storage });
  const task = await store.startCollaboration({ projectRoot, project: "Otro proyecto", title: "Revisar función",
    objective: "Verificar el contrato de answer", primaryAgent: "claude", context: "Implementación inicial." });
  const bound = { taskId: task.id, projectRoot };
  const prepare = (extra = {}) => store.prepareReview({ ...bound, from: "claude", to: "codex",
    message: "Revisa el contrato.", paths: ["src/app.js"], ...extra });
  const dispatch = async (extra = {}) => store.dispatchReview(await prepare(extra), { previewId: "a".repeat(32) });
  return { directory, projectRoot, storage, store, task, bound, prepare, dispatch };
}

test("independent stores exchange reviews in both directions and retain them after restart", async () => {
  const f = await fixture();
  const other = createPeerReviewStore({ root: f.storage });
  const original = await fs.readFile(path.join(f.projectRoot, "src/app.js"), "utf8");
  const preview = await f.prepare();
  assert.match(preview.prompt, /claude solicita revisión a codex/u);
  assert.match(preview.prompt, /Implementación inicial/u);
  assert.equal(preview.limits.startsModel, false);
  assert.equal((await other.getCollaboration(f.bound)).reviews.length, 0);
  const request = await f.store.dispatchReview(preview, { previewId: "a".repeat(32) });
  await assert.rejects(other.claimReview({ ...f.bound, reviewId: request.id, agent: "claude" }), { code: "peer-claim" });
  const claim = await other.claimReview({ ...f.bound, reviewId: request.id, agent: "codex" });
  assert.equal(claim.state, "claimed");
  assert.equal(JSON.stringify(await f.store.getCollaboration(f.bound)).includes(claim.claimToken), false);
  assert.equal(JSON.stringify(await f.store.getCollaboration(f.bound)).includes("claimHash"), false);
  const submitted = await other.submitReview({ ...f.bound, reviewId: request.id, agent: "codex",
    claimToken: claim.claimToken, content: "Sin hallazgos en el contrato. No ejecuté pruebas." });
  assert.equal(submitted.saved, true);
  await assert.rejects(other.submitReview({ ...f.bound, reviewId: request.id, agent: "codex",
    claimToken: claim.claimToken, content: "Duplicado" }), { code: "peer-claim" });
  const updated = await other.publishContext({ ...f.bound, author: "codex", expectedRevision: 1, content: "Nuevo punto de revisión." });
  assert.equal(updated.revision, 2);
  const reverse = await f.dispatch({ from: "codex", to: "claude" });
  const reverseClaim = await f.store.claimReview({ ...f.bound, reviewId: reverse.id, agent: "claude" });
  await f.store.submitReview({ ...f.bound, reviewId: reverse.id, agent: "claude", claimToken: reverseClaim.claimToken, content: "Revisión inversa terminada." });
  const restarted = createPeerReviewStore({ root: f.storage });
  const final = await restarted.getCollaboration(f.bound);
  assert.equal(final.reviews.length, 2);
  assert.equal(final.reviews[0].contextCurrent, false);
  assert.equal(final.reviews[1].current, true);
  assert.equal(final.reviews[1].review.content, "Revisión inversa terminada.");
  assert.equal(await fs.readFile(path.join(f.projectRoot, "src/app.js"), "utf8"), original);
});

test("project roots isolate equal labels and a replaced directory invalidates the binding", async () => {
  const f = await fixture();
  const otherRoot = path.join(f.directory, "another-project");
  await fs.mkdir(otherRoot, { mode: 0o700 });
  const otherTask = await f.store.startCollaboration({ projectRoot: otherRoot, project: f.task.project.name,
    title: "Otra tarea", objective: "Otro objetivo", primaryAgent: "codex" });
  assert.deepEqual((await f.store.listCollaborations({ projectRoot: f.projectRoot })).tasks.map(item => item.taskId), [f.task.id]);
  assert.deepEqual((await f.store.listCollaborations({ projectRoot: otherRoot })).tasks.map(item => item.taskId), [otherTask.id]);
  await assert.rejects(f.store.getCollaboration({ taskId: f.task.id, projectRoot: otherRoot }), { code: "peer-project" });
  await fs.rename(f.projectRoot, f.projectRoot + "-old");
  await fs.mkdir(f.projectRoot, { mode: 0o700 });
  await assert.rejects(f.store.getCollaboration(f.bound), { code: "peer-project" });
});

test("context publication uses optimistic concurrency and invalidates old previews and claims", async () => {
  const f = await fixture();
  const preview = await f.prepare();
  await f.store.publishContext({ ...f.bound, author: "claude", expectedRevision: 1, content: "Contexto cambiado." });
  await assert.rejects(f.store.publishContext({ ...f.bound, author: "codex", expectedRevision: 1, content: "Actualización perdida." }), { code: "peer-revision" });
  await assert.rejects(f.store.dispatchReview(preview, { previewId: "a".repeat(32) }), { code: "peer-revision" });
  const request = await f.dispatch();
  const claim = await f.store.claimReview({ ...f.bound, reviewId: request.id, agent: "codex" });
  await f.store.publishContext({ ...f.bound, author: "claude", expectedRevision: 2, content: "Contexto posterior." });
  await assert.rejects(f.store.submitReview({ ...f.bound, reviewId: request.id, agent: "codex", claimToken: claim.claimToken,
    content: "INFORME_DESACTUALIZADO" }), { code: "peer-claim" });
  const task = await f.store.getCollaboration(f.bound);
  assert.equal(task.reviews[0].state, "stale");
  assert.equal(task.reviews[0].review, null);
  assert.equal(JSON.stringify(task).includes("INFORME_DESACTUALIZADO"), false);
});

test("file changes invalidate dispatch, claims, submissions, and freshness of completed reviews", async () => {
  const f = await fixture();
  const file = path.join(f.projectRoot, "src/app.js");
  const preview = await f.prepare();
  await fs.writeFile(file, "changed before dispatch");
  await assert.rejects(f.store.dispatchReview(preview, { previewId: "a".repeat(32) }), { code: "peer-stale" });
  const first = await f.dispatch();
  await fs.writeFile(file, "changed before claim");
  assert.equal((await f.store.claimReview({ ...f.bound, reviewId: first.id, agent: "codex" })).state, "stale");
  const second = await f.dispatch();
  const claim = await f.store.claimReview({ ...f.bound, reviewId: second.id, agent: "codex" });
  await fs.writeFile(file, "changed while reviewing");
  const rejected = await f.store.submitReview({ ...f.bound, reviewId: second.id, agent: "codex", claimToken: claim.claimToken, content: "PRIVATE_STALE_REPORT" });
  assert.deepEqual({ state: rejected.state, saved: rejected.saved }, { state: "stale", saved: false });
  assert.equal(JSON.stringify(await f.store.getCollaboration(f.bound)).includes("PRIVATE_STALE_REPORT"), false);
  const third = await f.dispatch();
  const thirdClaim = await f.store.claimReview({ ...f.bound, reviewId: third.id, agent: "codex" });
  await f.store.submitReview({ ...f.bound, reviewId: third.id, agent: "codex", claimToken: thirdClaim.claimToken, content: "Informe válido en ese momento." });
  assert.equal((await f.store.getCollaboration(f.bound)).reviews[2].current, true);
  await fs.writeFile(file, "changed after review");
  const stale = (await f.store.getCollaboration(f.bound)).reviews[2];
  assert.equal(stale.state, "completed");
  assert.equal(stale.filesCurrent, false);
  assert.equal(stale.current, false);
});

test("an unsafe file replacement marks a claimed review stale without storing the report", async () => {
  const f = await fixture();
  const request = await f.dispatch();
  const claim = await f.store.claimReview({ ...f.bound, reviewId: request.id, agent: "codex" });
  const file = path.join(f.projectRoot, "src/app.js");
  await fs.unlink(file);
  await fs.symlink(path.join(f.directory, "unavailable.txt"), file);
  const rejected = await f.store.submitReview({ ...f.bound, reviewId: request.id, agent: "codex", claimToken: claim.claimToken, content: "UNSAFE_REPLACEMENT_REPORT" });
  assert.equal(rejected.state, "stale");
  assert.equal(rejected.saved, false);
  assert.equal(JSON.stringify(await f.store.getCollaboration(f.bound)).includes("UNSAFE_REPLACEMENT_REPORT"), false);
});

test("a review is claimed once across independent store instances and tokens cannot be swapped", async () => {
  const f = await fixture();
  const other = createPeerReviewStore({ root: f.storage });
  const request = await f.dispatch();
  await assert.rejects(f.prepare(), { code: "peer-active" });
  const input = { ...f.bound, reviewId: request.id, agent: "codex" };
  const claims = await Promise.allSettled([f.store.claimReview(input), other.claimReview(input)]);
  assert.equal(claims.filter(item => item.status === "fulfilled").length, 1);
  await assert.rejects(other.submitReview({ ...input, claimToken: "0".repeat(64), content: "Sin comprobante" }), { code: "peer-claim" });
  const claim = claims.find(item => item.status === "fulfilled").value;
  await other.submitReview({ ...input, claimToken: claim.claimToken, content: "Comprobante correcto" });
  assert.equal((await f.store.getCollaboration(f.bound)).reviews[0].state, "completed");
});

test("path scope rejects escapes, private folders, symlinks, hard links and oversized files", async () => {
  const f = await fixture();
  for (const paths of [["../outside"], ["C:/outside"], ["/etc/passwd"], ["src/../app.js"], [".git/config"], [".claude/settings.json"],
    ["src\\app.js"], ["src/app.js\nother"], ["src"], [], Array(65).fill("src/app.js")]) {
    await assert.rejects(f.prepare({ paths }));
  }
  const outside = path.join(f.directory, "outside.txt");
  await fs.writeFile(outside, "PRIVATE_OUTSIDE_CONTENT");
  await fs.symlink(outside, path.join(f.projectRoot, "link.txt"));
  await fs.symlink(f.directory, path.join(f.projectRoot, "external"));
  await fs.link(outside, path.join(f.projectRoot, "hard.txt"));
  for (const name of ["link.txt", "external/outside.txt", "hard.txt"]) await assert.rejects(f.prepare({ paths: [name] }), { code: "peer-files" });
  await fs.writeFile(path.join(f.projectRoot, "large.bin"), Buffer.alloc(PEER_LIMITS.fileBytes + 1));
  await assert.rejects(f.prepare({ paths: ["large.bin"] }), { code: "peer-files" });
  const missing = await f.prepare({ paths: ["deleted.js"] });
  assert.equal(missing.snapshot.files[0].exists, false);
  assert.equal(JSON.stringify(missing).includes("PRIVATE_OUTSIDE_CONTENT"), false);
});

test("cancellation and closing prevent late reports without pretending to stop a terminal", async () => {
  const f = await fixture();
  const request = await f.dispatch();
  const claim = await f.store.claimReview({ ...f.bound, reviewId: request.id, agent: "codex" });
  const cancelled = await f.store.cancelReview({ ...f.bound, reviewId: request.id });
  assert.equal(cancelled.stopsSession, false);
  await assert.rejects(f.store.submitReview({ ...f.bound, reviewId: request.id, agent: "codex", claimToken: claim.claimToken, content: "Demasiado tarde" }), { code: "peer-claim" });
  await f.dispatch();
  await f.store.closeCollaboration(f.bound);
  const closed = await f.store.getCollaboration(f.bound);
  assert.equal(closed.state, "closed");
  assert.equal(closed.reviews[1].state, "cancelled");
  await assert.rejects(f.prepare(), { code: "peer-closed" });
  await assert.rejects(f.store.publishContext({ ...f.bound, expectedRevision: 1, author: "claude", content: "No" }), { code: "peer-closed" });
  assert.deepEqual((await f.store.listCollaborations({ projectRoot: f.projectRoot })).tasks, []);
});

test("storage is private, rejects linked records, and never removes an existing lock", async () => {
  const f = await fixture();
  const record = path.join(f.storage, f.task.id + ".json");
  assert.equal((await fs.stat(f.storage)).mode & 0o777, 0o700);
  assert.equal((await fs.stat(record)).mode & 0o777, 0o600);
  const lock = record + ".lock";
  await fs.mkdir(lock);
  const impatient = createPeerReviewStore({ root: f.storage, lockTimeoutMs: 20 });
  await assert.rejects(impatient.publishContext({ ...f.bound, expectedRevision: 1, author: "claude", content: "No" }), { code: "peer-busy" });
  assert.equal((await fs.stat(lock)).isDirectory(), true);
  await fs.rmdir(lock);
  await fs.chmod(record, 0o644);
  await assert.rejects(f.store.getCollaboration(f.bound), { code: "peer-storage" });
  await fs.chmod(record, 0o600);
  await fs.rename(record, record + ".backup");
  await fs.symlink(record + ".backup", record);
  await assert.rejects(f.store.getCollaboration(f.bound), { code: "peer-storage" });
  await fs.unlink(record);
  await fs.link(record + ".backup", record);
  await assert.rejects(f.store.getCollaboration(f.bound), { code: "peer-storage" });
});

test("an unreadable record is skipped by listings but valid reviews and results still show", async () => {
  const f = await fixture();
  const broken = crypto.randomUUID();
  await fs.writeFile(path.join(f.storage, broken + ".json"), "{roto", { mode: 0o600 });
  await fs.writeFile(path.join(f.storage, crypto.randomUUID() + ".json"), "{}", { mode: 0o644 });
  assert.deepEqual((await f.store.listCollaborations({ projectRoot: f.projectRoot })).tasks.map(task => task.taskId), [f.task.id]);
  const request = await f.dispatch();
  const handoff = await f.store.findHandoff({ projectRoot: f.projectRoot, agent: "codex" });
  assert.equal(handoff.done, true);
  assert.equal(handoff.value.review.id, request.id);
  const claim = await f.store.claimReview({ ...f.bound, reviewId: request.id, agent: "codex" });
  await f.store.submitReview({ ...f.bound, reviewId: request.id, agent: "codex", claimToken: claim.claimToken, content: "Informe válido." });
  await f.store.recordOutcome({ ...f.bound, reviewId: request.id, agent: "claude", verdict: "aprobado", findings: 2, upheld: 1 });
  const { groups } = await f.store.performance({});
  assert.equal(groups.length, 1);
  assert.deepEqual([groups[0].reviews, groups[0].findings, groups[0].upheld], [1, 2, 1]);
  await assert.rejects(f.store.getCollaboration({ taskId: broken, projectRoot: f.projectRoot }), { code: "peer-storage" });
});

test("input, report and history limits are bounded in bytes and same-agent reviews are rejected", async () => {
  const f = await fixture();
  await assert.rejects(f.prepare({ to: "claude" }), { code: "peer-input" });
  await assert.rejects(f.store.publishContext({ ...f.bound, expectedRevision: 1, author: "claude", content: "\u001b[31m" }), { code: "peer-input" });
  await assert.rejects(f.store.publishContext({ ...f.bound, expectedRevision: 1, author: "claude", content: "á".repeat(PEER_LIMITS.contextBytes) }), { code: "peer-input" });
  for (let revision = 1; revision <= 20; revision++) await f.store.publishContext({ ...f.bound, expectedRevision: revision, author: "codex", content: "Versión " + revision });
  assert.equal((await f.store.getCollaboration(f.bound)).history.length, PEER_LIMITS.history);
  const request = await f.dispatch();
  const claim = await f.store.claimReview({ ...f.bound, reviewId: request.id, agent: "codex" });
  await assert.rejects(f.store.submitReview({ ...f.bound, reviewId: request.id, agent: "codex", claimToken: claim.claimToken,
    content: "á".repeat(PEER_LIMITS.reportBytes) }), { code: "peer-input" });
  assert.equal((await f.store.getCollaboration(f.bound)).reviews[0].review, null);
});

test("special storage files fail promptly instead of blocking reads", { skip: process.platform === "win32" }, async () => {
  const f = await fixture();
  const record = path.join(f.storage, f.task.id + ".json");
  await fs.unlink(record);
  const fifo = spawnSync("mkfifo", [record], { encoding: "utf8" });
  assert.equal(fifo.status, 0, fifo.stderr);
  await assert.rejects(f.store.getCollaboration(f.bound), { code: "peer-storage" });
});

test("the total snapshot and review count stay bounded", async () => {
  const f = await fixture();
  const names = Array.from({ length: 5 }, (_, index) => "large-" + index + ".bin");
  for (const name of names) await fs.writeFile(path.join(f.projectRoot, name), Buffer.alloc(PEER_LIMITS.fileBytes));
  await assert.rejects(f.prepare({ paths: names }), { code: "peer-files" });
  for (let i = 0; i < PEER_LIMITS.reviews; i++) {
    const request = await f.dispatch();
    await f.store.cancelReview({ ...f.bound, reviewId: request.id });
  }
  await assert.rejects(f.prepare(), { code: "peer-limit" });
});

test("automatic requests are limited to the primary agent and the confirmed quota", async () => {
  const f = await fixture();
  const input = { ...f.bound, from: "claude", to: "codex", message: "Revisa el contrato.", paths: ["src/app.js"] };
  await assert.rejects(f.store.requestReview(input), { code: "peer-auto" });
  await assert.rejects(f.store.startCollaboration({ projectRoot: f.projectRoot, project: "Auto", title: "Auto",
    objective: "Revisar", primaryAgent: "claude", autoReviews: PEER_LIMITS.autoReviews + 1 }), { code: "peer-input" });
  const task = await f.store.startCollaboration({ projectRoot: f.projectRoot, project: "Auto", title: "Auto",
    objective: "Revisar sin aprobar cada encargo", primaryAgent: "claude", autoReviews: 2 });
  assert.deepEqual({ from: task.autoApprove.from, maxReviews: task.autoApprove.maxReviews }, { from: "claude", maxReviews: 2 });
  const bound = { taskId: task.id, projectRoot: f.projectRoot };
  const auto = { ...input, ...bound };
  const first = await f.store.requestReview(auto);
  assert.equal(first.state, "pending");
  assert.equal(first.approval.automatic, true);
  assert.equal(first.approval.previewId, undefined);
  await assert.rejects(f.store.requestReview(auto), { code: "peer-active" });
  const claim = await f.store.claimReview({ ...bound, reviewId: first.id, agent: "codex" });
  await f.store.submitReview({ ...bound, reviewId: first.id, agent: "codex", claimToken: claim.claimToken, content: "Sin hallazgos." });
  await assert.rejects(f.store.requestReview({ ...auto, from: "codex", to: "claude" }), { code: "peer-auto" });
  const second = await f.store.requestReview(auto);
  await f.store.cancelReview({ ...bound, reviewId: second.id });
  await assert.rejects(f.store.requestReview(auto), { code: "peer-auto" });
  const manual = await f.store.dispatchReview(await f.store.prepareReview(auto), { previewId: "a".repeat(32) });
  assert.equal(manual.approval.automatic, undefined);
  const restarted = createPeerReviewStore({ root: f.storage });
  assert.equal((await restarted.getCollaboration(bound)).autoApprove.maxReviews, 2);
});

test("listed collaborations show who may send automatic requests", async () => {
  const f = await fixture();
  const auto = await f.store.startCollaboration({ projectRoot: f.projectRoot, project: "Auto", title: "Codex principal",
    objective: "Revisar", primaryAgent: "codex", autoReviews: 3 });
  const listed = Object.fromEntries((await f.store.listCollaborations({ projectRoot: f.projectRoot })).tasks.map(task => [task.taskId, task]));
  assert.deepEqual({ primaryAgent: listed[f.task.id].primaryAgent, autoReviews: listed[f.task.id].autoReviews }, { primaryAgent: "claude", autoReviews: 0 });
  assert.deepEqual({ primaryAgent: listed[auto.id].primaryAgent, autoReviews: listed[auto.id].autoReviews }, { primaryAgent: "codex", autoReviews: 3 });
});

test("reviewer recommendations are validated per agent and travel inside the approved prompt", async () => {
  const f = await fixture();
  const reviewer = { model: "gpt-5-codex", effort: "high", reason: "Cambio de concurrencia con riesgo de carreras." };
  for (const bad of [{ ...reviewer, effort: "minimal" }, { ...reviewer, model: "modelo con espacios" }, { ...reviewer, reason: "" }, { model: "x", effort: "low" }]) {
    await assert.rejects(f.prepare({ reviewer: bad }), { code: "peer-input" });
  }
  await assert.rejects(f.prepare({ from: "codex", to: "claude", reviewer: { ...reviewer, model: "opus", effort: "ultra" } }), { code: "peer-input" });
  assert.equal((await f.prepare({ reviewer: { ...reviewer, effort: "ultra" } })).reviewer.effort, "ultra");
  const plain = await f.prepare();
  assert.equal(plain.reviewer, null);
  assert.doesNotMatch(plain.prompt, /Configuración recomendada/u);
  const preview = await f.prepare({ reviewer });
  assert.deepEqual(preview.reviewer, reviewer);
  assert.match(preview.prompt, /Configuración recomendada para codex \(declarada, no verificada\): modelo gpt-5-codex, esfuerzo high/u);
  assert.notEqual(preview.promptSha256, plain.promptSha256);
  await assert.rejects(f.store.dispatchReview({ ...preview, reviewer: { ...reviewer, effort: "low" } }, { previewId: "a".repeat(32) }), { code: "peer-revision" });
  const request = await f.store.dispatchReview(preview, { previewId: "a".repeat(32) });
  assert.deepEqual(request.reviewer, reviewer);
  const claim = await f.store.claimReview({ ...f.bound, reviewId: request.id, agent: "codex" });
  assert.equal(claim.review.reviewer.model, "gpt-5-codex");
});

test("outcomes are recorded once by the sender of a completed review and aggregated by model and level", async () => {
  const f = await fixture();
  const reviewer = { model: "gpt-6.1-sol", effort: "high", reason: "Seguridad acotada." };
  const request = await f.store.dispatchReview(await f.prepare({ reviewer }), { previewId: "a".repeat(32) });
  const outcome = { ...f.bound, reviewId: request.id, agent: "claude", verdict: "requiere_cambios", findings: 3, upheld: 2,
    level: "exigente", principal: { model: "sonnet", effort: "high" } };
  await assert.rejects(f.store.recordOutcome(outcome), { code: "peer-outcome" });
  const claim = await f.store.claimReview({ ...f.bound, reviewId: request.id, agent: "codex" });
  await f.store.submitReview({ ...f.bound, reviewId: request.id, agent: "codex", claimToken: claim.claimToken, content: "Veredicto: Requiere cambios" });
  for (const bad of [{ upheld: 4 }, { verdict: "ok" }, { level: "extremo" }, { principal: { model: "sonnet", effort: "ultra" } }, { findings: -1 }]) {
    await assert.rejects(f.store.recordOutcome({ ...outcome, ...bad }), { code: "peer-input" });
  }
  await assert.rejects(f.store.recordOutcome({ ...outcome, agent: "codex", principal: undefined }), { code: "peer-outcome" });
  const saved = await f.store.recordOutcome(outcome);
  assert.deepEqual({ verdict: saved.outcome.verdict, upheld: saved.outcome.upheld, principal: saved.outcome.principal },
    { verdict: "requiere_cambios", upheld: 2, principal: { model: "sonnet", effort: "high" } });
  await assert.rejects(f.store.recordOutcome(outcome), { code: "peer-outcome" });
  const stats = await createPeerReviewStore({ root: f.storage }).performance({ projectRoot: f.projectRoot });
  assert.deepEqual(stats.groups, [{ reviewer: "codex", model: "gpt-6.1-sol", effort: "high", level: "exigente", reviews: 1, findings: 3, upheld: 2,
    verdicts: { aprobado: 0, aprobado_con_cambios: 0, requiere_cambios: 1 } }]);
  assert.deepEqual((await f.store.performance({ projectRoot: path.join(f.directory, "otro") }).catch(() => ({ groups: "error" }))).groups, "error");
});

test("usage survives restart, deduplicates and keeps unknown counters distinct from zero", async () => {
  const f = await fixture();
  assert.equal(typeof f.store.recordUsage, "function");
  const measurement = { id: "call-1", agent: "codex", phase: "review", model: "example-model", source: "client-reported",
    inputTokens: 100, cacheReadTokens: 80, outputTokens: 20, totalTokens: 120, durationMs: 2000, costUsd: null };
  assert.equal((await f.store.recordUsage({ ...f.bound, measurement })).recorded, true);
  assert.equal((await f.store.recordUsage({ ...f.bound, measurement })).recorded, false);
  await assert.rejects(f.store.recordUsage({ ...f.bound, measurement: { ...measurement, inputTokens: 101 } }));
  for (const change of [{ inputTokens: -1 }, { totalTokens: Infinity }, { costUsd: -2 }, { source: "verified" }, { secret: "x" }]) {
    await assert.rejects(f.store.recordUsage({ ...f.bound, measurement: { ...measurement, id: "invalid", ...change } }));
  }
  await f.store.recordUsage({ ...f.bound, measurement: { id: "call-2", agent: "claude", phase: "implementation", model: "example-model", source: "manual", outputTokens: 0 } });
  await f.store.closeCollaboration(f.bound);
  const fresh = createPeerReviewStore({ root: f.storage });
  const report = await fresh.consumption({ projectRoot: f.projectRoot });
  assert.equal(report.tasks.length, 1);
  assert.equal(report.tasks[0].state, "closed");
  assert.equal(report.summary.calls, 2);
  assert.deepEqual(report.summary.counters.inputTokens, { known: 1, missing: 1, sum: 100, complete: false });
  assert.deepEqual(report.summary.counters.outputTokens, { known: 2, missing: 0, sum: 20, complete: true });
  assert.equal(report.summary.counters.costUsd.sum, null);
  assert.equal(report.summary.counters.totalTokens.sum, 120);
  assert.equal(report.savingsVerified, false);
});

test("concurrent identical usage records count once and historical tasks have no fabricated usage", async () => {
  const f = await fixture();
  assert.equal(typeof f.store.consumption, "function");
  const empty = await f.store.consumption({ projectRoot: f.projectRoot });
  assert.equal(empty.tasks[0].summary.calls, 0);
  assert.equal(empty.summary.counters.totalTokens.sum, null);
  const measurement = { id: "same-call", agent: "codex", phase: "review", model: "example", source: "manual", totalTokens: 50 };
  const other = createPeerReviewStore({ root: f.storage });
  const results = await Promise.all([f.store.recordUsage({ ...f.bound, measurement }), other.recordUsage({ ...f.bound, measurement })]);
  assert.equal(results.filter(r => r.recorded).length, 1);
  assert.equal((await other.consumption({ projectRoot: f.projectRoot })).summary.calls, 1);
});

test('closure snapshot holds the transaction lock and never cancels a concurrently dispatched review', async () => {
  const f=await fixture(), other=createPeerReviewStore({root:f.storage});
  const preview=await f.prepare();
  assert.equal(typeof f.store.closeWithSnapshot,'function');
  let attempt, settled=false, snapshot;
  await f.store.closeWithSnapshot({...f.bound,saveSnapshot:async task=>{
    snapshot=task;
    attempt=other.dispatchReview(preview,{previewId:'b'.repeat(32)}).then(value=>({value}),error=>({error})).then(value=>{settled=true;return value;});
    await new Promise(resolve=>setTimeout(resolve,45));
    assert.equal(settled,false,'concurrent mutation waits for snapshot and close');
  }});
  assert.equal((await attempt).error.code,'peer-closed');
  assert.equal(snapshot.reviews.length,0);
  assert.equal((await other.getCollaboration(f.bound)).state,'closed');
});

test('closure refuses active work without saving a snapshot or cancelling the review',async()=>{
  const f=await fixture(), request=await f.dispatch();let saved=false;
  assert.equal(typeof f.store.closeWithSnapshot,'function');
  await assert.rejects(f.store.closeWithSnapshot({...f.bound,saveSnapshot:async()=>{saved=true;}}));
  assert.equal(saved,false);
  assert.equal((await f.store.getCollaboration(f.bound)).reviews.find(r=>r.id===request.id).state,'pending');
});
