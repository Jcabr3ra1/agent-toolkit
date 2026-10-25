# C2: reservas persistentes y supervisión local

## Estado y puerta de aprobación

Diseño aprobado el **2026-10-03** mediante «aprueba y implementa», con alcance
limitado a **C2.1**. Continúa [el diseño de etapa C](agent-client-runtime.md)
después de verificar C1. Se implementó el almacenamiento local y sus pruebas;
la evidencia de cierre figura al final. Profundidad SDD rigurosa por concurrencia,
persistencia y cancelación. **C2.2** fue autorizada el **2026-10-04** mediante
«aprueba e implementa C2.2 con sus pruebas». Incluye solo supervisión ficticia y
sesión de un solo uso; no clientes reales, destino permanente, commit o push.

El 2026-10-06 el usuario autorizó consolidar C2.1/C2.2 juntas: validar una
entrega aislada de 17 rutas, ajustar una referencia documental, registrar el
cierre y crear commit local. La autorización cubre solo pruebas con programas
Node propios y ficticios, sin clientes de IA, destino permanente ni push.
La evidencia de esta consolidación figura al final, separada de los cierres
históricos y sin cambiar las autorizaciones de C3.

Se propone avanzar por dependencia: **C2.1 almacenamiento**, después **C2.2
supervisor ficticio**. Cada entrega tiene revisión propia. Aprobar C2.1 no habilita
C2.2, clientes reales, inferencia o gasto. Este documento no elige una carpeta
privada permanente ni configura un servicio.

## Problema y comportamiento actual comprobado

[C1](../src/client-runtime-state.js) calcula un ledger nuevo y una propuesta
`compareAndSwap`: revisión y huella anterior deben coincidir antes del reemplazo.
No escribe ni bloquea archivos. Dos coordinadores pueden calcular propuestas
válidas sobre el mismo snapshot; quien persiste debe impedir aceptar ambas.

Antes de C2.1 no existía store o supervisor runtime. Ahora existen el store y
el supervisor de fixtures C2.2. [El parser B](../src/client-output-parser.js)
procesa capturas completas, no supervisa procesos ni inspecciona streams mientras
llegan. Los helpers de sincronización de notas tienen otro destino y protocolo:
no se reutilizan como prueba de exclusión o durabilidad de este runtime.

Inspección local: Node `v24.14.1`; el paquete declara Node `>=20`. Esta propuesta
no cambia esa declaración ni presume soporte operativo de C2 en todas las
versiones/plataformas que pueden ejecutar otras partes de Toolkit.

## Objetivo y fuera de alcance

Guardar el historial sin perder ni duplicar presupuesto y probar la supervisión
con scripts ficticios, controlados y sin conexión a IA. Ante incertidumbre,
conservar evidencia y bloquear, sin conceder otro intento.

Fuera de alcance: Codex/Claude reales, autenticación, red, API keys,
cuentas, créditos, inferencia, configuración global, Obsidian, código de proyectos,
Git, daemon, tareas programadas, comandos arbitrarios y almacenamiento de prompts
o transcripts. Tampoco incluye recuperación automática de bloqueos, compactación,
migración de ledgers o certificación de resistencia a un atacante local.

## Soporte y límites de confianza

La primera plataforma a verificar es **macOS local**, con la versión exacta de
Node usada en las pruebas. Linux y Windows quedan no admitidos hasta aportar
implementación y evidencia propias; no se extrapolan permisos o señales.
El store solo admite filesystem local evaluado, fuera de carpetas sincronizadas,
volúmenes de red y repositorios. `statfs` o un nombre de ruta no prueban por sí
solos que no exista sincronización: se necesita configuración de confianza.

Todos los escritores admitidos deben usar el mismo protocolo. El propietario
del directorio, el coordinador y las fixtures son de confianza. Se rechazan
archivos/rutas inseguros y se detectan cambios observables, pero no se promete
aislamiento frente a otro proceso malicioso del mismo usuario, un administrador,
reemplazos de ancestros o hardware que no cumpla las garantías evaluadas.

Esta limitación debe figurar en cada informe como alcance de evidencia, no
ocultarse con `verifiedAdmission: true`. C3 necesita su propia evaluación de
instalación, entorno, contención y consumo. Un JSON con `approved` no es una
autorización autenticada para lanzar clientes.

## C2.1: contrato de almacenamiento

El coordinador configura una raíz privada absoluta y una lista de ubicaciones
prohibidas; no se toman rutas desde el encargo o la respuesta del modelo.
Las pruebas usan directorios temporales creados expresamente para
datos ficticios. Un destino permanente necesita elección y permiso separados.

Dentro de la raíz se usa un directorio por clave SHA-256 canónica de
`projectId` y `taskId`, sin nombres derivados de rutas aportadas por el encargo.
La identidad original queda en el documento y debe coincidir al leer.

| Recurso privado | Contenido permitido |
| --- | --- |
| `ledger.json` | Versión de almacenamiento, identidad, huella canónica y ledger C1 |
| `write.lock` | Identificador opaco de propietario de transacción y versión del protocolo |
| Temporal propio | Próximo documento completo mientras se valida y publica |

Directorios `0700`; archivos `0600`. Comprobar propietario, tipo, permisos,
identidad del recurso abierto y ausencia de symlinks dentro del límite privado.
Rechazar archivos con enlaces duros adicionales, rutas de escape, componentes
sustituidos y archivos no regulares. No reparar permisos de recursos ajenos.
Los alias del sistema solo pueden resolverse al fijar la raíz de confianza;
no justifican seguir un symlink introducido después dentro de ella.

Documento estricto, UTF-8 válido, máximo **1 MiB** y un único objeto JSON sin
claves duplicadas. Su ledger conserva los límites C1 de 128 intentos y contadores
acotados. La huella comprueba contenido, no autoría. Inicializar exige snapshot
importado completo, historial conciliado y referencia de autorización/importación;
no genera un historial vacío por defecto. Un recurso existente no se reinicializa.

