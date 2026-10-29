# IA-2 — Plan de verificación de la variante aislada

## Estado y objetivo

Consolidación local autorizada el 2026-10-08 (America/Bogota): validar cuatro
rutas offline de forma aislada y secuencial, ajustar esta nota, registrar
evidencia privada de entrega y crear un commit local. No incluye IA-2-N, N0,
consultas privadas, clientes, configuración real o push. El resultado actual
se registra al final, separado de los cierres históricos.

Preparado el 2026-10-05 (America/Bogota), tras «autorizo» al proponer preparar
IA-2. Profundidad SDD: rigurosa. Esta aprobación cubre la especificación y su
revisión documental en Agent-Toolkit, no implementación o ejecución nativa.
La aprobación posterior «apruebo» autorizó VP-A–VP-C: planificador y pruebas
offline. Esa base está implementada; no autoriza IA-2-N ni consultas privadas.

[IA-1](agent-client-isolated-variant.md) comprueba consistencia de declaraciones:
una salida favorable no autentica evidencia. [SC-1](agent-client-selective-config.md)
observó estructura, no configuración efectiva. La condición previa de
[S3.2](agent-client-supervised-preflight.md) sigue incompleta.

Objetivo: definir qué evidencia falta para revisar una combinación concreta,
qué se puede comprobar sin arrancarla y qué requiere un alcance nativo separado.
No probar primero para descubrir después qué efectos tuvo el arranque. No
repetir firma/versión/ayuda como sustituto de evidencia de aislamiento.

Usuario afectado: quien quiere coordinar agentes mediante suscripciones, sin
API keys, gasto adicional ni cambios a sus proyectos/configuración personal.
La ruta manual continúa operativa; el plan no declara automatización nativa lista.

## Alcance y puertas

| Entrega | Resultado | Permiso y efectos |
| --- | --- | --- |
| IA-2-D, cerrada | Matriz, criterios, límites y tareas | Preparación documental autorizada; fuentes oficiales |
| IA-2-O, implementada | Planificador de comprobaciones y pruebas offline | VP-A–VP-C aprobados; sin cliente, cuentas o fuentes privadas |
| IA-2-N, eventual | Expediente de una prueba nativa viable y acotada | Requiere alcance nuevo con candidato, fuentes, rutas, receta y efectos exactos |
| S3.2/S3.3, posterior | Revisión de acceso y piloto textual | Conservan sus propios contratos y autorizaciones; no se abren desde IA-2 |

No iniciar IA-2-N como parte de IA-2-O. La autorización de una entrega cubre sus
operaciones normales, no exige preguntas por cada archivo, y no se amplía por
un fallo o por una salida favorable. La implementación offline original no
incluyó operaciones Git; el commit local actual tiene autorización propia de
consolidación, sin push. Sin cambios a Obsidian, automatizaciones, catálogos de
modelos, instalación de herramientas o autenticación.

## VR-01. Preguntas que deben resolverse antes de un arranque

1. ¿Qué candidato exacto, entorno, identidad nativa, fuentes de política y
   combinación se pretende evaluar? Un cambio invalida el binding anterior.
2. ¿Qué efectos puede producir antes de recibir texto y al terminar? No reducir
   el análisis a las herramientas disponibles para el modelo.
3. ¿Existe una fuente autorizada suficiente para excluir efectos no permitidos?
   Ausencia local no acredita ausencia de fuentes remotas/administradas.
4. ¿Puede una comprobación aportar evidencia pertinente sin producir antes el
   mismo efecto que se quiere impedir? Si no, esa comprobación no es admisible.
5. ¿Qué seguirá desconocido después y qué decisión permite realmente el resultado?

El catálogo público no contiene las rutas, hashes, versión o datos personales
de la instalación. La aprobación eventual enumerará esos bindings de forma
privada. No leer ahora expedientes antiguos ni configuración para completarlos.

## VR-02. Matriz de los doce mecanismos

Los IDs corresponden a la [plantilla IA-1](../../../src/client-isolated-variant.js).
Esta matriz define evidencia deseada, no afirma que exista o pueda obtenerse
con el alcance actual. La combinación completa importa, no doce flags aislados.

