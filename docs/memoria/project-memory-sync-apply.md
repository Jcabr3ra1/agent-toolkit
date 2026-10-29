# Project Memory Sync Apply

## Estado

- Especificación aprobada; base implementada y verificada localmente.
- Diseño e implementación inicial: 2026-10-01. Cierre de entrega local: 2026-10-06.
- Profundidad: rigurosa; reemplaza contenido de notas existentes.
- Alcance inicial: aplicar una propuesta revisada asociada a un PR fusionado.
- Dependencias: [contrato del sistema](project-memory-system.md),
  [sync inspect](project-memory-sync-inspect.md),
  [sync record](project-memory-sync-record.md) y
  [doctor](project-memory-doctor.md).

El usuario aprobó la especificación y autorizó implementar y probar la base en
Agent-Toolkit. La autorización inicial no incluía crear commit. Posteriormente,
el 2026-10-06, autorizó validar la entrega aislada, registrar el cierre documental
y crear un commit local con las 13 rutas revisadas.
No se autoriza aplicarla sobre AVISENS u otra bóveda real, instalarla, cambiar
Skills, conexiones o automatizaciones, hacer push o publicar cambios.

## Problema que resuelve

Ya se pueden detectar PR integrados, reunir evidencia y registrar revisiones.
Sin embargo, la actualización de las notas todavía depende de ediciones
directas: falta comprobar que lo aprobado coincide con lo escrito, que la nota
no cambió mientras se revisaba y que ningún archivo ajeno se incluye.

Un PR o una respuesta de IA no deben convertirse por sí solos en instrucciones
de escritura. Hace falta separar propuesta, revisión y aplicación comprobada.

## Objetivo

Aplicar cambios Markdown previamente redactados por una persona o un agente
autorizado, con vista previa, rutas exactas, evidencia remota fresca y controles
contra propuestas desactualizadas, secretos y escritores concurrentes.

El repositorio continúa siendo la fuente de verdad. La herramienta valida el
procedimiento y los archivos; no certifica la veracidad de cada afirmación.

## Fuera de alcance

- Generar, resumir o corregir notas mediante modelos de IA.
- Descargar código, ejecutar pruebas del producto o modificar el repositorio fuente.
- Crear notas o carpetas, borrar, mover o renombrar archivos en esta primera base.
- Editar el registro de sincronización, manifiestos, Skills o configuraciones.
- Añadir archivos a Git, crear commits, hacer push, abrir o fusionar PR.
- Habilitar escritura MCP, modos autónomos, horarios o webhooks.
- Tratar decisiones sin PR o despliegues como eventos admitidos en esta entrega.
- Garantizar una transacción atómica entre varias notas o restaurarlas automáticamente.

## Situación previa y separación actual de responsabilidades

- `sync inspect` consulta GitHub para un PR explícito de la rama declarada.
  Su salida incluye identidad, SHA de integración, inventario y comprobaciones.
- `sync record` admite notas ya modificadas, revisa sus rutas y añade solo una
  fila al ledger. No redacta ni aplica el contenido de esas notas.
- `doctor` valida la memoria actual; no tiene un mecanismo de validación virtual
  del contenido propuesto antes de escribirlo.
- Existen controles de secretos, rutas, Git, UTF-8, límites y escritura con
  bloqueo en `sync record`; su reutilización no debe debilitar ese contrato.
- Al implementar esta base el 2026-10-01 había 213 pruebas aprobadas; añadió
  110 pruebas aisladas de `sync apply`. La evidencia original se conserva abajo.
  El cierre posterior verifica el conjunto versionable sobre la base de
  prepare/verify, sin incluir otras etapas locales pendientes.
- MCP y conexiones siguen siendo de solo lectura. La escritura se ejecuta
  mediante la CLI, no agregando herramientas al MCP.

## Flujo disponible

1. Inspeccionar el PR y contrastar sus cambios con código y pruebas pertinentes.
2. Redactar fuera de la bóveda un JSON con las notas completas propuestas,
   las fuentes y las huellas de sus versiones originales.
