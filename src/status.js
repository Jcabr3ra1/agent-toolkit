import fs from "node:fs";
import path from "node:path";

import { connectMemory, ConnectionError } from "./connect.js";
import { diagnoseMemory } from "./doctor.js";

export async function inspectMemoryStatus(options = {}, context = {}) {
  const targetPath = path.resolve(options.targetPath ?? process.cwd());
  const manifestPath = options.manifestPath
    ? path.resolve(options.manifestPath)
    : undefined;
  const diagnose = context.diagnoseMemory ?? diagnoseMemory;
  const connect = context.connectMemory ?? connectMemory;
  const doctor = await diagnose(targetPath, {
    manifestPath,
    schemaPath: context.schemaPath
  });
  const report = createReport(doctor);

  if (!doctor.manifestPath) {
    return finishReport(report);
  }

  const manifest = readManifestForStatus(doctor.manifestPath, report);
  if (!manifest) {
    return finishReport(report);
  }

  report.project = {
    id: manifest.project?.id ?? null,
    name: manifest.project?.name ?? null
  };

  const declaredAgents = Array.isArray(manifest.agents) ? manifest.agents : [];
  const selectedAgents = selectAgents(declaredAgents, options.agentId, report);

  for (const agent of selectedAgents) {
    if (!agent.enabled) {
      report.agents.push({
        id: agent.id,
        status: "disabled",
        summary: "El agente está deshabilitado en el manifiesto.",
        components: []
      });
      continue;
    }

    try {
      const connection = await connect(
        {
          targetPath: doctor.manifestPath,
          manifestPath: doctor.manifestPath,
          agentId: agent.id,
          apply: false
        },
        {
          homeDirectory: context.homeDirectory,
          runCommand: context.runCommand,
          schemaPath: context.schemaPath
        }
      );
      report.agents.push(toAgentStatus(agent.id, connection));
    } catch (error) {
      report.agents.push({
        id: agent.id,
        status: "error",
        summary: "No se pudo inspeccionar la conexión.",
        components: [],
        details:
          error instanceof ConnectionError
            ? error.details
            : [error instanceof Error ? error.message : String(error)]
      });
    }
  }

  return finishReport(report);
}

function createReport(doctor) {
  return {
    command: "status",
    status: "ok",
    manifestPath: doctor.manifestPath,
    project: null,
    memory: {
      status: doctor.status,
      summary: doctor.summary,
      vaultPath: doctor.vaultPath,
      sourcePath: doctor.sourcePath,
      layoutProfile: doctor.layoutProfile,
      checks: doctor.checks
    },
    agents: [],
    findings: [],
    summary: {
      errors: 0,
      warnings: 0,
      healthyAgents: 0,
      pendingAgents: 0,
      disabledAgents: 0
    }
  };
}

function readManifestForStatus(manifestPath, report) {
  try {
    return JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  } catch (error) {
    report.findings.push({
      level: "error",
      message: "No se pudo leer el manifiesto para enumerar agentes.",
      details: [error instanceof Error ? error.message : String(error)]
    });
    return null;
  }
}

function selectAgents(agents, requestedAgent, report) {
  if (!requestedAgent) {
    return agents;
  }

  const selected = agents.find((agent) => agent.id === requestedAgent);
  if (!selected) {
    report.findings.push({
      level: "error",
      message: `El manifiesto no declara el agente ${requestedAgent}.`,
      details: []
    });
    return [];
  }
  return [selected];
}

function toAgentStatus(agentId, connection) {
  if (connection.status === "conflict") {
    return {
      id: agentId,
      status: "error",
      summary: "La conexión contiene uno o más conflictos.",
      components: connection.components
    };
  }

  if (connection.summary.create > 0 || connection.summary.update > 0) {
    return {
      id: agentId,
      status: "warning",
      summary: "La conexión necesita creación o actualización.",
      components: connection.components
    };
  }

  return {
    id: agentId,
    status: "ok",
    summary: "Skill, MCP y política de lectura están configurados.",
    components: connection.components
  };
}

function finishReport(report) {
  const agentErrors = report.agents.filter(
    (agent) => agent.status === "error"
  ).length;
  const agentWarnings = report.agents.filter(
    (agent) => agent.status === "warning"
  ).length;
  const findingErrors = report.findings.filter(
    (finding) => finding.level === "error"
  ).length;
  const findingWarnings = report.findings.filter(
    (finding) => finding.level === "warning"
  ).length;

  report.summary = {
    errors:
      (report.memory.status === "error" ? 1 : 0) +
      agentErrors +
      findingErrors,
    warnings:
      (report.memory.status === "warning" ? 1 : 0) +
      agentWarnings +
      findingWarnings,
    healthyAgents: report.agents.filter((agent) => agent.status === "ok").length,
    pendingAgents: agentWarnings,
    disabledAgents: report.agents.filter(
      (agent) => agent.status === "disabled"
    ).length
  };

  report.status =
    report.summary.errors > 0
      ? "error"
      : report.summary.warnings > 0
        ? "warning"
        : "ok";
  return report;
}
