# S1 — Participación textual supervisada por suscripción

## Estado y problema

S1.1–S1.3 fueron autorizados con «autorizo» e implementados exclusivamente
offline. Hay esquema, evaluador puro y pruebas ficticias; no runner, reserva
durable, conexión CLI o admisión de una instalación real. El cierre y la API
implementada se describen al final. S2 local con fixtures (etapa separada)
fue autorizada después e implementada por separado. S3.1 recibió autorización
propia y cerró un diagnóstico nativo de versión/ayuda; ninguna instalación está
admitida para inferencia. S3.2 fue autorizada e implementada, pero la revisión
local quedó incompleta y no consultó cuenta. S3.3 sigue sin autorizar o ejecutar.
La entrega S3 de diagnóstico, preflight y piloto (etapa separada)
conserva sus permisos distintos y la evidencia de S3.1.

Diseño preparado el 2026-10-04 (America/Bogota) tras «listo apruebo», referido
a diseñar una ejecución supervisada con límites realistas. Profundidad SDD:
rigurosa. Se aprueba preparar el diseño, no implementarlo, iniciar clientes,
consultar cuentas, cambiar configuración o consumir una suscripción.

La consolidación S1 fue autorizada el 2026-10-07 para validar cuatro rutas,
ajustar referencias documentales, registrar el cierre y crear commit local.
La autorización posterior no incluye push, cuentas, clientes reales, S2/S3,
permisos nuevos de ejecución o llamadas a IA. Su evidencia figura al final.

Los lotes C3.1b/C3.1c aportaron identidad parcial y firma local satisfactoria,
sin arrancar Claude. No aportan versión efectiva, controles de arranque,
gasto externo vigente, techo de llamadas o cancelación remota. Repetir hashes
no resuelve esos faltantes. Los datos privados no se trasladan a esta biblioteca.

El [contrato estricto](agent-client-runtime.md) exige un techo preventivo de
llamadas internas, incluidas auxiliares y reintentos. No se rebaja ese requisito.
Esta propuesta crea una ruta **separada**, supervisada por una persona, para
participación textual limitada. No se presenta como automatización estricta.

## Resultado para el usuario

El coordinador prepara un encargo breve, propone cliente/modelo/esfuerzo y
muestra los efectos y límites. Una autorización abarca el intento completo;
no se pregunta de nuevo por cada paso normal. El cliente propone texto o código,
el coordinador lo revisa y el usuario conserva la autoría en modo tutor.

No se aplican archivos por recibir una propuesta. Transferir código a otro
agente, ejecutar pruebas, actualizar Obsidian, hacer Git o publicar requiere
el permiso correspondiente; elegir `autonomous` tampoco concede esos efectos.

## Contratos que no cambian

- [Selector](../modelos/agent-model-selector.md): elegir sigue sin ejecutar. La preferencia
  por la versión más reciente de una familia y esfuerzo adecuado conserva sus
  evaluaciones; no significa usar siempre el modelo más potente.
- [Adaptador A](agent-client-adapters.md), C1 y el expediente C3.1a no aceptan
  una ruta supervisada como instalación estrictamente verificada.
- `executionsUsed` no pasa a significar arranques. Una llamada desconocida
  no se registra como cero ni se inventa para satisfacer un esquema antiguo.
- Modo tutor (política separada del proyecto): el usuario escribe; aprobación de una
  propuesta o captura no equivale a permiso para aplicar código.

No convertir un resultado bloqueado de C1 en permiso por cambiar de perfil.
El usuario debe escoger y autorizar explícitamente la ruta supervisada distinta.

## Garantías, dependencia externa y límites declarados

