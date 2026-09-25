---
name: spec-driven-development
description: Convierte una necesidad de software en una especificación verificable, diseño, plan de tareas y evidencia de cierre. Úsala para funciones, cambios entre módulos, migraciones o correcciones complejas; no la uses para preguntas simples ni para saltar directamente a implementar.
---

# Desarrollo guiado por especificaciones

Define qué debe lograrse antes de decidir cómo construirlo.

## Flujo

1. Reúne el problema, usuario afectado, restricciones, comportamiento actual y dudas.
2. Elige profundidad ligera, estándar o rigurosa según riesgo y alcance.
3. Lee [el flujo y sus puertas](references/workflow.md).
4. Crea o revisa la especificación con criterios de aceptación observables.
5. Separa diseño, tareas y verificación. No mezcles decisiones pendientes con hechos aprobados.
6. Obtén aprobación antes de implementar cuando el cambio afecte alcance, datos, seguridad o arquitectura.
7. Verifica cada criterio y registra evidencia antes de declarar el trabajo terminado.

## Reglas

- La especificación describe el comportamiento deseado; el repositorio describe el comportamiento actual.
- Marca con claridad supuestos, preguntas y elementos fuera de alcance.
- Divide las tareas por dependencias, no por archivos arbitrarios.
- Cada tarea debe indicar resultado, archivos probables y forma de verificación.
- No inventes decisiones para completar una plantilla.
- Respeta las reglas de autoría, ramas y aprobación del proyecto.

Usa [la plantilla](references/spec-template.md) solo si el proyecto no tiene una plantilla propia.
