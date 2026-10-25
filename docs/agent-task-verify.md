# TV-1 — Comprobar huellas y alcance de una entrega manual

## Estado, objetivo y autorización

Especificación preparada el 2026-10-06 (America/Bogota), tras «apruebo» a
incorporar a la herramienta la comprobación de huellas y alcance usada en el
piloto manual del README. Profundidad SDD: rigurosa por lecturas de archivos,
contexto privado y riesgo de confundir coincidencia con aprobación.
Estado actual: **base local TV-1 implementada y revisada** el 2026-10-06.
Claude propuso, Codex revisó, Gemini aplicó con autorización explícita y Codex
verificó el resultado real. El usuario autorizó registrar este cierre documental.
La evidencia y los límites actuales están en [TV-13](#tv-13-cierre-de-la-base-local).
No se ha creado commit ni publicado esta entrega; la ejecución automática de
otras IA y la admisión nativa AD/S3.2 siguen fuera de este cierre.

Objetivo: comprobar mecánicamente un conjunto explícito de archivos antes o
después de una entrega. La coincidencia de bytes sirve como evidencia para el
revisor; no certifica corrección del código, pruebas, consentimiento o identidad
del modelo. No ejecutar los checks escritos por un agente para «verificarlo».

## TV-01. Estado real y problema

[agent-task prepare](agent-task-prepare.md) ya reúne un borrador manual, pero no
comprueba la base real del proyecto. En el piloto se hicieron manualmente:
comparación de huellas, preservación de fuentes y contraste del README aplicado
con el resultado esperado. Esto consume trabajo repetido del coordinador.

La operación tiene contrato propio. No da por fiable una afirmación de
un agente del tipo «todo coincide», ni usará un JSON recibido como permiso.
No cambiará los gates de autenticación (etapa separada, no incluida en esta entrega), la
selección de modelos o el comportamiento de prepare para hacer pasar una tarea.

## TV-02. Primera base y exclusiones

Incluido en la base local implementada:

1. Contrato cerrado de expectativas por archivo y de reporte de observaciones.
2. Núcleo puro que compara observaciones con expectativas, sin IO.
3. Recolector de solo lectura con raíces y archivos delimitados por la invocación.
4. Operación CLI verify dentro del bin local agent-task, sin instalación global.
5. Fixtures/pruebas sin cuentas, agentes o proyectos reales; guía de uso.

Fuera de alcance: escribir/aplicar archivos, generar snapshots recursivos,
descubrir cambios no enumerados, ejecutar agentes/IA/checks/tests/shell/Git,
leer .git o inferir rama/HEAD, red/cuentas/credenciales, firmas de aprobación,
selección de modelos, edición de memoria, automatizaciones, commit/push/PR,
instalación, dependencias nuevas y modificación del código de otros proyectos.
No verificar automáticamente el piloto privado anterior ni copiar sus datos a
los ejemplos de la biblioteca. Su cierre conserva su evidencia histórica.

## TV-03. Interfaz local disponible

```text
agent-task verify --contract <json> --expect <sha256> --source <raíz> --handoff <raíz> --phase before
agent-task verify --contract <json> --expect <sha256> --source <raíz> --handoff <raíz> --phase after --json
agent-task verify --help
```

Acceso local con `node bin/agent-task.js verify ...`, desde la raíz del Toolkit.
Las formas cortas de arriba describen el bin; no implican instalación global.
Los cinco parámetros son explícitos y obligatorios; rechazar duplicados,
posicionales, abreviaciones, valores ambiguos, opciones desconocidas o ausentes.
--expect vincula los **bytes** del contrato revisado; no se lee de su propio
contenido ni se calcula automáticamente para fingir que estaba aprobado.
Un hash aportado por el mismo agente sigue sin acreditar consentimiento humano.

--source y --handoff eligen las raíces físicas desde la invocación, no desde
campos del contrato. No --apply, --approve, --run, --force, --fix, --output,
archivos por stdin o rutas adicionales implícitas. --json mantiene el mismo
resumen que texto, sin cuerpos de archivos. Ayuda sin leer inputs o raíces.

Exit 0: matched o ayuda; 1: mismatched; 2: invalid/blocked, lectura/salida fallida.
No reintento o fallback. Un error de stdout/pipe puede haber emitido parte de la
salida: no prometer atomicidad del terminal, revertir logs o repetir la lectura.

## TV-04. Contrato de expectativas

Versión propia 1.0.0; no reutilizar request del selector como contrato de verificación.

| Campo | Contenido y significado |
| --- | --- |
| kind/schemaVersion | Identidad y versión cerradas del contrato |
| identity | projectId/taskId/revision de una entrega, sin identidad de cuenta |
| scope | Constante listed-files-only; nunca complete-tree |
| entries | Lista de archivos con ID único, root source/handoff, path relativo, operación y hashes before/after |

Máximo 128 entradas. IDs acotados y rutas exactas relativas; sin glob, dot
segments, .., rutas absolutas, barras inversas, caracteres de control/bidi o
colisiones de case/Unicode NFC. Sin referencias descargables, scripts, includes,
symlinks, credenciales, claves o directorios de configuración de clientes.

Cada entrada declara inspect/modify/create/delete, pero esas palabras son
**expectativas**, no instrucciones para realizar la operación:

| Operación declarada | before | after |
| --- | --- | --- |
| inspect/proteger | SHA-256 | El mismo SHA-256 |
| modify | SHA-256 | SHA-256 del resultado exacto esperado |
| create | null: debe estar ausente | SHA-256 |
| delete | SHA-256 | null: debe estar ausente |

Las huellas son SHA-256 de bytes, no JSON canónico, SHA de HEAD o firmas.
No permitir omitir expectativas ni comodines como «cualquier hash». Un fichero
vacío puede tener hash válido; null significa ausencia, no tamaño cero.
Modificar con iguales hashes no requiere inventar un cambio: se informa como
expectativa sin delta, sin elevarla a aprobación de una implementación.

La expectativa after debe venir de un resultado previamente revisado, no del
archivo terminado observado durante verify. Si se copia el hash actual de una
entrega incorrecta al contrato, la herramienta podría encontrar coincidencia:
no puede resolver la confianza semántica o humana del contrato por sí sola.

El contrato enumera tanto destinos previstos como archivos protegidos relevantes
y artefactos de propuesta/revisión. No basta una huella de README para afirmar
que todo un repositorio está intacto. Archivos no listados quedan desconocidos.

## TV-05. Secuencia de recolección de solo lectura

1. Validar argumentos y nombres de rutas sin leer contenido adicional.
2. Comprobar los componentes físicos del contrato explícito y leer sus bytes
   con límites y checks de identidad; comparar SHA-256 contra --expect antes
   del parser, comprobaciones de raíces y lectura de entradas. Error/huella
   distinta: blocked. Si el contrato vive dentro de source/handoff, sus propios
   componentes y bytes son la única excepción previa al pin; no se abren otras
   entradas ni rutas referenciadas por el JSON.
3. Validar contrato cerrado, Unicode/duplicados/números, IDs, paths y coherencia
   de operaciones. Un contrato inválido tampoco habilita lecturas de sus entradas.
4. Comprobar raíces explícitas normalizadas/físicas, directorios del usuario y
   no escribibles por otros. handoff debe ser privado 0700; no usar raíz de disco,
   HOME exacto, .git/.obsidian/.claude/.codex/.gemini o almacenes de credenciales.
   Las dos raíces deben ser distintas y no contenerse mutuamente.
5. Resolver cada root/path únicamente dentro de la raíz elegida; comprobar cada
   componente con lstat, sin seguir symlinks ni leer archivos referenciados dentro
   de contenidos. No recorrer directorios o cargar configuraciones automáticamente.
6. Si la expectativa de la fase es null, lstat seguro de la ruta: ENOENT confirma
   ausencia observada; EACCES/EPERM/errores/desconocimiento no equivalen a ausencia.
   Un archivo presente se informa como inesperado sin abrir su contenido.
7. Si se espera hash y existe un archivo seguro, abrir solo lectura con NOFOLLOW/
   NONBLOCK, comparar stat antes/handle/después y hash por bloques de 64 KiB;
   comprobar identidad, tipo, UID, nlink, modo, tamaño y mtime/ctime estables.
   Revalidar componentes/raíces tras las lecturas; cerrar todos los descriptores.
8. Evaluar observaciones completas, componer reporte acotado y devolverlo. No
   guardar recibos automáticamente ni alterar contrato o expectativas.

El archivo regular debe pertenecer al usuario, sin hardlinks ni permisos especiales
o escritura de grupo/otros. Rechazar dispositivos, sockets, FIFO, symlinks y
cambios concurrentes detectados. Ante un límite o recurso inseguro, bloquear
sin devolver un resultado positivo parcial para el conjunto.
Los directorios intermedios que falten en una ruta segura dan ausencia observada;
un enlace o componente inseguro no. No abrir contenido fuera de alcance para
averiguar si una ruta «en realidad» existe.

Cada lectura representa una observación durante su comprobación, no una
transacción simultánea de todos los archivos. No prometer que nunca cambiarán
después, contención atómica del namespace, locking de editores o captura de todas
las operaciones del ejecutor. Conviene detener escritores concurrentes durante
la comprobación. Ausencia de modificación de bytes no prueba autoría de un agente.

## TV-06. Núcleo, estados y límites de lo verificado

API implementada: `createTaskVerifier(trustedSchema)` devuelve
`evaluate({ contract, phase, observations })`. El esquema es empaquetado/confiable,
no obtenido del contrato. Datos JSON inertes acotados; entrada/salida cerradas.
El núcleo no obtiene archivos, reloj, aleatoriedad, red, procesos o modelos.

Estados del reporte:

- matched: todas las entradas observadas de esa fase coinciden.
- mismatched: observaciones seguras/completas, pero falta un archivo esperado,
  aparece uno que debería estar ausente o cambia su hash.
- blocked: pin no coincide, recurso inseguro/cambiado, error de lectura o límite;
  no certificar el resto por una recolección incompleta.
- invalid: forma/versiones/IDs/expectativas contradictorias o fase inválida.

Por entrada: ID, raíz lógica, resultado y hashes esperado/observado cuando
procedan. No cuerpos de archivos, stack, error del SO, rutas absolutas de roots,
cuentas o contenido de propiedades desconocidas. Comparar exactamente un registro
por cada ID del contrato; duplicados/faltantes/sobrantes invalidan el núcleo.
Las observaciones de un llamador son declaraciones: el resultado puro no prueba
que se leyeran archivos; solo la capa IO puede etiquetar su procedencia como lectura
local comprobada, con sus límites. Nunca aceptar JSON de observaciones por CLI
como si hubiera sido esa lectura real.

Reportar explícitamente:

- scopeCoverage: listed-files-only; unlistedChangesVerified false.
- contentQualityVerified, testsExecuted, permissionVerified, approvalGranted,
  gitStateVerified, modelVerified, nativeAdmission y runtimeReady: false.
- wrote, sent y executed: false; no se ejecutan órdenes de los archivos.
- humanReviewRequired: true, incluso cuando state es matched.

Identidad de tarea, fase y audit vinculan el reporte al contrato: hash canónico
del objeto y hash de sus bytes leídos por CLI, diferenciados. Ninguno certifica
aprobación. No inferir fechas de pruebas, métricas de modelos o eficacia del código
de un hash. No derivar expectedAfter o autorizar el siguiente paso por matched.

## TV-07. Privacidad y recursos

La capa IO retiene buffers acotados para hashing, sin reconstruir textos de los
archivos observados ni guardarlos. El contrato JSON sí se decodifica. Eso no
promete borrado forense del runtime/SO, ausencia de contenido sensible en un
archivo de nombre inocuo o anonimización de hashes/IDs. Las rutas de credenciales
conocidas se rechazan, pero un hash de contenido no es un detector de secretos.

Texto y --json muestran la misma proyección acotada de fase/estado/IDs/motivos
y resultados. No imprimir rutas físicas del sistema o error/payload crudo.
No --details o exportación de contenido en esta primera base. Los IDs/hashes
pueden ser privados: stdout, scrollback y redirecciones los controla el usuario.

| Recurso | Techo de la base local |
| --- | --- |
| Contrato JSON | 512 KiB, 30.000 nodos, profundidad 32, arrays de 256, texto acotado a 2.000.000 bytes |
| Entradas observadas | 1–128, sin descubrimiento recursivo |
| Archivo a hashear | 8 MiB por archivo, incluido vacío; 32 MiB total por invocación |
| Buffer de lectura | 64 KiB, no copia completa de un archivo observado |
| Reporte/terminal | 128 KiB; sin truncado ni resultado parcial positivo |
| Escritura/procesos/red | Ninguno; sin retries/fallback |

La primera capa IO se diseña para macOS/Linux con identidad POSIX; Windows queda
sin soporte equivalente hasta diseñar/probar su contrato. No instalar alternativas
para superar un rechazo. No se promete plazo duro o cancelación universal de IO
del SO. El presupuesto de bytes/comprobaciones no garantiza costo cero o rapidez
independiente del dispositivo.

## TV-08. Integración y compatibilidad

Mantener prepare y project-memory intactos salvo el dispatch/help específico
del nuevo subcomando en src/task-cli.js. No importar runtime/adaptadores,
conexiones o CLI de memoria para verificar. No invocar el selector ni leer
esquemas/catalogos/cuentas de modelos para comprobar hashes.

Reutilización candidata: parser/copia JSON inerte y checks de solo lectura de
[task-prepare-files.js](../src/task-prepare-files.js),
[client-output-json.js](../src/client-output-json.js) y
[sensitive-data.js](../src/sensitive-data.js), sin debilitar consumidores previos.
Si la reutilización exige cambiar una API o refactor mayor, proponerlo aparte;
no ampliar esa superficie como efecto secundario de este diseño.

No sustituir el cierre de calidad humano ni las plantillas históricas de traspaso.
No generar instrucciones para que un receptor se autoapruebe a partir del reporte.
Un futuro snapshot completo o persistencia de recibos requiere otro alcance,
permisos de lectura/escritura y presupuesto; no prometerlos en esta etapa.

## TV-09. Plan y uso del equipo

| Etapa | Resultado | Rutas probables |
| --- | --- | --- |
| TV-A | Contratos cerrados y ejemplos ficticios before/after | schemas/agent-task-verify.schema.json, examples/task-verify/ |
| TV-B | Evaluador puro y casos adversarios | src/task-verify.js, test/task-verify.test.js |
| TV-C | Recolección por raíz/archivo y CLI readonly | src/task-verify-files.js, src/task-cli.js, test/task-verify-cli.test.js |
| TV-D | Regresión, preservación y documentación | Este documento, docs/uso.md y ayuda de agent-task |

Recorrido realizado: Claude preparó la propuesta de implementación acotada;
Codex revisó r01/r02; Gemini aplicó r02 con permiso explícito; Codex verificó
código y tests reales. Encargos privados y mensajes directos se prepararon por
separado. Las etapas TV-A a TV-D quedan cerradas para esta base local.
Este documento no se envía automáticamente ni concede escritura a esos agentes.

No pedir aprobación por cada operación normal de una etapa ya autorizada.
Una aprobación del diseño no autoriza por sí sola aplicar código, publicar,
crear credenciales, arrancar clientes o ejecutar pruebas de cuentas. Reversión
futura: únicamente archivos propios de TV y dispatch añadido, conservando el
resto de trabajo; nunca resetear repositorios o borrar encargos privados.

## TV-10. Criterios de aceptación

| ID | Comprobación requerida con fixtures |
| --- | --- |
| CA-V01 | CLI exige raíces/contrato/pin/fase exactos; help sin IO y sin opciones de escritura |
| CA-V02 | Parser estricto: duplicados, Unicode, números, objetos no JSON, propiedades desconocidas y límites |
| CA-V03 | Pin distinto/contrato inválido impiden leer entradas; solo el contrato explícito y sus componentes pueden tocarse antes del pin |
| CA-V04 | before/after para inspect/modify/create/delete, hashes y ausencias sin inferir operaciones |
| CA-V05 | Roots/path físicos, confinados y explícitos; colisiones case/NFC, .., symlinks y credenciales rechazados |
| CA-V06 | Metadata/descriptor/hash por bloques, cambios de recurso, permisos, owner, hardlinks y especiales |
| CA-V07 | ENOENT seguro es ausencia; permisos/errores/raíces inseguras nunca se elevan a ausencia |
| CA-V08 | Núcleo determinista, entradas congeladas; registros exactos por ID y procedencia declarada/local separadas |
| CA-V09 | matched solo significa archivos listados; no aprobar calidad, tests, Git, modelos o permiso |
| CA-V10 | Caps de archivo/total/salida, cierre de descriptores, EPIPE, sin contenido o errores privados |
| CA-V11 | Sin Git/shell/red/clientes/escrituras; ni scripts/comandos presentes en contrato o archivos |
| CA-V12 | prepare, project-memory y gates anteriores sin regresión; ejemplos genéricos y preservación |

La evidencia de estos criterios se registra en TV-13. Son criterios de calidad
de la implementación, no garantías que un reporte matched pueda certificar.
El piloto documental previo no sustituye tests de TV-B/C.

## TV-11. Revisión histórica del diseño

Esta sección conserva la evidencia previa a la implementación. Su estado y
sus siguientes pasos corresponden a ese momento, no al estado actual de TV-13.

Las skills spec-driven-development y quality-gate mantuvieron explícitos el
contrato de lectura, la separación entre coincidencia y aprobación, el scope
limitado y los riesgos de namespace/concurrencia. No se relajó un guard previo.
La verificación de esta entrega documental se registra tras revisar enlaces,
formato y preservación; no se repite una regresión completa sin cambios de código.

Resultado de revisión: **Aprobado con observaciones para el diseño TV-1**.
Implementación todavía no autorizada ni construida. Evidencia del 2026-10-06:

- 134 tests existentes de prepare/CLI aprobados, 2.166 s; cero fallos,
  cancelados, omitidos o pendientes. No certifican el nuevo verify.
- Cinco enlaces locales existentes, cinco tablas consistentes, fences cerrados,
  salto final y formato limpio; git diff --check sin incidencias e índice vacío.
- Preservación SHA-256: los 227 archivos previos intactos, solo este documento
  nuevo y cero borrados. README conserva el resultado ya aprobado del piloto.
- Escaneo limitado de patrones sensibles sin hallazgos; no auditoría exhaustiva.
- Sin implementación, clientes/cuentas, inspección de lotes privados, cambios
  de memoria, instalación, nuevas dependencias, commit o push.

Observaciones: la confianza del contrato, calidad semántica y cambios fuera de
la lista no se verifican automáticamente. Las garantías son de observaciones
acotadas, no locking/transacciones o consentimiento. Si el diseño se aprueba,
el siguiente paso es un encargo privado de propuesta para Claude, no delegar
una aplicación sin revisión ni autorización del usuario.

## TV-12. Registro histórico de la propuesta r02

Lo siguiente conserva las decisiones y comprobaciones pendientes al aplicar
la propuesta, antes de probarla. La afirmación «sin pruebas» describe ese
momento; TV-13 registra la ejecución posterior y la revisión real.

Esta sección se incorpora al aplicar la propuesta r02 de TV-A a TV-D, que
corrige la r01 tras la revisión de Codex. Describe código y pruebas escritos,
**no resultados**: al aplicarla no se ha ejecutado ninguna prueba ni existe
revisión de calidad aprobada.

| Componente | Ruta |
| --- | --- |
| Contrato, entrada del núcleo y reporte 1.0.0 | [Esquema](../schemas/agent-task-verify.schema.json) |
| Núcleo puro y estados | [Núcleo](../src/task-verify.js) |
| Recolector de solo lectura | [Recolector](../src/task-verify-files.js) |
| Argumentos, ayuda y salida | [CLI verify](../src/task-verify-cli.js), dispatch en [task-cli](../src/task-cli.js) |
| Pruebas previstas | [Núcleo](../test/task-verify.test.js), [IO/CLI](../test/task-verify-cli.test.js) |
| Datos ficticios | [Ejemplo](../examples/task-verify/README.md) |

Precisiones respecto a TV-05 y TV-07:

- **IO antes del pin.** Antes de que coincida `--expect`, la única IO es `lstat`
  de los componentes de la ruta física del contrato y una lectura acotada de sus
  bytes. Puede ocurrir dentro de source/handoff si el contrato vive allí. No se
  comprueban las raíces, no se toca ninguna entrada listada ni ruta del JSON y
  no se revela la huella real si no coincide.
- **Lecturas acotadas.** Cada petición pide como máximo 64 KiB, sin superar el
  tamaño fijado por `lstat`/descriptor ni el presupuesto restante. Al llegar al
  tamaño no se pide un bloque extra para ver EOF. Crecimiento, truncado o
  recambio se detectan comparando metadata del descriptor y del nombre.
- **Alcance de los techos.** 32 MiB acotan los bytes leídos de archivos
  observados. El contrato tiene su propio techo de 512 KiB, sin byte centinela.
  El esquema empaquetado y la metadata no cuentan; no es un presupuesto de todas
  las lecturas del proceso.
- **Modo de handoff.** handoff exige exactamente 0700, comparando también los
  bits setuid/setgid/sticky.

Decisiones de la propuesta, sujetas a revisión:

- `createTaskVerifier(schema)` expone `checkContract`, `evaluate` y `failure`.
  `evaluate` siempre etiqueta `declared-observations`; solo el recolector usa
  la clave interna `LOCAL_READ` para `local-read`. Es una interfaz de código
  confiable, sin garantía criptográfica: un importador puede fabricar la
  etiqueta y un reporte puede copiarse. No es permiso ni prueba independiente.
- Con pin distinto el reporte no incluye la huella real del contrato.
- Un archivo presente donde se espera ausencia se informa sin abrirlo; si es
  symlink, directorio o especial, el conjunto queda `blocked`.
- Un archivo listado que sea directorio de otra entrada de la misma raíz es
  `invalid` (`verify-path-collision`).
- Las raíces deben ser absolutas. El contrato puede ser relativo al cwd explícito
  y puede vivir dentro de una raíz. Si se lista a sí mismo, se observa como
  entrada después del pin y validación. El resultado depende de operación/fase
  y expectativas; no hay garantía universal de hash-differs. --expect vincula
  los bytes del contrato ya revisado.
- Se reutilizan `parseTaskDocument`, `copyTaskJson`, `taskRelativePath` y
  `taskHash` sin cambiar sus APIs. Importar `task-prepare.js` carga el módulo
  del selector, pero verify no lo invoca ni lee esquemas o catálogos de modelos.

Comprobaciones pendientes antes de cualquier cierre:

1. `node --check` **por archivo**, comprobando el código de salida de cada uno
   (por ejemplo, un bucle que informe `ok`/`FALLO` por ruta). Una sola invocación
   con varias rutas no acredita todas.
2. `node --test test/task-verify.test.js test/task-verify-cli.test.js`.
3. `node --test test/task-cli.test.js test/task-prepare.test.js` sin modificar esas pruebas.
4. Regresión completa con `npm test` y comparación con la evidencia previa.
5. Preservación SHA-256 de archivos ajenos, enlaces/formato y `git diff --check`.
6. Revisión independiente de código y resultados reales por Codex.

Hasta registrar esa evidencia real, el estado es **implementación aplicada sin
verificar**, no aprobada ni disponible como garantía.

## TV-13. Cierre de la base local

- Fecha: 2026-10-06 (America/Bogota).
- Resultado técnico de quality-gate: **Aprobado para la base local TV-1**.
- Alcance: 8 archivos nuevos y 3 existentes; las dos precisiones documentales
  revisadas se aplicaron sin alterar el comparador ni los asserts.
- Revisión independiente: las 11 huellas finales coincidieron con las calculadas
  antes de la aplicación. Los 225 archivos anteriores fuera de ese alcance
  permanecieron intactos; no hubo archivos adicionales inesperados.
- La autorización posterior del usuario permite registrar este cierre y su
  evidencia, no crear commits, publicar ni ampliar la ejecución de agentes.

### Evidencia ejecutada por Codex en el Toolkit real

| Comprobación | Resultado observado |
| --- | --- |
| node --check individual en 4 módulos y 2 archivos de tests | 6 invocaciones, todas exit 0 |
| Verify + prepare/CLI existentes | 347/347 aprobadas; 2.373,436 ms |
| Regresión completa, concurrencia 2 | 3.267/3.267 aprobadas; 96.457,809 ms |
| Fallos, canceladas, omitidas y pendientes | 0 en ambas ejecuciones |
| Esquema | Ajv2020 strict compiló contract/input/report; ejemplo válido |
| Documentos y formato de las 11 rutas aplicadas | 30 enlaces locales, 7 tablas, fences cerrados, LF y salto final; sin incidencias |
| Patrones sensibles limitados a las 11 rutas | Sin hallazgos; no auditoría universal de privacidad |
| Git y preservación tras las pruebas | git diff --check exit 0; índice vacío, rama/HEAD sin cambios |

Comandos de pruebas ejecutados:

```sh
node --test --test-reporter=spec test/task-verify.test.js test/task-verify-cli.test.js test/task-prepare.test.js test/task-cli.test.js
node --test --test-concurrency=2 --test-reporter=spec
```

La regresión completa usa directamente el mismo runner definido por npm test,
con concurrencia y reporter explícitos. Estos resultados pertenecen a Codex en
el árbol real, no a Claude, Gemini o la copia temporal de revisión. Gemini
registró por separado 347/347 y 3.267/3.267; no se suman ejecuciones como si
fueran pruebas distintas. Hay 213 pruebas nuevas de verify y 3.054 anteriores.

### Trazabilidad de los criterios

Las suites [núcleo](../test/task-verify.test.js) e
[IO/CLI](../test/task-verify-cli.test.js) pasaron en el estado aplicado.
La matriz resume evidencia de pruebas e inspección; no convierte verify en
un verificador automático de estos criterios.

| Criterio | Evidencia de cierre |
| --- | --- |
| CA-V01 | Ayuda sin IO, argumentos obligatorios, duplicados y opciones de escritura rechazadas; dispatch/help revisados |
| CA-V02 | Contratos inválidos, parser estricto, Unicode/tipos/propiedades y límites de entrada |
| CA-V03 | Pin/formato/contrato inválido sin leer entradas; casos de contrato dentro de ambas raíces con excepción acotada |
| CA-V04 | before/after de inspect/modify/create/delete, diferencias y ausencia observada sin ejecutar operaciones |
| CA-V05 | Paths/case/NFC, colisiones archivo/directorio, raíces inseguras, symlinks y rutas sensibles |
| CA-V06 | Cambios entre lstat/open/stat/read, owner/mode/nlink y recursos especiales; handoff 1700/2700/4700 bloqueado |
| CA-V07 | Directorios intermedios ausentes y ENOENT frente a errores/recursos inseguros; no elevar error a ausencia |
| CA-V08 | Determinismo, entradas congeladas, ID exacto y separación declared-observations/local-read |
| CA-V09 | Reporte cerrado con hechos de aprobación/ejecución fijados en false y revisión humana requerida |
| CA-V10 | Topes 512 KiB/8 MiB/32 MiB, crecimiento/truncado, reporte/salida, cierre de descriptores y fallos de pipe |
| CA-V11 | Núcleo sin IO/procesos/red; lector instrumentado, preservación y rechazo de campos/órdenes fuera de contrato |
| CA-V12 | 134 pruebas previas de prepare/CLI y regresión completa; helpers/dependencias intactos y ejemplo ficticio válido |

### Límites y pendientes fuera de TV-1

- Uso local observado en macOS con Node v24.14.1. No se certifica Windows ni
  una ejecución equivalente en Linux por haber pasado pruebas en macOS.
- matched solo certifica la comparación de las entradas listadas durante la
  observación. No prueba calidad, consentimiento, modelo, facturación, Git,
  archivos no enumerados, locking ni una transacción del namespace.
- LOCAL_READ es una interfaz de código confiable, no evidencia autenticada.
  Contratos y expectativas requieren revisión humana independiente.
- No se ha lanzado una IA real, consultado cuentas, cambiado créditos/API,
  instalado dependencias, actualizado Obsidian ni admitido el runtime AD/S3.2.
- La captura amplia de preservación fue una comprobación del revisor; no es
  una función nueva de verify ni una garantía sobre todo el repositorio.
- El cierre es local y sin commit/push. Preparar un commit requiere autorización
  y revisar dependencias y trabajo previo para no incorporar cambios ajenos.

Siguiente paso propuesto: preparar la entrega Git de esta base y sus dependencias
declaradas mediante un alcance revisado. No iniciar otras funciones, clientes o
publicaciones como efecto automático de este cierre.
