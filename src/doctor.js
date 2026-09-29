import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import Ajv2020 from "ajv/dist/2020.js";

const SOURCE_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_SCHEMA_PATH = path.resolve(
  SOURCE_DIRECTORY,
  "../schemas/project-memory.schema.json"
);

const MANIFEST_NAMES = [
  "project-memory.json",
  "project-memory.local.json",
  "project-memory.example.json"
];

const REQUIRED_DIRECTORIES = [
  "00-INICIO",
  "01-PRODUCTO",
  "02-ARQUITECTURA",
  "03-IMPLEMENTACION",
  "04-DECISIONES",
  "05-ENTREGAS",
  "06-OPERACION",
  "07-AGENTES",
  "08-RECURSOS",
  "09-ARCHIVO"
];

const REQUIRED_NOTES = [
  "00-INICIO/Inicio del proyecto.md",
  "00-INICIO/Mapa de la memoria.md",
  "00-INICIO/Estado actual.md",
  "00-INICIO/Fuentes de verdad.md",
  "00-INICIO/Mantenimiento de la memoria.md",
  "00-INICIO/Registro de sincronización.md"
];

const IGNORED_DIRECTORIES = new Set([
  ".git",
  ".obsidian",
  ".trash",
  "node_modules"
]);

const TEXT_EXTENSIONS = new Set([
  ".json",
  ".md",
  ".text",
  ".toml",
  ".txt",
  ".yaml",
  ".yml"
]);

