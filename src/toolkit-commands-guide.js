export function getToolkitCommandsGuide({ clients = {} } = {}) {
  const claudeActive = clients.claude?.available !== false;
  const codexActive = clients.codex?.available !== false;

  const workflowCommands = [
    {
      id: 'spec-driven-development',
      claude: '/spec-driven-development',
      codex: '$spec-driven-development',
      stage: '1. Diseñar',
      description: 'Entrevista breve, comparación de alternativas, especificación y plan verificable.'
    },
    {
      id: 'programar',
      claude: '/programar',
      codex: '$programar',
      stage: '2. Implementar',
      description: 'Ejecuta el cambio en modo tutor (paso a paso) o autónomo según acuerdo.'
    },
    {
      id: 'desarrollo-con-pruebas',
      claude: '/desarrollo-con-pruebas',
      codex: '$desarrollo-con-pruebas',
      stage: '2b. TDD',
      description: 'Ciclo Rojo → Verde → Refactorizar comprobando primero el fallo esperado.'
    },
    {
      id: 'depurar',
      claude: '/depurar',
      codex: '$depurar',
      stage: '2c. Diagnóstico',
      description: 'Aísla causa raíz reproducible antes de proponer un parche.'
    },
    {
      id: 'quality-gate',
      claude: '/quality-gate',
      codex: '$quality-gate',
      stage: '3. Verificar',
      description: 'Puerta de cierre con evidencia fresca ejecutada frente a criterios.'
    },
    {
      id: 'revisar',
      claude: '/revisar',
      codex: '$revisar',
      stage: '4. Revisión par',
      description: 'Solicita o atiende revisión cruzada independiente entre Claude y Codex.'
    },
    {
      id: 'estado',
      claude: '/estado',
      codex: '$estado',
      stage: 'Memoria',
      description: 'Consulta estado actual, foco y pendientes del proyecto.'
    },
    {
      id: 'cerrar-memoria',
      claude: '/cerrar-memoria',
      codex: '$cerrar-memoria',
      stage: 'Cierre',
      description: 'Prepara resumen de sesión y cambios propuestos para memoria.'
    }
  ];

  const cliCommands = [
    {
      command: 'npx nexakit',
      description: 'Abre este asistente interactivo (alias compatible: agent-toolkit).'
    },
    {
      command: 'npx nexakit recommend --project .',
      description: 'Inspecciona el stack del proyecto en solo lectura y sugiere skills.'
    },
    {
      command: 'npx nexakit detach --project . --apply',
      description: 'Desacopla skills, .agent-toolkit/ y bloque de Git ignore sin tocar lo tuyo.'
    },
    {
      command: 'npx nexakit doctor --agent all',
      description: 'Verifica Node, clientes, enlaces de skills, MCP y sandbox de Codex.'
    },
    {
      command: 'agent-toolkit-inbox consumo',
      description: 'Muestra el resumen local de consumo registrado por agente y fase.'
    }
  ];

  return {
    claudeActive,
    codexActive,
    workflowCommands,
    cliCommands
  };
}
