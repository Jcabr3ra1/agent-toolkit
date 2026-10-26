import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

// Claude Code accepts stable aliases; Codex publishes its catalog in models_cache.json.
const CLAUDE = [
  { model: "haiku", category: "ligero", efforts: ["low", "medium", "high", "xhigh", "max"] },
  { model: "sonnet", category: "trabajo diario", efforts: ["low", "medium", "high", "xhigh", "max"] },
  { model: "opus", category: "más capaz", efforts: ["low", "medium", "high", "xhigh", "max"] }
];
const LEVELS = [
  { level: "Ligero", total: "0–2", category: "ligero", effort: "low" },
  { level: "Normal", total: "3–4", category: "trabajo diario", effort: "medium" },
  { level: "Exigente", total: "5–6", category: "trabajo diario", effort: "high" },
  { level: "Crítico", total: "7–8", category: "más capaz", effort: "high" },
  { level: "Máximo", total: "9–10", category: "más capaz", effort: "xhigh" }
];

function category(description = "") {
  if (/\b(older|previous)\b/iu.test(description)) return "anterior";
  if (/\b(fast and (affordable|efficient)|easier tasks|lightweight)\b/iu.test(description)) return "ligero";
  if (/\b(frontier|most demanding)\b/iu.test(description)) return "más capaz";
  if (/\b(workhorse|everyday|balanced)\b/iu.test(description)) return "trabajo diario";
  return "otro";
}

async function codexCatalog(codexHome) {
  let cache;
  try { cache = JSON.parse(await fs.readFile(path.join(codexHome, "models_cache.json"), "utf8")); }
  catch { return { available: false, models: [] }; }
  const models = (Array.isArray(cache?.models) ? cache.models : [])
    .filter(item => item && typeof item.slug === "string" && (item.visibility ?? "list") === "list")
    .map(item => ({ model: item.slug, description: String(item.description ?? "").slice(0, 120), category: category(item.description),
      priority: Number.isFinite(item.priority) ? item.priority : 999,
      efforts: (item.supported_reasoning_levels ?? []).map(level => level?.effort).filter(effort => typeof effort === "string") }));
  return { available: true, fetchedAt: cache.fetched_at ?? null, models };
}

async function codexCurrent(codexHome) {
  let text;
  try { text = await fs.readFile(path.join(codexHome, "config.toml"), "utf8"); } catch { return null; }
  const top = text.split(/^\s*\[/mu)[0];
  const value = key => top.match(new RegExp(`^\\s*${key}\\s*=\\s*"([^"]+)"`, "mu"))?.[1] ?? null;
  return { model: value("model"), effort: value("model_reasoning_effort") };
}

function pick(models, wanted) {
  return models.filter(item => item.category === wanted).sort((a, b) => a.priority - b.priority)[0] ?? null;
}

export async function agentModels({ codexHome = process.env.CODEX_HOME ?? path.join(os.homedir(), ".codex") } = {}) {
  const codex = await codexCatalog(codexHome);
  const levels = LEVELS.map(entry => {
    const codexModel = pick(codex.models, entry.category);
    const claudeModel = CLAUDE.find(item => item.category === entry.category);
    return { ...entry, claude: { model: claudeModel.model, effort: entry.effort },
      codex: codexModel && codexModel.efforts.includes(entry.effort) ? { model: codexModel.model, effort: entry.effort } : null };
  });
  return { claude: CLAUDE, codex, codexCurrent: await codexCurrent(codexHome), levels };
}

export function agentModelsTable({ claude, codex, codexCurrent, levels }) {
  const lines = ["**Modelos disponibles**", "", "| Agente | Modelo | Categoría | Esfuerzos |", "| --- | --- | --- | --- |"];
  for (const item of claude) lines.push(`| Claude | \`${item.model}\` | ${item.category} | ${item.efforts.join(", ")} |`);
  if (!codex.available) lines.push("| Codex | — | — | No se encontró `models_cache.json`; abre Codex una vez |");
  for (const item of codex.models) lines.push(`| Codex | \`${item.model}\` | ${item.category} | ${item.efforts.join(", ")} |`);
  lines.push("", "**Niveles con los modelos actuales**", "", "| Nivel | Total | Claude | Codex |", "| --- | --- | --- | --- |");
  for (const entry of levels) {
    const codexCell = entry.codex ? `\`${entry.codex.model}\`, \`${entry.codex.effort}\`` : "Sin modelo de esa categoría";
    lines.push(`| ${entry.level} | ${entry.total} | \`${entry.claude.model}\`, \`${entry.claude.effort}\` | ${codexCell} |`);
  }
  lines.push("", codexCurrent?.model
    ? `Codex usa ahora: \`${codexCurrent.model}\`, \`${codexCurrent.effort ?? "sin esfuerzo fijado"}\`.`
    : "No se pudo leer la configuración actual de Codex.");
  lines.push("La categoría de Codex se deduce de la descripción de cada modelo; «anterior» no se recomienda.", "");
  return lines.join("\n");
}
