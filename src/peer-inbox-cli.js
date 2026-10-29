import { closeWithHandoff } from "./peer-handoff.js";
import fs from "node:fs/promises";
import { consumptionTable } from "./usage-metrics.js";
import { agentModels, agentModelsTable } from "./agent-models.js";
import { DeliveryError, deliverReview, registerReviewer } from "./codex-delivery.js";
import { LevelAgentsError, levelAgentPlan, levelAgentsTable, writeLevelAgents } from "./level-agents.js";
import { createPeerReviewStore, PeerReviewError } from "./peer-review-store.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const EXIT = Object.freeze({ found: 0, failure: 1, usage: 2, timeout: 3 });
const HELP = `Uso: agent-toolkit-inbox wait --agent <claude|codex> --project-root <ruta>
       [--task <taskId> --review <reviewId>] [--timeout-seconds <1-86400>]
     agent-toolkit-inbox cierre --project-root <ruta> --task <id> --salida <borrador.md>
     agent-toolkit-inbox consumo [--project-root <ruta>] [--json]
     agent-toolkit-inbox medir --project-root <ruta> --task <id> --archivo <medicion.json>
     agent-toolkit-inbox rendimiento [--project-root <ruta>] [--json]
     agent-toolkit-inbox modelos [--json]
     agent-toolkit-inbox agentes [--escribir [--forzar]] [--json]
     agent-toolkit-inbox registrar --agent codex --project-root <ruta> [--thread <id>]
     agent-toolkit-inbox avisar --project-root <ruta> --task <taskId> --review <reviewId>

Espera sin usar ningún modelo hasta que llegue un encargo para el agente o,
con --task y --review, hasta que ese encargo tenga informe o termine.
Imprime una línea JSON y sale con 0 (encargo o informe), 3 (tiempo agotado),
2 (uso incorrecto) o 1 (error). No reclama ni modifica nada.

rendimiento resume los resultados registrados con record_review_outcome por
revisor, modelo, esfuerzo y nivel, de todos los proyectos o de uno.

modelos lista los modelos de Claude y los que Codex tiene disponibles, y la
tabla de niveles con los nombres vigentes.

agentes prepara los agentes por nivel de Codex (nivel_ligero, nivel_normal,
nivel_exigente y nivel_alto) en ~/.codex/agents con el modelo y el esfuerzo de
esa tabla. Sin --escribir solo muestra la vista previa. Nunca sobrescribe ni
borra: un archivo distinto se respeta, y con --forzar queda como .anterior-*.
Los agentes de Claude vienen del plugin niveles.

registrar guarda la sesión de Codex como revisora del proyecto (la encuentra sola
si es la única activa ahí, o con --thread). avisar entrega con codex queue un
aviso fijo y corto a esa sesión por un encargo ya aprobado, pendiente y dirigido
a Codex, para que Codex no tenga que esperar gastando una vuelta por minuto.
`;

function parse(argv) {
  const [command, ...rest] = argv;
  if (command !== "wait") return null;
  const options = { timeoutSeconds: 3600 };
  const seen = new Set();
  const names = { "--agent": "agent", "--project-root": "projectRoot", "--task": "taskId", "--review": "reviewId", "--timeout-seconds": "timeoutSeconds" };
  for (let i = 0; i < rest.length; i += 2) {
    const key = names[rest[i]];
    if (!key || rest[i + 1] === undefined || seen.has(key)) return null;
    seen.add(key);
    options[key] = rest[i + 1];
  }
  options.timeoutSeconds = Number(options.timeoutSeconds);
  if (!["claude", "codex"].includes(options.agent) || !options.projectRoot ||
      !Number.isInteger(options.timeoutSeconds) || options.timeoutSeconds < 1 || options.timeoutSeconds > 86_400 ||
      Boolean(options.taskId) !== Boolean(options.reviewId) ||
      [options.taskId, options.reviewId].some(id => id !== undefined && !UUID.test(id))) return null;
  return options;
}

function parseRendimiento(rest) {
  const options = { json: false };
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === "--json" && !options.json) options.json = true;
    else if (rest[i] === "--project-root" && rest[i + 1] && !options.projectRoot) options.projectRoot = rest[++i];
    else return null;
  }
  return options;
}

