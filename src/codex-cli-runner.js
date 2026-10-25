import { randomBytes, createHash } from "node:crypto";
import { spawn as nodeSpawn, spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PLAN_SCHEMA = fileURLToPath(new URL("../schemas/task-workflow-plan-output.schema.json", import.meta.url));
const MAX_PROMPT_BYTES = 48_000;
const MAX_OUTPUT_BYTES = 32_000;
const RUN_TIMEOUT_MS = 180_000;
const CODEX_EFFORTS = new Set(["minimal", "low", "medium", "high", "xhigh"]);
const CLAUDE_EFFORTS = new Set(["low", "medium", "high", "xhigh", "max"]);
const CONTROL_PATTERN = /[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u;

const fail = code => { throw Object.assign(new Error("La invocación local de Codex no se pudo preparar."), { code }); };

function safeText(value, limit, required = false) {
  return typeof value === "string" && value.length <= limit && (!required || value.trim().length > 0) &&
    !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u.test(value);
}

function safePath(value, limit = 4096) {
  return typeof value === "string" && value.length <= limit && !CONTROL_PATTERN.test(value);
}

function validateModel(value) {
  if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/u.test(value)) fail("codex-model-invalid");
  return value;
}

function validateEffort(value) {
  if (!CODEX_EFFORTS.has(value)) fail("codex-effort-invalid");
  return value;
}

function filteredEnvironment(source, executable) {
  const env = {};
  for (const key of ["HOME", "TMPDIR", "LANG", "LC_ALL", "CODEX_HOME"]) {
    const value = source[key];
    if (typeof value === "string" && value.length > 0 && !/[\u0000-\u001f\u007f]/u.test(value)) env[key] = value;
  }
  const systemPath = process.platform === "darwin" ? "/usr/bin:/bin:/usr/sbin:/sbin" : "/usr/bin:/bin";
  env.PATH = [...new Set([path.dirname(executable), ...systemPath.split(path.delimiter)])].join(path.delimiter);
  env.NO_COLOR = "1";
  return env;
}

async function resolveExecutable(override, io) {
  if (override) {
    const absolute = path.resolve(override);
    let stat;
    try { stat = await io.stat(absolute); } catch { fail("codex-client-not-found"); }
    if (!stat.isFile() || !(stat.mode & 0o111)) fail("codex-client-not-found");
    return absolute;
  }
  for (const directory of (process.env.PATH ?? "").split(path.delimiter)) {
    if (!directory || !path.isAbsolute(directory)) continue;
    const candidate = path.join(directory, "codex");
    try {
      const real = await io.realpath(candidate);
      const stat = await io.stat(real);
      if (stat.isFile() && (stat.mode & 0o111) && !(stat.mode & 0o022)) return real;
    } catch {}
  }
  fail("codex-client-not-found");
}

async function validateProjectRoot(value, io, home) {
  if (!safePath(value) || !value || !path.isAbsolute(value) || path.normalize(value) !== value) fail("codex-project-root-invalid");
  let real;
  let realHome;
  let stat;
  try { real = await io.realpath(value); realHome = await io.realpath(home); stat = await io.lstat(real); } catch { fail("codex-project-root-invalid"); }
  if (real === path.parse(real).root || real === realHome || real === path.join(realHome, ".codex") ||
      real === path.join(realHome, ".claude") || !stat.isDirectory() || stat.isSymbolicLink() ||
      (typeof process.getuid === "function" && stat.uid !== process.getuid()) || (stat.mode & 0o022)) fail("codex-project-root-invalid");
  return real;
}

function planPrompt({ task, modelCandidates, claudeEfforts }) {
  const prompt = [
    "Genera un plan verificable para esta tarea. Inspecciona el repositorio solo en modo de lectura. No edites archivos ni ejecutes comandos que cambien datos.",
    "Devuelve únicamente el JSON exigido por el esquema de salida. Elige el modelo Claude más adecuado entre los candidatos permitidos y el esfuerzo entre los valores permitidos; no inventes disponibilidad ni afirmes que ejecutaste comprobaciones.",
    "En `files`, enumera las rutas relativas concretas que Claude necesitaría editar o inspeccionar. Estas rutas son una propuesta, no una autorización para escribir.",
    "Responde en español dentro de los campos de texto.",
    "",
    "## Tarea",
    `Título: ${task.title}`,
    `Proyecto: ${task.project}`,
    `Modo: ${task.mode}`,
    `Objetivo:\n${task.objective}`,
    task.scope ? `Alcance declarado:\n${task.scope}` : "",
    task.acceptance ? `Criterios declarados:\n${task.acceptance}` : "",
    task.checks ? `Comprobaciones requeridas (no ejecutar):\n${task.checks}` : "",
    "",
    `Modelos Claude permitidos para la recomendación: ${modelCandidates.join(", ")}`,
    `Esfuerzos permitidos para la recomendación: ${claudeEfforts.join(", ")}`
  ].filter(Boolean).join("\n");
  if (Buffer.byteLength(prompt, "utf8") > MAX_PROMPT_BYTES) fail("codex-prompt-limit");
  return prompt;
}

function reviewPrompt({ task, plan, proposal, implementation }) {
  const prompt = [
    "Eres el revisor final de una tarea de Agent Toolkit.",
    "Revisa el cambio real del repositorio después de la implementación de Claude. Usa herramientas de solo lectura y compara el código con el plan, la propuesta aprobada y los criterios de aceptación.",
    "No edites archivos, no crees ni borres datos, no hagas commits ni pushes, y no ejecutes comandos que escriban en el proyecto. No afirmes que corriste pruebas; indica como no ejecutadas las comprobaciones que no puedas confirmar con evidencia.",
    "Devuelve hallazgos concretos primero, con severidad, ruta y ubicación cuando sea posible. Distingue hallazgos confirmados de preguntas o riesgos. Si no encuentras hallazgos, dilo y enumera los límites de la revisión.",
    "Responde en español.",
    "",
    "## Tarea y permisos",
    `Título: ${task.title}`,
    `Proyecto: ${task.project}`,
    `Objetivo:\n${task.objective}`,
    task.scope ? `Alcance:\n${task.scope}` : "",
    task.acceptance ? `Criterios de aceptación:\n${task.acceptance}` : "",
    task.checks ? `Comprobaciones previstas (no ejecutar):\n${task.checks}` : "",
    "",
    "## Plan original de Codex",
    plan,
    "",
    "## Propuesta aprobada de Claude",
    proposal,
    "",
    "## Entrega de implementación de Claude",
    implementation,
    "",
    "Inspecciona el estado actual del repositorio y sus diferencias. No tomes las afirmaciones del implementador como evidencia; verifica el código presente en disco."
  ].filter(Boolean).join("\n");
  if (Buffer.byteLength(prompt, "utf8") > MAX_PROMPT_BYTES) fail("codex-prompt-limit");
  return prompt;
}

function codexArgs({ model, effort, cwd, outputFile, schema = PLAN_SCHEMA }) {
  const args = [
    "exec",
    "--sandbox", "read-only",
    "--ephemeral",
    "--ignore-user-config",
    "--config", 'approval_policy="never"',
    "--cd", cwd,
    "--model", model,
    "--config", `model_reasoning_effort=${effort}`
  ];
  if (schema) args.push("--output-schema", schema);
  args.push("--output-last-message", outputFile, "-");
  return args;
}

function accountSummary(auth) {
  return auth === "chatgpt"
    ? "Usaría la sesión de ChatGPT detectada por Codex CLI. La identidad, el plan y la cuota exactos no están expuestos al Toolkit."
    : auth === "api-key"
      ? "Codex CLI informa una sesión de API key; esta etapa está bloqueada para evitar consumo de API no autorizado."
      : "Codex CLI no informa una sesión autenticada con ChatGPT; no se ejecutará el modelo.";
}

function terminate(child, signal) {
  if (!child?.pid) return;
  try {
    if (process.platform !== "win32") process.kill(-child.pid, signal);
    else child.kill(signal);
  } catch (error) {
    if (error.code !== "ESRCH") child.kill(signal);
  }
}

function runBounded({ executable, args, cwd, prompt, env, spawn = nodeSpawn, timeoutMs = RUN_TIMEOUT_MS }) {
  return new Promise((resolve, rejectPromise) => {
    let child;
    let settled = false;
    let failure = null;
    let stdoutBytes = 0;
    const stdout = [];
    let timer;
    let killTimer;
    const failRun = error => {
      if (settled || failure) return;
      failure = error;
      terminate(child, "SIGTERM");
      killTimer = setTimeout(() => terminate(child, "SIGKILL"), 1_000);
      killTimer.unref?.();
    };
    try {
      child = spawn(executable, args, {
        cwd, env, shell: false, detached: process.platform !== "win32",
        stdio: ["pipe", "pipe", "pipe"]
      });
    } catch { rejectPromise(new Error("No se pudo iniciar Codex CLI.")); return; }
    timer = setTimeout(() => failRun(new Error("La invocación de Codex superó el límite de tiempo.")), timeoutMs);
    timer.unref?.();
    child.stdout.on("data", chunk => {
      stdoutBytes += chunk.length;
      if (stdoutBytes > MAX_OUTPUT_BYTES) { failRun(new Error("La salida de Codex superó el límite permitido.")); return; }
      stdout.push(chunk);
    });
    child.stderr.on("data", () => {});
    child.stdin.on("error", () => failRun(new Error("No se pudo enviar el encargo a Codex.")));
    child.on("error", () => failRun(new Error("No se pudo iniciar Codex CLI.")));
    child.on("close", (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearTimeout(killTimer);
      if (failure) { rejectPromise(failure); return; }
      if (code !== 0 || signal) { rejectPromise(new Error("Codex no terminó correctamente; no se guardó un plan.")); return; }
      resolve(Buffer.concat(stdout).toString("utf8"));
    });
    child.stdin.end(prompt, "utf8");
  });
}

function validatePlanOutput(raw, claudeModels, claudeEfforts) {
  let plan;
  try { plan = JSON.parse(raw); } catch { fail("codex-plan-invalid-json"); }
  if (!plan || typeof plan !== "object" || Array.isArray(plan) ||
      !safeText(plan.summary, 4_000, true) || !safeText(plan.claude?.model, 80, true) ||
        !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/u.test(plan.claude.model) || !CLAUDE_EFFORTS.has(plan.claude.effort) ||
      !claudeModels.includes(plan.claude.model) || !claudeEfforts.includes(plan.claude.effort) ||
      !Array.isArray(plan.files) || plan.files.length > 64 ||
      plan.files.some(file => !file || typeof file !== "object" || !safePath(file.path, 512) || !file.path || !safeText(file.reason, 1_000, true) ||
        path.posix.isAbsolute(file.path) || file.path.includes("\\") || file.path.split("/").some(part => part === "" || part === "." || part === "..") ||
        /(?:^|\/)(?:\.git|\.claude|\.codex|\.agents|\.ssh|\.aws)(?:\/|$)/iu.test(file.path) || !["inspect", "modify", "create"].includes(file.action)) ||
      !Array.isArray(plan.acceptance) || plan.acceptance.length > 32 || plan.acceptance.some(item => !safeText(item, 1_000, true)) ||
      !Array.isArray(plan.checks) || plan.checks.length > 32 || plan.checks.some(item => !safeText(item, 1_000, true))) fail("codex-plan-invalid");
  return plan;
}

export function createCodexCliRunner(dependencies = {}) {
  const io = dependencies.fileIo ?? fs;
  const sourceEnv = dependencies.env ?? process.env;
  const home = dependencies.home ?? os.homedir();
  const spawn = dependencies.spawn ?? nodeSpawn;
  const runSync = dependencies.runSync ?? ((executable, args, env) => spawnSync(executable, args, {
    encoding: "utf8", timeout: 5_000, maxBuffer: 16_384, shell: false,
    stdio: ["ignore", "pipe", "pipe"], env
  }));

  async function inspectClient(executable) {
    const env = filteredEnvironment(sourceEnv, executable);
    let versionResult;
    let authResult;
    try {
      versionResult = runSync(executable, ["--version"], env);
      authResult = runSync(executable, ["login", "status"], env);
    } catch { fail("codex-client-preflight-failed"); }
    if (versionResult?.error || versionResult?.status !== 0 || typeof versionResult.stdout !== "string" ||
        authResult?.error || ![0, 1].includes(authResult?.status) || typeof authResult.stdout !== "string" ||
        typeof authResult.stderr !== "string" ||
        Buffer.byteLength(versionResult.stdout) + Buffer.byteLength(versionResult.stderr ?? "") +
        Buffer.byteLength(authResult.stdout) + Buffer.byteLength(authResult.stderr) > 16_384) fail("codex-client-preflight-failed");
    const versionMatch = /(?:codex(?:-cli)?\s+)(\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?)/iu.exec(versionResult.stdout.trim());
    if (!versionMatch) fail("codex-client-version-unknown");
    const status = [authResult.stdout, authResult.stderr].map(output => output.trim()).filter(Boolean).join("\n");
    const auth = status === "Logged in using ChatGPT" ? "chatgpt" :
      status === "Logged in using API key" ? "api-key" : "none";
    return { version: versionMatch[1], auth, env };
  }

  async function createPreview({ projectRoot, model, effort, prompt, kind, claudeModels, claudeEfforts }) {
    const cwd = await validateProjectRoot(projectRoot, io, home);
    const executable = await resolveExecutable(dependencies.codexPath, io);
    const client = await inspectClient(executable);
    let scratch;
    try {
      scratch = await io.mkdtemp(path.join(os.tmpdir(), `agent-toolkit-codex-${kind}-`));
      await io.chmod(scratch, 0o700);
    } catch { fail("codex-temporary-output-unavailable"); }
    const outputFile = path.join(scratch, kind === "plan" ? "plan.json" : "review.txt");
    const args = codexArgs({ model, effort, cwd, outputFile, schema: kind === "plan" ? PLAN_SCHEMA : null });
    return Object.freeze({
      previewId: randomBytes(16).toString("hex"),
      confirmationCode: randomBytes(4).toString("hex").toUpperCase(),
      state: client.auth === "chatgpt" ? "ready" : "blocked",
      kind: `codex-${kind}`,
      client: "Codex CLI",
      version: client.version,
      account: accountSummary(client.auth),
      authMethod: client.auth,
      model,
      effort,
      modelAvailabilityVerified: false,
      ...(claudeModels ? { claudeModels: [...claudeModels], claudeEfforts: [...claudeEfforts] } : {}),
      command: { executable, args, cwd, shell: false, stdin: prompt, outputFile },
      promptSha256: createHash("sha256").update(prompt, "utf8").digest("hex"),
      promptBytes: Buffer.byteLength(prompt, "utf8"),
      limits: { timeoutMs: RUN_TIMEOUT_MS, outputBytes: MAX_OUTPUT_BYTES, readOnly: true, projectWrite: false }
    });
  }

  async function preview({ projectRoot, task, model, effort, claudeModels = ["sonnet", "opus", "haiku"], claudeEfforts = ["low", "medium", "high", "xhigh", "max"] }) {
    if (!task || !safeText(task.title, 180, true) || !safeText(task.project, 240, true) || !safeText(task.objective, 4_000, true) ||
        !["tutor", "autonomous"].includes(task.mode) || !safeText(task.scope ?? "", 4_000) ||
        !safeText(task.acceptance ?? "", 4_000) || !safeText(task.checks ?? "", 2_000)) fail("codex-task-invalid");
    model = validateModel(model);
    effort = validateEffort(effort);
    if (!Array.isArray(claudeModels) || claudeModels.length < 1 || claudeModels.length > 12 ||
        claudeModels.some(value => typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/u.test(value)) ||
        !Array.isArray(claudeEfforts) || claudeEfforts.length < 1 || claudeEfforts.length > 5 || claudeEfforts.some(value => !CLAUDE_EFFORTS.has(value))) {
      fail("codex-claude-options-invalid");
    }
    const prompt = planPrompt({ task, modelCandidates: claudeModels, claudeEfforts });
    return createPreview({ projectRoot, model, effort, prompt, kind: "plan", claudeModels, claudeEfforts });
  }

  async function previewReview({ projectRoot, task, plan, proposal, implementation, model, effort }) {
    if (!task || task.mode !== "autonomous" || task.allowFinalReview !== true ||
        !safeText(task.title, 180, true) || !safeText(task.project, 240, true) || !safeText(task.objective, 4_000, true) ||
        !safeText(task.scope ?? "", 4_000) || !safeText(task.acceptance ?? "", 4_000) || !safeText(task.checks ?? "", 2_000) ||
        !safeText(plan, 32_000, true) || !safeText(proposal, 32_000, true) || !safeText(implementation, 32_000, true)) {
      fail("codex-review-input-invalid");
    }
    model = validateModel(model);
    effort = validateEffort(effort);
    const prompt = reviewPrompt({ task, plan, proposal, implementation });
    return createPreview({ projectRoot, model, effort, prompt, kind: "review" });
  }

  async function run(preview) {
    if (!preview || preview.client !== "Codex CLI" || preview.state !== "ready" ||
        typeof preview.command?.executable !== "string" || !Array.isArray(preview.command.args) ||
        !["codex-plan", "codex-review"].includes(preview.kind) ||
        typeof preview.command.cwd !== "string" || typeof preview.command.stdin !== "string" || typeof preview.command.outputFile !== "string") fail("codex-preview-invalid");
    const cwd = await validateProjectRoot(preview.command.cwd, io, home);
    if (cwd !== preview.command.cwd) fail("codex-project-root-changed");
    const executable = await resolveExecutable(dependencies.codexPath, io);
    if (executable !== preview.command.executable) fail("codex-client-changed");
    const client = await inspectClient(executable);
    if (client.auth !== "chatgpt") fail("codex-auth-changed");
    const execute = dependencies.execute ?? runBounded;
    let raw;
    try {
      raw = await execute({
        executable,
        args: [...preview.command.args],
        cwd,
        prompt: preview.command.stdin,
        env: filteredEnvironment(sourceEnv, executable),
        spawn,
        timeoutMs: RUN_TIMEOUT_MS
      });
      if (typeof dependencies.execute === "function" && raw && typeof raw === "object" && typeof raw.stdout === "string") raw = raw.stdout;
      if (typeof raw !== "string" || Buffer.byteLength(raw, "utf8") > MAX_OUTPUT_BYTES) fail("codex-plan-output-invalid");
      let output;
      try { output = await io.readFile(preview.command.outputFile, "utf8"); } catch { output = raw; }
      if (typeof output !== "string" || !output.trim() || Buffer.byteLength(output, "utf8") > MAX_OUTPUT_BYTES) fail("codex-plan-output-invalid");
      if (preview.kind === "codex-plan") return validatePlanOutput(output, preview.claudeModels, preview.claudeEfforts);
      const review = output.trim();
      if (!safeText(review, MAX_OUTPUT_BYTES, true)) fail("codex-review-output-invalid");
      return review;
    } finally {
      const dir = path.dirname(preview.command.outputFile);
      await io.rm(dir, { recursive: true, force: true }).catch(() => {});
    }
  }

  async function cleanup(preview) {
    const outputFile = preview?.command?.outputFile;
    if (typeof outputFile !== "string" || !path.isAbsolute(outputFile)) return;
    await io.rm(path.dirname(outputFile), { recursive: true, force: true }).catch(() => {});
  }

  return Object.freeze({ preview, previewReview, run, cleanup });
}