3. Ejecutar la vista previa: validar y mostrar diferencias sin escribir.
4. Revisar el significado y autorizar el plan identificado por su huella.
5. Aplicar únicamente las notas de ese plan, volviendo a comprobar la evidencia.
6. Revisar el diff real y ejecutar `sync record` por separado, cuando todas las
   notas necesarias y la revisión del PR estén terminadas.
7. Crear commit y sincronizar por rutas exactas solo con autorización adicional.

Aplicar una propuesta no marca el PR como revisado. Un resultado parcial no
debe cerrar el registro ni presentarse como una actualización completa.

## Interfaz de la base local

```text
project-memory sync apply [ruta]
  --proposal <archivo>     JSON obligatorio, externo a la bóveda.
  --manifest <archivo>     Manifiesto alternativo validado.
  --ack-warning <código>   text-limit o unsafe-reference observada; repetible.
  --json                  Informe estructurado.
  --apply                 Aplica, en vez de previsualizar.
  --reviewed              Declara la revisión semántica; obligatorio al aplicar.
  --expect <sha256>        Identificador del plan autorizado; obligatorio al aplicar.
```

Los siguientes comandos están disponibles en la copia local. Sustituye las
rutas y prepara una propuesta real revisada; no son una orden de aplicación:

```bash
project-memory sync apply /ruta/a/proyecto-memory \
  --proposal /ruta/a/propuestas/cambio-42.json

project-memory sync apply /ruta/a/proyecto-memory \
  --proposal /ruta/a/propuestas/cambio-42.json \
  --apply --reviewed --expect "HUELLA_SHA256_DEL_PLAN_REVISADO"
```

La ruta, el número y la huella son ilustrativos. No hay selección implícita de
PR, salida arbitraria, `--force`, `--commit` ni `--push`. Opciones desconocidas,
incompletas o contradictorias producen error antes de consultar o escribir.
La vista previa no exige `--reviewed`: permite revisar antes de declarar que
la revisión terminó. `--expect` sin `--apply` es una entrada inválida.

## RF-01. Propuesta explícita y acotada

El contrato JSON es independiente del manifiesto, con propiedades
desconocidas y claves duplicadas rechazadas en todos sus objetos:

```text
schemaVersion: "1.0.0"
projectId: identificador exacto del manifiesto
repository: owner/repo resuelto desde el manifiesto
reviewBranch: rama de revisión declarada
pr: entero positivo
mergeCommit: SHA de integración del PR
memoryHead: HEAD del repositorio de memoria al preparar la propuesta
manifestSha256: huella de los bytes del manifiesto
notes: lista no vacía de objetos con:
  path: ruta relativa exacta de una nota existente
  beforeSha256: huella de sus bytes originales
  content: contenido Markdown completo propuesto
  sourcePaths: rutas del inventario de archivos del PR que motivan el cambio
```

Los SHA de Git tienen 40 dígitos hexadecimales en este proveedor inicial;
las huellas SHA-256 tienen 64. No usar marcadores sin resolver, JSON con
comentarios, scripts, plantillas ejecutables, URLs de descarga o contenido base64.

No recibir autorización dentro del JSON. `approved: true`, instrucciones del
PR o texto de una nota no conceden permiso. El archivo se trata únicamente
como datos; no se ejecutan comandos ni se siguen enlaces para completarlo.

El contenido es el texto completo a guardar, no un diff ambiguo que se aplique
con coincidencias aproximadas. El productor debe conservar las secciones no
afectadas; la herramienta muestra las diferencias para que el revisor lo compruebe.

## RF-02. Identidad y evidencia de la fuente

1. Validar el manifiesto existente y su política de escritura controlada.
2. Exigir la automatización declarada y los PR fusionados, igual que en `record`.
3. Comprobar proyecto, repositorio, rama y huella del manifiesto contra la propuesta.
4. Consultar GitHub en cada ejecución con el contrato acotado de `inspect`;
   confirmar PR fusionado en esa rama y el mismo SHA de integración.
