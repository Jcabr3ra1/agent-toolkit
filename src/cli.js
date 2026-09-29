import path from "node:path";

import { diagnoseMemory } from "./doctor.js";
import { initializeMemory, InitializationError } from "./init.js";

const HELP = `project-memory

Uso:
  project-memory init <destino> [opciones]
  project-memory doctor [ruta] [opciones]

Opciones de init:
  --project-id <id>           Identificador del proyecto.
  --project-name <nombre>     Nombre visible del proyecto.
  --description <texto>       Descripción breve de la memoria.
  --source <ruta>             Repositorio fuente existente.
  --default-branch <rama>     Rama principal; por defecto main.
  --integration-branch <rama> Rama de integración.
  --source-remote <url>       Remoto del repositorio fuente.
  --memory-remote <url>       Remoto previsto para la memoria.
  --sync-mode <modo>          none, git-manual o git-automated.
  --mcp-name <nombre>         Nombre del servidor MCP.
  --apply                     Aplica el plan; sin esta opción solo previsualiza.

Opciones de doctor:
  --manifest <ruta>  Selecciona un manifiesto concreto.
  --strict           Devuelve error cuando existan advertencias.

Opciones comunes:
  --json             Imprime la salida como JSON.
  -h, --help         Muestra esta ayuda.

init no sobrescribe archivos diferentes. doctor es de solo lectura.`;

export async function runCli(argv, io = defaultIo()) {
  if (argv.length === 0 || argv.includes("--help") || argv.includes("-h")) {
    io.out(HELP);
    return 0;
  }

  const [command, ...rest] = argv;
  if (command === "doctor") {
    return runDoctorCommand(rest, io);
  }

  if (command === "init") {
    return runInitCommand(rest, io);
  }

  io.err(`Comando desconocido: ${command}`);
  io.err(HELP);
  return 2;
}

async function runDoctorCommand(rest, io) {

  let targetPath = process.cwd();
  let manifestPath;
  let json = false;
  let strict = false;
  let targetProvided = false;

  for (let index = 0; index < rest.length; index += 1) {
    const argument = rest[index];

    if (argument === "--json") {
      json = true;
      continue;
    }

    if (argument === "--strict") {
      strict = true;
      continue;
    }

    if (argument === "--manifest") {
      const value = rest[index + 1];
      if (!value || value.startsWith("--")) {
        io.err("La opción --manifest requiere una ruta.");
        return 2;
      }
      manifestPath = path.resolve(value);
      index += 1;
      continue;
    }

    if (argument.startsWith("--")) {
      io.err(`Opción desconocida: ${argument}`);
      return 2;
    }

    if (targetProvided) {
      io.err(`Ruta adicional no esperada: ${argument}`);
      return 2;
    }

    targetPath = path.resolve(argument);
    targetProvided = true;
  }

  let report;
  try {
    report = await diagnoseMemory(targetPath, { manifestPath });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    io.err(`No se pudo completar el diagnóstico: ${message}`);
    return 1;
  }

  if (json) {
    io.out(JSON.stringify(report, null, 2));
  } else {
    io.out(formatReport(report));
  }

  if (report.status === "error") {
    return 1;
  }

  if (strict && report.status === "warning") {
    return 1;
  }

  return 0;
}

function runInitCommand(rest, io) {
  const options = {
    apply: false
  };
  let json = false;
  let destinationProvided = false;
  const valueOptions = new Map([
    ["--project-id", "projectId"],
    ["--project-name", "projectName"],
    ["--source", "sourcePath"],
    ["--default-branch", "defaultBranch"],
    ["--integration-branch", "integrationBranch"],
    ["--source-remote", "sourceRemote"],
    ["--memory-remote", "memoryRemote"],
    ["--sync-mode", "syncMode"],
    ["--mcp-name", "mcpName"],
    ["--description", "description"]
  ]);

  for (let index = 0; index < rest.length; index += 1) {
    const argument = rest[index];

    if (argument === "--apply") {
      options.apply = true;
      continue;
    }

    if (argument === "--json") {
      json = true;
      continue;
    }

    if (valueOptions.has(argument)) {
      const value = rest[index + 1];
      if (!value || value.startsWith("--")) {
        io.err(`La opción ${argument} requiere un valor.`);
        return 2;
      }
      options[valueOptions.get(argument)] = value;
      index += 1;
      continue;
    }

    if (argument.startsWith("--")) {
      io.err(`Opción desconocida: ${argument}`);
      return 2;
    }

    if (destinationProvided) {
      io.err(`Destino adicional no esperado: ${argument}`);
      return 2;
    }

    options.destination = path.resolve(argument);
    destinationProvided = true;
  }

  let report;
  try {
    report = initializeMemory(options);
  } catch (error) {
    if (error instanceof InitializationError) {
      for (const detail of error.details) {
        io.err(`- ${detail}`);
      }
      return 1;
    }
    const message = error instanceof Error ? error.message : String(error);
    io.err(`No se pudo preparar la memoria: ${message}`);
    return 1;
  }

  if (json) {
    io.out(JSON.stringify(report, null, 2));
  } else {
    io.out(formatInitReport(report));
  }

  return report.status === "conflict" ? 1 : 0;
}

function formatInitReport(report) {
  const lines = [
    `Project Memory Init: ${report.status.toUpperCase()}`,
    `Modo: ${report.mode}`,
    `Destino: ${report.destination}`,
    `Proyecto: ${report.project.name} (${report.project.id})`,
    "",
    `${report.summary.create} por crear, ${report.summary.unchanged} sin cambios, ${report.summary.conflicts} conflictos`
  ];

  for (const file of report.files) {
    const symbol = file.action === "create" ? "+" : file.action === "unchanged" ? "=" : "!";
    lines.push(`${symbol} ${file.path}${file.reason ? ` — ${file.reason}` : ""}`);
  }

  if (report.status === "preview") {
    lines.push("");
    lines.push("Vista previa: repite el comando con --apply para crear los archivos.");
  }

  return lines.join("\n");
}

function formatReport(report) {
  const lines = [
    `Project Memory Doctor: ${report.status.toUpperCase()}`,
    `Manifiesto: ${report.manifestPath ?? "no encontrado"}`,
    `Repositorio fuente: ${report.sourcePath ?? "no determinado"}`,
    `Bóveda: ${report.vaultPath ?? "no determinada"}`,
    `Estructura: ${report.layoutProfile ?? "no determinada"}`,
    ""
  ];

  const symbols = {
    pass: "✓",
    info: "i",
    warning: "!",
    error: "✗"
  };

  for (const check of report.checks) {
    lines.push(`${symbols[check.level]} [${check.id}] ${check.message}`);
    for (const detail of check.details ?? []) {
      lines.push(`    - ${detail}`);
    }
  }

  lines.push("");
  lines.push(
    `${report.summary.errors} errores, ${report.summary.warnings} advertencias, ${report.summary.passed} comprobaciones correctas`
  );

  return lines.join("\n");
}

function defaultIo() {
  return {
    out(message) {
      console.log(message);
    },
    err(message) {
      console.error(message);
    }
  };
}