const percent = (part, total) => total ? `${Math.round(part / total * 100)} %` : "—";

function rendimientoTable({ groups }) {
  if (!groups.length) return "Sin resultados registrados todavía. Se registran al verificar cada informe.\n";
  const total = groups.reduce((sum, group) => sum + group.reviews, 0);
  const rows = groups.map(g => `| ${g.reviewer} | ${g.model ?? "—"} | ${g.effort ?? "—"} | ${g.level ?? "—"} | ${g.reviews} | ` +
    `${g.findings} | ${g.upheld} (${percent(g.upheld, g.findings)}) | ${g.verdicts.aprobado} / ${g.verdicts.aprobado_con_cambios} / ${g.verdicts.requiere_cambios} |`);
  return [`**Rendimiento de los revisores** · ${total} encargos con resultado`, "",
    "| Revisor | Modelo | Esfuerzo | Nivel | Encargos | Hallazgos | Se sostienen | Aprobado / Con cambios / Requiere cambios |",
    "| --- | --- | --- | --- | --- | --- | --- | --- |", ...rows, ""].join("\n");
}

function summary(value) {
  const review = value.review;
  return { taskId: value.taskId, projectRoot: value.projectRoot, taskState: value.taskState,
    review: review && { id: review.id, from: review.from, to: review.to, state: review.state, message: review.message,
      reviewer: review.reviewer ?? null, hasReport: Boolean(review.review) } };
}

