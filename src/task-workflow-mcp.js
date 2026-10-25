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
const CLAUDE_EFFORT = z.enum(["low", "medium", "high", "xhigh", "max"]);
const CODEX_EFFORT = z.enum(["minimal", "low", "medium", "high", "xhigh"]);

function registerTools(server, store, codexRunner, claudeRunner) {
  const previews = new Map();

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
    description: "Ejecuta una vista previa vigente de Claude Code CLI después de una confirmación interactiva del usuario en el cliente MCP. El diálogo muestra comando, sesión, cuenta, modelo, esfuerzo y prompt. Si el cliente no presenta ese diálogo, la ejecución queda bloqueada. Claude recibe acceso de solo lectura; su respuesta vuelve a la tarea sin copiar y pegar. No repitas ni reintentes una ejecución fallida.",
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
    try {
      await requestExecutionApproval(context, pending.preview);
      const proposal = await pending.runner.run(pending.preview);
      const updated = await store.recordStageOutput({ taskId: task.id, stage: "claude-proposal", content: proposal });
      return { task: updated, proposal, modelAvailabilityVerified: false, filesChanged: false, checksExecuted: false };
    } finally { await pending.runner.cleanup?.(pending.preview); }
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
    description: "Ejecuta una vista previa vigente de Claude Code CLI después de la confirmación interactiva del usuario. En modo tutor solo devuelve una solución; en modo autonomous puede escribir archivos y la autorización queda ligada a la huella exacta de la propuesta. La implementación autónoma no tiene shell, MCP ni red. Si el cliente MCP no presenta la confirmación, la ejecución queda bloqueada. No repitas ni reintentes una ejecución fallida.",
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
    try {
      await requestExecutionApproval(context, pending.preview);
      if (!tutorStage && awaitingApproval) await store.authorizeImplementation({ taskId: task.id, proposalSha256: pending.preview.proposalSha256 });
      const implementation = await pending.runner.run(pending.preview);
      if (!implementation || typeof implementation.response !== "string") throw new Error("Claude no devolvió una entrega válida; inspecciona el repositorio antes de decidir el siguiente paso.");
      const updated = await store.recordStageOutput({ taskId: task.id, stage: "claude-implementation", content: implementation.response });
      return {
        task: updated,
        implementation: implementation.response,
        filesChanged: implementation.filesChanged ?? false,
        changedFiles: implementation.changedFiles ?? [],
        branch: implementation.branch ?? null,
        baseCommit: implementation.baseCommit ?? null,
        workspaceVerified: implementation.workspaceVerified ?? false,
        checksExecuted: false
      };
    } finally { await pending.runner.cleanup?.(pending.preview); }
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
    instructions: "Agent Toolkit coordina Codex CLI y Claude Code CLI mediante vistas previas de un solo uso. Las tareas tutor usan Claude para devolver una solución sin editar. Las tareas autonomous solo habilitan la implementación de Claude y la revisión final de Codex si allowImplementation y allowFinalReview se activaron al crearla; ambos están desactivados por defecto. Codex planifica en modo de solo lectura y elige modelo/esfuerzo de Claude entre valores permitidos. Claude contrasta el plan en modo de solo lectura. Después de revisar su propuesta, el usuario puede autorizar por separado la implementación; esa llamada puede editar archivos únicamente en una rama de trabajo limpia, con herramientas Read, Glob, Grep, Edit y Write, sin shell, red ni MCP. Codex revisa el resultado en modo read-only. Antes de cada llamada, solicita aprobación interactiva y muestra comando, cuenta/sesión, modelo, esfuerzo, permisos y prompt. Si el cliente no ofrece confirmación, la llamada queda bloqueada. No inventes cuentas, disponibilidad, pruebas o resultados; nunca hagas commits ni pushes."
  });
  registerTools(server, store, codexRunner, claudeRunner);
  return server;
}