| Aspecto | Qué exige esta ruta | Qué no promete |
| --- | --- | --- |
| Procesos principales | Un intento y máximo un arranque; cero reintentos del coordinador | Una llamada interna por proceso |
| Tiempo | Plazo monotónico local, incluyendo inicio, stdin y terminación | Corte exacto del consumo remoto |
| Datos | Límites incrementales de entrada/salida; contexto autorizado explícito | Que todo el estado nativo quede dentro de la carpeta del intento |
| Herramientas y efectos heredados | Variante evaluada sin herramientas, MCP, hooks o delegación fuera del alcance | Seguridad por una frase en el prompt o safe mode aislado |
| Acceso | Sesión nativa de suscripción; sin API keys, helpers API o proveedores alternativos | Que login o una firma demuestren ausencia de cobros |
| Gasto adicional | Confirmación vigente de créditos/gasto externo desactivados en el proveedor | Bloqueo económico impuesto por timeout o por nuestro código |
| Llamadas y cuota | Mantener consumo interno desconocido cuando no sea verificable | Cuota, tokens o coste deducidos de tiempo, turnos o respuesta |

La aceptación expresa de llamadas/cancelación remota no verificables no autoriza
gasto fuera del plan, herramientas o efectos desconocidos peligrosos. Si las
condiciones económicas no se pueden confirmar de forma suficiente para el usuario,
no se inicia el intento. No ofrecer activar créditos como solución.

## SR-01. Encargo y revisión previa por canal de confianza

Identidad: proyecto, tarea, revisión, rol (`tutor`, `proposer` o `reviewer`),
modo y huella del encargo/contexto. Cliente, modelo concreto y esfuerzo quedan
fijados y no cambian para superar un fallo. Primer candidato: Claude Code;
ninguna instalación real está admitida por este documento.

El permiso debe vincular esos campos, variante/artefacto, política, límites,
efectos y limitaciones aceptadas. Referencias y huellas en JSON no conceden
permiso humano. Una respuesta del cliente tampoco puede aprobar su propio
arranque, ampliar herramientas o indicar dónde obtener credenciales.

La disponibilidad declarada y el modelo elegido se contrastan con el selector
vigente fuera del evaluador inicial. No fabricar historial completo de llamadas
para obtener `recommended`; si el selector está bloqueado por consumo incierto,
registrarlo y conservar revisión humana, sin llamarlo recomendación admisible.
Una elección supervisada explícita es distinta de una recomendación del selector.

Una aprobación del intento cubre preparación, reserva, un arranque, captura,
normalización y revisión previstos. Error, timeout, cuota agotada, fallback,
evento prohibido o límite excedido detienen; no se vuelve a consultar para
continuar el mismo proceso con más permisos.

## SR-02. Presupuesto inicial propuesto

| Recurso | Techo del primer piloto, aún no autorizado |
| --- | --- |
| Arranques principales por encargo | 1 |
| Intentos concurrentes por tarea | 1 |
| Reintentos/correcciones/escalados del coordinador | 0 |
| Plazo operativo total local | 120 segundos |
| Gracia de terminación | 2 segundos incluidos en el plazo total |
| Entrada textual | 16 KiB |
| stdout / stderr | 256 KiB / 32 KiB, durante captura |
| Línea/evento de stream | 32 KiB / 512 eventos |
| Turnos solicitados al cliente | 1, solo si la variante evaluada lo permite |
| Techo de llamadas internas | Desconocido; no se convierte en uno |

Los límites propuestos serán parte de un permiso posterior, nunca defaults
silenciosos. El supervisor inicia cancelación con tiempo suficiente para la
gracia dentro del plazo, y mantiene vigilancia aunque no lleguen eventos.
Un contador de turnos nativo es complementario, no techo de solicitudes.

## SR-03. Preparación nativa, posterior a S1

Antes de cualquier arranque se necesita una variante exacta evaluada: versión,
artefacto, configuración no secreta relevante, políticas administradas, entorno
permitido y mecanismos preventivos. Desconocimiento de efectos críticos bloquea.
Una firma válida no cumple automáticamente esos requisitos.

El futuro lanzador usa `spawn` sin shell, argumentos de una variante empaquetada,
prompt por stdin y directorio privado aprobado. Excluye inyección de runtime,
credenciales API, helpers de claves y proveedores alternativos, sin imprimir
entorno ni leer tokens. No cambia HOME/raíces ni copia autenticación.

