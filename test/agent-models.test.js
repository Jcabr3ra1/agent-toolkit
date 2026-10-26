import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import { agentModels, agentModelsTable } from "../src/agent-models.js";
import { runPeerInboxCli } from "../src/peer-inbox-cli.js";

const root = await fs.mkdtemp(path.join(os.tmpdir(), "agent-models-"));
after(() => fs.rm(root, { recursive: true, force: true }));
const levels = efforts => efforts.map(effort => ({ effort }));

async function codexHome(models, config) {
  const dir = await fs.mkdtemp(path.join(root, "codex-"));
  if (models) await fs.writeFile(path.join(dir, "models_cache.json"), JSON.stringify({ fetched_at: "2026-10-26", models }));
  if (config) await fs.writeFile(path.join(dir, "config.toml"), config);
  return dir;
}

test("levels use the newest Codex model of each category and skip older or hidden ones", async () => {
  const dir = await codexHome([
    { slug: "nuevo-diario", description: "Latest workhorse model for coding", priority: 1, supported_reasoning_levels: levels(["low", "medium", "high", "xhigh", "max"]) },
    { slug: "viejo-diario", description: "Previous generation workhorse model.", priority: 0, supported_reasoning_levels: levels(["low", "medium", "high"]) },
    { slug: "frontera", description: "Frontier intelligence for the most demanding work.", priority: 2, supported_reasoning_levels: levels(["low", "high", "xhigh"]) },
    { slug: "rapido", description: "Fast and affordable model for easier tasks.", priority: 5, supported_reasoning_levels: levels(["low", "medium"]) },
    { slug: "oculto", description: "Fast and affordable", visibility: "hide", priority: 0, supported_reasoning_levels: levels(["low"]) }
  ], 'model = "nuevo-diario"\nmodel_reasoning_effort = "high"\n[mcp_servers.x]\nmodel = "otro"\n');
  const result = await agentModels({ codexHome: dir });
  assert.deepEqual(result.levels.map(level => level.codex && `${level.codex.model}:${level.codex.effort}`),
    ["rapido:low", "nuevo-diario:medium", "nuevo-diario:high", "frontera:high", "frontera:xhigh"]);
  assert.equal(result.codex.models.some(model => model.model === "oculto"), false);
  assert.equal(result.codex.models.find(model => model.model === "viejo-diario").category, "anterior");
  assert.deepEqual(result.codexCurrent, { model: "nuevo-diario", effort: "high" });
  const table = agentModelsTable(result);
  assert.match(table, /\| Exigente \| 5–6 \| `sonnet`, `high` \| `nuevo-diario`, `high` \|/u);
  assert.match(table, /Codex usa ahora: `nuevo-diario`, `high`/u);
});

test("a missing catalog or unsupported effort is reported instead of inventing a model", async () => {
  const empty = await agentModels({ codexHome: await codexHome(null, null) });
  assert.equal(empty.codex.available, false);
  assert.equal(empty.levels.every(level => level.codex === null), true);
  assert.match(agentModelsTable(empty), /No se encontró `models_cache.json`/u);
  assert.match(agentModelsTable(empty), /No se pudo leer la configuración actual de Codex/u);
  const limited = await agentModels({ codexHome: await codexHome([
    { slug: "frontera", description: "Frontier intelligence", supported_reasoning_levels: levels(["low", "high"]) }]) });
  assert.equal(limited.levels.find(level => level.level === "Máximo").codex, null);
});

test("the inbox CLI prints the catalog as a table or JSON", async () => {
  const dir = await codexHome([{ slug: "diario", description: "Latest workhorse model", supported_reasoning_levels: levels(["low", "medium", "high"]) }]);
  const out = [], json = [], errors = [];
  assert.equal(await runPeerInboxCli(["modelos"], { codexHome: dir, out: t => out.push(t), err: () => {} }), 0);
  assert.match(out.join(""), /\*\*Niveles con los modelos actuales\*\*/u);
  assert.equal(await runPeerInboxCli(["modelos", "--json"], { codexHome: dir, out: t => json.push(t), err: () => {} }), 0);
  assert.equal(JSON.parse(json.join("")).levels[1].codex.model, "diario");
  assert.equal(await runPeerInboxCli(["modelos", "--otro"], { codexHome: dir, out: () => {}, err: t => errors.push(t) }), 2);
  assert.match(errors.join(""), /agent-toolkit-inbox modelos/u);
});