| Mecanismo | Evidencia pertinente que se exigiría | Límite o condición de parada |
| --- | --- | --- |
| `tools-empty-denied` | Restricción preventiva de herramientas incorporadas y externas en la misma variante, contrastada con una prueba autorizada | Una respuesta que no pidió herramientas no prueba su indisponibilidad |
| `restricted-settings` | Precedencia y fuentes efectivas acotadas para el candidato/entorno exactos | Fuentes administradas no resueltas impiden extrapolar el modo restringido |
| `local-personalizations-excluded` | Exclusión efectiva de personalizaciones locales sin editar sus archivos | Ayuda o estructura local no acreditan que no se cargaron |
| `session-hooks-disabled` | Exclusión preventiva pertinente de hooks de sesión y terminación | No ejecutar un hook-canario real antes de demostrar contención; no asumir alcance sobre hooks administrados |
| `managed-sources-excluded` | Fuente suficiente y autorizada para la política efectiva y su alcance de host | Política remota/embebida desconocida mantiene el bloqueo; ausencia de archivo no basta |
| `strict-empty-mcp` | Composición compatible y exclusión previa de servidores, no solo de sus herramientas | Conflicto administrado bloquea; no quitar la restricción ni conectarse para investigar |
| `connectors-disabled` | Exclusión de descubrimiento y conexión de fuentes de conectores pertinentes | Sin fuente suficiente, no enumerar conectores o cuentas mediante el cliente |
| `browser-ide-excluded` | Ausencia de integración automática y explícita bajo esa combinación | No abrir navegador/IDE ni aceptar un permiso para comprobar si funcionaba |
| `skills-plugins-delegation-excluded` | Exclusión de carga y ejecución auxiliar en el alcance probado | Silencio en la salida no demuestra ausencia de delegación o trabajo interno |
| `minimal-environment` | Descriptor mínimo fijado y evidencia de fuentes de autenticación/proveedor pertinentes | No leer tokens, cambiar HOME, copiar credenciales ni convertir suscripción en API |
| `updates-nonessential-traffic-disabled` | Restricciones preventivas y alcance documentado/ensayado del tráfico no esencial | No equiparar esas restricciones a ausencia de toda red ni probar actualizando |
| `resume-persistence-fallback-excluded` | Sesión nueva, sin continuación/persistencia o fallback solicitado y fuentes efectivas contrastadas | No anunciar cero escrituras/cache ni ausencia de fallback interno sin evidencia |

Cada fila termina en `documented-only`, `structure-only`, `test-scoped`,
`unresolved`, `incompatible` o `not-observable-in-scope`. Son resultados de la
revisión propuesta, no valores nuevos añadidos al esquema IA-1. Documentación,
estructura y declaración humana nunca se convierten automáticamente en prueba.

## VR-03. Procedencia y vinculación de evidencia

Una revisión futura tendrá dos capas separadas:

- Consistencia offline: datos acotados, fechas, referencias, scope y definiciones
  revisados por IA-1. Las referencias son afirmaciones no autenticadas.
- Procedencia de ejecución: registro emitido por un recolector confiable para
  una prueba autorizada, con identidad del lote, comprobación y resultado medido.
  No se acepta un JSON del modelo o una nota que diga «probado» como ese registro.

No hay recolector de efectividad nativa implementado en esta entrega. Su futura
evidencia debe indicar el mecanismo, combinación, candidato, entorno/política,
fecha, método, efecto observable, límites y fallos. Preservar la diferencia entre
«restricción aplicada», «efecto no observado» y «efecto impedido».

No diseñar un adaptador que convierta una huella IA-1 en `locally-observed` de
S3.2. Las nueve condiciones de S3.2 conservan su significado; cualquier integración
requiere diseño y pruebas propios. Ninguna de las dos capas emite permiso nativo,
verifica facturación o certifica ausencia de todos los efectos internos.

Frescura máxima: una hora, ligada al lote y al instante explícito de revisión.
Cambio de artefacto, configuración, política, entorno, modo/rol o definiciones
invalida la evidencia. No actualizar fechas o sustituir referencias para conservar
un resultado favorable. Revocación, rechazo o contradicción detienen la propuesta.

## VR-04. Viabilidad sin efectos circulares

El primer resultado obligatorio será una decisión de viabilidad, antes de
construir una receta ejecutable. Cada comprobación debe justificar su sensor,
lo que puede medir y la contención previa de sus posibles efectos.

