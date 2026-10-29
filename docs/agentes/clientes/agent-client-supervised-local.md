# S2 — Registro y supervisión local con procesos ficticios

## Estado y autorización

S2.1–S2.3 autorizadas con «autorizo» después de revisar esta especificación.
Base implementada con almacenamiento temporal privado y procesos Node propios;
la evidencia de verificación se registra en el cierre. Profundidad SDD:
rigurosa por persistencia, concurrencia y arranque de procesos.
S3, clientes reales, cuentas, modelos,
API keys, cambios de configuración, commits, publicación y Obsidian quedan fuera.

El 2026-10-07 el usuario autorizó consolidar las 15 rutas de S2: validación
aislada secuencial, cierre documental y commit local. La autorización posterior
se limita a la entrega fixture-only; no incluye push, clientes de IA, cuentas,
destino permanente o permisos nuevos de S3. La evidencia actual está al final.

Dependencia: [S1 offline](agent-client-supervised-subscription.md), implementada
con evaluador puro. Su resultado favorable revisa coherencia de declaraciones;
no acredita autorización humana ni permite ejecutar. La ruta estricta
[C2](agent-client-runtime-local.md) y sus contadores no se modifican.

## Problema y resultado observable

S1 no puede recordar que ya hubo un intento ni controlar un proceso. S2 debe
persistir una reserva antes de cualquier arranque y supervisar exclusivamente
programas ficticios empaquetados, sin clientes de IA ni tráfico de red.

Para el usuario: un intento no se duplica al abrir dos coordinadores, una caída
no borra el presupuesto y un proceso silencioso también se detiene al vencerse
su plazo. El resultado sigue siendo una prueba local, no una propuesta real ni
evidencia de condiciones económicas de una cuenta.

## Alcance y límites de confianza

- Primera plataforma probada: macOS arm64 y Node compatible con el proyecto.
  No anunciar compatibilidad Windows/Linux sin pruebas propias.
- Escritores cooperativos y directorio controlado por el mismo usuario. Las
  comprobaciones de archivos no aíslan frente a un atacante con ese mismo UID
  ni sustituyen primitivas de contención del sistema operativo.
- Registro independiente de C1/C2 y del historial declarado de S1. No importar,
  convertir o conciliar automáticamente registros anteriores o nativos.
- Programas ficticios de registro cerrado, seleccionados por ID, sin shell,
  rutas de ejecutables, argumentos libres o recetas recibidos en JSON.
- Sin integración CLI, catálogo, selector automático, parser nativo, captura
  de respuestas reales ni guardado de prompts. No expedir admisión nativa.

## SL-01. Entrada y configuración de confianza

El constructor recibe esquemas y configuración de almacenamiento de código de
confianza. El directorio nunca proviene de un encargo, modelo o archivo leído.
Los inyectores de fallos se admiten solo en construcción para las pruebas;
ningún callback, dependencia o permiso llega por JSON.

Encargo cerrado e inerte, máximo 128 KiB, con versión, `fixture-only`, identidad
proyecto/tarea/revisión, ID de intento, fixture, texto sintético acotado y límites
explícitos. Rechazar tipos coercibles, getters/proxies, claves duplicadas o
peligrosas, bytes UTF-8 inválidos, campos extra y objetos alterados. JSON de S1
o un estado `ready-for-supervised-review` no son permisos de ejecución.

Los IDs solo son identificadores, nunca rutas; los nombres de carpetas internas
se derivan de sus huellas. Un permiso interno no serializable y de un solo uso
vincula la reserva, sesión, encargo y política fixture. No acepta handles C2,
no sobrevive al cierre de sesión y se consume antes del primer spawn.

## SL-02. Persistencia privada y reserva

Raíz nueva dedicada, aprobada al implementar las pruebas; pruebas en directorios
temporales exclusivos. No usar proyectos, Git, Obsidian, directorios de clientes
ni rutas sincronizadas conocidas. No crear un almacén permanente de usuario
en esta etapa. Directorios `0700`, archivos `0600`, propietario actual, archivos
regulares de un enlace y sin symlinks en la ruta; rechazar recursos preexistentes
incompatibles, truncados o desconocidos. No corregirlos con chmod ni sobrescribirlos.