Herramientas, MCP, hooks, personalizaciones, subagentes, actualizaciones,
resume/fallback y bypass requieren mecanismos propios y evidencia pertinente.
No confundir negar llamadas de MCP con impedir inicio de servidores. Si una
política administrada impide el alcance textual, detener sin modificarla.

Acceso nativo, solicitudes al proveedor y escrituras/caches/telemetría conocidas
se enumeran antes de autorizar. Confirmar créditos desactivados usa una vía
permitida de la cuenta o una declaración actual explícita, con fuente y fecha;
esa declaración sigue siendo declaración, no prueba automática. No renovar
afirmaciones antiguas del usuario ni inspeccionar recibos/tokens.

## SR-04. Historial, reserva y estados propios

Historial supervisado separado, vinculado a proyecto/tarea entre revisiones,
clientes y modelos. Mantiene arranques observados, plazo local y resultado;
llamadas, cancelación remota y consumo se guardan `null`/`unknown` si procede.
Conservar también incertidumbre de intentos previos, sin convertirla en cero.

La futura persistencia necesita reserva durable exclusiva antes de spawn.
Una caída entre reserva y arranque produce `reconciliation-required`, no reembolso
automático. No borrar reservas por antigüedad o supuesto PID ausente.
No reutilizar el ledger C1 para acomodar llamadas desconocidas.

Estados previstos del intento: `reserved`, `started`, `completed-for-review`,
`failed`, `canceled`, `timed-out`, `indeterminate`, `reconciliation-required`.
Terminación local no confirmada impide nuevos arranques. Consumo remoto incierto
permanece visible; un nuevo intento exige conciliación/revisión y aprobación
nuevas, sin bucles automáticos o reinicio de historia. La intervención puede
autorizar una decisión supervisada informada, no certificar cero consumo.

## SR-05. Captura, revisión y privacidad

Supervisor incremental: vigilar bytes, líneas, eventos, stderr y tiempo antes
de acumular memoria. Evento de herramienta/delegación/fallback o solicitud de
permisos fuera del alcance cancela y exige revisión; detectarlo no deshace efectos.
Evaluar mecanismo de terminación de descendientes de la variante/plataforma,
sin prometer contener procesos desvinculados solo con SIGTERM al PID principal.

El [parser B](agent-client-output.md) puede revisar capturas offline compatibles,
sin transformar `accepted` en aprobación de calidad/modelo/esfuerzo. El contenido
es dato no confiable: no se ejecutan comandos, siguen URLs o aplican código.

Evidencia privada en destino nuevo autorizado: directorios `0700`, archivos
`0600`, no Git/proyectos/Obsidian/rutas sincronizadas conocidas, sin sobrescribir.
Ledger sin prompts, salida cruda, cuentas, secretos o razonamiento interno.
Guardar una respuesta textual requiere permiso explícito; nunca publicar por
defecto. No prometer ausencia de caches o retención en el cliente/proveedor.

## S1 — Primera base implementable, solo offline

Entregar un esquema cerrado `agent-client-supervised.schema.json` y un evaluador
puro `createClientSupervisedEvaluator(schema, trustedPolicy)`, que devuelva
`evaluateSupervisedIntent(input)`. API implementada exclusivamente offline.
Sin integración CLI, consultas de clientes, IO, spawn, cuenta o ledger durable.

Entradas acotadas: JSON inerte, UTC explícito, IDs/huellas de identidad y contexto,
selección declarada, límites explícitos, historial supervisado, observaciones,
resumen de autorización y aceptación separada de limitaciones. Nada de rutas,
shell/argv, callbacks, prompt crudo, cuentas, tokens o receta de lanzamiento.
Máximo 128 KiB; rechazar coerción, campos extra, getters/proxies/ciclos, claves
repetidas/peligrosas y UTF-8/calendario inválidos. Reusar utilidades compatibles
sin alterar contratos previos.

Política de confianza en construcción, copiada sin mutación: frescura,
referencias revocadas y límites máximos. `now` viene de la entrada, no del reloj.
Estados: `invalid`, `incomplete`, `blocked`, `ready-for-supervised-review`.
Prioridad: invalidar estructura; bloquear contradicciones/rechazos; después
señalar faltantes. Razones/faltantes ordenados, sin payloads en errores.