const SECRET_PATTERNS = [
  {
    name: "clave privada",
    pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/
  },
  {
    name: "token de GitHub",
    pattern: /\bgh[pousr]_[A-Za-z0-9]{20,}\b/
  },
  {
    name: "clave de acceso de AWS",
    pattern: /\bAKIA[0-9A-Z]{16}\b/
  },
  {
    name: "asignación sensible",
    pattern:
      /\b(?:password|passwd|api[_-]?key|secret|token)\b\s*[:=]\s*["']?[^\s"'{}]{8,}/i
  }
];

export async function diagnoseMemory(targetPath, options = {}) {
  const report = createReport();
  const resolvedTarget = path.resolve(targetPath);
  const manifestPath = resolveManifestPath(
    resolvedTarget,
    options.manifestPath
  );

  if (!manifestPath) {
    addCheck(
      report,
      "manifest-presence",
      "error",
      "No se encontró un manifiesto de memoria.",
      MANIFEST_NAMES
    );
    return finishReport(report);
  }

  report.manifestPath = manifestPath;
  addCheck(
    report,
    "manifest-presence",
    "pass",
    "Manifiesto encontrado."
  );

  const manifest = readJson(manifestPath, report, "manifest-json");
  if (!manifest) {
    return finishReport(report);
  }

  const schemaPath = path.resolve(options.schemaPath ?? DEFAULT_SCHEMA_PATH);
  const schema = readJson(schemaPath, report, "schema-json");
  if (!schema) {
    return finishReport(report);
  }

  validateManifest(manifest, schema, report);
  checkManifestUrls(manifest, report);

  if (hasErrors(report)) {
    return finishReport(report);
  }

  const sourcePath = resolveConfiguredPath(
    path.dirname(manifestPath),
    manifest.source.repositoryPath
  );
  report.sourcePath = sourcePath;
  checkSourceRepository(sourcePath, report);

  const structure = resolveStructure(manifest.memory.layout);
  report.layoutProfile = structure.profile;

  const vaultPath = resolveConfiguredPath(
    path.dirname(manifestPath),
    manifest.memory.vaultPath
  );
  report.vaultPath = vaultPath;

  if (!isDirectory(vaultPath)) {
    addCheck(
      report,
      "vault-presence",
      "error",
      "La ruta configurada para la bóveda no existe o no es un directorio.",
      [vaultPath]
    );
    return finishReport(report);
  }

  addCheck(report, "vault-presence", "pass", "Bóveda accesible.");

  checkStructure(vaultPath, structure, report);

  const textFiles = collectTextFiles(vaultPath);
  checkTemplateVariables(textFiles, vaultPath, report);
  checkLinks(textFiles, vaultPath, report);
  checkSecrets(textFiles, vaultPath, report);
  checkGit(vaultPath, manifest.memory.syncMode, report);

  return finishReport(report);
}

function createReport() {
  return {
    status: "ok",
    manifestPath: null,
    sourcePath: null,
    vaultPath: null,
    layoutProfile: null,
    checks: [],
    summary: {
      errors: 0,
      warnings: 0,
      passed: 0,
      info: 0
    }
  };
}

function addCheck(report, id, level, message, details = []) {
  report.checks.push({ id, level, message, details });
}

function finishReport(report) {
  report.summary = {
    errors: report.checks.filter((check) => check.level === "error").length,
    warnings: report.checks.filter((check) => check.level === "warning").length,
    passed: report.checks.filter((check) => check.level === "pass").length,
    info: report.checks.filter((check) => check.level === "info").length
  };

  if (report.summary.errors > 0) {
    report.status = "error";
  } else if (report.summary.warnings > 0) {
    report.status = "warning";
  } else {
    report.status = "ok";
  }

  return report;
}

function hasErrors(report) {
  return report.checks.some((check) => check.level === "error");
}

function resolveManifestPath(targetPath, explicitManifestPath) {
  if (explicitManifestPath) {
    const explicit = path.resolve(explicitManifestPath);
    return isFile(explicit) ? explicit : null;
  }

  if (isFile(targetPath)) {
    return targetPath;
  }

  if (!isDirectory(targetPath)) {
    return null;
  }

  for (const name of MANIFEST_NAMES) {
    const candidate = path.join(targetPath, name);
    if (isFile(candidate)) {
      return candidate;
    }
  }

  return null;
}

function readJson(filePath, report, checkId) {
  try {
    const value = JSON.parse(fs.readFileSync(filePath, "utf8"));
    addCheck(report, checkId, "pass", `JSON válido: ${path.basename(filePath)}`);
    return value;
  } catch (error) {
    addCheck(report, checkId, "error", "No se pudo leer JSON válido.", [
      filePath,
      error.message
    ]);
    return null;
  }
}

function validateManifest(manifest, schema, report) {
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  const validate = ajv.compile(schema);

  if (validate(manifest)) {
    addCheck(
      report,
      "manifest-schema",
      "pass",
      "El manifiesto cumple el esquema v1."
    );
    return;
  }

  const details = (validate.errors ?? []).map((error) => {
    const location = error.instancePath || "/";
    return `${location}: ${error.message}`;
  });

  addCheck(
    report,
    "manifest-schema",
    "error",
    "El manifiesto no cumple el esquema v1.",
    details
  );
}

function checkManifestUrls(manifest, report) {
  const urls = [
    { field: "source.remoteUrl", value: manifest.source?.remoteUrl },
    {
      field: "memory.repositoryRemote",
      value: manifest.memory?.repositoryRemote
    }
  ].filter((candidate) => Boolean(candidate.value));
  const unsafe = urls.filter((candidate) =>
    hasEmbeddedCredentials(candidate.value)
  );

  if (unsafe.length > 0) {
    addCheck(
      report,
      "manifest-credentials",
      "error",
      "El manifiesto contiene una URL con posibles credenciales.",
      unsafe.map((candidate) => candidate.field)
    );
    return;
  }

  addCheck(
    report,
    "manifest-credentials",
    "pass",
    "No se detectaron credenciales incrustadas en URLs."
  );
}

function hasEmbeddedCredentials(value) {
  try {
    const url = new URL(value);
    const sensitiveQueryKeys = [
      "access_token",
      "api_key",
      "apikey",
      "auth",
      "password",
      "secret",
      "token"
    ];

    return (
      Boolean(url.username || url.password) ||
      sensitiveQueryKeys.some((key) => url.searchParams.has(key))
    );
  } catch {
    return /(?:access_token|api_key|password|secret|token)=/i.test(value);
  }
}

function resolveConfiguredPath(baseDirectory, configuredPath) {
  return path.isAbsolute(configuredPath)
    ? path.normalize(configuredPath)
    : path.resolve(baseDirectory, configuredPath);
}

function checkSourceRepository(sourcePath, report) {
  if (!isDirectory(sourcePath)) {
    addCheck(
      report,
      "source-repository",
      "warning",
      "El repositorio fuente configurado no está disponible en esta máquina.",
      [sourcePath]
    );
    return;
  }

  const gitRoot = runGit(sourcePath, ["rev-parse", "--show-toplevel"]);
  if (!gitRoot.ok) {
    addCheck(
      report,
      "source-repository",
      "warning",
      "La ruta fuente existe, pero no pertenece a un repositorio Git.",
      [sourcePath]
    );
    return;
  }

  addCheck(
    report,
    "source-repository",
    "pass",
    "Repositorio fuente accesible.",
    [gitRoot.stdout]
  );
}

function resolveStructure(layout) {
  if (layout?.profile === "declared") {
    return {
      profile: "declared",
      requiredDirectories: layout.requiredDirectories,
      requiredNotes: layout.requiredNotes
    };
  }

  return {
    profile: "canonical-v1",
    requiredDirectories: REQUIRED_DIRECTORIES,
    requiredNotes: REQUIRED_NOTES
  };
}

function checkStructure(vaultPath, structure, report) {
  const missingDirectories = structure.requiredDirectories.filter(
    (relativePath) => !isDirectory(path.join(vaultPath, relativePath))
  );

  if (missingDirectories.length > 0) {
    addCheck(
      report,
      "vault-directories",
      "error",
      `Faltan carpetas requeridas por el perfil ${structure.profile}.`,
      missingDirectories
    );
  } else {
    addCheck(
      report,
      "vault-directories",
      "pass",
      `Las carpetas requeridas por ${structure.profile} están presentes.`
    );
  }

  const missingNotes = structure.requiredNotes.filter(
    (relativePath) => !isFile(path.join(vaultPath, relativePath))
  );

  if (missingNotes.length > 0) {
    addCheck(
      report,
      "vault-notes",
      "error",
      "Faltan notas fundamentales.",
      missingNotes
    );
  } else {
    addCheck(
      report,
      "vault-notes",
      "pass",
      "Las notas fundamentales están presentes."
    );
  }
}

function collectTextFiles(rootDirectory) {
  const files = [];
  const pending = [rootDirectory];

  while (pending.length > 0) {
    const current = pending.pop();

    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) {
        continue;
      }

      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (!IGNORED_DIRECTORIES.has(entry.name)) {
          pending.push(fullPath);
        }
        continue;
      }

      if (
        entry.isFile() &&
        TEXT_EXTENSIONS.has(path.extname(entry.name).toLowerCase()) &&
        fs.statSync(fullPath).size <= 1_000_000
      ) {
        files.push(fullPath);
      }
    }
  }

  return files.sort();
}