Identidad del presupuesto: proyecto y tarea, independientemente de revisión,
cliente, fixture o ID del intento. Máximo una reserva/intento acumulado por tarea
en S2. Otra revisión o proceso no recupera ese presupuesto. Acotar el registro
a un intento y cada documento a 128 KiB; no hacer búsquedas ilimitadas.

Reserva exclusiva durable antes de spawn: creación excluyente, escritura
completa, sincronización de archivo y directorio, comprobación de identidad y
lectura posterior. Solo liberar el bloqueo temporal propio tras verificarlo;
la reserva y el historial permanecen. Hash y secuencia detectan errores y
cambios cooperativos, no autentican datos frente al propietario.

Transiciones durables mediante eventos cerrados exclusivos y ordenados, sin
reescribir el historial anterior. Un evento parcial, hueco, duplicado, cambio
de identidad o fallo de sincronización bloquea la tarea. Conservar la reserva
y devolver `reconciliation-required`; no borrar o reparar automáticamente.

Registrar solo IDs, huellas, límites, secuencia, estados, contadores observados
y códigos de error cerrados. Sin texto de entrada/salida, entorno, cuentas,
tokens, rutas privadas, mensajes arbitrarios de excepción o razonamiento.
Fechas UTC describen observación, no sustituyen el reloj monotónico de ejecución.

## SL-03. Estados y contadores

| Estado | Evidencia necesaria y consecuencia |
| --- | --- |
| `reserved` | Reserva durable; todavía no existe arranque confirmado |
| `start-claimed` | Derecho de arranque consumido durablemente antes de spawn |
| `started` | Evento de arranque observado; no acredita una llamada a IA |
| `completed-for-review` | Protocolo ficticio completo, salida correcta y terminación local confirmada |
| `failed`, `canceled`, `timed-out` | Resultado local conocido, sin permiso de reintento |
| `indeterminate` | Observaciones locales insuficientes o contradictorias |
| `reconciliation-required` | Reserva inconclusa o almacenamiento incierto; nuevos arranques bloqueados |

`spawnAttempts` aumenta antes de invocar spawn; `mainStartsObserved` solo al
observar su evento. Una excepción de spawn no devuelve el presupuesto. Si se
cae antes de observarlo, no inventar un cero: conservar la incertidumbre. Al
reabrir un registro inconcluso, pedir conciliación y no confiar solo en PID o edad.

El protocolo fixture puede registrar `fixtureModelCalls: 0` porque sus programas
no llaman IA. El informe del perfil mantiene `actualModelCalls: null`,
`internalCallCeiling: null` y `remoteCancellationVerified: false`; jamás exportar
el cero sintético como historial de Claude/Codex. S2 no implementa una
operación para desbloquear, borrar intentos o conceder nuevos cupos.

## SL-04. Supervisor incremental

Separado del supervisor C2. Reutilizar helpers puros o de archivos compatibles
sin alterar sus contratos; no adaptar un informe C2 cambiando su perfil.
Spawn Node y script fijo empaquetado, `shell: false`, grupo dedicado, stdin por
pipe, entorno mínimo de prueba y carpeta temporal privada. No heredar claves,
opciones de Node, configuración de clientes o personalizaciones de proyectos.

Límites explícitos no mayores que S1: un arranque, concurrencia uno, cero
reintentos/correcciones, plazo total 120 s, entrada 16 KiB, stdout 256 KiB,
stderr 32 KiB, línea/evento 32 KiB y 512 eventos. Para las pruebas usar plazos
menores explícitos; ningún límite se eleva automáticamente.

Medir monotónicamente desde la entrada al coordinador, incluyendo reserva,
inicio, stdin y terminación. No iniciar si el tiempo restante no alcanza.
La reserva de tiempo para gracia y comprobación local se incluye dentro del
plazo total; no añadirla después. La latencia del sistema puede impedir cumplir
el plazo: señalarlo como incertidumbre, no prometer cancelación exacta.

