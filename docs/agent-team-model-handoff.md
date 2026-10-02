# Selección de modelos en los encargos y revisiones

## Estado y objetivo

- Adaptación documental y entrega aprobadas el 2026-10-02; commit local autorizado.
- Profundidad: estándar, porque cambia el contrato documental entre agentes.
- Selector base aprobado y registrado en el commit local `dac91fe`.

Conectar documentalmente el [selector](agent-model-selector.md) con las
plantillas del equipo: que cada destinatario sepa qué perfil se recomendó,
por qué, y qué parte de la observación del modelo sigue sin comprobarse.
Las Skills `spec-driven-development`, `project-handoff` y `quality-gate` guiaron
el alcance, la procedencia de las afirmaciones y la revisión verificable.

Esta entrega adapta las cuatro plantillas/guía y registra la evidencia de esta
especificación. No modifica clientes, configuración, código funcional o entregas
privadas; no ejecuta IA ni envía mensajes. El registro local de esta entrega tiene
autorización separada; no incluye publicación.

## Estado real comprobado

El selector devuelve una recomendación, `executed: false`, huellas canónicas,
referencias de evidencia, restricciones y modelo observado desconocido. No
persiste su informe ni cambia el modelo del CLI.

Antes de esta adaptación, las plantillas tenían identidad, modo, base,
autorización y rondas, pero no selección/observación de modelos. Ahora incluyen
esos bloques y los escenarios documentales. Se registran con esta especificación
por rutas exactas, sin mezclar el trabajo previo de sincronización pendiente.
El piloto tutor ya completado no se reescribirá ni se presentará como piloto
de elección automática de modelos.

## Alcance de esta implementación

Solo documentos Markdown:

- `templates/agent-team/01-encargo.md`.
- `templates/agent-team/02-propuesta.md`.
- `templates/agent-team/03-revision.md`.
- `templates/agent-team/README.md`.
- Esta especificación, para registrar evidencia al cerrar la etapa.

Fuera de alcance: selector, esquemas, CLI, catálogo real, conexiones MCP,
historial persistido, facturación, carpetas de encargos privados y Obsidian.
Se revisaron `docs/agent-team-handoffs.md` y `docs/agent-work-modes.md`, pendientes
de versionado. No se incorporan en este commit: la guía identifica el contrato
previo como referencia pendiente, sin un enlace que falte en el árbol registrado.
Los enlaces de esta entrega apuntan solo a archivos incluidos o ya versionados.

## RF-01. Selección por participante, no por equipo completo

El encargo identificará cada decisión por proyecto, tarea, revisión y rol.
El perfil de un tutor/proponente no se reutiliza como selección del ejecutor
o revisor. En tutor no se prepara un encargo de escritura para Gemini.

Para cada participante realmente encargado, registrar:

- Estado de la decisión: `recommended`, `needs-info`, `blocked`, `invalid` o
  `pending` cuando todavía no se obtuvo un informe.
- Referencia privada al informe y su identidad; perfil, proveedor, cliente,
  `requestedModel` y esfuerzo recomendado, o «pendiente» si no se eligió.
- `selectorVersion`, versiones de catálogo/política y las huellas `audit`.
- Motivo, información faltante, exclusiones relevantes y restricciones vigentes.
- Acceso/disponibilidad declarados con fecha y procedencia, sin inventar acceso
  verificado a una cuenta ni copiar su información privada.

No se rellenan marcas, modelos reales o valores máximos por defecto. Los ejemplos
serán ficticios. La plantilla no interpreta automáticamente el encargo, invoca
el selector, guarda informes o configura sesiones.

Las huellas `audit.*Sha256` identifican JSON canónico, no bytes del informe
guardado. Si se guarda un informe privado autorizado, `decisionFileSha256`
identificará sus bytes por separado. Una huella no demuestra permiso humano.

## RF-02. Propuesta: conservar procedencia

