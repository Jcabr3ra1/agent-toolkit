# TP — Preparar un encargo manual desde el selector

## Estado y alcance aprobado de esta entrega

Especificación preparada el 2026-10-06 (America/Bogota), tras «apruebo» a
redactar el diseño de `agent-task prepare`. Profundidad SDD: rigurosa por contexto
privado, autoría y separación entre una recomendación y un permiso real.
La aprobación inicial cubrió el documento. Después el usuario aprobó la
especificación y la implementación/pruebas offline TP-A a TP-D, ahora entregadas.
No se autorizó ejecutar IA, consultar cuentas, instalar, hacer commit o push.

El propósito es conectar piezas existentes en una entrada fácil de usar:
recibir datos explícitos de una tarea, recomendar modelo/esfuerzo mediante
el selector existente y producir un borrador de encargo que una persona revisa
antes de entregarlo manualmente a otro agente. No resolver la admisión nativa
mediante un cambio de nombre o un camino alternativo.

## TP-01. Estado real y problema

- El [selector](agent-model-selector.md) implementa decisiones puras v1 y
  [preferencias v2](agent-model-preference.md); no tiene entrada CLI.
- Las [plantillas del equipo](../templates/agent-team/README.md) ya distinguen
  identidad, tutor/autónomo, base, permiso, selección y revisión, pero se rellenan
  manualmente. El [contrato de traspaso](agent-team-model-handoff.md) separa
  recomendación y observación del modelo.
- Antes de TP, `package.json` solo exponía `project-memory`. Ahora declara
  también `agent-task`, con bin separado que no importa la CLI de memoria,
  runtime/adaptadores, Git, sincronización o conexiones.
- La ejecución de clientes permanece separada: AD-3 (diagnóstico de autenticación, etapa separada)
  no está admitida. Preparar texto no cambia ese estado ni acredita una cuenta.

Necesidad: dejar de ensamblar manualmente los mismos bloques, sin enviar una
conversación completa, contratar APIs o convertir un borrador en autorización.
La primera base no interpreta una necesidad libre usando IA: el coordinador
clasifica tarea, riesgo y dificultad de forma explícita, como exige el selector.

## TP-02. Resultado y exclusiones

Una invocación prepara **un destinatario/rol y una revisión**, no un equipo
entero o varios pasos en ejecución. El recorrido Claude propone → Gemini aplica
→ Codex revisa necesita encargos/decisiones independientes, aunque compartan
identidad de tarea y conserven su historial.

Incluido en la implementación aprobada:

1. Contrato cerrado de datos del encargo y reporte de preparación.
2. Núcleo puro que llama al selector existente, comprueba coherencia y arma el
   borrador, sin IO del proyecto.
3. CLI local que lee únicamente cuatro documentos JSON indicados explícitamente
   y esquemas empaquetados; muestra resumen o, si se pide, texto Markdown.
4. Pruebas y ejemplos exclusivamente ficticios; documentación de límites.

Fuera de alcance: clientes reales, cuenta/auth/usage, red, API keys, facturación,
modelos nuevos descubiertos automáticamente, inferencia, cambio del modelo del
chat, shell/comandos de pruebas, Git, lectura de código/notas/instrucciones,
MCP, envío entre chats, escritura de encargos, persistencia de historial,
watchers, memoria/Obsidian, instalación global, dependencias nuevas y cambios
del código de proyectos. No crear `02-propuesta.md` o `03-revision.md` reales.

## TP-03. Interfaz implementada localmente

```text
agent-task prepare --task <archivo> --request <archivo> --catalog <archivo> --policy <archivo>
agent-task prepare --task <archivo> --request <archivo> --catalog <archivo> --policy <archivo> --json
agent-task prepare --task <archivo> --request <archivo> --catalog <archivo> --policy <archivo> --show-brief
agent-task --help
```

Estos ejemplos con nombre corto requieren instalación explícita previa. La
entrega local se ejecuta con `node bin/agent-task.js`, sin instalación global o
modificación de PATH. `package.json` y el mapa bin de `package-lock.json`
declaran el segundo bin; dependencias y `project-memory` permanecen intactos.