Registrar handlers inmediatamente al devolver spawn; vigilar bytes antes de
acumular, UTF-8 dividido, CRLF, líneas sin salto, claves repetidas, eventos y
stderr. Protocolo ficticio propio cerrado, inicio y final únicos, sin contenido
tras el final. Datos de herramientas, delegación, fallback, solicitud de permiso
o ampliación de alcance son eventos prohibidos y detienen el intento.

Timeout, abort, límite, error de pipe o persistencia inconfirmada inician
terminación del grupo. TERM, gracia y KILL dentro del plazo local. Confirmar
salida del padre, cierre de pipes y ausencia observada del grupo; observar solo
el PID principal no basta. Las fixtures de descendientes permanecen dentro
del grupo: no prometer contener procesos que se desvinculan.

Resultado acotado, sin texto crudo, con `scope: fixture-only`, `fixtureExecuted`,
estado, contadores observados, terminación y razones. `nativeExecuted`,
`runtimeReady` y `verifiedAdmission` siempre falsos. Una finalización técnica
no acredita revisión humana, calidad de código, acceso o gasto del proveedor.

## SL-05. Fallos, limpieza y recuperación

Desacuerdo de huellas, recurso inseguro o permiso falso bloquea antes de spawn.
Fallo tras la reserva conserva esta; fallo tras iniciar solicita terminación
y no informa éxito si la escritura final o la terminación son inciertas.

Solo retirar archivos temporales propios identificados y carpetas vacías del
workspace sintético tras terminación confirmada. No borrar registros de intento,
reservas de otros coordinadores o archivos desconocidos. Si no se confirma el
fin del proceso, conservar evidencia mínima y comunicar intervención necesaria;
las pruebas deben controlar ese proceso y terminarlo al cerrar su arnés.

Reversión de la implementación: desactivar su uso, conservar el registro y
volver al traspaso manual. Sin migraciones destructivas ni recuperación de cupos.

## Entregas por dependencia y archivos probables

| Entrega | Resultado | Archivos propios previstos |
| --- | --- | --- |
| S2.1 | Contrato local, registro exclusivo y permiso fixture | `schemas/agent-client-supervised-local.schema.json`, `src/client-supervised-store.js`, `src/client-supervised-permit.js`, `test/client-supervised-store.test.js` |
| S2.2 | Supervisor/coordinador de fixtures cerradas | `src/client-supervised-supervisor.js`, `src/client-supervised-coordinator.js`, `src/client-supervised-protocol.js`, `testing/supervised/`, `test/client-supervised-supervisor.test.js` |
| S2.3 | Revisión, regresión y evidencia | Este documento y el índice de S1; sin cambios a C1/C2 o clientes |

Estas rutas fueron el plan de implementación. Los archivos entregados se enlazan
en el contrato implementado; se validó primero almacenamiento y después fixtures.
Aprobar S2
no autoriza S3, conexión CLI, almacenamiento permanente, Git o publicación.

## Criterios de aceptación y plan de pruebas

| Criterio | Comprobación observable |
| --- | --- |
| AC-01: contrato separado | JSON de S1/C2, handles ajenos, rutas/argv libres y perfiles nativos rechazados; cero spawn |
| AC-02: reserva previa | Sin éxito de creación, sync y lectura posterior no se observa un arranque |
| AC-03: carrera | Dos coordinadores/procesos sobre la misma tarea: como máximo un derecho de arranque, sin sobrescrituras |
| AC-04: presupuesto estable | Otra revisión, fixture, intento o constructor no habilita un segundo intento |
| AC-05: caída | Fallos/caída real antes y después de reserva, claim y spawn conservan bloqueo y no regeneran cupo |
| AC-06: archivos adversos | Symlink, hardlink, propietario/permisos incorrectos, truncado, reemplazo, hueco o evento extraño bloquean |
| AC-07: plazos | Silencio, stdin bloqueado, TERM ignorado, padre que termina antes del hijo: parada o incertidumbre explícita |
| AC-08: captura | Bytes partidos, límites exactos/excedidos, UTF-8 inválido, línea incompleta, doble final y evento prohibido |
| AC-09: privacidad | Informes/registro sin entrada, salida, entorno o excepción crudos; modos de archivos comprobados |
| AC-10: incertidumbre | No inventar llamadas/cancelación remota; cero de fixture no se convierte en historia supervisada |
| AC-11: aislamiento de alcance | Cero clientes/cuentas/modelos/red; sin cambios a proyectos, configuración, Obsidian, CLI o contratos previos |
| AC-12: cierre | Suite nueva y regresión completas, fallos documentados, limpieza del arnés y revisión del diff por rutas |

