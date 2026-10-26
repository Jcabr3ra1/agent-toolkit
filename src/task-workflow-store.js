import { randomUUID, createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const TASK_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const MAX_TASK_FILE_BYTES = 160_000;
const MAX_OUTPUT_LENGTH = 32_000;
const CODEX_EFFORTS = new Set(["low", "medium", "high", "xhigh", "max", "ultra"]);
const ALLOWED_STAGES = new Set([
  "codex-plan",
  "claude-proposal",
  "claude-implementation",
  "codex-review"
]);
const LOCK_TIMEOUT_MS = 5_000;
const STALE_LOCK_MS = 60_000;

function validText(value, limit, required = false) {
  return typeof value === "string" && value.length <= limit && (!required || value.trim().length > 0) &&
    !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u.test(value);
}

function taskFile(root, taskId) {
  if (typeof taskId !== "string" || !TASK_ID_PATTERN.test(taskId)) throw new Error("El identificador de tarea no es válido.");
  return path.join(root, `${taskId}.json`);
}

function nextStageAfter(stage, task) {
  if (stage === "codex-plan") return "claude-proposal";
  if (stage === "claude-proposal") {
    if (task.mode === "autonomous") return task.allowImplementation ? "awaiting-authorization" : "completed";
    return "claude-implementation";
  }
  if (stage === "claude-implementation") return task.allowFinalReview ? "codex-review" : "completed";
  return "completed";
}

async function ensureRoot(root) {
  await fs.mkdir(root, { recursive: true, mode: 0o700 });
  const stat = await fs.lstat(root);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("El directorio local de tareas no es seguro.");
  await fs.chmod(root, 0o700);
}

async function readTaskFile(root, taskId) {
  const filename = taskFile(root, taskId);
  let stat;
  try {
    stat = await fs.lstat(filename);
  } catch (error) {
    if (error.code === "ENOENT") throw new Error("No se encontró esa tarea.");
    throw error;
  }
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_TASK_FILE_BYTES) {
    throw new Error("El registro local de la tarea no es válido.");
  }
  let task;
  try {
    task = JSON.parse(await fs.readFile(filename, "utf8"));
  } catch {
    throw new Error("El registro local de la tarea no se puede leer.");
  }
  if (task?.schemaVersion !== 1 || task.id !== taskId || !task.task || !task.outputs || !task.authorization) {
    throw new Error("El registro local de la tarea no es válido.");
  }
  return task;
}

async function writeTask(root, task) {
  const filename = taskFile(root, task.id);
  const temporary = path.join(root, `.${task.id}.${process.pid}.${randomUUID()}.tmp`);
  const content = JSON.stringify(task, null, 2);
  if (Buffer.byteLength(content, "utf8") > MAX_TASK_FILE_BYTES) throw new Error("La tarea supera el límite de almacenamiento local.");
  let file;
  try {
    file = await fs.open(temporary, "wx", 0o600);
    await file.writeFile(content, "utf8");
    await file.sync();
    await file.close();
    file = undefined;
    await fs.rename(temporary, filename);
    await fs.chmod(filename, 0o600);
  } catch (error) {
    if (file) await file.close().catch(() => {});
    await fs.unlink(temporary).catch(() => {});
    throw error;
  }
}

async function withTaskLock(root, taskId, operation) {
  const lockPath = path.join(root, `.${taskId}.lock`);
  const deadline = Date.now() + LOCK_TIMEOUT_MS;
  let lock;
  while (!lock) {
    try {
      lock = await fs.open(lockPath, "wx", 0o600);
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      try {
        const stat = await fs.lstat(lockPath);
        if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("El bloqueo local de la tarea no es válido.");
        if (Date.now() - stat.mtimeMs > STALE_LOCK_MS) {
          await fs.unlink(lockPath);
          continue;
        }
      } catch (statError) {
        if (statError.code === "ENOENT") continue;
        throw statError;
      }
      if (Date.now() >= deadline) throw new Error("La tarea está ocupada en otra sesión; inténtalo de nuevo.");
      await new Promise(resolve => setTimeout(resolve, 25));
    }
  }
  try {
    return await operation();
  } finally {
    await lock.close().catch(() => {});
    await fs.unlink(lockPath).catch(() => {});
  }
}

function validateTask(input) {
  if (!input || typeof input !== "object" || Array.isArray(input) ||
    !validText(input.title, 180, true) || !validText(input.project, 240, true) ||
    !validText(input.objective, 4_000, true) || !["tutor", "autonomous"].includes(input.mode) ||
    !validText(input.scope ?? "", 4_000) || !validText(input.acceptance ?? "", 4_000) ||
    !validText(input.checks ?? "", 2_000) ||
    (input.allowImplementation !== undefined && typeof input.allowImplementation !== "boolean") ||
    (input.allowFinalReview !== undefined && typeof input.allowFinalReview !== "boolean")) {
    throw new Error("Los datos de la tarea no son válidos.");
  }
  const allowImplementation = input.mode === "autonomous" && input.allowImplementation === true;
  const allowFinalReview = input.mode === "autonomous" && input.allowFinalReview === true;
  if (allowFinalReview && !allowImplementation) throw new Error("La revisión final de Codex requiere habilitar la implementación autónoma.");
  return {
    title: input.title.trim(),
    project: input.project.trim(),
    objective: input.objective.trim(),
    mode: input.mode,
    allowImplementation,
    allowFinalReview,
    scope: (input.scope ?? "").trim(),
    acceptance: (input.acceptance ?? "").trim(),
    checks: (input.checks ?? "").trim()
  };
}

