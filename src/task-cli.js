import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createTaskPreparer, TASK_LIMITS } from "./task-prepare.js";
import { readTaskInputs, parseTaskDocument, TaskInputError } from "./task-prepare-files.js";
import { runVerifyCli } from "./task-verify-cli.js";

const HELP = `agent-task — preparación manual, sin ejecución de IA

Uso local:
  node bin/agent-task.js prepare --task <archivo> --request <archivo> --catalog <archivo> --policy <archivo> [--json | --show-brief]
  node bin/agent-task.js verify --contract <json> --expect <sha256> --source <raíz> --handoff <raíz> --phase <before|after> [--json]
  node bin/agent-task.js --help

Sin flags de salida: resumen sin cuerpo del encargo ni rutas privadas.
--json: ese mismo resumen estructurado.
--show-brief: muestra el borrador privado completo en el terminal; no lo guarda ni envía.
Solo documentos v2 del selector; no interpreta la tarea usando IA ni consulta cuentas.
Preparar no autoriza, verifica la base ni cambia el modelo del cliente.
No comprueba actualidad frente al reloj; acceso/disponibilidad son datos declarados.
El usuario revisa el borrador y elige manualmente el modelo antes de entregarlo.
Exit: 0 borrador/ayuda; 1 faltan datos/bloqueo; 2 entrada/lectura/salida inválida.
verify compara huellas de archivos listados; «verify --help» detalla estados y salida. matched no aprueba nada.
`;
const NAMES = ["task", "request", "catalog", "policy"];
const schemaPaths = ["agent-task-prepare", "agent-model-selection", "agent-model-preference"].map(n => fileURLToPath(new URL(`../schemas/${n}.schema.json`, import.meta.url)));
function options(argv) {
  if (!Array.isArray(argv) || argv.some(v => typeof v !== "string")) throw Error();
  if (!argv.length || argv.length === 1 && ["--help", "-h"].includes(argv[0]) || argv.length === 2 && argv[0] === "prepare" && ["--help", "-h"].includes(argv[1])) return { help: true };
  if (argv[0] !== "prepare") throw Error();
  const values = {}, flags = new Set();
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i];
    if (["--json", "--show-brief"].includes(a)) { if (flags.has(a)) throw Error(); flags.add(a); continue; }
    const key = a.startsWith("--") ? a.slice(2) : "";
    if (!NAMES.includes(key) || Object.hasOwn(values, key) || !argv[i + 1] || argv[i + 1].startsWith("-")) throw Error();
    values[key] = argv[++i];
  }
  if (Object.keys(values).length !== 4 || flags.size > 1) throw Error();
  return { values, json: flags.has("--json"), show: flags.has("--show-brief") };
}
function outputSummary(s, json) {
  if (json) return JSON.stringify(s, null, 2) + "\n";
  return `agent-task prepare: ${s.state}\n` + (s.recommended ?
    `Modelo solicitado: ${s.recommended.requestedModel}; esfuerzo: ${s.recommended.effort ?? "null (sin ajuste explícito)"}\n` : "Sin recomendación utilizable.\n") +
    `Motivos: ${s.reasons.join(", ")}\n` + (s.missing.length ? `Datos pendientes: ${s.missing.join(", ")}\n` : "") +
    "No ejecutado, enviado ni escrito. Permiso, base y modelo real no verificados.\n" +
    "Disponibilidad declarada; actualidad frente al reloj no verificada.\n";
}
/** IO callbacks/dependencies are trusted hosts, not fields in input JSON. */
export async function runTaskCli(argv, io, dependencies = {}) {
  if (Array.isArray(argv) && argv[0] === "verify") return runVerifyCli(argv.slice(1), io, dependencies);
  let opts;
  const fail = async code => { try { await io.err(`agent-task: ${code}\n`); } catch {} return 2; };
  try { opts = options(argv); } catch { return fail("task-invalid-option"); }
  if (opts.help) {
    try { await io.out(HELP); return 0; } catch { return fail("task-output-failed"); }
  }
  let core, report;
  try {
    const readSchema = dependencies.readPackagedSchema ?? (p => fs.readFile(p));
    const schemas = []; for (const p of schemaPaths) schemas.push(parseTaskDocument(await readSchema(p)));
    core = createTaskPreparer(...schemas);
    const { data, byteHashes } = await readTaskInputs(opts.values, dependencies.cwd ?? process.cwd(), { io: dependencies.fileIo });
    report = core.prepareTask(data); report.audit.sourceByteHashes = byteHashes;
  } catch (e) { return fail(e instanceof TaskInputError ? e.code : "task-preparation-failed"); }
  try {
    const summary = core.summarize(report);
    const output = opts.show && report.state === "prepared-draft" ? report.brief : outputSummary(summary, opts.json);
    const cap = opts.show && report.state === "prepared-draft" ? TASK_LIMITS.briefBytes : TASK_LIMITS.summaryBytes;
    if (Buffer.byteLength(output) > cap) throw Error();
    await io.out(output);
    return report.state === "prepared-draft" ? 0 : report.state === "invalid" ? 2 : 1;
  } catch { return fail("task-output-failed"); }
}