Las pruebas crean almacenamiento sintético y procesos Node propios.
Los procesos no leen proyectos ni llaman proveedores; una fixture de entorno
solo verifica nombres/ausencias y no imprime valores heredados. Casos con
terminación incierta no deben dejar procesos de prueba abandonados.

## Alternativas y siguiente puerta

Reutilizar todo C2: descartado porque su historial exige llamadas verificables
y el éxito fixture no acredita consumo nativo. Usar almacén nuevo independiente
con helpers compatibles: propuesta para mantener las garantías de ambos perfiles.
Solo memoria en RAM: descartada para evitar duplicados y reinicio de presupuesto.
Conservar el traspaso manual: disponible mientras se prueba esta propuesta.

La aprobación de S2.1–S2.3 cubrió escritura privada temporal y ejecución de
procesos Node ficticios. Antes de S3 sigue siendo necesaria evaluación nativa,
autorización de efectos y confirmación económica vigente; S2 no las sustituye.

## Revisión documental histórica de la propuesta

Resultado de quality-gate: **Aprobado con observaciones para el diseño**;
no equivale a aprobación del usuario para implementar ni a pruebas de S2.
Se revisaron alcance, transiciones, privacidad, carreras, fallos y criterios.
Dos documentos: 11 enlaces locales existentes y 8 tablas consistentes, formato
correcto y escaneo limitado de patrones sensibles sin hallazgos. El primer
comprobador confundió líneas en blanco con espacios finales; se corrigió la
expresión del comprobador y la comprobación final pasó sin reformatear archivos.
`git diff --check` limpio e índice vacío. Comparación SHA-256: 157 de 158 archivos
previos intactos; solo el índice propio de S1 cambió, un documento nuevo y cero
borrados. No hubo cambios funcionales, regresión ejecutada, arranques, cuentas,
modelos, almacenamiento permanente, commit ni push.

Observaciones: los mecanismos de persistencia y terminación necesitan evidencia
de implementación; plataforma y escritores de confianza están acotados. Los
12 criterios son pruebas previstas, no resultados aprobados ni gates nativos.

## Contrato y API implementados

| Archivo | Responsabilidad |
| --- | --- |
| [Esquema local](../../../schemas/agent-client-supervised-local.schema.json) | Encargo, evento, recibo, informes y observaciones cerrados, versión `1.0.0` |
| [Contrato](../../../src/client-supervised-contract.js) | Validación estricta acotada, Unicode, hashes y límites compatibles |
| [Diagnósticos](../../../src/client-supervised-codes.js) | Lista cerrada; no devolver mensajes arbitrarios de excepción |
| [Registro](../../../src/client-supervised-store.js) | Reserva exclusiva, eventos durables y observación del presupuesto |
| [Permiso interno](../../../src/client-supervised-permit.js) | Handle no serializable, de un solo uso y separado de C2 |
| [Protocolo](../../../src/client-supervised-protocol.js) | Stream sintético `s: 2`, límites incrementales y descarte de datos |
| [Supervisor](../../../src/client-supervised-supervisor.js) | Arranque Node fijo, plazo monotónico y terminación del grupo |
| [Coordinador](../../../src/client-supervised-coordinator.js) | Validación, reserva previa y resultado acotado; ninguna integración CLI |
| [Pruebas del registro](../../../test/client-supervised-store.test.js) | Carreras, caídas, recursos adversos, privacidad y presupuestos |
| [Pruebas del supervisor](../../../test/client-supervised-supervisor.test.js) | Procesos, límites, abort, pipes, descendientes y errores |
| [Fixtures](../../../testing/supervised/fixture.cjs) | 21 programas sintéticos cerrados, sin IA ni red |
| [Hijo sintético](../../../testing/supervised/child.cjs) | Descendiente dentro del grupo, sin desvincularse |
| [Arnés](../../../testing/supervised/setup.js) | Directorios nuevos y limpieza limitada a recursos propios |
| [Worker](../../../testing/supervised/store-worker.js) | Carreras y caídas reales de un coordinador de prueba |

