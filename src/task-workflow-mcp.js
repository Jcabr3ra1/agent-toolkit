import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod/v4";

import { createClaudeCodeRunner } from "./claude-code-runner.js";
import { createCodexCliRunner } from "./codex-cli-runner.js";
import { createTaskWorkflowStore } from "./task-workflow-store.js";

const TASK_INPUT = z.object({
  title: z.string().trim().min(1).max(180),
  project: z.string().trim().min(1).max(240),
  objective: z.string().trim().min(1).max(4_000),
  mode: z.enum(["tutor", "autonomous"]),
  scope: z.string().max(4_000).optional().default(""),
  acceptance: z.string().max(4_000).optional().default(""),
  checks: z.string().max(2_000).optional().default(""),
  allowImplementation: z.boolean().optional().default(false),
  allowFinalReview: z.boolean().optional().default(false)
}).strict();

function result(value) {
  return { content: [{ type: "text", text: JSON.stringify(value, null, 2) }] };
}

async function invoke(operation, context) {
  try {
    return result(await operation(context));
  } catch (error) {
    return { isError: true, content: [{ type: "text", text: error instanceof Error ? error.message : "La operación no se pudo completar." }] };
  }
}

function quoteCommandArgument(value) {
  return /^[A-Za-z0-9_./:=+-]+$/u.test(value) ? value : `'${value.replaceAll("'", "'\\''")}'`;
}

async function requestExecutionApproval(context, preview) {
  if (typeof context?.mcpReq?.elicitInput !== "function") {
    throw new Error("Este cliente MCP no ofrece una confirmación interactiva; la ejecución quedó bloqueada.");
  }
  const command = [preview.command.executable, ...preview.command.args].map(quoteCommandArgument).join(" ");
  const details = [
    "Agent Toolkit solicita tu aprobación para llamar a un modelo local.",
    `Cliente: ${preview.client} ${preview.version}`,
    `Sesión o cuenta detectada: ${preview.account}`,
    `Modelo y esfuerzo: ${preview.model} / ${preview.effort}`,
    `Proyecto local: ${preview.command.cwd}`,
    `Permisos de la etapa: ${JSON.stringify(preview.limits ?? {})}`,
    `Comando exacto (shell desactivado): ${command}`,
    `Entrada completa por stdin (${preview.promptBytes} bytes; SHA-256 ${preview.promptSha256}):`,
    preview.command.stdin,
    "Elige aprobar solo si coincide con la vista previa que revisaste. Cancelar no ejecutará el modelo."
  ].join("\n\n");
  const response = await context.mcpReq.elicitInput({
    message: details,
    requestedSchema: {
      type: "object",
      properties: { decision: { type: "string", enum: ["approve", "cancel"], title: "Decisión" } },
      required: ["decision"]
    }
  });
  if (response.action !== "accept" || response.content?.decision !== "approve") {
    throw new Error("La ejecución fue cancelada; no se llamó al modelo.");
  }
}

const PREVIEW_TTL_MS = 20 * 60 * 1000;
const MAX_PENDING_PREVIEWS = 8;
const MAX_EXECUTIONS = 32;
const MAX_ACTIVITY_EVENTS = 40;
const MAX_ACTIVITY_WAIT_MS = 15_000;
const CLAUDE_EFFORT = z.enum(["low", "medium", "high", "xhigh", "max"]);
const CODEX_EFFORT = z.enum(["minimal", "low", "medium", "high", "xhigh"]);
const EXECUTION_DIAGNOSTIC_CATEGORIES = new Set([
  "authentication", "cli-arguments", "model", "usage-limit", "network", "permissions", "result-error"
]);
const EXECUTION_DIAGNOSTIC_SUBTYPES = new Set([
  "error_during_execution", "error_max_turns", "error_max_budget_usd",
  "error_max_structured_output_retries", "error_max_thinking_tokens"
]);

