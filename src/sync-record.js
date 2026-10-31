import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { diagnoseMemory } from "./doctor.js";
import { inspectMemorySync } from "./sync-inspect.js";
import { parseGitHubRepository, validateAutomation } from "./sync.js";
import { appendLedgerRecord, parseWritableLedger } from "./sync-ledger.js";
import { containsSensitiveData, isCredentialPath } from "./sensitive-data.js";
import { sameGitRoot, relativeGitPath, sameSyncText, syncWriteLockPath } from "./sync-files.js";

export const RECORD_LIMITS = Object.freeze({ ledger: 1024 * 1024, note: 1024 * 1024,
  notes: 20, totalNotes: 5 * 1024 * 1024, manifest: 1024 * 1024, git: 5 * 1024 * 1024 });
export const LEDGER_PATH = "00-INICIO/Registro de sincronización.md";
export const RECORD_CONCURRENCY_NOTICE = "Evita editar o sincronizar la memoria durante --apply: el bloqueo no controla editores externos.";
const ACK_CODES = new Set(["text-limit", "unsafe-reference"]);
const CANONICAL_DIRS = ["00-INICIO", "01-PRODUCTO", "02-ARQUITECTURA", "03-IMPLEMENTACION",
  "04-DECISIONES", "05-ENTREGAS", "06-OPERACION", "07-AGENTES", "08-RECURSOS", "09-ARCHIVO"];

export class SyncRecordError extends Error {
  constructor(code, message, status = "error") {
    super(message);
    this.name = "SyncRecordError";
    this.code = code;
    this.status = status;
  }
}

const fail = (code, message, status) => { throw new SyncRecordError(code, message, status); };

export function recordErrorReport(error) {
  const safe = error instanceof SyncRecordError ? error
    : new SyncRecordError("record-error", "No se pudo completar el registro de forma segura.");
  return { command: "sync record", status: safe.status, code: safe.code,
    details: [safe.message], wrote: false, concurrencyNotice: RECORD_CONCURRENCY_NOTICE };
}

export async function recordMemorySync(options = {}, context = {}) {
  const input = validateOptions(options);
  try {
    return await prepareAndRecord(input, context);
  } catch (error) {
    if (error instanceof SyncRecordError) throw error;
    // Provider output, filesystem messages and paths are deliberately not echoed.
    fail("record-error", "No se pudo completar el registro; revisa permisos, configuración y estado de la memoria.");
  }
}

