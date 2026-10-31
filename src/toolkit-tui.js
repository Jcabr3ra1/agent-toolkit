import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadSkillCatalog } from './skill-catalog.js';
import {
  applyProjectSkillInstall,
  applyToolkitDetach,
  inspectSkillProject,
  planProjectSkillInstall,
  planToolkitDetach,
  PROJECT_TOOLKIT_DIR,
  recommendSkills
} from './skill-recommendations.js';
import { levelAgentPlan, writeLevelAgents } from './level-agents.js';
import { getToolkitCommandsGuide } from './toolkit-commands-guide.js';
import { doctorToolkit, setupToolkit, TOOLKIT_ROOT } from './toolkit-setup.js';

const AGENTS_CYCLE = ['all', 'claude', 'codex'];
const AGENT_LABELS = Object.freeze({
  all: 'Claude + Codex (ambos)',
  claude: 'Solo Claude Code',
  codex: 'Solo Codex'
});
const MODE_LABELS = Object.freeze({
  symlink: 'Enlace simbólico hacia Agent Toolkit (ligero, recomendado)',
  copy: `Copia verificada + ${PROJECT_TOOLKIT_DIR}/skills-lock.json`
});
const GIT_IGNORE_LABELS = Object.freeze({
  gitignore: `.gitignore (bloque gestionado con ${PROJECT_TOOLKIT_DIR}/)`,
  'git-exclude': '.git/info/exclude (invisible en Git sin tocar .gitignore)'
});

function style(colorEnabled) {
  if (!colorEnabled) {
    const plain = text => String(text);
    return { bold: plain, cyan: plain, green: plain, yellow: plain, dim: plain, red: plain, magenta: plain };
  }
  const wrap = (open, close) => text => `\x1b[${open}m${text}\x1b[${close}m`;
  return {
    bold: wrap(1, 22),
    dim: wrap(2, 22),
    red: wrap(31, 39),
    green: wrap(32, 39),
    yellow: wrap(33, 39),
    magenta: wrap(35, 39),
    cyan: wrap(36, 39)
  };
}

function truncate(text, maxLen) {
  if (maxLen <= 4 || text.length <= maxLen) return text;
  return text.slice(0, maxLen - 1) + '…';
}

export async function buildToolkitTuiSnapshot({
  projectRoot = process.cwd(),
  agent = 'all',
  profile = null,
  codexProfile,
  installMode = 'symlink',
  setupOptions = {}
} = {}) {
  const toolkitRoot = setupOptions.toolkitRoot ?? TOOLKIT_ROOT;
  const catalogUrl = setupOptions.toolkitRoot
    ? pathToFileURL(path.join(toolkitRoot, 'catalogs/skills.json'))
    : undefined;
  const catalog = await loadSkillCatalog(catalogUrl ? { catalogUrl } : {});

  const [doctor, setupPreview, inspection, codexLevels] = await Promise.all([
    doctorToolkit({ ...setupOptions, agent, ...(codexProfile && { codexProfile }) }),
    setupToolkit({ ...setupOptions, agent, apply: false, ...(codexProfile && { codexProfile }) }),
    inspectSkillProject(projectRoot, { toolkitRoot, catalog }),
    agent === 'claude'
      ? Promise.resolve({ catalog: false, files: [] })
      : levelAgentPlan(setupOptions.codexHome ? { codexHome: setupOptions.codexHome } : {}).catch(() => ({ catalog: false, files: [] }))
  ]);

  const recommendation = recommendSkills({
    catalog,
    inspection,
    ...(profile && { profile })
  });

  const projectInstallPlan = await planProjectSkillInstall({
    projectRoot: inspection.projectRoot,
    skillNames: catalog.skills.map(s => s.name),
    agent,
    mode: installMode,
    catalog,
    toolkitRoot
  });

  const guide = getToolkitCommandsGuide({ clients: doctor.clients });

  return {
    agent,
    profile,
    codexProfile,
    installMode,
    catalog,
    doctor,
    setupPreview,
    codexLevels,
    inspection,
    recommendation,
    projectInstallPlan,
    guide
  };
}

function buildSkillItem(entry, linksForSkill, { isFundamental }) {
  const missingCount = linksForSkill.filter(l => ['missing', 'replace'].includes(l.state)).length;
  const conflictCount = linksForSkill.filter(l => l.state === 'conflict').length;
  const stateLabel = conflictCount > 0
    ? '⚠ conflicto respetado'
    : missingCount === 0
      ? '✓ ya instalada'
      : 'SHA-256 ✓';

  const reasonText = isFundamental
    ? entry.reasons.map(r => r.replace(/\s*\(package\.json.*\)$/u, '')).join(', ')
    : `perfil ${entry.profiles.join('/')}`;

  return {
    id: `skill:${entry.name}`,
    skillName: entry.name,
    title: entry.name,
    summary: entry.summary,
    license: entry.license,
    origin: `${reasonText} · ${stateLabel} (${entry.license})`,
    checked: Boolean(isFundamental && missingCount > 0),
    alreadyReady: missingCount === 0 && conflictCount === 0
  };
}