### Transacción y resultado verificable

La API recibe operaciones estructuradas, no recetas ejecutables:
inicializar, leer snapshot y aplicar transición C1. El store recalcula C1 dentro
de la sección exclusiva; no instala un `nextLedger` arbitrario del consumidor.

1. Validar configuración, entrada y límite privado antes de crear recursos.
2. Crear `write.lock` con apertura exclusiva y guardar su identidad y propietario
   opaco. Sin espera ni borrado de un bloqueo previo; responder `blocked`.
3. Sincronizar lock/directorio según el mecanismo evaluado; leer y validar el
   snapshot actual bajo el bloqueo. Contrastar revisión, huella e identidad.
4. Calcular la transición C1 usando el instante vigente obtenido por el store.
   Si ya expiró la evidencia o la propuesta no es válida, no escribir el ledger.
5. Crear temporal exclusivo en el mismo directorio, escribir íntegramente,
   sincronizar y validar de nuevo sus bytes, tipo, propietario y contenido.
6. Revalidar identidad de raíz, lock, temporal y snapshot anterior; publicar por
   sustitución evaluada, sincronizar directorio y confirmar el documento publicado.
7. Retirar solo recursos propios verificados y sincronizar la limpieza. Informar
   revisión/huellas, observación de escritura, durabilidad y estado de limpieza.

Comparación y publicación son exclusivas **entre escritores cooperantes**.
El store fija `now` en ambos niveles de la entrada C1 al evaluar la transacción;
no cambia fechas de evidencia, evaluación o permisos para hacerlos vigentes.
Si no puede obtener una hora UTC fiable o esta contradice el historial, bloquea.
Revalidar justo antes de publicar reduce carreras detectables; no es un CAS del
kernel contra editores ajenos. No presentar un `rename` como esa garantía.
Durante una lectura normal, un lock existente bloquea; una futura herramienta
de diagnóstico deberá distinguir inspección de autorización para reutilizar cupo.

| Estado del informe | Significado |
| --- | --- |
| `committed` | Documento publicado, durabilidad y cierre propio confirmados |
| `unchanged` | Operación sin nueva escritura; no concede permiso de arranque |
| `blocked` | Permiso, validación, cupo o exclusión impiden avanzar |
| `indeterminate` | No se puede confirmar publicación, durabilidad o cierre |

Separar `writeObservation` (`unchanged`, `replaced`, `unknown`) de
`durability` (`confirmed`, `unconfirmed`) y `cleanup` (`complete`,
`intervention-required`). Un error después de publicar puede haber cambiado el
archivo: jamás responder «no se escribió» sin comprobarlo ni restaurar la versión
anterior automáticamente. Ningún estado del store autoriza procesos.

