# N1-I — Invocación controlada del helper

## Estado, autorización y límites

Corrección y consolidación locales autorizadas el 2026-10-09 (America/Bogota):
rechazar argumentos de run antes de IO, acotar cada lectura al tamaño aprobado,
añadir regresiones, validar cinco rutas aisladas, ajustar esta nota, registrar
evidencia privada y crear commit local. Solo se ejecutan fixtures sintéticas;
no se incluye ejecutar el backend Core Foundation ni consultar preferencias
reales, iniciar clientes o hacer push.
El cierre actual se registra al final, separado de la evidencia histórica.

Implementado el 2026-10-05 (America/Bogota), tras «apruebo» al proponer preparar
la invocación y probar sus límites/terminación con datos ficticios.
Profundidad SDD: rigurosa. Se mantuvieron los requisitos ya definidos en
[N1](agent-client-managed-preferences-plan.md): helper propio, identidad fija,
entorno mínimo, una invocación, bytes/plazo acotados y permiso real separado.

Esta aprobación cubre código y pruebas con fuentes ficticias. No cubre ejecutar
el backend Core Foundation, consultar preferencias reales/cuentas, iniciar
clientes/modelos, instalar software, modificar configuración o hacer commit/push.
No se alteran IA-1/IA-2/SC-1/S3.2/C1/S1 para admitir esta operación.

## NI-01. API y permiso propio

`createManagedPreferencesInvocation(invocationSchema, preferencesSchema,
configuration, authorization, dependencies)` devuelve un objeto con `run()`.
Rechaza cualquier argumento explícito de run antes de IO/workspace/spawn,
incluso undefined, objetos o texto. No existe una opción dryRun: no se interpreta
ni ignora una petición para simular la ejecución. Un intento con argumentos
consume un permiso válido de un solo uso, sin inspeccionar ni publicar los valores.
No acepta texto de tarea, argv, aplicaciones/claves, entorno o rutas en run.
Esquemas/configuración/dependencias provienen exclusivamente de código confiable;
no se exponen a un modelo como un lanzador genérico.

`createManagedPreferencesInvocationPermit(configuration)` emite un handle opaco
de WeakMap, de un solo uso y con vigencia explícita. Su emisor **debe obtener
antes aprobación humana del lote**: la función no autentica consentimiento.
El hash solo vincula configuración, no lo crea. Handles serializados, proxies,
falsos, revocados, caducados, de otros contratos o de otra configuración bloquean
antes de cualquier IO/workspace/spawn. Dos instancias no reutilizan un permiso.

El permiso captura además HOME/UID actuales y el perfil de entorno mínimo.
HOME no se modifica para la invocación. La categoría de suscripción del usuario
no interviene ni se guarda aquí: se ejecuta un helper de metadata, no una IA.
`revokeManagedPreferencesInvocationPermit(handle)` permite retirar el permiso;
revocación/caducidad durante ejecución detienen el proceso propio.

La fuente esperada (`synthetic`/`core-foundation-claim`) forma parte del binding,
pero **no acredita por sí sola cómo se compiló el binario**. El orquestador
confiable debe fijar el artefacto aprobado y su origen de compilación antes del
permiso. No usar un header de stdout para decidir retrospectivamente si estaba
autorizado consultar datos reales. Las pruebas solo crean artefactos sintéticos.

## NI-02. Configuración y filesystem

| Parte | Datos exigidos | Comprobación |
| --- | --- | --- |
| Artefacto | Ruta física, dev/inode/UID/modo/tamaño, mtime/ctime y SHA-256 | Regular, un link, owner ejecutable, sin escritura de grupo/otros; hasta 8 MiB |
| Parent workspace | Ruta física, dev/inode/UID/modo | Directorio propio 0700, identidad fijada, sin ubicación sincronizada conocida o ancestro Git |
| Fuente | synthetic o core-foundation-claim | Coincide con el protocolo; no certifica comportamiento |
| Límites | Plazo, gracia/confirmación, bytes y vigencia del permiso | Sin defaults ocultos, coerción o extras |

