# Plan de organización de documentación

**Objetivo:** aplicar la distribución aprobada y añadir la skill ordenar-proyecto.
**Diseño:** [alcance aprobado](2026-10-28-organizacion-documentacion-design.md).
**Ejecución:** en esta sesión; cambios documentales en el espacio actual.

## Restricciones y revisión

Conservar todos los documentos, respetar los cambios previos del usuario y
actualizar sus referencias locales. Distinguir enlaces actuales de URLs históricas
y rutas ficticias de pruebas. La creación de la skill no instala una copia global.
Commit, publicación y edición de la memoria privada quedan fuera del encargo.

## Tareas

- [x] Inventariar documentos, registrar destinos únicos y medir enlaces locales
  existentes antes de mover. Registrar también referencias textuales fuera de docs.
- [x] Mover los documentos según el diseño, actualizar sus enlaces relativos y
  las referencias reales desde README, plantillas y ejemplos. Crear docs/README.md
  con un índice por temas. Actualizar las rutas previstas de la integración de
  Superpowers y del registro de fuentes.
- [x] Crear skills/ordenar-proyecto/SKILL.md con alcance proporcionado a cada
  encargo. Validar frontmatter y ejemplos de reorganización y de archivo nuevo.
- [x] Comprobar conservación de documentos, referencias, ausencia de regresiones
  en enlaces locales, diff y revisión independiente del resultado.

## Evidencia

Ejecución local del 2026-10-28:

- Inventario previo de 57 documentos: 56 movidos y un plan que ya estaba en
  planes/. Todos siguen presentes. Se añadió docs/README.md como índice.
- El índice enlaza todos los documentos; no hay carpetas de documentación vacías.
- Auditoría de enlaces locales antes y después: cero enlaces nuevos rotos. Se
  conserva un destino ficticio preexistente, `url`, en un ejemplo de la skill
  cerrar-memoria; no se interpreta como una referencia documental real.
- Comparación de contenido normalizando enlaces y rutas: se conservó el texto;
  las adiciones expresas son el índice, la referencia a ordenar-proyecto, el
  estado aprobado del diseño y la ubicación futura de la guía de integración.
- La revisión independiente comprobó 99 URLs externas sin cambios y detectó
  dos rutas antiguas en fixtures ficticios: se conservaron por su función.
- quick_validate.py: `Skill is valid!`. Los escenarios de reorganización y
  documentación pequeña se evaluaron en lectura. El control sin skill ya resolvió
  ambos correctamente; no se afirma una mejora comparativa del comportamiento.
- git diff --check: sin errores. Las comprobaciones son documentales; no se
  modificó código de ejecución ni se certificó la carga de la skill en un cliente.

Se mantuvo el espacio de trabajo actual para conservar los documentos que ya
estaban sin seguimiento. La skill queda disponible como fuente en la biblioteca.
La memoria privada consultada mantiene el trabajo sin integrar como desarrollo;
su actualización se evaluará al cerrar una entrega estable.