Toda salida: `executed: false`, `runtimeReady: false`,
`verifiedAdmission: false`, `profile: supervised-subscription`,
`internalCallCeiling: null` y `remoteCancellationVerified: false`.
El mejor resultado solo permite revisar declaraciones, nunca emite permisos,
ticket, argv, reserva, factura ni certificado de cliente o de gasto.
Evaluación/documentación/confirmación humana conservan su procedencia; no se
elevan a pruebas locales por cumplir el esquema.

## Tareas y pruebas por dependencia

| Etapa | Resultado | Verificación |
| --- | --- | --- |
| S1.1 | Esquema cerrado y fixtures ficticias | Tipos, límites, identidad, estados y procedencia |
| S1.2 | Evaluador puro y razones de bloqueo | Determinismo, fechas, revocación, contradicciones, no mutación/efectos |
| S1.3 | Evidencia y regresión de contratos existentes | Casos adversos; C1/A/B siguen intactos |
| S2, base local implementada | Persistencia/supervisor exclusivo de esta ruta | Procesos ficticios; fallos, carreras, límites y cancelación local |
| S3, posterior | Variante/preflight y piloto nativo por suscripción | Autorización nueva, efectos, política de gasto y evidencia real |

S1 prevé `schemas/agent-client-supervised.schema.json`, `src/client-supervised.js`
y `test/client-supervised.test.js`. No implementar S2/S3 ni cambiar catálogos,
C1/C2, código de proyectos o conexiones al implementar S1.

Criterios de aceptación S1:

1. Ninguna entrada, ni favorable, inicia procesos o produce capacidad de spawn.
2. Referencias/huellas validan coherencia, no consentimiento o autenticidad real.
3. Un proceso/turno no equivale a llamada; desconocido no pasa a cero.
4. Permiso faltante, revocado, caducado/futuro, scope divergente, gasto habilitado,
   efecto crítico no evaluado o límites/historia inconsistentes impiden revisión favorable.
5. Aceptar límites remotos desconocidos no acepta gasto adicional u otros efectos.
6. Fixtures sin cuentas/instalaciones reales; IO, procesos, red, reloj y azar
   instrumentados, sin operaciones de las APIs evaluadas tras importación.
7. JSON adverso acotado y errores redactados; entradas y política no mutadas.
8. Contratos y pruebas existentes siguen pasando; sin migración automática.

## Alternativas y puerta siguiente

Mantener solo traspaso manual: disponible ahora, sin fingir límites locales
automáticos. Reutilizar C1 debilitando su techo: descartado. Usar APIs/créditos
para facilitar aislamiento: descartado por la restricción económica del usuario.
Ruta supervisada separada: propuesta, con límites explícitos y controles previos.

La aprobación de S1.1–S1.3 se ejecutó exclusivamente offline. No permite abrir
clientes, consultar cuentas, crear evidencia privada nueva, activar modelos,
hacer commit/push o modificar Obsidian. S2 recibió autorización independiente
para persistencia temporal y supervisor propios con procesos ficticios.
La entrega S2 de registro y supervisión ficticia (etapa separada)
conserva sus contratos y evidencia. S3 requiere aprobación de efectos y pruebas
propias; S2 no habilita un piloto nativo ni modifica el evaluador puro de S1.

## Contrato y API de S1 implementados

Archivos: [esquema](../../../schemas/agent-client-supervised.schema.json),
[evaluador](../../../src/client-supervised.js) y
[pruebas](../../../test/client-supervised.test.js).

`createClientSupervisedEvaluator(schema, trustedPolicy)` copia esquema/política
de confianza y devuelve `evaluateSupervisedIntent`. S1 admite declaraciones de
la primera ruta candidata Anthropic/Claude Code; no certifica clientes ni crea
registros reales. Añadir otra ruta exige contrato y pruebas, no cambiar proveedor
silenciosamente. Las fixtures usan modelos, artefactos y referencias ficticios.