Se leen solamente los bytes del helper aprobado para calcular su huella, con
O_RDONLY/O_NOFOLLOW y bloques de hasta 64 KiB. Cada petición queda acotada al
tamaño aprobado pendiente y al máximo de 8 MiB. Al alcanzar el tamaño aprobado
no se solicita un bloque extra para comprobar EOF; un cero prematuro bloquea
como truncado, y el contraste posterior de metadatos sigue rechazando crecimiento
o sustitución. No se abren settings, plists, keychain,
cache, recibos, transcripciones o fuentes de política para pinnear el helper.
Identidad, timestamps, huella y nombre se contrastan antes y después de ejecutar.
Una diferencia elimina la proyección incluso si el programa devolvió JSON válido.

Se crea un único workspace vacío propio 0700 bajo el parent aprobado. Solo se
retira con rmdir tras confirmar terminación y revalidar identidades. Si contiene
residuos, fue sustituido o no se confirma terminación, se conserva y se informa
`cleanupRequired`; no hay borrado recursivo, reparación o terminación de procesos
ajenos. El informe público no incluye rutas/UID/inodes/hashes ni errores crudos.

**Límite de garantía:** checks de paths/pins no son un sandbox openat/fexecve ni
un bloqueo atómico del namespace. No impiden universalmente que un owner hostil
cambie/restaure nombres entre comprobaciones. Se asumen orquestación confiable y
artefactos propios cooperativos; una detección posterior no deshace efectos.
Tampoco se identifica una carpeta remota/sincronizada por todos los métodos
posibles. El parent debe aprobarse como local y privado, no por pasar un regex.

## NI-03. Receta y presupuesto

Receta fija: artefacto aprobado y **cero argumentos**, shell false, detached true,
cwd propio y stdin ignore (EOF). Solo HOME original, TMPDIR del workspace, PATH
del sistema, LANG/LC_ALL=C. Sin herencia de API keys, helpers, proveedores,
proxies, tracing o inyección de runtime. No cambia identidad o configuración.

| Recurso | Techo |
| --- | --- |
| Intentos de spawn | Uno; cero reintentos/fallback |
| Plazo total | Hasta 15 000 ms, incluye preparación/ejecución/revalidación/limpieza |
| Gracia/confirmación | Hasta 1 000 ms cada una, dentro del presupuesto |
| stdout/stderr | Hasta 32 KiB por canal; stderr no vacío detiene el lote |
| Vigencia del handle | Explícita, hasta una hora desde emisión; no renovable automáticamente |
| Artefacto leído | Hasta 8 MiB por verificación, solo binario aprobado |

El presupuesto reserva gracia/confirmación y exige margen antes del spawn.
Captura incremental: no se guardan stdout/stderr crudos. El decoder N1 produce
campos solo al finalizar; no hay proyección provisional con eventos de arranque.
Timeout, aborto, exceso de salida, error o permiso retirado envían SIGTERM y
después SIGKILL al grupo del proceso propio cuando procede. Sin señales globales
o IDs seleccionados por una salida del helper.

Completar stdout no basta: se exige exit, close, cierre de ambos canales y
observación de desaparición del grupo, además de post-pin. Si esa evidencia
falta o se supera el plazo, el estado es indeterminate y no devuelve campos.
Un descendiente en el grupo impide completar por el mero exit del padre.

No se prometen cancelación de operaciones internas del SO, memoria máxima dentro
de Core Foundation, proceso-tree containment universal o latencia dura de IO.
Timers no se ejecutan mientras el event loop está bloqueado; operaciones FS
pendientes no son canceladas por el clock. El resultado tardío conserva
incertidumbre. Un descendiente que escape de la sesión/grupo no queda certificado
por kill(0), y esta etapa no instala un sandbox para impedirlo.

