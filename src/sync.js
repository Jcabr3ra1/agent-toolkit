import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import { diagnoseMemory } from "./doctor.js";

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 1000;
const LEDGER_RELATIVE_PATH = "00-INICIO/Registro de sincronización.md";

export async function planMemorySync(options = {}, context = {}) {
  const targetPath = path.resolve(options.targetPath ?? process.cwd());
  const manifestPath = options.manifestPath
    ? path.resolve(options.manifestPath)
    : undefined;
  const limit = normalizeLimit(options.limit);
  const diagnose = context.diagnoseMemory ?? diagnoseMemory;
  const runCommand = context.runCommand ?? runExternalCommand;

  const doctor = await diagnose(targetPath, {
    manifestPath,
    schemaPath: context.schemaPath
  });
  if (doctor.status === "error" || !doctor.manifestPath || !doctor.vaultPath) {
    throw new SyncPlanningError([
      "La memoria no superó project-memory doctor.",
      ...doctor.checks
        .filter((check) => check.level === "error")
        .map((check) => check.message)
    ]);
  }

  const manifest = readManifest(doctor.manifestPath);
  validateAutomation(manifest);

  const repository = parseGitHubRepository(manifest.source?.remoteUrl);
  const branch = manifest.automation.reviewBranch;
  const ledgerPath = path.join(doctor.vaultPath, LEDGER_RELATIVE_PATH);
  const reviewed = readReviewedPullRequests(ledgerPath, repository);
  const merged = queryMergedPullRequests({
    repository,
    branch,
    limit,
    runCommand
  });
  const baseline = findReviewBaseline(merged, reviewed);
  const pending = merged
    .filter(
      (pullRequest) =>
        baseline === null || comparePullRequests(pullRequest, baseline) > 0
    )
    .filter((pullRequest) => !reviewed.has(pullRequest.number))
    .sort(comparePullRequests);

  return {
    command: "sync plan",
    status: pending.length > 0 ? "pending" : "clean",
    repository,
    branch,
    ledgerPath,
    reviewed: [...reviewed].sort((left, right) => left - right),
    baseline:
      baseline === null
        ? null
        : { number: baseline.number, mergedAt: baseline.mergedAt },
    pending
  };
}

function normalizeLimit(value) {
  if (value === undefined) {
    return DEFAULT_LIMIT;
  }
  const limit = Number(value);
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
    throw new SyncPlanningError([
      `--limit debe ser un entero entre 1 y ${MAX_LIMIT}.`
    ]);
  }
  return limit;
}

export function readManifest(manifestPath) {
  try {
    return JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  } catch (error) {
    throw new SyncPlanningError([
      "No se pudo leer el manifiesto de la memoria.",
      safeErrorMessage(error)
    ]);
  }
}

export function validateAutomation(manifest) {
  const details = [];
  if (manifest.automation?.enabled !== true) {
    details.push("automation.enabled debe estar activado.");
  }
  if (manifest.automation?.requiresMergedChange !== true) {
    details.push("automation.requiresMergedChange debe ser true.");
  }
  if (!manifest.automation?.reviewBranch) {
    details.push("automation.reviewBranch debe indicar una rama.");
  }
  if (details.length > 0) {
    throw new SyncPlanningError(details);
  }
}

