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
  environment = process.env, codexHome = environment.CODEX_HOME ?? path.join(homeDirectory, '.codex') } = {}) {
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
    ...(clients.includes('codex') && { codexSandbox: await codexSandbox(home, codexHome) }),
    superpowers: { included: false, required: false }, codexHome };
}
// Codex runs commands in a workspace-write sandbox by default, so `registrar` cannot write its reviewer record
// under ~/.agent-toolkit unless that folder is inside a writable root. Only reported; the user runs the printed
// command. What cannot be evaluated (permission profiles) is reported as unknown instead of asking for a change.
// Resolves links through the deepest folder that exists, so a root written through a link still matches.
async function canonical(target) {
  let current = path.resolve(target), rest = [];
  while (true) {
    try { return path.join(await fs.realpath(current), ...rest); }
    catch { const parent = path.dirname(current); if (parent === current) return path.resolve(target); rest.unshift(path.basename(current)); current = parent; }
  }
}
async function codexSandbox(home, codexHome) {
  const state = path.join(home, '.agent-toolkit'), file = path.join(codexHome, 'config.toml');
  const command = `grep -q '^\\[sandbox_workspace_write\\]' ${quote(file)} 2>/dev/null && echo 'Ya existe la sección: añade la ruta a writable_roots a mano' || ` +
    `printf '\\n[sandbox_workspace_write]\\nwritable_roots = [%s]\\n' ${quote(JSON.stringify(state))} >> ${quote(file)}`;
  const unknown = reason => ({ state: 'unknown', writableRoot: state,
    hint: `${reason}: no se puede saber si Codex deja escribir en ${state}. Si $revisar no consigue registrarse, permite esa carpeta.` });
  let config = {};
  try { const bytes = await boundedConfig(file); if (bytes) config = getStaticTOMLValue(parseTOML(bytes.toString('utf8'), { tomlVersion: '1.0.0' })); }
  catch { return { state: 'unreadable', writableRoot: state }; }
  let effective = config;
  if (config.profile !== undefined) {
    const profile = typeof config.profile === 'string' ? config.profiles?.[config.profile] : undefined;
    if (!profile || typeof profile !== 'object') return unknown('El perfil de configuración elegido no se encuentra');
    effective = { ...config, ...profile };
  }
  if (effective.default_permissions === ':danger-full-access') return { state: 'not-needed', writableRoot: state };
  if (effective.default_permissions !== undefined || effective.permissions !== undefined) return unknown('Codex usa perfiles de permisos');
  const mode = effective.sandbox_mode;
  if (mode === 'danger-full-access') return { state: 'not-needed', writableRoot: state };
  if (mode === 'read-only') return { state: 'read-only', writableRoot: state,
    hint: `Codex está en solo lectura: $revisar no puede registrarse. Usa sandbox_mode = "workspace-write" con ${state} en writable_roots.` };
  if (mode !== undefined && mode !== 'workspace-write') return unknown(`sandbox_mode = ${JSON.stringify(mode)} no es conocido`);
  const roots = effective.sandbox_workspace_write?.writable_roots;
  const target = await canonical(state);
  for (const root of Array.isArray(roots) ? roots : []) {
    if (typeof root !== 'string' || !root) continue;
    const relative = path.relative(await canonical(root.replace(/^~(?=$|\/)/u, home)), target);
    if (relative === '' || (relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative))) {
      return { state: 'allowed', writableRoot: state };
    }
  }
  return effective.sandbox_workspace_write ? { state: 'missing-root', writableRoot: state, hint: `Añade ${JSON.stringify(state)} a writable_roots de [sandbox_workspace_write] en ${file}.` }
    : { state: 'missing', writableRoot: state, command };
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
  const setup = await setupToolkit({ agent, homeDirectory, toolkitRoot, environment, codexHome });
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
    ...(setup.codexSandbox && { codexSandbox: setup.codexSandbox }),
    gemini: { available: await executable('agy', environment), provider: 'antigravity', apiFallback: false },
    superpowers: { included: false, required: false, detection: 'check-client-plugin-manager' }, nativeConnectionVerified: false };
}
