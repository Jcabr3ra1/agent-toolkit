# Sugerencias explicables y catálogo ampliable

Diseño autorizado en el chat: catálogo controlado con motivos visibles, utilidad prevista, distinción entre compatibilidad y escenario probado, selección automática conservadora y guía/validador para nuevas skills.

## Decisiones

- Conservar el recorrido de tres pasos y los motores de instalación/desacoplado.
- Coincidir con una señal tecnológica produce una skill compatible; no una recomendación validada.
- Recomendar y premarcar requiere revisión de contenido admitida y escenario pasado para cada agente destino, misma revisión y señales requeridas presentes.
- Conservar la evidencia de detección completa (incluido archivo/dependencia), el uso previsto, los límites pendientes y los solapamientos.
- SHA-256 acredita integridad de archivos y se muestra separado de la utilidad.
- El catálogo real conserva sus escenarios vacíos: las pruebas sintéticas verifican el software, sin acreditar utilidad real de esas skills.
- El validador funciona en solo lectura: esquema, semántica, inventario/hashes y referencias de evidencia. Un documento de evidencia sigue necesitando evaluación humana del resultado.
- Las nuevas skills se agregan en `catalogs/skills/<nombre>/` y `catalogs/skills.json`; las reglas existentes se reutilizan. Una tecnología nueva requiere ampliar esquema y detector.

## Implementación y verificación

- [x] Pruebas primero: compatibles sin premarcar, evidencia para uno/ambos agentes, revisión pendiente, justificación y elección manual persistente.
- [x] Adaptar selección y presentación en `src/skill-recommendations.js` y `src/toolkit-tui.js`; conservar JSON previo añadiendo estados explícitos.
- [x] Pruebas del validador con un catálogo ampliado, hash incorrecto, archivos adicionales, enlaces, evidencia ausente y errores de uso de CLI.
- [x] Crear `src/skill-catalog-audit.js`, `scripts/validate-skill-catalog.js`, scripts npm y las comprobaciones semánticas necesarias en `src/skill-catalog.js`.
- [x] Crear `docs/skills/ampliar-catalogo.md`; actualizar índices, README, guía y vista del asistente.
- [x] Ejecutar pruebas afectadas, validador real, comprobación de empaquetado, sintaxis, enlaces y diff; revisión independiente final. Informar fallos generales ya observados sin ampliar este encargo.

Sin nuevas dependencias, descargas automáticas, modelos externos, commits ni publicación.

## Evidencia y revisión

- Las pruebas de clasificación, TUI y auditoría se observaron en rojo antes de implementar el comportamiento.
- Pruebas enfocadas actuales: 2 de catálogo, 8 de auditoría, 6 de recomendaciones y 9 del asistente aprobadas (25 total).
- Catálogo real: 10/10 inventarios y hashes válidos; 0 escenarios funcionales pasados. No se añadieron acreditaciones de utilidad ficticias.
- Catálogo ampliado de prueba: 11 entradas válidas, nueva skill detectada mediante reglas existentes.
- Revisión independiente: detectó un bloqueo al leer un catálogo FIFO. Se añadió guardia de archivo regular/2 MiB antes de lectura. Prueba roja→verde y reproducción con FIFO real ahora rechazada con código 1 dentro del límite de dos segundos.
- Empaquetado en seco: incluye el script, módulo de auditoría y evidencias. No se ejecutó publicación.
- Fuentes de selección, esquema, scripts, enlaces locales y sintaxis verificados.
- Suite completa final: 4727 pruebas; 4509 aprobadas, 207 fallidas y 11 omitidas. Ningún fallo en los cinco archivos de catálogo, auditoría, recomendación, TUI e instalación/diagnóstico (34 pruebas). Los fallos generales continúan en módulos ajenos al área, ya observados en esta sesión.
