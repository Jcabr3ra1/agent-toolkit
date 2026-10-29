# Plan de implementación del recomendador de skills

Fecha: 2026-10-28.
Estado: preparado por la sesión actual de Codex; pendiente de contraste y
ejecución mediante el flujo nativo de Toolkit.

**Objetivo:** recomendar skills existentes a partir de señales locales y
evidencia aplicable, distinguiendo candidatas y observaciones de instalación.
**Diseño:** [alcance del recomendador](2026-10-28-recomendador-skills-design.md).
**Stack:** Node.js 24, JavaScript ESM, Ajv 2020 y node:test.
**Método acordado:** Claude implementa en modo autónomo; Codex revisa. Las
llamadas nativas conservan sus vistas previas y confirmaciones interactivas.

## Preparación comprobada

- Worktree: /Users/juan_jaller/.codex/worktrees/skills-recommender/Agent-Toolkit.
- Rama: codex/skills-recommender, desde d3a0331.
- Dependencias instaladas con npm ci --ignore-scripts, sin cambiar el lock.
- Baseline: npm test, 4608 pruebas satisfactorias, cero fallos o saltos.
- El checkout original conserva sus cambios previos de documentación y skills.
- Tarea nativa: c967e19f-3da0-46d0-b8bf-c1c8e4b65097, etapa codex-plan.
- El intento aprobado de planificación fue cancelado por el diálogo del MCP
  antes de llamar al modelo. No existe un resultado de esa ejecución ni se
  repitió la llamada. Este documento es el plan de la sesión actual, no una
  entrega simulada del runner nativo.

## Restricciones globales

El recomendador inspecciona en lectura y sin red. No ejecuta scripts, imports,
comandos o instrucciones del proyecto analizado. El catálogo se resuelve desde
el paquete Toolkit, no desde el proyecto objetivo. No se modifican dependencias,
SDK, clientes, skills originales, memoria o archivos ajenos al encargo.

Los cuatro seeds son frontend-design, web-design-guidelines, mcp-builder y
differential-review. Conservar los pins y hashes reales de sus registros; no
transformar verificaciones de formato/protocolo en pruebas de eficacia.

El worktree nuevo no contiene los documentos y skills sin seguimiento del
checkout original. Antes del encargo se preparará contexto explícito de lectura
con esas fuentes, sin presentar archivos sin integrar como parte de HEAD. Se
mantendrá limpio el worktree hasta autorizar la etapa de implementación. Los
datos necesarios para distribuir el catálogo se incorporarán en las rutas
declaradas del encargo; evitar referencias absolutas a la máquina del usuario.

## Tarea 1: contrato y validación del catálogo

Archivos: schemas/skill-catalog.schema.json, src/skill-catalog.js y
test/skill-catalog.test.js.

Interfaz propuesta: validateSkillCatalog(value) devuelve datos validados o un
error de catálogo con código fijo; loadSkillCatalog() carga el catálogo confiable
resuelto con import.meta.url. La CLI no admite sustituirlo por datos del objetivo.

- [ ] Definir campos de origen, revisión, manifiesto de archivos, licencia,
  capacidades observadas, reglas de encaje, revisión de contenido y escenarios.
- [ ] Escribir pruebas para duplicados, hashes/pins inválidos, archivos repetidos,
  rutas fuera de alcance y referencias de prueba a otra revisión/manifiesto.
- [ ] Implementar esquema y validaciones semánticas con Ajv. Conservar unknown y
  pending cuando no exista evidencia, y rechazar datos incoherentes.
- [ ] Comprobar node --test test/skill-catalog.test.js.

## Tarea 2: datos iniciales con trazabilidad

Archivo: catalogs/skills.json. Fuentes: registro de skills y manifiestos de
instalación del checkout original, que deben viajar como contexto revisable.

- [ ] Convertir los cuatro registros originales al contrato, conservando revisión,
  manifiesto y distinción entre origen, integridad y alcance de comprobación.