La documentación de Node advierte que apertura exclusiva puede no funcionar en
filesystems de red, y que `sync()` depende del sistema/dispositivo. La propuesta
exige verificar el mecanismo local; no convierte una prueba de proceso interrumpido
en certificación de pérdida de energía. [Filesystem de Node](https://nodejs.org/docs/latest-v24.x/api/fs.html).

### Caídas, repetición y recuperación

| Punto de fallo | Tratamiento requerido |
| --- | --- |
| Antes de adquirir lock | Sin publicación; otro escritor conserva sus recursos |
| Lock adquirido, escritura incompleta | Lock/temporales abandonados bloquean; no se usan como permiso |
| Temporal sincronizado, publicación no confirmada | Conservar incertidumbre; inspección posterior no arranca nada |
| Publicado, sync de directorio fallido | Escritura posible/observada, durabilidad no confirmada; bloquear |
| Publicado, limpieza fallida | Conservar nuevo historial; no revertir ni retirar recursos sustituidos |
| Reserva durable, supervisor caído | Reserva retenida; no deducir ausencia de consumo de un PID o resultado faltante |

No robar locks por antigüedad, PID ausente o nombre coincidente. Repetir la misma
operación no debe duplicar el intento ni ejecutarlo de nuevo. Si el intento ya
existe, informar conflicto/no-op comprobado según la operación, sin otro consumo.
La primera entrega no proporciona un comando para forzar desbloqueo. Conciliar
consumo sigue exigiendo aprobación y evidencia C1; retirar un lock abandonado
necesita un procedimiento separado, no solo `settle`.

### API entregada de C2.1

| Archivo | Responsabilidad |
| --- | --- |
| [Esquema local](../schemas/agent-client-runtime-local.schema.json) | Configuración, autorización declarada, operaciones, documento e informe estrictos |
| [Store](../src/client-runtime-store.js) | Validación, exclusión, recalcular C1, publicación y clasificación de incertidumbre |
| [Recursos privados](../src/client-runtime-store-files.js) | IO acotado, identidad, permisos, sincronización y limpieza verificada |
| [Pruebas](../test/client-runtime-store.test.js) | Concurrencia, caídas, entradas hostiles y errores de IO |
| [Datos ficticios](../testing/runtime-store/fixture.js) | Ledger, configuración y evidencia exclusivamente de prueba |
| [Escritor controlado](../testing/runtime-store/writer.js) | Proceso Node independiente y barreras de ensayo; no es un supervisor de IA |

`createClientRuntimeStore(base, preference, adapter, runtime, local, configuration,
dependencies?)` recibe los cinco esquemas empaquetados como objetos: selección,
preferencia, adaptador, runtime C1 y runtime local. Devuelve `async store(input)`.
No descarga esquemas, instala paquetes, expone un comando CLI o inicia clientes.

La configuración de confianza fija `root`, `forbiddenRoots` y una evaluación local
con plataforma, versión exacta de Node, filesystem local no sincronizado y referencia
de evidencia. La comprobación automática admite solamente `darwin` y esa versión de
Node; las declaraciones sobre filesystem/sincronización deben verificarse fuera del
store. Se rechazan raíces dentro de repositorios/bóvedas detectables o que se solapen
con Toolkit y las ubicaciones prohibidas. Los ancestros no se convierten por ello en
un aislamiento de sistema operativo.

Las operaciones JSON son `initialize`, `read` y `apply`. Todas requieren identidad
de proyecto/tarea y autorización declarada vigente, específica para operación y
huella canónica de la raíz. `initialize` exige ledger importado explícito y referencia
coincidente; `apply` lleva una entrada C1 completa, revisión y huella esperadas.
No se aceptan `nextLedger`, comandos, rutas o dependencias ejecutables en ese JSON.
Un `approved` aportado por el operador no autentica al usuario ni autoriza un proceso.

`dependencies` es una interfaz interna de confianza para pruebas: reloj, IO y barreras
de fase. No se carga desde archivos de encargos ni resultados del modelo. Sin ella,
el store usa las APIs locales de Node y el reloj actual. Las pruebas usan un reloj
ficticio fijo; nunca refrescan evidencia de cuentas/modelos reales.

La lectura también adquiere y limpia un lock: `unchanged` significa que no escribió
**el ledger**, no que no realizó IO. Devuelve snapshot y huella, sin acreditar nueva
durabilidad (`unconfirmed`). `committed` exige publicación, sincronización, lectura
de confirmación y limpieza completa. `blocked` e `indeterminate` no devuelven snapshot
utilizable como autorización. Todos conservan `executed`, `nativeExecuted`,
`runtimeReady` y `verifiedAdmission` en `false`.

La propuesta C1 se recalcula con hora actual antes de publicar. Si el cambio de
segundo modifica el próximo ledger, responde `store-publication-time-changed` y
conserva el anterior: no reintenta ni instala una propuesta temporalmente distinta.
Un temporal residual bloquea con `store-residual-resource`; un lock previo con
`store-locked`. Ambos requieren intervención, sin borrado automático.

`durability: confirmed` indica que terminó la sincronización evaluada tras publicar;
no certifica corte eléctrico, hardware o contenido que un editor ajeno altere después.
Un fallo de lectura puede dejar `writeObservation: unknown` aunque la sincronización
haya terminado. Un fallo de limpieza/cierre devuelve `indeterminate`, incluso cuando
el nuevo documento se observó y sincronizó. Nunca se revierte para ocultar el cambio.

## C2.2: supervisor limitado a fixtures

C2.2 se implementa después de verificar C2.1 y recibir su autorización separada.
El registro empaquetado
selecciona una fixture por identificador cerrado. Ejecutable Node y scripts
controlados se resuelven desde configuración de confianza, no desde el encargo.
Rechazar comandos, argumentos, shell, módulos o rutas arbitrarios. No reutilizar
los nombres de fixtures como una lista de clientes reales autorizados.

El hijo usa `spawn` sin shell, pipes separados, cwd temporal privado y entorno
permitido mínimo. No hereda credenciales, variables de inyección o configuración
de clientes; no redefine `HOME`/`CODEX_HOME`. Texto de prueba por stdin, nunca
por argumentos o logs. Las fixtures no hacen red, leen proyectos ni llaman IA.
Esto limita el comportamiento de scripts de confianza, **no es un sandbox**.

### Un solo arranque y observaciones separadas

El coordinador adquiere una sesión exclusiva del store, valida permiso de prueba,
reserva y confirma durabilidad **antes** del intento de spawn. La sesión conserva
el lock hasta cerrar o declarar incertidumbre. El supervisor recibe un handle
interno de un solo uso ligado a sesión, intento y snapshot; no acepta una captura
JSON `committed` como permiso ni puede reconstruir el handle tras un reinicio.
La confirmación interna de reserva durable con lock retenido no se etiqueta como
`committed` público: ese estado del store exige además cerrar su transacción.
El contrato de sesión será parte de C2.2 y no se incorpora implícitamente a C2.1.

Secuencia: reservar durable → comprobar handle vigente → intentar spawn una vez
→ registrar arranque observado → supervisar → conciliar observaciones suficientes
→ cerrar sesión. Este flujo no cambia el carácter declarado de C1. Si guardar
`mark-started` falla después del spawn, cancelar el grupo propio y conservar
la incertidumbre: no fingir que no arrancó. Una caída deja lock y reserva retenidos.

La contabilidad distingue procesos ficticios, tiempo medido y llamadas de IA.
Estas últimas son **cero**, respaldadas por el alcance de fixtures controladas;
no usar «un spawn = una llamada al modelo». La reserva sigue siendo ficticia y
no se importa a un presupuesto real. Los permisos de conciliación de las pruebas
son evidencia ficticia explícita; el cierre local no aprueba consumo nativo C3.

### Plazos y límites incrementales

Usar tiempo monotónico para duración y UTC actual solo para vigencia de evidencia.
El plazo cubre preparación posterior a reserva, stdin, respuesta y terminación;
no se reinicia al recibir datos. Reservar dentro de ese plazo la gracia de
cancelación y confirmación, comenzando la cancelación antes del límite final.
Un event loop bloqueado o una terminación tardía se informa como exceso/incertidumbre,
no se oculta ni se promete un límite duro del sistema operativo.
Node documenta un reloj de intervalos independiente de la hora del día.
[Reloj de Node](https://nodejs.org/docs/latest-v24.x/api/process.html#processhrtimebigint).

Vigilar durante lectura bytes stdout/stderr, línea en bytes, eventos, codificación
y estado del protocolo ficticio. Aplicar límites antes de retener chunks; tratar
UTF-8 y CRLF divididos entre chunks, líneas sin newline y salida posterior al
terminal. Límites no se amplían para salvar una respuesta. Los parsers B siguen
offline: no se declaran incrementales ni certificados para clientes reales.

Los fixtures tendrán un protocolo propio estricto con inicio, final único y
eventos admitidos. Evento desconocido, ejecución solicitada, salida malformada,
exceso, cancelación, timeout y error de pipe activan cancelación. No imprimir
stdout/stderr bruto; conservar solo captura acotada en memoria privada si es
necesaria para la prueba. Nada se persiste en transcripts por defecto.

### Terminación y descendientes

En macOS se propone un grupo de procesos dedicado con fixtures que permanecen
en él. No usar `unref`; mantener seguimiento de proceso, pipes y grupo propio.
Enviar terminación suave, después forzada dentro del plazo y confirmar el alcance
ensayado. No señalar PIDs encontrados posteriormente ni reutilizar identidades
sin vincularlas al intento vivo: existe riesgo de reutilización de PID.

`exit`, cierre de pipes y entrega de una señal son observaciones diferentes;
`killed` no demuestra terminación. Node documenta esa diferencia y grupos separados
en plataformas no Windows. [Procesos hijos de Node](https://nodejs.org/api/child_process.html).

Un grupo de procesos no contiene descendientes que escapen a otra sesión. C2
solo puede confirmar el grupo ficticio controlado; si el mecanismo o alcance
quedan inciertos, emitir `indeterminate`, retener reserva y exigir intervención.
Los tests que simulen escape/incertidumbre usarán supervisión externa del harness
para limpiar exclusivamente sus procesos propios; no dejar huérfanos reales.
C3 no hereda garantías sobre procesos arbitrarios de este experimento.

Informe público mínimo: `fixture-only`, identidad acotada del intento, estado
local (`not-started`, `completed`, `failed`, `canceled`, `timed-out`,
`indeterminate`), observación de cierre/grupo, contadores y causas estáticas.
No contiene prompts, respuesta, entorno, rutas, cuentas, PID reutilizable,
razonamiento o errores nativos crudos. `nativeExecuted: false`,
`runtimeReady: false`, `verifiedAdmission: false`; ejecución ficticia se declara
por separado y no verifica modelo o esfuerzo. No reintenta ni abre otro cliente.

## Criterios de aceptación y pruebas previstas

| ID | Comprobación observable |
| --- | --- |
| C2-01 | Dos escritores reales sobre el último cupo: solo uno publica una reserva; el otro bloquea sin perder historia |
| C2-02 | Revisión/huella vieja, ledger corrupto o JSON duplicado no se publican ni conceden arranque |
| C2-03 | Ruta/symlink/hardlink/propietario/permisos incompatibles bloquean sin reparar o borrar recursos ajenos |
| C2-04 | Fallos inducidos en write/sync/rename/readback/cleanup distinguen escritura, durabilidad y limpieza |
| C2-05 | Caídas de un escritor en cada fase dejan estado viejo/nuevo íntegro o incertidumbre bloqueada; nunca reinicio del cupo |
| C2-06 | Repetición, lock abandonado y reserva previa no permiten arrancar dos veces el mismo intento |
| C2-07 | Ningún spawn ocurre antes de reserva durable o con un handle serializado, usado, inválido o perdido |
| C2-08 | Fixture silenciosa, stdin bloqueado, fallo, cancelación y timeout cierran dentro del margen ensayado o informan incertidumbre |
| C2-09 | Desbordes stdout/stderr/línea/eventos, UTF-8 partido y eventos prohibidos cancelan sin memoria/salida ilimitadas |
| C2-10 | Padre terminado con hijo/pipes activos no se da por finalizado; grupo propio controlado termina o queda bloqueo explícito |
| C2-11 | Fallo al registrar después del spawn conserva arranque posible/observado y consumo; no devuelve cupo automáticamente |
| C2-12 | Red/clientes nativos/credenciales/configuración/archivos de proyectos no se usan; informes omiten datos de prueba privados |
| C2-13 | C1 y A/B/selector conservan contratos y pruebas; otros proyectos, Obsidian e historial importado no cambian |

En pruebas concurrentes y de caídas usar procesos independientes y barreras
controladas; mocks solos no demuestran exclusión real. Los fallos de disco serán
inyectados además de pruebas locales de publicación; no simular corte eléctrico
como un hecho probado. Cada test tiene deadline externo y limpieza por identidad.

## Plan por dependencias

| Paso | Archivos entregados o futuros | Evidencia de cierre |
| --- | --- | --- |
| C2.1a: contrato y recursos privados | `schemas/agent-client-runtime-local.schema.json`, `src/client-runtime-store.js` | Rutas, permisos, importación y lecturas acotadas |
| C2.1b: transacción durable | Helpers del store y `test/client-runtime-store.test.js` | C2-01–06, fallos y concurrencia real |
| C2.2a: supervisor fixture | `src/client-runtime-supervisor.js`, `test/fixtures/runtime-local/` | C2-08–10 y 12, sin clientes reales |
| C2.2b: coordinación de sesión | Módulo de coordinación y pruebas de integración | C2-07, 11 y 13; reserva previa y único arranque |

Elección aprobada para C2.1: JSON estricto y exclusión local, por reutilización
de C1 y tamaño acotado. SQLite queda como alternativa si el mecanismo requerido
no puede verificarse o se necesitan más escritores; no se incorpora una dependencia
ni se promete una transacción equivalente sin diseñarla. Supervisor en proceso
del coordinador: no crear un daemon por defecto. macOS primero, sin soporte
multiplataforma aparente. El supervisor es diseño futuro: no se implementa en C2.1.
Esta aprobación de alcance no crea automáticamente un ADR de infraestructura.

Reversión: no integrar en la CLI hasta verificar cada paso; deshabilitar C2 no
borra ledgers o locks. Recursos temporales propios se limpian de forma controlada;
errores conservan evidencia. No bajar esquemas ni truncar historia para recuperar
compatibilidad. La recuperación operativa permanente queda para otra entrega.

## Fuentes y límites de investigación

Referencias oficiales consultadas el 2026-10-03: Node filesystem 24.x, proceso
24.x y child_process publicado 26.x. La referencia posterior no certifica Node
local `v24.14.1`: solo APIs documentadas antiguas aquí citadas orientan el diseño.
No se usarán APIs recientes sin revisar compatibilidad y probar la versión local.
Las páginas fijadas a `v24.14.1` y POSIX no fueron accesibles en esta consulta;
no se presentan como fuentes verificadas. Nada se descargó o instaló.

## Autorización de esta entrega y siguiente puerta

El usuario aprobó este diseño y autorizó **solo C2.1**, implementación y pruebas
de store con datos ficticios en directorios temporales propios. Incluye escritores
Node ficticios para comprobar concurrencia/caídas; no ejecución de modelos, cuentas,
red o clientes. No incluye commits, push, C2.2 ni destino privado permanente.

La evidencia de C2.1 se registra abajo. Una revisión documental o pruebas del store
no acreditan cancelación, aislamiento o ejecución nativa. C2.2 necesita aprobación
separada para supervisor ficticio, sesión de un solo uso y pruebas de procesos.

## Revisión documental previa a la implementación

Revisión del 2026-10-03 con `quality-gate`:

- Once enlaces locales resueltos y diez tablas consistentes entre esta propuesta
  y la especificación general de etapa C. Formato y newline final comprobados.
- `git diff --check` sin incidencias; índice Git vacío.
- Inventario previo de 130 archivos: solo se añadió esta propuesta y cambió el
  enlace al siguiente diseño en la especificación general; 129 huellas preservadas.
- Búsqueda de rutas personales y patrones evidentes de credenciales sin hallazgos
  en los dos documentos. No sustituye una auditoría exhaustiva de secretos.
- `node --test --test-reporter=spec test/client-runtime.test.js`: 171 pruebas C1
  pasan en el estado actual. La suite completa de 1 093 casos pertenece al cierre
  anterior; no se volvió a ejecutar para este cambio exclusivamente documental.

Resultado histórico: **Aprobado con observaciones como propuesta documental**. Pendientes entonces
la aprobación del usuario, contratos ejecutables y evidencia C2-01–13. SDD separó
los permisos de las dos entregas y quality-gate comprobó alcance y preservación;
ninguna observación se convierte en permiso para ejecutar o guardar datos reales.

No se modificaron archivos funcionales ni se iniciaron fixtures o clientes de IA.
No se crearon directorios privados, commits o push; cuentas, Obsidian, catálogos y
automatizaciones permanecen sin cambios.

## Cierre histórico de implementación C2.1

Revisión del **2026-10-03**, macOS (`darwin`), Node **v24.14.1**, con
`spec-driven-development` y `quality-gate`. Solo almacenamiento cooperante y datos
ficticios, en temporales propios; sin destino privado permanente ni integración CLI.

- `node --test --test-reporter=spec test/client-runtime-store.test.js`: **80 pruebas
  pasan**, cero fallos, cancelaciones, omisiones o pendientes; 24,7 segundos.
- `node --test --test-reporter=spec`: **1 173 pruebas pasan**, cero fallos,
  cancelaciones, omisiones o pendientes; 38,9 segundos. Incluye las 1 093 anteriores.
- Concurrencia mediante tres escritores Node independientes: uno reserva el último
  cupo, otro bloquea durante la exclusión y el tercero rechaza el snapshot obsoleto.
- Ocho caídas reales de escritores propios con `SIGKILL`, desde creación de lock
  hasta confirmación. El documento conserva revisión vieja o nueva íntegra y los
  recursos abandonados impiden continuar. No se ensayó pérdida de energía.
- Fallos inducidos de escritura parcial/nula, write, sync de temporal/directorio,
  rename antes/después de publicar, readback, unlink y close; sustitución de lock,
  temporal y directorio, permisos/propietario incompatibles y hardlink durante lectura.
- La ejecución ampliada intermedia tuvo cuatro cancelaciones por plazo y una
  expectativa incorrecta del inyector de cierre. Se corrigió el inyector para fallar
  al cerrar el escritor, no al cerrar la lectura previa. Una repetición enfocada de
  11 casos, la suite completa y los 80 casos finales pasaron; la ejecución intermedia
  no se presenta como aprobada ni se atribuyen sus demoras a una causa no verificada.
- `node --check` en los cinco archivos JavaScript nuevos; JSON válido; formato y
  newline final limpios en los ocho archivos de esta entrega. **17 enlaces locales**
  resueltos y **12 tablas** consistentes en los dos documentos.
- `git diff --check` limpio; índice vacío. De 131 archivos previos, cambiaron solo
  estas dos especificaciones; **129 huellas preservadas**. Se añadieron un esquema,
  dos módulos de producción, una suite y dos helpers de prueba.
- Sin rutas personales ni patrones evidentes de claves privadas en estos ocho
  archivos. Es una búsqueda acotada, no una auditoría exhaustiva de secretos.

| Criterios | Resultado dentro del alcance autorizado |
| --- | --- |
| C2-01–05 | Verificados para este store cooperante en la plataforma local; fallos de IO inducidos y caídas de proceso reales, no certificación de hardware |
| C2-06 | Repetición, bloqueo previo y reserva retenida verificados; la unicidad de spawn pertenece a C2.2 y sigue pendiente |
| C2-07–11 | Pendientes de C2.2: no hay supervisor, sesión/handle, streams, cancelación o contabilidad de procesos supervisados |
| C2-12 | Verificado para módulos del store y escritores ficticios: sin llamadas a IA/red y sin datos privados en informes; no certifica aislamiento de clientes |
| C2-13 | Regresión completa y preservación de archivos previos verificadas; historial importado no se reinicia ni trunca |

Resultado: **Aprobado con observaciones para C2.1**. Las observaciones delimitan
soporte macOS/versionado, declaración de filesystem local, exclusión cooperante,
vigencia del reloj y recuperación manual pendiente. SDD mantuvo separada C2.2;
quality-gate exigió concurrencia, errores de IO, caídas y regresión antes del cierre.

No se ejecutaron Codex, Claude o Gemini, ni se conectaron cuentas o credenciales.
No se modificaron proyectos, Obsidian, configuraciones de clientes, automatizaciones
o catálogos. No hubo commit ni push en ese cierre. El siguiente paso entonces
era C2.2; su entrega autorizada se describe a continuación, sin inferencia real.

## Entrega C2.2: API y límites

Autorización del **2026-10-04**: implementación y pruebas con scripts ficticios.
Se mantiene el protocolo cooperante de C2.1; no se crea una raíz permanente,
un servicio o un comando nuevo en la CLI.

| Archivo | Responsabilidad |
| --- | --- |
| [Contrato fixture](../schemas/agent-client-runtime-fixture.schema.json) | Encargo e informes estrictos, registro cerrado y cero llamadas de IA |
| [Coordinador](../src/client-runtime-coordinator.js) | Validar permiso ficticio, reservar, supervisar y conciliar bajo el mismo lock |
| [Store](../src/client-runtime-store.js) | Sesión interna con bloqueo retenido y transiciones C1 durables |
| [Permiso interno](../src/client-runtime-fixture-permit.js) | Handle de un solo uso ligado al encargo, revocado al cerrar sesión |
| [Supervisor](../src/client-runtime-supervisor.js) | Node empaquetado sin shell, plazo, pipes separados y grupo propio |
| [Protocolo incremental](../src/client-runtime-fixture-protocol.js) | UTF-8/CRLF por bytes, claves/eventos estrictos y límites antes de acumular |
| [Pruebas](../test/client-runtime-supervisor.test.js) | Casos adversos, concurrencia, caídas y limpieza del harness |
| [Fixtures](../testing/runtime-supervisor/fixture.cjs) | 21 programas ficticios cerrados; no proyectos, red o clientes de IA |
| [Descendiente](../testing/runtime-supervisor/child.cjs) | Hijo controlado que permanece en el grupo del padre |
| [Worker](../testing/runtime-supervisor/coordinator-worker.js) | Coordinador independiente y barreras de caída; no un cliente real |
| [Datos del harness](../testing/runtime-supervisor/setup.js) | Permisos, ledger y reloj ficticios; no evidencia de cuentas reales |

`createFixtureCoordinator(base, preference, adapter, runtime, local, fixture,
configuration, dependencies?)` recibe los seis esquemas empaquetados y la
configuración local evaluada de C2.1. Devuelve `coordinate(input, { signal }?)`.
El AbortSignal y las dependencias de IO/reloj/procesos son de confianza en memoria;
no se cargan del JSON del encargo, de una respuesta o de recetas externas.

El encargo incluye `scope: fixture-only`, fixture, texto ficticio, límites,
reserva C1 y permiso separado de prueba/conciliación. Se exige vigencia, no
revocación y vinculación a identidad, intento, raíz, fixture y huella de límites.
Se revalida antes de reservar, antes del spawn y al conciliar, sin renovar fechas.
Un permiso declarado por el harness no autentica al usuario ni habilita C3.
Los ledgers ficticios no se importan a presupuestos o evaluaciones reales.

La interfaz JSON y los informes C2.1 no cambian. La nueva interfaz interna
`store.withFixtureSession(reservation, consumer, gate)` solo acepta código de
confianza, no una operación JSON ni un informe `committed`. Retiene el lock desde
la reserva durable hasta la conciliación. El handle vive en un WeakMap y se
consume antes de las comprobaciones asíncronas: copiarlo, usar otra huella de
encargo, repetirlo o perder la sesión bloquea, sin devolverlo automáticamente.
No es aislamiento contra código malicioso del mismo usuario o un consumidor interno
que fabrique callbacks: el coordinador y sus dependencias siguen siendo de confianza.

La sesión solo admite `mark-started`, `interrupt` y `settle` para el intento y
snapshot actuales. Las publicaciones comprueban autorización, revisión, recursos,
sincronización y lectura final. `committed` público exige además cerrar la
transacción; no etiqueta una reserva con lock retenido. Se esperan las escrituras
de observación en curso antes de cerrar descriptores o retornar. Una incertidumbre
conserva recursos e historial sin restaurarlos ni conceder otra ejecución.

El ejecutable Node y el script son empaquetados, no rutas o argumentos del JSON.
Se usa `spawn` sin shell, sin `execArgv` heredado, con entorno explícito de solo
`LANG` y `LC_ALL`. macOS puede añadir `__CF_USER_TEXT_ENCODING`, observado en esta
instalación y permitido por la fixture de entorno; no se heredan variables de
credenciales o inyección. No se cambian `HOME`, `CODEX_HOME` o cuentas.
El cwd temporal es privado, vacío y ajeno a proyectos; se limpia por dev/ino y
`rmdir`, no por borrado recursivo. Se retiene ante cierre/identidad inciertos.
Las fixtures solo usan stdin y scripts propios; una cierra su fd 0 para probar EPIPE.

### Protocolo, plazo e informe

El protocolo propio exige `start`, cero o más `data` y un único `end` con `ok: true`.
Cada objeto tiene versión 1 y claves exactas. Claves duplicadas, herramientas,
eventos desconocidos, UTF-8 inválido, texto posterior al terminal y final sin
newline se rechazan. Solo se retiene una línea acotada; payload y stderr se
descartan, sin guardar prompts, respuestas o transcripts. El parser B no cambia
ni se presenta como parser incremental de clientes reales.

Hay límites de stdin, stdout/stderr, línea y eventos. El plazo monotónico empieza
antes de la sesión, incluyendo reserva y preparación, sin reinicios al recibir
datos. Gracia SIGTERM y confirmación posterior a SIGKILL caben dentro del plazo.
IO, event loop y scheduler no ofrecen un deadline duro del sistema operativo:
demoras, escrituras pendientes o terminación tardía producen incertidumbre.
No se reintenta ni cambia de cliente, modelo o esfuerzo.

Se distinguen intento de spawn, arranque observado, `exit`, cierre de los tres
pipes, ausencia del grupo, tiempo y contabilidad. EPERM transitorio al sondear
algunos grupos en macOS no se interpreta como ausencia; se espera una observación
posterior de ESRCH. Una señal o el exit del padre no prueban por sí solos cierre.
Los descendientes ensayados permanecen en el grupo propio. El caso de alcance
incierto simula fallos de observación, sin crear un escape real ni dejar huérfanos.
No se certifican procesos arbitrarios o descendientes fuera del grupo.

El informe estricto solo contiene identidad acotada, estado local, contadores,
causas estáticas y resumen de persistencia: no ledger completo, rutas, PID,
payload, entorno o errores nativos. `fixtureExecuted` acredita únicamente el
script ficticio. `nativeExecuted`, `runtimeReady` y `verifiedAdmission` permanecen
en false y `modelCalls` en cero: no se equipara un proceso con una llamada al modelo.
El resultado público es una copia, sin mutaciones tardías de eventos del hijo.

Terminación confirmada puede coexistir con `indeterminate` si falla la observación
durable o el plazo. Se retienen lock/reserva. Solo una conciliación con evidencia
ficticia suficiente registra cero llamadas y tiempo medido, sin reiniciar historia.
Los tests de caída tras spawn/mark-started emplean un harness externo que mata
exclusivamente el grupo propio identificado al lanzarlo y limpia su cwd por identidad;
ese canal interno de prueba no forma parte del informe público.

Se contrastaron reloj monotónico y señal/terminación el 2026-10-04 en
[Node process 24.x](https://nodejs.org/docs/latest-v24.x/api/process.html#processhrtimebigint)
y [child_process publicado](https://nodejs.org/api/child_process.html).
La página child_process fijada a latest-v24.x no fue accesible; la publicada era
26.x. No acredita Node v24.14.1 local por sí sola: la evidencia procede de pruebas
en esa versión y macOS, no de extrapolar documentación, hardware o aislamiento.

## Verificación histórica de C2.2

Revisión del **2026-10-04** con `spec-driven-development` y `quality-gate`,
en macOS (`darwin`) y Node **v24.14.1**. El alcance es cooperante y ficticio:
ningún resultado certifica un cliente nativo, una suscripción o un sandbox.

- `node --test --test-reporter=spec test/client-runtime-supervisor.test.js`:
  **78 pruebas pasan**, cero fallos, cancelaciones, omisiones o pendientes;
  38,8 segundos. Incluye dos coordinadores independientes y tres caídas reales:
  tras reserva durable, tras spawn y tras confirmación de mark-started.
- `node --test --test-reporter=spec`: **1 251 pruebas pasan**, cero fallos,
  cancelaciones, omisiones o pendientes; 43,6 segundos. Incluye las 1 173 previas.
- La regresión C2.1 enfocada también pasó: **80 casos**, 24,2 segundos.
- Primera iteración de C2.2: cinco fallos en 61 casos. Se corrigió la espera del
  cierre de todos los pipes, se contempló la variable de codificación añadida por
  macOS y se distinguió el exit no exitoso del protocolo incompleto. Una repetición
  enfocada de siete casos pasó. Al ampliar a 73 casos quedó un fallo de la fixture
  EPIPE: `stdin.destroy()` no cerraba su fd 0 en esta instalación; ahora la fixture
  cierra explícitamente ese descriptor. Un error transitorio de sintaxis JSON del
  contrato ampliado se corrigió antes de la validación final. Los ensayos fallidos
  no se presentan como aprobados; los 78 casos y la regresión final son la evidencia.
- Casos de UTF-8/CRLF en todos los puntos de corte; límites stdout, stderr,
  línea/eventos; claves duplicadas, eventos prohibidos, fin incompleto o texto
  posterior al terminal; stdin cerrado/bloqueado, proceso silencioso, cancelación,
  SIGTERM ignorado, fallo de spawn síncrono/asíncrono y descendientes activos.
- Fallos de observación/publicación/conciliación/limpieza y escritura retrasada;
  no hay nuevas publicaciones una vez que retorna una sesión incierta.
  Handles falsos, serializados, revocados, simultáneos o ligados a otra huella
  no conceden arranque. Permiso expirado y lock sustituido tras reservar bloquean.
- La prueba de red instrumentó `http.request`, `https.request`, `net.connect`,
  `net.createConnection` y `fetch` del coordinador: **cero intentos**. Las fixtures
  empaquetadas y el entorno cerrado son el alcance adicional comprobado;
  no es certificación contra otro programa malicioso ni de contención del sistema.
- `node --check` en los diez JavaScript de la entrega; contrato JSON válido.
  `git diff --check` limpio. Formato/newline de **14 archivos**, **37 enlaces
  locales** resueltos y **18 tablas** consistentes, incluido este cierre.
- Inventario previo de **137 archivos**: solo cambiaron las tres especificaciones
  runtime/adaptadores y el store existente; **133 huellas preservadas**. Diez
  archivos nuevos: contrato, cuatro módulos, suite y cuatro helpers/fixtures.
  El índice Git sigue vacío; no se añadieron cambios previos ajenos a C2.2.
- Búsqueda acotada sin rutas personales ni patrones evidentes de claves privadas
  en estos 14 archivos; no sustituye una auditoría exhaustiva de secretos.

| Criterios | Evidencia y límites de esta entrega |
| --- | --- |
| C2-01–05 | Regresión C2.1 completa; dos coordinadores independientes y caídas propias conservan exclusión e historial |
| C2-06–07 | Arranque único, reserva durable previa, handle no transferible, permiso vigente y repetición bloqueada |
| C2-08–09 | Plazos, EPIPE, cancelación y señales; protocolo incremental acotado y eventos adversos rechazados |
| C2-10 | Exit del padre no sustituye cierre de pipes/grupo; descendientes controlados terminan o se informa incertidumbre |
| C2-11 | Fallos tras spawn/mark-started/settle no ocultan arranque ni permiten reiniciar cupo; locks/reservas retenidos |
| C2-12 | Cero IA, sin credenciales/herencia de entorno o lectura de proyectos; informes seguros, no sandbox certificado |
| C2-13 | 1 251 casos de regresión y preservación de archivos; CLI, otros proyectos, Obsidian e historia previa sin cambios |

Resultado: **Aprobado con observaciones para C2.2**. Las observaciones son límites
explícitos: macOS/Node evaluados, escritores y dependencias cooperantes, filesystem
local declarado, ausencia de deadline duro y recuperación manual de incertidumbre.
SDD delimitó la entrega; quality-gate exigió fallos adversos, procesos independientes,
caídas y regresión antes del cierre. No se eliminó un gate para aparentar ejecución nativa.

No se iniciaron Codex, Claude o Gemini, ni se conectaron cuentas/credenciales.
No se cambiaron suscripciones, créditos, catálogos privados, proyectos, Obsidian,
automatizaciones o configuración de clientes. **Sin commit ni push**.
La propuesta documental C3.1 (etapa separada) separa una base
offline de su contraste nativo. Sigue la revisión y, con permiso separado, evaluar una
instalación exacta y sus controles/efectos. Esa evaluación no autoriza por sí sola
inferencia, API keys, gasto adicional, aplicación de código o sincronización de notas.

## Cierre conjunto de la entrega local C2 — 2026-10-06

Resultado de quality-gate: **Aprobado con observaciones para el alcance
cooperante y ficticio de C2.1/C2.2**. No hay admisión de clientes nativos.
Las observaciones mantienen los límites de plataforma, filesystem declarado,
contención cooperante, plazo y recuperación manual ya descritos.

### Por qué se consolida como una entrega

El store actual incluye la sesión de fixtures de C2.2 y depende del permiso
interno de un solo uso. Separar solo C2.1 dejaría código compartido de sesión
sin su cobertura de supervisor. Se conserva la implementación tal como estaba,
sin inventar una variante funcional o modificar código para dividir commits.

El alcance contiene 17 rutas: este documento, dos contratos, seis módulos,
dos suites y seis helpers/fixtures. Ambos grupos de pruebas se verifican juntos.
Selector, A/B y C1 ya estaban versionados y permanecen intactos. C3/auth nativa,
rutas supervisadas de otros contratos, bóvedas, configuraciones y README
quedan fuera; no se crea una raíz permanente para usar el store.

### Evidencia independiente de Codex

Se extrajo la base versionada y se superpusieron únicamente las 17 rutas en
una copia temporal propia. Se reutilizaron dependencias instaladas, sin nuevas
instalaciones ni cambios en node_modules.

| Comprobación | Resultado observado |
| --- | --- |
| Regresión completa aislada | 1.598/1.598; exit 0; 67.851,014 ms |
| Fallos, canceladas, omitidas y pendientes | 0 |
| Cobertura incorporada | 1.440 previas + 80 store + 78 supervisor |
| Revisión previa C2 en el árbol local | 158/158; exit 0; 39.763,568 ms |
| Sintaxis individual | 14 node --check, todas exit 0 |
| Contratos | Ajv2020 strict compiló configuration/request/document/report del local y request/report del fixture |

```sh
node --test --test-concurrency=2 --test-reporter=spec
node --test --test-concurrency=2 --test-reporter=spec test/client-runtime-store.test.js test/client-runtime-supervisor.test.js
```

El primer comando pertenece a la copia aislada; el segundo, a la revisión
previa en el árbol local. No sumar ejecuciones repetidas como pruebas distintas.
Las suites crearon directorios temporales propios y arrancaron únicamente los
programas Node empaquetados. Sus caídas y señales afectaron a esos escritores,
fixtures y grupos propios, no a clientes de IA ni procesos de proyectos reales.

La matriz C2-01–C2-13 histórica queda respaldada por ambas suites en la misma
entrega: exclusión/snapshot, permisos/rutas, IO adversaria, publicación y limpieza,
reserva antes de arranque, handles ligados/de un uso, límites incrementales,
cancelación/descendientes, conservación de incertidumbre y cero llamadas a IA.
Los contadores modelCalls permanecen en cero; no representan una medición de
consumo de proveedores reales.

### Revisión final y límites

Después de las pruebas solo se ajustó este documento: se conserva la evidencia
histórica, se precisa la referencia a C3 fuera de alcance y se añade el cierre
actual. Código, contratos y tests conservan sus bytes probados.
Antes del commit se comprueban enlaces/formato, patrones sensibles limitados,
hashes finales de las 17 rutas, índice y preservación de trabajo ajeno.
El identificador de commit y la evidencia privada se registran por separado.

- Soporte observado: macOS local y Node v24.14.1. No certificación Linux/Windows,
  NFS, carpetas sincronizadas, pérdida de energía, hardware o resistencia a un
  atacante local con privilegios equivalentes.
- La sincronización terminada y la lectura posterior no garantizan que otros
  escritores ajenos respeten el protocolo; incertidumbre bloquea y no se oculta.
- El supervisor ejecuta fixtures cerradas con un entorno permitido, no comandos
  del encargo ni clientes reales. Probar cancelación local no prueba cancelación
  remota o gasto de una suscripción.
- No se conectó la biblioteca a una CLI nativa, se consultaron cuentas o se
  configuró una raíz de datos permanente. No hay cambios de MCP, Skills,
  automatizaciones, Obsidian, API/créditos o catálogos privados.
- La documentación externa conserva sus fechas históricas; no se extrapolan
  estos resultados a nuevas variantes, versiones o controles de clientes de IA.

Siguiente puerta: revisar por separado los expedientes y contratos de las etapas
posteriores. Cualquier evaluación o arranque nativo necesita permiso nuevo;
publicar el Toolkit tampoco queda autorizado por este cierre local.
