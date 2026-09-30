import path from "node:path";

import { connectMemory, ConnectionError } from "./connect.js";
import { diagnoseMemory } from "./doctor.js";
import { initializeMemory, InitializationError } from "./init.js";
import { inspectMemoryStatus } from "./status.js";

const HELP = `project-memory

Uso:
  project-memory init <destino> [opciones]
  project-memory connect [ruta] --agent <agente> [opciones]
  project-memory doctor [ruta] [opciones]
  project-memory status [ruta] [opciones]

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

Opciones de connect:
  --agent <agente>   Agente a conectar: codex, claude o gemini.
  --manifest <ruta>  Selecciona un manifiesto concreto.
  --apply            Aplica el plan; sin esta opción solo previsualiza.

Opciones de status:
  --agent <agente>   Limita la inspección a un agente declarado.
  --manifest <ruta>  Selecciona un manifiesto concreto.
  --strict           Devuelve error cuando existan advertencias.

Opciones comunes:
  --json             Imprime la salida como JSON.
  -h, --help         Muestra esta ayuda.

init y connect no sobrescriben configuraciones diferentes. doctor es de solo lectura.`;

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

  if (command === "connect") {
    return runConnectCommand(rest, io);
  }

  if (command === "status") {
    return runStatusCommand(rest, io);
  }

  io.err(`Comando desconocido: ${command}`);
  io.err(HELP);
  return 2;
}

async function runStatusCommand(rest, io) {
  const options = {
    targetPath: process.cwd()
  };
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
    if (argument === "--agent" || argument === "--manifest") {
      const value = rest[index + 1];
      if (!value || value.startsWith("--")) {
        io.err(`La opción ${argument} requiere un valor.`);
        return 2;
      }
      if (argument === "--agent") {
        options.agentId = value;
      } else {
        options.manifestPath = path.resolve(value);
      }
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
    options.targetPath = path.resolve(argument);
    targetProvided = true;
  }

  let report;
  try {
    report = await inspectMemoryStatus(options);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    io.err(`No se pudo inspeccionar el estado: ${message}`);
    return 1;
  }

  if (json) {
    io.out(JSON.stringify(report, null, 2));
  } else {
    io.out(formatStatusReport(report));
  }

  if (report.status === "error") {
    return 1;
  }
  if (strict && report.status === "warning") {
    return 1;
  }
  return 0;
}

async function runConnectCommand(rest, io) {
  const options = {
    apply: false,
    targetPath: process.cwd()
  };
  let json = false;
  let targetProvided = false;

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
    if (argument === "--agent" || argument === "--manifest") {
      const value = rest[index + 1];
      if (!value || value.startsWith("--")) {
        io.err(`La opción ${argument} requiere un valor.`);
        return 2;
      }
      if (argument === "--agent") {
        options.agentId = value;
      } else {
        options.manifestPath = path.resolve(value);
      }
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
    options.targetPath = path.resolve(argument);
    targetProvided = true;
  }

  let report;
  try {
    report = await connectMemory(options);
  } catch (error) {
    if (error instanceof ConnectionError) {
      for (const detail of error.details) {
        io.err(`- ${detail}`);
      }
      return 1;
    }
    const message = error instanceof Error ? error.message : String(error);
    io.err(`No se pudo preparar la conexión: ${message}`);
    return 1;
  }

  if (json) {
    io.out(JSON.stringify(report, null, 2));
  } else {
    io.out(formatConnectReport(report));
  }
  return report.status === "conflict" ? 1 : 0;
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

function formatConnectReport(report) {
  const lines = [
    `Project Memory Connect: ${report.status.toUpperCase()}`,
    `Modo: ${report.mode}`,
    `Agente: ${report.agent}`,
    `Bóveda: ${report.vaultPath}`,
    `MCP: ${report.mcpName}`,
    `Skill: ${report.skillName}`,
    "",
    `${report.summary.create} por crear, ${report.summary.update} por actualizar, ${report.summary.unchanged} sin cambios, ${report.summary.conflicts} conflictos`
  ];

  const symbols = {
    create: "+",
    update: "~",
    unchanged: "=",
    conflict: "!"
  };
  for (const component of report.components) {
    lines.push(
      `${symbols[component.action]} ${component.id}: ${component.message}${component.path ? ` (${component.path})` : ""}`
    );
  }
  if (report.status === "preview") {
    lines.push("");
    lines.push("Vista previa: repite el comando con --apply para conectar el agente.");
  }
  return lines.join("\n");
}

function formatStatusReport(report) {
  const lines = [
    `Project Memory Status: ${report.status.toUpperCase()}`,
    `Proyecto: ${report.project?.name ?? "no determinado"}${report.project?.id ? ` (${report.project.id})` : ""}`,
    `Manifiesto: ${report.manifestPath ?? "no encontrado"}`,
    `Bóveda: ${report.memory.vaultPath ?? "no determinada"}`,
    `Memoria: ${report.memory.status.toUpperCase()} — ${report.memory.summary.errors} errores, ${report.memory.summary.warnings} advertencias`,
    ""
  ];

  const symbols = {
    ok: "✓",
    warning: "!",
    error: "✗",
    disabled: "-"
  };
  for (const agent of report.agents) {
    lines.push(`${symbols[agent.status]} ${agent.id}: ${agent.summary}`);
    for (const component of agent.components) {
      if (component.action !== "unchanged") {
        lines.push(`    - ${component.id}: ${component.message}`);
      }
    }
    for (const detail of agent.details ?? []) {
      lines.push(`    - ${detail}`);
    }
  }

  for (const finding of report.findings) {
    lines.push(`${symbols[finding.level] ?? "!"} ${finding.message}`);
    for (const detail of finding.details ?? []) {
      lines.push(`    - ${detail}`);
    }
  }

  lines.push("");
  lines.push(
    `${report.summary.errors} errores, ${report.summary.warnings} advertencias, ${report.summary.healthyAgents} agentes saludables, ${report.summary.pendingAgents} pendientes`
  );
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