Las cuatro opciones de entrada son obligatorias, únicas y con valor. Rechazar
opciones desconocidas/repetidas, argumentos posicionales, nombres de archivo
ambiguos y combinaciones `--json --show-brief`. No `--apply`, `--send`, `--run`,
`--output`, `--force`, modos/modelos por defecto o acceso a stdin como JSON.
La ayuda no lee entradas ni abre rutas de un proyecto.

Por defecto: resumen acotado sin objetivo, cuerpo del encargo, rutas privadas,
inventario completo o referencias personales. `--json` entrega esa misma
proyección resumida y estructurada, no el catálogo/solicitud completos.
`--show-brief` solicita explícitamente el borrador privado completo en stdout,
solo si la preparación terminó correctamente. El terminal puede conservarlo;
no se promete privacidad del scrollback, logs o redirecciones del usuario.

La herramienta no genera comandos para arrancar proveedores ni flags no verificados.
Los checks recibidos se representan únicamente como datos JSON no ejecutados;
no se certifica que sean seguros o estén autorizados por contenerlos el encargo.
Indica qué cliente/modelo/esfuerzo se recomienda elegir manualmente, no cómo
evadir permisos. Exit 0: prepared-draft o ayuda; 1: needs-info/blocked;
2: invalid, lectura/formato/configuración/salida fallida. Errores sin stack,
payload, rutas, valores desconocidos o contenido sensible en stderr.

## TP-04. Entradas y procedencia

El esquema nuevo tiene versión propia `1.0.0`, independiente de los documentos
del selector. La primera CLI acepta request/catalog/policy **todos v2.0.0** para
ofrecer familia/versiones/esfuerzo. Rechazar mezcla o v1 en esta CLI no elimina
el soporte v1 de la biblioteca existente; no migrar documentos silenciosamente.

| Entrada | Datos requeridos y significado |
| --- | --- |
| task | Identidad, título/objetivo, paso o entrega, base declarada, rutas, reglas del proyecto declaradas, contexto por referencia, criterios y comprobaciones |
| request | Solicitud v2 del selector: rol/ruta, clasificación, requisitos, acciones declaradas, historial, disponibilidad e instante explícito |
| catalog | Catálogo v2 proporcionado y revisado por el coordinador; no descubierto en cuentas o menús |
| policy | Política v2 coherente con el catálogo; ruta, familias/esfuerzo y límites previamente definidos |

Identidad de task: projectId/taskId/revision/role/mode, iguales a request.
Título hasta 160 caracteres; objetivo hasta 2.000. Tutor requiere número y
descripción de un único paso; autónomo declara una entrega acotada, no un loop.
Ambos incluyen criterios concretos y referencias que el receptor podrá revisar.

La base declarada contiene repositoryRoot absoluto normalizado, branch y HEAD
completo; estado inicial con entradas de ruta/operación/propietario declarado;
referencias exactas a instrucciones y modos/escritor permitidos por el proyecto.
No afirmar que el preparador leyó Git o esos archivos: **base e instrucciones
siguen sin verificar**. Tampoco inferirlos desde cwd.

Rutas previstas: relativas exactas al repositorio, sin glob, `..`, dot segments,
barra inversa, controles, rutas absolutas o alias normalizados ambiguos. Rechazar
duplicados/colisiones de case y Unicode NFC. Cada una declara inspect/modify/create
y SHA-256 de bytes esperados o ausencia explícita para creación. Operación
prevista no equivale a permiso del agente: en tutor, modify/create corresponden
al usuario, no al tutor/proponente.

Contexto: referencias acotadas con ID, tipo, localizador y huella conocida o
null explícito; no cuerpos de archivos, imágenes o conversaciones. Son texto,
no rutas/URLs que se deban resolver automáticamente. Las fuentes de memoria
pueden referirse fuera del repositorio, pero aquí no se abre ninguna.
Checks: comando y directorio como **datos declarados**, no shell ejecutable.

