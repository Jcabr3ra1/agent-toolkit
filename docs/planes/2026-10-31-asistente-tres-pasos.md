# Asistente en tres pasos — plan de implementación

> Ejecución en esta sesión con las skills writing-plans, executing-plans y test-driven-development.

**Objetivo:** empezar por las skills del proyecto, seguir con opcionales y terminar con revisión e instalación.
**Diseño aprobado:** el usuario confirmó este recorrido en el chat; destino, modo, Git y núcleo global pasan a un bloque editable de la revisión final.
**Arquitectura:** adaptar únicamente el modelo, render y navegación de `src/toolkit-tui.js`. Conservar `computeInstallPreview`, `executeApprovedPreview` y el motor de instalación/desacoplado.
**Tecnología:** Node.js 24, terminal ANSI, pruebas `node:test`; sin dependencias nuevas.

## Contrato de interacción

- Paso 1: skills para tu proyecto. Paso 2: skills opcionales. Paso 3: revisar e instalar.
- Espacio marca skills; Enter avanza. Atrás conserva las selecciones.
- En el paso 3, `e` abre la configuración de instalación dentro de esa pantalla.
- En edición, flechas seleccionan ajuste y Espacio cambia el valor o la casilla.
- Enter en edición actualiza la vista previa y sale del editor; no instala.
- Esc en edición descarta los ajustes de esa edición y conserva la vista previa anterior.
- Cambiar agente o modo actualiza estados de instalación, sin restablecer las selecciones.
- Solo Enter/s desde la vista previa final aplica cambios; Esc/n cancela sin escribir.

## Tarea única: reorganizar y verificar el recorrido

Archivos: `src/toolkit-tui.js`, `test/toolkit-tui.test.js`, `README.md`, `docs/skills/recomendador.md` y la imagen existente `assets/brand/agent-toolkit-tui-hero.png`.
Interfaces conservadas: `buildToolkitTuiSnapshot`, `createToolkitTuiModel`, `renderToolkitTuiFrame`, `runToolkitTui`; las firmas públicas no cambian.

- [x] Adaptar las pruebas para comenzar seleccionando skills y recorrer solo tres pasos; comprobar el fallo antes de implementar.
- [x] Cubrir edición final: conservar marcas al cambiar agente/modo, descartar borradores con Esc, no escribir al guardar configuración y no instalar si falla su actualización.
- [x] Adaptar modelo/render/navegación con borrador de configuración separado de la vista previa confirmable.
- [x] Comprobar selección vacía, instalaciones existentes, comandos, vuelta atrás, cancelación, copia con lockfile y conflictos conservados.
- [x] Actualizar README, guía y vista renderizada.
- [x] Ejecutar las pruebas del asistente y del área; revisar diff, sintaxis, enlaces e imagen. Reutilizar el diagnóstico conocido de fallos generales si persisten; no modificar otros módulos.

## Revisión y límites

La comprobación debe centrarse en vistas previas obsoletas, Enter dentro del editor, recuperación ante errores de lectura, conservación de selecciones y cancelaciones sin escritura.
Se continúa en el árbol actual para conservar los cambios visuales ya revisados por el usuario. No se incluyen commits, publicación ni cambios del motor de instalación.

## Evidencia de cierre

- Pruebas del asistente: 8/8 aprobadas sobre el estado final.
- Catálogo y recomendaciones: 7/7 aprobadas; instalación/diagnóstico: 9/9 aprobadas en la suite fuera del sandbox.
- Suite global: 4716 pruebas; 4508 aprobadas, 197 fallidas, 11 omitidas. Los fallos corresponden a otras áreas; las pruebas de este recorrido pasan. El grupo de diagnóstico nativo ya fallaba en la revisión original del repositorio durante esta sesión.
- La suite global se ejecutó antes de añadir la última prueba de etiquetado de skills instaladas; las 8 pruebas finales del asistente se ejecutaron después de todas las ediciones de código.
- Revisión independiente en solo lectura: sin defectos funcionales detectados. La brecha de prueba de actualización fallida señalada por el revisor quedó cubierta y aprobada.
- Sintaxis, diff, enlaces locales e imagen revisados. No se modificó el motor de vista previa, instalación o desacoplado.