function safeExecutionDiagnostic(value) {
  if (!value || typeof value !== "object") return null;
  const diagnostic = {};
  if (value.kind === "process-exit" || value.kind === "result-error") diagnostic.kind = value.kind;
  if (Number.isInteger(value.exitCode) && value.exitCode >= 0 && value.exitCode <= 255) diagnostic.exitCode = value.exitCode;
  if (typeof value.signal === "string" && /^SIG[A-Z0-9]{1,16}$/u.test(value.signal)) diagnostic.signal = value.signal;
  if (EXECUTION_DIAGNOSTIC_CATEGORIES.has(value.category)) diagnostic.category = value.category;
  if (EXECUTION_DIAGNOSTIC_SUBTYPES.has(value.resultSubtype)) diagnostic.resultSubtype = value.resultSubtype;
  return Object.keys(diagnostic).length ? diagnostic : null;
}

function registerTools(server, store, codexRunner, claudeRunner) {
  const previews = new Map();
  const executions = new Map();
  const activeExecutionByTask = new Map();

  function publishActivity(execution, message) {
    const event = { sequence: ++execution.sequence, at: new Date().toISOString(), message };
    execution.events.push(event);
    if (execution.events.length > MAX_ACTIVITY_EVENTS) execution.events.shift();
    for (const resume of execution.waiters) resume();
    execution.waiters.clear();
  }

  function executionSnapshot(execution, afterSequence = 0) {
    return {
      taskId: execution.taskId,
      executionId: execution.id,
      stage: execution.stage,
      state: execution.state,
      events: execution.events.filter(event => event.sequence > afterSequence),
      nextSequence: execution.sequence,
      activityMayBeTruncated: afterSequence < (execution.events[0]?.sequence ?? 1) - 1,
      ...(execution.diagnostic ? { diagnostic: execution.diagnostic } : {})
    };
  }

  async function waitForActivity(execution, afterSequence, waitMs) {
    if (execution.sequence > afterSequence || !["starting", "running", "cancelling"].includes(execution.state) || waitMs === 0) {
      return executionSnapshot(execution, afterSequence);
    }
    await new Promise(resolve => {
      let timer;
      const resume = () => {
        clearTimeout(timer);
        execution.waiters.delete(resume);
        resolve();
      };
      execution.waiters.add(resume);
      timer = setTimeout(resume, waitMs);
    });
    return executionSnapshot(execution, afterSequence);
  }

  function beginClaudeExecution({ taskId, stage, pending }) {
    const activeId = activeExecutionByTask.get(taskId);
    const active = activeId ? executions.get(activeId) : null;
    if (active && ["starting", "running", "cancelling"].includes(active.state)) {
      throw new Error("Ya hay una llamada de Claude activa para esta tarea; consulta su actividad antes de iniciar otra.");
    }
    for (const execution of executions.values()) {
      if (["completed", "failed"].includes(execution.state) && executions.size >= MAX_EXECUTIONS) executions.delete(execution.id);
    }
    if (executions.size >= MAX_EXECUTIONS) throw new Error("Hay demasiadas llamadas activas; espera a que terminen antes de iniciar otra.");

    const execution = {
      id: randomUUID(), taskId, stage, state: "starting", sequence: 0,
      controller: new AbortController(),
      events: [], waiters: new Set(), startedAt: new Date().toISOString(), outputKey: stage === "claude-proposal" ? "proposal" : "implementation"
    };
    executions.set(execution.id, execution);
    activeExecutionByTask.set(taskId, execution.id);
    publishActivity(execution, "Agent Toolkit autorizó la llamada y está preparando Claude Code.");

    void (async () => {
      try {
        const resultValue = await pending.runner.run(pending.preview, {
          signal: execution.controller.signal,
          onActivity(message) {
            if (execution.state === "starting") execution.state = "running";
            publishActivity(execution, message);
          }
        });
        const content = stage === "claude-proposal" ? resultValue : resultValue?.response;
        if (typeof content !== "string" || !content.trim()) throw new Error("Claude no devolvió una entrega válida.");
        const updated = await store.recordStageOutput({ taskId, stage, content });
        execution.state = "completed";
        execution.taskStatus = updated.status;
        execution.currentStage = updated.currentStage;
        execution.outputSha256 = updated.outputs[execution.outputKey]?.sha256 ?? null;
        if (stage === "claude-implementation") {
          execution.filesChanged = resultValue.filesChanged ?? false;
          execution.changedFiles = resultValue.changedFiles ?? [];
          execution.branch = resultValue.branch ?? null;
          execution.baseCommit = resultValue.baseCommit ?? null;
          execution.workspaceVerified = resultValue.workspaceVerified ?? false;
          execution.checksExecuted = false;
        } else {
          execution.filesChanged = false;
          execution.checksExecuted = false;
        }
        publishActivity(execution, "La respuesta de Claude quedó guardada en la tarea.");
      } catch (error) {
        execution.state = execution.controller.signal.aborted ? "cancelled" : "failed";
        execution.error = execution.state === "cancelled"
          ? "Se detuvo la llamada de Claude. Revisa el repositorio por si quedaron cambios parciales antes de volver a intentarlo."
          : error instanceof Error ? error.message : "La llamada de Claude no pudo completarse.";
        const diagnostic = safeExecutionDiagnostic(error?.diagnostic);
        if (diagnostic) execution.diagnostic = diagnostic;
        if (activeExecutionByTask.get(taskId) === execution.id) activeExecutionByTask.delete(taskId);
        publishActivity(execution, `La llamada terminó sin guardar una entrega: ${execution.error}`);
      } finally {
        try { await pending.runner.cleanup?.(pending.preview); } catch {}
        for (const resume of execution.waiters) resume();
        execution.waiters.clear();
      }
    })();
    return execution;
  }

  async function prunePreviews() {
    const threshold = Date.now() - PREVIEW_TTL_MS;
    for (const [id, pending] of previews) {
      if (pending.createdAt < threshold) {
        previews.delete(id);
        await pending.runner.cleanup?.(pending.preview);
      }
    }
    while (previews.size >= MAX_PENDING_PREVIEWS) {
      const [id, pending] = previews.entries().next().value;
      previews.delete(id);
      await pending.runner.cleanup?.(pending.preview);
    }
  }

  async function savePreview(runner, preview, taskId, stage) {
    await prunePreviews();
    if (preview.state !== "ready") {
      await runner.cleanup?.(preview);
      return preview;
    }
    previews.set(preview.previewId, { preview, taskId, stage, runner, createdAt: Date.now() });
    return preview;
  }

  async function takePreview(previewId, confirmationCode, stage) {
    const pending = previews.get(previewId);
    if (!pending || Date.now() - pending.createdAt > PREVIEW_TTL_MS || pending.stage !== stage ||
      pending.preview.confirmationCode !== confirmationCode) {
      if (pending) {
        previews.delete(previewId);
        await pending.runner.cleanup?.(pending.preview);
      }
      throw new Error("La vista previa venció o la confirmación no coincide; prepara otra antes de ejecutar.");
    }
    previews.delete(previewId);
    return pending;
  }

  server.registerTool("start_task", {
    description: "Inicia una tarea compartida entre Codex y Claude Code. No genera un plan ni inicia llamadas. El campo project es una etiqueta, no una ruta de repositorio.",
    inputSchema: TASK_INPUT
  }, args => invoke(() => store.createTask(args)));

  server.registerTool("get_task", {
    description: "Lee la tarea activa de un proyecto o una tarea por su identificador, incluidas las entregas que los clientes CLI guardaron automáticamente.",
    inputSchema: z.object({
      project: z.string().trim().min(1).max(240).optional(),
      taskId: z.string().uuid().optional()
    }).strict().refine(value => Boolean(value.project) !== Boolean(value.taskId), "Indica exactamente project o taskId.")
  }, args => invoke(() => store.getTask(args)));

  server.registerTool("wait_for_task_activity", {
    description: "Espera y devuelve los nuevos hitos visibles de una ejecución de Claude, sin mostrar contenido leído ni razonamiento privado. Si state es starting o running, vuelve a llamar esta herramienta con nextSequence como afterSequence para seguir mostrando actividad hasta que termine. Al fallar, puede incluir un código de salida y una categoría de error permitida, nunca el texto bruto de stderr o la respuesta fallida. Cada espera dura como máximo 15 segundos y no inicia otra llamada al modelo.",
    inputSchema: z.object({
      taskId: z.string().uuid(),
      executionId: z.string().uuid(),
      afterSequence: z.number().int().min(0).optional().default(0),
      waitMs: z.number().int().min(0).max(MAX_ACTIVITY_WAIT_MS).optional().default(MAX_ACTIVITY_WAIT_MS)
    }).strict()
  }, args => invoke(async () => {
    const execution = executions.get(args.executionId);
    if (!execution || execution.taskId !== args.taskId) throw new Error("No se encontró una ejecución activa con esos identificadores.");
    const snapshot = await waitForActivity(execution, args.afterSequence, args.waitMs);
    if (["completed", "failed", "cancelled"].includes(snapshot.state)) {
      const task = await store.getTask({ taskId: args.taskId });
      const output = task.outputs[execution.outputKey];
      return {
        ...snapshot,
        taskStatus: task.status,
        currentStage: task.currentStage,
        ...(output ? { output: output.content, outputSha256: output.sha256 } : {}),
        ...(execution.error ? { error: execution.error } : {}),
        ...(execution.filesChanged !== undefined ? {
          filesChanged: execution.filesChanged,
          changedFiles: execution.changedFiles ?? [],
          branch: execution.branch ?? null,
          baseCommit: execution.baseCommit ?? null,
          workspaceVerified: execution.workspaceVerified ?? false,
          checksExecuted: execution.checksExecuted ?? false
        } : {})
      };
    }
    return { ...snapshot, message: snapshot.events.length ? undefined : "Claude sigue trabajando; aún no reporta una acción nueva." };
  }));

  server.registerTool("cancel_task_execution", {
    description: "Solicita detener una ejecución activa de Claude. No inicia otra llamada ni revierte cambios parciales; tras cancelarla, revisa el estado de los archivos antes de reintentar.",
    inputSchema: z.object({ taskId: z.string().uuid(), executionId: z.string().uuid() }).strict()
  }, args => invoke(async () => {
    const execution = executions.get(args.executionId);
    if (!execution || execution.taskId !== args.taskId) throw new Error("No se encontró una ejecución con esos identificadores.");
    if (!["starting", "running"].includes(execution.state)) {
      return { taskId: args.taskId, executionId: execution.id, state: execution.state, message: "La ejecución ya terminó." };
    }
    execution.state = "cancelling";
    publishActivity(execution, "Se solicitó detener Claude Code; espera la confirmación de cierre del proceso.");
    execution.controller.abort();
    return { taskId: args.taskId, executionId: execution.id, state: execution.state, message: "Se solicitó la cancelación. Usa wait_for_task_activity para confirmar que el proceso terminó." };
  }));

  server.registerTool("preview_codex_plan", {
    description: "Prepara, sin llamar al modelo, una vista previa exacta de Codex CLI para planificar en modo de solo lectura. El plan elegirá un modelo y esfuerzo de Claude entre las opciones permitidas. Muestra la cuenta/sesión detectada, el comando, la ruta del proyecto y el prompt. No llames a run_codex_plan hasta que el usuario haya aprobado directamente esta vista previa.",
    inputSchema: z.object({
      taskId: z.string().uuid(),
      projectRoot: z.string().trim().min(1).max(4096),
      model: z.string().trim().min(1).max(80),
      effort: CODEX_EFFORT,
      claudeModels: z.array(z.string().trim().min(1).max(80)).min(1).max(12).optional(),
      claudeEfforts: z.array(CLAUDE_EFFORT).min(1).max(5).optional()
    }).strict()
  }, args => invoke(async () => {
    const task = await store.getTask({ taskId: args.taskId });
    if (task.status !== "in_progress" || task.currentStage !== "codex-plan") throw new Error("La etapa activa no es la planificación de Codex.");
    const preview = await codexRunner.preview({ ...args, task: task.task });
    return savePreview(codexRunner, preview, task.id, "codex-plan");
  }));

  server.registerTool("run_codex_plan", {
    description: "Ejecuta una vista previa vigente de Codex CLI después de una confirmación interactiva del usuario en el cliente MCP. El diálogo muestra comando, sesión, cuenta, modelo, esfuerzo y prompt. Si el cliente no presenta ese diálogo, la ejecución queda bloqueada. La tarea se guarda automáticamente. No repitas ni reintentes una ejecución fallida.",
    annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
    inputSchema: z.object({
      previewId: z.string().regex(/^[a-f0-9]{32}$/u),
      confirmationCode: z.string().regex(/^[A-F0-9]{8}$/u)
    }).strict()
  }, (args, context) => invoke(async () => {
    const pending = await takePreview(args.previewId, args.confirmationCode, "codex-plan");
    const task = await store.getTask({ taskId: pending.taskId });
    if (task.status !== "in_progress" || task.currentStage !== "codex-plan") {
      await pending.runner.cleanup?.(pending.preview);
      throw new Error("La tarea ya avanzó; prepara una nueva vista previa para la etapa activa.");
    }
    try {
      await requestExecutionApproval(context, pending.preview);
      const plan = await pending.runner.run(pending.preview);
      const updated = await store.recordStageOutput({
        taskId: task.id,
        stage: "codex-plan",
        content: JSON.stringify(plan),
        model: pending.preview.model,
        effort: pending.preview.effort
      });
      return { task: updated, plan, modelAvailabilityVerified: false, checksExecuted: false };
    } finally { await pending.runner.cleanup?.(pending.preview); }
  }));

  server.registerTool("preview_claude_proposal", {
    description: "Prepara una vista previa exacta de Claude Code CLI para contrastar el plan en modo de solo lectura. Usa el modelo y esfuerzo recomendados por el plan de Codex. Muestra el método de autenticación detectado, el comando y el prompt. No llames a run_claude_proposal hasta recibir aprobación directa del usuario.",
    inputSchema: z.object({
      taskId: z.string().uuid(),
      projectRoot: z.string().trim().min(1).max(4096)
    }).strict()
  }, args => invoke(async () => {
    const task = await store.getTask({ taskId: args.taskId });
    if (task.status !== "in_progress" || task.currentStage !== "claude-proposal" || !task.outputs.plan?.content) {
      throw new Error("La etapa activa todavía no tiene un plan de Codex para revisar.");
    }
    let plan;
    try { plan = JSON.parse(task.outputs.plan.content); } catch { throw new Error("El plan guardado no tiene el formato estructurado esperado."); }
    const preview = await claudeRunner.preview({
      task: task.task,
      plan: task.outputs.plan.content,
      projectRoot: args.projectRoot,
      model: plan.claude?.model,
      effort: plan.claude?.effort
    });
    return savePreview(claudeRunner, preview, task.id, "claude-proposal");
  }));

  server.registerTool("run_claude_proposal", {
    description: "Después de confirmar interactivamente la vista previa, inicia Claude Code CLI en segundo plano y devuelve un executionId. No llama al modelo antes de la aprobación. Claude recibe solo lectura; usa wait_for_task_activity con ese id para mostrar acciones y recibir la respuesta guardada. Si el cliente no presenta la confirmación, la ejecución queda bloqueada. No repitas ni reintentes una ejecución fallida.",
    annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
    inputSchema: z.object({
      previewId: z.string().regex(/^[a-f0-9]{32}$/u),
      confirmationCode: z.string().regex(/^[A-F0-9]{8}$/u)
    }).strict()
  }, (args, context) => invoke(async () => {
    const pending = await takePreview(args.previewId, args.confirmationCode, "claude-proposal");
    const task = await store.getTask({ taskId: pending.taskId });
    if (task.status !== "in_progress" || task.currentStage !== "claude-proposal") {
      await pending.runner.cleanup?.(pending.preview);
      throw new Error("La tarea ya avanzó; prepara una nueva vista previa para la etapa activa.");
    }
    let launched = false;
    try {
      await requestExecutionApproval(context, pending.preview);
      const execution = beginClaudeExecution({ taskId: task.id, stage: "claude-proposal", pending });
      launched = true;
      return {
        task,
        executionId: execution.id,
        state: execution.state,
        message: "Claude Code inició en segundo plano. Usa wait_for_task_activity para ver sus acciones y recibir la entrega al terminar.",
        model: pending.preview.model,
        effort: pending.preview.effort
      };
    } finally {
      if (!launched) await pending.runner.cleanup?.(pending.preview);
    }
  }));

  server.registerTool("preview_claude_implementation", {
    description: "Prepara, sin llamar a Claude, una vista previa para la etapa de implementación. En modo tutor Claude devuelve código e instrucciones sin editar; en modo autonomous puede editar solo si start_task activó allowImplementation=true y el usuario aprueba la propuesta vigente. El modo autónomo no tiene shell, MCP ni red y exige una rama limpia distinta de main/master. No llames a run_claude_implementation hasta que el usuario apruebe directamente la vista previa completa.",
    inputSchema: z.object({
      taskId: z.string().uuid(),
      projectRoot: z.string().trim().min(1).max(4096)
    }).strict()
  }, args => invoke(async () => {
    const task = await store.getTask({ taskId: args.taskId });
    const tutorStage = task.task.mode === "tutor" && task.currentStage === "claude-implementation";
    const awaitingApproval = task.currentStage === "awaiting-authorization" && task.authorization.status === "pending";
    const retryAfterApprovedFailure = task.currentStage === "claude-implementation" && task.authorization.status === "approved";
    const autonomousStage = task.task.mode === "autonomous" && task.task.allowImplementation === true &&
      (awaitingApproval || retryAfterApprovedFailure) &&
      (!awaitingApproval || task.authorization.proposalSha256 === task.outputs.proposal?.sha256);
    if (task.status !== "in_progress" || (!tutorStage && !autonomousStage) ||
        !task.outputs.plan?.content || !task.outputs.proposal?.content) {
      throw new Error("Esta tarea no tiene una propuesta vigente y habilitada para implementación autónoma.");
    }
    let plan;
    try { plan = JSON.parse(task.outputs.plan.content); } catch { throw new Error("El plan guardado no tiene el formato estructurado esperado."); }
    const preview = await claudeRunner.previewImplementation({
      task: task.task,
      plan: task.outputs.plan.content,
      proposal: task.outputs.proposal.content,
      proposalSha256: task.authorization.proposalSha256 ?? task.outputs.proposal.sha256,
      projectRoot: args.projectRoot,
      model: plan.claude?.model,
      effort: plan.claude?.effort
    });
    return savePreview(claudeRunner, preview, task.id, "claude-implementation");
  }));

  server.registerTool("run_claude_implementation", {
    description: "Después de confirmar interactivamente la vista previa, inicia Claude Code CLI en segundo plano y devuelve un executionId. No llama al modelo antes de la aprobación. En modo tutor solo devuelve una solución; en modo autonomous puede escribir archivos y la autorización queda ligada a la huella exacta de la propuesta. Usa wait_for_task_activity para mostrar acciones y recibir la entrega guardada; cancel_task_execution la detiene a petición del usuario. La implementación autónoma no tiene shell, MCP ni red. Si el cliente MCP no presenta la confirmación, la ejecución queda bloqueada. No repitas ni reintentes una ejecución fallida.",
    annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
    inputSchema: z.object({
      previewId: z.string().regex(/^[a-f0-9]{32}$/u),
      confirmationCode: z.string().regex(/^[A-F0-9]{8}$/u)
    }).strict()
  }, (args, context) => invoke(async () => {
    const pending = await takePreview(args.previewId, args.confirmationCode, "claude-implementation");
    const task = await store.getTask({ taskId: pending.taskId });
    const tutorStage = task.task.mode === "tutor" && task.currentStage === "claude-implementation";
    const awaitingApproval = task.currentStage === "awaiting-authorization" && task.authorization.status === "pending";
    const retryAfterApprovedFailure = task.currentStage === "claude-implementation" && task.authorization.status === "approved";
    const autonomousStage = task.task.mode === "autonomous" && task.task.allowImplementation === true &&
      (awaitingApproval || retryAfterApprovedFailure) && pending.preview.proposalSha256 === task.authorization.proposalSha256;
    if (task.status !== "in_progress" || (!tutorStage && !autonomousStage) ||
        pending.preview.proposalSha256 !== task.outputs.proposal?.sha256) {
      await pending.runner.cleanup?.(pending.preview);
      throw new Error("La propuesta o la autorización cambió; prepara una nueva vista previa de la etapa pendiente.");
    }
    let launched = false;
    try {
      await requestExecutionApproval(context, pending.preview);
      if (!tutorStage && awaitingApproval) await store.authorizeImplementation({ taskId: task.id, proposalSha256: pending.preview.proposalSha256 });
      const execution = beginClaudeExecution({ taskId: task.id, stage: "claude-implementation", pending });
      launched = true;
      return {
        task: !tutorStage && awaitingApproval ? await store.getTask({ taskId: task.id }) : task,
        executionId: execution.id,
        state: execution.state,
        message: "Claude Code inició en segundo plano. Usa wait_for_task_activity para ver sus acciones y recibir la entrega al terminar.",
        model: pending.preview.model,
        effort: pending.preview.effort
      };
    } finally {
      if (!launched) await pending.runner.cleanup?.(pending.preview);
    }
  }));

  server.registerTool("preview_codex_review", {
    description: "Prepara, sin llamar al modelo, la vista previa de revisión final de Codex sobre el repositorio y las tres entregas guardadas. Requiere allowFinalReview=true al iniciar la tarea y la etapa codex-review. Reutiliza el modelo y esfuerzo de la planificación, salvo que indiques juntos otros valores. Muestra la sesión, modelo, esfuerzo, comando y prompt. No llames a run_codex_review hasta la aprobación directa del usuario.",
    inputSchema: z.object({
      taskId: z.string().uuid(),
      projectRoot: z.string().trim().min(1).max(4096),
      model: z.string().trim().min(1).max(80).optional(),
      effort: CODEX_EFFORT.optional()
    }).strict().refine(value => Boolean(value.model) === Boolean(value.effort), "Indica juntos model y effort o déjalos ambos vacíos para reutilizar la selección de la planificación.")
  }, args => invoke(async () => {
    const task = await store.getTask({ taskId: args.taskId });
    if (task.status !== "in_progress" || task.currentStage !== "codex-review" ||
        task.task.mode !== "autonomous" || task.task.allowFinalReview !== true ||
        !task.outputs.plan?.content || !task.outputs.proposal?.content || !task.outputs.implementation?.content) {
      throw new Error("La tarea no está habilitada o no tiene una implementación para la revisión final de Codex.");
    }
    const model = args.model ?? task.outputs.plan.model;
    const effort = args.effort ?? task.outputs.plan.effort;
    if (!model || !effort) throw new Error("La planificación no guardó modelo y esfuerzo de Codex; indícalos explícitamente para la revisión final.");
    const preview = await codexRunner.previewReview({
      task: task.task,
      plan: task.outputs.plan.content,
      proposal: task.outputs.proposal.content,
      implementation: task.outputs.implementation.content,
      projectRoot: args.projectRoot,
      model,
      effort
    });
    return savePreview(codexRunner, preview, task.id, "codex-review");
  }));

  server.registerTool("run_codex_review", {
    description: "Ejecuta una vista previa vigente de Codex CLI después de la confirmación interactiva del usuario. Codex revisa en sandbox de solo lectura y guarda su dictamen; no modifica archivos ni afirma pruebas no verificadas. No repitas ni reintentes una ejecución fallida.",
    annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
    inputSchema: z.object({
      previewId: z.string().regex(/^[a-f0-9]{32}$/u),
      confirmationCode: z.string().regex(/^[A-F0-9]{8}$/u)
    }).strict()
  }, (args, context) => invoke(async () => {
    const pending = await takePreview(args.previewId, args.confirmationCode, "codex-review");
    const task = await store.getTask({ taskId: pending.taskId });
    if (task.status !== "in_progress" || task.currentStage !== "codex-review" || task.task.allowFinalReview !== true) {
      await pending.runner.cleanup?.(pending.preview);
      throw new Error("La tarea ya avanzó o no habilita la revisión final; prepara otra vista previa de la etapa activa.");
    }
    try {
      await requestExecutionApproval(context, pending.preview);
      const review = await pending.runner.run(pending.preview);
      const updated = await store.recordStageOutput({ taskId: task.id, stage: "codex-review", content: review });
      return { task: updated, review, modelAvailabilityVerified: false, filesChanged: false, checksExecuted: false };
    } finally { await pending.runner.cleanup?.(pending.preview); }
  }));

}