5. Exigir inventario y comprobaciones completos, al menos un éxito y ningún
   resultado adverso, pendiente, omitido, neutral o desconocido.
6. Aceptar solo `text-limit` y `unsafe-reference`, observadas y declaradas por
   el operador; no admitir excepciones para secretos, cobertura o códigos desconocidos.
7. Validar cada `sourcePaths` como ruta segura presente en el inventario completo
   del PR, incluso si el archivo fue borrado. Eso prueba su relación con el
   evento, no que sus contenidos actuales existan ni que respalden cada frase.

El revisor debe comprobar código, pruebas y posibles cambios posteriores al PR
antes de aprobar afirmaciones sobre el estado vigente. La herramienta no descarga
esas fuentes ni deduce veracidad a partir del nombre de un archivo o CI verde.
Las comprobaciones de `inspect` corresponden a la cabecera del PR consultada,
no certifican el SHA de integración ni la rama después del merge.

Si el PR ya está registrado como `Revisado`, bloquear una nueva aplicación con
`already-reviewed`: la primera base no reabre revisiones ni corrige el ledger.
Una fila pendiente o malformada tampoco se elimina o completa desde `apply`.

## RF-03. Versiones y cambios locales

La bóveda debe tener su propio repositorio Git, estar en la rama de memoria
declarada y tener HEAD exactamente igual a `memoryHead`. Un HEAD distinto,
conflictos o indicadores `assume-unchanged`/`skip-worktree` bloquean.

Cada nota debe estar versionada como archivo regular sin conflictos. Sus bytes
en HEAD y staging deben coincidir y producir `beforeSha256`. No admitir staging
de las notas propuestas ni cambios preparados para commit en otros archivos.

En el árbol de trabajo, cada nota admite solo dos estados:

- **Original:** su huella coincide con `beforeSha256`; queda por aplicar.
- **Propuesta satisfecha:** sus bytes coinciden exactamente con `content`;
  no se reescribe ni se atribuye esa edición a la herramienta sin evidencia.

Cualquier otro contenido produce `conflict`. Todo cambio local versionable debe
ser una nota declarada ya satisfecha; un archivo ajeno bloquea. Un borrado,
renombrado, archivo nuevo o cambio de tipo no es una actualización admisible.
Las notas cuyo contenido propuesto sea idéntico al original se rechazan como
entrada sin cambio; no se incluyen para simular trabajo realizado.

El ledger debe estar limpio, versionado y validado con el lector estricto, y
no se modifica. El único aviso de `doctor` descontable es la suciedad de Git
demostrada exclusivamente por notas declaradas ya satisfechas; todos los demás
errores o avisos bloquean. No descontar advertencias como una lista genérica.

Una repetición parcial puede completar las notas originales restantes sin
reescribir las satisfechas. Después de un commit, cambio del manifiesto o
registro del PR, la propuesta antigua pierde vigencia: debe prepararse y
revisarse otra, no relajarse la comparación de versiones.

## RF-04. Rutas, texto y memoria resultante

- Admitir solo rutas Markdown relativas exactas dentro de las áreas permitidas
  por el perfil canónico o declarado de la memoria.
- Rechazar retrocesos, glob, controles, rutas absolutas, symlinks y componentes
  enlazados. No seguir aliases para llegar a un destino externo.
- Excluir el ledger, manifiestos, `.git`, `.obsidian`, Skills, configuraciones,
  credenciales, directorios ocultos y archivos no regulares.
- Rechazar rutas duplicadas o ambiguas, también por diferencias de mayúsculas
  o normalización Unicode que pudieran nombrar el mismo archivo en otra plataforma.
- Leer los archivos completos dentro de sus límites, con UTF-8 válido y sin
  sustitución silenciosa de caracteres; no usar truncamientos para validarlos.
- Comprobar originales, propuestas y diferencias por patrones sensibles,
  controles (incluidos los bidi de dirección de texto), marcadores pendientes
  y formato, antes de mostrar contenido.
