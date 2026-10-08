# SC-1 — Proyección selectiva de configuración local

## Estado y problema

Consolidación local autorizada el 2026-10-07 (America/Bogota): validación
secuencial aislada de cinco rutas, ajustes de esta nota, evidencia privada y
commit local. No incluye lecturas de settings o estado global reales, cuentas,
clientes, cambios de configuración, push ni el arranque de un piloto.
El cierre actual se registra al final, separado de la evidencia histórica.

Diseño del 2026-10-05 (America/Bogota), autorizado para preparación con «apruebo».
Profundidad SDD: rigurosa por posible presencia de credenciales y datos personales.
SC-A–SC-C fueron autorizados después con «autorizo», incluyendo el recorrido de
bytes y el destino privado. Lector implementado/probado y dos fuentes locales
observadas. No se arrancó cliente ni consultó cuenta; el cierre figura al final.
La [revisión S3.2](agent-client-supervised-preflight.md) quedó incompleta porque
el inventario de metadatos no demuestra ausencia de hooks/helpers.

Objetivo: observar estructura local de una lista pequeña de claves sin construir
un objeto con el contenido completo, ejecutar comandos o copiar valores.
Entregar evidencia parcial honesta, no habilitar auth status o inferencia.

## Ampliación de lectura aprobada

S3.2 permitía metadatos/proyección segura, no leer archivos mezclados con secretos.
Esta propuesta amplía la lectura a los bytes de dos archivos exactos. Un escáner
por bloques puede tener que recorrerlos enteros para comprobar ausencia de claves.
Los bloques pueden contener valores sensibles temporalmente, aunque el programa
no los convierta en strings, reconstruya, copie, muestre o conserve.

Por ello no se promete «cero lectura física de secretos». Se promete no extraer
ni divulgar valores, lectura acotada local y salida estructural de lista cerrada.
Es una autorización nueva, no una interpretación del permiso anterior.
Si el usuario no acepta ese alcance, mantener revisión incompleta y traspaso manual.

## Fuentes y selectores cerrados

Las rutas absolutas se enumeran en la aprobación, tomadas del inventario privado
anterior; no de JSON del modelo, PATH, configDirectory o referencias en los archivos.

| Fuente lógica | Claves raíz seleccionadas | Salida permitida |
| --- | --- | --- |
| Configuración personal `settings.json` | `hooks`, `apiKeyHelper` | Clave ausente/presente, tipo y estructura vacía/no vacía/desconocida |
| Configuración personal `settings.json` | `disableAllHooks` | Clave ausente/presente y booleano si es de ese tipo; no interpretar otros valores |
| Estado global `.claude.json` | `mcpServers` | Clave ausente/presente, tipo y mapa vacío/no vacío/desconocido |

No seleccionar tokens, OAuth, email, organizaciones, historial, proyectos,
URLs/headers/valores de MCP, cuerpos de hooks o comandos de helpers.
No profundizar en `projects` para localizar configuraciones de otros proyectos.
No seguir includes, enlaces, variables de entorno, scripts o rutas dentro del JSON.
Claves desconocidas se descartan, nunca se agregan a un inventario público.

«No definida en este archivo» no significa «desactivada en Claude». Una clave
vacía, null o con tipo inesperado tampoco se convierte en ausencia efectiva.
Los valores de settings tienen precedencia y alcance propios que esta lectura
no calcula. No ampliar selectores por encontrar información interesante.

## Lectura local acotada y consistencia

Validar archivos regulares, UID del usuario, rutas físicas sin symlinks, un solo
enlace y sin permisos de escritura de grupo/otros. Descriptor con no-follow;
contrastar archivo abierto y nombrado antes/después. Dispositivo, inode, tamaño,
modo, propietario y tiempos deben conservarse. No reparar permisos para leer.

Lectura secuencial incremental, con offsets y presupuesto explícitos. No usar
readFile, JSON.parse del archivo entero, grep/sed/cat ni volcar errores o snippets.
No calcular huella del contenido completo o de valores omitidos. La evidencia
puede guardar metadatos mínimos privados y huella de la proyección no secreta.

Validar JSON/UTF-8 mediante una máquina de estados incremental. Solo las claves
raíz seleccionadas y el booleano seleccionado pueden materializarse. El resto
se atraviesa estructuralmente y se descarta, sin concatenar strings/payloads.
Nombres desconocidos no se devuelven; detección de duplicados puede usar huellas
internas de nombres, no de sus valores, acotadas y nunca exportadas.