Para decisiones `2.0.0`, conservar también familia/orden, ordinal y evidencia
de versión, regla/ajuste y evidencia de esfuerzo, y progresión de calidad.
Son los campos de la [extensión de preferencias](agent-model-preference.md),
no un único rango de inteligencia. Registrar una selección no demuestra el
esfuerzo real de la respuesta ni autoriza ejecutar. Las entregas históricas v1
y el piloto privado no se rellenan ni se modifican retrospectivamente.

La propuesta referenciará la decisión que recibió sin convertirla en ejecución:
modelo solicitado, selección consumida y limitaciones. Si el receptor encuentra
identidad, revisión, proveedor o cliente incompatibles, señalará el bloqueo;
no cambiará modelo/proveedor para eludirlo ni renovará contadores.

Se añadirá un registro de observación de la respuesta, con:

- `observedModels`: los identificados realmente, o «no confirmado»; no inventar
  un modelo principal si la metadata es ambigua.
- `verification`: `verified`, `reported` o `unknown`.
- Procedencia de evidencia, referencia, alcance temporal y limitaciones.

`verified` requiere evidencia del cliente para la ejecución concreta contrastada
por el revisor. Una declaración del usuario o un estado de sesión se mantiene
como `reported`, no prueba qué modelo escribió cada respuesta. Un texto del
agente que diga qué modelo es no certifica su identidad.

Tutoría sigue siendo un único paso explicado con autoría del usuario y espera;
autónomo sigue siendo propuesta sobre rutas/base exactas sin escritura del
proponente. Seleccionar no modifica estos recorridos ni otorga permisos.

## RF-03. Revisión: dos comprobaciones separadas

La sección del escritor conservará su observación declarada; la del coordinador
registrará lo que pudo contrastar independientemente. No sobrescribir una
afirmación anterior para ocultar una discrepancia.

Se compararán decisión vigente, modelo solicitado y modelos observados,
explicitando alias, auxiliares, metadata ausente y discrepancias. Sin política
aprobada para resolver una discrepancia, queda revisión humana, no aceptación
automática ni repetición que consuma cuota.

La calidad del código y la identidad del modelo se revisan por separado:
un paso tutor puede estar verificado con evidencia del archivo y pruebas aunque
el modelo permanezca desconocido, dejando esa observación clara. Esto no
habilita aplicación automática. La ejecución estricta futura requiere resolver
metadata ausente o modelos no permitidos antes de aplicar automáticamente.

No equiparar `reported` con fracaso del código, ni código correcto con modelo
confirmado. La recomendación tampoco prueba la autorización para escribir.

## RF-04. Vigencia, límites y uso manual

`needs-info`, `blocked`, `invalid` y `pending` no se convierten en selección
válida por copiar el texto a un encargo. El nuevo bloque debe quedar completo
antes de declarar el encargo listo bajo esta política. Un resultado recomendado
se revisa y el usuario selecciona el modelo manualmente en el cliente.

Si el cliente no puede pedir el perfil o informar el modelo, documentar el
límite y solicitar la decisión concreta que falta; no usar `latest`, el default
o API de pago como salida. No se documentan flags de clientes sin comprobarlos.

Las plantillas conservarán historial de tarea, rondas y límites de selección.
Una decisión nueva o revisión no pone a cero consumo ya realizado. No se añaden
presupuestos de tokens ficticios ni se prometen cuotas ilimitadas. Un fallo de
cuota/autenticación bloquea el envío siguiente, no cambia de proveedor.

Las entregas históricas sin este bloque permanecen como evidencias históricas.
No se rellenan retrospectivamente modelos/versiones desconocidos ni se declara
inválido el resultado del piloto solo por usar una plantilla anterior.

## Criterios de aceptación y comprobación prevista

