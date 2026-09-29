---
tipo: control
estado: plantilla
ultima_verificacion: "{{DATE}}"
fuentes:
  - "{{SOURCE_REPOSITORY}}"
---

# Registro de sincronización

Este registro evita procesar dos veces el mismo cambio estable. No reemplaza el historial de Git.

## Estado de la automatización

- Estado: no configurada
- Rama observada: `{{INTEGRATION_BRANCH}}`
- Destino de la memoria: `{{MEMORY_REPOSITORY}}/main`

## Cambios revisados

| Cambio | Estado | Fecha | Resultado | Commit de memoria |
| --- | --- | --- | --- | --- |

## Reglas

- Registrar solo cambios fusionados o eventos estables equivalentes.
- Indicar `Sin cambios documentales` cuando corresponda.
- No guardar salidas extensas, conversaciones ni información sensible.
