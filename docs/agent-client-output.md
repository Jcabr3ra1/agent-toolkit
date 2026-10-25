# Interpretación offline de salidas de clientes

## Aprobación y alcance

Etapa B de [los adaptadores](agent-client-adapters.md), autorizada el 2026-10-03
con «listo dale», después de proponer parsers offline como siguiente paso.
Se implementan contratos, parsers puros y capturas ficticias; no un runner ni
una certificación de los clientes instalados. No se conceden nuevas llamadas,
se cambian cuentas o se aprueba aplicación de código.

La consolidación local A/B fue autorizada el 2026-10-06 para validar ocho rutas,
registrar evidencia y crear commit local, sin push. El cierre posterior está al
final de este documento; no modifica el contrato ni habilita ejecución de IA.

## Diseño y contrato

El consumidor entrega un plan `prepared` de etapa A, una observación declarada
de salida del proceso y stdout/stderr ya capturados en memoria. El parser
no abre archivos, invoca CLI, autentica, consulta el reloj, guarda transcripts
o verifica la procedencia de una captura. Una huella no demuestra autenticidad.

La fábrica recibe esquemas locales de confianza y registros explícitos de
cliente/variante/versión/formato. No hay versiones nativas aprobadas por defecto.
La versión debe coincidir exactamente con el plan y el formato del registro;
un número mayor no hereda compatibilidad. Los registros de las pruebas usan
versiones y modelos ficticios y no sirven para habilitar un runner.

Formatos locales acotados:

| Formato | Secuencia admitida |
| --- | --- |
| `codex-jsonl-text-v1` | Inicio de thread, un turno, mensajes/razonamiento y terminal del turno |
| `claude-jsonl-text-v1` | `system/init`, respuestas de texto/razonamiento sin herramientas y `result` |

Son subconjuntos estrictos, no parsers universales del protocolo. Claude no
admite todavía `stream_event` de mensajes parciales. Eventos desconocidos,
hooks, plugins, reintentos nativos, herramientas, subagentes y turnos extra
bloquean la aceptación. Detectarlos después no revierte efectos anteriores.

Los límites son los del plan: bytes de stdout y stderr, bytes por línea,
eventos, respuesta, turnos y duración cuando se reporta. Se exige UTF-8 válido
y objetos JSON por línea. Claves duplicadas, profundidad excesiva, claves
peligrosas, JSON truncado y números no finitos se rechazan sin copiar mensajes
de error nativos. No se permite recuperar automáticamente un stream inválido.

Se exige un inicio único, identidad de sesión consistente y un terminal único.
No se aceptan eventos después del terminal. Una captura sin terminal completo
queda incompleta, sin presentar fragmentos como respuesta final.

La salida normalizada separa validez del stream, estado nativo y observación
del proceso. Una captura de éxito con exit code desconocido es incompleta;
exit code no cero, señal o respuesta/metadata contradictorias bloquean.
`accepted` significa estructura admisible para revisión, no calidad aprobada,
ejecución autorizada o modelo verificado. Siempre hay revisión pendiente,
`executed: false` y `verifiedExecution: false`.

## Texto, metadata y privacidad

Se devuelve una única respuesta final, contrastada con el resultado terminal.
Los snapshots Codex no se suman como deltas. Texto repetido, respuestas contradictorias o pasos incompletos no
se normalizan fingiendo que fueron correctos.

La configuración de inicio se registra como reportada. El modelo de un mensaje
Claude se puede registrar como reportado para la respuesta, nunca `verified`
por el parser: falta verificar la procedencia de la captura. El esfuerzo
efectivo permanece desconocido aunque aparezca en configuración o en un slug.
Una diferencia explícita de configuración/modelo frente al plan bloquea; la
ausencia de metadata se conserva como desconocida para revisión humana.

Solo se extraen contadores permitidos del resultado terminal. Uso por paso y
uso acumulado no se suman. No se convierten tokens en saldo del plan ni se
guardan costos, cuentas, rutas nativas, IDs de conversación, contenido de
herramientas o razonamiento. Stderr solo se cuenta y se omite del informe.
El texto final se mantiene literalmente como datos: puede contener información
sensible y requiere revisión antes de persistirlo o publicarlo.

## Fuentes primarias y límites de evidencia

