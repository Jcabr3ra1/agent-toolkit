# Stack actual y prioridades de Agent Toolkit

Fecha: 2026-10-28. Evaluación documental y de código; no es una auditoría de
seguridad ni un resultado de ejecución de la suite de pruebas.

El usuario acepta la dirección de un catálogo de recomendaciones con evidencia
y recuerda incluir MCP Builder y seguridad. Esta nota conserva esos pendientes
y propone cómo continuar. No representa aprobación de una migración tecnológica.

## Evaluación del stack

| Componente observado | Valor para el producto | Recomendación |
| --- | --- | --- |
| Node.js ^24.0.0; runtime local v24.14.1 | CLI, archivos, procesos y transporte MCP local | Mantener la rama 24 y evaluar actualización de parche con las comprobaciones del proyecto. |
| JavaScript ESM | Coincide con el código y las herramientas existentes | Mantenerlo para el alcance actual. El tipado adicional puede evaluarse ante una necesidad concreta. |
| SDK MCP v1 para memoria y v2 para coordinación | Integración con los agentes mediante stdio | Documentar la separación y evaluar una convergencia futura con pruebas por flujo. |
| Ajv y esquemas JSON | Contratos de manifiestos, modelos, aprobaciones y entradas | Reutilizar para un catálogo de skills con datos estructurados. |
| Zod v4 | Entradas de herramientas MCP | Mantener; Ajv y Zod cumplen funciones observables diferentes en el proyecto. |
| Archivos locales, JSON, Markdown y TOML | Memoria, configuración, documentación y estado local | Suficientes para una primera versión local del catálogo de recomendaciones. |
| node --test y carpeta test/ | Infraestructura de pruebas existente | Aprovecharla para las capacidades que se incorporen; no se ejecutó en esta evaluación. |

El [calendario oficial de Node](https://nodejs.org/en/about/previous-releases)
identifica Node 24 como LTS. Se comprobó la rama soportada, no que el parche
local esté al día ni que todas las dependencias estén libres de vulnerabilidades.

El [SDK oficial MCP](https://github.com/modelcontextprotocol/typescript-sdk)
declara v2 como línea estable y un periodo de mantenimiento de v1 tras el
lanzamiento de v2. La coexistencia observada no demuestra una incompatibilidad.
Cambiar el gateway de memoria requiere respetar sus controles de raíz, entradas,
salidas y ciclo de vida; no corresponde sustituir imports sin verificar el flujo.

No se encontraron configuración propia de lint/formato ni workflows de GitHub
Actions entre los archivos revisados y seguidos del repositorio. Es razonable
evaluar un linter, un formato consistente y CI con las pruebas relevantes como
mejoras de desarrollo. No se instalaron herramientas en esta evaluación.

Una interfaz web, una API HTTP o una base de datos persistente compartida deben
responder a requisitos futuros concretos. El recomendador local puede comenzar
con un catálogo JSON validado y evidencia de archivos/tecnologías detectadas.

## Pendientes y prioridad propuesta

| Pendiente | Estado comprobado | Próximo resultado concreto |
| --- | --- | --- |
| MCP Builder de Anthropic | Incorporada y enlazada; revisión y comprobaciones acotadas registradas | Completar escenarios funcionales de agente antes de recomendar como probada. |
| Seguridad: differential-review de Trail of Bits | Incorporada con licencia original; aplicada a un fragmento de cambio real | Ampliar la evaluación cuando exista un encargo de revisión delimitado. |
| Catálogo de skills con evidencia | Dirección aceptada; diseño preparado y revisado para planificación | Revisar el diseño y declarar el modo del encargo de código. |
| Prácticas de Superpowers | Adaptación selectiva elegida; pendiente | Retomar el diseño de adaptación, incorporando el catálogo y las skills instaladas durante esta sesión. |
| Calidad del desarrollo | Propuesta | Acordar comprobaciones automáticas proporcionales antes de añadir herramientas. |

MCP Builder y revisión de seguridad tienen prioridad explícita. Una skill de
seguridad complementa los controles de software: dependencias, permisos,
procesos, rutas y pruebas siguen requiriendo comprobación.

La [evaluación inicial de ambas skills](../skills/evidencias/2026-10-28-evaluacion-inicial-mcp-seguridad.md)
registra las comprobaciones de instalación y uso acotado. El
[diseño del recomendador](2026-10-28-recomendador-skills-design.md) conserva el
alcance propuesto para la siguiente entrega.

El catálogo debe distinguir skill disponible en el entorno, incorporada a la
biblioteca, enlazada a un cliente, contenido revisado y comportamiento probado.
El hash o la existencia de un enlace no convierten todos esos estados en uno.

## Evidencia local consultada

- package.json, comprobación local node --version e inventario de skills/.
- bin/agent-toolkit-mcp.js y bin/project-memory-mcp.js.
- src/task-workflow-mcp.js, src/memory-mcp-server.js y src/memory-mcp-policy.js.
- Imports del SDK, Ajv y Zod en src/ y test/; configuración de herramientas seguida en Git.
- [Recomendaciones y fuentes](../skills/skills-recomendadas.md).

Esta evaluación no modifica dependencias, configuración de clientes ni código.
