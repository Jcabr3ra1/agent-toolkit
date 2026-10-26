import { agentModels, agentModelsTable } from "./agent-models.js";
import { createPeerReviewStore, PeerReviewError } from "./peer-review-store.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const EXIT = Object.freeze({ found: 0, failure: 1, usage: 2, timeout: 3 });
const HELP = `Uso: agent-toolkit-inbox wait --agent <claude|codex> --project-root <ruta>
       [--task <taskId> --review <reviewId>] [--timeout-seconds <1-86400>]
     agent-toolkit-inbox rendimiento [--project-root <ruta>] [--json]
     agent-toolkit-inbox modelos [--json]

Espera sin usar ningún modelo hasta que llegue un encargo para el agente o,
con --task y --review, hasta que ese encargo tenga informe o termine.
Imprime una línea JSON y sale con 0 (encargo o informe), 3 (tiempo agotado),
2 (uso incorrecto) o 1 (error). No reclama ni modifica nada.

rendimiento resume los resultados registrados con record_review_outcome por
revisor, modelo, esfuerzo y nivel, de todos los proyectos o de uno.

modelos lista los modelos de Claude y los que Codex tiene disponibles, y la
tabla de niveles con los nombres vigentes.
`;

function parse(argv) {
  const [command, ...rest] = argv;
  if (command !== "wait") return null;
  const options = { timeoutSeconds: 3600 };
  const names = { "--agent": "agent", "--project-root": "projectRoot", "--task": "taskId", "--review": "reviewId", "--timeout-seconds": "timeoutSeconds" };
  for (let i = 0; i < rest.length; i += 2) {
    const key = names[rest[i]];
    if (!key || rest[i + 1] === undefined || Object.hasOwn(options, key) && key !== "timeoutSeconds") return null;
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
  sleep = ms => new Promise(resolve => setTimeout(resolve, ms)), intervalMs = 2_000, codexHome, claudeHome } = {}) {
  if (argv[0] === "modelos") {
    if (argv.length > 2 || (argv[1] !== undefined && argv[1] !== "--json")) { await err(HELP); return EXIT.usage; }
    const result = await agentModels({ ...(codexHome && { codexHome }), ...(claudeHome && { claudeHome }) });
    await out(argv[1] === "--json" ? JSON.stringify(result) + "\n" : agentModelsTable(result));
    return EXIT.found;
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