export function createToolkitTuiModel(snapshot) {
  const pendingGlobal = snapshot.setupPreview.skills.filter(s => ['missing', 'replace'].includes(s.state)).length;
  const conflictGlobal = snapshot.setupPreview.conflicts;
  const newLevels = snapshot.codexLevels.files.filter(f => f.state === 'nuevo').length;
  const globalNeedsSync = (pendingGlobal > 0 && conflictGlobal === 0) || newLevels > 0;

  const fundamentalSource = [
    ...snapshot.recommendation.recommended,
    ...snapshot.recommendation.candidates
  ];
  const fundamentalItems = fundamentalSource.map(entry => {
    const links = snapshot.projectInstallPlan.links.filter(l => l.name === entry.name);
    return buildSkillItem(entry, links, { isFundamental: true });
  });

  const optionalItems = snapshot.recommendation.optional.map(entry => {
    const links = snapshot.projectInstallPlan.links.filter(l => l.name === entry.name);
    return buildSkillItem(entry, links, { isFundamental: false });
  });

  const coupling = snapshot.inspection.coupling ?? { coupled: false, gitIgnoreStrategy: 'gitignore' };
  const initialGitIgnore = coupling.gitIgnoreStrategy === 'git-exclude' ? 'git-exclude' : 'gitignore';

  return {
    step: 1, // 1 | 2 | 3 | 4 | 'done' | 'detach-preview' | 'detached'
    showCommands: false,
    cursors: { 1: 0, 2: 0, 3: 0 },
    config: {
      agent: snapshot.agent,
      installMode: snapshot.installMode ?? coupling.mode ?? 'symlink',
      gitIgnore: initialGitIgnore,
      syncGlobalCore: globalNeedsSync,
      globalAlreadyReady: !globalNeedsSync && conflictGlobal === 0,
      pendingGlobalCount: pendingGlobal + newLevels
    },
    snapshot,
    fundamentalItems,
    optionalItems,
    previewData: null,
    detachPlan: null,
    resultData: null,
    statusMessage: null
  };
}