El esquema `1.0.0` contiene 26 definiciones cerradas. Identidad, perfil, ID del
encargo y UTC a segundos son obligatorios. Omitir secciones expresa información
incompleta; una sección presente debe cumplir íntegramente su forma:

| Sección | Declaración y contraste implementados |
| --- | --- |
| `selection` | Modelo/esfuerzo, perfil y fuente; elección explícita distinta de recomendación del selector |
| `binding`, `expectedBinding` | Proveedor/cliente/variante, versión exacta, plataforma/arquitectura, instalación y huellas no secretas |
| `limits`, `context` | Límites locales explícitos, referencia/huella del prompt y bytes declarados; no leer el prompt |
| `authorization`, `limitations` | Aprobación y aceptación separadas de desconocimiento remoto, como atestaciones humanas |
| `history` | Proyecto/tarea, arranques y tiempo declarados, llamadas enteras o `null`, conciliación |
| `installation`, `controls`, `effects` | Diez controles nativos y cinco efectos; mecanismos/pruebas, presencia y permisos correspondientes |
| `access`, `observations` | Suscripción/gasto con fuentes separadas y códigos cerrados de impedimentos |

La política exige edad máxima de evidencia de 1 a 86 400 segundos, hasta 256
referencias revocadas y todos los límites explícitos. No hay defaults ni callbacks.
Puede reducir los máximos del piloto, no excederlos; gracia menor al plazo y
evento no mayor que stdout. Modelo móvil/default rechazado; versión desconocida
se expresa omitiendo binding, nunca inventándola. El selector no se recalcula
dentro de esta API y `selectionVerified` permanece `false`.

El scope canónico vincula identidad, ID del intento, elección, ambos bindings,
límites/contexto, autorización, aceptación, historial, acceso, mecanismos de
controles, efectos y observaciones a la huella de política. Excluye los metadatos
de evaluación para evitar referencias circulares; normaliza los conjuntos de
controles/efectos sin mutarlos. Cada evaluación aporta su scope, fuente, referencia,
fecha y vencimiento. Cambiar declaraciones deja la evaluación anterior fuera
de scope; una huella nueva por sí sola sigue sin autenticar a nadie.

Estados `confirmed`, `documented`, `pending`, `rejected` conservan su fuente.
Instalación, controles y efectos requieren declaraciones de prueba local;
autorización/aceptación, atestación del operador. Acceso/gasto, contexto e historial
admiten atestación o prueba, sin convertir ninguna en verificación del evaluador.
Rechazo, revocación, caducidad, futuro, scope divergente, efectos no autorizados,
gasto no desactivado o conflicto de límites/historia bloquean. Faltantes mantienen
`incomplete`; la estructura inválida tiene prioridad.

Primer presupuesto conservador: máximo un arranque acumulado para la tarea
evaluada. Una revisión distinta no reinicia el historial. S1 no concilia ni
concede nuevos cupos; ya haber arrancado impide otra revisión favorable con
este presupuesto. La ampliación de intentos necesita diseño posterior explícito,
no alterar counters o crear otra revisión para eludir el límite.

Entrada: JSON inerte, string, Buffer o Uint8Array genuino, hasta 131 072 bytes
serializados. Strings/bytes se acotan antes de decodificar; objetos se copian con
la utilidad compartida acotada (2 MB de texto, 30 000 nodos, 64 niveles, 256
elementos por array), y luego se comprueba el límite serializado antes de validar.
Rechaza UTF-8/Unicode/calendario inválidos, proxies/getters, ciclos, conversiones,
campos extra, claves peligrosas/repetidas y arrays alterados. Sin reloj actual,
IO, red, azar o procesos en construcción/evaluación después de imports.

Todos los informes conservan los flags de ejecución/admisión/verificación en
`false`, techo interno `null` y siete gates externos pendientes. No tickets,
reserva, rutas, argv, cuenta, prompt o metadatos privados en la salida. Referencias,
fuentes y hashes solo acreditan coherencia de declaraciones.

## Evidencia histórica de cierre S1

Entorno de comprobación: macOS arm64, Node `v24.14.1`, 2026-10-04 (America/Bogota).

