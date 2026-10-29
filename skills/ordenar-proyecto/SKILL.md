---
name: ordenar-proyecto
description: Úsala cuando se pida organizar archivos, carpetas o documentación, o cuando un trabajo autorizado necesite ubicar archivos nuevos dentro de un proyecto existente.
---

# Ordenar un proyecto

Ubica cada archivo según su responsabilidad y las convenciones del proyecto.
El resultado debe ser fácil de recorrer y conservar sus referencias funcionales.

## Elegir el alcance

| Encargo | Actuación |
| --- | --- |
| Añadir un archivo | Elegir la carpeta existente que corresponda y actualizar su índice si lo necesita. |
| Reorganizar un área | Inventariar esa área y sus consumidores; preparar movimientos y verificar referencias. |
| Reorganizar código | Revisar además imports, exports, configuración, recursos y puntos de entrada afectados. |

Un trabajo pequeño conserva el alcance solicitado. La preferencia por el orden
no inicia una reorganización completa del repositorio en cada tarea.

## Reorganizar

1. Lee las instrucciones del proyecto y revisa el estado de los archivos.
   Identifica cambios previos, archivos generados y ubicaciones con significado
   para herramientas o contratos.
2. Agrupa por responsabilidad, tema o función siguiendo el criterio existente.
   Usa nombres claros y una profundidad que facilite encontrar los archivos.
   Crea una carpeta cuando haya contenido concreto para ella.
3. Prepara un mapa de origen a destino. Comprueba destinos únicos, colisiones y
   referencias mediante búsquedas como `rg`. Delimita qué consumidores necesitan
   actualizarse aunque vivan fuera del área que se mueve.
4. Mueve conservando contenido y cambios ajenos. Actualiza enlaces relativos,
   índices e imports según su nueva ubicación. Una URL anclada a un commit
   histórico conserva la ruta de esa revisión; una ruta ficticia de un ejemplo
   se evalúa por su función, sin convertirla automáticamente en una ruta real.
5. Comprueba que cada archivo original sigue presente y compara las referencias
   antes y después. En documentación revisa destinos locales; en código ejecuta
   las comprobaciones relevantes del área. Informa fallos previos por separado.
6. Resume la estructura, referencias actualizadas y evidencia de comprobación.
   Mantén el criterio en el índice o instrucciones existentes del área cuando
   eso ayude a ubicar los próximos archivos.

## Ejemplo

Si `docs/auth.md` pasa a `docs/guias/auth.md`, su enlace `../src/auth.js`
debe pasar a `../../src/auth.js`; también hay que actualizar los enlaces hacia
esa guía desde el README y otros documentos. Una copia o referencia externa
no queda actualizada por mover el archivo local.

## Errores frecuentes

- Mover solo las guías sin revisar sus consumidores externos al directorio.
- Aplicar una sustitución global que reescribe URLs históricas o fixtures.
- Crear carpetas vacías o un cajón de varios sin criterio de clasificación.
- Afirmar que un archivo conservado demuestra que sus enlaces o imports funcionan.
