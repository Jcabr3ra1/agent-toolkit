import { GeminiError, estado, imagen, investigar } from "./gemini-tools.js";

const HELP = `Uso: agent-toolkit-gemini investigar --prompt <pregunta> [--modelo <id>] [--copiar-a <carpeta>]
     agent-toolkit-gemini imagen --prompt <descripción> [--modelo <id>] [--copiar-a <carpeta>] [--espera-seg <1-600>]
     agent-toolkit-gemini estado

Herramientas de Gemini por Antigravity CLI (agy), en modo no interactivo y desde
una carpeta vacía propia (~/.agent-toolkit/gemini). Solo sale el texto del prompt.
investigar hace una búsqueda web con fuentes; imagen genera una imagen. Imprime
una línea JSON. --copiar-a copia el resultado a una carpeta sin sobrescribir.
`;
const NAMES = { "--prompt": "prompt", "--modelo": "model", "--copiar-a": "copyTo", "--espera-seg": "wait" };

export async function runGeminiCli(argv, { out, err, tools = { investigar, imagen, estado } } = {}) {
  const [command, ...rest] = argv;
  if (!["investigar", "imagen", "estado"].includes(command)) { await err(HELP); return 2; }
  const options = {};
  for (let i = 0; i < rest.length; i += 2) {
    const key = NAMES[rest[i]];
    if (command === "estado" || !key || rest[i + 1] === undefined || Object.hasOwn(options, key) || (key === "wait" && command !== "imagen")) { await err(HELP); return 2; }
    options[key] = rest[i + 1];
  }
  if (command !== "estado" && !options.prompt) { await err(HELP); return 2; }
  const wait = options.wait === undefined ? undefined : Number(options.wait);
  if (wait !== undefined && !(Number.isInteger(wait) && wait >= 1 && wait <= 600)) { await err(HELP); return 2; }
  try {
    const result = command === "estado" ? await tools.estado()
      : await tools[command]({ prompt: options.prompt, model: options.model, copyTo: options.copyTo, ...(wait && { waitMs: wait * 1000 }) });
    await out(JSON.stringify(result) + "\n");
    return 0;
  } catch (failure) {
    await err((failure instanceof GeminiError ? failure.message : "No se pudo completar la operación.") + "\n");
    return 1;
  }
}
