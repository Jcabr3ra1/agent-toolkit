# Organización de documentación y skill reutilizable

Fecha: 2026-10-28.
Estado: aprobado por el usuario el 2026-10-28; ejecución registrada en el plan relacionado.

## Objetivo

Organizar docs por temas y crear una skill para mantener ordenados los archivos,
carpetas y documentación en trabajos futuros. El usuario ha expresado esa
preferencia para su código y sus proyectos.

## Enfoque propuesto

Agrupar por responsabilidad y tema. Es la opción recomendada porque coincide
con los grupos existentes de documentos. Agrupar por fecha o por estado separaría
guías de sus contratos relacionados; dejar todo en una carpeta con un índice
mejoraría la navegación pero conservaría la concentración actual de archivos.

La estructura propuesta es:

```text
docs/
  README.md
  guias/
  memoria/
  agentes/
    clientes/
    modelos/
    coordinacion/
  operacion/
  skills/
  planes/
```

La raíz tendrá un índice con el criterio de organización y enlaces a los
documentos agrupados. Los nombres actuales de los documentos se conservan.
No se crearán carpetas vacías ni una carpeta genérica de varios.

## Distribución concreta

| Documentos actuales | Carpeta de destino |
| --- | --- |
| primeros-pasos.md, uso.md, guia-de-comandos.md, herramientas-gemini.md | guias/ |
| project-memory-*.md | memoria/ |
| agent-client-*.md | agentes/clientes/ |
| agent-model-*.md | agentes/modelos/ |
| agent-task-*.md, agent-team-*.md, agent-work-modes.md, peer-review-workflow.md, task-workflow-mcp.md | agentes/coordinacion/ |
| agent-toolkit-*.md | operacion/ |
| fuentes-de-skills.md | skills/ |
| Los diseños de integración y organización actualmente en superpowers/specs/ | planes/ |

Los planes de clientes se conservan junto al tema de clientes para evitar
separar documentos del mismo flujo. planes/ alberga los diseños transversales.
La futura guía superpowers-integration.md corresponde a skills/.

## Alcance de los movimientos

Inventariar los archivos y sus destinos antes de moverlos; comprobar que cada
documento tiene un destino único y que no habrá sobrescrituras. Actualizar los
enlaces relativos según las ubicaciones de origen y destino, incluyendo README,
plantillas y referencias reales desde otras áreas del repositorio.

Conservar contenido e historial semántico. Las rutas ficticias de fixtures y las
referencias históricas ancladas a una revisión no se convierten mecánicamente en
rutas actuales. La memoria privada y los enlaces externos que otras personas
hayan guardado requieren su propio seguimiento; no puede garantizarse que se
actualicen al reorganizar este repositorio.

## Skill propuesta: ordenar-proyecto

Ubicación: skills/ordenar-proyecto/SKILL.md.

Debe aplicar cuando se pida organizar archivos, documentación o carpetas y cuando
sea necesario decidir dónde ubicar archivos nuevos en un trabajo autorizado.
Para archivos nuevos, seguir las convenciones existentes y elegir una ubicación
por responsabilidad. Una tarea ordinaria no inicia una reorganización completa.

Para una reorganización, inspeccionar consumidores y referencias, preparar un
mapa de movimientos, preservar cambios del usuario, actualizar referencias y
comprobar el resultado. Si el alcance es código, revisar también imports,
configuración, recursos y puntos de entrada. Cada proyecto decide su estructura;
el árbol de docs propuesto aquí es un ejemplo, no una plantilla universal.

La skill se creará en la biblioteca de Toolkit. Su instalación en otros clientes
se distingue de su incorporación al repositorio.

## Comprobación y entrega

- Verificar que todos los documentos originales siguen presentes en su destino.
- Comparar enlaces locales antes y después y corregir regresiones del movimiento.
- Revisar referencias textuales a rutas antiguas según su función real.
- Validar el formato de la skill y evaluar escenarios de organización frente a
  un escenario de cambio pequeño que solo necesita ubicar un archivo nuevo.
- Mostrar el árbol final y las comprobaciones realizadas. Diferenciar la
  validación estructural de la skill de su comportamiento comprobado en agentes.

Esta entrega comprende documentación y la skill. La integración de Superpowers
se retoma después, con sus referencias ajustadas a la estructura elegida.
