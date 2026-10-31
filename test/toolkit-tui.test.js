import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const TOOLKIT_ROOT = fileURLToPath(new URL('../', import.meta.url));

function createFakeTty({ columns = 100 } = {}) {
  const input = new EventEmitter();
  input.isTTY = true;
  input.rawMode = false;
  input.resumed = false;
  input.setRawMode = mode => { input.rawMode = Boolean(mode); };
  input.resume = () => { input.resumed = true; };
  input.pause = () => { input.resumed = false; };

  let buffer = '';
  const waiters = [];
  const output = new EventEmitter();
  output.isTTY = true;
  output.columns = columns;
  output.write = chunk => {
    buffer += String(chunk);
    for (let i = waiters.length - 1; i >= 0; i--) {
      if (waiters[i].regex.test(buffer)) {
        const w = waiters.splice(i, 1)[0];
        w.resolve();
      }
    }
    return true;
  };
  return {
    input,
    output,
    getOutput: () => buffer,
    sendKey: seq => input.emit('data', Buffer.from(seq, 'utf8')),
    waitFor: regex => (regex.test(buffer)
      ? Promise.resolve()
      : new Promise((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error(`Timeout waiting for ${regex}`)), 4000);
          waiters.push({ regex, resolve: () => { clearTimeout(timer); resolve(); } });
        }))
  };
}

async function createSandboxEnv(t, projectPkg = { name: 'ui-demo', dependencies: { react: '19.0.0', next: '15.0.0' } }) {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'toolkit-tui-')));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const homeDirectory = path.join(root, 'home');
  const codexHome = path.join(homeDirectory, '.codex');
  const projectRoot = path.join(root, 'project');
  const toolkitMini = path.join(root, 'toolkit');

  await fs.mkdir(homeDirectory, { recursive: true });
  await fs.mkdir(projectRoot, { recursive: true });
  await fs.writeFile(path.join(projectRoot, 'package.json'), JSON.stringify(projectPkg, null, 2));

  // Copy all 10 cataloged skills into toolkitMini preserving their installedPath (skills/ and catalogs/skills/)
  const catalogJson = JSON.parse(await fs.readFile(path.join(TOOLKIT_ROOT, 'catalogs/skills.json'), 'utf8'));
  await fs.mkdir(path.join(toolkitMini, 'catalogs'), { recursive: true });
  await fs.writeFile(path.join(toolkitMini, 'catalogs/skills.json'), JSON.stringify(catalogJson, null, 2));
  for (const entry of catalogJson.skills) {
    await fs.cp(path.join(TOOLKIT_ROOT, entry.installedPath), path.join(toolkitMini, entry.installedPath), { recursive: true });
  }
  await fs.writeFile(path.join(toolkitMini, 'package.json'), await fs.readFile(path.join(TOOLKIT_ROOT, 'package.json'), 'utf8'));

  return { root, homeDirectory, codexHome, projectRoot, toolkitRoot: toolkitMini };
}

