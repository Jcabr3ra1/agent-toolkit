import { doctorToolkit, setupToolkit } from './toolkit-setup.js';
const HELP = `Uso: agent-toolkit doctor [--agent codex|claude|all] [--json]
     agent-toolkit setup [--agent codex|claude|all] [--apply] [--json]

setup prepara enlaces de las skills incluidas; --apply los crea sin reemplazar
archivos existentes. Imprime los comandos MCP para registrar por separado.
doctor comprueba instalación local sin iniciar modelos. Reinicia los clientes
tras registrar el MCP. Superpowers es un plugin opcional independiente.
`;
export async function runToolkitCli(argv, { out, err, options = {} } = {}) {
  if (argv.length === 1 && ['--help', '-h'].includes(argv[0])) { await out(HELP); return 0; }
  const [command, ...rest] = argv, parsed = { agent: 'all' }, seen = new Set();
  if (!['doctor', 'setup'].includes(command)) { await err(HELP); return 2; }
  for (let i = 0; i < rest.length; i++) {
    const flag = rest[i];
    if (seen.has(flag)) { await err(HELP); return 2; } seen.add(flag);
    if (flag === '--agent' && ['codex', 'claude', 'all'].includes(rest[i+1])) parsed.agent = rest[++i];
    else if (flag === '--json') parsed.json = true;
    else if (flag === '--apply' && command === 'setup') parsed.apply = true;
    else { await err(HELP); return 2; }
  }
  try {
    const result = await (command === 'setup' ? setupToolkit : doctorToolkit)({ ...options, ...parsed });
    await out(JSON.stringify(result, null, parsed.json ? 0 : 2) + '\n');
    return command === 'setup' ? result.conflicts ? 1 : 0
      : result.node.supported && Object.values(result.dependencies).every(Boolean) && Object.values(result.clients).every(c => c.available) &&
        Object.values(result.mcp).every(m => m.state === 'configured') && result.skills.every(s => s.state === 'installed') ? 0 : 1;
  } catch { await err('No se pudo inspeccionar o instalar. Revisa rutas, permisos y conflictos; no se reemplazan destinos.\n'); return 1; }
}