Usar hasta 64 rutas, 32 referencias de contexto, 32 criterios, 16 checks y
32 entradas de estado inicial. Textos individuales hasta 1.000 caracteres
salvo título/objetivo; localizadores/repositorio hasta 4.096. Límites globales
de TP-08 prevalecen. HEAD: SHA hexadecimal completo de 40 o 64 caracteres;
huellas de contenido: SHA-256 de 64, no intercambiar ambos conceptos.

Historial y autorización se conservan desde request; task añade referencias
a entregas anteriores (ruta/revisión/huella), alcance y exclusiones. Si hay
consumo o rondas previos, exigir referencias declaradas; no rellenar contadores
con cero ni afirmar que referencias/huellas autentican ese historial.
El consumo real y la autorización siguen requiriendo contraste externo.

## TP-05. Coherencia y selección sin efectos

API implementada: `createTaskPreparer(taskSchema, baseSelectionSchema, preferenceSchema)`
devuelve `{ prepareTask, summarize }`; `prepareTask({ task, request, catalog, policy })`
construye el reporte privado y `summarize(report)` la proyección CLI. Los tres esquemas
son recursos empaquetados confiables, nunca proporcionados por un encargo.
El núcleo no obtiene reloj, aleatoriedad, archivos, red o procesos.

Orden de decisión:

1. Copiar JSON inerte acotado, sin getters/proxies/toJSON/ciclos; validar task
   y envelope cerrados. Validar Unicode y patrones sensibles antes de emitir.
2. Comprobar identidad, revisión, rol/modo, rutas, criterios y coherencia con
   reglas declaradas del proyecto. Datos estructurales erróneos: invalid;
   conflicto de autoría/alcance: blocked. No ocultar el conflicto escogiendo otro rol.
3. Invocar `createModelSelector(baseSchema, preferenceSchema)` con request,
   catalog y policy originales. No reordenar políticas, inventar evaluación,
   actualizar disponibilidad/fechas o añadir permisos para lograr recommended.
4. Propagar needs-info/blocked/invalid del selector sin borrador. Solo recommended
   y tarea coherente habilitan prepared-draft; nunca ready/approved.
5. Construir una proyección de la selección vinculada al destinatario y renderizar
   un borrador determinista. Igual entrada, igual resultado; arrays mantienen
   orden significativo. No recomponer una decisión a partir del texto renderizado.

El instante `request.evaluationTime` es explícito y declarado. El resumen debe
avisar que no comprueba actualidad frente al reloj ni consulta la cuenta.
Una fecha válida no demuestra disponibilidad hoy ni autentica su evidencia.
Una futura comprobación de vigencia real necesita una etapa separada, no una
reescritura de checkedAt que preserve apariencia de éxito.

Conservar familia, ordinal de versión, regla/progresión de esfuerzo, evidencias,
elección explícita compatible, exclusiones y todas las huellas canónicas v2.
La elección sigue siendo la más reciente **admisible según datos revisados**
dentro de una familia adecuada; no el modelo global más nuevo ni `latest`.
Modelo observado: lista vacía y verificación unknown. No validar modelos
inventados como perfiles reales ni importar inventarios privados a ejemplos.

## TP-06. Autoría, permisos y borrador

| Modo/rol | Qué se puede preparar | Qué no concede |
| --- | --- | --- |
| Tutor | Un paso explicado con usuario escritor; coordinador/tutor/proponente/revisor según request | Escritura de Gemini o del proponente, salto de paso sin revisión |
| Autónomo, proponente | Una propuesta de cambios delimitada; escritor futuro identificado | Aplicar los cambios o seleccionar al ejecutor con la decisión del proponente |
| Autónomo, ejecutor | Encargo draft vinculado a propuesta previa por revisión/huella | Certificar la propuesta, validar permiso humano o ejecutar automáticamente |
| Revisor/coordinador | Revisión/preparación acotada, respetando modo y acciones declaradas | Otorgar permisos a otro agente o convertir declaraciones en pruebas |

