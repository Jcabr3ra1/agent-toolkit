import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { loadSkillCatalog, validateSkillCatalog } from '../src/skill-catalog.js';

const TOOLKIT_ROOT = fileURLToPath(new URL('../', import.meta.url));
const linkType = process.platform === 'win32' ? 'junction' : 'dir';

async function tempProject(t, files = {}) {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'skill-rec-')));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(root, rel);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, typeof content === 'string' ? content : JSON.stringify(content, null, 2));
  }
  return root;
}

async function snapshotTree(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const out = [];
  for (const e of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const full = path.join(dir, e.name);
    if (e.isSymbolicLink()) out.push({ name: e.name, type: 'link', target: await fs.readlink(full) });
    else if (e.isDirectory()) out.push({ name: e.name, type: 'dir', children: await snapshotTree(full) });
    else out.push({ name: e.name, type: 'file', content: await fs.readFile(full, 'utf8') });
  }
  return out;
}

test('Node-only and Node+MCP fixtures do not invent frontend, HTTP frameworks or databases, and perform zero writes', async t => {
  const { inspectSkillProject, recommendSkills } = await import('../src/skill-recommendations.js');
  const catalog = await loadSkillCatalog();

  const nodeOnly = await tempProject(t, {
    'package.json': { name: 'plain-cli', version: '1.0.0', dependencies: { zod: '^4.0.0' } },
    '.env': 'SECRET_TOKEN=must-never-be-read'
  });
  const before = await snapshotTree(nodeOnly);
  const nodeInspection = await inspectSkillProject(nodeOnly, { toolkitRoot: TOOLKIT_ROOT });
  assert.deepEqual(nodeInspection.signals.map(s => s.id), ['nodejs']);
  const nodeRec = recommendSkills({ catalog, inspection: nodeInspection });
  assert.deepEqual(nodeRec.recommended, []);
  assert.deepEqual(nodeRec.candidates, []);
  assert.equal(nodeRec.optional.length, catalog.skills.filter(skill => skill.review.status !== 'rejected').length);
  assert.equal(JSON.stringify({ nodeInspection, nodeRec }).includes('SECRET_TOKEN'), false);
  assert.deepEqual(await snapshotTree(nodeOnly), before);

  // Inspecting Agent Toolkit itself detects Node.js and MCP SDK without inventing React/Next/Hono
  const toolkitInspection = await inspectSkillProject(TOOLKIT_ROOT, { toolkitRoot: TOOLKIT_ROOT });
  assert.deepEqual(toolkitInspection.signals.map(s => s.id).sort(), ['mcp-sdk', 'nodejs']);
  const toolkitRec = recommendSkills({ catalog, inspection: toolkitInspection });
  assert.equal(toolkitRec.recommended.length, 0);
  assert.deepEqual(toolkitRec.candidates.map(c => c.name), ['mcp-builder']);
  assert.equal(toolkitRec.candidates[0].installed?.integrity, 'verified');
  assert.equal(toolkitRec.optional.some(o => o.name === 'differential-review'), true);
});

test('Full-stack fixture matches fundamental verified skills (Vercel React, Supabase, Node API) and separates optional skills', async t => {
  const { inspectSkillProject, recommendSkills } = await import('../src/skill-recommendations.js');
  const catalog = await loadSkillCatalog();

  const webApp = await tempProject(t, {
    'package.json': {
      name: 'modern-fullstack',
      dependencies: {
        next: '15.0.0',
        react: '19.0.0',
        '@supabase/supabase-js': '2.45.0',
        express: '5.0.0'
      },
      devDependencies: {
        tailwindcss: '4.0.0',
        vitest: '3.0.0'
      }
    },
    'tsconfig.json': '{"compilerOptions":{"strict":true}}'
  });

  const inspection = await inspectSkillProject(webApp, { toolkitRoot: TOOLKIT_ROOT });
  assert.deepEqual(
    inspection.signals.map(s => s.id).sort(),
    ['express', 'nextjs', 'nodejs', 'react', 'supabase', 'tailwindcss', 'typescript', 'vitest']
  );

  const rec = recommendSkills({ catalog, inspection });
  assert.deepEqual(
    rec.candidates.map(c => c.name).sort(),
    [
      'api-design-principles',
      'frontend-design',
      'nodejs-backend-patterns',
      'supabase-postgres-best-practices',
      'vercel-composition-patterns',
      'vercel-react-best-practices',
      'web-design-guidelines'
    ]
  );
  assert.deepEqual(
    rec.optional.map(o => o.name).sort(),
    ['differential-review', 'mcp-builder', 'webapp-testing']
  );
  assert.deepEqual(rec.unmatchedSignals.map(u => u.id), ['vitest']);
  assert.equal(rec.addons.some(a => a.id === 'superpowers'), true);
});

