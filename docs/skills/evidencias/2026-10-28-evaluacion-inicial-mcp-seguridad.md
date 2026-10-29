# Evaluación inicial de MCP Builder y Differential Review

Fecha: 2026-10-28. Ejecutor: Codex, en la sesión actual. Resultado: instalación,
integridad y comprobaciones acotadas completadas; evaluación general pendiente.

El [manifiesto de instalación](2026-10-28-incorporacion-mcp-seguridad.json)
registra revisiones, archivos y hashes. Se conservaron los originales: diez
archivos de MCP Builder y ocho de Differential Review, incluyendo la copia de
la licencia de Trail of Bits añadida desde la raíz de la misma revisión fuente.
Las dos skills están enlazadas desde .agents/skills y .claude/skills a skills/.

## MCP Builder

Revisión: `b9e19e6f44773509fbdd7001d77ff41a49a486c1` de anthropics/skills.

Se inspeccionaron el punto de entrada, buenas prácticas, criterios de evaluación,
referencias de versión y los dos scripts Python. Se aplicaron los criterios de
transporte local, esquemas, catálogo de herramientas, entradas y ciclo de vida al
gateway existente de memoria: src/memory-mcp-server.js y su política.

Comprobación ejecutada con Node v24.14.1:

```sh
node --test test/memory-mcp-server.test.js test/memory-mcp-policy.test.js
```

Resultado: **82 pruebas, 82 satisfactorias, cero fallos o saltos**. Cubren
contratos, restricciones de raíz, filtrado de escrituras, entradas rechazadas,
respuesta del backend y cierre, entre otros escenarios del gateway de memoria.
Esto aporta evidencia del servidor existente, no mide el efecto comparativo
de instalar la skill ni certifica todos los MCP de Toolkit.

También se comprobó la sintaxis de evaluation.py y connections.py mediante
compile(), sin importar ni ejecutar los módulos y sin generar archivos de caché.

Observaciones para el uso:

- La referencia Node incluye ejemplos de SDK v1. El flujo de coordinación actual
  usa v2 y el gateway de memoria usa v1. Consultar la documentación del SDK de
  cada flujo antes de aplicar ejemplos; no copiar imports entre generaciones.
- El evaluador opcional usa Anthropic() y client.messages.create; puede realizar
  llamadas con gasto y requiere sus dependencias Python. No se ejecutó ni se
  instalaron esas dependencias como parte del runtime de Toolkit.
- agent_loop no fija un límite de iteraciones. run_evaluation ofrece al modelo
  el catálogo completo recibido de list_tools, sin filtrar operaciones de escritura.
  El requisito de evaluación en lectura no está impuesto por ese harness: antes
  de usarlo hacen falta un servidor acotado en lectura y un límite de gasto/llamadas.
- connections.py permite conectar por stdio o HTTP/SSE a un servidor especificado.
  La instalación no concede permiso para iniciar procesos o conectar servicios.
- No se ejecutó la evaluación completa de diez preguntas que describe la skill.

## Differential Review

Revisión: `123037ec8aed26f0d86327cc39137ee5043e5deb` de trailofbits/skills.
Se leyeron punto de entrada, metodología, criterios adversariales y formato de
informe. La skill se distribuye con la licencia CC BY-SA 4.0 de su origen.

Se aplicó una revisión acotada a un cambio real: la modificación de REVIEWER.effort
en src/peer-review-mcp.js, del commit
`48af57517d1d2999752fdd31df20f236734b37dd` frente a su padre. Se usaron git show,
git diff, git grep y git blame sin cambiar de checkout.

### Qué cambió y alcance

El cambio seleccionado sustituye minimal por ultra en el enum de esfuerzo. Se
contrastaron ambas versiones y el origen de la validación (commit 357870d).
El esquema se usa en tres registros de herramientas: preview_peer_review,
request_peer_review y, sin reason, principal en record_review_outcome.

Se revisó la recepción de esa metadata y las restricciones de aprobación
descritas en el flujo. El cambio seleccionado no incorpora ejecución de CLI ni
amplía por sí mismo permisos de archivos o herramientas. Riesgo del fragmento:
medio por su papel en validación de entradas. No se evaluó todo el commit, que
modifica otros archivos, ni se calculó un grafo transitivo completo de llamadas.

### Hallazgos y cobertura

No se confirmó una vulnerabilidad en el fragmento revisado. Este resultado no
aprueba el commit completo ni constituye una auditoría integral del Toolkit.

La suite actual contiene rechazo de un esfuerzo inválido extreme y conservación
de metadata. No se encontró en ese archivo de pruebas una regresión explícita
de la transición minimal/ultra; se comprobó el esquema actual con un escenario
adicional en memoria, sin cambiar código del producto:

- Capturar inputSchema mediante registerPeerReviewTools con un registro ficticio.
- Para preview_peer_review y request_peer_review, safeParse admite ultra y
  rechaza minimal y extreme: **seis aserciones satisfactorias**.
- No invocar handlers ni crear encargos o ejecutar modelos.

Además se ejecutó:

```sh
node --test test/peer-review-mcp.test.js
```

Resultado: **9 pruebas, 9 satisfactorias, cero fallos o saltos**. Es evidencia
del código actual y de ese escenario, no del estado histórico exacto del commit.
La recomendación es condicional por el alcance reducido de la revisión.

### Compatibilidad del procedimiento

El método original muestra git checkout para estudiar el baseline. En esta
sesión se usó git show para conservar el trabajo sin integrar del usuario.
La skill menciona un agente de su plugin y herramientas complementarias que no
se incorporan al instalar esta carpeta; el procedimiento se aplicó en la sesión
actual leyendo sus referencias, sin simular agentes o comandos ausentes.

## Límites y próximo paso

quick_validate.py emitió Skill is valid! para ambas skills. La instalación y
enlaces no demuestran carga por un cliente. No se ejecutaron llamadas a modelos,
secrets scanners, análisis completo de dependencias ni un benchmark de agentes.

Estos registros distinguen comprobación técnica, aplicación parcial de un método
y evaluación funcional general. Mantener las skills como candidatas a una
recomendación probada hasta que existan escenarios aplicables, con expectativas
y resultados revisados, según el diseño del catálogo.
