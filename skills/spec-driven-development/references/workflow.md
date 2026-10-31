# Flujo, planificación ejecutable y puertas de SDD

## Elegir profundidad

- **Ligera**: cambio pequeño, reversible y localizado (resumen corto de intención, alternativas vistas, cambio acordado y verificación).
- **Estándar**: función que cruza módulos, contratos, estado o interfaz.
- **Rigurosa**: seguridad, permisos, datos críticos, concurrencia, arquitectura, despliegue o migración.

Si la solicitud abarca varios subsistemas independientes, proponlo al inicio y abórdalos en especificaciones y planes separados, uno a la vez.

## 1. Descubrir mirando primero el proyecto

Antes de formular la primera pregunta:
1. Inspecciona el código, pruebas, esquemas y notas estables conectadas con la petición.
2. Identifica restricciones existentes (versiones, contratos públicos, convenciones de nombres y estilo del repositorio).
3. Refleja en ~150–250 palabras qué entendiste, cómo opera hoy esa parte y qué restricciones o caminos más sencillos observaste.
4. Cierra con una sola pregunta abierta cuya respuesta cambie materialmente el diseño, explicando qué cambiaría según la respuesta.

**Puerta:** el problema, el estado actual comprobado y el motivo del cambio pueden explicarse sin asumir acuerdos que el usuario no dio.

## 2. Comparar alternativas antes de escribir la especificación

1. Descarta opciones que contradigan el objetivo o las restricciones reales del repositorio.
2. Presenta 2 o 3 alternativas viables ancladas en la arquitectura actual, indicando qué gana y qué sacrifica cada una.
3. Recomienda una con motivo claro y pide al usuario elegir (si existe una única vía sensata, explica por qué las demás no encajan).
4. Si un prototipo rápido (`spike`) es la forma más barata de despejar una duda técnica, ofrécelo explícitamente como descartable: lo que produzca no pasa a producción sin volver por diseño y pruebas.

**Puerta:** hay un enfoque elegido por el usuario y los compromisos asumidos son explícitos.

## 3. Especificar y diseñar

Define:
- Objetivo, no-objetivos y anti-objetivos (qué haría fracasar la entrega aunque técnicamente compile).
- Comportamiento actual comprobado frente a comportamiento esperado.
- Criterios de aceptación observables, errores y casos límite.
- Componentes afectados, contratos, datos, privacidad y seguridad.
- Qué decidió el usuario frente a qué propones tú como criterio técnico.

**Puerta:** otra persona podría construir o revisar el cambio sin volver a adivinar requisitos esenciales, y el usuario aprobó el diseño.

## 4. Planificar tareas ejecutables

Escribe el plan pensando en quien implementa conociendo el lenguaje, pero sin haber estado en tu conversación:

1. **Mapa de archivos y responsabilidades:** enumera antes de las tareas qué archivos se crean o modifican y qué responsabilidad única tiene cada uno, respetando la estructura del proyecto.
2. **Tamaño correcto de tarea:** cada tarea es la unidad mínima que cierra un ciclo verificable propio (incluyendo su prueba, ajuste de configuración o documentación directa). No separes andamiaje vacío que no pueda comprobarse por sí solo.
3. **Estructura por tarea:**
   - **Archivos:** rutas exactas (`Crear`, `Modificar`, `Probar`).
   - **Interfaces:** qué consume de tareas previas y qué nombres/firmas exactas produce para las siguientes.
   - **Pasos accionables:** cada paso pide una acción concreta con resultado verificable (escribir prueba que falla con los valores de la especificación, comprobar el fallo esperado, implementar la firma acordada, ejecutar comando de verificación y confirmar salida).
4. **Foco de revisión (casos implícitos):** identifica hasta 5 clases de entradas o fallos probables que la especificación implica (valores vacíos, rutas fuera de raíz, permisos, concurrencia, errores parciales) y añade su comprobación en la tarea dueña de ese código.
5. **Autochequeo del plan antes de entregarlo:**
   - *Cobertura:* cada requisito y criterio de aceptación tiene tarea asignada.
   - *Sin huecos ni relleno:* elimina frases que no deciden nada (`TBD`, `validar adecuadamente`) y evita copiar cuerpos enteros de funciones que la firma y la prueba ya determinan.
   - *Consistencia:* nombres de archivos, funciones, tipos y opciones coinciden entre tareas tempranas y tardías.

**Puerta:** el plan está autoverificado, reutiliza planes previos si existían y el usuario confirma el plan y el modo de ejecución (`tutor` o `autonomous`).

## 5. Implementar respetando el modo

- **Modo `tutor`:** entrega un único paso verificable (objetivo, ruta exacta, código explicado y comando de comprobación) y espera a que la persona escriba y confirme con la salida real.
- **Modo `autonomous`:** ejecuta una tarea a la vez dentro del alcance autorizado; si usas TDD, apóyate en `desarrollo-con-pruebas`. No amontones cambios fuera de alcance.

**Puerta:** las comprobaciones de la tarea y la suite relevante del proyecto pasan en el estado actual.

## 6. Verificar y cerrar

Relaciona cada criterio de aceptación con evidencia fresca ejecutada o inspeccionada (usa `quality-gate`). Declara cualquier desviación o límite no comprobado; commit, PR y cierre de memoria requieren su propia autorización.

**Puerta:** ningún criterio queda sin evidencia ni se afirma finalización por suposición.