| Opción | Utilidad | Decisión para este alcance |
| --- | --- | --- |
| Pruebas con dobles propios | Comprobar planificación, supervisión y rechazo de entradas | Proponibles offline; no certifican el cliente instalado |
| Fuente no secreta autorizada de configuración/política | Resolver condiciones concretas antes del arranque | Pendiente de enumerar fuente suficiente y obtener alcance específico |
| Cliente real con fuentes heredadas desconocidas | Observar retrospectivamente qué ocurrió | No admisible como prueba preventiva |
| Entorno nativo distinto y controlado | Evaluar una variante distinta bajo efectos enumerados | Requiere diseño/permiso nuevos; no extrapolarlo a la sesión original |
| Traspaso manual | Continuar usando las suscripciones sin lanzador automático | Disponible mientras permanezcan condiciones nativas pendientes |

Un canario sintético solo puede ejecutarse dentro de un doble o un entorno con
contención previa aprobada. No escribir hooks/MCP de prueba en los settings del
usuario. Un registro vacío no prueba ausencia de ejecución: el sensor puede no
cubrir una fuente o fase. La documentación oficial tampoco certifica esa cobertura.

El uso de `--init-only`, listado MCP, login, diagnóstico general o una conversación
sin texto útil no sustituye una inspección sin efectos. No proporcionar ahora
una cadena de shell o flags para que el usuario los pruebe por su cuenta.

Si una fila crítica no es observable con los efectos permitidos, cerrar con
`not-observable-in-scope`, indicar la evidencia faltante y conservar la ruta
manual. No generar nuevos lotes idénticos, quitar límites, probar otra cuenta
o presentar el bloqueo como un fallo confirmado de la instalación.

## VR-05. Presupuesto y contrato de parada

En esta entrega y en la implementación offline propuesta: **cero arranques de
clientes, consultas de cuentas e inferencias**. Cero lecturas de fuentes privadas,
settings, keychain, tokens, recibos, transcripciones o artefactos de instalación.

Un futuro expediente IA-2-N debe fijar, antes de aprobarlo:

- Fuente exacta de cada condición previa, sin búsqueda recursiva o glob.
- Candidato y una única receta que mida un requisito concreto; cero reintentos,
  fallback, ampliaciones de permiso o descubrimiento de ejecutables.
- Entorno, directorio de trabajo y datos de entrada concretos; sin proyectos
  reales y sin heredar contexto, historial o conexiones de memoria.
- Destino privado exclusivo, archivos nuevos, permisos y retención permitidos;
  no conservar stdout/stderr, settings, entorno o razonamiento crudos.
- Límites explícitos de plazo, bytes, recursos, terminación local y limpieza
  por identidad; detección de eventos inesperados y salida redactada.
- Acceso a autenticación/cache o tráfico interno que el propio cliente pudiera
  producir, si fuese necesario. No prometer coste cero o cancelación remota.

No fijar ahora números de presupuesto como si existiera una operación nativa
aprobada. El presupuesto se deriva de la receta y sus efectos, no al revés.
Credenciales provistas/API, gasto adicional, helper no excluido, política incierta,
artefacto cambiado, salida inválida o terminación no confirmada bloquean el lote.
No terminar procesos ajenos ni borrar recursos cuya propiedad no se conoce.

## VR-06. Base offline implementada

Se implementó un planificador puro, sin ejecutor ni permiso:
`createIsolatedVerificationPlanner(schema, trustedCatalog)` devuelve
`planIsolatedVerification(input)`.

Input cerrado y hasta 32 KiB, copiado de forma inerte: descripción IA-1,
instante explícito y referencias/declaraciones de evidencia con su alcance.
El catálogo confiable define los doce requisitos y sus métodos admisibles;
no lo suministra un modelo. Sin callbacks, rutas, comandos, argv o recetas libres.
Las declaraciones no se autentican por validarse o coincidir con una huella.

Output cerrado: `invalid`, `blocked` o `plan-review-required`, matriz
de doce requisitos, faltantes y decisión `no-native-start`. `plan-review-required`
significa que el plan offline está completo para revisión, no que sus requisitos
nativos estén cumplidos. Indicadores de ejecución, admisión, efectividad y
facturación siempre falsos. La API no reserva un presupuesto ni crea material
privado; la evidencia privada de esta consolidación pertenece a la entrega,
no al planificador ni a un expediente nativo.