- Primera batería: 334/336; dos fallos por formato de nombres de campos faltantes
  en el informe. Se corrigió el esquema de esos nombres y 336/336 pasaron.
- La revisión reforzó el scope completo y añadió pruebas contra reutilizar
  evaluaciones al cambiar efectos/historia/aceptación. Batería final: **346/346**,
  471 ms; cero fallos, canceladas, omitidas o pendientes.
- Regresión completa final: **1 836/1 836**, 42 922 ms; cero fallos, canceladas,
  omitidas o pendientes. Sin modificar C1, selector, adaptadores A/B o CLI.
- Sintaxis de ambos archivos JavaScript y JSON del esquema válidos. Pruebas
  instrumentan IO, red, spawn, reloj actual y azar tras imports; cero operaciones
  observadas en construcción/evaluación favorable e inválida.
- Revisión de cinco archivos propios: formato, 19 enlaces locales y 10 tablas
  correctos; comprobación de espacios limpia e índice sin staging. Escaneo
  limitado de patrones sensibles sin hallazgos ni datos de instalación privada.
  SHA-256: 152 de 154 archivos previos intactos; solo dos documentos propios
  actualizados y tres archivos nuevos, sin borrados ni cambios en módulos previos.

| Criterio S1 | Evidencia ejecutada |
| --- | --- |
| 1–2 | Flags siempre falsos, sin capacidades; fuentes conservadas y scope de declaraciones |
| 3 | Calls desconocidas siguen `null`; rechazo de inventar techo; turnos/procesos separados |
| 4–5 | Permisos/frescura/revocación/efectos/gasto/límites/historia; aceptación remota no acepta gastos |
| 6–7 | Fixtures ficticias, guardias de efectos, adversarios JSON, inmutabilidad y determinismo |
| 8 | Regresión completa, C1 con once controles intactos; ninguna migración o integración nativa |

Resultado de quality-gate: **Aprobado con observaciones para S1 offline**.
La observación principal es que verifica coherencia, no evidencia real o permiso
de una cuenta. Al cerrar S1, S2/S3 y todos los gates externos estaban pendientes;
el estado posterior de S2 está enlazado arriba. No se inició
Claude, consultó cuentas/credenciales o llamó modelos; no se modificó Obsidian,
proyectos, configuración, automatizaciones o catálogos. Sin commit ni push.

## Fuentes documentales

Revisión documental SDD/quality-gate: **Aprobado con observaciones**. Formato,
20 enlaces locales y 11 tablas de los tres documentos revisados correctos;
comprobación de espacios sin errores e índice sin archivos preparados. Escaneo
limitado sin patrones sensibles o evidencia de instalación privada. Comparación
SHA-256: 151 de 153 archivos previos intactos, dos documentos propios actualizados,
uno nuevo y ninguno borrado. El primer intento del comprobador documental tenía
un error de sintaxis; se corrigió y la comprobación final pasó. No se ejecutó
regresión de código ni pruebas nativas por ser una entrega exclusivamente
documental. Las observaciones son los gates reales todavía no evaluados; este
resultado no admite una instalación ni certifica las condiciones de su cuenta.

Consulta: 2026-10-04 (America/Bogota). Documentación, no pruebas de instalación:

- `--tools` y MCP son controles distintos; safe mode conserva parte de las
  políticas administradas. El límite de turnos no es techo de solicitudes.
  [Referencia CLI](https://code.claude.com/docs/en/cli-reference).
- Bare no utiliza el login de suscripción; por ello no es alternativa en esta ruta.
  [Ejecución programática](https://code.claude.com/docs/en/headless).
- Créditos adicionales se controlan en Settings > Usage y también aplican a
  Claude Code. Desactivarlos limita el acceso al uso incluido; el Toolkit no
  inspeccionó ese estado en la cuenta.
  [Créditos de planes de Claude](https://support.claude.com/en/articles/12429409-manage-usage-credits-for-paid-claude-plans).

## Cierre de S1 offline para entrega local — 2026-10-07

Resultado de quality-gate: **Aprobado con observaciones para S1 offline**.
La observación central sigue siendo su naturaleza declarada: no verifica una
cuenta, instalación, permiso humano o condiciones económicas actuales.
No se añadió comportamiento ni se relajaron contratos para cerrar la entrega.

Alcance de cuatro rutas: este documento, esquema, evaluador puro y suite sintética.
Helpers C1/JSON ya versionados y sin cambios. Quedan fuera S2/S3, diagnósticos
nativos, expedientes privados, políticas instaladas, nuevas rutas/modelos,
permisos permanentes, CLI, almacenamiento, README y bóvedas.
Las cuatro referencias a etapas/políticas no incluidas se mantienen como texto
sin incorporar sus archivos ni modificar las reglas de autoría del proyecto.

### Evidencia independiente

Se extrajo la base versionada y se superpusieron solo estas cuatro rutas en
una copia temporal propia. Se reutilizaron dependencias instaladas sin nuevas
instalaciones o cambios en node_modules.

| Comprobación | Resultado observado |
| --- | --- |
| Regresión completa aislada | 2.183/2.183; exit 0; 66.604,642 ms |
| Fallos, canceladas, omitidas y pendientes | 0 |
| Cobertura incorporada | 1.837 anteriores + 346 de S1 |
| Sintaxis individual | 2 node --check, ambas exit 0 |
| Revisión previa en árbol local | 346/346; exit 0; 508,428 ms |
| Contrato | Ajv2020 strict compiló input/policy/report |

```sh
node --test --test-concurrency=2 --test-reporter=spec
node --test --test-reporter=spec test/client-supervised.test.js
```

El primer comando pertenece a la copia aislada; el segundo a la revisión previa
en el árbol local. No sumar ejecuciones repetidas como casos nuevos.
La regresión de la base incluye las fixtures Node C2; las pruebas específicas
S1 solo evaluaron datos sintéticos sin IO/red/procesos/reloj actual en las APIs
instrumentadas. Ninguna ejecución llamó clientes de IA o consultó cuentas.

La matriz de criterios S1 1–8 conserva su trazabilidad: estados sin capacidades,
procedencia y vínculo completo, llamadas desconocidas como null, separación de
arranques/turnos/llamadas, permisos/frescura/revocación declarados, límites e
historia, aceptación remota sin aceptar gastos, JSON adverso e inmutabilidad.
C1 conserva sus once controles y no admite esta ruta como instalación verificada.

Después de probar solo se ajustó este documento. Código, esquema y tests
conservan exactamente sus bytes probados. Antes del commit se verifican
enlaces/formato, patrones sensibles limitados, hashes finales del índice y
preservación de trabajo ajeno. El identificador y huellas se registran aparte,
sin trasladar cuentas, capturas o lotes privados al repositorio.

### Límites que conserva el cierre

- ready-for-supervised-review significa revisión de coherencia declarada, no
  permiso de arranque, cliente compatible, recomendación verificada o cobertura
  económica confirmada. No emite ticket, argv, reserva o factura.
- executed/runtimeReady/verifiedAdmission/externalBillingVerified/selectionVerified
  siguen false; internalCallCeiling sigue null y remoteCancellationVerified false.
- La aceptación explícita de incertidumbre es distinta de aprobar gasto fuera
  del plan. Historial anterior incierto bloquea; no se reinicia ni se convierte
  una llamada desconocida en cero o uno para satisfacer otro contrato.
- No se modificó la admisión estricta C1/C3. Esta ruta separada requiere elección,
  permiso y controles propios; no convierte un bloqueo estricto en autorización.
- Pruebas observadas en macOS/Node v24.14.1, no certificación multiplataforma.
  Las fuentes externas conservan sus consultas históricas: no se verificaron
  créditos, cuotas, cuentas, condiciones o versiones instaladas durante este cierre.

Siguiente puerta: revisar S2 o los contratos posteriores por separado y dentro
de sus límites. Ningún commit de S1 inicia clientes, conecta cuentas, configura
una ruta de almacenamiento o publica cambios automáticamente.