function checkTemplateVariables(files, vaultPath, report) {
  const findings = [];
  const pattern = /\{\{[A-Z][A-Z0-9_]*\}\}/g;

  for (const filePath of files) {
    const content = fs.readFileSync(filePath, "utf8");
    const matches = [...new Set(content.match(pattern) ?? [])];
    if (matches.length > 0) {
      findings.push(
        `${relativeDisplay(vaultPath, filePath)}: ${matches.join(", ")}`
      );
    }
  }

  if (findings.length > 0) {
    addCheck(
      report,
      "template-variables",
      "error",
      "Quedan variables de plantilla sin reemplazar.",
      findings
    );
  } else {
    addCheck(
      report,
      "template-variables",
      "pass",
      "No quedan variables de plantilla."
    );
  }
}

function checkLinks(files, vaultPath, report) {
  const markdownFiles = files.filter(
    (filePath) => path.extname(filePath).toLowerCase() === ".md"
  );
  const indexes = buildMarkdownIndexes(markdownFiles, vaultPath);
  const broken = [];
  const ambiguous = [];

  for (const filePath of markdownFiles) {
    const content = maskMarkdownCode(fs.readFileSync(filePath, "utf8"));
    checkWikiLinks(content, filePath, vaultPath, indexes, broken, ambiguous);
    checkMarkdownLinks(content, filePath, vaultPath, broken);
  }

  if (broken.length > 0) {
    addCheck(
      report,
      "markdown-links",
      "error",
      "Se encontraron enlaces internos rotos.",
      broken
    );
  } else {
    addCheck(
      report,
      "markdown-links",
      "pass",
      "Los enlaces internos resolvibles son válidos."
    );
  }

  if (ambiguous.length > 0) {
    addCheck(
      report,
      "ambiguous-links",
      "warning",
      "Existen enlaces Wiki con destinos ambiguos.",
      ambiguous
    );
  } else {
    addCheck(
      report,
      "ambiguous-links",
      "pass",
      "No se encontraron enlaces Wiki ambiguos."
    );
  }
}