Tutor con apply, escritor distinto de user, ejecutor funcional o solicitud de
equipo que escriba: blocked/invalid según el contrato. Autónomo incompatible
con reglas declaradas del proyecto también bloquea. Si faltan datos críticos
de request, conservar needs-info; no activar tutor/autónomo por inferencia.
El ejecutor requiere propuesta previa declarada y acciones coherentes con su rol.

Todo borrador comienza con aviso visible: pendiente de revisión/permiso directo,
datos declarados, no ejecución. Su forma sigue las secciones de
[01-encargo.md](../templates/agent-team/01-encargo.md), incluyendo objetivo,
base, contexto, autorización declarada, selección, historial, criterios y entrega.
No modificar las plantillas originales ni inventar decisionFileSha256: no hay
archivo de decisión guardado. La comparación de bytes del archivo generado
corresponde a quien lo guarde posteriormente con autorización aparte.

Contenido del encargo es dato no confiable: no podrá redefinir las guardas
del preparador ni pasar por instrucciones del sistema. Escapar delimitadores,
controles de terminal, HTML/Markdown activo y fences en los campos; no crear
links/imágenes ejecutables o secciones de autorización falsas a partir de texto.
Esto reduce ambigüedad de renderizado; **no garantiza inmunidad del receptor
a prompt injection**. El receptor mantiene instrucciones superiores y debe
revisar permiso/base en su sesión antes de actuar.

Los permisos normales ya concedidos en un canal confiable no se preguntan por
cada archivo. La referencia que aparezca en un JSON no constituye ese canal.
Preparar/salvar/copiar texto no autoriza Git, PR, memoria, despliegues, gastos,
fallback, cambios de proveedor o reducción de protecciones.

## TP-07. Reporte y exposición del texto

Contrato cerrado con estados prepared-draft, needs-info, blocked, invalid.
Separar `selectionState` del estado de preparación. Si task no valida, no copiar
su identidad o propiedades desconocidas al error. Motivos/campos faltantes son
códigos conocidos y acotados, nunca mensajes crudos de Ajv o del SO.

El reporte interno incluye identidad válida, decisión proyectada, borrador solo
si prepared-draft, restricciones y audit. El resumen CLI excluye todo cuerpo,
rutas/contexto/historial detallado e inventarios completos; puede contener IDs
y modelo solicitado, que **no son garantía de anonimización**.

Siempre: executed/sent/wrote/permissionVerified/sourceBaseVerified/runtimeReady/
verifiedAdmission false, modelVerification unknown y observedModels vacío.
No declarar consumo cero de la tarea: se conservan sus contadores recibidos;
esta preparación no solicita inferencia ni consulta gasto.

Audit distingue hashes canónicos del task/request/catalog/policy y esquemas
de los hashes de bytes de los cuatro archivos leídos por la CLI. La API pura
no inventa estos últimos. No incluir rutas reales de entrada en el resumen.
Las huellas no prueban autorización, ausencia de secretos o vigencia del proyecto.

Componer y validar toda la salida antes de escribir en stdout. Si se supera
el techo de salida, no truncar el borrador ni entregar una sección incompleta
como encargo válido. Un fallo de pipe puede producir escritura parcial del SO;
reportar fallo sin retry, no prometer stdout transaccional ni borrar logs externos.

## TP-08. Lectura y límites de la CLI

Resolver solo los cuatro nombres explícitos respecto al cwd de la invocación;
no cargar rc/configuración de HOME, `.agents`, defaults, manifiestos, catálogo
global, instrucciones del proyecto o archivos referenciados dentro de los JSON.
Los esquemas locales se cargan desde rutas fijas del paquete sin descargar refs.
`repositoryRoot` no concede ninguna lectura adicional.

Cada entrada debe ser archivo regular del usuario actual, no symlink/hardlink,
sin escritura de grupo/otros. Comprobar componentes físicos, abrir sin seguir
symlinks y comparar identidad/tamaño/mtime/ctime antes y después de la lectura;
rechazar cambios, rutas repetidas, archivos especiales o inexistentes. Los
checks son cooperativos, no contención atómica del namespace.
Poder leer un archivo 0644 no lo hace privado; el coordinador es responsable
de guardar encargos reales en ubicaciones privadas. No chmod ni copiarlo aquí.
La primera capa de archivos se verifica en macOS/Linux con identidad POSIX;
no afirmar soporte equivalente en Windows sin diseñar/probar su contrato aparte.