export function renderToolkitTuiFrame(model, { columns = 96, color = true } = {}) {
  const c = style(color);
  const width = Math.max(60, Math.min(columns - 4, 98));
  const innerWidth = width - 4;
  const lines = [];

  // Header Box (AutoSkills style)
  lines.push(c.cyan(`  ╭${'─'.repeat(width - 2)}╮`));
  lines.push(`  ${c.cyan('│')} ${c.bold(truncate('nexakit · Asistente por pasos de skills verificadas', innerWidth).padEnd(innerWidth))} ${c.cyan('│')}`);
  lines.push(`  ${c.cyan('│')} ${c.dim(truncate(`Proyecto: ${model.snapshot.inspection.projectName}`, innerWidth).padEnd(innerWidth))} ${c.cyan('│')}`);
  lines.push(c.cyan(`  ╰${'─'.repeat(width - 2)}╯`));
  lines.push('');

  // Commands overlay (available anytime via [c])
  if (model.showCommands) {
    lines.push(`  ${c.bold('Chuleta rápida de comandos (en Claude usa /nombre · en Codex usa $nombre):')}`);
    for (const cmd of model.snapshot.guide.workflowCommands) {
      const label = cmd.id === 'revisar' ? `${cmd.codex} / ${cmd.claude}` : cmd.claude;
      lines.push(`    ${c.cyan(label.padEnd(28))} ${c.dim('←')} ${truncate(cmd.description, Math.max(22, width - 34))}`);
    }
    lines.push('');
    lines.push(`  ${c.bold('Comandos de terminal:')}`);
    for (const cli of model.snapshot.guide.cliCommands) {
      lines.push(`    ${c.green(cli.command.padEnd(40))} ${c.dim('←')} ${truncate(cli.description, Math.max(20, width - 46))}`);
    }
    lines.push('');
    lines.push(`  ${c.dim('[Esc / c / Tab] Volver al paso actual · [q] Salir')}`);
    return lines.join('\n') + '\n';
  }

  // Top of vertical rail: Environment + Detected Stack
  const doc = model.snapshot.doctor;
  const envBadges = [
    doc.node.supported ? c.green(`✓ Node ${doc.node.version}`) : c.red(`✗ Node ${doc.node.version}`),
    ...Object.entries(doc.clients).map(([name, info]) => (info.available ? c.green(`✓ ${name}`) : c.yellow(`○ ${name}`))),
    Object.values(doc.mcp).every(m => m.state === 'configured') ? c.green('✓ MCP') : c.yellow('○ MCP pendiente')
  ];
  lines.push(`  ${c.cyan('┌')}  ${c.bold('Entorno:')} ${envBadges.join(' · ')}`);

  const sigLabels = model.snapshot.inspection.signals.map(s => `${c.green('✓')} ${s.label}`);
  if (sigLabels.length === 0) {
    lines.push(`  ${c.cyan('│')}  ${c.bold('Tecnologías detectadas:')} ${c.dim('sin señales Node en la raíz')}`);
  } else {
    lines.push(`  ${c.cyan('│')}  ${c.bold('Tecnologías detectadas:')} ${sigLabels.join('  ')}`);
  }
  for (const unm of model.snapshot.recommendation.unmatchedSignals) {
    lines.push(`  ${c.cyan('│')}    ${c.dim(`● ${unm.label} (sin skill empaquetada aún)`)}`);
  }
  for (const lim of model.snapshot.inspection.limits.slice(0, 2)) {
    lines.push(`  ${c.cyan('│')}    ${c.yellow('!')} ${c.dim(truncate(lim, width - 10))}`);
  }
  if (model.snapshot.inspection.coupling?.coupled && model.step !== 'detached') {
    lines.push(`  ${c.cyan('│')}  ${c.bold('Proyecto:')} ${c.green(`✓ acoplado en ${PROJECT_TOOLKIT_DIR}/`)} ${c.dim('· pulsa [d] para desacoplar limpiamente')}`);
  }
  lines.push(`  ${c.cyan('│')}`);

  const shortMode = model.config.installMode === 'copy' ? `Copia + ${PROJECT_TOOLKIT_DIR}/skills-lock.json` : 'Enlace simbólico';
  const shortAgent = model.config.agent === 'all' ? 'Claude + Codex' : model.config.agent;
  const shortIgnore = model.config.gitIgnore === 'git-exclude' ? '.git/info/exclude' : '.gitignore';

  // Detached Done Screen
  if (model.step === 'detached' && model.resultData) {
    const r = model.resultData;
    lines.push(`  ${c.green('◇')}  ${c.bold(c.green('Proyecto desacoplado limpiamente'))}`);
    lines.push(`  ${c.cyan('│')}    Skills retiradas del proyecto: ${r.removedCount}`);
    lines.push(`  ${c.cyan('│')}    Carpeta ${PROJECT_TOOLKIT_DIR}/ retirada: ${r.stateDirRemoved ? 'sí' : 'sin cambios'}`);
    lines.push(`  ${c.cyan('│')}    Reglas Git ignore limpiadas:   ${r.gitIgnoreCleanedCount}`);
    if (r.conflicts > 0) {
      lines.push(`  ${c.cyan('│')}    Archivos propios respetados:   ${c.yellow(String(r.conflicts))}`);
    }
    lines.push(`  ${c.cyan('│')}`);
    lines.push(`  ${c.cyan('└')}  ${c.dim('[Enter / q] Cerrar asistente · [c] Ver chuleta completa')}`);
    return lines.join('\n') + '\n';
  }

  // Detach Safe Preview Screen
  if (model.step === 'detach-preview' && model.detachPlan) {
    const dp = model.detachPlan;
    const actionable = dp.items.filter(i => i.action !== 'conflict');
    lines.push(`  ${c.yellow('◆')}  ${c.bold(c.yellow('Vista previa de desacoplado (aún no se ha borrado nada)'))}`);
    for (const item of actionable.slice(0, 10)) {
      lines.push(`  ${c.cyan('│')}    ${c.red('−')} [${item.client}] ${item.relativePath} ${c.dim(`(${item.reason})`)}`);
    }
    if (actionable.length > 10) {
      lines.push(`  ${c.cyan('│')}    ${c.dim(`… y ${actionable.length - 10} skill(s) más.`)}`);
    }
    if (dp.removeStateDir) {
      lines.push(`  ${c.cyan('│')}    ${c.red('−')} [estado] ${PROJECT_TOOLKIT_DIR}/ (manifiesto y lockfile locales)`);
    }
    for (const upd of dp.gitIgnoreUpdates ?? []) {
      lines.push(`  ${c.cyan('│')}    ${c.red('−')} [git] Retirar bloque gestionado de ${upd.relativePath}`);
    }
    for (const conf of dp.items.filter(i => i.action === 'conflict')) {
      lines.push(`  ${c.cyan('│')}    ${c.yellow('⚠')} ${conf.relativePath} — ${conf.reason}`);
    }
    lines.push(`  ${c.cyan('│')}`);
    lines.push(`  ${c.cyan('└')}  ${c.bold('[Enter / s] Confirmar desacoplado')} · ${c.dim('[Esc / Bksp / n] cancelar sin borrar')}`);
    return lines.join('\n') + '\n';
  }

  // Done Screen
  if (model.step === 'done' && model.resultData) {
    const r = model.resultData;
    lines.push(`  ${c.green('◇')}  ${c.bold(c.green('Instalación verificada completada'))}`);
    lines.push(`  ${c.cyan('│')}    Modo aplicado en proyecto:     ${shortMode}`);
    lines.push(`  ${c.cyan('│')}    Skills instaladas en proyecto: ${r.projectLinksCreated} destino(s)`);
    lines.push(`  ${c.cyan('│')}    Estado aislado e ignorado en:  ${PROJECT_TOOLKIT_DIR}/ (${shortIgnore})`);
    if (model.config.installMode === 'copy') {
      lines.push(`  ${c.cyan('│')}    skills-lock.json actualizado:  ${r.lockfileWritten ? `sí (${PROJECT_TOOLKIT_DIR}/)` : 'sin cambios'}`);
    }
    if (r.globalApplied || r.levelsCreated > 0) {
      lines.push(`  ${c.cyan('│')}    Núcleo global actualizado:     ${r.globalApplied ? 'skills enlazadas' : ''} ${r.levelsCreated ? `(${r.levelsCreated} niveles Codex)` : ''}`.trimEnd());
    }
    if (r.conflicts > 0) {
      lines.push(`  ${c.cyan('│')}    Conflictos respetados intactos: ${c.yellow(String(r.conflicts))}`);
    }
    lines.push(`  ${c.cyan('│')}`);
    lines.push(`  ${c.cyan('◆')}  ${c.bold('Comandos listos para empezar en tu sesión:')}`);
    for (const cmd of model.snapshot.guide.workflowCommands.slice(0, 5)) {
      const label = cmd.id === 'revisar' ? `${cmd.codex} / ${cmd.claude}` : cmd.claude;
      lines.push(`  ${c.cyan('│')}    ${c.cyan(label.padEnd(26))} ${c.dim('←')} ${truncate(cmd.description, Math.max(22, width - 36))}`);
    }
    lines.push(`  ${c.cyan('│')}`);
    lines.push(`  ${c.cyan('└')}  ${c.dim('[Enter / q] Cerrar · [c] Chuleta completa · (para desacoplar después: npx nexakit detach)')}`);
    return lines.join('\n') + '\n';
  }

  // Collapsed breadcrumbs of completed steps
  const numStep = typeof model.step === 'number' ? model.step : 0;
  if (numStep > 1) {
    lines.push(`  ${c.green('◇')}  ${c.dim(`Paso 1 · Destino: ${shortAgent} · Modo: ${shortMode} · Git: ${shortIgnore}`)}`);
  }
  if (numStep > 2) {
    const fundCount = model.fundamentalItems.filter(i => i.checked).length;
    lines.push(`  ${c.green('◇')}  ${c.dim(`Paso 2 · Skills fundamentales marcadas: ${fundCount} de ${model.fundamentalItems.length}`)}`);
  }
  if (numStep > 3) {
    const optCount = model.optionalItems.filter(i => i.checked).length;
    lines.push(`  ${c.green('◇')}  ${c.dim(`Paso 3 · Skills opcionales marcadas: ${optCount}`)}`);
  }
  if (numStep > 1) lines.push(`  ${c.cyan('│')}`);

  const detachHint = model.snapshot.inspection.coupling?.coupled ? ' · [d] desacoplar' : '';

  // Active Step 1: Target, Mode & Git Ignore
  if (model.step === 1) {
    const cur = model.cursors[1];
    lines.push(`  ${c.cyan('◆')}  ${c.bold('Paso 1 de 4 · Destino, modo y Git ignore')}`);
    const rows = [
      {
        label: 'Agentes destino:',
        value: AGENT_LABELS[model.config.agent],
        hint: '(Espacio cambia: ambos / claude / codex)'
      },
      {
        label: 'Modo en proyecto:',
        value: MODE_LABELS[model.config.installMode],
        hint: ''
      },
      {
        label: 'Ignorar en Git:',
        value: GIT_IGNORE_LABELS[model.config.gitIgnore],
        hint: ''
      },
      {
        label: 'Núcleo global:',
        value: `${model.config.syncGlobalCore ? c.green('[x]') : c.dim('[ ]')} Sincronizar pack base y agentes de nivel ${model.config.globalAlreadyReady ? c.dim('(✓ ya al día)') : c.yellow(`(${model.config.pendingGlobalCount} pendientes)`)}`,
        hint: ''
      }
    ];
    rows.forEach((r, idx) => {
      const ptr = idx === cur ? c.cyan('❯') : ' ';
      const title = idx === cur ? c.bold(r.label.padEnd(18)) : r.label.padEnd(18);
      const val = r.hint ? `${c.cyan(r.value)} ${c.dim(r.hint)}` : r.value;
      lines.push(`  ${c.cyan('│')}  ${ptr} ${idx + 1}. ${title} ${val}`);
    });
    lines.push(`  ${c.cyan('│')}`);
    lines.push(`  ${c.cyan('└')}  ${c.dim(`[↑/↓] mover · [Espacio] cambiar · [Enter] ir a Paso 2${detachHint} · [c] comandos · [q] salir`)}`);
  }

  // Active Step 2: Fundamental Recommended & Verified Skills
  if (model.step === 2) {
    const cur = model.cursors[2];
    const checkedCount = model.fundamentalItems.filter(i => i.checked).length;
    lines.push(`  ${c.cyan('◆')}  ${c.bold(`Paso 2 de 4 · Skills recomendadas y verificadas para tu stack (${checkedCount} marcadas)`)}`);
    if (model.fundamentalItems.length === 0) {
      lines.push(`  ${c.cyan('│')}    ${c.dim('No se detectaron frameworks adicionales que requieran skills específicas en este paso.')}`);
      lines.push(`  ${c.cyan('│')}    ${c.dim('Pulsa [Enter] para revisar las skills opcionales disponibles en el Paso 3.')}`);
    } else {
      lines.push(`  ${c.cyan('│')}    ${c.dim('Fijadas por revisión y comprobadas con SHA-256 frente al catálogo local:')}`);
      model.fundamentalItems.forEach((item, idx) => {
        const ptr = idx === cur ? c.cyan('❯') : ' ';
        const box = item.checked ? c.green('[x]') : c.dim('[ ]');
        const name = idx === cur ? c.bold(item.title) : item.title;
        const orig = c.dim(`← ${truncate(item.origin, Math.max(20, width - item.title.length - 18))}`);
        lines.push(`  ${c.cyan('│')}  ${ptr} ${box} ${idx + 1}. ${name}  ${orig}`);
      });
    }
    lines.push(`  ${c.cyan('│')}`);
    lines.push(`  ${c.cyan('└')}  ${c.dim(`[↑/↓] mover · [Espacio] marcar · [a] todas · [Enter] siguiente · [Bksp/←] atrás${detachHint} · [c] comandos`)}`);
  }

  // Active Step 3: Optional Skills & External Add-ons (Superpowers)
  if (model.step === 3) {
    const cur = model.cursors[3];
    const checkedCount = model.optionalItems.filter(i => i.checked).length;
    lines.push(`  ${c.cyan('◆')}  ${c.bold(`Paso 3 de 4 · Skills opcionales y añadidos (${checkedCount} marcadas)`)}`);
    if (model.optionalItems.length === 0) {
      lines.push(`  ${c.cyan('│')}    ${c.dim('Todas las skills del catálogo ya encajaron con tu stack en el Paso 2.')}`);
    } else {
      lines.push(`  ${c.cyan('│')}    ${c.dim('Opcionales verificadas fuera del stack detectado (desmarcadas por defecto):')}`);
      model.optionalItems.forEach((item, idx) => {
        const ptr = idx === cur ? c.cyan('❯') : ' ';
        const box = item.checked ? c.green('[x]') : c.dim('[ ]');
        const name = idx === cur ? c.bold(item.title) : item.title;
        const orig = c.dim(`← ${truncate(item.origin, Math.max(20, width - item.title.length - 18))}`);
        lines.push(`  ${c.cyan('│')}  ${ptr} ${box} ${idx + 1}. ${name}  ${orig}`);
      });
    }
    if (model.snapshot.recommendation.addons.length > 0) {
      lines.push(`  ${c.cyan('│')}`);
      lines.push(`  ${c.cyan('│')}    ${c.bold('Añadido externo opcional (sin descarga automática):')}`);
      for (const addon of model.snapshot.recommendation.addons) {
        lines.push(`  ${c.cyan('│')}      ${c.magenta('•')} ${addon.name} (${addon.versionReviewed} · ${addon.license}) ${c.dim('— 4 prácticas base ya adaptadas')}`);
        lines.push(`  ${c.cyan('│')}        ${c.dim(truncate(`Claude: ${addon.installHints.claude}`, width - 12))}`);
      }
    }
    lines.push(`  ${c.cyan('│')}`);
    lines.push(`  ${c.cyan('└')}  ${c.dim(`[↑/↓] mover · [Espacio] marcar · [a] todas · [Enter] vista previa · [Bksp/←] atrás${detachHint} · [c] comandos`)}`);
  }

  // Active Step 4: Safe Preview + SHA-256 Integrity Check
  if (model.step === 4 && model.previewData) {
    const p = model.previewData;
    lines.push(`  ${c.yellow('◆')}  ${c.bold(c.yellow('Paso 4 de 4 · Vista previa segura (aún no se ha escrito nada en disco)'))}`);
    if (p.verifiedSkillsCount > 0) {
      lines.push(`  ${c.cyan('│')}    ${c.green(`✓ Integridad SHA-256 comprobada en ${p.verifiedSkillsCount} skill(s) del catálogo`)}`);
    }
    if (p.actions.length === 0) {
      lines.push(`  ${c.cyan('│')}    ${c.dim('No hay cambios pendientes de escribir (todo lo seleccionado ya está al día).')}`);
    } else {
      for (const act of p.actions.slice(0, 12)) {
        const icon = act.kind === 'conflict' ? c.yellow('⚠') : c.green('+');
        lines.push(`  ${c.cyan('│')}    ${icon} ${truncate(act.label, width - 10)}`);
      }
      if (p.actions.length > 12) {
        lines.push(`  ${c.cyan('│')}    ${c.dim(`… y ${p.actions.length - 12} acción(es) más en la selección.`)}`);
      }
    }
    if (p.conflictsCount > 0) {
      lines.push(`  ${c.cyan('│')}    ${c.yellow(`Nota: ${p.conflictsCount} conflicto(s) existente(s) se respetarán sin borrar ni sobrescribir.`)}`);
    }
    if (p.manualCommands.length > 0) {
      lines.push(`  ${c.cyan('│')}`);
      lines.push(`  ${c.cyan('│')}    ${c.bold('Comandos externos sugeridos (opcional):')}`);
      for (const cmd of p.manualCommands.slice(0, 2)) {
        lines.push(`  ${c.cyan('│')}      ${c.dim('$')} ${truncate(cmd, width - 12)}`);
      }
    }
    lines.push(`  ${c.cyan('│')}`);
    lines.push(`  ${c.cyan('└')}  ${c.bold('[Enter / s] Confirmar e instalar')} · ${c.dim('[Bksp/←] volver al Paso 3 · [Esc / n] cancelar sin escribir')}`);
  }

  if (model.statusMessage) {
    lines.push('');
    lines.push(`  ${c.yellow(model.statusMessage)}`);
  }

  return lines.join('\n') + '\n';
}