export function parseGitHubRepository(remoteUrl) {
  if (typeof remoteUrl !== "string" || remoteUrl.trim() === "") {
    throw new SyncPlanningError([
      "source.remoteUrl debe indicar un repositorio de GitHub."
    ]);
  }

  const value = remoteUrl.trim();
  let repositoryPath;
  const scpMatch = value.match(/^git@github\.com:([^?#]+)$/i);
  if (scpMatch) {
    repositoryPath = scpMatch[1];
  } else {
    try {
      const url = new URL(value);
      if (url.hostname.toLowerCase() !== "github.com") {
        throw new Error("Proveedor no compatible");
      }
      repositoryPath = url.pathname.replace(/^\/+/, "");
    } catch {
      throw new SyncPlanningError([
        "source.remoteUrl no es una URL compatible de GitHub."
      ]);
    }
  }

  const parts = repositoryPath.replace(/\.git\/?$/i, "").split("/");
  if (
    parts.length !== 2 ||
    parts.some((part) => !/^[A-Za-z0-9_.-]+$/.test(part))
  ) {
    throw new SyncPlanningError([
      "source.remoteUrl no identifica owner/repository en GitHub."
    ]);
  }
  return `${parts[0]}/${parts[1]}`;
}

export function readReviewedPullRequests(ledgerPath, repository) {
  let content;
  try {
    const stats = fs.lstatSync(ledgerPath);
    if (!stats.isFile() || stats.isSymbolicLink()) {
      throw new Error("La ruta no es un archivo Markdown regular.");
    }
    content = fs.readFileSync(ledgerPath, "utf8");
  } catch (error) {
    throw new SyncPlanningError([
      `No se pudo leer el registro: ${ledgerPath}`,
      safeErrorMessage(error)
    ]);
  }

  const lines = content.split(/\r?\n/);
  const headerIndex = lines.findIndex((line) =>
    isLedgerHeader(parseTableRow(line))
  );
  if (
    headerIndex < 0 ||
    !isTableSeparator(parseTableRow(lines[headerIndex + 1] ?? ""))
  ) {
    throw new SyncPlanningError([
      "El registro de sincronización no contiene la tabla canónica esperada."
    ]);
  }

  const reviewed = new Set();
  for (const line of lines.slice(headerIndex + 2)) {
    const cells = parseTableRow(line);
    if (!cells) {
      if (line.trim() !== "") {
        break;
      }
      continue;
    }
    if (cells.length < 5 || cells[1] !== "Revisado") {
      continue;
    }
    const number = parseReviewedLink(cells[0], repository);
    if (number !== null) {
      reviewed.add(number);
    }
  }
  return reviewed;
}

function parseTableRow(line) {
  const trimmed = line.trim();
  if (!trimmed.startsWith("|") || !trimmed.endsWith("|")) {
    return null;
  }
  return trimmed
    .slice(1, -1)
    .split("|")
    .map((cell) => cell.trim());
}

function isLedgerHeader(cells) {
  if (!cells || cells.length < 5) {
    return false;
  }
  const acceptedHeaders = [
    ["Cambio", "Estado", "Fecha", "Resultado", "Commit de memoria"],
    ["PR", "Estado", "Fecha de revisión", "Resultado", "Commit de memoria"]
  ];
  return acceptedHeaders.some((headers) =>
    headers.every((heading, index) => cells[index] === heading)
  );
}

function isTableSeparator(cells) {
  return (
    cells?.length >= 5 &&
    cells.slice(0, 5).every((cell) => /^:?-{3,}:?$/.test(cell))
  );
}

function parseReviewedLink(cell, repository) {
  const link = cell.match(
    /^\[[^\]]+\]\((https:\/\/github\.com\/[^\s)]+)\)$/i
  );
  if (!link) {
    return null;
  }
  try {
    const url = new URL(link[1]);
    const match = url.pathname.match(
      /^\/([^/]+)\/([^/]+)\/pull\/(\d+)\/?$/i
    );
    if (!match) {
      return null;
    }
    const linkedRepository = `${match[1]}/${match[2]}`;
    if (linkedRepository.toLowerCase() !== repository.toLowerCase()) {
      return null;
    }
    const number = Number(match[3]);
    return Number.isSafeInteger(number) && number > 0 ? number : null;
  } catch {
    return null;
  }
}

function queryMergedPullRequests({ repository, branch, limit, runCommand }) {
  let output;
  try {
    output = runCommand("gh", [
      "pr",
      "list",
      "--repo",
      repository,
      "--state",
      "merged",
      "--base",
      branch,
      "--limit",
      String(limit),
      "--json",
      "number,title,url,mergedAt,mergeCommit"
    ]);
  } catch (error) {
    throw new SyncPlanningError([
      "No se pudieron consultar los Pull Requests fusionados con gh.",
      "Comprueba que GitHub CLI esté instalado y autenticado.",
      safeErrorMessage(error)
    ]);
  }

  let values;
  try {
    values = JSON.parse(String(output));
  } catch {
    throw new SyncPlanningError([
      "GitHub CLI devolvió una respuesta que no es JSON válido."
    ]);
  }
  if (!Array.isArray(values)) {
    throw new SyncPlanningError([
      "GitHub CLI no devolvió una lista de Pull Requests."
    ]);
  }

  const unique = new Map();
  for (const value of values) {
    const normalized = normalizePullRequest(value);
    if (normalized) {
      unique.set(normalized.number, normalized);
    }
  }
  return [...unique.values()];
}

function normalizePullRequest(value) {
  if (
    !Number.isSafeInteger(value?.number) ||
    value.number < 1 ||
    typeof value.title !== "string" ||
    typeof value.url !== "string" ||
    typeof value.mergedAt !== "string" ||
    Number.isNaN(Date.parse(value.mergedAt))
  ) {
    return null;
  }
  const mergeCommit =
    typeof value.mergeCommit === "string"
      ? value.mergeCommit
      : typeof value.mergeCommit?.oid === "string"
        ? value.mergeCommit.oid
        : null;
  return {
    number: value.number,
    title: value.title,
    url: value.url,
    mergedAt: value.mergedAt,
    mergeCommit
  };
}

function comparePullRequests(left, right) {
  const byDate = Date.parse(left.mergedAt) - Date.parse(right.mergedAt);
  return byDate === 0 ? left.number - right.number : byDate;
}

function findReviewBaseline(merged, reviewed) {
  const reviewedInWindow = merged
    .filter((pullRequest) => reviewed.has(pullRequest.number))
    .sort(comparePullRequests);
  return reviewedInWindow.at(-1) ?? null;
}

function runExternalCommand(command, args) {
  return execFileSync(command, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });
}

function safeErrorMessage(error) {
  if (error?.code === "ENOENT") {
    return "Comando o archivo no encontrado.";
  }
  return error instanceof Error ? error.message : String(error);
}

export class SyncPlanningError extends Error {
  constructor(details) {
    super(details[0]);
    this.name = "SyncPlanningError";
    this.details = details;
  }
}