- [ ] Registrar las observaciones de MCP Builder: evaluador API opcional,
  referencias SDK v1 y ausencia de un presupuesto automático del harness.
- [ ] Conservar la licencia CC BY-SA 4.0 de la procedencia de Differential Review.
- [ ] Declarar escenarios generales como pendientes cuando no estén completados.
- [ ] Validar el catálogo real con el mismo validador usado para los fixtures.

## Tarea 3: detector e instalaciones observadas

Archivos: src/skill-recommendations.js y test/skill-recommendations.test.js.

Interfaz propuesta: inspectSkillProject(projectRoot, { client }) devuelve señales,
evidencia limitada, instalaciones y límites; recommendSkills({ catalog,
inspection, profile, client }) produce decisiones sin efectos externos.

- [ ] Probar fixtures de Node solo, Node/MCP y React/Next, incluyendo manifiestos
  malformados y configuración presente sin un framework confirmado.
- [ ] Leer metadatos conocidos con límites explícitos. No recorrer repositorios
  completos ni archivos sensibles y no imprimir manifiestos o errores crudos.
- [ ] Probar enlaces internos dobles, externos, rotos y copias modificadas.
  Deduplicar por copia canónica dentro del alcance permitido.
- [ ] Un enlace externo se registra como presente sin leer su contenido. La
  presencia no acredita versión, integridad, compatibilidad o carga en cliente.
- [ ] Probar que las recomendaciones exigen los cuatro criterios de aplicabilidad
  del diseño. Si faltan, producir candidatas y razones observables.
- [ ] Comprobar ausencia de escritura, red y ejecución usando fixtures y guardas.

## Tarea 4: CLI y documentación de uso

Archivos: bin/agent-skills.js, test/skill-recommendations-cli.test.js,
package.json, package-lock.json, docs/skills/recomendador.md, README.md y
docs/README.md.

- [ ] Implementar recommend --project con --profile, --client y --json; rechazar
  opciones repetidas, desconocidas o combinaciones inválidas.
- [ ] Mantener iguales decisiones y límites en salida legible y JSON. Ayuda y
  resultados válidos, incluidos cero recomendaciones, terminan con código 0;
  errores de entrada/lectura/catálogo terminan con código 2 y diagnóstico acotado.
- [ ] Registrar agent-skills en bin sin añadir dependencias; sincronizar solo la
  declaración del bin en la raíz del lock si corresponde.
- [ ] Documentar cobertura Node inicial, límites de evidencia y ejemplo con cero
  recomendaciones probadas. Actualizar índices conservando la reorganización.
- [ ] Ejecutar pruebas focalizadas de CLI y comprobar enlaces de la documentación.

## Tarea 5: verificación e integración revisable

- [ ] Claude entrega archivos y limitaciones reales, sin afirmar comprobaciones
  que no pudo ejecutar con las herramientas de su encargo.
- [ ] El coordinador ejecuta las pruebas focalizadas y npm test, y revisa el diff
  contra cada criterio. No aceptar campos de confianza o evidencia inventada.
- [ ] Comparar read-only sobre fixtures antes/después y hacer una prueba de CLI
  sobre un proyecto ficticio y sobre el Toolkit, sin escribir en los objetivos.
- [ ] Ejecutar git diff --check y revisar las rutas documentales.
- [ ] Registrar hallazgos y resultados. Conservar aparte el hallazgo previo de
  dependencias; no realizar una actualización automática o npm audit fix.
- [ ] Presentar la entrega para integración. Commit, push y PR se autorizan aparte.

## Riesgos de revisión

Recomendaciones sin pruebas aplicables; herencia de evidencia tras cambiar un
hash; fuga de metadatos; symlinks fuera de raíz; confundir dependencia declarada
con runtime comprobado; documentación de la sesión ausente del worktree; hashes
de recursos originales alterados al generar el catálogo. Cada uno debe tener
un escenario o comprobación explícita en la tarea responsable.