async function prepareAndRecord(input, context) {
  const target = path.resolve(input.targetPath ?? process.cwd());
  const explicitManifest = input.manifestPath ? path.resolve(input.manifestPath) : undefined;
  const candidate = explicitManifest ?? (fs.lstatSync(target).isFile() ? target
    : ["project-memory.json", "project-memory.local.json", "project-memory.example.json"]
      .map((name) => path.join(target, name)).find((file) => fs.existsSync(file)));
  if (!candidate) fail("manifest-missing", "No se encontró un manifiesto de memoria.", "blocked");
  // Bound the manifest before doctor parses it; do not let a large JSON bypass
  // the writer's preflight limits.
  const checkedManifestPath = regularPath(candidate);
  const preflightManifest = readRegular(checkedManifestPath, RECORD_LIMITS.manifest);
  let doctor;
  try {
    doctor = await (context.diagnoseMemory ?? diagnoseMemory)(target, {
      manifestPath: checkedManifestPath,
      schemaPath: context.schemaPath
    });
  } catch { fail("doctor-error", "No se pudo diagnosticar la memoria."); }
  if (!["ok", "warning"].includes(doctor.status) || !doctor.vaultPath || !doctor.manifestPath) {
    fail("doctor-error", "La memoria no superó project-memory doctor.", "blocked");
  }
  if (fs.lstatSync(doctor.vaultPath).isSymbolicLink()) fail("unsafe-path", "La bóveda no puede ser un enlace simbólico.", "conflict");
  const vault = fs.realpathSync(doctor.vaultPath);
  const manifestPath = regularPath(doctor.manifestPath);
  if (containsSensitiveData(vault) || /[\u0000-\u001f\u007f-\u009f]/.test(vault)) fail("unsafe-path", "La ruta de memoria no puede mostrarse de forma segura.");
  const ledgerPath = safeJoin(vault, LEDGER_PATH);
  const ledgerFile = readRegular(ledgerPath, RECORD_LIMITS.ledger);
  const manifestFile = readRegular(manifestPath, RECORD_LIMITS.manifest);
  if (manifestPath !== checkedManifestPath || manifestFile.hash !== preflightManifest.hash) fail("manifest-change", "El manifiesto cambió durante el diagnóstico.", "conflict");
  const manifest = JSON.parse(manifestFile.text);
  validateAutomation(manifest);
  const repository = parseGitHubRepository(manifest.source?.remoteUrl);
  if (containsSensitiveData(manifestFile.text) || /[\u0000-\u001f\u007f-\u009f]/.test(repository)) fail("unsafe-config", "El manifiesto contiene valores inseguros.");
  let ledger;
  try { ledger = parseWritableLedger(ledgerFile.text, repository); }
  catch { fail("invalid-ledger", "La tabla del registro es ambigua, incompleta o incompatible.", "conflict"); }
  const result = input.outcome === "no-documentation-change" ? "Sin cambios documentales"
    : `${input.summary}; Notas: ${input.notes.join(", ")}`;
  const existing = ledger.records.get(input.pr);
  if (existing && (existing.state !== "Revisado" || existing.result !== result)) {
    fail("record-conflict", "El PR ya tiene un registro diferente o incompleto; no se sobrescribirá.", "conflict");
  }
  const unchanged = Boolean(existing);
  const noteFiles = input.notes.map((note) => {
    validateNoteArea(note, manifest.memory?.layout);
    const file = readRegular(safeJoin(vault, note), RECORD_LIMITS.note);
    validateNote(file.text, vault, note);
    return { note, file };
  });
  if (noteFiles.reduce((total, item) => total + item.file.bytes.length, 0) > RECORD_LIMITS.totalNotes) fail("notes-limit", "Las notas exceden el límite total permitido.", "blocked");
  const git = gitState(vault);
  requireTrackedLedger(vault);
  validateTrackedFlags(vault);
  if (!unchanged) {
    const ledgerHead = gitRead(vault, ["show", `HEAD:${LEDGER_PATH}`]);
    const ledgerIndex = gitRead(vault, ["show", `:${LEDGER_PATH}`]);
    if (!sameSyncText(ledgerHead, ledgerFile.text)
      || ledgerIndex !== ledgerHead) fail("dirty-ledger", "El registro debe estar limpio tanto en HEAD como en staging.", "conflict");
  }
  validateChanges(git.changes, input, unchanged, vault, ledgerFile.text, existing, repository);
  validateDiffs(vault, input.notes, git.changes);
  // Discount only a diagnosed dirty-tree warning after exact-path validation.
  const remainingChecks = (doctor.checks ?? []).filter((check) => !(check.level === "warning"
    && check.id === "git-cleanliness" && git.changes.length > 0));
  const warnings = remainingChecks.filter((check) => check.level === "warning");
  if (warnings.length || doctor.status === "warning" && !(doctor.checks?.some((c) => c.level === "warning"))) {
    fail("doctor-warning", "Hay advertencias de diagnóstico ajenas a las notas autorizadas.", "blocked");
  }
  const cachedDoctor = { ...doctor, status: "ok", checks: remainingChecks };
  const files = [ledgerPath, manifestPath, ...noteFiles.map((item) => item.file.path)];
  const before = captureState(vault, files);
  assertSnapshot(git, before.git);
  const initialFiles = [ledgerFile, manifestFile, ...noteFiles.map((item) => item.file)];
  for (const file of initialFiles) {
    const captured = before.files.find((item) => item.path === file.path);
    assertSnapshot({ hash: file.hash, identity: file.identity }, { hash: captured.hash, identity: captured.identity });
  }
  // One bounded inspector execution: identity validation always runs, including no-op.
  let inspection;
  try {
    inspection = await inspectMemorySync({ targetPath: target, pr: input.pr,
      manifestPath, maxFiles: 1000 }, { ...context, diagnoseMemory: async () => cachedDoctor });
  } catch { fail("inspection-error", "No se pudo confirmar el PR integrado en GitHub.", "blocked"); }
  if (inspection.repository !== repository || inspection.branch !== manifest.automation.reviewBranch) {
    fail("inspection-conflict", "La identidad de la fuente cambió durante la revisión.", "conflict");
  }
  assertSnapshot(before, captureState(vault, files));
  if (!unchanged) requireEvidence(inspection, input.ackWarnings);
  const date = new Date((context.clock ?? Date.now)()).toISOString().slice(0, 10);
  const report = { command: "sync record", status: unchanged ? "unchanged" : "preview",
    repository, branch: inspection.branch, pr: input.pr, mergeCommit: inspection.pullRequest.mergeCommit,
    ledgerPath, outcome: input.outcome, result, notes: input.notes,
    date: existing?.date ?? date, acknowledgedWarnings: unchanged ? [] : input.ackWarnings,
    wrote: false, concurrencyNotice: RECORD_CONCURRENCY_NOTICE };
  if (unchanged) return report;
  const proposal = appendLedgerRecord(ledger, { repository, pr: input.pr, date, result });
  if (Buffer.byteLength(proposal) > RECORD_LIMITS.ledger) fail("ledger-limit", "La fila excedería el tamaño permitido del registro.", "blocked");
  // Validate the complete document before touching the filesystem.
  try { parseWritableLedger(proposal, repository); }
  catch { fail("invalid-proposal", "La fila propuesta no produce un registro válido.", "blocked"); }
  if (!input.apply) return report;
  return applyRecord({ vault, files, before, ledgerFile, proposal, report }, context);
}