export async function computeInstallPreview(model, setupOptions = {}) {
  const actions = [];
  let conflictsCount = 0;
  const activeAgent = model.config.agent;
  const activeMode = model.config.installMode;
  const activeGitIgnore = model.config.gitIgnore ?? 'gitignore';

  let freshSetupPreview = null;
  let freshLevelsPlan = null;
  if (model.config.syncGlobalCore) {
    freshSetupPreview = await setupToolkit({
      ...setupOptions,
      agent: activeAgent,
      apply: false,
      ...(model.snapshot.codexProfile && { codexProfile: model.snapshot.codexProfile })
    });
    for (const s of freshSetupPreview.skills) {
      if (['missing', 'replace'].includes(s.state)) {
        actions.push({ kind: 'create', label: `[global ${s.client}] ${s.name} → ${s.target}` });
      } else if (s.state === 'conflict') {
        conflictsCount++;
        actions.push({ kind: 'conflict', label: `[conflicto global ${s.client}] ${s.target} (no se toca)` });
      }
    }

    if (activeAgent !== 'claude') {
      freshLevelsPlan = await levelAgentPlan(setupOptions.codexHome ? { codexHome: setupOptions.codexHome } : {});
      for (const f of freshLevelsPlan.files) {
        if (f.state === 'nuevo') {
          actions.push({ kind: 'create', label: `[nivel codex] ${f.name} → ${f.path}` });
        } else if (f.state === 'distinto') {
          conflictsCount++;
          actions.push({ kind: 'conflict', label: `[distinto respetado] ${f.path} (no se sobrescribe)` });
        }
      }
    }
  }

  const selectedProjectSkills = [
    ...model.fundamentalItems.filter(i => i.checked).map(i => i.skillName),
    ...model.optionalItems.filter(i => i.checked).map(i => i.skillName)
  ];

  let freshProjectPlan = null;
  if (selectedProjectSkills.length > 0) {
    freshProjectPlan = await planProjectSkillInstall({
      projectRoot: model.snapshot.inspection.projectRoot,
      skillNames: selectedProjectSkills,
      agent: activeAgent,
      mode: activeMode,
      gitIgnore: activeGitIgnore,
      catalog: model.snapshot.catalog,
      toolkitRoot: setupOptions.toolkitRoot ?? TOOLKIT_ROOT
    });
    const verb = activeMode === 'copy' ? 'copia' : 'enlace';
    for (const l of freshProjectPlan.links) {
      const relTarget = path.relative(model.snapshot.inspection.projectRoot, l.target);
      if (['missing', 'replace'].includes(l.state)) {
        actions.push({ kind: 'create', label: `[${verb} ${l.client}] ${l.name} → ${relTarget}` });
      } else if (l.state === 'conflict') {
        conflictsCount++;
        actions.push({ kind: 'conflict', label: `[conflicto ${l.client}] ${relTarget} (no se toca)` });
      }
    }
    if (freshProjectPlan.stateDirConflict) {
      conflictsCount++;
      actions.push({ kind: 'conflict', label: `[conflicto estado] ${PROJECT_TOOLKIT_DIR}/ no es carpeta regular (no se toca)` });
    } else if (freshProjectPlan.willWriteManifest) {
      actions.push({ kind: 'create', label: `[estado] Guardar registro de acoplamiento en ${PROJECT_TOOLKIT_DIR}/manifest.json` });
    }
    if (freshProjectPlan.willWriteLockfile) {
      actions.push({ kind: 'create', label: `[lockfile] Guardar hashes SHA-256 en ${PROJECT_TOOLKIT_DIR}/skills-lock.json` });
    } else if (freshProjectPlan.lockfileConflict) {
      conflictsCount++;
      actions.push({ kind: 'conflict', label: `[conflicto lockfile] ${PROJECT_TOOLKIT_DIR}/skills-lock.json ocupado (no se toca)` });
    }
    const ignoreTargetLabel = activeGitIgnore === 'git-exclude' ? '.git/info/exclude' : '.gitignore';
    if (freshProjectPlan.willUpdateGitIgnore) {
      actions.push({ kind: 'create', label: `[git] Ignorar ${PROJECT_TOOLKIT_DIR}/ y skills instaladas en ${ignoreTargetLabel}` });
    } else if (freshProjectPlan.gitIgnoreConflict) {
      conflictsCount++;
      actions.push({ kind: 'conflict', label: `[conflicto git] ${ignoreTargetLabel} no es archivo regular (no se toca)` });
    } else if (freshProjectPlan.gitIgnoreUnavailable && activeGitIgnore === 'git-exclude') {
      actions.push({ kind: 'conflict', label: '[aviso git] No se detectó .git para .git/info/exclude; cambia a .gitignore si deseas ignorarlo' });
    }
  }

  const manualCommands = [];
  for (const [client, state] of Object.entries(model.snapshot.doctor.mcp)) {
    if ((activeAgent === 'all' || activeAgent === client) && state.state !== 'configured' && model.snapshot.doctor.registrationCommands[client]) {
      manualCommands.push(model.snapshot.doctor.registrationCommands[client]);
    }
  }
  if (activeAgent !== 'claude' && model.snapshot.doctor.codexSandbox?.command) {
    manualCommands.push(model.snapshot.doctor.codexSandbox.command);
  }

  return {
    actions,
    conflictsCount,
    verifiedSkillsCount: selectedProjectSkills.length,
    manualCommands,
    freshSetupPreview,
    freshLevelsPlan,
    freshProjectPlan
  };
}

