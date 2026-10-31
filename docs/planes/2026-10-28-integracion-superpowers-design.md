# Adaptación selectiva de Superpowers a Agent Toolkit

Fecha: 2026-10-28 (primera entrega implementada el 2026-10-31).
Estado: primera entrega incorporada en skills y documentación; ver [guía de integración](../skills/superpowers-integration.md).

## Intención

Incorporar prácticas de Superpowers como valor propio de Agent Toolkit: entender
la tarea, acordar un resultado observable, planificar, ejecutar y revisar con
evidencia. El usuario valora la organización de Superpowers y quiere aprovecharla
de aquí en adelante. Los detalles de esta primera entrega son propuesta del agente.

El usuario confirmó que Superpowers seguirá instalado junto a las adaptaciones
de Toolkit. Sus enlaces de origen se registran en
[Fuentes de las skills](../skills/fuentes-de-skills.md).

## Alternativas consideradas

1. Documentar la convivencia con el plugin externo: mantenimiento pequeño, pero
   las prácticas seguirían dependiendo de tener instalado Superpowers.
2. Adaptar prácticas seleccionadas a las skills de Toolkit: aprovecha lo existente
   y permite ajustarlas al producto; exige mantener las adaptaciones. Elegida.
3. Distribuir una copia completa de Superpowers: ofrece su metodología completa,
   pero duplica procedimientos y añade sincronización con versiones externas.

## Primera entrega propuesta

El cambio se limita a skills y documentación del repositorio. Se mantiene el
formato SKILL.md y se aprovechan referencias cargadas solo cuando hacen falta.

| Práctica de Superpowers | Destino propuesto en Toolkit |
| --- | --- |
| Comprender la intención y comparar soluciones | Mejorar spec-driven-development y su flujo existente |
| Planificar tareas ejecutables | Reforzar sus resultados, dependencias y comprobaciones por tarea |
| Investigar antes de corregir | Nueva skill depurar: reproducir, reunir evidencia, formular y contrastar hipótesis, corregir y comprobar |
| Desarrollo guiado por pruebas | Nueva skill desarrollo-con-pruebas: ciclo rojo, verde y refactorización cuando se elija ese método |
| Revisar y verificar antes de afirmar finalización | Reforzar quality-gate y su lista de comprobación |
| Usar ambas bibliotecas | Nueva guía con equivalencias, límites y atribución de las adaptaciones |

Los nombres de las nuevas skills son propuesta del agente y evitan duplicar
los nombres originales instalados como plugin. La guía quedaría en
docs/skills/superpowers-integration.md y se enlazaría desde docs/guias/uso.md.

## Reglas de funcionamiento

- Seleccionar el proceso por la tarea: pregunta simple, cambio pequeño, función
  compleja o fallo investigable. Las tareas pequeñas reciben un proceso breve.
- Mantener un único flujo principal: si Superpowers está activo, reutilizar el
  diseño, plan y evidencia existentes; no iniciar otra entrevista o planificación
  para el mismo objetivo. Consultar las instrucciones cargadas en el cliente,
  sin afirmar que Toolkit detecta técnicamente plugins instalados.
- Respetar las instrucciones del usuario y del proyecto, el modo tutor o autónomo
  declarado y los permisos de cada encargo. Una skill no concede permisos nuevos.
- En tutor, explicar y revisar un paso verificable cada vez; la persona escribe.
- En desarrollo con pruebas, comprobar que el fallo inicial refleja el requisito
  y después ejecutar la comprobación relevante. Para cambios documentales o casos
  sin prueba automatizada razonable, documentar la comprobación apropiada.
- No destruir trabajo existente para imponer el orden de un método.
- Declarar lo observado y sus límites; una revisión documental no demuestra
  que un cliente haya cargado o seguido la skill.

## Fuera de esta entrega

Instaladores, cambios en CLI/MCP, dependencias de ejecución, activación global,
coordinación automática de agentes y gestión automática de ramas o worktrees.
La incorporación al repositorio y la instalación en clientes son pasos distintos.

## Criterios de aceptación

1. La guía relaciona cada práctica con una skill concreta y explica la convivencia
   con Superpowers sin exigir su instalación.
2. Cada skill declara cuándo aplica y cuándo corresponde un flujo más sencillo.
3. Un ejemplo de función compleja produce criterios y tareas verificables; un
   fallo investigable exige evidencia antes de proponer su corrección.
4. Un ejemplo tutor conserva la escritura humana y las autorizaciones declaradas.
5. Un ejemplo con un plan previo reutiliza ese plan; una tarea documental pequeña
   no fuerza TDD, agentes adicionales ni documentos extensos.
6. Las referencias y el frontmatter se revisan, y los escenarios se evalúan antes
   de afirmar que la adaptación funciona. La carga en clientes reales se acredita
   solo mediante una comprobación explícita en cada cliente.
7. Toda adaptación sustancial conserva la atribución y licencia MIT de su origen.

## Fuentes y límites de la revisión

- Repositorio: skills/spec-driven-development/, skills/quality-gate/,
  skills/programar/, docs/guias/uso.md y templates/agent-team/README.md.
- Instalación local de Superpowers 7.0.1: README, LICENSE y las skills consultadas
  en detalle al implementar la primera entrega (`using-superpowers`, `brainstorming`,
  `writing-plans`, `systematic-debugging`, `test-driven-development` y
  `verification-before-completion`, además de sus referencias de apoyo).
- Memoria privada consultada: 01-PRODUCTO/Producto.md, verificada allí al
  2026-10-11; coincide con el propósito del repositorio. La consulta del directorio
  de decisiones devolvió RG_BUSY; no se afirma una revisión completa de decisiones.

Primera entrega completada en `skills/spec-driven-development/`, `skills/depurar/`,
`skills/desarrollo-con-pruebas/`, `skills/quality-gate/` y
`docs/skills/superpowers-integration.md`. Commit, publicación y actualización de
memoria siguen requiriendo su autorización propia.