function validateOptions(options) {
  const keys = new Set(["targetPath", "manifestPath", "pr", "outcome", "reviewed", "summary", "notes", "ackWarnings", "apply"]);
  if (Object.keys(options).some((key) => !keys.has(key))) fail("invalid-option", "Opción desconocida de sync record.");
  const number = typeof options.pr === "number" || typeof options.pr === "string" && /^[1-9]\d*$/.test(options.pr) ? Number(options.pr) : NaN;
  if (!Number.isSafeInteger(number) || number < 1 || options.reviewed !== true
    || !["no-documentation-change", "documentation-updated"].includes(options.outcome)
    || options.apply !== undefined && typeof options.apply !== "boolean") {
    fail("invalid-option", "Indica un PR positivo, un resultado válido y --reviewed; --apply debe ser explícito.");
  }
  for (const key of ["targetPath", "manifestPath"]) if (options[key] !== undefined
    && (typeof options[key] !== "string" || !options[key] || /[\u0000-\u001f]/.test(options[key]) || containsSensitiveData(options[key]))) {
    fail("invalid-option", "La ruta de entrada no es válida.");
  }
  if (!Array.isArray(options.notes ?? []) || !Array.isArray(options.ackWarnings ?? [])
    || (options.notes?.length ?? 0) > RECORD_LIMITS.notes || (options.ackWarnings?.length ?? 0) > 2) fail("invalid-option", "Las listas superan los límites o no son válidas.");
  const notes = [...new Set(options.notes ?? [])].sort();
  for (const note of notes) if (!safeRelativeNote(note)) fail("invalid-option", "Una nota no es una ruta relativa Markdown segura.");
  const ackWarnings = [...new Set(options.ackWarnings ?? [])].sort();
  if (ackWarnings.some((code) => !ACK_CODES.has(code))) fail("invalid-option", "Solo se admiten text-limit y unsafe-reference como advertencias revisadas.");
  if (options.outcome === "no-documentation-change" && (notes.length || options.summary !== undefined)) fail("invalid-option", "Sin cambios documentales no admite resumen ni notas.");
  if (options.outcome === "documentation-updated" && (!notes.length || typeof options.summary !== "string"
    || options.summary.trim() !== options.summary || !options.summary.length || options.summary.length > 300 || !safeCell(options.summary))) {
    fail("invalid-option", "Notas actualizadas exige rutas exactas y un resumen seguro de 1–300 caracteres.");
  }
  return { ...options, pr: number, notes, ackWarnings };
}

