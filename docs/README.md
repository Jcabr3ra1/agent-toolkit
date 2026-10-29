# Documentación de Agent Toolkit

Empieza por [Primeros pasos](guias/primeros-pasos.md). Para consultar una operación,
usa la [guía de comandos](guias/guia-de-comandos.md) o la
[guía de uso](guias/uso.md).

## Criterio de organización

Cada documento vive junto a su tema: guías, memoria, clientes, modelos,
coordinación, operación o skills. Los planes específicos permanecen junto a su
tema; `planes/` reúne diseños y planes transversales. Los comandos de las guías
se ejecutan desde la raíz del repositorio salvo indicación explícita.

Al añadir documentación, elige una carpeta existente y actualiza este índice.
Para una reorganización, utiliza la skill
[ordenar-proyecto](../skills/ordenar-proyecto/SKILL.md) y comprueba sus referencias.

## Guías de uso

- [Guía de comandos de Agent Toolkit](guias/guia-de-comandos.md)
- [Herramientas de Gemini](guias/herramientas-gemini.md)
- [Tu primera prueba con Agent Toolkit](guias/primeros-pasos.md)
- [Guía de uso de Agent Toolkit](guias/uso.md)

## Memoria de proyectos

- [Project Memory Connect](memoria/project-memory-connect.md)
- [Project Memory Doctor](memoria/project-memory-doctor.md)
- [Project Memory Init](memoria/project-memory-init.md)
- [RG — MCP de memoria con raíz fija y lectura limitada](memoria/project-memory-mcp-guard.md)
- [RG-3 — Integración portable del MCP protegido](memoria/project-memory-mcp-integration.md)
- [RG-2 — Plan de conexión privada del piloto](memoria/project-memory-mcp-pilot.md)
- [Project Memory Status](memoria/project-memory-status.md)
- [Project Memory Sync Apply](memoria/project-memory-sync-apply.md)
- [Project Memory Sync Inspect](memoria/project-memory-sync-inspect.md)
- [Project Memory Sync Record](memoria/project-memory-sync-record.md)
- [Project Memory Sync](memoria/project-memory-sync.md)
- [Sistema de memorias de proyecto](memoria/project-memory-system.md)

## Clientes de IA

- [Adaptadores locales de clientes de IA](agentes/clientes/agent-client-adapters.md)
- [AD — Diagnóstico de autenticación sin inferencia](agentes/clientes/agent-client-auth-diagnostic.md)
- [IA-2-N0 — Viabilidad previa sin arrancar el cliente](agentes/clientes/agent-client-isolated-native-feasibility.md)
- [IA-1 — Base offline de una variante textual aislada](agentes/clientes/agent-client-isolated-variant.md)
- [IA-2 — Plan de verificación de la variante aislada](agentes/clientes/agent-client-isolated-verification-plan.md)
- [N1-I — Invocación controlada del helper](agentes/clientes/agent-client-managed-preferences-invocation.md)
- [N1 — Consulta selectiva de preferencias macOS](agentes/clientes/agent-client-managed-preferences-plan.md)
- [C3.1 — Expediente de evaluación de clientes nativos](agentes/clientes/agent-client-native-evaluation.md)
- [C3.1b — Primer lote de inspección de Claude](agentes/clientes/agent-client-native-inspection-plan.md)
- [C3.1c — Procedencia y viabilidad del primer cliente](agentes/clientes/agent-client-native-provenance-plan.md)
- [Interpretación offline de salidas de clientes](agentes/clientes/agent-client-output.md)
- [C2: reservas persistentes y supervisión local](agentes/clientes/agent-client-runtime-local.md)
- [Admisión y ejecución controlada de clientes](agentes/clientes/agent-client-runtime.md)
- [SC-1 — Proyección selectiva de configuración local](agentes/clientes/agent-client-selective-config.md)
- [S2 — Registro y supervisión local con procesos ficticios](agentes/clientes/agent-client-supervised-local.md)
- [S3 — Preparación del primer piloto nativo por suscripción](agentes/clientes/agent-client-supervised-native.md)
- [S3.2 — Revisión previa de acceso, controles y economía](agentes/clientes/agent-client-supervised-preflight.md)
- [S1 — Participación textual supervisada por suscripción](agentes/clientes/agent-client-supervised-subscription.md)

## Modelos

- [Evaluación inicial de modelos por rol](agentes/modelos/agent-model-evaluation.md)
- [Inventario privado de clientes y modelos](agentes/modelos/agent-model-inventory.md)
- [Preferencia de versiones y esfuerzo por tarea](agentes/modelos/agent-model-preference.md)
- [Contratos de selección de modelos](agentes/modelos/agent-model-selection-contracts.md)
- [Selección de modelos por tarea](agentes/modelos/agent-model-selection.md)
- [Selector local de modelos](agentes/modelos/agent-model-selector.md)

## Coordinación y encargos

- [Aprobaciones declaradas por encargo (RA-A)](agentes/coordinacion/agent-task-approvals.md)
- [Verificador externo](agentes/coordinacion/agent-task-external-verifier.md)
- [TP — Preparar un encargo manual desde el selector](agentes/coordinacion/agent-task-prepare.md)
- [TV-1 — Comprobar huellas y alcance de una entrega manual](agentes/coordinacion/agent-task-verify.md)
- [Equipo de agentes mediante archivos compartidos](agentes/coordinacion/agent-team-handoffs.md)
- [Selección de modelos en los encargos y revisiones](agentes/coordinacion/agent-team-model-handoff.md)
- [Modos de trabajo de los agentes](agentes/coordinacion/agent-work-modes.md)
- [Revisión cruzada entre sesiones de Claude y Codex](agentes/coordinacion/peer-review-workflow.md)
- [Flujo local entre Codex y Claude Code](agentes/coordinacion/task-workflow-mcp.md)

## Operación de Agent Toolkit

- [R2 — Validación desde una copia nueva](operacion/agent-toolkit-clean-install.md)
- [R3.3 — Revisión de adopción y propuesta de lectura con Codex](operacion/agent-toolkit-codex-memory.md)
- [R1 — Primera beta privada utilizable](operacion/agent-toolkit-private-beta.md)
- [R3 — Memoria local del propio Agent Toolkit](operacion/agent-toolkit-self-memory.md)

## Skills y fuentes

- [Preparación y baseline del recomendador](skills/evidencias/2026-10-28-recomendador-preparacion.md)
- [Evaluación inicial de MCP Builder y Differential Review](skills/evidencias/2026-10-28-evaluacion-inicial-mcp-seguridad.md)
- [Manifiesto de instalación de MCP Builder y seguridad](skills/evidencias/2026-10-28-incorporacion-mcp-seguridad.json)
- [Skills recomendadas para Agent Toolkit](skills/skills-recomendadas.md)
- [Fuentes de las skills](skills/fuentes-de-skills.md)

## Planes y diseños transversales

- [Plan de implementación del recomendador](planes/2026-10-28-recomendador-skills-plan.md)
- [Vista previa de planificación del recomendador](planes/2026-10-28-recomendador-vista-previa.md)
- [Diseño del recomendador de skills](planes/2026-10-28-recomendador-skills-design.md)
- [Stack actual y prioridades de Agent Toolkit](planes/2026-10-28-stack-y-prioridades.md)
- [Adaptación selectiva de Superpowers a Agent Toolkit](planes/2026-10-28-integracion-superpowers-design.md)
- [Organización de documentación y skill reutilizable](planes/2026-10-28-organizacion-documentacion-design.md)
- [Plan de organización de documentación](planes/2026-10-28-organizacion-documentacion-plan.md)