function maskMarkdownCode(content) {
  return content
    .replace(/```[\s\S]*?```/g, "")
    .replace(/~~~[\s\S]*?~~~/g, "")
    .replace(/(`+)[^`\n]*?\1/g, "");
}

function buildMarkdownIndexes(files, vaultPath) {
  const byRelativePath = new Set();
  const byBaseName = new Map();

  for (const filePath of files) {
    const relativePath = normalizeRelativePath(
      path.relative(vaultPath, filePath).replace(/\.md$/i, "")
    );
    const baseName = path.basename(filePath, ".md");
    byRelativePath.add(relativePath);

    const matches = byBaseName.get(baseName) ?? [];
    matches.push(relativePath);
    byBaseName.set(baseName, matches);
  }

  return { byRelativePath, byBaseName };
}

function checkWikiLinks(
  content,
  filePath,
  vaultPath,
  indexes,
  broken,
  ambiguous
) {
  const pattern = /\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]/g;
  let match;

  while ((match = pattern.exec(content)) !== null) {
    const rawTarget = match[1].trim().replace(/\.md$/i, "");
    const normalizedTarget = normalizeRelativePath(rawTarget);
    const source = relativeDisplay(vaultPath, filePath);

    if (normalizedTarget.includes("/")) {
      if (!indexes.byRelativePath.has(normalizedTarget)) {
        broken.push(`${source} -> [[${rawTarget}]]`);
      }
      continue;
    }

    const candidates = indexes.byBaseName.get(normalizedTarget) ?? [];
    if (candidates.length === 0) {
      broken.push(`${source} -> [[${rawTarget}]]`);
    } else if (candidates.length > 1) {
      ambiguous.push(`${source} -> [[${rawTarget}]]`);
    }
  }
}