- Mantener el BOM y el estilo uniforme LF/CRLF de cada nota. No introducir una
  normalización global ni mezclar estilos; exigir salto final y ausencia de
  espacios sobrantes al final de línea, como en el contrato actual de `record`.

Validar las notas contra una **vista virtual de la memoria resultante**: sustituir
su contenido en un índice de lectura en memoria, sin copiar la bóveda ni escribir
temporales. Comprobar enlaces Markdown locales y Wiki sin seguir symlinks y
rechazar enlaces rotos o ambiguos, incluidos los de otras notas que se rompan
por quitar una sección enlazada. Validar destinos de fragmentos locales para el
subconjunto soportado, y bloquear los que no puedan resolverse con certeza.

Subconjunto soportado: rutas relativas y Wiki links de notas resolubles de forma
única; títulos ATX (`# Título` hasta `###### Título`) fuera de código, sin formato
inline complejo. Wiki fragmentos coinciden con el texto del título tras recortar
espacios y normalizar Unicode NFC; los fragmentos Markdown se decodifican una vez
y comparan con el título en minúsculas NFC, sin puntuación salvo guiones o guiones
bajos, sustituyendo espacios por guiones. Títulos que producen más de un destino
posible bloquean el enlace. Se excluyen block IDs, anclas HTML, títulos Setext y
resoluciones dependientes de plugins; ante uno necesario para validar un enlace,
devolver `blocked`, no considerarlo correcto sin comprobarlo.

También se bloquean los enlaces por referencia y los destinos con paréntesis
anidados o escapes que el analizador no pueda comprobar. No se certifican
silenciosamente como si fueran enlaces simples. Se leen también notas `.MD`;
las notas que se pueden modificar conservan la extensión exacta `.md`.

Estas reglas son conservadoras, no compatibilidad total con Obsidian o GitHub.
Las pruebas verifican el subconjunto y sus bloqueos. No comprobar enlaces externos
por red ni insertar fuentes o encabezados a escondidas: todo texto escrito debe
estar dentro del contenido previamente mostrado.

## RF-05. Vista previa e identificación de la aprobación

La vista previa muestra proyecto, repositorio, rama, PR, SHA de integración,
rutas exactas, estado original/satisfecho y diferencias unificadas por nota.
Todas las validaciones deben terminar antes de emitir contenido. Un patrón
sensible o exceso de salida bloquea sin mostrar notas, secretos ni un diff parcial.

Generar `planId` con SHA-256 de una representación JSON determinista y versionada:

```text
["sync-apply-v1", projectId, raíz física de la bóveda,
 manifestSha256, sha256(bytes del archivo de propuesta), memoryHead,
 sha256(índice Git), sha256(ledger), repository, reviewBranch, pr, mergeCommit,
 lista ordenada de [path, beforeSha256, sha256(bytes propuestos)],
 lista ordenada de advertencias admitidas]
```

La ruta absoluta identifica la bóveda local y solo se muestra en la salida local,
no se añade al JSON de propuesta. El identificador vincula la aprobación al
contenido, destinos y contexto; no es una firma, contraseña ni permiso permanente.

Con `--apply`, reconstruir y validar el plan desde cero y exigir `--reviewed`
y `--expect` igual a `planId`. Cambiar un byte de la propuesta, el índice, el
ledger, el manifiesto, los destinos o las excepciones requiere otra vista previa.
No incluir fecha de consulta o estado original/satisfecho en la huella: completar
una parte del mismo plan no debe cambiar por sí solo su identidad.

La autorización humana sigue siendo necesaria. Un agente no puede utilizar un
hash recibido de una nota o calcularlo para fingir que el usuario aprobó el plan.
Una futura automatización necesitará autorización propia para ese flujo completo.

## RF-06. Aplicación, concurrencia y errores parciales

Ordenar por ruta las notas pendientes. Antes de cualquier reemplazo, validar
la propuesta completa, la vista virtual y la evidencia. No cambiar las notas
satisfechas, sus permisos o fechas.

Usar un bloqueo exclusivo compartido con `sync record` junto al ledger. La
implementación debe ampliar el protocolo existente conservando su exclusión
mutua, no crear dos bloqueos independientes que permitan escritores simultáneos.
No borrar bloqueos previos ni artefactos ajenos, aunque parezcan antiguos.