export async function executeApprovedPreview(model, setupOptions = {}) {
  const preview = model.previewData;
  let globalApplied = false;
  let levelsCreated = 0;
  let projectLinksCreated = 0;
  let lockfileWritten = false;
  let conflicts = 0;

  if (preview.freshSetupPreview) {
    const res = await setupToolkit({
      ...setupOptions,
      agent: model.config.agent,
      apply: true,
      ...(model.snapshot.codexProfile && { codexProfile: model.snapshot.codexProfile })
    });
    globalApplied = res.applied;
    conflicts += res.conflicts;
  }

  if (preview.freshLevelsPlan) {
    const written = await writeLevelAgents(preview.freshLevelsPlan, { force: false });
    levelsCreated = written.files.filter(f => f.state === 'escrito').length;
    conflicts += written.files.filter(f => f.state === 'distinto').length;
  }

  if (preview.freshProjectPlan) {
    const appliedInstall = await applyProjectSkillInstall(preview.freshProjectPlan);
    projectLinksCreated = appliedInstall.created;
    lockfileWritten = appliedInstall.lockfileWritten;
    conflicts += appliedInstall.conflicts;
  }

  return {
    globalApplied,
    levelsCreated,
    projectLinksCreated,
    lockfileWritten,
    conflicts,
    restartRequired: Boolean(globalApplied || levelsCreated > 0 || projectLinksCreated > 0)
  };
}

