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