| Dependencia | Resultado | Rutas probables y verificación |
| --- | --- | --- |
| VP-A | Esquema cerrado y catálogo semántico | [Contrato](../../../schemas/agent-client-isolated-verification.schema.json); IDs/estados sin receta |
| VP-B | Planificador puro y bloqueos explícitos | [Planificador](../../../src/client-isolated-verification.js); sin acceso a clientes/archivos/cuentas |
| VP-C | Pruebas sintéticas y documentación | [Pruebas](../../../test/client-isolated-verification.test.js); adversarios, efectos en cero y regresión |

Pruebas mínimas: doce filas exactas; faltantes por mecanismo; documentación o
atestación promovidas; claims de pruebas sin procedencia confiable; scope cambiado;
fechas futuras/caducadas/revocación; política administrada desconocida; sensores
sin cobertura; prueba que necesitaría el efecto prohibido; cambio de entorno;
API/bare; permiso falso; claves duplicadas; getters/proxies/ciclos; Unicode/UTF-8;
coerción/extras/tamaño; orden estable e inmutabilidad. Instrumentar IO/red/procesos,
reloj actual y azar después de importar módulos. No tocar IA-1 ni los guards
anteriores para hacer pasar un caso. La regresión no incluye clientes reales.

### Contrato y significado de los resultados

El catálogo confiable contiene `catalogId`, `variantSchema`, `variantPolicy` y
`checks`. Reutiliza el esquema/política IA-1, sin duplicar o debilitar ese contrato.
`checks` debe coincidir con `ISOLATED_VERIFICATION_CHECKS`: doce definiciones
inmutables con ID, huella, métodos admitidos y cobertura requerida. Se aceptan
permutaciones de conjuntos, no cambios de cobertura o métodos. El llamador
confiable suministra el catálogo y los esquemas; nunca una salida de un modelo.

Métodos cerrados: `documentation-review`, `structure-review`, `fixture-test`
y `native-test`. La fila de herramientas no admite estructura como método de
verificación; la de política administrada no admite una fixture como método
para resolver esa política. El planificador no ejecuta ninguno de los métodos.

El input contiene solo `schemaVersion`, `variant` (entrada IA-1 completa) y
`checks`. El tiempo explícito es `variant.now`. Cada check selecciona mecanismo,
método, cobertura declarada de `pre-start`/`session`/`shutdown`, contención
declarada y evidencia opcional. La cobertura describe el alcance propuesto del
sensor, no lo autentica. Reviews documentales/estructurales requieren
`not-needed`; tests requieren `declared-contained`. Contención desconocida,
necesidad de un efecto prohibido o fases requeridas omitidas bloquean el plan.

Evidencia opcional: proveniencia/base/resultado, referencia no personal, fecha
UTC y huellas de plan/definición. `documented` y `local-structure-observation`
solo permiten `documented-only`/`structure-only`. `operator-attested` queda
`unresolved`. `fixture-claim` permite `test-scoped` **solo como declaración de
una prueba sintética**, no como prueba ejecutada o autenticada. `native-claim`
queda bloqueada por falta de procedencia confiable; no existe un campo que
el llamador pueda poner a `true` para sustituirla. `rejected` o incompatibilidad
producen una fila incompatible. Evidencia desconocida/ausente conserva faltantes.

Se reutiliza la evaluación IA-1: bloqueo allí bloquea aquí. Falta de selección de
un mecanismo impide una propuesta completa; falta de observación estructural
aparece en la fila correspondiente. Política administrada desconocida/ausente
y autenticación desconocida bloquean explícitamente. Ausencia local declarada
no prueba exclusión efectiva: todas las filas retienen `native-effectiveness-evidence`
y `trusted-provenance`, y `evidenceAuthenticated: false`.

`planSha256` liga scope IA-1, catálogo/definiciones y selección de métodos,
cobertura/contención ordenados; no incluye la propia evidencia ni el reloj.
Un borrador sin evidencia devuelve esa huella para vincular referencias, no
para firmarlas o autenticarlas. Cambiar política, candidato, entorno o plan
invalida referencias anteriores; caducidad, futuro o revocación bloquean.
Frescura limitada por la política IA-1 hasta una hora, incluido el límite exacto.

La matriz siempre tiene doce filas, incluso ante input inválido, y sus campos
son cerrados. Errores redactados, sin valores/IDs arbitrarios de entrada.
Input y catálogo hasta 32 KiB; JSON/UTF-8/Unicode/calendario estrictos, sin
coerción, claves duplicadas, getters, proxies o ciclos. Copias inertes de esquema,
catálogo e input; cambios posteriores del llamador no alteran el constructor.
Las referencias deben ser IDs no secretos: validar su formato no puede detectar
una credencial disimulada como ID. No usar datos personales en esos campos.