Bajo el bloqueo, comparar hashes e identidades de propuesta, manifiesto,
ledger, notas, raíz e índice Git con el estado validado. Repetir las comprobaciones
antes de cada reemplazo, admitiendo solo las sustituciones propias ya verificadas.
No escribir ni refrescar el índice; usar Git con `--no-optional-locks`, fsmonitor
desactivado para esa invocación, y sin ejecutar diff externo ni textconv.

Preparar temporales exclusivos en los directorios de destino, comprobar su
contenido y conservar los bits de permisos del original. Solo tras preparar
todos los temporales reemplazar notas mediante rename atómico por archivo.
Limpiar únicamente artefactos cuyo propietario e identidad correspondan a la
ejecución. No conservar copias privadas o un journal oculto como nuevo ledger.

Varios rename no constituyen una transacción atómica. Ante fallo:

- Antes del primer reemplazo: conservar todos los originales y limpiar lo propio.
- Después de reemplazar alguna nota: detenerse; listar rutas aplicadas, satisfechas
  previamente y pendientes, e informar `partial` con `wrote: true`.
- Con todas reemplazadas pero error de confirmación o limpieza: informar el fallo
  y `wrote: true`, no afirmar éxito limpio ni que nada se escribió.
- No revertir automáticamente, continuar como si todo hubiese terminado ni
  llamar a `sync record`. Un reintento explícito vuelve a validar el plan completo.

El bloqueo coordina estas operaciones, no Obsidian, Working Copy ni editores
externos. El operador debe pausar edición y sincronización durante la aplicación.
Persisten ventanas de carrera con procesos que ignoren el bloqueo; no prometer
ausencia absoluta de sobrescrituras, conservación de ACL/xattrs o durabilidad
ante apagado. Si no puede confirmarse un reemplazo, reportarlo como incierto,
con `wrote: true` conservador y las rutas afectadas; requiere revisión humana.

## Requisitos no funcionales, estados y límites

Propuesta JSON: 8 MiB. De 1 a 20 notas existentes, con 1 MiB por versión de cada
nota y 5 MiB por conjunto original/propuesto, respectivamente. Hasta 20 fuentes
por nota, rutas de hasta 512 caracteres. Manifiesto y ledger: 1 MiB cada uno.
Índice y respuesta local de Git: 5 MiB; 10 segundos por llamada.

Inspección remota: presupuestos de `inspect`, inventario hasta 1000 archivos.
Informe completo, incluido diff: 1 MiB. Vista virtual: máximo 5000 notas y
25 MiB de texto; bloquear si no puede validarse completa, no omitir notas grandes
silenciosamente. Las lecturas y recorridos deben tener cota y no seguir enlaces.

Estos límites se comprueban en la base local. El recorrido añade una cota de
25 000 entradas, incluso si no son Markdown. El informe reserva 64 KiB de su
presupuesto para resultados, listas y errores de aplicación: un diff cercano
a la cota puede bloquear antes de alcanzar 1 MiB. Nunca se trunca para aprobarlo.
Reducir una propuesta grande exige revisarla de nuevo; no aplicar una fracción
truncada. La CLI no guarda la propuesta, salida o diferencias en otros archivos.

| Estado | Significado | Salida |
| --- | --- | --- |
| `preview` | Plan completo validado, ninguna escritura | 0 |
| `applied` | Se reemplazaron todas las notas pendientes | 0 |
| `unchanged` | Todas coinciden con la propuesta válida | 0 |
| `blocked` | Diagnóstico, evidencia o límites impiden proceder | 1 |
| `conflict` | Plan desactualizado, cambios ajenos o bloqueo existente | 1 |
| `partial` | Hubo o pudo haber reemplazos, pero la operación no terminó limpiamente | 1 |
| `error` | Fallo sin reemplazos confirmados o posibles | 1 |