export function formatRecommendationReport(report) {
  const lines = [
    `Agent Toolkit · Recomendaciones para ${report.projectName}`,
    `Raíz: ${report.projectRoot}${report.profile ? ` · Perfil: ${report.profile}` : ''}${report.client ? ` · Cliente: ${report.client}` : ''}`,
    '',
    'Tecnologías detectadas:'
  ];

  if (report.signals.length === 0) {
    lines.push('  - Ninguna tecnología cubierta detectada automáticamente.');
  } else {
    for (const sig of report.signals) {
      lines.push(`  ✓ ${sig.label} ← ${sig.sources.join(', ')}`);
    }
  }
  for (const unm of report.unmatchedSignals) {
    lines.push(`  • ${unm.label} (sin skill empaquetada aún)`);
  }

  lines.push('', `Recomendaciones con escenario probado (${report.recommended.length}):`);
  if (report.recommended.length === 0) {
    lines.push('  - Ninguna cumple todavía los 4 criterios de escenario probado para este filtro.');
  } else {
    for (const rec of report.recommended) {
      lines.push(`  - ${rec.name} (${rec.license}) ← ${rec.reasons.join(', ')} [tarea: ${rec.taskClass}]`);
    }
  }

  lines.push('', `Skills fundamentales verificadas para tu stack (${report.candidates.length}):`);
  if (report.candidates.length === 0) {
    lines.push('  - Ninguna skill específica adicional coincide con las señales actuales.');
  } else {
    for (const cand of report.candidates) {
      const state = cand.installed ? ` · en proyecto: ${cand.installed.integrity}` : '';
      lines.push(`  - ${cand.name} (${cand.license}, SHA-256 ✓) ← ${cand.reasons.join(', ')}${state}`);
    }
  }

  if (report.optional && report.optional.length > 0) {
    lines.push('', `Opcionales disponibles en el catálogo (${report.optional.length}):`);
    for (const opt of report.optional) {
      lines.push(`  - ${opt.name} (${opt.license}) ← perfil ${opt.profiles.join('/')}`);
    }
  }

  if (report.addons.length > 0) {
    lines.push('', 'Añadidos opcionales:');
    for (const addon of report.addons) {
      lines.push(`  - ${addon.name} (${addon.versionReviewed}, ${addon.license}): ${addon.summary}`);
    }
  }

  if (report.limits.length > 0) {
    lines.push('', 'Límites de la inspección:');
    for (const lim of report.limits) lines.push(`  ! ${lim}`);
  }

  return lines.join('\n') + '\n';
}