`plan-review-required` significa doce comprobaciones propuestas coherentes para
revisión, aun con evidencia pendiente. Nunca equivale a que se ejecutaron o
cumplieron controles nativos. `decision: no-native-start` y los cinco indicadores
de ejecución/admisión/efectividad/facturación permanecen siempre negativos.

Reversión: no integrar el planificador con el lanzador. La ruta manual y los
contratos anteriores continúan sin cambio. No borrar evidencia previa ni reducir
los requisitos por conveniencia.

## Criterios de aceptación de IA-2-D

1. Los doce mecanismos de IA-1 tienen evidencia y límite concretos.
2. Fuentes/efectos de arranque y terminación se consideran antes de una prueba.
3. Documentación, estructura, claims y resultados medidos permanecen separados.
4. Existe salida útil para incompatibilidad o evidencia no observable; sin bucle
   de inspecciones repetidas o ampliaciones de permisos.
5. VP-A–VP-C son verificables offline y no conceden admisión nativa.
6. La ejecución posterior requiere expediente propio; no se reutilizan permisos.
7. Sin secretos/datos de proyectos, cambios funcionales, clientes o consultas privadas.
8. Enlaces, formato, alcance y preservación se comprueban antes del cierre.

## Fuentes oficiales y límite de las inferencias

Consultadas el 2026-10-05 (America/Bogota). Describen el producto, no la instalación:

- Restringido conserva política administrada; safe mode también conserva algunos
  efectos de esa política. Herramientas incorporadas y MCP no son el mismo control;
  `--init-only` puede ejecutar hooks. [Referencia CLI](https://code.claude.com/docs/en/cli-reference).
- El override de hooks personal/de sesión no desactiva hooks administrados.
  [Referencia de hooks](https://code.claude.com/docs/en/hooks).
- MCP estricto puede entrar en conflicto con el archivo administrado y provocar
  rechazo al inicio. [MCP administrado](https://code.claude.com/docs/en/managed-mcp).
- Bare no usa el login de suscripción; una sesión print normal puede cargar
  fuentes locales. SIGTERM puede ejecutar hooks de terminación: matar el proceso
  no es por sí solo prueba de aislamiento. [Ejecución programática](https://code.claude.com/docs/en/headless).

Inferencia de diseño: estas diferencias exigen revisar la combinación y sus
fases, no coleccionar flags. No se ha encontrado ni verificado aquí un método
sin efectos que resuelva toda la política efectiva de la instalación. Esto
mantiene condiciones pendientes; no demuestra imposibilidad universal.

## Revisión documental inicial (histórica)

Resultado de quality-gate: **Aprobado con observaciones para el plan documental**.
SDD separó diseño, base offline y ejecución nativa. La revisión conserva una
parada útil cuando no existe una fuente o sensor suficiente, sin promover
declaraciones a pruebas ni cambiar los gates anteriores.

Comprobación: 2026-10-05 (America/Bogota).

- Correspondencia automática: doce filas, mismos IDs y orden que la plantilla
  inmutable de IA-1, sin mecanismos añadidos u omitidos.
- Dos documentos: 7 enlaces locales existentes, 9 tablas consistentes,
  salto final y espacios correctos; `git diff --check` limpio e índice sin staging.
- Batería existente IA-1 ejecutada: **143/143**, 335 ms; cero fallos,
  canceladas, omitidas o pendientes. No son pruebas de implementación IA-2.
  No se repitió la regresión completa porque no hubo cambios funcionales;
  las 2 354 pruebas del cierre anterior conservan su fecha y alcance anteriores.
- Escaneo limitado de patrones sensibles sin hallazgos; no certifica ausencia
  universal de secretos. No se consultaron fuentes de configuración privadas.
- Preservación SHA-256: 193 de 194 archivos previos intactos; solo el índice
  propio IA-1 actualizado, un documento nuevo y cero borrados.

| Criterio | Evidencia documental o comprobación |
| --- | --- |
| 1 | Matriz de doce mecanismos contrastada automáticamente con IA-1 |
| 2 | Preguntas previas, fase de terminación y condiciones de viabilidad |
| 3 | Capas de consistencia/procedencia y límites de cada resultado |
| 4 | Resultado no observable, parada sin reintento y ruta manual conservada |
| 5 | VP-A–VP-C definidos; output siempre no-native-start, sin ejecución |
| 6 | Alcance distinto por etapa, sin recetas o presupuestos nativos aprobados |
| 7 | Solo dos documentos; preservación, fuentes oficiales y escaneo limitado |
| 8 | Enlaces/tablas/formato, pruebas IA-1 e índice sin staging |

Observaciones: procedencia confiable y comprobación de política efectiva siguen
pendientes. No se leyeron expedientes privados, cuentas, settings, artefactos
instalados o credenciales. Sin clientes, prompts, material privado nuevo,
cambios de configuración/proyectos/memoria, automatizaciones, commit o push.
En ese cierre VP-A–VP-C requerían aprobación antes de construir la base;
recibida posteriormente para la implementación offline, no para un cliente.

## Cierre histórico de implementación VP-A–VP-C

Verificación offline: 2026-10-05 (America/Bogota).

- Batería propia inicial: **146/146**; reforzada durante revisión para identificar
  selección de mecanismos y referencias estructurales faltantes por fila.
  Batería final: **159/159**, 445 ms, sin fallos, canceladas, omitidas o pendientes.
- Regresión completa final: **2 513/2 513**, 81 874 ms, concurrencia dos;
  cero fallos, canceladas, omitidas o pendientes. Sin cuentas/clientes reales.
- Constructor/evaluación instrumentados después de importar: cero llamadas a
  APIs de IO, procesos, red, reloj actual o azar. Se permiten hashing y evaluación
  de instantes explícitos; no se comprueba un estado del proveedor.
- Sintaxis y compilación de esquemas comprobadas; informes cerrados, matriz de
  doce filas, límite exacto de 32 KiB, inmutabilidad y orden estable verificados.
- Dos documentos: 10 enlaces locales existentes y 10 tablas consistentes;
  formato correcto. Escaneo limitado de patrones sensibles sin hallazgos.
- Preservación SHA-256: 193 de 195 archivos previos intactos; solo los dos
  documentos propios modificados, tres archivos nuevos y cero borrados.
  `git diff --check` limpio e índice sin staging.

| Criterio de la base | Evidencia ejecutada |
| --- | --- |
| Doce requisitos | Filas exactas y selección/check/cobertura faltantes por mecanismo |
| Efectos preventivos | Contención desconocida/prohibida, cobertura por fase y métodos incompatibles bloqueados |
| Procedencia | Documento/estructura/atestación/fixture diferenciados; native-claim sin autenticación bloqueada |
| Scope y frescura | Cambio de candidato, entorno, política/catálogo/método; fechas, revocación y rechazo |
| Entradas adversarias | JSON duplicado, Unicode/UTF-8, proxies/getters/ciclos, coerción/extras y permisos falsos |
| Sin permiso real | no-native-start, indicadores siempre falsos y faltantes nativos en todas las filas |
| Efectos e integración | Instrumentación pura, regresión y contratos IA-1/S3.2/C1/S1 sin modificaciones |
| Privacidad y entrega | Errores redactados, fuentes ficticias, preservación y Git sin mutaciones |

Resultado de quality-gate: **Aprobado con observaciones para la base offline**.
Las skills de especificación y calidad mantuvieron separado un plan coherente
de una instalación verificada y reforzaron los faltantes por mecanismo.
No hay fuente/recolector nativo de procedencia confiable en esta entrega;
no se ha comprobado política efectiva, login, cuota, aislamiento o facturación.

Sin lecturas de configuración/evidencia privada, clientes, cuentas, prompts,
material privado nuevo, proyectos/Obsidian, automatizaciones, commit o push.
La siguiente puerta es definir un expediente nativo viable con fuentes y
efectos exactos; si no hay fuente suficiente para una condición crítica,
conservar el bloqueo concreto y el traspaso manual, no repetir pruebas sintéticas
como sustituto. El borrador local N0,
`docs/agentes/clientes/agent-client-isolated-native-feasibility.md`, delimita fuentes y pendientes
externos, pero no se incorpora a esta entrega versionada. No ejecuta aquí un
inventario, crea otro evaluador o resuelve política efectiva por presunción.
IA-2-N/S3.2/S3.3 siguen sin ejecución autorizada.
## Consolidación versionada local IA-2 — 2026-10-08

Este cierre tiene autorización propia para cuatro rutas offline: validación
aislada y secuencial, ajustes de esta nota, evidencia privada de entrega y
commit local. No renueva los cierres históricos IA-2-D/VP-A–VP-C ni ejecuta
IA-2-N, N0, un inventario privado o un cliente real.

### Evidencia independiente

Comprobación local: macOS arm64, Node `v24.14.1`.

| Comprobación | Resultado observado |
| --- | --- |
| Suite propia de la revisión del 2026-10-07, mismos bytes del candidato | 159/159; salida 0; 2 692,843375 ms |
| Regresión aislada: base versionada más cuatro rutas IA-2 | 2 861/2 861; salida 0; 152 053,699833 ms |
| Casos de la base / casos añadidos IA-2 | 2 702 / 159 |
| Fallos, canceladas, omitidas y pendientes de las baterías finales | 0 / 0 / 0 / 0 |
| Sintaxis | Dos comprobaciones node --check, cada una con salida 0 |
| Esquema | Catorce definiciones compiladas con Ajv2020 en modo estricto y dependencia IA-1 registrada |

La regresión usa `node --test --test-concurrency=1 --test-reporter=spec`.
No se cambiaron código funcional, tiempos, casos u omisiones para hacerla
pasar. La copia incluye solo la base versionada más las cuatro rutas de IA-2,
no N0 ni otros borradores. Después de las pruebas solo cambió esta nota:
esquema, planificador y pruebas conservan los bytes probados.

| Criterio de la base | Evidencia y límites del cierre actual |
| --- | --- |
| Doce requisitos | Matriz exacta incluso ante input inválido; selección, check, cobertura y referencias estructurales faltantes por fila |
| Efectos preventivos | Contención desconocida/prohibida, fases omitidas y métodos incompatibles bloqueados; no se ensaya un efecto nativo |
| Procedencia | Documento, estructura, atestación y fixture-claim mantienen alcance limitado; native-claim bloqueada sin procedencia confiable |
| Scope y frescura | Binding de variante/catálogo/plan/definiciones, cambio de candidato/entorno/política/método, fechas futuras/vencidas y revocación |
| Entradas adversarias | JSON duplicado, Unicode/UTF-8/calendario, límite exacto de 32 KiB, coerción/extras, permisos falsos, getters/proxies/ciclos |
| Sin permiso real | decision: no-native-start; evidenceAuthenticated false; efectividad nativa y procedencia confiable pendientes en todas las filas |
| Efectos e integración | Constructor/planificación instrumentados tras importar sin IO, red, procesos, reloj actual o azar; contratos previos intactos |
| Privacidad y entrega | Datos ficticios y errores acotados; cuatro rutas exactas, trabajo ajeno conservado y commit solo bajo esta autorización |

### Límites conservados

Resultado de quality-gate: **Aprobado con observaciones para consolidación
local offline de IA-2**, no para pruebas nativas o admisión.

`plan-review-required` significa que la propuesta es coherente para revisión,
no que se ejecutaron sus métodos o se cumplieron controles. Cada fila mantiene
`evidenceAuthenticated: false` y los faltantes de efectividad nativa/procedencia
confiable. `decision: no-native-start` permanece fija. `executed`,
`runtimeReady`, `verifiedAdmission`, `externalBillingVerified` y
`effectiveIsolationVerified` permanecen false.

Las referencias y huellas no son firmas, consentimiento o registros medidos.
Un estado `test-scoped` solo describe una declaración sintética coherente.
Catálogo, esquemas y política pertenecen a código de confianza; el formato de
un ID no detecta secretos o datos personales codificados en él. El instante
UTC explícito y la coherencia de fechas tampoco autentican un reloj o evidencia.

La instrumentación se limita a constructor/planificador después de importar
módulos; no certifica ausencia de lectura durante la carga ni aislamiento de
código malicioso. Esta ejecución secuencial en macOS arm64 no certifica todas
las plataformas, cargas, sensores, coberturas o políticas efectivas de un cliente.

Las fuentes externas conservan su fecha histórica; no se consultaron nuevamente
en este cierre. Sin lecturas de configuración, credenciales o evidencia privada
de instalación, clientes, cuentas, prompts, flags/recetas operativas, cambios a
proyectos, Obsidian, catálogos de modelos, conexiones o automatizaciones. Sin
push. N0 y las pruebas nativas posteriores mantienen alcance y permiso propios.