test('malformed package.json, unconfirmed config files, non-Node manifests and scenario 4-criteria gate are handled safely', async t => {
  const { inspectSkillProject, recommendSkills } = await import('../src/skill-recommendations.js');
  const baseCatalog = JSON.parse(JSON.stringify(await loadSkillCatalog()));

  const broken = await tempProject(t, {
    'package.json': '{ broken json ',
    'next.config.mjs': 'export default {};',
    'Cargo.toml': '[package]\nname = "rust-app"\n'
  });
  const brokenInspection = await inspectSkillProject(broken, { toolkitRoot: TOOLKIT_ROOT });
  assert.deepEqual(brokenInspection.signals, []);
  assert.equal(brokenInspection.limits.some(l => /package\.json/u.test(l)), true);
  assert.equal(brokenInspection.limits.some(l => /next\.config\.mjs/u.test(l)), true);
  assert.equal(brokenInspection.limits.some(l => /Cargo\.toml/u.test(l)), true);

  const customCatalogData = structuredClone(baseCatalog);
  const fd = customCatalogData.skills.find(s => s.name === 'frontend-design');
  fd.scenarios.push({
    id: 'react-ui-claude',
    revision: fd.revision,
    profile: 'frontend',
    taskClass: 'ui-authoring',
    requiredSignals: ['react'],
    client: 'claude',
    status: 'passed',
    evidencePath: 'docs/skills/evidencias/2026-10-28-evaluacion-inicial-mcp-seguridad.md'
  });
  const customCatalog = validateSkillCatalog(customCatalogData);

  const reactProject = await tempProject(t, {
    'package.json': { name: 'ui', dependencies: { react: '19.0.0' } }
  });
  const reactInspection = await inspectSkillProject(reactProject, { toolkitRoot: TOOLKIT_ROOT });
  assert.equal(recommendSkills({ catalog: customCatalog, inspection: reactInspection, profile: 'frontend' }).recommended.length, 0);
  assert.deepEqual(
    recommendSkills({ catalog: customCatalog, inspection: reactInspection, profile: 'frontend', client: 'claude' }).recommended.map(r => r.name),
    ['frontend-design']
  );
});