Rechazar claves seleccionadas duplicadas u ofuscadas que queden ambiguas,
escapes/Unicode inválidos, comentarios, basura tras JSON, límites y truncados.
Reconocer correctamente claves seleccionadas escapadas; no usar regex para
deducir ausencia. Claves anidadas con el mismo nombre no cuentan como raíz.

Una lectura parcial, un fallo o una carrera invalida toda la proyección de esa
fuente. No devolver ausencias/supuestos booleans de un prefijo leído antes del fallo.
La detección de cambio es cooperativa: no aislamiento frente al mismo UID,
ni garantía de que Claude seguirá usando esos bytes después de la observación.

## Presupuesto propuesto

| Recurso | Techo |
| --- | --- |
| Archivos de configuración | Dos exactos; sin búsqueda o fuentes alternativas |
| Tamaño por archivo / agregado | 1 MiB / 2 MiB |
| Bloque de lectura | 4 KiB máximo |
| Profundidad / elementos sintácticos | 32 / 20 000 |
| Longitud lógica de clave / cantidad de claves | 256 bytes / 4 096, sin exportar nombres desconocidos |
| Proyección serializada | 16 KiB máximo, esquema cerrado |
| Tiempo operativo total | 30 s, comprobar durante lectura; sin reintentos |
| Cliente, shell, red, cuentas, prompts | Ninguno |
| Escritura propia | Dos notas privadas nuevas `0700`/`0600` |

El lector controla su buffers/estructuras, no memoria del sistema operativo,
swap, copias del runtime o sincronizadores externos. No prometer borrado forense
de bytes por soltar/limpiar un buffer. No activar logs, tracing, core dumps o
telemetría para este lote. Ningún proceso externo recibe los bloques o el JSON.

## Contrato e interpretación de la evidencia

Esquema y parser propios, separados del JSON de permisos S3.2. Resultados:
`invalid`, `incomplete`, `observed`, `blocked`. Campos cerrados de fuente,
selector, presencia, tipo, vacío/no vacío, booleano permitido y códigos de error.
Sin valores string, cuerpos de comandos, rutas en informes públicos o muestras.

Procedencia: `local-structure-observation`. El futuro wrapper de archivos vincula
la proyección al descriptor/identidad y fecha realmente observados; un parser
alimentado con datos ficticios no puede declarar observación de una instalación.
Referencias/huellas no autentican al operador ni crean un permiso humano.

Todos los flags de acceso/inferencia/admisión/facturación siguen falsos.
No transformar automáticamente esta procedencia en `locally-observed` de
controles efectivos para satisfacer el guard S3.2. No modificar ese evaluador.

Una proyección validada responde solo sobre las dos fuentes locales. MCP por
proyecto, políticas administradas/remotas/embebidas, plugins, skills, delegación,
fallback, proveedores y composición de flags siguen fuera de esta lectura.
Resolverlos exige un plan pertinente, no inventar ausencias ni extender la lectura
a archivos/cuentas ajenos. No garantizar que SC-1 permita ya consultar acceso.

## Entregas y pruebas antes de archivos reales

| Paso | Entrega | Verificación |
| --- | --- | --- |
| SC-A | Contrato y parser incremental, solo datos sintéticos | Cortes byte a byte, escapes, UTF-8, raíz/anidación, duplicados y límites |
| SC-B | Wrapper de dos archivos aprobados con permiso opaco | Symlink/hardlink, UID/permisos, cambios, truncados, interrupción y lectura incremental |
| SC-C | Lote privado y revisión, posterior a las pruebas | Solo dos fuentes, resultados estructurales, datos no publicados y no efectos externos |

Rutas entregadas: `schemas/agent-client-selective-config.schema.json`,
`src/client-selective-config.js`, `src/client-selective-files.js` y
`test/client-selective-config.test.js`. API y evidencia enlazadas en el cierre.
Lote lógico creado: `PRIVATE_EVALUATIONS_ROOT/sc-1-claude-01`.
Notas: `01-estructura-local.md` y `03-revision.md`, sin sobrescribir anteriores.

Las pruebas colocan valores sensibles ficticios en claves omitidas, strings
largas, delimitadores/escape y contenido similar a instrucciones. Deben demostrar
que no aparecen en proyecciones, referencias, excepciones, logs o archivos
generados. Instrumentar funciones de lectura completa, red y spawn: no usadas.
Inspeccionar retención y tamaño máximo de estado, no solo un texto final redactado.

## Criterios y siguiente puerta

