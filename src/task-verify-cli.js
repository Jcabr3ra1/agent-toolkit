import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createTaskVerifier, VERIFY_LIMITS } from "./task-verify.js";
import { verifyLocal } from "./task-verify-files.js";
import { parseTaskDocument } from "./task-prepare-files.js";

export const VERIFY_HELP = `agent-task verify — comprobación de huellas, sin ejecución ni escritura

Uso local:
  node bin/agent-task.js verify --contract <json> --expect <sha256> --source <raíz> --handoff <raíz> --phase <before|after> [--json]
  node bin/agent-task.js verify --help

--expect: SHA-256 de los bytes del contrato ya revisado; no se calcula ni se lee del contrato.
--source/--handoff: raíces absolutas explícitas; handoff privado (0700); distintas y no anidadas.
Solo compara los archivos listados; los no listados quedan sin verificar.
matched no aprueba código, pruebas, Git, modelos, consumo ni permiso. Requiere revisión humana.
No ejecuta comandos, no lee .git, no escribe ni envía nada.
Exit: 0 matched/ayuda; 1 mismatched; 2 blocked/invalid o fallo de lectura/salida.
`;
const schemaPath = fileURLToPath(new URL("../schemas/agent-task-verify.schema.json", import.meta.url));
const VALUES = ["contract", "expect", "source", "handoff", "phase"];
function options(args) {
  if (args.length === 1 && ["--help", "-h"].includes(args[0])) return { help: true };
  const values = {}; let json = false;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--json") { if (json) throw Error(); json = true; continue; }
    const key = a.startsWith("--") ? a.slice(2) : "";
    if (!VALUES.includes(key) || Object.hasOwn(values, key) || typeof args[i + 1] !== "string" || !args[i + 1] || args[i + 1].startsWith("-")) throw Error();
    values[key] = args[++i];
  }
  if (Object.keys(values).length !== VALUES.length || !["before", "after"].includes(values.phase) || !/^[a-f0-9]{64}$/.test(values.expect)) throw Error();
  return { values, json };
}
function text(r) {
  const id = r.identity ? `${r.identity.projectId}/${r.identity.taskId}/${r.identity.revision}` : "no validada";
  const lines = [`agent-task verify: ${r.state}`, `Fase: ${r.phase ?? "no validada"}`, `Identidad: ${id}`,
    `Procedencia: ${r.provenance}`, `Motivos: ${r.reasons.join(", ")}`];
  for (const e of r.results) lines.push(`- ${e.id} [${e.root}/${e.operation}] ${e.outcome}; esperado ${e.expected ?? "ausente"}; observado ${
    e.observed ?? (e.outcome === "unexpected-present" ? "presente sin abrir" : "ausente")}`);
  lines.push("Alcance: solo archivos listados; cambios no listados sin verificar.",
    "No aprueba calidad, pruebas, Git, modelos, consumo ni permiso. No ejecutado, enviado ni escrito.",
    "Revisión humana requerida, también con matched.");
  return lines.join("\n") + "\n";
}
/** IO callbacks/dependencies are trusted hosts, not fields in input JSON. */
export async function runVerifyCli(args, io, dependencies = {}) {
  const fail = async code => { try { await io.err(`agent-task: ${code}\n`); } catch {} return 2; };
  let opts;
  try { opts = options(args); } catch { return fail("verify-invalid-option"); }
  if (opts.help) {
    try { await io.out(VERIFY_HELP); return 0; } catch { return fail("verify-output-failed"); }
  }
  let report;
  try {
    const readSchema = dependencies.readVerifySchema ?? (p => fs.readFile(p));
    const verifier = createTaskVerifier(parseTaskDocument(await readSchema(schemaPath)));
    report = await verifyLocal(opts.values, dependencies.cwd ?? process.cwd(), verifier,
      { io: dependencies.fileIo, home: dependencies.home, platform: dependencies.platform });
  } catch { return fail("verify-preparation-failed"); }
  try {
    const output = opts.json ? JSON.stringify(report, null, 2) + "\n" : text(report);
    if (Buffer.byteLength(output) > VERIFY_LIMITS.reportBytes) throw Error();
    await io.out(output);
    return report.state === "matched" ? 0 : report.state === "mismatched" ? 1 : 2;
  } catch { return fail("verify-output-failed"); }
}
