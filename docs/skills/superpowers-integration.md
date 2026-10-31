# Integración y adaptación de Superpowers en Agent Toolkit

Esta guía explica qué prácticas de [obra/superpowers](https://github.com/obra/superpowers) se han adaptado como valor propio de Agent Toolkit, cómo equivalen entre sí ambas bibliotecas y cómo conviven cuando tienes el plugin original instalado en Claude Code o Codex, sin exigir su instalación para usar Toolkit.

## Resumen rápido

- **Sin Superpowers instalado:** Agent Toolkit ofrece sus propias skills en español para especificar y planificar ([`spec-driven-development`](../../skills/spec-driven-development/SKILL.md)), investigar fallos antes de corregir ([`depurar`](../../skills/depurar/SKILL.md)), trabajar con ciclo rojo-verde-refactor ([`desarrollo-con-pruebas`](../../skills/desarrollo-con-pruebas/SKILL.md)) y exigir evidencia fresca antes de cerrar ([`quality-gate`](../../skills/quality-gate/SKILL.md)).
- **Con Superpowers instalado:** ambas bibliotecas pueden convivir porque las nuevas skills de Toolkit usan nombres propios (`depurar`, `desarrollo-con-pruebas`) y siguen la regla de **un único flujo principal**: si ya existe diseño, plan o evidencia producidos en la sesión, se reutilizan en lugar de abrir otra entrevista o planificación para el mismo objetivo.
- **Límite técnico:** Agent Toolkit no detecta técnicamente qué plugins cargó el gestor interno de cada cliente (`doctor` informa `superpowers.detection: "check-client-plugin-manager"`). La coordinación entre ambas bibliotecas se apoya en las instrucciones cargadas en la sesión y en los artefactos visibles del proyecto.

## Mapa de equivalencias

| Práctica / skill en Superpowers (`7.0.1`) | Equivalente en Agent Toolkit | Relación y reparto |
| --- | --- | --- |
| `brainstorming` (entender intención, mirar el código antes de preguntar y comparar enfoques) | [`spec-driven-development`](../../skills/spec-driven-development/SKILL.md) y [`references/workflow.md`](../../skills/spec-driven-development/references/workflow.md) | Incorporada y adaptada. Aclara intención con una pregunta útil por turno, compara 2–3 alternativas reales y ajusta el documento al tamaño del cambio. |
| `writing-plans` (planes ejecutables con firmas, rutas exactas, foco de revisión y autochequeo) | [`spec-driven-development`](../../skills/spec-driven-development/SKILL.md) ([`workflow.md`](../../skills/spec-driven-development/references/workflow.md), [`spec-template.md`](../../skills/spec-driven-development/references/spec-template.md)) | Incorporada y adaptada. Cada tarea exige entregable comprobable, interfaces consumidas/producidas y pasos inequívocos sin transcribir todo el programa. |
| `systematic-debugging` (+ `root-cause-tracing`, `defense-in-depth`, `condition-based-waiting`) | [`depurar`](../../skills/depurar/SKILL.md) y [`references/tecnicas-de-diagnostico.md`](../../skills/depurar/references/tecnicas-de-diagnostico.md) | Nueva skill propia. Exige reproducir, rastrear hacia atrás y contrastar una hipótesis antes de corregir; frena al tercer intento fallido para revisar diseño. |
| `test-driven-development` (+ `writing-good-tests`) | [`desarrollo-con-pruebas`](../../skills/desarrollo-con-pruebas/SKILL.md) y [`references/buenas-pruebas.md`](../../skills/desarrollo-con-pruebas/references/buenas-pruebas.md) | Nueva skill propia. Ciclo Rojo → Verde → Refactorizar comprobando el fallo inicial y la suite del proyecto, adaptado a modo `tutor` y sin borrar trabajo previo. |
| `verification-before-completion` (evidencia fresca antes de afirmar éxito o cierre) | [`quality-gate`](../../skills/quality-gate/SKILL.md) y [`references/review-checklist.md`](../../skills/quality-gate/references/review-checklist.md) | Incorporada y reforzada. Exige ejecutar o inspeccionar evidencia actual por cada afirmación y revisar `git diff` propio o delegado antes de aprobar. |
| `requesting-code-review`, `receiving-code-review`, `subagent-driven-development`, `executing-plans` | [`programar`](../../skills/programar/SKILL.md), [`revisar`](../../skills/revisar/SKILL.md), [`revision-cruzada`](../../skills/revision-cruzada/SKILL.md) y plugin `niveles` | Cobertura propia de Toolkit. Cuando Superpowers lleva el proceso interno de tareas, `revision-cruzada` se reserva para la coordinación aprobada entre Claude y Codex. |
| `finishing-a-development-branch` y gestión de cierre | [`cerrar-memoria`](../../skills/cerrar-memoria/SKILL.md) y [`project-handoff`](../../skills/project-handoff/SKILL.md) | Cobertura propia de Toolkit. El commit, push, PR, ramas/worktrees y actualización de bóvedas requieren siempre autorización explícita del usuario. |
| `using-superpowers` (prioridad de skills de proceso sobre skills de dominio) | Esta guía y reglas de entrada de cada skill | Selecciona primero el proceso proporcional a la tarea y después las skills de dominio (`mcp-builder`, `frontend-design`, `differential-review`, etc.). |

## Elegir el proceso según la tarea

Las tareas pequeñas no deben cargar burocracia innecesaria:

| Tipo de encargo | Proceso recomendado |
| --- | --- |
| **Pregunta simple o consulta de lectura** | Responder directamente inspeccionando lo necesario; no abrir diseño, plan ni TDD. |
| **Cambio pequeño o documental claro** | Ejecutar o guiar el ajuste directo y verificar enlaces/formato (`git diff --check`) con una comprobación breve de `quality-gate`, sin forzar TDD ni documentos extensos. |
| **Función compleja o cambio entre módulos** | `spec-driven-development` (intención, alternativas, especificación y plan ejecutable) → implementación con `desarrollo-con-pruebas` cuando aplique → `quality-gate` y `revision-cruzada`. |
| **Fallo, regresión o prueba en rojo** | `depurar` (reproducir y confirmar causa raíz) → prueba de regresión con `desarrollo-con-pruebas` → corrección mínima y verificación con `quality-gate`. |

Cuando aplican varias skills a la vez, **las skills de proceso mandan primero** (entender/especificar o depurar) y **las de dominio después** (por ejemplo, `spec-driven-development` define qué servidor MCP construir y `mcp-builder` orienta cómo diseñar sus esquemas y herramientas).

## Reglas de convivencia y diferencias deliberadas

1. **Un único flujo principal:**
   - Si en la conversación o en archivos como `docs/superpowers/specs/`, `docs/superpowers/plans/` o `docs/planes/` ya existe una especificación o plan aprobado para el objetivo actual, las skills de Toolkit lo reutilizan directamente.
   - No se inicia una segunda ronda de preguntas ni se reescribe un plan válido solo porque estén instaladas ambas bibliotecas.
2. **Jerarquía de instrucciones y permisos:**
   - Las instrucciones directas del usuario y las reglas del proyecto (`CLAUDE.md`, `AGENTS.md`, manifiesto de memoria) prevalecen sobre cualquier skill.
   - Ninguna skill amplía permisos de sandbox, habilita escritura en perfiles de solo lectura ni autoriza por sí sola crear ramas/worktrees, hacer `git commit`, abrir PR, desplegar o modificar memorias de Obsidian.
3. **Respeto al modo `tutor` frente a `autonomous`:**
   - En proyectos o tareas en **modo `tutor`**, la persona usuaria escribe el código. Las skills `spec-driven-development`, `depurar`, `desarrollo-con-pruebas` y `quality-gate` entregan y revisan **un único paso verificable cada vez** (por ejemplo, primero escribir la prueba en rojo y observar su fallo; en el turno siguiente, escribir la implementación mínima).
   - En **modo `autonomous`** con encargo explícito, el agente principal ejecuta el ciclo autorizado y verifica antes de presentar la entrega.
4. **Prohibido destruir trabajo existente:**
   - A diferencia de la regla literal de borrar código previo en el TDD estricto de Superpowers, en Agent Toolkit **nunca se elimina ni descarta código existente** del usuario o del árbol de trabajo sin acuerdo explícito. Si hay avance previo, se inspecciona, se conserva y se acuerda cómo cubrirlo y comprobarlo sin pérdida de trabajo.

## Escenarios contrastados (revisión documental)

Los siguientes escenarios verifican el encaje de reglas entre las cuatro skills adaptadas y las políticas de [modos de trabajo](../agentes/coordinacion/agent-work-modes.md):

| Escenario | Recorrido esperado con las skills de Toolkit | Criterio cubierto |
| --- | --- | --- |
| **Función compleja nueva** (p. ej. añadir validación y filtro a un comando CLI) | `spec-driven-development` inspecciona primero el CLI actual, aclara dudas abiertas, compara 2–3 alternativas y tras aprobarse genera tareas con firmas, casos límite y comandos de verificación. | CA-1, CA-2, CA-3 |
| **Fallo investigable** (p. ej. vista previa bloqueada en un entorno concreto) | `depurar` impide proponer parches a ciegas; exige leer el motivo real, rastrear de dónde sale el dato o `PATH` incompleto, probar una hipótesis mínima y fijar prueba de regresión antes de cerrar. | CA-2, CA-3 |
| **Encargo en modo `tutor`** | Tanto en `depurar` como en `desarrollo-con-pruebas`, el agente detiene cada paso tras explicar código y comando esperado; cuando el usuario dice «listo», `quality-gate` revisa el archivo y la salida real antes de avanzar. | CA-4 |
| **Plan previo ya creado con Superpowers** | Al invocar implementación o revisión cruzada con un plan existente en `docs/superpowers/plans/` o `docs/planes/`, se reutiliza ese plan sin reabrir entrevista ni duplicar diseño. | CA-5 |
| **Cambio documental pequeño** (corregir una guía Markdown) | Todas las skills declaran su umbral de salida rápida: no se exige especificación extensa, TDD ni subagentes; basta editar el texto autorizado y comprobar enlaces y `git diff --check`. | CA-2, CA-5 |

## Límites de esta integración

- Esta entrega incorpora y actualiza archivos `SKILL.md`, referencias y documentación dentro del repositorio.
- Validar el formato de las skills y enlazarlas mediante `agent-toolkit setup --apply` acredita la presencia e integridad de los archivos locales; **no demuestra por sí solo** que una sesión ya abierta de Claude Code o Codex las haya recargado ni certifica el cumplimiento del modelo sin observar una sesión real tras reiniciar el cliente.

## Atribución y licencia de origen

Las prácticas incorporadas en `spec-driven-development`, `depurar`, `desarrollo-con-pruebas` y `quality-gate` incluyen adaptaciones parciales al español a partir de **Superpowers `7.0.1`** ([https://github.com/obra/superpowers](https://github.com/obra/superpowers)), publicado por **Jesse Vincent** bajo **licencia MIT** (`Copyright (c) 2025 Jesse Vincent`).

Cada carpeta de skill adaptada conserva el texto íntegro del aviso de copyright y permiso MIT en su archivo `LICENSE.txt`:
- [`skills/spec-driven-development/LICENSE.txt`](../../skills/spec-driven-development/LICENSE.txt)
- [`skills/depurar/LICENSE.txt`](../../skills/depurar/LICENSE.txt)
- [`skills/desarrollo-con-pruebas/LICENSE.txt`](../../skills/desarrollo-con-pruebas/LICENSE.txt)
- [`skills/quality-gate/LICENSE.txt`](../../skills/quality-gate/LICENSE.txt)

El plugin original de Superpowers y estas adaptaciones de Agent Toolkit mantienen ciclos de vida y mantenimiento independientes; consulta también el [registro de fuentes de las skills](fuentes-de-skills.md#superpowers).