| ID | Resultado observable | Comprobación documental |
| --- | --- | --- |
| CA-01 | La decisión queda ligada a identidad y rol del destinatario | Revisar un tutor y un autónomo ficticios |
| CA-02 | Propuesta/revisión distinguen solicitado, observado y procedencia | Revisar metadata, declaración y dato ausente |
| CA-03 | Tutor conserva usuario escritor y un único paso; Gemini no lo aplica | Contrastar instrucciones antes/después |
| CA-04 | Recomendación no concede permiso ni configura el CLI | Revisar instrucciones explícitas y exclusiones |
| CA-05 | Modelos desconocidos/discrepantes requieren revisión sin retry automático | Escenarios de alias, auxiliares y metadata ausente |
| CA-06 | Decisión bloqueada/incompleta no queda lista ni usa fallback | Recorrer los cinco estados del bloque |
| CA-07 | Se distinguen hashes canónicos, bytes e identidad del encargo | Revisar campos y ejemplos ficticios |
| CA-08 | Nueva selección conserva rondas/consumo, sin ampliar alcance | Escenario de corrección tras dos rondas |
| CA-09 | Plantillas siguen genéricas; piloto y clientes quedan intactos | Inspeccionar diff, enlaces y huellas de bases |

Estos son escenarios documentales: no prueban comportamiento real de modelos
o un ejecutor inexistente. No se usarán cuentas reales para comprobarlos.

## Plan y siguiente puerta

- [x] Inspeccionar selector y plantillas; preparar esta propuesta.
- [x] Obtener aprobación de esta adaptación documental.
- [x] Adaptar las cuatro plantillas/guía y revisar escenarios, formato y enlaces.
- [x] Cerrar la revisión documental con evidencia de esta entrega.
- [x] Obtener aprobación antes de un commit por rutas exactas y revisar dependencias documentales.

Reversión: restaurar únicamente los bloques de esta adaptación desde sus bases
inspeccionadas; no borrar plantillas previas ni resetear trabajo pendiente ajeno.

## Evidencia y revisión de entrega

Se comprobaron las cuatro plantillas originales en lectura y su estado sin
versionar; después se aplicaron solo los bloques autorizados, la guía y ajustes
de separadores de tabla para evitar columnas adicionales por alternativas.
El selector está registrado en `dac91fe`; no se repitió el piloto ni se ejecutaron
inferencias. Los escenarios están en la sección «Escenarios de la adaptación de
modelos» de la [guía](../templates/agent-team/README.md).

Comprobaciones realizadas el 2026-10-02:

- CA-01 a CA-09: recorridos documentales contrastados con los campos y reglas
  de las plantillas; sin inferencias ni ejecución de agentes reales.
- Pruebas del selector y contratos: `node --test test/model-selection-contracts.test.js test/model-selection.test.js`,
  171 aprobadas, cero fallos. No se repitió la suite completa del proyecto.
- Cinco documentos revisados: ocho enlaces locales existentes, once tablas
  con columnas coherentes, bloques de código cerrados, salto final y sin espacios
  sobrantes. `git diff --check` también terminó sin incidencias; la revisión
  directa cubre las plantillas sin versionar que ese comando no incluye.
- El detector existente de datos sensibles no encontró coincidencias en los
  cinco documentos. No equivale a una auditoría exhaustiva de secretos.
- Huellas SHA-256: los 98 archivos ajenos inspeccionados y los tres documentos
  del piloto privado coinciden con las bases tomadas antes de esta adaptación.
- Área de preparación de Git vacía al cerrar la implementación; no hubo commit
  ni push en esa etapa. Después, el usuario aprobó la entrega y autorizó el commit
  local por rutas exactas. La publicación sigue fuera de alcance.

Conclusión: revisión documental aprobada con la observación de que estas reglas
son manuales, no barreras técnicas. La adaptación no instala política de cliente,
control de permisos, guardado automático de informes ni envío entre agentes.
La autorización posterior permite registrar estos cinco documentos. Las
dependencias documentales previas permanecen fuera y pendientes de versionado
separado; no se incorpora trabajo ajeno silenciosamente.