## NI-04. Estados y verificación

Estados: blocked, completed, helper-failed, failed, canceled, timed-out o
indeterminate. Se distinguen spawnAttempts, helperStarted, pins antes/después,
terminationConfirmed, cleanupRequired y bytes/tiempo observados.

`helperExecutionVerified` solo puede ser true con salida válida, terminación,
pins/permiso y limpieza correctos. Significa que la invocación cumplió esas
comprobaciones bajo el alcance descrito, no prueba de aislamiento o de todas
las llamadas internas. La proyección del decoder conserva sus propios
indicadores false: por sí solo nunca verificó que se ejecutara un proceso.

`nativeClientStarted`, `inferenceRequested`, `runtimeReady`, `verifiedAdmission`,
`effectiveIsolationVerified`, `externalBillingVerified` y
`preferencesQueriedVerified` permanecen false. Decision: no-client-start.
Ningún informe emite permiso S3.2/S3.3, reserva de modelo o actualización de memoria.

## Entrega y criterios

| Archivo | Responsabilidad |
| --- | --- |
| [Contrato](../schemas/agent-client-managed-preferences-invocation.schema.json) | Configuración, pins, límites y report cerrados |
| [Invocación](../src/client-managed-preferences-invocation.js) | Permiso propio, checks, proceso/grupo, bytes/plazo y limpieza |
| [Fixture C](../testing/managed-preferences/invocation-fixture.c) | Adversarios de transporte sin APIs de preferencias reales |
| [Pruebas](../test/client-managed-preferences-invocation.test.js) | Permisos, bindings, fallos, cancelación, tiempo, salida y recursos |

1. Un permiso propio de un solo uso, sin aprobación fabricada por JSON/hash.
2. Identidad y origen fijados desde código confiable; pins antes/después sin secretos.
3. Receta/env/cwd/control de entrada cerrados, sin reintento o ampliación de alcance.
4. Presupuesto/aborto/revocación con campos retenidos solo tras cierre completo.
5. Desconocimiento de terminación/identidad/limpieza produce incertidumbre, no éxito.
6. Reporte cerrado y redactado; helper verificado no se convierte en cliente admitido.
7. Fixtures reales de proceso, no preferencias reales, y regresión de contratos previos.
8. Código/configuración/archivos ajenos preservados; sin Git o cambios de proyecto.