| Recurso | Techo inicial |
| --- | --- |
| Entradas explícitas | Cuatro archivos, 512 KiB cada uno; 2 MiB totales |
| JSON decodificado | 30.000 nodos, profundidad 32, arrays de 256, 2.000.000 bytes de texto UTF-8 acumulado |
| Preparación/renderizado | 128 KiB de borrador; 8 KiB de resumen; sin truncado |
| Intentos de cliente/red | Ninguno; no retry ni fallback |
| Persistencia/escritura | Ninguna, salvo la salida pedida en el terminal |

Rechazar UTF-8/Unicode inválidos, claves duplicadas incluso escapadas/nested,
números no finitos o precisión perdida, claves peligrosas, arrays huecos y
tipos no JSON. No llamar JSON.parse del documento sin una validación previa de
duplicados. `copyInertJson`/`client-output-json` son candidatos reutilizables;
adaptar límites más estrictos en la capa nueva sin debilitar sus consumidores.

La implementación reutiliza esas utilidades y añade el límite de profundidad
32, controles/Unicode y una comprobación de números por su round-trip decimal
JSON. No promete representar racionales decimales con precisión arbitraria;
rechaza enteros inseguros, underflow y decimales que cambiarían al serializar.
Un reporte expandido del selector que exceda el contrato/límites también falla
cerrado, sin truncar evidencia ni devolver un borrador incompleto.

Reutilizar `containsSensitiveData` e `isCredentialPath` de
[sensitive-data.js](../src/sensitive-data.js) donde corresponda, sobre valores
decodificados además del texto. Un patrón sensible bloquea sin imprimir el
hallazgo. El filtro es parcial, no una certificación de que se puede compartir
el encargo. No abrir `.env`, credenciales o claves como entradas/contexto
operativo ni permitir que flags conviertan esa política en opcional.

No se promete cancelación universal o plazo duro para IO del SO. La base limita
datos y rutas, sin inventar un timeout que garantice interrumpir toda lectura.

## TP-09. Plan de implementación por dependencias

| Tarea | Resultado verificable | Rutas previstas |
| --- | --- | --- |
| TP-A | Esquema cerrado task/reporte y fixtures ficticios | schemas/agent-task-prepare.schema.json, examples/task-prepare/ |
| TP-B | Preparación pura y renderizado con selector v2 | src/task-prepare.js, test/task-prepare.test.js |
| TP-C | Lectura limitada, CLI y bin separado | src/task-prepare-files.js, src/task-cli.js, bin/agent-task.js, package.json, test/task-cli.test.js |
| TP-D | Guía y cierre con regresión/preservación | Este documento y docs/uso.md; sin actualizar memoria real |

TP-A a TP-D podrán ejecutarse como **una entrega** tras aprobar esta
especificación y autorizar implementación/pruebas offline. No se necesita
aprobación por archivo o test normal del alcance. Cambios de alcance,
clientes/cuentas, escrituras privadas, instalación, commit o push necesitan
autorización distinta. No añadir subagentes ni pruebas reales implícitas.

Mantener módulos/esquemas selectores, plantillas, CLI de memoria y gates nativos
intactos salvo que una incompatibilidad real requiera proponer un cambio aparte.
No importar el runtime/adaptadores o la CLI de memoria al nuevo bin.
Reversión futura: retirar únicamente rutas propias de TP y la entrada bin nueva;
no resetear el repositorio ni borrar trabajo ajeno o encargos privados.

## TP-10. Criterios y comprobación prevista