export async function runPeerInboxCli(argv, { out, err, store = createPeerReviewStore(), now = Date.now,
  sleep = ms => new Promise(resolve => setTimeout(resolve, ms)), intervalMs = 2_000, codexHome, claudeHome, deliveryDirectory, deliver = deliverReview } = {}) {
  if (argv[0] === "cierre") {
    const names = { "--project-root": "projectRoot", "--task": "taskId", "--salida": "output" }, options = {};
    for (let i = 1; i < argv.length; i += 2) {
      const key = names[argv[i]];
      if (!key || !argv[i+1] || options[key]) { await err(HELP); return EXIT.usage; }
      options[key] = argv[i+1];
    }
    if (!options.projectRoot || !UUID.test(options.taskId ?? "") || !options.output) { await err(HELP); return EXIT.usage; }
    try { await out(JSON.stringify(await closeWithHandoff({ store, ...options })) + "\n"); return EXIT.found; }
    catch { await err("No se pudo cerrar: revisa encargos activos, permisos y que la salida no exista. Si se creó el borrador antes del fallo, consérvalo y consulta el estado.\n"); return EXIT.failure; }
  }
  if (argv[0] === "consumo" || argv[0] === "medir") {
    try {
      if (argv[0] === "consumo") {
        const options = parseRendimiento(argv.slice(1));
        if (!options) { await err(HELP); return EXIT.usage; }
        const report = await store.consumption(options);
        await out(options.json ? JSON.stringify(report) + "\n" : consumptionTable(report));
      } else {
        const names = { "--project-root": "projectRoot", "--task": "taskId", "--archivo": "file" }, options = {};
        for (let i = 1; i < argv.length; i += 2) {
          const key = names[argv[i]];
          if (!key || !argv[i + 1] || options[key]) { await err(HELP); return EXIT.usage; }
          options[key] = argv[i + 1];
        }
        if (!options.projectRoot || !UUID.test(options.taskId ?? "") || !options.file) { await err(HELP); return EXIT.usage; }
        const stat = await fs.lstat(options.file);
        if (!stat.isFile() || stat.size > 8192) throw new Error("measurement file");
        const measurement = JSON.parse(await fs.readFile(options.file, "utf8"));
        await out(JSON.stringify(await store.recordUsage({ ...options, measurement })) + "\n");
      }
      return EXIT.found;
    } catch { await err("No se pudo registrar o consultar el consumo. Revisa la tarea y los contadores.\n"); return EXIT.failure; }
  }
  if (argv[0] === "modelos") {
    if (argv.length > 2 || (argv[1] !== undefined && argv[1] !== "--json")) { await err(HELP); return EXIT.usage; }
    const result = await agentModels({ ...(codexHome && { codexHome }), ...(claudeHome && { claudeHome }) });
    await out(argv[1] === "--json" ? JSON.stringify(result) + "\n" : agentModelsTable(result));
    return EXIT.found;
  }
  if (argv[0] === "registrar" || argv[0] === "avisar") {
    const names = { "--agent": "agent", "--project-root": "projectRoot", "--thread": "thread", "--task": "taskId", "--review": "reviewId" };
    const options = {};
    for (let i = 1; i < argv.length; i += 2) {
      const key = names[argv[i]];
      if (!key || argv[i + 1] === undefined || Object.hasOwn(options, key)) { await err(HELP); return EXIT.usage; }
      options[key] = argv[i + 1];
    }
    const valid = argv[0] === "registrar"
      ? options.agent === "codex" && options.projectRoot && !options.taskId && !options.reviewId
      : options.projectRoot && options.taskId && options.reviewId && !options.agent && !options.thread;
    if (!valid) { await err(HELP); return EXIT.usage; }
    try {
      const result = argv[0] === "registrar"
        ? await registerReviewer({ projectRoot: options.projectRoot, thread: options.thread, ...(deliveryDirectory && { directory: deliveryDirectory }), ...(codexHome && { codexHome }) })
        : await deliver({ store, ...options, ...(deliveryDirectory && { directory: deliveryDirectory }) });
      await out(JSON.stringify(result) + "\n");
      return EXIT.found;
    } catch (failure) {
      await err((failure instanceof DeliveryError || failure instanceof PeerReviewError ? failure.message : "No se pudo completar la operación.") + "\n");
      return EXIT.failure;
    }
  }
  if (argv[0] === "agentes") {
    const flags = argv.slice(1);
    if (flags.some(flag => !["--escribir", "--forzar", "--json"].includes(flag)) || new Set(flags).size !== flags.length ||
        (flags.includes("--forzar") && !flags.includes("--escribir"))) { await err(HELP); return EXIT.usage; }
    try {
      let plan = await levelAgentPlan(codexHome ? { codexHome } : {});
      if (flags.includes("--escribir")) plan = await writeLevelAgents(plan, { force: flags.includes("--forzar") });
      await out(flags.includes("--json") ? JSON.stringify({ catalog: plan.catalog,
        files: plan.files.map(({ content, ...file }) => file) }) + "\n" : levelAgentsTable(plan));
      return EXIT.found;
    } catch (failure) {
      await err((failure instanceof LevelAgentsError ? failure.message : "No se pudieron preparar o escribir los agentes por nivel.") + "\n");
      return EXIT.failure;
    }
  }
  if (argv[0] === "rendimiento") {
    const options = parseRendimiento(argv.slice(1));
    if (!options) { await err(HELP); return EXIT.usage; }
    try {
      const result = await store.performance(options);
      await out(options.json ? JSON.stringify(result) + "\n" : rendimientoTable(result));
      return EXIT.found;
    } catch (failure) {
      await err((failure instanceof PeerReviewError ? failure.message : "No se pudo leer el registro de colaboración.") + "\n");
      return EXIT.failure;
    }
  }
  const options = parse(argv);
  if (!options) { await err(HELP); return EXIT.usage; }
  const deadline = now() + options.timeoutSeconds * 1_000;
  try {
    while (true) {
      const { done, value } = await store.findHandoff(options);
      if (done) {
        const state = value.taskState === "closed" ? "closed" : options.reviewId ? "finished" : "handoff";
        await out(JSON.stringify({ state, ...summary(value) }) + "\n");
        return EXIT.found;
      }
      if (now() >= deadline) {
        await out(JSON.stringify({ state: "timeout", projectRoot: options.projectRoot, agent: options.agent }) + "\n");
        return EXIT.timeout;
      }
      await sleep(Math.min(intervalMs, Math.max(1, deadline - now())));
    }
  } catch (failure) {
    await err((failure instanceof PeerReviewError ? failure.message : "No se pudo leer la bandeja de colaboración.") + "\n");
    return EXIT.failure;
  }
}
