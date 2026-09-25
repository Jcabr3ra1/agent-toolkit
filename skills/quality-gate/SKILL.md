---
name: quality-gate
description: Revisa una entrega de software contra requisitos, corrección, seguridad, pruebas y evidencia antes de aprobarla. Úsala para cambios listos para revisión o cierre; no la uses para afirmar calidad sin inspeccionar ni ejecutar comprobaciones relevantes.
---

# Puerta de calidad

Decide si una entrega está lista, necesita cambios o carece de evidencia.

## Flujo

1. Reúne especificación, criterios de aceptación y alcance real del cambio.
2. Inspecciona el diff y el flujo afectado; evita revisar archivos ajenos.
3. Aplica [la lista de comprobación](references/review-checklist.md) proporcional al riesgo.
4. Ejecuta comprobaciones seguras y relevantes cuando estén autorizadas.
5. Clasifica hallazgos por impacto y aporta evidencia reproducible.
6. Relaciona cada criterio de aceptación con una prueba o inspección.
7. Emite uno de estos resultados: `Aprobado`, `Aprobado con observaciones`, `Requiere cambios` o `Sin evidencia suficiente`.

## Reglas

- Prioriza errores, regresiones, seguridad y pruebas faltantes sobre estilo.
- No modifiques durante una revisión salvo autorización explícita.
- No declares que una prueba pasó si no fue ejecutada en el estado revisado.
- Distingue hallazgos confirmados de riesgos o sugerencias.