Las fuentes de Node distinguen spawn/exit/close y documentan detached en sistemas
POSIX. No se elevó killed o exit aislado a prueba de grupo desaparecido.
[Procesos hijos v24](https://nodejs.org/docs/latest-v24.x/api/child_process.html),
[Señales v24](https://nodejs.org/docs/latest-v24.x/api/process.html#processkillpid-signal).
Consulta: 2026-10-05; las pruebas locales fijan su propia versión instalada,
no asumen que coincida con la revisión menor más reciente publicada.

## Revisión y cierre históricos

Verificación: 2026-10-05 (America/Bogota), macOS arm64.

- Primera revisión de la fixture de grupo desconocido: se ajustó la simulación
  para no presentar ESRCH de una señal como falta de evidencia de desaparición.
  La fixture sigue terminándose realmente; solo simula evidencia insuficiente
  para el supervisor. No se cambiaron permisos del SO para fabricar ese caso.
- Batería propia final: **45/45**, cero fallos, canceladas, omitidas o pendientes.
  La cancelación temprana con confirmación desconocida cerró en 488 ms en la
  comprobación seleccionada; no es una garantía de latencia bajo bloqueo del SO.
- Regresión completa final: **2 699/2 699**, 95 422 ms, concurrencia dos,
  sin fallos, canceladas, omitidas o pendientes. No se ejecutaron cuentas,
  preferencias reales o clientes/modelos en las baterías.
- Casos: helper N1 compilado solo con backend sintético, fallos de transporte,
  permiso falso/serializado/revocado/caducado/reutilizado, config mutada,
  SHA/inode/UID/modo/tamaño/links y parent/Git, cambios posteriores del artefacto,
  stdout/exit discordantes, cancelación/revocación, descendientes, bytes y residuos.
- Se reservan y acotan gracia/confirmación dentro del plazo total. Sin prueba
  de grupo desaparecido no se devuelven campos ni se limpia un workspace incierto.
- Sintaxis/esquemas e informes cerrados comprobados. Dos documentos: 15 enlaces
  locales existentes, 9 tablas consistentes, formato correcto y espacios limpios.
- Preservación SHA-256: 205 de 206 archivos previos intactos; solo el documento
  N1 propio actualizado, cinco archivos nuevos y cero borrados. Temporales de
  fixtures retirados por identidad por el harness, sin borrar recursos del usuario.
  `git diff --check` limpio e índice sin staging. Escaneo limitado de patrones
  sensibles sin hallazgos; no es una certificación universal de privacidad.

| Criterio | Evidencia ejecutada |
| --- | --- |
| 1 | Permisos inválidos antes de IO, instancia/handle de un uso y concurrencia compartida |
| 2 | Pins y timestamp/huella, links/propietario/parent, cambio posterior sin campos |
| 3 | Spawn exacto vacío/sin shell, stdin EOF, HOME original y whitelist de entorno |
| 4 | Límites, abort/revoke, JSON/bytes discordantes y confirmación acotada |
| 5 | Grupo desconocido/residuo conserva indeterminate y cleanupRequired |
| 6 | Report schema, redacción y flags de admisión/clientes siempre false |
| 7 | C sin Core Foundation o N1 con backend falso; regresión completa |
| 8 | Huellas, diff/índice y archivos ajenos sin cambios |

Resultado de quality-gate: **Aprobado con observaciones para invocación y pruebas
con fixtures**. Las skills de especificación y calidad separaron permiso de
helper y admisión de cliente, y reforzaron pinning/bytes/confirmación. Persisten
los límites de confianza/cooperación, namespace no atómico, IO/event loop,
grupos de procesos y materialización de valores descritos anteriormente.

El siguiente lote real necesita aprobación separada de rutas/artefacto,
workspace, fuentes y tránsito temporal de datos posiblemente sensibles.
No se inició el backend real, leyó configuración/preferencias/cuentas,
modificó proyectos/Obsidian/automatizaciones, instaló software o hizo commit/push.
## Corrección y consolidación locales N1-I — 2026-10-09

Este cierre tiene autorización propia para corregir dos límites en la
invocación, añadir regresiones, validar cinco rutas de forma aislada, ajustar
esta nota, registrar evidencia privada y crear commit local. No ejecuta
preferencias reales ni clientes, no renueva una autorización nativa y no
incluye push.

### Correcciones verificadas

- `run(...args)` rechaza cualquier argumento explícito con
  `helper-input-forbidden` antes de IO/workspace/spawn. No interpreta
  `dryRun` ni inspecciona o publica el valor recibido. Con permiso válido,
  el intento lo consume: no puede reusarse para otra instancia o petición.
- La lectura del artefacto se limita en cada petición al menor de 64 KiB,
  tamaño aprobado restante y máximo de 8 MiB restante. Termina al completar
  el tamaño aprobado sin pedir un bloque centinela para EOF. Un cero prematuro
  bloquea; descriptor, nombre, huella y metadatos siguen revalidándose.

La prueba de crecimiento usa un pin inicial válido sobre datos ficticios:
tras leer exactamente 8 MiB, el descriptor simula un byte añadido. Se rechaza
el cambio por metadatos sin leer ese byte. También se comprueban tamaño estable
exacto, lecturas parciales y truncado, con cierre del descriptor. Esos casos
sustituyen IO/spawn; la prueba de pin válido se detiene deliberadamente antes
de crear un workspace, sin afirmar que completó una invocación.

| Comprobación | Resultado observado |
| --- | --- |
| Cinco regresiones nuevas contra código anterior | 0/5; cinco fallos esperados; salida 1; 171,325 ms |
| Suite específica tras corregir | 50/50; salida 0; 9 219,312833 ms |
| Regresión aislada: base versionada más cinco rutas N1-I | 3 052/3 052; salida 0; 171 018,156583 ms |
| Casos de la base / casos añadidos N1-I | 3 002 / 50 |
| Fallos, canceladas, omitidas y pendientes de baterías finales | 0 / 0 / 0 / 0 |
| Sintaxis y esquema | Dos node --check con salida 0; seis definiciones Ajv2020 estricto con dependencia N1 |
| Backend/helper de las pruebas N1-I | Solo C de transporte o N1 compilado con backend sintético, sin preferencias reales |

Comprobación: macOS arm64, Node `v24.14.1`. Regresión completa secuencial:
`node --test --test-concurrency=1 --test-reporter=spec`. No se modificaron
timeouts, omisiones o pruebas previas para hacerla pasar. La batería de la base
conserva la prueba N1 de compilación/enlace e inspección del backend real, sin
ejecutarlo. Ningún helper de producción o cliente IA se lanzó.

La copia contiene la base versionada y solo las cinco rutas N1-I. No incorpora
los otros borradores pendientes. Tras las pruebas solo cambió esta nota;
los otros cuatro archivos mantienen exactamente los bytes probados.

| Criterio N1-I | Evidencia y límites del cierre actual |
| --- | --- |
| 1: permiso propio | Rechazo de permisos falsos/serializados/revocados/caducados y consumo de un solo uso; argumentos explícitos bloqueados sin IO o trampas |
| 2: identidad y lectura | Pins/metadatos/links antes y después; cinco regresiones de frontera con lecturas acotadas y cierre, sin source promovida a prueba |
| 3: receta cerrada | Un spawn sin argv/shell, stdin ignorado, HOME original y entorno mínimo; sin petición de vista previa aceptada implícitamente |
| 4: presupuesto y cancelación | Bytes/plazo, abort/revoke, descendientes y discordancias de salida; no se modifican plazos para evitar fallos |
| 5: incertidumbre | Grupo, identidad o limpieza no confirmados descartan proyección y conservan cleanupRequired cuando corresponde |
| 6: sin admisión IA | no-client-start y flags nativos/admisión/facturación negativos; verificación del helper sintético distinta del decoder y de preferencias reales |
| 7: pruebas | C con backend falso, cinco regresiones reproducidas antes/cubiertas después, 50 casos propios y 3 052 aislados |
| 8: preservación | Cinco rutas exactas; solo módulo, prueba y nota ajustados; otros archivos conservados; commit local con permiso propio, sin push |

Resultado de quality-gate: **Aprobado con observaciones para corrección y
consolidación local de N1-I**. Se resolvieron los dos límites detectados,
sin modificar guards de admisión, configuración, preferencias o recetas.

La orquestación, esquemas/configuración y dependencias son de confianza.
Los pins/rutas son comprobaciones cooperativas, no un bloqueo atómico del
namespace. Grupo desaparecido no certifica contención de descendientes
desvinculados. Plazos locales no cancelan mágicamente IO bloqueado o un event
loop ocupado. Source y salida válidas no autentican cómo se compiló un
artefacto ni acreditan preferencias consultadas o aislamiento efectivo.

Los resultados de pruebas con datos ficticios no son observaciones reales.
Las fuentes externas conservan fecha histórica, sin consultas nuevas.
Sin preferencias/configuración/credenciales o cuentas reales, clientes,
prompts, cambios a proyectos/Obsidian/catálogos/conexiones/automatizaciones
o push. Un lote real del helper necesita aprobación propia de artefacto,
rutas/workspace, efectos y tránsito temporal de valores posiblemente sensibles.