Entradas inválidas: código 2. JSON incluye comando, estado, `planId`, identidad,
huellas, diferencias validadas, `wrote`, rutas aplicadas/satisfechas/pendientes y
advertencias acotadas. No emite stderr original, variables de entorno o contenido
rechazado. En `partial`, distinguir fallos confirmados de escritura incierta.

## Componentes implementados

- `schemas/project-memory-update.schema.json`: contrato separado de propuesta.
- `src/sync-proposal.js`: lectura acotada, JSON estricto e identificación del plan.
- `src/sync-apply.js`: preparación, vista previa y aplicación; no redacción.
- `src/sync-files.js`: lectura física acotada, Git sin escrituras, identidades y
  nombre del bloqueo compartido. `record` solo reutiliza ese nombre, sin ampliar
  sus rutas ni excepciones. Se conserva `.project-memory-sync-record.lock`.
- `src/sync-markdown.js`: catálogo completo, vista virtual, enlaces y diferencias.
  Los adjuntos físicos enlazados también se incluyen en los controles de identidad.
- `src/cli.js`: opciones, ayuda, errores y salida humana/JSON.
- `test/sync-apply.test.js`: fixtures aisladas, proveedor simulado y fallos inyectados.

No añadir campos al manifiesto de memoria, dependencias de modelos de IA,
instalación automática o una base paralela de eventos revisados.

## Tareas completadas

- [x] T1. Contrato de propuesta y parser — validar estructura y límites antes de
  consulta/escritura — esquema, parser y pruebas de claves duplicadas/entradas hostiles.
- [x] T2. Plan y versiones — evidencia fresca, Git y `planId` — pruebas de fuente,
  huellas, destinos, staging, cambios ajenos e idempotencia previa al commit.
- [x] T3. Vista virtual y diferencias — validar la memoria resultante sin escribir —
  pruebas de enlaces entrantes/salientes, fragmentos, formato, secretos y cotas.
- [x] T4. Aplicación y bloqueo compartido — reemplazos acotados con salida parcial —
  pruebas de exclusión con `record`, concurrentes, fallos y limpieza por propietario.
- [x] T5. CLI y documentación — comandos comprobables y límites visibles —
  pruebas de JSON, códigos y ayuda; actualizar guías solo cuando exista la operación.
- [x] T6. Revisión de calidad — relacionar cada criterio con evidencia y ejecutar
  la suite anterior — no aplicar sobre una memoria real como prueba implícita.

## Criterios de aceptación comprobados localmente

- CA-01: Dada una propuesta válida y un PR fusionado de la fuente declarada,
  la vista previa muestra sus diferencias; identidad falsa o PR abierto bloquea.
- CA-02: Sin `--apply`, snapshots de memoria, fuente, propuesta, configuración
  e índice son iguales antes/después, incluidos los errores.
- CA-03: Sin revisión y huella coincidente, no se escribe. Modificar propuesta,
  manifiesto, índice, ledger o contexto invalida la aprobación.
- CA-04: Aplicar cambia únicamente los bytes de las notas pendientes enumeradas;
  no toca ledger, índice, fuente, Skills o configuraciones ni ejecuta Git mutante.
- CA-05: Cambios ajenos, staging, tipos incompatibles, glob, rutas duplicadas,
  secretos o symlinks bloquean sin divulgar ni reemplazar el contenido rechazado.
- CA-06: La vista virtual detecta enlaces nuevos rotos y enlaces entrantes que
  quedarían rotos; se prueba el subconjunto de fragmentos soportado y sus límites.
- CA-07: Repetir la misma propuesta vigente no reescribe notas satisfechas;
  un estado parcial admite completar pendientes originales con la misma aprobación.
- CA-08: CI ausente/adverso/incompleto y advertencias no admitidas bloquean;
  únicamente las dos excepciones observadas pueden declararse explícitamente.
- CA-09: Competencia con `record`, cambio entre plan y reemplazo, disco lleno,
  fallo de rename y sustitución de artefactos conservan trabajo ajeno y reportan
  qué se aplicó, quedó pendiente o no puede confirmarse, sin falsa atomicidad global.