- Codex documenta JSONL con eventos de thread, turno e ítems. Esta base no
  mezcla ese formato con JSON-RPC de app-server.
  [Modo no interactivo](https://learn.chatgpt.com/docs/non-interactive-mode).
- Claude documenta un `result` final, metadata de inicio y mensajes principales
  frente a subagentes. El SDK define el mensaje `assistant` con `message`,
  contenido y modelo. `success` también exige comprobar `is_error`.
  [Modo programático](https://code.claude.com/docs/en/headless),
  [tipos del Agent SDK](https://code.claude.com/docs/en/agent-sdk/typescript),
  [semántica de resultados](https://code.claude.com/docs/en/agent-sdk/python).

Consulta: 2026-10-03. La documentación explica formas y semánticas generales;
no garantiza el subconjunto exacto de una versión local. Evaluar esa
compatibilidad sigue siendo un gate independiente de etapa C.

## Criterios de aceptación

1. Tres capturas ficticias válidas producen una respuesta única y un informe
   determinista, sin mutar plan, registros o buffers recibidos.
2. Límites de bytes/línea/eventos/turnos se aplican antes de aceptar; UTF-8,
   JSON, profundidad y claves duplicadas/peligrosas inválidos no se recuperan.
3. Inicio, sesión, orden y terminal se contrastan; fragmentos, duplicados,
   espera, fallos, cancelación y salida del proceso se distinguen del éxito.
4. Herramientas, subagentes, hooks, reintentos y eventos desconocidos bloquean,
   sin copiar argumentos ni ejecutar instrucciones del stream.
5. Texto final y deltas/snapshots no se duplican; incompatibilidades bloquean.
6. Configuración y modelo de respuesta conservan procedencia y estado reportado;
   modelo/esfuerzo desconocidos no se inventan ni se certifican.
7. Solo salen metadata permitida, contadores terminales y respuesta final;
   errores, razonamiento, IDs nativos y stderr no se reproducen.
8. La inicialización y parsing no intentan IO, red, procesos o reloj en las
   APIs instrumentadas. Las pruebas anteriores siguen pasando.

Los checks reales de autenticación, aislamiento, versiones instaladas y gasto
son externos a esta entrega. No se implementa corrección automática, escalamiento,
reserva de presupuesto, persistencia, escritura de archivos o integración CLI.

## API implementada

`createClientOutputParser(baseSchema, preferenceSchema, adapterSchema,
outputSchema, config)` recibe los cuatro esquemas locales de confianza y un
registro `{ schemaVersion: "1.0.0", supportedClients: [...] }`. Cada registro
contiene `descriptor` (proveedor, cliente, variante y versión exacta) y `formatId`.
Una combinación contradictoria o duplicada no inicializa la fábrica. Los esquemas
y registros se copian sin invocar getters, proxies o conversiones del consumidor.

La fábrica devuelve `parseClientOutput(metadata, stdout, stderr = "")`:

- `metadata`: versión `1.0.0`, plan completo de etapa A, `captureRef` opaco y,
  opcionalmente, `processObservation` con `exitCode`, `signal`, `elapsedSeconds`.
  Estos son datos declarados; el parser no recalcula ni autentica el plan.
- `stdout` y `stderr`: strings Unicode válidos o buffers/arrays UTF-8 genuinos.
  Se copian antes de procesarlos; no se llama a conversiones arbitrarias.
- Resultado: informe normalizado validado contra `$defs/report` del
  [esquema de salida](../schemas/agent-client-output.schema.json).

`response` solo contiene texto cuando el estado es `accepted`; no se emiten
fragmentos de una captura rechazada. Se conservan la identidad declarada del
plan y su huella canónica, las huellas de bytes de stdout/stderr, recuentos,
motivos acotados y las observaciones permitidas. Las huellas no son firmas ni
garantías de autenticidad. Un consumidor no debe persistir automáticamente el
informe: la respuesta puede contener información sensible.

Los contadores deben ser enteros seguros no negativos. La decodificación también
rechaza fracciones que al redondearse parecerían enteras y números no cero que
se conviertan en cero por underflow. Las duraciones se normalizan a segundos;
los contadores acumulados o intermedios nunca se suman a los del terminal.

Archivo de implementación: [parser](../src/client-output-parser.js), con
[decodificación estricta](../src/client-output-json.js). Las tres capturas
ficticias y sus variantes se construyen en
[las pruebas](../test/client-output-parser.test.js), sin transcripts personales.

## Evidencia histórica de cierre de la etapa B

Comprobaciones locales del 2026-10-03:

- `node --test --test-reporter=spec test/client-output-parser.test.js`: 163
  pruebas nuevas aprobadas, cero fallos, canceladas, omitidas o pendientes.
- `node --test --test-reporter=spec`: 922 pruebas aprobadas, cero fallos,
  canceladas, omitidas o pendientes. Las 759 pruebas previas siguen pasando;
  esto no aprueba otros trabajos todavía no versionados del repositorio.
- `node --check` del parser, decodificador y pruebas: sin errores de sintaxis.
- CA-B01/05: tres secuencias sintéticas, no mutación, determinismo, EOF/CRLF,
  snapshots/deltas, final literal y detección de respuestas incompatibles.
- CA-B02/03: UTF-8/Unicode, JSON truncado y duplicado, profundidad, arrays,
  pérdida de precisión numérica, límites inclusivos y tipos corruptos en los
  campos nativos. Estados desconocidos no acceden a propiedades heredadas.
- CA-B04/06/07: herramientas, subagentes, reintentos y personalizaciones
  bloqueados; metadata ausente desconocida; desajustes frente al plan bloqueados;
  pensamiento, cuentas, errores, costos y stderr nativos fuera del informe.
  Los contadores intermedios se validan, pero no se suman a los terminales.
- CA-B08: APIs de archivos, red, procesos, reloj y azar instrumentadas después
  de cargar módulos. Inicializar y parsear las tres capturas no intentó esas
  operaciones. No demuestra aislamiento de una instalación nativa.
- Formato/navegación: 13 enlaces locales resueltos y cinco tablas consistentes
  entre esta especificación y la de adaptadores. Comprobación de whitespace sin
  incidencias en los seis archivos de esta etapa; el índice de Git está vacío.
- Inventario: de los 119 archivos existentes al iniciar, solo cambió la
  especificación de adaptadores para reflejar la etapa B. Los otros 118 conservan
  sus huellas. Se añadieron esta especificación, un esquema, dos módulos y pruebas.
  Una búsqueda de patrones evidentes no detectó rutas personales ni credenciales
  en los archivos de la etapa; no es una auditoría exhaustiva de secretos.

La revisión adicional cerró defectos de borde antes del resultado final: límite
de eventos sin exceder el esquema, duraciones acotadas, claves heredadas como
estados, Unicode escapado inválido y contadores con pérdida de precisión.
También se restringieron los campos de uso por cliente y se rechaza evidencia
intermedia de herramientas aunque no se agregue al contador final.

Resultado de `quality-gate`: **Aprobado con observaciones**, exclusivamente para
esta base offline. Las observaciones son limitaciones explícitas: no hay
capturas reales evaluadas, autenticidad verificada, presupuesto reservado ni
runner; los formatos admiten solo los subconjuntos definidos aquí. No hay
hallazgos funcionales abiertos dentro de este alcance.

`spec-driven-development` separó contrato, implementación y evidencia;
`openai-docs` aportó la comprobación documental del formato Codex;
`quality-gate` exigió revisión de los límites y regresión completa. No se
modificaron clientes, cuentas, catálogos privados, Obsidian ni código de AVISENS.
No se creó commit ni se hizo push. La etapa C requiere su propio alcance,
autorización y evidencia antes de lanzar procesos reales.

## Cierre de la entrega offline versionable — 2026-10-06

Resultado de quality-gate: **Aprobado con observaciones para A/B offline**.
La copia de la base versionada más las ocho rutas de A/B pasó 1.269/1.269
pruebas, exit 0, en 36.911,795 ms: 1.001 anteriores, 105 del planificador
y 163 de este parser. No hubo fallos, canceladas, omitidas o pendientes.
Cuatro comprobaciones sintácticas individuales dieron exit 0.
La revisión previa de las dos suites en el árbol local pasó 268/268; no se suma
a la regresión como si fueran casos distintos.

```sh
node --test --test-concurrency=2 --test-reporter=spec
```

Esta regresión se ejecutó sobre la copia aislada, no sobre un cliente de IA.
Código, esquemas y tests se conservaron después; el cierre final es documental.
Se reutilizaron dependencias ya instaladas, sin nuevas instalaciones.

Los criterios CA-B01–CA-B08 mantienen la evidencia de sus suites: secuencias
ficticias, determinismo/no mutación, límites/parser estricto, terminal/sesión,
rechazo de herramientas o reintentos, final sin duplicar, procedencia reportada
frente a desconocida y extracción restringida sin efectos de IO o procesos.
Se revisaron los formatos cerrados sin ampliar campos para admitir capturas reales.

No hay transcripts reales, clientes ejecutados o autenticidad comprobada.
El parser no recalcula/autentica el plan, no consume cuotas, no reserva
presupuesto y no prueba gasto ni controles preventivos. La respuesta final puede
contener datos sensibles y no se guarda ni publica automáticamente.
La documentación externa citada es histórica, no un certificado de compatibilidad
de versiones nativas actuales. Las pruebas locales no certifican Linux/Windows.

El commit local se prepara con las ocho rutas revisadas; sus huellas, identificador
y comprobaciones finales de preservación se registran por separado. No hay
publicación, integración CLI o admisión de runtime por este cierre.
