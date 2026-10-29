---
name: project-id
description: Consulta la memoria privada de Project Name cuando una tarea necesite contexto, decisiones o estado previo. No la uses para otros proyectos.
---

# Contexto de Project Name

Usa esta Skill para recuperar únicamente el contexto necesario de la memoria del proyecto.

## Flujo

1. Identifica el área relacionada con la solicitud.
2. Consulta [el perfil del proyecto](references/project-profile.md) cuando necesites ubicar la fuente adecuada.
3. Usa el MCP `project-id-memory`; busca o lista antes de leer.
4. Consulta el repositorio fuente cuando la respuesta dependa del comportamiento actual.
5. Indica las notas consultadas e informa vacíos o contradicciones.

## Fuente principal de verdad

El repositorio definido en el perfil, su código, pruebas, configuración y documentación vigente tienen prioridad sobre la memoria.

## Mantenimiento

Al cerrar un cambio estable, consulta `00-INICIO/Mantenimiento de la memoria.md` y determina si alguna nota quedó desactualizada. Una rama abierta no modifica por sí sola la memoria vigente.

Para ejecutar el cierre, usa la skill global `cerrar-memoria` cuando esté
instalada. Es la misma para todos los proyectos: identifica esta bóveda por
`project-memory.json` y conserva sus reglas. No crees un comando de cierre
específico de Project Name. El manifiesto está tres niveles por encima de la
carpeta física de esta skill (`07-AGENTES/skills/project-id`).

## Seguridad

- El MCP permanece en modo de solo lectura.
- No leas ni almacenes secretos, credenciales, tokens o datos sensibles.
- No modifiques la memoria sin autorización explícita o automatización autorizada.
- No simules una consulta si la memoria no está disponible.
