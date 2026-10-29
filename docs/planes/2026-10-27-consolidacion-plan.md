# Consolidación Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** medir consumo, simplificar instalación y uso, completar herramientas Gemini y verificar recuperación.
**Architecture:** ampliar CLI/almacén existentes; agregar módulos pequeños para métricas e instalación; Gemini conserva proveedor explícito.
**Tech Stack:** Node 24 ESM, node:test, MCP/Zod existentes.
**Spec:** docs/planes/2026-10-27-consolidacion-design.md

## Global Constraints

Datos desconocidos null; sin inferencias de precios. Sin sobrescribir configuración
ajena, sin publicar ni tocar memoria estable. Pruebas ficticias rotuladas como tales.

## Review Focus

Duplicados concurrentes; contadores parciales confundidos con totales; enlaces
preexistentes; rutas/ids externos de Gemini; errores después de generar un archivo.

### Task 1: Consumo

Files: src/usage-metrics.js, src/peer-review-store.js, src/peer-review-mcp.js,
src/peer-inbox-cli.js, test/usage-metrics.test.js, test/peer-review-store.test.js.
Interfaces: normalizeMeasurement(input), summarizeMeasurements(records),
store.recordUsage({taskId,projectRoot,measurement}), store.consumption({projectRoot}).
- [x] Tests RED para validación, duplicados, persistencia y cobertura parcial.
- [x] Implementar métricas, CLI consumo/medir y herramientas MCP.
- [x] GREEN: node --test test/usage-metrics.test.js test/peer-review-store.test.js test/peer-inbox-cli.test.js test/peer-review-mcp.test.js.

### Task 2: Instalación y diagnóstico

Files: src/toolkit-setup.js, src/toolkit-cli.js, bin/agent-toolkit.js,
package.json, package-lock.json, test/toolkit-setup.test.js.
Interfaces: setupToolkit({agent,apply,homeDirectory,toolkitRoot}),
doctorToolkit(options), runToolkitCli(argv,io).
- [x] RED preview sin efectos, idempotencia, conflicto, dependencia ausente.
- [x] Implementar enlaces portables y diagnóstico; MCP mediante recetas explícitas.
- [x] GREEN: node --test test/toolkit-setup.test.js.

### Task 3: Gemini

Files: src/gemini-tools.js, src/gemini-cli.js, nuevos módulos de archivos/proveedor,
test/gemini-tools.test.js y nuevas pruebas del proveedor elegido.
Interfaces: consultar, analizar, historial, recuperar junto a investigar/imagen/estado.
- [x] RED directorio único, metadatos, recuperación, archivos inválidos, opciones.
- [x] Implementar capacidades verificadas usando únicamente Antigravity; API descartada por el usuario y audio bloqueado tras fallar su prueba nativa.
- [x] GREEN pruebas Gemini; prueba nativa pequeña solo si autorizada y disponible.

### Task 4: Recorrido e instrucciones

Files: test/toolkit-journey.test.js, skills/* implicadas, README.md,
docs/primeros-pasos.md, docs/herramientas-gemini.md, docs/consolidacion.md.
- [x] Prueba integrada de aviso→informe→métricas→cierre→recuperación.
- [x] Documentar instalación, mediciones, límites y convivencia con Superpowers.
- [x] Revisar diff con un revisor independiente; corregir hallazgos importantes.
- [x] Suite completa, comandos CLI reales sin inferencia, informe de evidencia.

No se crean commits por defecto. El progreso y los resultados quedan en
`docs/consolidacion.md`; las comprobaciones nativas pendientes se indican allí.

Estado final: tareas de implementación y verificación automatizada completadas.
Suite final: 4.632/4.632; Gemini tras ajuste de formato: 17/17.
La aceptación con dos sesiones reales Codex/Claude, la integración y la instalación
activa siguen pendientes; no se confunden con el recorrido ficticio automatizado.
