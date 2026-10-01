import { containsSensitiveData } from "./sensitive-data.js";

const HEADERS = [
  ["Cambio", "Estado", "Fecha", "Resultado", "Commit de memoria"],
  ["PR", "Estado", "Fecha de revisión", "Resultado", "Commit de memoria"]
];

export class LedgerError extends Error {
  constructor() {
    super("El registro contiene una tabla ambigua, incompleta o incompatible.");
    this.name = "LedgerError";
  }
}

// Strict writer parser. The existing tolerant sync-plan reader stays unchanged.
export function parseWritableLedger(content, repository) {
  const bad = () => { throw new LedgerError(); };
  if (typeof content !== "string" || containsSensitiveData(content)
    || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/.test(content)) bad();
  const lines = [];
  let offset = 0, fence = null, comment = false;
  const start = content.replace(/^\uFEFF/, "");
  let frontmatter = start.startsWith("---\n") || start.startsWith("---\r\n");
  for (const text of content.match(/[^\n]*\n|[^\n]+$/g) ?? []) {
    const raw = text.replace(/\r?\n$/, "");
    let active = !fence && !frontmatter && !comment && !/^(?: {4}|\t)/.test(raw);
    if (frontmatter && offset > 0 && raw.trim() === "---") frontmatter = false;
    const marker = raw.match(/^\s{0,3}(`{3,}|~{3,})/);
    if (marker) {
      active = false;
      if (!fence) fence = marker[1];
      else if (marker[1][0] === fence[0] && marker[1].length >= fence.length) fence = null;
    }
    if (!fence && raw.includes("<!--")) { active = false; comment = true; }
    if (!fence && raw.includes("-->") && comment) { active = false; comment = false; }
    lines.push({ raw, start: offset, end: offset + text.length, active });
    offset += text.length;
  }
  if (frontmatter || fence || comment) bad();
  const row = (raw) => {
    const text = raw.trim();
    return text.startsWith("|") && text.endsWith("|")
      ? text.slice(1, -1).split("|").map((cell) => cell.trim()) : null;
  };
  const headers = lines.flatMap((line, index) => {
    const cells = line.active && row(line.raw);
    return cells && HEADERS.some((h) => h.every((v, i) => cells[i] === v)) ? [index] : [];
  });
  if (headers.length !== 1) bad();
  const headerIndex = headers[0];
  const separator = row(lines[headerIndex + 1]?.raw ?? "");
  if (row(lines[headerIndex].raw).length !== 5 || !separator || separator.length !== 5
    || !separator.every((cell) => /^:?-{3,}:?$/.test(cell)) || !lines[headerIndex + 1].active) bad();
  const records = new Map();
  let insertion = lines[headerIndex + 1].end;
  for (const line of lines.slice(headerIndex + 2)) {
    if (!line.active) break;
    if (!line.raw.trim()) continue;
    if (!line.raw.trim().startsWith("|")) break;
    const cells = row(line.raw);
    if (!cells || cells.length !== 5 || cells.some((cell) => !cell)) bad();
    const link = cells[0].match(/^\[[^\]\r\n]+\]\((https:\/\/github\.com\/[^\s)]+)\)$/i);
    if (!link) bad();
    let url;
    try { url = new URL(link[1]); } catch { bad(); }
    const suffix = url.pathname.match(/\/pull\/([1-9]\d*)$/);
    const number = Number(suffix?.[1]);
    if (url.protocol !== "https:" || url.hostname !== "github.com" || url.port || url.username || url.password
      || url.search || url.hash || !Number.isSafeInteger(number)
      || url.pathname.toLowerCase() !== `/${repository}/pull/${number}`.toLowerCase()
      || records.has(number) || !["Revisado", "Pendiente"].includes(cells[1])
      || !validDate(cells[2])) bad();
    records.set(number, { number, state: cells[1], date: cells[2], result: cells[3], commit: cells[4] });
    insertion = line.end;
  }
  const endings = content.match(/\r?\n/g) ?? [];
  const newline = endings[0] ?? "\n";
  if (endings.some((value) => value !== newline) || /\r(?!\n)/.test(content)) bad();
  return { content, records, insertion, newline };
}

export function appendLedgerRecord(ledger, { repository, pr, date, result }) {
  const { content, insertion, newline } = ledger;
  const prefix = content.slice(0, insertion);
  const boundary = prefix.endsWith("\n") ? "" : newline;
  const row = `| [#${pr}](https://github.com/${repository}/pull/${pr}) | Revisado | ${date} | ${result} | — |`;
  return `${prefix}${boundary}${row}${newline}${content.slice(insertion)}`;
}

function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}