- CA-10: UTF-8, BOM, LF/CRLF y permisos comprobados se preservan; bytes excesivos,
  recorridos o salida fuera de límite bloquean antes de escribir o filtrar contenido.
- CA-11: CLI y JSON distinguen preview, aplicación, no-op, bloqueo y partial;
  ningún resultado dispara `record`, commit o push automáticamente.
- CA-12: La suite existente sigue pasando; pruebas nuevas usan solo repositorios
  temporales y GitHub simulado. No se cambia una memoria o cliente real sin permiso.

## Riesgos, alternativas y reversión

El agente puede redactar una afirmación incorrecta aunque CI pase. Una huella
vincula bytes y contexto, no demuestra comprensión ni autorización humana.
Los patrones sensibles ayudan, pero no detectan todos los datos privados.

Reemplazar varias notas puede quedar incompleto. Se elige reporte y reintento
explícito en vez de rollback automático: este último podría borrar una edición
posterior. Tras un fallo, pausar escritores, inspeccionar rutas y Git y preparar
la siguiente acción autorizada. Restaurar solo archivos revisados, nunca resetear
la bóveda completa. Los originales versionados siguen recuperables desde HEAD.

Alternativas no elegidas para esta base: escritura directa desde MCP, generación
con IA integrada, aplicar diffs aproximados, una supuesta transacción de varios
rename, nuevas notas/carpetas y cierre automático del PR en el ledger.

## Decisiones de esta base y evolución pendiente

- Alcance inicial: actualizar solo notas existentes; creación y decisiones sin
  PR se especificarán aparte si hacen falta.
- Varios archivos: exclusión compartida y reemplazos individuales, con `partial`
  honesto y sin rollback automático; no prometer una transacción global.
- Aprobación: propuesta externa, vista previa y huella obligatoria al aplicar.
- Fragmentos: se aplica el subconjunto conservador de RF-04, probado durante T3;
  una incompatibilidad real que requiera ampliarlo vuelve a aprobación.
- Retención de propuestas, certificación multiplataforma y automatización:
  pendientes de etapas separadas, no permisos ni garantías implícitas.

## Evidencia histórica de la implementación inicial

Verificación del 1 de octubre de 2026: `npm test`, 323 pruebas aprobadas,
0 fallos y 0 omitidas. Incluye las 213 anteriores y 110 nuevas. Solo se usaron
repositorios temporales y GitHub simulado; una prueba usa el `doctor` real en
preview, aplicación y repetición sin cambio. No se ejecutaron pruebas del producto
ni se aplicaron propuestas sobre memorias reales.

| Criterio | Evidencia en `test/sync-apply.test.js` |
| --- | --- |
| CA-01 | Preview, PR abierto, rama, número, repositorio y SHA de integración distintos |
| CA-02 | Snapshots de memoria, fuente, propuesta, configuración Git, permisos e índice |
| CA-03 | Revisión explícita, huella incorrecta, cambios de JSON e identidades desactualizadas |
| CA-04 | Solo notas enumeradas; ledger e índice inalterados; comandos remotos de lectura |
| CA-05 | Staging, cambios ajenos, flags ocultos, índice simbólico, UTF-8, secretos y rutas prohibidas |
| CA-06 | Wiki, Markdown, enlaces entrantes, ATX, Unicode, títulos ambiguos y sintaxis no soportada |
| CA-07 | No-op conserva inode y fecha; segundo rename fallido y reintento con la misma huella |
| CA-08 | CI ausente, pendiente, adverso, neutral e incompleto; excepciones solo observadas |
| CA-09 | Bloqueo compartido con record, preparación fallida, concurrentes, artefactos ajenos e incertidumbre |
| CA-10 | BOM, CRLF, permisos, bytes multibyte, notas, recorrido, salida y cotas virtuales |
| CA-11 | Ayuda, JSON y códigos 0/1/2; partial explícito; ausencia de cierre o Git mutante automático |
| CA-12 | Suite anterior completa sin regresiones; diagnóstico real en fixture aislada |