test('supports both symlink mode and verified copy + skills-lock.json mode, preserves conflicts and rejects tampered SHA-256', async t => {
  const {
    inspectSkillProject,
    planProjectSkillInstall,
    applyProjectSkillInstall,
    verifyBundledSkillHashes
  } = await import('../src/skill-recommendations.js');
  const catalog = await loadSkillCatalog();

  // 1. Symlink mode works for both skills/ and catalogs/skills/
  const symlinkProj = await tempProject(t, {
    'package.json': { name: 'sym-app', dependencies: { react: '19.0.0' } }
  });
  const symPlan = await planProjectSkillInstall({
    projectRoot: symlinkProj,
    skillNames: ['frontend-design', 'vercel-react-best-practices'],
    agent: 'all',
    mode: 'symlink',
    catalog,
    toolkitRoot: TOOLKIT_ROOT
  });
  assert.equal(symPlan.applied, false);
  const symApplied = await applyProjectSkillInstall(symPlan);
  assert.equal(symApplied.created, 4);
  assert.equal(
    await fs.realpath(path.join(symlinkProj, '.agents/skills/vercel-react-best-practices')),
    await fs.realpath(path.join(TOOLKIT_ROOT, 'catalogs/skills/vercel-react-best-practices'))
  );
  const symInspect = await inspectSkillProject(symlinkProj, { toolkitRoot: TOOLKIT_ROOT, catalog });
  const vrbp = symInspect.installed.find(i => i.name === 'vercel-react-best-practices');
  assert.equal(vrbp.integrity, 'verified');

  // 2. Copy + skills-lock.json mode copies verified files, is idempotent, and preserves conflicts
  const copyProj = await tempProject(t, {
    'package.json': { name: 'copy-app', dependencies: { express: '5.0.0' } },
    '.agents/skills/api-design-principles/SKILL.md': 'local user customization'
  });
  const copyPlan = await planProjectSkillInstall({
    projectRoot: copyProj,
    skillNames: ['nodejs-backend-patterns', 'api-design-principles'],
    agent: 'all',
    mode: 'copy',
    catalog,
    toolkitRoot: TOOLKIT_ROOT
  });
  assert.equal(copyPlan.conflicts, 1);
  assert.equal(copyPlan.willWriteLockfile, true);

  const copyApplied = await applyProjectSkillInstall(copyPlan);
  assert.equal(copyApplied.created, 3); // codex+claude nodejs-backend-patterns + claude api-design-principles
  assert.equal(copyApplied.conflicts, 1);
  assert.equal(copyApplied.lockfileWritten, true);

  // Conflict untouched
  assert.equal(
    await fs.readFile(path.join(copyProj, '.agents/skills/api-design-principles/SKILL.md'), 'utf8'),
    'local user customization'
  );
  // Copied directory is a real directory (not a symlink) and passes integrity verification
  const copiedStat = await fs.lstat(path.join(copyProj, '.claude/skills/nodejs-backend-patterns'));
  assert.equal(copiedStat.isDirectory() && !copiedStat.isSymbolicLink(), true);

  const lock = JSON.parse(await fs.readFile(path.join(copyProj, '.agent-toolkit/skills-lock.json'), 'utf8'));
  assert.equal(lock.lockfileVersion, 1);
  assert.equal(lock.skills['nodejs-backend-patterns'].license, 'MIT');
  assert.deepEqual(lock.skills['nodejs-backend-patterns'].clients, ['claude', 'codex']);
  assert.equal(await fs.access(path.join(copyProj, 'skills-lock.json')).then(() => true, () => false), false);

  // Repeating copy plan sees existing verified copies as 'installed' (0 new creations needed!)
  const repeatPlan = await planProjectSkillInstall({
    projectRoot: copyProj,
    skillNames: ['nodejs-backend-patterns'],
    agent: 'all',
    mode: 'copy',
    catalog,
    toolkitRoot: TOOLKIT_ROOT
  });
  assert.equal(repeatPlan.links.every(l => l.state === 'installed'), true);

  // 3. Tampered bundled file is rejected by SHA-256 check BEFORE writing anything
  const fakeToolkit = await tempProject(t, {});
  const nodePatternsEntry = catalog.skills.find(s => s.name === 'nodejs-backend-patterns');
  await fs.cp(
    path.join(TOOLKIT_ROOT, nodePatternsEntry.installedPath),
    path.join(fakeToolkit, nodePatternsEntry.installedPath),
    { recursive: true }
  );
  await fs.appendFile(path.join(fakeToolkit, nodePatternsEntry.installedPath, 'SKILL.md'), '\n<!-- tampered -->\n');

  const check = await verifyBundledSkillHashes({ skillEntry: nodePatternsEntry, toolkitRoot: fakeToolkit });
  assert.equal(check.ok, false);

  const cleanTargetProj = await tempProject(t, { 'package.json': { name: 'safe' } });
  await assert.rejects(
    planProjectSkillInstall({
      projectRoot: cleanTargetProj,
      skillNames: ['nodejs-backend-patterns'],
      agent: 'codex',
      mode: 'copy',
      catalog,
      toolkitRoot: fakeToolkit
    }),
    /SHA-256/u
  );
});