| ID | Criterio | Evidencia requerida antes del cierre funcional |
| --- | --- | --- |
| CA-01 | Una identidad/revisión/rol coherentes por invocación | Tutor y proponente/ejecutor/revisor ficticios, cruces rechazados |
| CA-02 | Selector v2 reutilizado sin alterar política | Mismos perfiles/esfuerzos/hashes que llamada directa, regresión v1 intacta |
| CA-03 | Familia/versiones/esfuerzo explicados sin default | Candidata reciente, ordinal desconocido, esfuerzo distinto, explicit choice |
| CA-04 | Omisión/conflicto no produce encargo listo | needs-info/blocked/invalid sin borrador; recommended solo prepared-draft |
| CA-05 | Autoría y acciones del proyecto conservadas | Tutor no apply/Gemini escritor; autónomo requiere alcance declarado compatible |
| CA-06 | Preparación no verifica permiso/base/modelo | Todos los flags de verificación false y observación unknown, incluso con hashes |
| CA-07 | Historial no se reinicia al cambiar rol/revisión | Consumo/rondas previos conservados, referencias faltantes y techo bloqueados |
| CA-08 | Privacidad y texto no gobiernan el preparador | Getters/proxies, duplicados, Unicode, patrones sensibles, escapes y campos ajenos |
| CA-09 | Core determinista y sin IO | Entradas congeladas; spies de archivos/red/procesos/reloj; salida independiente |
| CA-10 | CLI solo lee las rutas explícitas | Symlinks/hardlinks/especiales, reemplazo/overflow; referencias nunca abiertas |
| CA-11 | Resumen seguro por defecto y exposición explícita | Objetivo/rutas/secretos no salen por defecto, --show-brief solo en éxito, pipe error |
| CA-12 | Contrato CLI estable y sin instalación automática | Ayuda sin IO; flags inválidos/duplicados, exit 0/1/2, package bin y CLI anterior |
| CA-13 | No iniciar cuentas/IA ni debilitar AD/S3.2 | Spies/cero llamadas, huellas de módulos/gates, regresión previa completa |
| CA-14 | Entrega trazable sin datos de proyectos | Ejemplos ficticios, enlaces/formato/secret scan, diff y preservación SHA-256 |

Estos criterios describen pruebas futuras, no resultados ya ejecutados del
preparador. Las pruebas de bibliotecas existentes no acreditan TP-B o TP-C.

## TP-11. Revisión de esta especificación

Diseño guiado por la skill `spec-driven-development`: separar ensamblado,
selección declarada, exposición de texto y permiso de ejecución. Se inspeccionaron
selector/preferencias, contratos de traspaso, plantilla y CLI actuales; los
límites nuevos no modifican los módulos existentes.

Comprobación de dependencias existentes: 197 pruebas de model-selection y
model-preference aprobadas, 238 ms, sin fallos/canceladas/omitidas/pendientes.
Solo datos ficticios; no hubo inferencias. No se repitió la regresión completa
ni se implementaron schema/core/CLI de TP en esta entrega documental.

Revisión documental: siete enlaces locales existentes, cinco tablas consistentes,
bloque de comandos cerrado, salto final y sin whitespace sobrante. Escaneo
limitado de patrones sensibles sin hallazgos, no auditoría exhaustiva.
Preservación SHA-256: los 217 archivos previos permanecen intactos; solo se
añadió este documento. `git diff --check` limpio e índice vacío; sin cambios
funcionales, datos de proyectos, cuentas, Obsidian, instalación, commit o push.

La autorización posterior permitió implementar TP-A a TP-D. El
diagnóstico/admisión nativa permanece pendiente por separado; no bloquea la
preparación manual del borrador ni queda resuelto por esta nueva entrada.

## TP-12. Implementación y revisión de calidad

| Componente | Ruta |
| --- | --- |
| Esquema de task/reporte/resumen | [Contrato](../schemas/agent-task-prepare.schema.json) |
| Núcleo puro, límites y renderizado | [Preparador](../src/task-prepare.js) |
| Lectura explícita y JSON estricto | [Archivos](../src/task-prepare-files.js) |
| CLI separada | [CLI](../src/task-cli.js), [bin](../bin/agent-task.js) |
| Pruebas ficticias | [Núcleo](../test/task-prepare.test.js), [CLI](../test/task-cli.test.js) |
| Uso local y entradas inventadas | [Ejemplo](../examples/task-prepare/README.md) |

