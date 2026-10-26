import { execFile } from "node:child_process";
import { constants } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

// Gemini is a toolbox here, not a participant of the cross review: it researches the web and generates images
// through the Antigravity CLI (`agy`) in non-interactive mode. Only the user's prompt text leaves the machine; each
// run starts in a fresh empty directory so the session has no project to read by default.
const MODEL = /^[a-z0-9][a-z0-9.-]{0,60}$/u;
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/u;
const IMAGE = /\.(png|jpe?g|webp)$/iu;
const DEFAULTS = { investigar: "gemini-4-argon-medium", imagen: "gemini-3.8-flash-low" };

export class GeminiError extends Error {
  constructor(message) { super(message); this.code = "gemini-tools"; }
}

const home = () => process.env.AGENT_TOOLKIT_GEMINI_DIR ?? path.join(os.homedir(), ".agent-toolkit", "gemini");
const brain = () => path.join(process.env.GEMINI_CLI_HOME ?? path.join(os.homedir(), ".gemini", "antigravity-cli"), "brain");
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function validate({ prompt, model }) {
  if (typeof prompt !== "string" || !prompt.trim() || prompt.length > 6_000 || CONTROL.test(prompt)) throw new GeminiError("La descripción debe tener entre 1 y 6000 caracteres de texto.");
  if (model !== undefined && !MODEL.test(model)) throw new GeminiError("El modelo no es válido; mira `agent-toolkit-gemini estado`.");
}

const slug = text => text.normalize("NFD").replace(/[̀-ͯ]/gu, "").toLowerCase().replace(/[^a-z0-9]+/gu, "-").replace(/^-|-$/gu, "").slice(0, 40) || "consulta";

async function workDirectory(kind, prompt, outRoot, now) {
  const stamp = new Date(now()).toISOString().replace(/\D/gu, "").slice(0, 14);
  const dir = path.join(outRoot, kind, `${stamp}-${slug(prompt)}`);
  await fs.mkdir(dir, { recursive: true, mode: 0o700 });
  return dir;
}

const agy = (args, cwd, timeoutMs) => new Promise((resolve, reject) => {
  execFile("agy", args, { cwd, timeout: timeoutMs, maxBuffer: 8_000_000, windowsHide: true }, (error, stdout) => {
    if (error) return reject(new GeminiError(error.code === "ENOENT" ? "No encontré `agy` (Antigravity CLI) en el PATH." : "La consulta a Antigravity falló o superó el tiempo."));
    try { resolve(JSON.parse(String(stdout))); } catch { reject(new GeminiError("Antigravity no devolvió un JSON válido.")); }
  });
});

async function ask({ kind, prompt, wrapper, model = DEFAULTS[kind], mode, outRoot, run, now, timeoutMs }) {
  const cwd = await workDirectory(kind, prompt, outRoot, now);
  const result = await run(["-p", wrapper, "--model", model, "--mode", mode, "--output-format", "json", "--print-timeout", `${Math.ceil(timeoutMs / 1000)}s`], cwd, timeoutMs + 15_000);
  if (result?.status !== "SUCCESS") throw new GeminiError("Antigravity no completó la consulta.");
  const meta = { kind, model, conversationId: result.conversation_id, seconds: result.duration_seconds, usage: result.usage };
  await fs.writeFile(path.join(cwd, "meta.json"), JSON.stringify(meta, null, 2) + "\n", { mode: 0o600 });
  return { cwd, result, meta };
}

async function copyTo(files, target) {
  if (!target) return [];
  await fs.mkdir(target, { recursive: true });
  const copied = [];
  for (const file of files) {
    const destination = path.join(target, path.basename(file));
    // COPYFILE_EXCL: never overwrite what is already in the project.
    await fs.copyFile(file, destination, constants.COPYFILE_EXCL).catch(error => {
      throw new GeminiError(error.code === "EEXIST" ? `Ya existe ${destination}; elige otra carpeta o renómbralo.` : "No se pudo copiar el resultado.");
    });
    copied.push(destination);
  }
  return copied;
}

export async function investigar({ prompt, model, copyTo: target, outRoot = home(), run = agy, now = Date.now, timeoutMs = 600_000 }) {
  validate({ prompt, model });
  const wrapper = ["Eres un investigador. Investiga con búsqueda web la pregunta siguiente.",
    "Reglas: no leas ni escribas archivos, no ejecutes comandos y no uses subagentes; trabaja solo con búsqueda web.",
    "Responde en español y en Markdown con: un resumen de 3 a 5 líneas, los hallazgos y una lista de fuentes con su URL. Marca lo que no pudiste verificar.",
    `Pregunta: ${prompt}`].join("\n");
  const { cwd, result, meta } = await ask({ kind: "investigar", prompt, wrapper, model, mode: "plan", outRoot, run, now, timeoutMs });
  const file = path.join(cwd, "respuesta.md");
  await fs.writeFile(file, String(result.response ?? ""), { mode: 0o600 });
  return { kind: "investigar", directory: cwd, files: [file], copied: await copyTo([file], target), model: meta.model, usage: meta.usage, response: String(result.response ?? "") };
}

export async function imagen({ prompt, model, copyTo: target, outRoot = home(), run = agy, now = Date.now, timeoutMs = 120_000, waitMs = 240_000, pollMs = 3_000, brainDirectory = brain() }) {
  validate({ prompt, model });
  const wrapper = [`Usa tu subagente image-generator para generar una imagen con esta descripción: ${prompt}`,
    "No leas ni escribas nada fuera del directorio de trabajo y no ejecutes comandos. Responde en una línea cuando hayas lanzado la generación."].join("\n");
  const { cwd, result, meta } = await ask({ kind: "imagen", prompt, wrapper, model, mode: "accept-edits", outRoot, run, now, timeoutMs });
  // The subagent finishes after the print turn ends and saves into the conversation's artifact folder.
  const artifacts = path.join(brainDirectory, String(result.conversation_id));
  const deadline = now() + waitMs;
  let found = [];
  while (true) {
    found = (await fs.readdir(artifacts).catch(() => [])).filter(name => IMAGE.test(name));
    if (found.length || now() >= deadline) break;
    await sleep(pollMs);
  }
  if (!found.length) throw new GeminiError(`La generación no terminó en ${Math.round(waitMs / 1000)} s. Puede seguir en ${artifacts}; revisa esa carpeta en unos minutos.`);
  const files = [];
  for (const name of found.sort()) {
    const destination = path.join(cwd, name);
    await fs.copyFile(path.join(artifacts, name), destination, constants.COPYFILE_EXCL).catch(() => {});
    files.push(destination);
  }
  return { kind: "imagen", directory: cwd, files, copied: await copyTo(files, target), model: meta.model, usage: meta.usage };
}

export async function estado({ run = (args, cwd) => new Promise(resolve => execFile("agy", args, { cwd, timeout: 60_000, windowsHide: true }, (error, stdout) => resolve(error ? null : String(stdout)))) } = {}) {
  const version = await run(["--version"], os.homedir());
  if (!version) return { available: false };
  const models = (await run(["models"], os.homedir()) ?? "").split("\n").map(line => line.split("\t")[0]).filter(id => MODEL.test(id));
  return { available: true, version: version.trim(), models, defaults: DEFAULTS };
}