API de confianza, sin comandos nuevos:

- `createSupervisedContract(schema)`: valida/copia encargos y salidas.
- `createSupervisedStore(schema, { root }, dependencies)`: `observe(identity)`
  y `withReservation(request, trustedConsumer)`. No inicializa ni repara recursos.
- `createSupervisedSupervisor(schema, dependencies)`: devuelve el supervisor de
  fixtures, que exige un handle interno propio.
- `createSupervisedCoordinator(schema, { root }, dependencies)`: devuelve la
  coordinación fixture; no acepta clientes, modelo, ejecutable, argv o shell.

Las dependencias se proporcionan desde código de confianza al construir el
arnés, nunca desde un encargo o un resultado del modelo. La invocación por este
arnés autorizado permite experimentos sintéticos, no acredita consentimiento
para una ejecución nativa. El protocolo C2 `v: 1` no es válido en S2.

La raíz debe ser un directorio privado físico ya creado, hijo directo del
directorio temporal efectivo y con prefijo `agent-supervised-`. S2 rechaza
activar almacenes permanentes; el root no aparece en JSON del encargo ni en
informes públicos. Un workspace privado bajo la raíz de pruebas permite que
el arnés limpie también recursos de coordinadores que terminan abruptamente.

Cada tarea usa una carpeta SHA-256 de proyecto/tarea, creada excluyentemente.
Hasta cuatro eventos `0000.json`–`0003.json`: reserva, claim, inicio observado
y resultado. Las transiciones no sobrescriben archivos previos. Un cierre antes
del arranque puede tener menos eventos, sin devolver el presupuesto.

`confirmed.json` solo se crea después de sincronizar y releer el evento terminal;
vincula su hash de bytes. Un evento terminal sin recibo no es cierre confirmado.
Lectura valida estructura, secuencia, identidad, huellas, tiempo, contadores,
presupuesto, límites y recibo. Un hash acredita coherencia cooperativa, no
autenticidad frente al mismo propietario ni protección frente a borrado externo.

Después de un claim sin observación, el inicio permanece desconocido al reabrir;
si se observó, se conserva el uno incluso cuando el intento queda incierto.
Una escritura de inicio pendiente no compite con un evento terminal: el registro
permanece inconcluso. S2 no concilia, desbloquea ni migra esa tarea.

Los informes públicos separan tiempo del supervisor y `elapsedMs` total del
coordinador, incluyendo persistencia final. Si esta rebasa el plazo, el resultado
global es `indeterminate`, aunque el proceso ya haya terminado correctamente.
No se cancela mágicamente una operación de disco pendiente: el retraso se
expone y la reserva permanece. El consumo remoto sigue siendo desconocido.

`storage.durability` describe las escrituras que pudieron comprobarse en esa
sesión; no elimina un estado `reconciliation-required`. Para informar cierre
del intento también se necesita estado terminal confirmado y recibo coherente.
La observación de disco no concede permisos nuevos ni autentica al operador.

## Evidencia histórica de cierre S2

Comprobación: 2026-10-04 (America/Bogota), macOS arm64, Node `v24.14.1`.

- Batería inicial de almacenamiento: 56/63. Los workers no recibían el directorio
  temporal efectivo y se bloqueaban antes de la reserva. Se fijó `TMPDIR` solo
  en el arnés de prueba, sin heredar credenciales o modificar el entorno global;
  la misma batería pasó 63/63.
- Registro y supervisor iniciales pasaron 117/117. La revisión añadió recibo de
  cierre, códigos cerrados, invariantes de salida, medición del plazo global,
  rechazo de proxies antes de acceder al prototipo y pruebas adversas adicionales.
- Batería final de S2: **131/131**, 15 678 ms, ejecución secuencial; cero fallos,
  canceladas, omitidas o pendientes. Incluye carreras entre procesos y caídas
  reales, sin iniciar clientes de IA.
