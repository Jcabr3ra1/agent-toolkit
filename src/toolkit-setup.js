import fs from 'node:fs/promises';
import { constants } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { parseTOML, getStaticTOMLValue } from 'toml-eslint-parser';

export const TOOLKIT_ROOT = fileURLToPath(new URL('../', import.meta.url));
const clientsFor = agent => {
  if (!['codex', 'claude', 'all'].includes(agent)) throw new Error('El agente debe ser codex, claude o all.');
  return agent === 'all' ? ['codex', 'claude'] : [agent];
};
const quote = value => "'" + value.replaceAll("'", "'\\''") + "'";
const stat = file => fs.lstat(file).catch(e => { if (e.code === 'ENOENT') return null; throw e; });
async function parents(home, target, create = false) {
  let current = home;
  for (const part of path.relative(home, path.dirname(target)).split(path.sep)) {
    current = path.join(current, part);
    let info = await stat(current);
    if (!info && create) {
      await fs.mkdir(current, { mode: 0o700 }).catch(e => { if (e.code !== 'EEXIST') throw e; });
      info = await stat(current);
    }
    if (info && (!info.isDirectory() || info.isSymbolicLink())) throw new Error('Un directorio de instalación está ocupado o es un enlace.');
  }
}
async function linkState(source, target) {
  const info = await stat(target);
  if (!info) return 'missing';
  return info.isSymbolicLink() && await fs.readlink(target) === source ? 'installed' : 'conflict';
}
export async function setupToolkit({ agent = 'all', apply = false, homeDirectory = os.homedir(), toolkitRoot = TOOLKIT_ROOT,
  codexHome = path.join(homeDirectory, '.codex') } = {}) {
  const clients = clientsFor(agent);
  const home = await fs.realpath(homeDirectory), root = await fs.realpath(toolkitRoot);
  const names = (await fs.readdir(path.join(root, 'skills'), { withFileTypes: true })).filter(e => e.isDirectory() && /^[a-z0-9-]+$/u.test(e.name)).map(e => e.name).sort();
  const skills = [];
  for (const client of clients) for (const name of names) {
    const source = path.join(root, 'skills', name), file = await stat(path.join(source, 'SKILL.md'));
    if (!file?.isFile() || file.isSymbolicLink()) throw new Error('Skill fuente inválida.');
    const target = path.join(home, client === 'codex' ? '.agents' : '.claude', 'skills', name);
    await parents(home, target);
    skills.push({ client, name, source, target, state: await linkState(source, target) });
  }
  const conflicts = skills.filter(s => s.state === 'conflict');
  if (apply && !conflicts.length) {
    for (const item of skills.filter(s => s.state === 'missing')) {
      await parents(home, item.target, true);
      try { await fs.symlink(item.source, item.target, 'dir'); }
      catch (e) { if (e.code !== 'EEXIST' || await linkState(item.source, item.target) !== 'installed') throw new Error('El destino cambió; se conservan los enlaces aplicados. Repite la vista previa.'); }
      item.state = 'installed';
    }
  }
  const entry = quote(path.join(root, 'bin/agent-toolkit-mcp.js'));
  const commands = Object.fromEntries(clients.map(client => [client, client === 'codex'
    ? `codex mcp add agent-toolkit-workflow -- ${quote(process.execPath)} ${entry}`
    : `claude mcp add --scope user --transport stdio agent-toolkit-workflow -- ${quote(process.execPath)} ${entry}`]));
  return { applied: Boolean(apply && !conflicts.length), skills, conflicts: conflicts.length,
    mcp: { applied: false, registrationCommands: commands }, restartRequired: Boolean(apply && !conflicts.length),
    superpowers: { included: false, required: false }, codexHome };
}
async function boundedConfig(file) {
  const info = await stat(file);
  if (!info) return null;
  if (!info.isFile() || info.isSymbolicLink() || info.size > 1_048_576) throw new Error('config');
  return fs.readFile(file);
}
async function inspectMcp(client, home, codexHome, root) {
  try {
    const bytes = await boundedConfig(client === 'codex' ? path.join(codexHome, 'config.toml') : path.join(home, '.claude.json'));
    if (!bytes) return { state: 'missing' };
    const names = ['agent-toolkit-workflow', 'agent-toolkit'];
    for (const name of names) {
      let server;
      if (client === 'codex') {
        server = getStaticTOMLValue(parseTOML(bytes.toString('utf8'), { tomlVersion: '1.0.0' })).mcp_servers?.[name];
      } else server = JSON.parse(bytes.toString('utf8')).mcpServers?.[name];
      if (!server) continue;
      const expected = path.join(root, 'bin/agent-toolkit-mcp.js');
      const recognized = Array.isArray(server.args) && server.args.includes(expected) &&
        (server.command === 'node' || server.command === process.execPath);
      return { state: server.enabled === false ? 'disabled' : recognized ? 'configured' : 'different-checkout', name };
    }
    return { state: 'missing' };
  } catch { return { state: 'unreadable' }; }
}
async function executable(name, environment) {
  for (const folder of (environment.PATH ?? '').split(path.delimiter).filter(Boolean)) {
    try { const file = path.join(folder, name); await fs.access(file, constants.X_OK); if ((await fs.stat(file)).isFile()) return true; } catch {}
  }
  return false;
}
export async function doctorToolkit({ agent = 'all', homeDirectory = os.homedir(), toolkitRoot = TOOLKIT_ROOT, environment = process.env,
  codexHome = environment.CODEX_HOME ?? path.join(homeDirectory, '.codex') } = {}) {
  const setup = await setupToolkit({ agent, homeDirectory, toolkitRoot, codexHome });
  const clients = {}, mcp = {};
  for (const name of clientsFor(agent)) {
    clients[name] = { available: await executable(name, environment) };
    mcp[name] = await inspectMcp(name, homeDirectory, codexHome, await fs.realpath(toolkitRoot));
  }
  const dependencies = {};
  const require = createRequire(path.join(toolkitRoot, 'package.json'));
  for (const name of ['@modelcontextprotocol/server', '@modelcontextprotocol/sdk', 'zod', 'ajv', 'toml-eslint-parser']) {
    try { require.resolve(name === '@modelcontextprotocol/sdk' ? name + '/client/index.js' : name); dependencies[name] = true; } catch { dependencies[name] = false; }
  }
  return { node: { version: process.version, supported: process.versions.node.split('.')[0] === '24' }, dependencies, clients, mcp,
    skills: setup.skills, registrationCommands: setup.mcp.registrationCommands,
    gemini: { available: await executable('agy', environment), provider: 'antigravity', apiFallback: false },
    superpowers: { included: false, required: false, detection: 'check-client-plugin-manager' }, nativeConnectionVerified: false };
}
