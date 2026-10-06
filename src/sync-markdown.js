import fs from "node:fs";
import path from "node:path";
import { containsSensitiveData, isCredentialPath } from "./sensitive-data.js";
import { APPLY_LIMITS, portablePathKey } from "./sync-proposal.js";
import { memoryPath, readSyncFile, rejectFile } from "./sync-files.js";

export function collectMemoryNotes(vault) {
  const notes = new Map(), pending = [vault]; let entries = 0, bytes = 0;
  while (pending.length) {
    const dir = pending.pop();
    // opendir keeps a hostile oversized directory bounded before materializing it.
    const handle = fs.opendirSync(dir);
    try {
      let entry;
      while ((entry = handle.readSync())) {
        if (++entries > APPLY_LIMITS.entries) rejectFile("virtual-limit", "El recorrido de la memoria supera el límite.", "blocked");
        if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
        const full = path.join(dir, entry.name);
        if (entry.isSymbolicLink()) { if (/\.md$/i.test(entry.name)) rejectFile("unsafe-path", "La vista de memoria contiene una nota enlazada."); continue; }
        if (entry.isDirectory()) { pending.push(memoryPath(vault, path.relative(vault, full))); continue; }
        if (!/\.md$/i.test(entry.name)) continue;
        if (notes.size >= APPLY_LIMITS.virtualNotes) rejectFile("virtual-limit", "Hay demasiadas notas para validar la vista completa.", "blocked");
        const file = readSyncFile(memoryPath(vault, path.relative(vault, full)), APPLY_LIMITS.note);
        bytes += file.bytes.length;
        if (bytes > APPLY_LIMITS.virtualBytes) rejectFile("virtual-limit", "La vista de memoria supera el presupuesto de texto.", "blocked");
        notes.set(path.relative(vault, full).split(path.sep).join("/"), file);
      }
    } finally { handle.closeSync(); }
  }
  const names = new Set();
  for (const name of notes.keys()) {
    const key = portablePathKey(name);
    if (names.has(key)) rejectFile("ambiguous-path", "La memoria contiene rutas Markdown ambiguas entre plataformas.");
    names.add(key);
  }
  return new Map([...notes].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0));
}

export function validateNoteText(text, original) {
  if (containsSensitiveData(text)) rejectFile("sensitive-note", "Una nota contiene patrones sensibles.", "blocked");
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/.test(text)
    || !text.endsWith("\n") || /[ \t]+\r?$/m.test(text) || /\{\{[^{}]+\}\}/.test(text)) rejectFile("note-format", "Una nota contiene controles, marcadores o errores de formato.", "blocked");
  const endings = text.match(/\r?\n/g) ?? [], ending = endings[0];
  if (endings.some((item) => item !== ending) || /\r(?!\n)/.test(text)) rejectFile("note-format", "Una nota mezcla estilos de salto de línea.", "blocked");
  if (original !== undefined && (text.startsWith("\uFEFF") !== original.startsWith("\uFEFF") || ending !== original.match(/\r?\n/)?.[0])) rejectFile("note-style", "La propuesta cambia el BOM o el estilo de salto de línea.", "blocked");
}