La revisión local no es una certificación de producción o multiplataforma.
Los fallos de disco son simulados; no se ha probado pérdida de energía ni
ACL/xattrs. No se ha ensayado una aplicación con GitHub real. Permanecen las
ventanas de carrera con editores que ignoren el bloqueo y los límites del filtro
de secretos y del analizador Markdown.

La puerta de commit de esta evidencia original se resolvió con la autorización
posterior descrita en el cierre. Publicación, adopción en AVISENS y automatización
siguen separadas.

## Cierre de la entrega local — 2026-10-06

Resultado de quality-gate: **Aprobado para la entrega local de esta base**,
con los límites de concurrencia, semántica y producción ya documentados.
No se añade comportamiento nuevo ni se relajan controles para consolidarla.

Alcance de 13 rutas: CLI y bloqueo compartido de record, cuatro módulos de apply,
esquema, suite de apply y cinco documentos relacionados. Quedan fuera README,
runtime/autenticación de agentes, encargos privados, bóvedas y automatizaciones.
No se incluyen otros archivos locales solo por estar pendientes en el Toolkit.

### Evidencia independiente de Codex

Se extrajo la base versionada de prepare/verify y se superpusieron únicamente
las 13 rutas de esta entrega en una copia temporal propia. Se reutilizaron las
dependencias instaladas, sin instalación ni cambios en node_modules.

| Comprobación | Resultado observado |
| --- | --- |
| Regresión completa de la entrega aislada | 1.001/1.001 aprobadas; exit 0; 35.994,671 ms |
| Fallos, canceladas, omitidas y pendientes | 0 |
| Sintaxis de las rutas JavaScript de esta entrega | 7 node --check individuales, todas exit 0 |
| Revisión previa de apply y record en el árbol local | 222/222 aprobadas; exit 0; 34.561,013 ms |
| Cobertura del cierre | 110 pruebas de apply más las 891 de la base versionada; no sumas de ejecuciones repetidas |

Comandos ejecutados:

```sh
node --test --test-concurrency=2 --test-reporter=spec
node --test --test-reporter=spec test/sync-apply.test.js test/sync-record.test.js
```

El primer comando corresponde a la copia aislada; el segundo, a la revisión
previa en el árbol local. Sus resultados no certifican los módulos nativos de
agentes todavía sin versionar. La matriz CA-01–CA-12 anterior sigue vinculada
a la suite de apply, incluida y aprobada en la regresión aislada.

Las pruebas usaron Git y memorias temporales con GitHub simulado; no aplicaron
propuestas en AVISENS, Obsidian o proyectos reales ni consultaron cuentas.
El lector/schema, preview, pin, rutas, CI, no-op, conflicto y resultado parcial
se revisaron conservando el contrato existente. record mantiene el mismo nombre
de bloqueo y pasa sus pruebas sin alterar sus expectativas.

La edición final de cierre es exclusivamente documental; no cambia el código,
esquema ni tests probados. Antes del commit se comprueban formato, enlaces,
patrones sensibles limitados al alcance, bytes del índice y preservación de
archivos ajenos. Las huellas y el identificador de commit se registran aparte,
sin copiar rutas personales o el lote privado a esta documentación.

### Lo que no autoriza ni certifica este cierre

- No ejecutar sobre una memoria real, crear notas, borrar, renombrar o redactar
  contenido mediante IA. La base sigue actualizando solo notas existentes revisadas.
- No publicar, hacer push, abrir PR, cambiar MCP ni activar automatizaciones.
- No certificar Linux/Windows, pérdida de energía, ACL/xattrs o GitHub real:
  ejecución observada en macOS con Node v24.14.1 y fixtures ficticias.
- No prometer atomicidad entre notas, ausencia de carreras con editores externos
  o veracidad de una nota por tener huellas coincidentes y CI verde.

Siguiente paso: revisar por separado las etapas pendientes antes de consolidarlas
o publicar. La adopción real requiere su propio plan y autorización; un commit
de la herramienta no convierte ninguna propuesta JSON en permiso de escritura.
