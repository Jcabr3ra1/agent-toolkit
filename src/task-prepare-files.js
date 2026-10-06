import fs from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { decode, copyBytes, parseEventJson } from "./client-output-json.js";
import { copyTaskJson, TASK_LIMITS } from "./task-prepare.js";
import { containsSensitiveData, isCredentialPath } from "./sensitive-data.js";

export class TaskInputError extends Error {
  constructor(code) { super("Task input rejected"); this.code = code; }
}
const reject = code => { throw new TaskInputError(code); };
const signature = s => JSON.stringify([s.dev, s.ino, s.uid, s.gid, s.mode, s.nlink, s.size, s.mtimeMs, s.ctimeMs]);
const forbiddenInput = p => isCredentialPath(p) || /(?:^|\/)(?:\.git|\.obsidian|\.claude|\.codex|\.gemini|\.agents|\.(?:credentials?|secrets?)(?:\.[^/]*)?)(?:\/|$)/i.test(p) || /\.keychain(?:-db)?$/i.test(p);

// Compare decimal values after their shortest JSON round trip, not binary-rational exactness.
function decimalIdentity(token) {
  const [m, exp = "0"] = token.toLowerCase().split("e");
  const minus = m.startsWith("-"), fraction = m.split(".")[1]?.length ?? 0;
  let digits = m.replace(/[-.]/g, "").replace(/^0+/, ""); if (!digits) return "0";
  let scale = Number(exp) - fraction;
  if (!Number.isSafeInteger(scale)) reject("task-file-format");
  const trailing = digits.length - digits.replace(/0+$/, "").length;
  digits = digits.slice(0, digits.length - trailing); scale += trailing;
  return (minus ? "-" : "") + digits + "e" + scale;
}
function checkNumbers(text) {
  let string = false, escape = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (string) { if (escape) escape = false; else if (c === "\\") escape = true; else if (c === '"') string = false; continue; }
    if (c === '"') { string = true; continue; }
    if (c === "-" || /[0-9]/.test(c)) {
      const m = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(text.slice(i)); if (!m) reject("task-file-format");
      const n = Number(m[0]);
      if (!Number.isFinite(n) || Number.isInteger(n) && !Number.isSafeInteger(n) || decimalIdentity(m[0]) !== decimalIdentity(String(n))) reject("task-file-format");
      i += m[0].length - 1;
    }
  }
}
export function parseTaskDocument(bytes) {
  try {
    const text = decode(copyBytes(bytes, TASK_LIMITS.fileBytes)); checkNumbers(text);
    return copyTaskJson(parseEventJson(text));
  } catch { reject("task-file-format"); }
}

/** Only explicit source files; no referenced paths, credentials, config, Git or writes. */
export async function readTaskInputs(paths, cwd, dependencies = {}) {
  const names = ["task", "request", "catalog", "policy"], io = { ...fs, ...dependencies.io }, uid = process.getuid?.();
  let entries;
  try {
    const p = copyTaskJson(paths);
    if (!path.isAbsolute(cwd) || typeof uid !== "number" || !["darwin", "linux"].includes(process.platform) ||
        !p || Array.isArray(p) || Object.keys(p).sort().join() !== [...names].sort().join()) reject("task-file-path");
    entries = names.map(name => {
      const value = p[name];
      if (typeof value !== "string" || !value || value !== value.trim() || value.length > 4096 || /[\x00-\x1f\x7f-\x9f\u202a-\u202e\u2066-\u2069]/u.test(value)) reject("task-file-path");
      const full = path.resolve(cwd, value);
      if (forbiddenInput(full) || containsSensitiveData(full)) reject("task-file-path");
      return { name, full };
    });
    if (new Set(entries.map(e => e.full.normalize("NFC").toLowerCase())).size !== 4) reject("task-file-path");
  } catch { reject("task-file-path"); }
  const physical = async full => {
    let curr = path.parse(full).root;
    const parts = full.slice(curr.length).split(path.sep).filter(Boolean); if (parts.length > 64) reject("task-file-path");
    for (const [index, part] of parts.entries()) {
      curr = path.join(curr, part); const s = await io.lstat(curr);
      if (s.isSymbolicLink() || index !== parts.length - 1 && !s.isDirectory()) reject("task-file-unsafe");
    }
  };
  const safe = s => {
    if (!s.isFile() || s.isSymbolicLink() || s.uid !== uid || s.nlink !== 1 || s.mode & 0o7022) reject("task-file-unsafe");
    if (s.size < 1 || s.size > TASK_LIMITS.fileBytes) reject("task-file-limit");
  };
  const data = {}, byteHashes = {}; let total = 0;
  try {
    for (const { name, full } of entries) {
      await physical(full); const before = await io.lstat(full); safe(before);
      const handle = await io.open(full, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
      try {
        const start = await handle.stat(); safe(start); if (signature(start) !== signature(before)) reject("task-file-changed");
        const buffer = Buffer.alloc(before.size + 1); let offset = 0;
        while (offset < buffer.length) {
          const { bytesRead } = await handle.read(buffer, offset, buffer.length - offset, offset); if (!bytesRead) break; offset += bytesRead;
          if (offset > before.size || total + offset > TASK_LIMITS.totalBytes) reject("task-file-limit");
        }
        const after = await handle.stat(), named = await io.lstat(full); safe(after); safe(named);
        if (offset !== before.size || signature(before) !== signature(after) || signature(before) !== signature(named)) reject("task-file-changed");
        await physical(full); total += offset;
        const bytes = buffer.subarray(0, offset); data[name] = parseTaskDocument(bytes);
        byteHashes[name] = createHash("sha256").update(bytes).digest("hex");
      } finally { await handle.close(); }
    }
    return { data: copyTaskJson(data), byteHashes };
  } catch (e) { reject(e instanceof TaskInputError ? e.code : "task-file-read-failed"); }
}