export function validateVirtualMemory(vault, catalog, replacements) {
  const virtual = new Map([...catalog].map(([name, file]) => [name, replacements.get(name) ?? file.text]));
  let total = 0;
  for (const text of virtual.values()) {
    total += Buffer.byteLength(text);
    if (total > APPLY_LIMITS.virtualBytes) rejectFile("virtual-limit", "La memoria resultante supera el presupuesto de texto.", "blocked");
    if (containsSensitiveData(text) || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/.test(text)) rejectFile("unsafe-memory", "La vista resultante contiene patrones sensibles o controles.", "blocked");
  }
  const byBase = new Map(), byPath = new Map(), bodies = new Map(), headings = new Map(), attachments = new Set();
  for (const [name, text] of virtual) {
    byPath.set(portablePathKey(name), name);
    const base = portablePathKey(path.posix.basename(name).replace(/\.md$/i, ""));
    byBase.set(base, [...(byBase.get(base) ?? []), name]);
    const body = markdownBody(text); bodies.set(name, body.replace(/(`+)[^`\n]*?\1/g, (token) => " ".repeat(token.length)));
    headings.set(name, [...body.matchAll(/^ {0,3}#{1,6} (.+)$/gm)].map((m) => m[1].replace(/[ \t]+#+[ \t]*$/, "").trim())
      .filter((title) => !/[`*\[\]<>]/.test(title) && !/_[^_]+_/.test(title)));
  }
  const fragment = (name, value, wiki) => {
    if (!value || !headings.has(name)) rejectFile("unsupported-fragment", "Un fragmento local no se puede resolver con el subconjunto soportado.", "blocked");
    const normalize = wiki ? (s) => s.trim().normalize("NFC") : slug;
    const target = wiki ? value.trim().normalize("NFC") : decode(value);
    if (target.startsWith("^") || (headings.get(name) ?? []).filter((title) => normalize(title) === target).length !== 1) rejectFile("note-links", "Un enlace de sección es inexistente, ambiguo o no soportado.", "blocked");
  };
  const markdownTarget = (from, raw) => {
    if (/^(?:https?:|mailto:|data:|obsidian:)/i.test(raw)) return;
    if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(raw)) rejectFile("note-links", "Un enlace usa un protocolo no soportado.", "blocked");
    const hash = raw.indexOf("#"), destination = hash < 0 ? raw : raw.slice(0, hash);
    const decoded = decode(destination.split("?")[0]);
    const relative = decoded ? path.posix.normalize(path.posix.join(path.posix.dirname(from), decoded)) : from;
    if (decoded.startsWith("/") || decoded.includes("\\") || isCredentialPath(relative) || relative.split("/").some((p) => p.startsWith("."))) rejectFile("note-links", "Un enlace local sale de las áreas consultables.", "blocked");
    const canonical = byPath.get(portablePathKey(relative));
    if (/\.md$/i.test(relative) && !canonical) rejectFile("note-links", "Un enlace apunta a una nota ausente.", "blocked");
    if (!canonical) {
      let stat;
      try { stat = fs.lstatSync(memoryPath(vault, relative)); }
      catch { rejectFile("note-links", "Un enlace local no tiene un destino físico seguro.", "blocked"); }
      if (!stat.isFile()) rejectFile("note-links", "Un enlace local no apunta a un archivo regular.", "blocked");
      attachments.add(relative);
    }
    if (hash >= 0) fragment(canonical ?? relative, raw.slice(hash + 1), false);
  };
  for (const [from, body] of bodies) {
    for (const match of body.matchAll(/!?\[\[([^\]]+)\]\]/g)) {
      const [target] = match[1].split("|"); const hash = target.indexOf("#");
      const note = (hash < 0 ? target : target.slice(0, hash)).trim().replace(/\.md$/i, "");
      let destination;
      if (!note) destination = from;
      else if (note.includes("/")) destination = byPath.get(portablePathKey(`${note}.md`));
      else { const candidates = byBase.get(portablePathKey(note)) ?? []; if (candidates.length === 1) destination = candidates[0]; }
      if (!destination) rejectFile("note-links", "Un enlace Wiki es inexistente o ambiguo.", "blocked");
      memoryPath(vault, destination);
      if (hash >= 0) fragment(destination, target.slice(hash + 1), true);
    }
    const clean = body.replace(/!?\[\[[^\]]+\]\]/g, "");
    for (const match of clean.matchAll(/!?\[[^\]\n]*\]\(([^\n]+?)\)/g)) {
      const parsed = match[1].match(/^(?:<([^<>]+)>|([^\s]+))(?:\s+"[^"\n]*")?$/);
      if (!parsed || /[()\\]/.test(parsed[1] ?? parsed[2])) rejectFile("unsupported-link", "La sintaxis de un enlace local no está soportada.", "blocked");
      markdownTarget(from, parsed[1] ?? parsed[2]);
    }
    // Reference-style links need their own syntax contract; fail closed rather
    // than silently certifying an unchecked target or fragment.
    if (/^ {0,3}\[[^\]]+\]:|!?\[[^\]\n]+\]\[[^\]\n]*\]/m.test(clean)) rejectFile("unsupported-link", "Los enlaces por referencia requieren una revisión fuera de este subconjunto.", "blocked");
  }
  return [...attachments].sort();
}
function decode(value) {
  try { return decodeURIComponent(value); } catch { rejectFile("note-links", "Un enlace tiene codificación inválida.", "blocked"); }
}
function slug(value) { return value.normalize("NFC").toLowerCase().replace(/[^\p{L}\p{N}\s_-]/gu, "").replace(/\s+/g, "-"); }
function markdownBody(text) {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/); let fence, comment = false, front = lines[0] === "---";
  const body = [];
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    if (front) { if (i && line.trim() === "---") front = false; body.push(""); continue; }
    if (comment) {
      const end = line.indexOf("-->");
      if (end < 0) { body.push(""); continue; }
      line = line.slice(end + 3); comment = false;
    }
    if (!fence) {
      line = line.replace(/<!--.*?-->/g, "");
      const start = line.indexOf("<!--");
      if (start >= 0) { comment = true; line = line.slice(0, start); }
    }
    const marker = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
    if (marker) { if (!fence) fence = marker[1]; else if (marker[1][0] === fence[0] && marker[1].length >= fence.length && !marker[2].trim()) fence = undefined; body.push(""); continue; }
    body.push(fence || /^(?: {4}|\t)/.test(line) ? "" : line);
  }
  if (front || fence || comment) rejectFile("unsupported-markdown", "Una nota contiene frontmatter, código o comentario sin cierre.", "blocked");
  return body.join("\n");
}

export function noteUnifiedDiff(name, before, after) {
  const left = before.split(/\r?\n/).slice(0, -1), right = after.split(/\r?\n/).slice(0, -1);
  let start = 0, tail = 0;
  while (start < Math.min(left.length, right.length) && left[start] === right[start]) start++;
  while (tail < Math.min(left.length, right.length) - start && left[left.length - 1 - tail] === right[right.length - 1 - tail]) tail++;
  const prefix = Math.max(0, start - 3), suffix = Math.min(tail, 3);
  const lines = [`--- a/${name}`, `+++ b/${name}`, `@@ -${prefix + 1},${left.length - tail + suffix - prefix} +${prefix + 1},${right.length - tail + suffix - prefix} @@`,
    ...left.slice(prefix, start).map((s) => ` ${s}`), ...left.slice(start, left.length - tail).map((s) => `-${s}`),
    ...right.slice(start, right.length - tail).map((s) => `+${s}`), ...left.slice(left.length - tail, left.length - tail + suffix).map((s) => ` ${s}`)];
  return lines.join("\n") + "\n";
}