export async function runToolkitTui({
  input = process.stdin,
  output = process.stdout,
  projectRoot = process.cwd(),
  agent = 'all',
  codexProfile,
  setupOptions = {}
} = {}) {
  const snapshot = await buildToolkitTuiSnapshot({
    projectRoot,
    agent,
    codexProfile,
    setupOptions
  });
  const model = createToolkitTuiModel(snapshot);
  const useColor = Boolean(output.isTTY && !process.env.NO_COLOR);

  const render = () => {
    const frame = renderToolkitTuiFrame(model, {
      columns: output.columns || 96,
      color: useColor
    });
    output.write(`\x1b[2J\x1b[H${frame}`);
  };

  let cleanedUp = false;
  let processingChain = Promise.resolve();

  return new Promise(resolve => {
    const cleanup = code => {
      if (cleanedUp) return;
      cleanedUp = true;
      input.off?.('data', onData);
      output.off?.('resize', render);
      try {
        if (typeof input.setRawMode === 'function') input.setRawMode(false);
      } catch {}
      try {
        input.pause?.();
      } catch {}
      output.write('\x1b[?25h\n');
      resolve(code);
    };

    const handleKey = async key => {
      if (cleanedUp) return;

      if (key === '\x03') {
        cleanup(0);
        return;
      }

      if (model.showCommands) {
        if (key === 'q' || key === 'Q') {
          cleanup(0);
          return;
        }
        if (key === '\x1b' || key === 'c' || key === 'C' || key === '\t' || key === '?') {
          model.showCommands = false;
          render();
        }
        return;
      }

      if (key === 'c' || key === 'C' || key === '\t' || key === '?') {
        model.showCommands = true;
        render();
        return;
      }

      if (key === 'q' || key === 'Q') {
        cleanup(0);
        return;
      }

      if (model.step === 'done' || model.step === 'detached') {
        if (key === '\r' || key === '\n' || key === '\x1b') {
          cleanup(0);
        }
        return;
      }

      model.statusMessage = null;

      // Detach safe preview confirmation / cancel
      if (model.step === 'detach-preview') {
        if (key === '\x1b' || key === 'n' || key === 'N' || key === '\x7f' || key === '\x08' || key === '\x1b[D') {
          model.step = 1;
          model.detachPlan = null;
          model.statusMessage = 'Desacoplado cancelado; no se eliminó ningún archivo.';
          render();
          return;
        }
        if (key === '\r' || key === '\n' || key === 's' || key === 'S') {
          try {
            const detachedResult = await applyToolkitDetach(model.detachPlan);
            model.resultData = detachedResult;
            model.step = 'detached';
          } catch (err) {
            model.step = 1;
            model.statusMessage = err?.message || 'No se pudo completar el desacoplado.';
          }
          render();
        }
        return;
      }

      // Step 4: Preview confirmation / back / cancel
      if (model.step === 4) {
        if (key === '\x7f' || key === '\x08' || key === '\x1b[D') {
          model.step = 3;
          model.previewData = null;
          render();
          return;
        }
        if (key === '\x1b' || key === 'n' || key === 'N') {
          model.step = 1;
          model.previewData = null;
          model.statusMessage = 'Instalación cancelada; no se modificó ningún archivo.';
          render();
          return;
        }
        if (key === '\r' || key === '\n' || key === 's' || key === 'S') {
          try {
            const resultData = await executeApprovedPreview(model, setupOptions);
            model.resultData = resultData;
            model.step = 'done';
          } catch (err) {
            model.step = 1;
            model.statusMessage = err?.message || 'No se pudo completar la instalación.';
          }
          render();
        }
        return;
      }

      // [d] Detach project shortcut from Steps 1, 2 or 3
      if ((key === 'd' || key === 'D') && (model.step === 1 || model.step === 2 || model.step === 3)) {
        try {
          const dp = await planToolkitDetach({
            projectRoot: model.snapshot.inspection.projectRoot,
            includeGlobal: false,
            agent: model.config.agent,
            catalog: model.snapshot.catalog,
            toolkitRoot: setupOptions.toolkitRoot ?? TOOLKIT_ROOT
          });
          const hasWork =
            dp.items.length > 0 ||
            dp.removeStateDir ||
            dp.removeLegacyLockfile ||
            (dp.gitIgnoreUpdates?.length ?? 0) > 0;
          if (!hasWork) {
            model.statusMessage = 'Este proyecto no tiene artefactos acoplados por Agent Toolkit para retirar.';
          } else {
            model.detachPlan = dp;
            model.step = 'detach-preview';
          }
        } catch (err) {
          model.statusMessage = err?.message || 'No se pudo calcular la vista previa de desacoplado.';
        }
        render();
        return;
      }

      // Back navigation on Steps 2 and 3
      if ((model.step === 2 || model.step === 3) && (key === '\x7f' || key === '\x08' || key === '\x1b[D')) {
        model.step = model.step - 1;
        render();
        return;
      }

      // Step 1 controls (4 rows: agent, installMode, gitIgnore, syncGlobalCore)
      if (model.step === 1) {
        if (key === '\x1b[A' || key === 'k') {
          model.cursors[1] = (model.cursors[1] + 3) % 4;
          render();
          return;
        }
        if (key === '\x1b[B' || key === 'j') {
          model.cursors[1] = (model.cursors[1] + 1) % 4;
          render();
          return;
        }
        if (key === ' ' || key === '\x1b[C' || key === '\x1b[D') {
          const idx = model.cursors[1];
          if (idx === 0) {
            const nextIdx = (AGENTS_CYCLE.indexOf(model.config.agent) + 1) % AGENTS_CYCLE.length;
            model.config.agent = AGENTS_CYCLE[nextIdx];
          } else if (idx === 1) {
            model.config.installMode = model.config.installMode === 'symlink' ? 'copy' : 'symlink';
          } else if (idx === 2) {
            model.config.gitIgnore = model.config.gitIgnore === 'gitignore' ? 'git-exclude' : 'gitignore';
          } else {
            model.config.syncGlobalCore = !model.config.syncGlobalCore;
          }
          render();
          return;
        }
        if (key === '\r' || key === '\n') {
          if (
            model.config.agent !== model.snapshot.agent ||
            model.config.installMode !== model.snapshot.installMode
          ) {
            try {
              const updatedPlan = await planProjectSkillInstall({
                projectRoot: model.snapshot.inspection.projectRoot,
                skillNames: model.snapshot.catalog.skills.map(s => s.name),
                agent: model.config.agent,
                mode: model.config.installMode,
                gitIgnore: model.config.gitIgnore,
                catalog: model.snapshot.catalog,
                toolkitRoot: setupOptions.toolkitRoot ?? TOOLKIT_ROOT
              });
              model.snapshot.agent = model.config.agent;
              model.snapshot.installMode = model.config.installMode;
              model.snapshot.projectInstallPlan = updatedPlan;
              const fundSrc = [...model.snapshot.recommendation.recommended, ...model.snapshot.recommendation.candidates];
              model.fundamentalItems = fundSrc.map(entry =>
                buildSkillItem(entry, updatedPlan.links.filter(l => l.name === entry.name), { isFundamental: true })
              );
              model.optionalItems = model.snapshot.recommendation.optional.map(entry =>
                buildSkillItem(entry, updatedPlan.links.filter(l => l.name === entry.name), { isFundamental: false })
              );
            } catch {}
          }
          model.step = 2;
          render();
        }
        return;
      }

      // Step 2 & Step 3 list controls
      const activeList = model.step === 2 ? model.fundamentalItems : model.optionalItems;
      const stepNum = model.step;

      if ((key === '\x1b[A' || key === 'k') && activeList.length > 0) {
        model.cursors[stepNum] = (model.cursors[stepNum] - 1 + activeList.length) % activeList.length;
        render();
        return;
      }
      if ((key === '\x1b[B' || key === 'j') && activeList.length > 0) {
        model.cursors[stepNum] = (model.cursors[stepNum] + 1) % activeList.length;
        render();
        return;
      }
      if (key === ' ' && activeList.length > 0) {
        const item = activeList[model.cursors[stepNum]];
        if (item) item.checked = !item.checked;
        render();
        return;
      }
      if ((key === 'a' || key === 'A') && activeList.length > 0) {
        const allChecked = activeList.every(i => i.checked);
        for (const item of activeList) item.checked = !allChecked;
        render();
        return;
      }
      if (key === '\r' || key === '\n') {
        if (model.step === 2) {
          model.step = 3;
          render();
          return;
        }
        // Step 3 -> Step 4 (Preview)
        try {
          model.previewData = await computeInstallPreview(model, setupOptions);
          model.step = 4;
        } catch (err) {
          model.statusMessage = err?.message || 'No se pudo comprobar la vista previa.';
        }
        render();
      }
    };

    const onData = chunk => {
      const key = typeof chunk === 'string' ? chunk : chunk.toString('utf8');
      if (key === '\x03') {
        cleanup(0);
        return;
      }
      processingChain = processingChain.then(() => handleKey(key)).catch(() => {});
    };

    try {
      output.write('\x1b[?25l');
      if (typeof input.setRawMode === 'function') input.setRawMode(true);
      input.resume?.();
      input.on('data', onData);
      output.on?.('resize', render);
      render();
    } catch {
      cleanup(1);
    }
  });
}