test('git ignore management (.gitignore & .git/info/exclude) and safe decoupling (planToolkitDetach / applyToolkitDetach)', async t => {
  const {
    inspectSkillProject,
    planProjectSkillInstall,
    applyProjectSkillInstall,
    planToolkitDetach,
    applyToolkitDetach
  } = await import('../src/skill-recommendations.js');
  const catalog = await loadSkillCatalog();

  // Case A: Existing .gitignore rules are preserved on install AND restored byte-for-byte on detach;
  // custom user skills are NEVER removed on detach!
  const projA = await tempProject(t, {
    'package.json': { name: 'proj-a', dependencies: { react: '19.0.0' } },
    '.gitignore': 'node_modules/\ndist/\n',
    '.claude/skills/my-custom-skill/SKILL.md': '# My team skill\n'
  });

  const planA = await planProjectSkillInstall({
    projectRoot: projA,
    skillNames: ['vercel-react-best-practices'],
    agent: 'all',
    mode: 'symlink',
    gitIgnore: 'gitignore',
    catalog,
    toolkitRoot: TOOLKIT_ROOT
  });
  await applyProjectSkillInstall(planA);

  const gitignoreAfterInstall = await fs.readFile(path.join(projA, '.gitignore'), 'utf8');
  assert.match(gitignoreAfterInstall, /^node_modules\/\ndist\/\n\n# >>> agent-toolkit/u);
  assert.match(gitignoreAfterInstall, /\.agent-toolkit\//u);
  assert.match(gitignoreAfterInstall, /\.agents\/skills\/vercel-react-best-practices/u);
  assert.match(gitignoreAfterInstall, /\.claude\/skills\/vercel-react-best-practices/u);
  assert.doesNotMatch(gitignoreAfterInstall, /my-custom-skill/u);

  const inspectCoupled = await inspectSkillProject(projA, { toolkitRoot: TOOLKIT_ROOT, catalog });
  assert.equal(inspectCoupled.coupling.coupled, true);

  // Preview detach does not delete anything
  const detachPlanA = await planToolkitDetach({
    projectRoot: projA,
    catalog,
    toolkitRoot: TOOLKIT_ROOT
  });
  assert.equal(detachPlanA.applied, false);
  assert.equal(detachPlanA.removeStateDir, true);
  assert.equal(await fs.access(path.join(projA, '.agent-toolkit/manifest.json')).then(() => true, () => false), true);

  // Apply detach removes coupled symlinks, .agent-toolkit/, empty .agents/, and restores .gitignore while keeping custom skill!
  const detachedA = await applyToolkitDetach(detachPlanA);
  assert.equal(detachedA.removedCount, 2);
  assert.equal(detachedA.stateDirRemoved, true);
  assert.equal(await fs.readFile(path.join(projA, '.gitignore'), 'utf8'), 'node_modules/\ndist/\n');
  assert.equal(await fs.access(path.join(projA, '.agent-toolkit')).then(() => true, () => false), false);
  assert.equal(await fs.access(path.join(projA, '.agents')).then(() => true, () => false), false);
  assert.equal(await fs.readFile(path.join(projA, '.claude/skills/my-custom-skill/SKILL.md'), 'utf8'), '# My team skill\n');

  const inspectAfterDetach = await inspectSkillProject(projA, { toolkitRoot: TOOLKIT_ROOT, catalog });
  assert.equal(inspectAfterDetach.coupling.coupled, false);

  // Case B: .git/info/exclude strategy + copy mode + modified copy protection on detach
  const projB = await tempProject(t, {
    'package.json': { name: 'proj-b', dependencies: { express: '5.0.0' } },
    '.git/info/exclude': '# git ls-files --others --exclude-from=.git/info/exclude\n'
  });

  const planB = await planProjectSkillInstall({
    projectRoot: projB,
    skillNames: ['nodejs-backend-patterns', 'api-design-principles'],
    agent: 'codex',
    mode: 'copy',
    gitIgnore: 'git-exclude',
    catalog,
    toolkitRoot: TOOLKIT_ROOT
  });
  await applyProjectSkillInstall(planB);

  // .gitignore was never created; .git/info/exclude received the managed block!
  assert.equal(await fs.access(path.join(projB, '.gitignore')).then(() => true, () => false), false);
  const excludeAfterInstall = await fs.readFile(path.join(projB, '.git/info/exclude'), 'utf8');
  assert.match(excludeAfterInstall, /\.agent-toolkit\//u);
  assert.match(excludeAfterInstall, /\.agents\/skills\/nodejs-backend-patterns/u);

  // User edits api-design-principles locally -> detach MUST refuse to delete it while removing unmodified nodejs-backend-patterns!
  await fs.appendFile(path.join(projB, '.agents/skills/api-design-principles/SKILL.md'), '\n# user note\n');
  const detachPlanB = await planToolkitDetach({
    projectRoot: projB,
    catalog,
    toolkitRoot: TOOLKIT_ROOT
  });
  assert.equal(detachPlanB.conflicts, 1);
  const detachedB = await applyToolkitDetach(detachPlanB);
  assert.equal(detachedB.removedCount, 1);
  assert.equal(detachedB.conflicts, 1);
  assert.equal(await fs.access(path.join(projB, '.agents/skills/nodejs-backend-patterns')).then(() => true, () => false), false);
  assert.match(
    await fs.readFile(path.join(projB, '.agents/skills/api-design-principles/SKILL.md'), 'utf8'),
    /# user note/u
  );

  // Case C: Global detach (--global) removes toolkit global symlinks & generated level agents, keeping user files
  const fakeHome = await tempProject(t, {
    '.claude/skills/user-global-skill/SKILL.md': '# keep',
    '.codex/agents/nivel_ligero.toml': '# Generado por `agent-toolkit-inbox agentes`. Ese comando nunca sobrescribe...\nname = "nivel_ligero"\n',
    '.codex/agents/custom_agent.toml': 'name = "custom"\n'
  });
  await fs.mkdir(path.join(fakeHome, '.agents/skills'), { recursive: true });
  await fs.symlink(
    path.join(TOOLKIT_ROOT, 'skills/mcp-builder'),
    path.join(fakeHome, '.agents/skills/mcp-builder'),
    linkType
  );

  const globalDetachPlan = await planToolkitDetach({
    includeGlobal: true,
    agent: 'all',
    catalog,
    toolkitRoot: TOOLKIT_ROOT,
    homeDirectory: fakeHome,
    codexHome: path.join(fakeHome, '.codex')
  });
  const globalDetached = await applyToolkitDetach(globalDetachPlan);
  assert.equal(globalDetached.removedCount, 2); // mcp-builder symlink + nivel_ligero.toml
  assert.equal(await fs.access(path.join(fakeHome, '.agents/skills/mcp-builder')).then(() => true, () => false), false);
  assert.equal(await fs.access(path.join(fakeHome, '.codex/agents/nivel_ligero.toml')).then(() => true, () => false), false);
  assert.equal(await fs.readFile(path.join(fakeHome, '.claude/skills/user-global-skill/SKILL.md'), 'utf8'), '# keep');
  assert.equal(await fs.readFile(path.join(fakeHome, '.codex/agents/custom_agent.toml'), 'utf8'), 'name = "custom"\n');
});

test('validated recommendations require applicable passed scenarios for every target client', async t => {
  const { inspectSkillProject, recommendSkills } = await import('../src/skill-recommendations.js');
  const data = structuredClone(await loadSkillCatalog());
  const entry = data.skills.find(skill => skill.name === 'mcp-builder');
  const root = await tempProject(t, { 'package.json': { dependencies: { '@modelcontextprotocol/sdk': '1.30.0' } } });
  const inspection = await inspectSkillProject(root, { toolkitRoot: TOOLKIT_ROOT });
  const scenario = client => ({ id: `mcp-${client}`, revision: entry.revision, profile: 'mcp', taskClass: 'mcp-development', requiredSignals: ['mcp-sdk'], client, status: 'passed', evidencePath: `docs/skills/evidencias/mcp-${client}.md` });
  entry.scenarios = [scenario('claude')];
  let report = recommendSkills({ catalog: validateSkillCatalog(data), inspection, clients: ['claude', 'codex'] });
  assert.equal(report.recommended.length, 0);
  assert.equal(report.candidates[0].recommendationStatus, 'compatible');
  assert.ok(report.candidates[0].pendingReasons.some(reason => reason.includes('codex')));
  assert.match(report.candidates[0].reasons[0], /package\.json \(@modelcontextprotocol\/sdk\)/u);
  assert.equal(recommendSkills({ catalog: validateSkillCatalog(data), inspection, clients: ['claude'] }).recommended[0].recommendationStatus, 'validated');
  entry.scenarios.push(scenario('codex'));
  report = recommendSkills({ catalog: validateSkillCatalog(data), inspection, clients: ['claude', 'codex'] });
  assert.deepEqual(report.recommended.map(skill => skill.name), ['mcp-builder']);
  assert.deepEqual(report.recommended[0].evidence.map(item => item.client), ['claude', 'codex']);
  entry.scenarios[1].status = 'failed';
  assert.equal(recommendSkills({ catalog: validateSkillCatalog(data), inspection, clients: ['claude', 'codex'] }).recommended.length, 0);
  entry.scenarios[1].status = 'passed';
  entry.review.status = 'pending';
  assert.equal(recommendSkills({ catalog: validateSkillCatalog(data), inspection, clients: ['claude', 'codex'] }).recommended.length, 0);
  assert.throws(() => recommendSkills({ catalog: validateSkillCatalog(data), inspection, clients: ['unknown'] }));
});