1. Solo dos fuentes exactas aprobadas; sin rutas/recetas de un modelo o del JSON.
2. No reconstruir archivos completos ni valores omitidos; límites durante lectura.
3. Presencia/tipo/booleano permitidos correctos en todos los cortes; fallo invalida fuente.
4. Sin datos sensibles en salidas/errores/huellas de valores o contenido completo.
5. Lectura de identidad estable y permisos adecuados; sin reparar/sobrescribir.
6. Evidencia estructural local separada de controles efectivos y atestaciones.
7. Pruebas/regresión antes del lote y dos notas privadas; código previo intacto.
8. Sin clientes, cuentas, shell, red, inferencia, settings editados, Git u Obsidian.

La aprobación de implementación y pruebas incluyó explícitamente el recorrido
de bytes de archivos que pueden contener valores sensibles, las dos rutas de
entrada y el destino privado nuevo. No autoriza auth
status, S3.3, otras fuentes, cambio de configuración, commit o publicación.

## Fuentes oficiales

Consulta: 2026-10-05 (America/Bogota), separada de la instalación:

- Settings personales y estado global son fuentes distintas; este último incluye
  sign-in y estado por proyecto. No copiarlo como si solo fuera configuración.
  [Settings](https://code.claude.com/docs/en/settings).
- `hooks` y `disableAllHooks` están documentados, pero el booleano personal no
  neutraliza hooks administrados. No proponer cambiarlo desde esta lectura.
  [Hooks](https://code.claude.com/docs/en/hooks).
- `apiKeyHelper` es un mecanismo de credenciales; el comando no forma parte de
  la salida estructural. Los ejemplos API no se usan como ruta de suscripción.
  [Ejecución programática](https://code.claude.com/docs/en/headless).
- La política puede tener múltiples fuentes. Leer dos archivos personales no
  prueba ausencia de política remota/administrada.
  [Políticas](https://code.claude.com/docs/en/managed-settings).

## Revisión documental histórica del diseño

Resultado de quality-gate: **Aprobado con observaciones para el diseño**.
SDD explicitó la ampliación de lectura: los bloques pueden contener valores
sensibles transitoriamente, sin prometer cero acceso físico o borrado forense.
La revisión mantuvo separada observación estructural y control efectivo; no
rebajó el guard S3.2 para conseguir una consulta de cuenta.

Dos documentos: 11 enlaces locales existentes y 9 tablas consistentes; formato,
`git diff --check` e índice sin staging correctos. Escaneo limitado sin patrones
sensibles detectados. SHA-256: 184 de 185 archivos previos intactos, solo el índice
propio S3.2 actualizado, un documento nuevo y cero borrados.

No se ejecutó regresión de código, pues no hubo cambios funcionales. No se leyeron
settings o estado global, inició cliente, consultó cuenta o creó lote privado.
El destino propuesto no existe. Sin commit, push, cambios de configuración,
proyectos, Obsidian, automatizaciones o contratos previos.

Observaciones: implementación/pruebas del escáner pendientes, posible presencia
de bytes sensibles, detección cooperativa de cambios y fuentes efectivas fuera
del alcance. Ejecutar SC-A–SC-C necesita la nueva autorización de lectura y destino;
este diseño no es una concesión de permisos de ejecución o inferencia.

## API entregada y cierre histórico SC-A–SC-C

| Archivo | Responsabilidad |
| --- | --- |
| [Contrato](../schemas/agent-client-selective-config.schema.json) | Límites, campos e informes cerrados del parser/wrapper |
| [Parser](../src/client-selective-config.js) | Máquina de estados JSON/UTF-8 por bytes, descartando valores |
| [Wrapper](../src/client-selective-files.js) | Dos fuentes exactas, permiso opaco y descriptor revalidado |
| [Pruebas](../test/client-selective-config.test.js) | Casos sintéticos adversos, retención, fuentes, privacidad y efectos |

`createSelectiveConfigParser(schema, sourceId, limits)` devuelve `push(bytes)`
y `finish()`. Bloques genuinos hasta 4 KiB, sin strings de entrada. Mantiene
solo gramática, contadores, candidatos de selector y huellas transitorias de
nombres para detectar duplicados; no construye objetos de contenido ni texto
de valores. Normaliza escapes/UTF-8 de claves, valida parejas surrogate y descarta
valores sin ejecutarlos. El número omitido se valida léxicamente, no se convierte
en Number. Las claves anidadas no se confunden con selectores raíz.

No hay proyección provisional en `push`: campos vacíos hasta cierre válido.
Un fallo elimina conclusiones de esa fuente y no devuelve su hash. La huella
de proyección depende solo de los campos permitidos, nunca del archivo o valores.
El parser declara `provided-bytes-structure`, no una observación de instalación.

`createSelectiveReadPermit(configuration)` corresponde a la orquestación que
tiene aprobación humana. `createSelectiveFileReader(schema, configuration,
permit, dependencies)` devuelve `run()` sin argumentos. Solo dos fuentes
ordenadas, sin entradas libres, symlinks, fallback o reparación de permisos.
El handle es opaco, no serializable, revocable y se consume una sola vez.
Constructor/dependencias de confianza no pueden venir de JSON del modelo.

Tras lectura y contraste de descriptor/nombre/ancestros, el wrapper adjunta
`local-structure-observation`. Un cierre tardío también invalida la fuente;
los límites se comprueban durante lectura y al cerrar. Puede conservar otra
fuente previamente verificada si la siguiente falla, pero no declara éxito del
lote ni inventa ausencias para la fuente fallida. Sin fecha o contexto ficticio.

Comprobación: 2026-10-05 (America/Bogota), macOS arm64, Node `v24.14.1`.

- Baterías nuevas: 69/69, 79/79, 83/83 y **84/84 finales**, 1 653 ms;
  cero fallos, canceladas, omitidas o pendientes.
- Revisión reforzó informes cerrados, instrumentación de funciones prohibidas
  y plazo después de cierre. Incluye 80 casos diferenciales sintéticos, todos los
  cortes de un ejemplo UTF-8/escapes, claves duplicadas y límites exactos.
- Regresión final antes del lote real: **2 211/2 211**, 79 225 ms, concurrencia
  dos; cero fallos, canceladas, omitidas o pendientes.
- Lote real: dos fuentes autorizadas, identidad estable durante la lectura y
  proyecciones locales válidas. Sin límites alcanzados, carreras o reintentos.
  Los resultados y metadatos personales se conservaron solo en evidencia privada.
- Se crearon únicamente las dos notas autorizadas, `0700`/`0600`, sin
  sobrescritura, salida cruda o valores omitidos. Sin configuración editada,
  clientes, cuentas, comandos, red solicitada, prompts, staging, commit o push.

| Criterio | Evidencia ejecutada |
| --- | --- |
| 1 | Dos rutas/IDs exactos, permiso propio, argumentos/rutas adicionales rechazados |
| 2 | Bloques limitados, estados acotados, strings largas omitidas y sin JSON completo |
| 3 | UTF-8/escapes, diferencial, raíz/anidación, duplicados y fallo/cierre sin proyección provisional |
| 4 | Secretos sintéticos no publicados, hash de proyección independiente de valores omitidos |
| 5 | UID/modo/links, descriptor/nombre/ancestros y carreras/interrupción/plazos |
| 6 | Procedencias distintas, sin elevar estructura local a control efectivo |
| 7 | Suite/regresión anteriores al lote real, notas privadas y preservación |
| 8 | Whole-read/escritura/red/spawn instrumentados sin llamadas; sin clientes reales |

Resultado de quality-gate: **Aprobado con observaciones para lectura estructural**.
La retención declarada se limita al parser, no a buffers del llamador o copias del
SO/runtime. La autorización aceptó tránsito de bytes posiblemente sensibles,
sin promesa de borrado forense. No se copian estos datos al repositorio genérico.

La configuración efectiva sigue incompleta: SC-1 no habilitó S3.2 o S3.3 ni cambió
sus guards. Siguiente paso: diseñar una variante aislada que considere las fuentes
locales observadas, sus mecanismos preventivos y las fuentes externas pendientes,
sin editar la configuración existente o ejecutar clientes por esta aprobación.

Revisión final: seis archivos propios sin patrones sensibles detectados, formato
y espacios correctos, índice sin staging. Cuatro documentos, 17 enlaces locales
y 15 tablas revisados. Preservación SHA-256: 184 de 186 archivos previos intactos,
solo dos documentos propios actualizados, cuatro archivos nuevos y cero borrados.
Dos notas privadas `0600`, sin recursos extra o temporales de prueba residuales.
El borrador local IA-1, `docs/agent-client-isolated-variant.md`, separa
configuración propuesta y efectividad comprobada. No se incorpora a esta entrega
versionada; su evaluador de declaraciones y pruebas sintéticas no adapta SC-1
a S3.2, no autentica evidencia ni concede permiso de ejecutar un cliente.
## Consolidación versionada local SC-1 — 2026-10-07

Esta sección registra la autorización y evidencia de una entrega local de cinco
rutas, no una nueva lectura de configuración real. El alcance comprende
validación aislada, ajustes de esta nota, evidencia privada y commit local.
No repite ni renueva el lote histórico SC-A–SC-C, observaciones de instalación,
estado de cuentas o permisos de lectura de archivos personales.

### Evidencia independiente

Comprobación local: macOS arm64, Node `v24.14.1`.

| Comprobación | Resultado observado |
| --- | --- |
| Suite específica durante la revisión, mismo código del candidato | 84/84; salida 0; 1 714,627125 ms |
| Regresión aislada: base versionada más cinco rutas SC-1 | 2 559/2 559; salida 0; 152 452,962458 ms |
| Casos de la base / casos añadidos SC-1 | 2 475 / 84 |
| Fallos, canceladas, omitidas y pendientes de las baterías finales | 0 / 0 / 0 / 0 |
| Sintaxis | Tres comprobaciones node --check, cada una con salida 0 |
| Esquema | Cinco definiciones compiladas con Ajv2020 en modo estricto |

La regresión usa `node --test --test-concurrency=1 --test-reporter=spec`.
No se modificaron código funcional, timeouts, casos u omisiones para hacerla
pasar. La copia contiene solo la base versionada más estas cinco rutas; no
incluye IA-1 u otros borradores pendientes. El cierre posterior cambia
únicamente esta nota; los cuatro archivos de contrato, parser, wrapper y
pruebas conservan exactamente los bytes probados.

| Criterio SC-1 | Evidencia y alcance del cierre actual |
| --- | --- |
| 1: fuentes exactas | Pruebas de dos IDs/rutas ordenadas, permisos opacos ligados y rechazo de argumentos o recetas; entradas reales no utilizadas |
| 2: lectura y retención | Lectura por bloques y límites de bytes, profundidad, nodos y claves; valores ficticios largos descartados, sin reconstrucción completa ni huella de valores omitidos |
| 3: estructura correcta | Cortes byte a byte, UTF-8/escapes, tipos, claves raíz/anidadas, duplicados, gramática numérica, límites y 80 escenarios diferenciales dentro de la suite |
| 4: privacidad | Valores ficticios no publicados en proyecciones/errores; huella estructural independiente de valores omitidos y sin proyección provisional al fallar |
| 5: identidad y permisos | Symlinks, hardlinks, propietario, escritura ajena, descriptor, carreras, cancelación y cierre tardío probados sobre archivos temporales propios |
| 6: procedencias separadas | Parser provided-bytes-structure frente a wrapper local-structure-observation; effectiveControlsVerified y flags de admisión permanecen false |
| 7: pruebas y preservación | Suite específica y regresión aislada aprobadas; evidencia privada del cierre y cinco rutas exactas, sin renovar las notas del lote real histórico |
| 8: efectos limitados | Instrumentación de whole-read, escritura, red y procesos sin llamadas desde SC-1; sin clientes/cuentas reales, settings modificados u Obsidian |

### Límites conservados

Resultado de quality-gate: **Aprobado con observaciones para consolidación local
de SC-1**, no para una nueva lectura personal o consulta nativa.

Las pruebas del wrapper recorren únicamente archivos sintéticos propios.
Las fuentes reales que pueden contener datos sensibles necesitan una aprobación
específica futura de rutas y efectos. No se hereda su autorización histórica de
este commit. La gramática descarta valores, pero un uso real autorizado podría
recorrer bloques que los contengan transitoriamente.

Los contadores de retención describen el estado del parser, no los buffers del
llamador, copias del runtime, cachés, swap o memoria del sistema operativo.
No prueban borrado forense. Las comprobaciones de identidad/rutas son
cooperativas, no aislamiento atómico frente a otro proceso del mismo usuario.
La orquestación, permisos y dependencias inyectadas son código de confianza.
Un plazo local no cancela mágicamente una operación de disco bloqueada.

La observación estructural de dos fuentes no demuestra configuración efectiva,
ausencia de políticas externas ni control de herramientas o gasto. Los flags
`inferenceRequested`, `nativeExecuted`, `runtimeReady`,
`verifiedAdmission`, `externalBillingVerified` y
`effectiveControlsVerified` siguen false. No se modifica el guard S3.2 ni se
aprueba S3.3. La ejecución secuencial local no certifica otras plataformas o
condiciones de carga. Las fuentes externas conservan su fecha histórica:
no se consultaron nuevamente durante este cierre.

Sin lectura de settings, estado global o credenciales reales de clientes de IA,
consultas de cuentas, ejecución de clientes, edición de configuración, push,
cambios de proyectos, Obsidian, catálogos, conexiones o automatizaciones.
IA-1 y las entregas posteriores mantienen alcance y autorización separados.
