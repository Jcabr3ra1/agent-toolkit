---
name: spec-driven-development
license: MIT
description: Convierte una necesidad de software en intención acordada, comparación de alternativas, especificación verificable y plan de tareas ejecutables antes de implementar. Úsala para funciones nuevas, cambios entre módulos, migraciones o rediseños; usa un flujo directo sin esta skill para preguntas simples o ajustes puntuales sin ambigüedad.
---

# Desarrollo guiado por especificaciones

Entiende qué quiere lograr la persona usuaria y por qué, acuerda un resultado observable y divídelo en tareas verificables antes de tocar código.

## Cuándo aplica y cuándo usar algo más simple

| Situación | Proceso |
| --- | --- |
| Pregunta conceptual o consulta de lectura | Responder directamente; no iniciar especificación ni plan. |
| Cambio puntual e inequívoco (un texto, constante o estilo aislado) | Hacer o guiar el cambio y comprobarlo; no abrir documentos de diseño. |
| Cambio pequeño con alguna decisión abierta | Profundidad **ligera**: nota breve con intención, enfoque elegido y comprobación. |
| Función nueva, cambio entre módulos, datos, permisos o migración | Profundidad **estándar** o **rigurosa**: seguir el flujo completo de esta skill. |
| Fallo, regresión o comportamiento inesperado | Investigar primero la causa raíz con `depurar` antes de especificar un rediseño. |

Si el usuario pide explícitamente saltar las preguntas e ir directo a la acción, deja constancia en una línea de cualquier supuesto técnico relevante y continúa con el flujo normal del encargo.

## Convivencia y reutilización

Mantén **un único flujo principal**:
- Si en la sesión o el repositorio ya existe un diseño o plan aprobado para el mismo objetivo (por ejemplo en `docs/planes/`, `docs/superpowers/specs/` o `docs/superpowers/plans/`), **reutilízalo**; comprueba solo si quedó algún hueco frente al código actual y no abras otra entrevista ni reescribas el plan desde cero.
- Respeta siempre la jerarquía de instrucciones del proyecto, el modo `tutor` o `autonomous` declarado y los permisos vigentes. Esta skill no concede permisos de escritura, ramas, commits, memoria ni despliegue.

## Flujo

1. **Inspeccionar antes de preguntar:** lee los archivos citados, el código relacionado y la memoria disponible del proyecto hasta poder explicar cómo funciona hoy la parte afectada. Nunca preguntes algo que el repositorio o el contexto ya respondan.
2. **Aclarar la intención:** resume en tus palabras qué se busca, para quién y qué tocaría en el código actual. Haz **una sola pregunta concreta** por turno sobre la mayor incógnita que cambiaría lo que se construye (o propón una opción razonable indicando el motivo para que el usuario la corrija).
3. **Comparar alternativas:** antes de redactar la especificación, presenta en un mensaje propio las 2 o 3 formas reales de resolverlo en este proyecto, sus compensaciones y tu recomendación justificada (o explica por qué solo una encaja). Espera a que el usuario elija.
4. **Especificar con criterios observables:** redacta un documento proporcional al tamaño (breve o completo) separando lo acordado por el usuario de las decisiones propuestas por el agente. Lee [el flujo, estructura del plan y puertas](references/workflow.md).
5. **Obtener aprobación del diseño:** no escribas código de producto, instales dependencias ni inicies la implementación hasta que el usuario apruebe el diseño (salvo un prototipo descartable autorizado como tal).
6. **Planificar tareas ejecutables:** descompón por responsabilidades y dependencias en tareas con resultado comprobable por sí mismo: rutas exactas, firmas/interfaces entre tareas, pasos inequívocos, casos de riesgo cubiertos y comando de verificación con resultado esperado. Revisa el plan contra la especificación antes de entregarlo.
7. **Implementar y verificar según el modo:**
   - En **modo `tutor`**: explica y entrega el código de **un paso verificable cada vez**; la persona usuaria escribe y tú revisas el resultado real antes de pasar al siguiente.
   - En **modo `autonomous`** autorizado: ejecuta tarea por tarea respetando el alcance aprobado y verifica cada entrega con evidencia fresca (apoyándote en `desarrollo-con-pruebas` y `quality-gate` cuando correspondan).

## Reglas

- La especificación describe el comportamiento deseado; el repositorio describe el comportamiento actual.
- Distingue siempre decisiones confirmadas por el usuario, propuestas tuyas y preguntas abiertas; no inventes acuerdos para rellenar plantillas.
- Prohibido dejar pasos vagos en un plan (`por definir`, `manejar casos límite`, `añadir validación adecuada`) o transcribir programas enteros cuando bastan firmas, contratos y aserciones.
- Conserva el trabajo existente en el repositorio; si el alcance crece a mitad de tarea, avísalo y reajusta el tamaño con el usuario.

Usa [la plantilla](references/spec-template.md) solo si el proyecto no define una propia. Prácticas de entrevista de diseño y planificación ejecutable adaptadas parcialmente de [obra/superpowers](https://github.com/obra/superpowers) (`7.0.1`, licencia MIT en [LICENSE.txt](LICENSE.txt)).
