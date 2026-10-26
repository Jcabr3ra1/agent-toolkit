import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

// Codex has no background wake-up, so a reviewer that waits costs a model turn per minute. Instead the reviewer
// registers its session once and ends its turn; after the user approves a review, the principal delivers a short
// fixed notice to that session with `codex queue`. The MCP stays passive: this is an explicit command.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const RECENT_MS = 120_000;
const FRESH_MS = 24 * 3_600_000;

export class DeliveryError extends Error {
  constructor(message) { super(message); this.code = "codex-delivery"; }
}

const workflowDirectory = () => path.join(process.env.AGENT_TOOLKIT_WORKFLOW_DIR ?? path.join(os.homedir(), ".agent-toolkit", "workflows"), "reviewers");
const registryFile = (directory, projectRoot) => path.join(directory, createHash("sha256").update(projectRoot).digest("hex").slice(0, 24) + ".json");

async function* rollouts(directory) {
  for (const entry of await fs.readdir(directory, { withFileTypes: true }).catch(() => [])) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) yield* rollouts(full);
    else if (entry.isFile() && entry.name.endsWith(".jsonl")) yield full;
  }
}

async function firstLine(file) {
  const handle = await fs.open(file, "r");
  try {
    const buffer = Buffer.alloc(65_536);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    return buffer.subarray(0, bytesRead).toString("utf8").split("\n")[0];
  } finally { await handle.close(); }
}

// The command runs inside the reviewer's own session, so that session's rollout is the one written to right now.
export async function findCodexThread({ projectRoot, codexHome = process.env.CODEX_HOME ?? path.join(os.homedir(), ".codex"), now = Date.now } = {}) {
  const candidates = [];
  for await (const file of rollouts(path.join(codexHome, "sessions"))) {
    const stat = await fs.stat(file).catch(() => null);
    if (!stat || now() - stat.mtimeMs > RECENT_MS) continue;
    let meta;
    try { meta = JSON.parse(await firstLine(file))?.payload; } catch { continue; }
    const roots = [meta?.cwd, ...(Array.isArray(meta?.runtime_workspace_roots) ? meta.runtime_workspace_roots : [])];
    if (typeof meta?.id === "string" && UUID.test(meta.id) && roots.includes(projectRoot)) candidates.push(meta.id);
  }
  const unique = [...new Set(candidates)];
  if (unique.length === 1) return unique[0];
  throw new DeliveryError(unique.length
    ? `Hay ${unique.length} sesiones de Codex activas en ese proyecto; indica la tuya con --thread <id> (en Codex, /status).`
    : "No encontré tu sesión de Codex (ninguna escribió en los últimos 2 minutos en ese proyecto); indícala con --thread <id> (en Codex, /status).");
}

export async function registerReviewer({ projectRoot, thread, directory = workflowDirectory(), ...options }) {
  if (!path.isAbsolute(projectRoot) || path.normalize(projectRoot) !== projectRoot) throw new DeliveryError("La raíz del proyecto debe ser una ruta absoluta.");
  if (thread !== undefined && !UUID.test(thread)) throw new DeliveryError("El id de sesión no es un UUID válido.");
  const id = thread ?? await findCodexThread({ projectRoot, ...options });
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  const file = registryFile(directory, projectRoot), temporary = `${file}.${randomUUID()}.tmp`;
  try {
    await fs.writeFile(temporary, JSON.stringify({ schemaVersion: 1, agent: "codex", projectRoot, thread: id, registeredAt: new Date().toISOString() }) + "\n", { flag: "wx", mode: 0o600 });
    await fs.rename(temporary, file);
  } finally { await fs.unlink(temporary).catch(() => {}); }
  return { registered: true, thread: id, projectRoot };
}

async function registeredReviewer(directory, projectRoot, now) {
  let record;
  try { record = JSON.parse(await fs.readFile(registryFile(directory, projectRoot), "utf8")); }
  catch { throw new DeliveryError("Codex no se registró como revisor de este proyecto; en su terminal, ejecuta $revisar."); }
  if (record?.schemaVersion !== 1 || record.projectRoot !== projectRoot || !UUID.test(record.thread ?? "")) throw new DeliveryError("El registro del revisor no es válido; ejecuta $revisar otra vez en Codex.");
  if (now() - Date.parse(record.registeredAt) > FRESH_MS) throw new DeliveryError("El registro del revisor tiene más de 24 horas; ejecuta $revisar otra vez en Codex.");
  return record;
}

const message = ({ taskId, reviewId, projectRoot }) => [
  `Encargo de revisión pendiente para ti. Colaboración ${taskId}, encargo ${reviewId}, proyecto ${projectRoot}.`,
  "Atiéndelo ahora como revisor: reclámalo con claim_peer_review, revisa solo los archivos que indique y entrega el informe con submit_peer_review.",
  "Si no esperabas este encargo o no tienes esas herramientas, no hagas nada y avísame."].join("\n");

const queue = (thread, text) => new Promise((resolve, reject) => {
  execFile("codex", ["queue", "--thread", thread, "--message", text], { timeout: 30_000, windowsHide: true }, (error, stdout) => {
    if (error) reject(new DeliveryError("`codex queue` falló o no está disponible; el encargo sigue pendiente en la bandeja."));
    else resolve(String(stdout));
  });
});

// Delivers one notice for one pending, user-approved review addressed to codex. Nothing else can be sent through here.
export async function deliverReview({ store, taskId, reviewId, projectRoot, directory = workflowDirectory(), run = queue, now = Date.now }) {
  if (!UUID.test(taskId ?? "") || !UUID.test(reviewId ?? "")) throw new DeliveryError("El taskId y el reviewId deben ser UUID.");
  const task = await store.getCollaboration({ taskId, projectRoot, freshness: false });
  const review = task.reviews.find(item => item.id === reviewId);
  if (task.state !== "open" || !review || review.to !== "codex" || review.state !== "pending") {
    throw new DeliveryError("Solo se avisa de un encargo aprobado, pendiente y dirigido a Codex en una colaboración abierta.");
  }
  const reviewer = await registeredReviewer(directory, task.project.root, now);
  const output = await run(reviewer.thread, message({ taskId, reviewId, projectRoot: task.project.root }));
  return { delivered: true, thread: reviewer.thread, queued: /Queued message ([0-9a-f-]+)/iu.exec(output)?.[1] ?? null };
}