export function createTaskWorkflowMcp({
  store = createTaskWorkflowStore(),
  codexRunner = createCodexCliRunner(),
  claudeRunner = createClaudeCodeRunner()
} = {}) {
  const server = new McpServer({
    name: "agent-toolkit",
    version: "0.1.0",
    instructions: "Agent Toolkit coordina Codex CLI y Claude Code CLI mediante vistas previas de un solo uso. Las tareas tutor usan Claude para devolver una solución sin editar. Las tareas autonomous solo habilitan la implementación de Claude y la revisión final de Codex si allowImplementation y allowFinalReview se activaron al crearla; ambos están desactivados por defecto. Codex planifica en modo de solo lectura y elige modelo/esfuerzo de Claude entre valores permitidos. Claude contrasta el plan en modo de solo lectura. Después de revisar su propuesta, el usuario puede autorizar por separado la implementación; esa llamada puede editar archivos únicamente en una rama de trabajo limpia, con herramientas Read, Glob, Grep, Edit y Write, sin shell, red ni MCP. Codex revisa el resultado en modo read-only. Antes de cada llamada, solicita aprobación interactiva y muestra comando, cuenta/sesión, modelo, esfuerzo, permisos y prompt. Las llamadas a Claude devuelven un identificador y corren en segundo plano; después llama wait_for_task_activity para mostrar acciones sanitizadas hasta que termine. Si el usuario pide detener la ejecución, usa cancel_task_execution y luego confirma el cierre con wait_for_task_activity; si era una escritura, pídele inspeccionar posibles cambios parciales. Si el cliente no ofrece confirmación, la llamada queda bloqueada. No inventes cuentas, disponibilidad, pruebas o resultados; nunca hagas commits ni pushes."
  });
  registerTools(server, store, codexRunner, claudeRunner);
  return server;
}