test('wizard model separates Step 1 (mode), Step 2 (fundamental verified skills) and Step 3 (optional skills + Superpowers)', async t => {
  const env = await createSandboxEnv(t);
  const { getToolkitCommandsGuide } = await import('../src/toolkit-commands-guide.js');
  const { buildToolkitTuiSnapshot, createToolkitTuiModel, renderToolkitTuiFrame } = await import('../src/toolkit-tui.js');

  const guide = getToolkitCommandsGuide({ clients: { claude: { available: true }, codex: { available: true } } });
  assert.equal(guide.workflowCommands.some(c => c.claude === '/spec-driven-development'), true);
  assert.equal(guide.workflowCommands.some(c => c.codex === '$revisar'), true);

  const snapshot = await buildToolkitTuiSnapshot({
    projectRoot: env.projectRoot,
    agent: 'all',
    setupOptions: { homeDirectory: env.homeDirectory, codexHome: env.codexHome, toolkitRoot: env.toolkitRoot, environment: { PATH: '' } }
  });
  const model = createToolkitTuiModel(snapshot);
  assert.equal(model.step, 1);

  // Step 1 frame shows target & install mode
  const step1Frame = renderToolkitTuiFrame(model, { columns: 100, color: false });
  assert.match(step1Frame, /Paso 1 de 4/u);
  assert.match(step1Frame, /Next\.js/u);
  assert.match(step1Frame, /Enlace simbólico/u);

  // Step 2 frame shows ONLY fundamental matched skills (vercel-react-best-practices, vercel-composition-patterns, frontend-design, web-design-guidelines), pre-checked!
  model.step = 2;
  const step2Frame = renderToolkitTuiFrame(model, { columns: 100, color: false });
  assert.match(step2Frame, /Paso 2 de 4/u);
  assert.match(step2Frame, /vercel-react-best-practices/u);
  assert.match(step2Frame, /vercel-composition-patterns/u);
  assert.match(step2Frame, /frontend-design/u);
  assert.equal(model.fundamentalItems.every(i => i.checked), true);
  assert.equal(step2Frame.includes('differential-review'), false);

  // Step 3 frame shows optional skills (unchecked by default) + Superpowers
  model.step = 3;
  const step3Frame = renderToolkitTuiFrame(model, { columns: 100, color: false });
  assert.match(step3Frame, /Paso 3 de 4/u);
  assert.match(step3Frame, /differential-review/u);
  assert.match(step3Frame, /obra\/superpowers/u);
  assert.equal(model.optionalItems.every(i => !i.checked), true);

  // Commands overlay works from any step and narrow terminals
  model.showCommands = true;
  const commandsFrame = renderToolkitTuiFrame(model, { columns: 68, color: false });
  assert.match(commandsFrame, /\/programar/u);
  assert.match(commandsFrame, /\$revisar/u);
});