- La primera regresión completa con paralelismo predeterminado tuvo tres fallos
  en pruebas anteriores: dos de C2 por plazos/terminación y uno de sync apply por
  inspección Git. Hubo duraciones anómalas de aproximadamente 580 segundos en
  dos casos. No se demostró la causa del retraso ni se modificaron esos módulos.
- Regresión completa secuencial final: **1 967/1 967**, 140 133 ms; cero fallos,
  canceladas, omitidas o pendientes. El resultado secuencial no certifica que
  el arnés temporal sea estable bajo toda carga o suspensión del sistema.
- Los 14 archivos nuevos pasan sintaxis/JSON y comprobaciones de formato.
  Escaneo limitado de patrones sensibles sin hallazgos. Dos documentos revisados
  con 26 enlaces locales existentes y 10 tablas consistentes en su versión final.
- `git diff --check` limpio e índice vacío. Comparación SHA-256: 157 de 159
  archivos previos intactos; solo estos dos documentos de S1/S2 actualizados,
  14 archivos nuevos y ningún borrado del proyecto.
- El arnés limpia sus carpetas nuevas identificadas. Se retiró mediante `rmdir`
  una carpeta vacía propia de la primera prueba de caída, antes de ajustar el
  workspace del worker para quedar dentro de la raíz privada de pruebas.
  No se borraron datos de usuario ni se abandonaron procesos ficticios activos.

| Criterio | Evidencia ejecutada |
| --- | --- |
| AC-01 | Contratos/flags cerrados, S1/C2/JSON adverso rechazados; handles falsos, ajenos y revocados |
| AC-02 | Reserva, claim y lectura posterior comprobados antes del spy de spawn; sync defectuoso no inicia |
| AC-03–04 | Carreras de stores y coordinadores entre procesos, aislamiento proyecto/tarea, revisión no reinicia cupo |
| AC-05 | Worker termina antes/después de reserva, claim, inicio y spawn; ningún caso recupera presupuesto automáticamente |
| AC-06 | Symlink/hardlink, permisos, UID simulado, reemplazo, truncado, hueco, cadenas y recibos inválidos |
| AC-07 | Silencio, stdin bloqueado, TERM ignorado, padre/hijo, abort y observación de grupo denegada |
| AC-08 | UTF-8/CRLF en todos los cortes, límites exactos, excesos, doble final, eventos prohibidos y EPIPE |
| AC-09 | Modos `0700`/`0600`, informes/registro sin payload, errores redactados y cero credenciales heredadas |
| AC-10 | Llamadas reales/techo interno siguen `null`; cero fixture y desconocimiento remoto separados |
| AC-11 | Spies de red sin llamadas del coordinador, ejecutable/argv/entorno fixture fijos y hashes de módulos previos intactos |
| AC-12 | Baterías finales completas, revisión por rutas, limpieza propia y observación de estabilidad del arnés |

Resultado de quality-gate: **Aprobado con observaciones para S2 fixture-only**.
Observaciones: confianza en escritores cooperativos, plataforma limitada,
sin aislamiento frente al mismo UID y sensibilidad del arnés completo a pausas
o carga; no prometer plazo exacto de IO ni cancelación remota.
La ejecución nativa y la condición económica de cuentas siguen sin evaluar.

No se abrieron Claude/Gemini/Codex, consultaron cuentas o credenciales, llamaron
modelos o modificaron proyectos, Obsidian, CLI, configuración, catálogo,
automatizaciones o contratos C1/C2/S1. Sin staging, commit ni push.
Siguiente paso: especificar preflight/variante S3 y sus permisos antes de cualquier
piloto nativo; esta entrega no autoriza ejecutarlo ni crear un almacén permanente.

## Cierre de S2 fixture-only para entrega local — 2026-10-07

Resultado de quality-gate: **Aprobado con observaciones para S2 cooperante y ficticio**.
Se conservan las observaciones de soporte macOS arm64, escritor/coordinador de
confianza, IO sin plazo duro, sensibilidad del arnés a carga y recuperación manual.
No se cambió comportamiento, límites, timeouts o tests para consolidar la base.

