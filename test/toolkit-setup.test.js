import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

async function fixture(t) {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'toolkit-setup-')));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const homeDirectory = path.join(root, 'home'), toolkitRoot = path.join(root, 'toolkit');
  await fs.mkdir(homeDirectory);
  await fs.mkdir(path.join(toolkitRoot, 'skills', 'example'), { recursive: true });
  await fs.writeFile(path.join(toolkitRoot, 'skills', 'example', 'SKILL.md'), '---\nname: example\ndescription: Example\n---\n');
  return { root, homeDirectory, toolkitRoot };
}
const moduleUrl = new URL('../src/toolkit-setup.js', import.meta.url);
test('setup preview writes nothing; apply links both clients and repeating preserves links', async t => {
  const f = await fixture(t);
  assert.equal(await fs.access(moduleUrl).then(() => true, () => false), true, 'setup module exists');
  const { setupToolkit } = await import(moduleUrl);
  const preview = await setupToolkit({ ...f, agent: 'all' });
  assert.equal(preview.applied, false);
  assert.equal(preview.skills.length, 2);
  assert.deepEqual(await fs.readdir(f.homeDirectory), []);
  assert.equal((await setupToolkit({ ...f, agent: 'all', apply: true })).applied, true);
  assert.equal(await fs.realpath(path.join(f.homeDirectory, '.agents/skills/example')), path.join(f.toolkitRoot, 'skills/example'));
  assert.equal((await setupToolkit({ ...f, agent: 'all', apply: true })).skills.every(s => s.state === 'installed'), true);
});
test('setup preserves occupied targets and rejects symlink parents without modifying unrelated files', async t => {
  const f = await fixture(t);
  assert.equal(await fs.access(moduleUrl).then(() => true, () => false), true);
  const { setupToolkit } = await import(moduleUrl);
  await fs.mkdir(path.join(f.homeDirectory, '.agents/skills/example'), { recursive: true });
  await fs.writeFile(path.join(f.homeDirectory, '.agents/skills/example/mine'), 'keep');
  const blocked = await setupToolkit({ ...f, agent: 'codex', apply: true });
  assert.equal(blocked.applied, false);
  assert.equal(blocked.skills[0].state, 'conflict');
  assert.equal(await fs.readFile(path.join(f.homeDirectory, '.agents/skills/example/mine'), 'utf8'), 'keep');
  await fs.symlink(f.root, path.join(f.homeDirectory, '.claude'));
  await assert.rejects(setupToolkit({ ...f, agent: 'claude', apply: true }));
});
test('doctor reports missing dependencies and optional Superpowers without creating configuration', async t => {
  const f = await fixture(t);
  assert.equal(await fs.access(moduleUrl).then(() => true, () => false), true);
  const { doctorToolkit } = await import(moduleUrl);
  const result = await doctorToolkit({ ...f, agent: 'codex', environment: { PATH: '' } });
  assert.equal(result.clients.codex.available, false);
  assert.equal(result.superpowers.required, false);
  assert.equal(result.mcp.codex.state, 'missing');
  assert.equal(result.nativeConnectionVerified, false);
  assert.deepEqual(await fs.readdir(f.homeDirectory), []);
});

test('doctor recognizes complete MCP tables with extra fields without exposing their contents', async t => {
  const f = await fixture(t), { doctorToolkit } = await import(moduleUrl);
  await fs.mkdir(path.join(f.homeDirectory,'.codex'));
  const config = `[mcp_servers.agent-toolkit-workflow]\ncommand = "node"\nargs = [${JSON.stringify(path.join(f.toolkitRoot,'bin/agent-toolkit-mcp.js'))}]\nstartup_timeout_sec = 20\n[mcp_servers.agent-toolkit-workflow.env]\nPRIVATE_VALUE = "must-not-leak"\n`;
  await fs.writeFile(path.join(f.homeDirectory,'.codex/config.toml'), config);
  const result = await doctorToolkit({ ...f, agent: 'codex', environment: { PATH: '' } });
  assert.equal(result.mcp.codex.state, 'configured');
  assert.equal(JSON.stringify(result).includes('must-not-leak'), false);
});