export function createTaskWorkflowStore({ root } = {}) {
  const storeRoot = path.resolve(root ?? process.env.AGENT_TOOLKIT_WORKFLOW_DIR ?? path.join(os.homedir(), ".agent-toolkit", "workflows"));

  async function createTask(input) {
    const task = validateTask(input);
    await ensureRoot(storeRoot);
    const now = new Date().toISOString();
    const record = {
      schemaVersion: 1,
      id: randomUUID(),
      task,
      status: "in_progress",
      currentStage: "codex-plan",
      authorization: {
        status: task.mode === "autonomous" && task.allowImplementation ? "pending" : "not_required",
        proposalSha256: null,
        approvedAt: null
      },
      outputs: { plan: null, proposal: null, implementation: null, review: null },
      createdAt: now,
      updatedAt: now
    };
    await writeTask(storeRoot, record);
    return record;
  }

  async function getTask({ taskId, project } = {}) {
    await ensureRoot(storeRoot);
    if (taskId) return readTaskFile(storeRoot, taskId);
    if (!validText(project, 240, true)) throw new Error("Indica el proyecto o el identificador de tarea.");
    const files = (await fs.readdir(storeRoot)).filter(name => TASK_ID_PATTERN.test(name.replace(/\.json$/u, "")) && name.endsWith(".json"));
    const matches = [];
    for (const filename of files) {
      const id = filename.slice(0, -5);
      const task = await readTaskFile(storeRoot, id);
      if (task.status === "in_progress" && task.task.project === project.trim()) matches.push(task);
    }
    if (matches.length === 0) throw new Error("No hay una tarea activa para ese proyecto.");
    if (matches.length > 1) throw new Error("Hay varias tareas activas para ese proyecto; indica el identificador de la tarea.");
    return matches[0];
  }

  async function recordStageOutput({ taskId, stage, content, model, effort }) {
    if (!validText(content, MAX_OUTPUT_LENGTH, true)) throw new Error("La respuesta no es válida o supera el límite permitido.");
    if ((model === undefined) !== (effort === undefined) ||
        (model !== undefined && (typeof model !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/u.test(model) || !CODEX_EFFORTS.has(effort))) ||
        (stage !== "codex-plan" && (model !== undefined || effort !== undefined))) {
      throw new Error("Los datos de modelo y esfuerzo de la entrega no son válidos.");
    }
    await ensureRoot(storeRoot);
    return withTaskLock(storeRoot, taskId, async () => {
      const task = await readTaskFile(storeRoot, taskId);
      if (stage === "claude-implementation" && task.task.mode === "autonomous" &&
        (!task.task.allowImplementation || task.authorization.status !== "approved")) {
        throw new Error("La implementación autónoma necesita autorización explícita para la propuesta vigente.");
      }
      if (task.status !== "in_progress" || task.currentStage !== stage || !ALLOWED_STAGES.has(stage)) {
        throw new Error("Esa etapa no es la siguiente pendiente para esta tarea.");
      }
      const outputKey = {
        "codex-plan": "plan",
        "claude-proposal": "proposal",
        "claude-implementation": "implementation",
        "codex-review": "review"
      }[stage];
      const sha256 = createHash("sha256").update(content, "utf8").digest("hex");
      task.outputs[outputKey] = {
        content,
        sha256,
        savedAt: new Date().toISOString(),
        ...(model !== undefined ? { model, effort } : {})
      };
      task.currentStage = nextStageAfter(stage, task.task);
      if (task.currentStage === "awaiting-authorization") {
        task.authorization.proposalSha256 = sha256;
      }
      if (task.currentStage === "completed") task.status = "completed";
      task.updatedAt = new Date().toISOString();
      await writeTask(storeRoot, task);
      return task;
    });
  }

  async function authorizeImplementation({ taskId, proposalSha256 }) {
    if (typeof proposalSha256 !== "string" || !/^[0-9a-f]{64}$/u.test(proposalSha256)) {
      throw new Error("La huella de la propuesta no es válida.");
    }
    await ensureRoot(storeRoot);
    return withTaskLock(storeRoot, taskId, async () => {
      const task = await readTaskFile(storeRoot, taskId);
      if (task.task.mode !== "autonomous" || task.task.allowImplementation !== true ||
        task.currentStage !== "awaiting-authorization" ||
        task.authorization.proposalSha256 !== proposalSha256 || task.outputs.proposal?.sha256 !== proposalSha256) {
        throw new Error("No se puede autorizar: la propuesta no coincide con la etapa pendiente.");
      }
      task.authorization.status = "approved";
      task.authorization.approvedAt = new Date().toISOString();
      task.currentStage = "claude-implementation";
      task.updatedAt = new Date().toISOString();
      await writeTask(storeRoot, task);
      return task;
    });
  }

  return Object.freeze({ createTask, getTask, recordStageOutput, authorizeImplementation });
}
