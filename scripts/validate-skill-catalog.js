import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { auditSkillCatalog, DEFAULT_CATALOG_ROOT, inventoryCatalogSkill } from '../src/skill-catalog-audit.js';

const HELP = 'Uso: npm run catalog:validate -- [--root <toolkit>] [--json]\n     npm run catalog:files -- catalogs/skills/<nombre> [--root <toolkit>]\n';

export async function runSkillCatalogValidation(argv, { out = text => process.stdout.write(text), err = text => process.stderr.write(text) } = {}) {
  const options = { toolkitRoot: DEFAULT_CATALOG_ROOT, json: false, installedPath: null };
  const seen = new Set();
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (flag === '--help' && argv.length === 1) { out(HELP); return 0; }
    if (seen.has(flag)) { err(HELP); return 2; }
    seen.add(flag);
    if (flag === '--json') options.json = true;
    else if ((flag === '--root' || flag === '--files') && argv[i + 1] && !argv[i + 1].startsWith('--')) {
      if (flag === '--root') options.toolkitRoot = path.resolve(argv[++i]);
      else options.installedPath = argv[++i];
    } else { err(HELP); return 2; }
  }
  if (options.installedPath) {
    if (!/^(?:skills|catalogs\/skills)\/[a-z0-9-]+$/u.test(options.installedPath)) { err(HELP); return 2; }
    try {
      out(JSON.stringify(await inventoryCatalogSkill(options), null, 2) + '\n');
      return 0;
    } catch (error) { err(error.message + '\n'); return 1; }
  }
  const report = await auditSkillCatalog(options);
  if (options.json) out(JSON.stringify(report, null, 2) + '\n');
  else {
    out(`${report.ok ? 'Catálogo válido' : 'Catálogo inválido'}: ${report.verifiedSkillsCount}/${report.skillsCount} skills con archivos e integridad comprobados.\n`);
    for (const error of report.errors) out(`Error: ${error}\n`);
    for (const warning of report.warnings) out(`Pendiente: ${warning}\n`);
    out('Esta comprobación no ejecuta skills ni valida su utilidad por sí sola.\n');
  }
  return report.ok ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  process.exitCode = await runSkillCatalogValidation(process.argv.slice(2));
}