function checkMarkdownLinks(content, filePath, vaultPath, broken) {
  const pattern = /!?\[[^\]]*\]\(([^)]+)\)/g;
  let match;

  while ((match = pattern.exec(content)) !== null) {
    const target = match[1].trim().replace(/^<|>$/g, "");
    if (
      target.startsWith("#") ||
      /^(?:https?:|mailto:|data:|obsidian:)/i.test(target)
    ) {
      continue;
    }

    const withoutFragment = target.split(/[?#]/, 1)[0];
    if (!withoutFragment) {
      continue;
    }

    let decoded;
    try {
      decoded = decodeURIComponent(withoutFragment);
    } catch {
      decoded = withoutFragment;
    }

    const resolved = path.resolve(path.dirname(filePath), decoded);
    if (!fs.existsSync(resolved)) {
      broken.push(
        `${relativeDisplay(vaultPath, filePath)} -> (${withoutFragment})`
      );
    }
  }
}

function checkSecrets(files, vaultPath, report) {
  const findings = [];

  for (const filePath of files) {
    const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
    lines.forEach((line, index) => {
      for (const candidate of SECRET_PATTERNS) {
        if (candidate.pattern.test(line)) {
          findings.push(
            `${relativeDisplay(vaultPath, filePath)}:${index + 1} (${candidate.name})`
          );
        }
      }
    });
  }

  if (findings.length > 0) {
    addCheck(
      report,
      "secret-scan",
      "error",
      "Se detectaron patrones sensibles de alta confianza.",
      findings
    );
  } else {
    addCheck(
      report,
      "secret-scan",
      "pass",
      "No se detectaron secretos de alta confianza."
    );
  }
}

function checkGit(vaultPath, syncMode, report) {
  if (syncMode === "none") {
    addCheck(
      report,
      "git",
      "info",
      "El manifiesto no requiere sincronización Git."
    );
    return;
  }

  const root = runGit(vaultPath, ["rev-parse", "--show-toplevel"]);
  if (!root.ok) {
    addCheck(
      report,
      "git-repository",
      "warning",
      "La bóveda no pertenece a un repositorio Git."
    );
    return;
  }

  addCheck(
    report,
    "git-repository",
    "pass",
    "Repositorio Git detectado.",
    [root.stdout]
  );

  const status = runGit(vaultPath, ["status", "--porcelain"]);
  if (status.ok && status.stdout) {
    addCheck(
      report,
      "git-cleanliness",
      "warning",
      "La bóveda tiene cambios locales.",
      status.stdout.split("\n")
    );
  } else {
    addCheck(
      report,
      "git-cleanliness",
      "pass",
      "El árbol de trabajo está limpio."
    );
  }

  const remotes = runGit(vaultPath, ["remote"]);
  if (!remotes.ok || !remotes.stdout) {
    addCheck(
      report,
      "git-remote",
      "warning",
      "No hay un remoto Git configurado."
    );
  } else {
    addCheck(
      report,
      "git-remote",
      "pass",
      "Existe al menos un remoto Git.",
      remotes.stdout.split("\n")
    );
  }

  const upstream = runGit(vaultPath, [
    "rev-parse",
    "--abbrev-ref",
    "--symbolic-full-name",
    "@{upstream}"
  ]);

  if (!upstream.ok) {
    addCheck(
      report,
      "git-upstream",
      "warning",
      "La rama actual no tiene upstream configurado."
    );
    return;
  }

  const divergence = runGit(vaultPath, [
    "rev-list",
    "--left-right",
    "--count",
    "HEAD...@{upstream}"
  ]);

  if (!divergence.ok) {
    addCheck(
      report,
      "git-upstream",
      "warning",
      "No se pudo comparar la rama actual con su upstream."
    );
    return;
  }

  const [ahead = "0", behind = "0"] = divergence.stdout.split(/\s+/);
  const level = behind === "0" ? "pass" : "warning";
  addCheck(
    report,
    "git-upstream",
    level,
    behind === "0"
      ? "La rama local no está detrás de su upstream conocido."
      : "La rama local está detrás de su upstream conocido.",
    [`ahead=${ahead}`, `behind=${behind}`]
  );
}

function runGit(directory, args) {
  try {
    const stdout = execFileSync("git", ["-C", directory, ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    }).trim();
    return { ok: true, stdout };
  } catch {
    return { ok: false, stdout: "" };
  }
}

function normalizeRelativePath(value) {
  return value.split(path.sep).join("/").replace(/^\.\//, "");
}

function relativeDisplay(rootPath, filePath) {
  return normalizeRelativePath(path.relative(rootPath, filePath));
}

function isDirectory(candidate) {
  try {
    return fs.statSync(candidate).isDirectory();
  } catch {
    return false;
  }
}

function isFile(candidate) {
  try {
    return fs.statSync(candidate).isFile();
  } catch {
    return false;
  }
}
