# Flujo y puertas de SDD

## Elegir profundidad

- **Ligera**: cambio pequeño, reversible y localizado.
- **Estándar**: función que cruza módulos, contratos o datos.
- **Rigurosa**: seguridad, datos críticos, arquitectura, despliegue o migración.

## 1. Descubrir

Recopila objetivo, usuario, comportamiento actual, restricciones, evidencia y preguntas abiertas.

Puerta: el problema puede explicarse sin proponer todavía una solución.

## 2. Especificar

Define alcance, fuera de alcance, requisitos, escenarios, casos límite y criterios de aceptación.

Puerta: otra persona puede determinar objetivamente si el cambio funciona.

## 3. Diseñar

Describe componentes afectados, contratos, datos, seguridad, errores, observabilidad y alternativas.

Puerta: los riesgos importantes y las decisiones pendientes son visibles.

## 4. Planificar

Ordena tareas por dependencias. Incluye pruebas, documentación, migración y reversión cuando correspondan.

Puerta: cada tarea produce un resultado verificable y no depende de una decisión oculta.

## 5. Implementar

Ejecuta una tarea a la vez. Mantén los cambios pequeños y relacionados con la especificación.

Puerta: el cambio compila o ejecuta y las comprobaciones locales relevantes pasan.

## 6. Verificar y cerrar

Relaciona cada criterio con evidencia. Registra desviaciones y pendientes; actualiza decisiones y memoria estable.

Puerta: no quedan criterios sin evidencia ni afirmaciones de finalización sin comprobar.
