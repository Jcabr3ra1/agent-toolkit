import fs from "node:fs";
import Ajv2020 from "ajv/dist/2020.js";
import { containsSensitiveData, isCredentialPath } from "./sensitive-data.js";
import { hashBytes, rejectFile, SYNC_LEDGER } from "./sync-files.js";

export const APPLY_LIMITS = Object.freeze({ proposal: 8 * 1024 * 1024, note: 1024 * 1024, notes: 20,
  totalNotes: 5 * 1024 * 1024, manifest: 1024 * 1024, ledger: 1024 * 1024,
  output: 1024 * 1024, virtualNotes: 5000, virtualBytes: 25 * 1024 * 1024, entries: 25_000 });
const schema = JSON.parse(fs.readFileSync(new URL("../schemas/project-memory-update.schema.json", import.meta.url), "utf8"));
const validate = new Ajv2020({ allErrors: false }).compile(schema);
export const portablePathKey = (value) => value.normalize("NFC").toLowerCase();
export function safeProposalPath(value, note = false) {
  return typeof value === "string" && value.length > 0 && value.length <= 512 && value.trim() === value
    && !/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069\\|`\[\]<>:*?]/.test(value)
    && !containsSensitiveData(value) && !isCredentialPath(value)
    && value.split("/").every((part) => part && ![".", ".."].includes(part) && (!note || !part.startsWith(".")))
    && (!note || value.endsWith(".md") && portablePathKey(value) !== portablePathKey(SYNC_LEDGER)
      && !value.split("/").some((part) => /^(?:skills?|config(?:uration)?|node_modules|credentials?|secrets?)$/i.test(part)));
}
export function parseProposal(text) {
  let value;
  try { checkJsonKeys(text); value = JSON.parse(text); }
  catch { rejectFile("invalid-proposal", "La propuesta no es JSON estricto o contiene claves duplicadas.", "blocked"); }
  if (!validate(value)) rejectFile("invalid-proposal", "La propuesta no cumple el contrato de actualización.", "blocked");
  if (containsSensitiveData(text) || sensitiveDecodedValue(value)) rejectFile("sensitive-proposal", "La propuesta contiene patrones sensibles.", "blocked");
  const seen = new Set(); let total = 0;
  for (const note of value.notes) {
    const key = portablePathKey(note.path);
    if (!safeProposalPath(note.path, true) || seen.has(key) || !note.sourcePaths.every((p) => safeProposalPath(p))) rejectFile("proposal-path", "Una ruta de propuesta es insegura, duplicada o ambigua.", "blocked");
    seen.add(key);
    // Reject lone surrogates: Buffer.from must not silently replace JSON text.
    if (/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(note.content)) rejectFile("invalid-text", "Una nota propuesta contiene Unicode inválido.", "blocked");
    const bytes = Buffer.byteLength(note.content); total += bytes;
    if (bytes > APPLY_LIMITS.note || total > APPLY_LIMITS.totalNotes) rejectFile("notes-limit", "Las notas propuestas superan el límite permitido.", "blocked");
  }
  return { ...value, notes: [...value.notes].sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0) };
}
function sensitiveDecodedValue(value) {
  if (typeof value === "string") return containsSensitiveData(value);
  if (Array.isArray(value)) return value.some(sensitiveDecodedValue);
  return value !== null && typeof value === "object" && Object.entries(value).some(([key, item]) => containsSensitiveData(key) || sensitiveDecodedValue(item));
}
export function proposalPlanId({ proposal, vault, proposalHash, indexHash, ledgerHash, acknowledgments }) {
  return hashBytes(JSON.stringify(["sync-apply-v1", proposal.projectId, vault, proposal.manifestSha256,
    proposalHash, proposal.memoryHead, indexHash, ledgerHash, proposal.repository, proposal.reviewBranch,
    proposal.pr, proposal.mergeCommit, proposal.notes.map((note) => [note.path, note.beforeSha256, hashBytes(Buffer.from(note.content))]), acknowledgments]));
}

// A bounded syntax walk catches duplicate decoded keys before JSON.parse
// discards them. No JSON values are executed or resolved from external URLs.
function checkJsonKeys(text) {
  let i = 0;
  const whitespace = () => { while (/[ \t\r\n]/.test(text[i] ?? "x")) i++; };
  const string = () => {
    if (text[i] !== '"') throw new Error();
    const start = i++;
    while (i < text.length) {
      if (text[i] === "\\") { i += 2; continue; }
      if (text[i++] === '"') return JSON.parse(text.slice(start, i));
    }
    throw new Error();
  };
  const value = (depth) => {
    if (depth > 64) throw new Error();
    whitespace();
    if (text[i] === "{") {
      i++; whitespace(); const keys = new Set();
      if (text[i] === "}") { i++; return; }
      while (true) {
        whitespace(); const key = string(); if (keys.has(key)) throw new Error(); keys.add(key);
        whitespace(); if (text[i++] !== ":") throw new Error(); value(depth + 1); whitespace();
        if (text[i] === "}") { i++; return; } if (text[i++] !== ",") throw new Error();
      }
    }
    if (text[i] === "[") {
      i++; whitespace(); if (text[i] === "]") { i++; return; }
      while (true) { value(depth + 1); whitespace(); if (text[i] === "]") { i++; return; } if (text[i++] !== ",") throw new Error(); }
    }
    if (text[i] === '"') { string(); return; }
    const match = text.slice(i).match(/^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/);
    if (!match) throw new Error(); i += match[0].length;
  };
  value(0); whitespace(); if (i !== text.length) throw new Error();
}