test('setup and doctor report whether the Codex sandbox lets $revisar write its reviewer record', async t => {
  const f = await fixture(t), { setupToolkit, doctorToolkit } = await import(moduleUrl);
  const { execFileSync } = await import('node:child_process');
  const codexHome = path.join(f.homeDirectory, '.codex'), config = path.join(codexHome, 'config.toml');
  const state = path.join(f.homeDirectory, '.agent-toolkit');
  const check = async () => (await setupToolkit({ ...f, agent: 'codex', codexHome })).codexSandbox;
  assert.equal((await setupToolkit({ ...f, agent: 'claude', codexHome })).codexSandbox, undefined);
  const missing = await check();
  assert.deepEqual([missing.state, missing.writableRoot], ['missing', state]);
  await fs.mkdir(codexHome);
  await fs.writeFile(config, 'model = "x"\n');
  // The printed command appends the section once and refuses to duplicate it.
  execFileSync('sh', ['-c', missing.command]);
  assert.match(execFileSync('sh', ['-c', missing.command], { encoding: 'utf8' }), /Ya existe la sección/u);
  assert.equal((await fs.readFile(config, 'utf8')).match(/\[sandbox_workspace_write\]/gu).length, 1);
  assert.equal((await check()).state, 'allowed');
  assert.equal((await doctorToolkit({ ...f, agent: 'codex', codexHome, environment: { PATH: '' } })).codexSandbox.state, 'allowed');
  await fs.writeFile(config, '[sandbox_workspace_write]\nwritable_roots = ["~/.agent-toolkit"]\n');
  assert.equal((await check()).state, 'allowed');
  await fs.writeFile(config, '[sandbox_workspace_write]\nwritable_roots = ["/otra"]\n');
  const partial = await check();
  assert.deepEqual([partial.state, 'command' in partial], ['missing-root', false]);
  assert.match(partial.hint, /writable_roots/u);
  await fs.writeFile(config, 'sandbox_mode = "danger-full-access"\n');
  assert.equal((await check()).state, 'not-needed');
  await fs.writeFile(config, 'roto = [\n');
  assert.equal((await check()).state, 'unreadable');
});

test('the sandbox check follows the mode, profiles, permission profiles, parent roots, links and CODEX_HOME', async t => {
  const f = await fixture(t), { setupToolkit, doctorToolkit } = await import(moduleUrl);
  const codexHome = path.join(f.homeDirectory, '.codex'), config = path.join(codexHome, 'config.toml');
  const state = path.join(f.homeDirectory, '.agent-toolkit');
  await fs.mkdir(codexHome);
  const check = async (text, extra = {}) => { await fs.writeFile(config, text); return (await setupToolkit({ ...f, agent: 'codex', codexHome, ...extra })).codexSandbox; };
  const roots = list => `[sandbox_workspace_write]\nwritable_roots = ${JSON.stringify(list)}\n`;
  // writable_roots only count in workspace-write; read-only blocks the record whatever the roots say.
  const readOnly = await check('sandbox_mode = "read-only"\n' + roots([state]));
  assert.equal(readOnly.state, 'read-only');
  assert.match(readOnly.hint, /workspace-write/u);
  assert.equal((await check('sandbox_mode = "workspace-write"\n' + roots([state]))).state, 'allowed');
  // A parent folder allows it; a sibling that only shares the prefix does not.
  assert.equal((await check(roots([f.homeDirectory]))).state, 'allowed');
  assert.equal((await check(roots([path.join(f.homeDirectory, '.agent')]))).state, 'missing-root');
  // The same folder reached through a link counts.
  const link = path.join(f.root, 'enlace-home');
  await fs.symlink(f.homeDirectory, link);
  assert.equal((await check(roots([path.join(link, '.agent-toolkit')]))).state, 'allowed');
  // The selected configuration profile overrides the top level.
  assert.equal((await check(`profile = "trabajo"\n[profiles.trabajo]\nsandbox_mode = "danger-full-access"\n`)).state, 'not-needed');
  assert.equal((await check(`profile = "trabajo"\nsandbox_mode = "danger-full-access"\n[profiles.trabajo]\nsandbox_mode = "read-only"\n`)).state, 'read-only');
  assert.equal((await check(`profile = "trabajo"\n[profiles.trabajo]\nsandbox_mode = "workspace-write"\n[profiles.trabajo.sandbox_workspace_write]\nwritable_roots = ${JSON.stringify([state])}\n`)).state, 'allowed');
  const missingProfile = await check('profile = "otro"\n');
  assert.deepEqual([missingProfile.state, 'command' in missingProfile], ['unknown', false]);
  // Permission profiles: full access is understood; anything else is reported as unknown, not as a change to make.
  assert.equal((await check('default_permissions = ":danger-full-access"\n')).state, 'not-needed');
  const custom = await check('default_permissions = "revisor"\n[permissions.revisor]\nnetwork = false\n');
  assert.deepEqual([custom.state, 'command' in custom], ['unknown', false]);
  assert.equal((await check('sandbox_mode = "otro-modo"\n')).state, 'unknown');
  // setup and doctor read the same configuration when CODEX_HOME is set.
  const other = path.join(f.root, 'codex-home');
  await fs.mkdir(other);
  await fs.writeFile(path.join(other, 'config.toml'), 'sandbox_mode = "danger-full-access"\n');
  await fs.writeFile(config, 'model = "x"\n');
  const environment = { PATH: '', CODEX_HOME: other };
  assert.equal((await setupToolkit({ ...f, agent: 'codex', environment })).codexSandbox.state, 'not-needed');
  assert.equal((await doctorToolkit({ ...f, agent: 'codex', environment })).codexSandbox.state, 'not-needed');
});
