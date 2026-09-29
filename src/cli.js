import path from "node:path";

import { diagnoseMemory } from "./doctor.js";

const HELP = `project-memory

Uso:
  project-memory doctor [ruta] [opciones]

Opciones:
  --manifest <ruta>  Selecciona un manifiesto concreto.
  --json             Imprime el informe como JSON.
  --strict           Devuelve error cuando existan advertencias.
  -h, --help         Muestra esta ayuda.

El comando doctor es de solo lectura y no modifica la memoria.`;

export async function runCli(argv, io = defaultIo()) {
  if (argv.length === 0 || argv.includes("--help") || argv.includes("-h")) {
    io.out(HELP);
    return 0;
  }

  const [command, ...rest] = argv;
  if (command !== "doctor") {
    io.err(`Comando desconocido: ${command}`);
    io.err(HELP);
    return 2;
  }

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

function formatReport(report) {
  const lines = [
    `Project Memory Doctor: ${report.status.toUpperCase()}`,
    `Manifiesto: ${report.manifestPath ?? "no encontrado"}`,
    `Repositorio fuente: ${report.sourcePath ?? "no determinado"}`,
    `Bóveda: ${report.vaultPath ?? "no determinada"}`,
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