test('step-by-step wizard supports back navigation, zero-write cancel in Step 4, and verified copy + skills-lock.json installation', async t => {
  const env = await createSandboxEnv(t, { name: 'api-demo', dependencies: { express: '5.0.0' } });
  const { runToolkitTui } = await import('../src/toolkit-tui.js');

  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

  // 1. Walk Step 1 -> Step 2 -> Step 3 -> Step 4 (Preview) -> Backspace to Step 3 -> Forward to Step 4 -> Esc cancel: ZERO writes!
  const ttyCancel = createFakeTty();
  const cancelPromise = runToolkitTui({
    input: ttyCancel.input,
    output: ttyCancel.output,
    projectRoot: env.projectRoot,
    agent: 'all',
    setupOptions: { homeDirectory: env.homeDirectory, codexHome: env.codexHome, toolkitRoot: env.toolkitRoot, environment: { PATH: '' } }
  });

  await ttyCancel.waitFor(/Paso 1 de 4/u);
  ttyCancel.sendKey('\r'); // Step 1 -> Step 2
  await ttyCancel.waitFor(/Paso 2 de 4/u);
  ttyCancel.sendKey('\r'); // Step 2 -> Step 3
  await ttyCancel.waitFor(/Paso 3 de 4/u);
  ttyCancel.sendKey('\r'); // Step 3 -> Step 4 (Preview)
  await ttyCancel.waitFor(/Paso 4 de 4/u);
  assert.deepEqual(await fs.readdir(env.homeDirectory), []);
  assert.equal(await fs.access(path.join(env.projectRoot, '.agents')).then(() => true, () => false), false);

  ttyCancel.sendKey('\x7f'); // Backspace -> back to Step 3!
  await wait(15);
  ttyCancel.sendKey('\r'); // Step 3 -> Step 4 again
  await wait(30);
  ttyCancel.sendKey('\x1b'); // Esc cancel preview -> back to Step 1 with zero writes
  await ttyCancel.waitFor(/Instalación cancelada/u);
  ttyCancel.sendKey('\x03'); // Ctrl+C exit
  assert.equal(await cancelPromise, 0);
  assert.equal(ttyCancel.input.rawMode, false);
  assert.deepEqual(await fs.readdir(env.homeDirectory), []);

  // 2. Put a custom conflicting file at .agents/skills/api-design-principles/SKILL.md
  const conflictFile = path.join(env.projectRoot, '.agents/skills/api-design-principles/SKILL.md');
  await fs.mkdir(path.dirname(conflictFile), { recursive: true });
  await fs.writeFile(conflictFile, 'keep-my-file');

  // Run wizard choosing "copy + skills-lock.json" mode in Step 1 + adding 1 optional skill (differential-review) in Step 3!
  const ttyCopy = createFakeTty();
  const copyPromise = runToolkitTui({
    input: ttyCopy.input,
    output: ttyCopy.output,
    projectRoot: env.projectRoot,
    agent: 'all',
    setupOptions: { homeDirectory: env.homeDirectory, codexHome: env.codexHome, toolkitRoot: env.toolkitRoot, environment: { PATH: '' } }
  });

  await ttyCopy.waitFor(/Paso 1 de 4/u);
  // Step 1: move down to item 2 (Modo en proyecto) and press Space to switch symlink -> copy!
  ttyCopy.sendKey('j');
  ttyCopy.sendKey(' ');
  await ttyCopy.waitFor(/Copia verificada/u);
  ttyCopy.sendKey('\r'); // -> Step 2 (fundamentals: api-design-principles & nodejs-backend-patterns pre-checked)
  await ttyCopy.waitFor(/Paso 2 de 4/u);
  ttyCopy.sendKey('\r'); // -> Step 3 (optionals: cursor on 1st optional = differential-review)
  await ttyCopy.waitFor(/Paso 3 de 4/u);
  ttyCopy.sendKey(' '); // check differential-review!
  ttyCopy.sendKey('\r'); // -> Step 4 (Preview)
  await ttyCopy.waitFor(/skills-lock\.json/u);
  ttyCopy.sendKey('\r'); // Confirm install!
  await ttyCopy.waitFor(/Instalación verificada completada/u);
  ttyCopy.sendKey('q'); // Exit from done screen
  assert.equal(await copyPromise, 0);
  assert.equal(ttyCopy.input.rawMode, false);

  // Verify copied files + .agent-toolkit/skills-lock.json + .gitignore block + conflict untouched!
  assert.equal(await fs.readFile(conflictFile, 'utf8'), 'keep-my-file');
  const copiedSkillStat = await fs.lstat(path.join(env.projectRoot, '.claude/skills/nodejs-backend-patterns'));
  assert.equal(copiedSkillStat.isDirectory() && !copiedSkillStat.isSymbolicLink(), true);
  const optionalStat = await fs.lstat(path.join(env.projectRoot, '.agents/skills/differential-review'));
  assert.equal(optionalStat.isDirectory() && !optionalStat.isSymbolicLink(), true);

  const lock = JSON.parse(await fs.readFile(path.join(env.projectRoot, '.agent-toolkit/skills-lock.json'), 'utf8'));
  assert.ok(lock.skills['nodejs-backend-patterns']);
  assert.ok(lock.skills['differential-review']);
  const gitignoreText = await fs.readFile(path.join(env.projectRoot, '.gitignore'), 'utf8');
  assert.match(gitignoreText, /\.agent-toolkit\//u);

  // 3. Re-open wizard and decouple via [d] shortcut (first cancel with Esc, then confirm with Enter)!
  const ttyDetach = createFakeTty();
  const detachPromise = runToolkitTui({
    input: ttyDetach.input,
    output: ttyDetach.output,
    projectRoot: env.projectRoot,
    agent: 'all',
    setupOptions: { homeDirectory: env.homeDirectory, codexHome: env.codexHome, toolkitRoot: env.toolkitRoot, environment: { PATH: '' } }
  });

  await ttyDetach.waitFor(/acoplado en \.agent-toolkit\//u);
  ttyDetach.sendKey('d');
  await ttyDetach.waitFor(/Vista previa de desacoplado/u);
  ttyDetach.sendKey('\x1b'); // Esc cancel detach -> nothing deleted!
  await ttyDetach.waitFor(/Desacoplado cancelado/u);
  assert.equal(await fs.access(path.join(env.projectRoot, '.agent-toolkit/manifest.json')).then(() => true, () => false), true);

  ttyDetach.sendKey('d');
  await ttyDetach.waitFor(/Vista previa de desacoplado/u);
  ttyDetach.sendKey('\r'); // Confirm detach!
  await ttyDetach.waitFor(/Proyecto desacoplado limpiamente/u);
  ttyDetach.sendKey('q');
  assert.equal(await detachPromise, 0);

  // Coupled skills, .agent-toolkit/ and created .gitignore are gone, while user conflictFile remains intact!
  assert.equal(await fs.readFile(conflictFile, 'utf8'), 'keep-my-file');
  assert.equal(await fs.access(path.join(env.projectRoot, '.agent-toolkit')).then(() => true, () => false), false);
  assert.equal(await fs.access(path.join(env.projectRoot, '.gitignore')).then(() => true, () => false), false);
  assert.equal(await fs.access(path.join(env.projectRoot, '.claude')).then(() => true, () => false), false);
});

test('runToolkitCli handles non-TTY fallback, recommend, detach (--apply / --json) and preserves exit codes', async t => {
  const env = await createSandboxEnv(t);
  const { runToolkitCli } = await import('../src/toolkit-cli.js');
  const { planProjectSkillInstall, applyProjectSkillInstall } = await import('../src/skill-recommendations.js');
  const { loadSkillCatalog } = await import('../src/skill-catalog.js');

  let errOut = '';
  const codeNoTty = await runToolkitCli([], {
    out: () => {},
    err: text => { errOut += text; },
    isTTY: false
  });
  assert.equal(codeNoTty, 2);
  assert.match(errOut, /recommend/u);

  let jsonOut = '';
  const codeJson = await runToolkitCli(['recommend', '--project', env.projectRoot, '--dry-run', '--json'], {
    out: text => { jsonOut += text; },
    err: () => {},
    options: { toolkitRoot: env.toolkitRoot }
  });
  assert.equal(codeJson, 0);
  const parsed = JSON.parse(jsonOut);
  assert.deepEqual(parsed.signals.map(s => s.id).sort(), ['nextjs', 'nodejs', 'react']);
  assert.deepEqual(
    parsed.candidates.map(c => c.name).sort(),
    ['frontend-design', 'vercel-composition-patterns', 'vercel-react-best-practices', 'web-design-guidelines']
  );
  assert.equal(parsed.optional.some(o => o.name === 'differential-review'), true);

  let textOut = '';
  const codeText = await runToolkitCli(['recommend', '--project', env.projectRoot], {
    out: text => { textOut += text; },
    err: () => {},
    options: { toolkitRoot: env.toolkitRoot }
  });
  assert.equal(codeText, 0);
  assert.match(textOut, /vercel-react-best-practices/u);
  assert.match(textOut, /Opcionales disponibles/u);

  // Couple 1 skill into env.projectRoot, then test CLI detach preview + detach --apply --json!
  const catalog = await loadSkillCatalog();
  const installPlan = await planProjectSkillInstall({
    projectRoot: env.projectRoot,
    skillNames: ['vercel-react-best-practices'],
    agent: 'codex',
    mode: 'symlink',
    gitIgnore: 'gitignore',
    catalog,
    toolkitRoot: env.toolkitRoot
  });
  await applyProjectSkillInstall(installPlan);

  let detachPreviewOut = '';
  const codeDetachPreview = await runToolkitCli(['detach', '--project', env.projectRoot], {
    out: text => { detachPreviewOut += text; },
    err: () => {},
    options: { toolkitRoot: env.toolkitRoot }
  });
  assert.equal(codeDetachPreview, 0);
  assert.match(detachPreviewOut, /Vista previa de desacoplado/u);
  assert.equal(await fs.access(path.join(env.projectRoot, '.agent-toolkit/manifest.json')).then(() => true, () => false), true);

  let detachApplyJson = '';
  const codeDetachApply = await runToolkitCli(['detach', '--project', env.projectRoot, '--apply', '--json'], {
    out: text => { detachApplyJson += text; },
    err: () => {},
    options: { toolkitRoot: env.toolkitRoot }
  });
  assert.equal(codeDetachApply, 0);
  const detachParsed = JSON.parse(detachApplyJson);
  assert.equal(detachParsed.applied, true);
  assert.equal(detachParsed.removedCount, 1);
  assert.equal(detachParsed.stateDirRemoved, true);
  assert.equal(await fs.access(path.join(env.projectRoot, '.agent-toolkit')).then(() => true, () => false), false);

  assert.equal(await runToolkitCli(['recommend', '--profile', 'invalid'], { out: () => {}, err: () => {} }), 2);
  assert.equal(await runToolkitCli(['recommend', '--json', '--json'], { out: () => {}, err: () => {} }), 2);
});