function safeCell(value) {
  return !/[\u0000-\u001f\u007f-\u009f|`\[\]<>\\]/.test(value)
    && !/(?:https?:|data:|mailto:)/i.test(value) && !containsSensitiveData(value);
}

function safeRelativeNote(note) {
  return typeof note === "string" && note.length <= 512 && note.trim() === note && note.endsWith(".md")
    && !path.posix.isAbsolute(note) && !/[*?:]/.test(note) && safeCell(note)
    && note.split("/").every((part) => part && ![".", ".."].includes(part))
    && !note.split("/").some((part) => part.startsWith(".") || /^(?:skills?|config(?:uration)?|node_modules|credentials?|secrets?)$/i.test(part))
    && !isCredentialPath(note) && note !== LEDGER_PATH;
}

function validateNoteArea(note, layout) {
  const dirs = layout?.profile === "declared" ? layout.requiredDirectories : CANONICAL_DIRS;
  if (!(dirs ?? []).some((dir) => note.startsWith(`${dir}/`))) fail("note-area", "Una nota queda fuera de las áreas declaradas.", "conflict");
}

function regularPath(input) {
  if (fs.lstatSync(input).isSymbolicLink()) fail("unsafe-path", "No se admiten archivos enlazados.", "conflict");
  const resolved = fs.realpathSync(input);
  assertNoSymlinks(resolved);
  return resolved;
}

function assertNoSymlinks(fullPath) {
  const parsed = path.parse(fullPath);
  let current = parsed.root;
  const parts = fullPath.slice(parsed.root.length).split(path.sep).filter(Boolean);
  for (let i = 0; i < parts.length; i++) {
    current = path.join(current, parts[i]);
    const stat = fs.lstatSync(current);
    if (stat.isSymbolicLink() || i < parts.length - 1 && !stat.isDirectory()) fail("unsafe-path", "Una ruta contiene enlaces o componentes incompatibles.", "conflict");
  }
}

function safeJoin(vault, relative) {
  const full = path.resolve(vault, relative);
  if (!full.startsWith(`${vault}${path.sep}`)) fail("unsafe-path", "La ruta escapa a la memoria.", "conflict");
  assertNoSymlinks(full);
  return full;
}

function readRegular(fullPath, limit, binary = false) {
  assertNoSymlinks(fullPath);
  const before = fs.lstatSync(fullPath);
  if (!before.isFile() || before.size > limit) fail("file-limit", "Un archivo no es regular o supera el límite permitido.", "blocked");
  const fd = fs.openSync(fullPath, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0));
  let bytes;
  try {
    const opened = fs.fstatSync(fd);
    if (opened.ino !== before.ino || opened.dev !== before.dev || !opened.isFile()
      || opened.size !== before.size || opened.mtimeMs !== before.mtimeMs || opened.ctimeMs !== before.ctimeMs) fail("changed-file", "Un archivo cambió mientras se leía.", "conflict");
    const buffer = Buffer.alloc(Math.min(limit + 1, before.size + 1));
    let offset = 0, received;
    do { received = fs.readSync(fd, buffer, offset, buffer.length - offset, offset); offset += received; }
    while (received && offset < buffer.length);
    if (offset > limit) fail("file-limit", "Un archivo supera el límite permitido.", "blocked");
    const after = fs.fstatSync(fd);
    if (after.size !== offset || after.mtimeMs !== opened.mtimeMs || after.ctimeMs !== opened.ctimeMs) fail("changed-file", "Un archivo cambió mientras se leía.", "conflict");
    bytes = buffer.subarray(0, offset);
  } finally { fs.closeSync(fd); }
  let text;
  if (!binary) {
    try { text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes); }
    catch { fail("invalid-text", "Un archivo no contiene texto UTF-8 válido.", "blocked"); }
  }
  return { path: fullPath, bytes, text, mode: before.mode & 0o777,
    identity: [before.dev, before.ino, before.mode, before.size, before.mtimeMs, before.ctimeMs], hash: digest(bytes) };
}

function validateNote(text, vault, note) {
  if (containsSensitiveData(text)) fail("sensitive-note", "Una nota contiene patrones sensibles; el registro se bloqueó.", "blocked");
  if (!text.endsWith("\n") || /[ \t]+\r?$/m.test(text) || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/.test(text)) fail("note-format", "Una nota necesita corregir su formato.", "blocked");
  const body = text.replace(/```[\s\S]*?```|~~~[\s\S]*?~~~/g, "").replace(/(`+)[^`\n]*?\1/g, "");
  for (const match of body.matchAll(/!?\[[^\]]*\]\(([^)]+)\)/g)) {
    const target = match[1].replace(/^<|>$/g, "");
    if (/^(?:#|https?:|mailto:|data:|obsidian:)/i.test(target)) continue;
    let decoded;
    try { decoded = decodeURIComponent(target.split(/[?#]/)[0]); } catch { fail("note-links", "Una nota contiene un enlace no resolvible.", "blocked"); }
    const relative = path.relative(vault, path.resolve(vault, path.dirname(note), decoded));
    safeJoin(vault, relative);
  }
  // Doctor checks Wiki links for ordinary notes; oversized notes need the same
  // check over their full content, without following linked directories.
  const wiki = [...body.matchAll(/\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]/g)];
  if (wiki.length) {
    const names = new Map(), pending = [vault];
    while (pending.length) {
      const dir = pending.pop();
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.isSymbolicLink() || entry.name.startsWith(".") || entry.name === "node_modules") continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) pending.push(full);
        else if (entry.isFile() && entry.name.endsWith(".md")) names.set(path.basename(entry.name, ".md"), (names.get(path.basename(entry.name, ".md")) ?? 0) + 1);
      }
    }
    for (const match of wiki) {
      const target = match[1].trim().replace(/\.md$/i, "");
      if (target.includes("/")) safeJoin(vault, `${target}.md`);
      else if (names.get(target) !== 1) fail("note-links", "Una nota tiene enlaces Wiki rotos o ambiguos.", "blocked");
    }
  }
}

function gitRead(vault, args) {
  try {
    const bytes = execFileSync("git", ["--no-optional-locks", "-c", "core.fsmonitor=false", "-C", vault, ...args],
      { timeout: 10_000, maxBuffer: RECORD_LIMITS.git, stdio: ["ignore", "pipe", "pipe"] });
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch { fail("git-error", "No se pudo inspeccionar Git de forma segura.", "conflict"); }
}

function gitState(vault, ignored = []) {
  const root = gitRead(vault, ["rev-parse", "--show-toplevel"]).trim();
  if (!sameGitRoot(root, vault)) fail("git-root", "La bóveda debe tener su propio repositorio Git.", "conflict");
  const head = gitRead(vault, ["rev-parse", "HEAD"]).trim();
  const raw = gitRead(vault, ["status", "--porcelain=v1", "-z", "--untracked-files=all"]);
  const changes = [];
  const items = raw.split("\0");
  for (let index = 0; index < items.length; index++) {
    const item = items[index];
    if (!item) continue;
    const state = item.slice(0, 2), name = item.slice(3);
    if (/[RC]/.test(state)) index++;
    if (!ignored.includes(name)) changes.push({ state, path: name });
  }
  const indexPath = path.resolve(vault, gitRead(vault, ["rev-parse", "--git-path", "index"]).trim());
  const index = readRegular(indexPath, RECORD_LIMITS.git, true);
  return { head, changes, index: { hash: index.hash, identity: index.identity } };
}

function requireTrackedLedger(vault) {
  const entries = gitRead(vault, ["ls-files", "--stage", "-z", "--", LEDGER_PATH]).split("\0").filter(Boolean);
  if (entries.length !== 1 || !/^100(?:644|755) [a-f0-9]+ 0\t/.test(entries[0])) fail("untracked-ledger", "El registro debe estar versionado y sin conflictos.", "conflict");
}

function validateTrackedFlags(vault) {
  const entries = gitRead(vault, ["ls-files", "-v", "-z"]).split("\0").filter(Boolean);
  if (entries.some((entry) => entry[0] === "S" || /[a-z]/.test(entry[0]))) {
    fail("hidden-git-changes", "Hay archivos con assume-unchanged o skip-worktree; no se puede comprobar la limpieza.", "conflict");
  }
}

function validateChanges(changes, input, unchanged, vault, content, existing, repository) {
  for (const change of changes) {
    if (unchanged && change.path === LEDGER_PATH && /^[ M]{2}$/.test(change.state)) {
      const base = gitRead(vault, ["show", `HEAD:${LEDGER_PATH}`]);
      let parsed;
      try { parsed = parseWritableLedger(base, repository); } catch { fail("dirty-ledger", "El registro tiene cambios locales ajenos.", "conflict"); }
      if (parsed.records.has(input.pr) || !sameSyncText(appendLedgerRecord(parsed, {
        repository, pr: input.pr, date: existing.date, result: existing.result
      }), content)) fail("dirty-ledger", "El registro tiene cambios locales ajenos.", "conflict");
      const staged = gitRead(vault, ["show", `:${LEDGER_PATH}`]);
      if (staged !== base && !sameSyncText(staged, content)) fail("dirty-ledger", "El registro tiene cambios ajenos en staging.", "conflict");
      continue;
    }
    if (!input.notes.includes(change.path) || ![" M", "M ", "MM", "A ", "AM", "??"].includes(change.state)) {
      fail("foreign-changes", "Hay cambios locales ajenos o incompatibles; no se registrará el PR.", "conflict");
    }
  }
  if (!unchanged && input.notes.some((note) => !changes.some((item) => item.path === note))) fail("unchanged-note", "Una nota declarada no tiene un cambio real.", "conflict");
}

function requireEvidence(report, acknowledged) {
  const summary = report.checks.summary;
  const codes = [...new Set(report.warnings.map((warning) => warning.code))];
  if (report.status === "blocked" || !report.coverage.files.complete || !report.coverage.checks.complete
    || !report.checks.complete || summary.success < 1 || summary.adverse || summary.pending || summary.other
    || codes.some((code) => !ACK_CODES.has(code) || !acknowledged.includes(code))) {
    fail("evidence-blocked", "La evidencia está incompleta, tiene fallos o necesita revisión explícita de advertencias admitidas.", "blocked");
  }
  if (acknowledged.some((code) => !codes.includes(code))) fail("invalid-option", "Se declaró una advertencia que no apareció en la inspección.");
}

function validateDiffs(vault, notes, changes) {
  for (const note of notes) {
    const change = changes.find((item) => item.path === note);
    if (!change || change.state === "??") continue;
    for (const staged of [false, true]) {
      const args = ["diff", "--no-ext-diff", "--no-textconv", ...(staged ? ["--cached"] : [])];
      const diff = gitRead(vault, [...args, "--", note]);
      if (containsSensitiveData(diff)) fail("sensitive-diff", "El diff de una nota contiene patrones sensibles.", "blocked");
      try { gitRead(vault, [...args, "--check", "--", note]); }
      catch { fail("note-format", "El diff de una nota contiene errores de formato.", "blocked"); }
    }
    if (change.state[0] !== " ") {
      const entry = gitRead(vault, ["ls-files", "--stage", "-z", "--", note]).split("\0").filter(Boolean);
      if (entry.length !== 1 || !/^100(?:644|755) [a-f0-9]+ 0\t/.test(entry[0])) fail("staged-type", "Una nota staged no es un archivo regular sin conflictos.", "conflict");
      const staged = gitRead(vault, ["show", `:${note}`]);
      validateNote(staged, vault, note);
    }
  }
}

function captureState(vault, files, ignored = []) {
  assertNoSymlinks(vault);
  const root = fs.lstatSync(vault);
  return { root: [root.dev, root.ino], git: gitState(vault, ignored),
    files: files.map((file) => { const item = readRegular(file, RECORD_LIMITS.git, true); return { path: file, hash: item.hash, identity: item.identity }; }) };
}

function assertSnapshot(before, after) {
  if (JSON.stringify(before) !== JSON.stringify(after)) fail("concurrent-change", "La memoria, el manifiesto o Git cambiaron; vuelve a revisar el plan.", "conflict");
}

function applyRecord(plan, context) {
  const { vault, files, before, ledgerFile, proposal, report } = plan;
  const parent = path.dirname(ledgerFile.path);
  const lockPath = syncWriteLockPath(vault);
  const temporary = path.join(parent, `.project-memory-sync-record-${randomUUID()}.tmp`);
  let lockFd, tempFd, lockIdentity, tempIdentity, wrote = false, primary, cleanupFailed = false;
  const io = context.fileOperations ?? fs;
  const ignored = [lockPath, temporary].map((file) => relativeGitPath(vault, file));
  try {
    assertNoSymlinks(parent);
    try { lockFd = fs.openSync(lockPath, "wx", 0o600); lockIdentity = fs.fstatSync(lockFd); }
    catch { fail("record-locked", "Otra ejecución o un bloqueo pendiente impide registrar; no se borrará.", "conflict"); }
    fs.writeSync(lockFd, `${randomUUID()}\n`);
    // The exclusive pathname is the cooperative lock. Closing its handle also
    // lets Windows expose replacements so inode checks can preserve foreign locks.
    fs.closeSync(lockFd); lockFd = undefined;
    assertSnapshot(before, captureState(vault, files, ignored));
    tempFd = fs.openSync(temporary, "wx", ledgerFile.mode);
    tempIdentity = fs.fstatSync(tempFd);
    io.writeFileSync(tempFd, proposal, "utf8");
    fs.fchmodSync(tempFd, ledgerFile.mode);
    fs.fsyncSync(tempFd);
    fs.closeSync(tempFd); tempFd = undefined;
    assertSnapshot(before, captureState(vault, files, ignored));
    assertOwned(lockPath, lockIdentity);
    assertOwned(temporary, tempIdentity);
    if (readRegular(temporary, RECORD_LIMITS.ledger).hash !== digest(Buffer.from(proposal))) fail("artifact-conflict", "El archivo temporal cambió; no se aplicará.", "conflict");
    // Narrow final read-to-rename window; independent editors must still pause.
    io.renameSync(temporary, ledgerFile.path);
    wrote = true;
  } catch (error) {
    primary = error;
    // An adapter can report an error after a completed rename. Do not claim
    // that nothing was written or roll back a file already installed.
    if (tempIdentity) {
      try {
        const current = fs.lstatSync(ledgerFile.path);
        wrote = current.dev === tempIdentity.dev && current.ino === tempIdentity.ino
          && readRegular(ledgerFile.path, RECORD_LIMITS.ledger).hash === digest(Buffer.from(proposal));
      } catch { /* Cannot establish an applied replacement. */ }
    }
  }
  finally {
    for (const fd of [tempFd, lockFd]) if (fd !== undefined) { try { fs.closeSync(fd); } catch { cleanupFailed = true; } }
    for (const [file, identity] of [[temporary, tempIdentity], [lockPath, lockIdentity]]) {
      if (!identity || wrote && file === temporary) continue;
      try { assertNoSymlinks(parent); assertOwned(file, identity); io.unlinkSync(file); }
      catch { cleanupFailed = true; }
    }
  }
  if (wrote) return { ...report, status: cleanupFailed || primary ? "error" : "recorded", wrote: true,
    ...(cleanupFailed || primary ? { code: cleanupFailed ? "cleanup-error" : "write-confirmation-error",
      details: ["La fila se guardó, pero la confirmación o limpieza necesita revisión. No se revirtió."] } : {}) };
  if (cleanupFailed) fail("cleanup-error", "No se guardó la fila y quedaron artefactos de esta ejecución; revisa el bloqueo.");
  if (primary instanceof SyncRecordError) throw primary;
  fail("write-error", "No se guardó el registro; el archivo original se conservó.");
}

function assertOwned(file, identity) {
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.dev !== identity.dev || stat.ino !== identity.ino) fail("artifact-conflict", "Un artefacto de la operación fue sustituido; no se tocará.", "conflict");
}

function digest(value) { return createHash("sha256").update(value).digest("hex"); }

export function formatSyncRecordReport(report) {
  return [`Project Memory Sync Record: ${report.status.toUpperCase()}`,
    ...(report.repository ? [`Repositorio: ${report.repository}; rama: ${report.branch}`, `PR #${report.pr}; integración: ${report.mergeCommit}`,
      `Registro: ${report.ledgerPath}`, `Resultado: ${report.result}`, `Fecha UTC: ${report.date}`] : []),
    ...(report.details ?? []), `Escritura: ${report.wrote ? "sí" : "no"}`,
    ...(report.status === "preview" ? ["Vista previa: --apply añade únicamente la fila del registro."] : []),
    RECORD_CONCURRENCY_NOTICE, "La declaración --reviewed no certifica la comprensión ni la corrección del código. No se crean commits ni se hace push."].join("\n");
}