Alcance de 15 rutas: este documento, esquema local, siete módulos, dos suites
y cuatro helpers/fixtures. S1, C1/C2, selector y decodificador ya estaban
versionados y permanecen intactos. No se incorporan S3, clientes nativos,
diagnósticos de cuentas, nuevas políticas privadas, README, CLI o bóvedas.

### Evidencia independiente de Codex

Se extrajo la base versionada y se superpusieron solo las 15 rutas en una copia
temporal propia. Se reutilizaron dependencias instaladas sin nuevas instalaciones.
La regresión se ejecutó con concurrencia 1 para conservar el recorrido secuencial
ya documentado; esto no certifica estabilidad bajo cualquier carga o suspensión.

| Comprobación | Resultado observado |
| --- | --- |
| Regresión completa aislada secuencial | 2.314/2.314; exit 0; 141.675,612 ms |
| Fallos, canceladas, omitidas y pendientes | 0 |
| Cobertura incorporada | 2.183 anteriores + 131 S2 |
| Revisión previa S2 en árbol local, secuencial | 131/131; exit 0; 15.727,200 ms |
| Sintaxis individual | 13 node --check, todas exit 0 |
| Contrato | Ajv2020 strict compiló identity/request/event/receipt/processReport/report/observation |

```sh
node --test --test-concurrency=1 --test-reporter=spec
node --test --test-concurrency=1 --test-reporter=spec test/client-supervised-store.test.js test/client-supervised-supervisor.test.js
```

El primer comando pertenece a la copia aislada; el segundo a la revisión previa
en el árbol local. No sumar ejecuciones repetidas como casos adicionales.
Las pruebas crearon sus propios temporales y ejecutaron únicamente programas
Node empaquetados. Sus carreras, caídas y señales afectaron esos procesos y
grupos, no clientes de IA, proveedores, cuentas o proyectos reales.
No se eligió o creó una raíz permanente para usar el runtime.

La matriz AC-01–AC-12 anterior conserva su trazabilidad: contrato y handles
independientes, reserva/claim antes de spawn, presupuesto estable por tarea,
carreras/caídas, recursos adversos, límites incrementales, cancelación/grupos,
recibos coherentes, privacidad y separación de llamadas reales frente a fixtures.
La regresión mantiene los contratos previos de S1/C1/C2 sin modificaciones.

Después de probar solo se ajustó este documento para separar evidencia histórica
y actual. Código, esquema, tests y helpers conservan sus bytes probados.
Antes del commit se comprueban formato/enlaces, patrones sensibles limitados,
huellas finales del índice y preservación de archivos ajenos. El identificador
y la evidencia privada se registran aparte, sin publicar datos de los temporales.

### Límites que no se amplían

- `scope` sigue fixture-only. nativeExecuted/runtimeReady/verifiedAdmission false,
  actualModelCalls/internalCallCeiling null y remoteCancellationVerified false.
  fixtureModelCalls cero no acredita consumo nativo cero ni cuota disponible.
- El registro conserva un intento por proyecto/tarea y sus eventos; una revisión,
  ID o constructor nuevo no recupera presupuesto. Incertidumbre exige revisión,
  sin conciliación, reparación, desbloqueo o reintento automático.
- Las escrituras confirmadas y el recibo no certifican hardware, apagados,
  carpetas sincronizadas o resistencia ante un atacante con el mismo UID.
  Retrasos de IO o terminación incierta no se ocultan como éxito dentro del plazo.
- Soporte ensayado macOS arm64 y Node v24.14.1; no certificación Linux/Windows
  o arnés estable bajo cualquier carga. Los resultados anteriores fallidos se
  conservan en el historial, no se reetiquetan como pruebas aprobadas.
- No hay integración CLI, cuentas verificadas, condiciones económicas comprobadas,
  modelos reales admitidos, captura de respuestas nativas o configuración global.

Siguiente puerta: revisar contratos y controles S3 por separado. El commit local
de S2 no transforma un resultado S1 en permiso de ejecución, no activa agentes
y no autoriza publicación o uso de una raíz de almacenamiento permanente.