Se conservó el selector, sus contratos y las plantillas originales. Los checks,
repositoryRoot, instrucciones y contexto referenciados nunca se abren/ejecutan.
Las lecturas de esquemas son recursos locales fijos, no referencias descargadas
o fuentes suministradas por el encargo. La capa IO usa descriptores de solo
lectura con NOFOLLOW/NONBLOCK y vuelve a comprobar metadatos/paths; no ofrece
contención atómica frente a reemplazos concurrentes del namespace.

Cada reporte expone la selección exacta proyectada, su procedencia declarada y
sus límites. Cualquier cuerpo se muestra como datos JSON con strings escapados,
manteniendo las secciones legibles del encargo; las huellas de entrada en bytes
solo se añaden tras lectura CLI. No se falsifican huellas de entregas guardadas.

La revisión SDD/quality-gate mantuvo separados ensamblado, exposición del texto,
permiso real y ejecución. Las primeras pruebas detectaron el rechazo accidental
de nombres camelCase en missing y el escape de enlaces; se corrigieron antes
del cierre. Una prueba adicional acota expansiones de evidencia del selector.
Resultado: **Aprobado con observaciones como preparación manual offline**.
La preparación no autentica evidencia/permiso ni impide que un receptor ignore
sus límites; no se promueven fixtures a verificación de clientes/cuentas.
Comprobaciones realizadas el 2026-10-06 (America/Bogota), macOS arm64:

- **134 pruebas nuevas aprobadas**, 2.214 s, para CA-01 a CA-14; núcleo,
  lectura, CLI, datos adversarios, ausencia de efectos y salida/errores acotados.
- **3.054 pruebas totales aprobadas**, 96.336 s, con concurrencia 2; cero
  fallos, canceladas, omitidas o pendientes. Incluye la regresión anterior y
  el caso final de expansión de evidencia. No es una medición de calidad de IA.
- Seis archivos JavaScript comprobados con `node --check`; Ajv estricto y
  sin coerción/defaults. Cierre de reportes y flags false probado.
- CLI propia ejecutada con Node y entradas ficticias, incluidos EPIPE y ayuda
  sin IO; no otros CLI de IA, modelos, API keys o cuentas. No se instala el bin.
- Preservación SHA-256: **214 de 218 archivos previos intactos**, cuatro
  modificados (dos documentos y los dos mapas bin), nueve nuevos, cero borrados.
  La entrada bin del lock se actualizó mecánicamente, sin tocar dependencias,
  versiones o integridades. Se preservaron los cambios previos de docs/uso.md.
- Tres documentos revisados: enlaces locales existentes, tablas consistentes,
  fences cerrados y formato limpio; `git diff --check` sin incidencias e índice
  sin staging. Escaneo limitado de patrones sensibles sin hallazgos, no garantía
  universal. Los datos de los ejemplos/tests son exclusivamente inventados.
- Sin modificaciones de selector/preferencias, plantillas, CLI de memoria,
  runtime/adaptadores/AD/S3.2, proyecto Avisens, Obsidian, credenciales o
  automatizaciones; sin instalación, commit o push.

| Criterio | Evidencia de cierre |
| --- | --- |
| CA-01–03 | Identidad/roles y contraste exacto con selector v2; versiones, esfuerzo y descartes |
| CA-04–07 | Cuatro estados, borrador nunca ready, autoría/acciones/solapamientos, historial y límites |
| CA-08–09 | Unicode/duplicados/números/secretos/escapes; entradas congeladas y spies durante factory/prepare |
| CA-10–12 | Cuatro lecturas, pin/metadatos y cierres, resumen/exposición, caps/EPIPE, argv/help/exit y bin |
| CA-13–14 | Spies y preservación de gates, regresión completa, ejemplos ficticios y revisión documental |

La primera entrega es local y no está instalada globalmente ni publicada.
La revisión humana del borrador y cualquier guardado en una carpeta privada
siguen siendo pasos separados. Un commit de esta entrega requiere autorización
explícita por sus rutas y no incorpora automáticamente trabajo anterior pendiente.
