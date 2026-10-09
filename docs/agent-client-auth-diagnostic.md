# AD — Diagnóstico de autenticación sin inferencia

## Estado, objetivo y autorización

Especificación AD-1 preparada y base AD-2 implementada el 2026-10-06
(America/Bogota), bajo aprobaciones separadas. Profundidad SDD: rigurosa.
AD-2 comprende parser, esquema, supervisor y pruebas exclusivamente ficticias;
no consulta una cuenta, arranca Claude o modifica guards/configuración previos.
La evidencia de diseño al final se conserva como histórica, separada del cierre
de implementación.

Objetivo: obtener una observación pequeña de la autenticación que el cliente
nativo declara, sin iniciar conversación, seleccionar modelo o solicitar
inferencia. El dato sirve para clasificar acceso; no demuestra aislamiento,
facturación o readiness de un piloto.

[S3.2](agent-client-supervised-preflight.md) conserva sus nueve condiciones y
su recolector actual. AD-1 no fija queryEligible, no sustituye fuentes allí ni
elimina controles para pasar un gate. [N1-I](agent-client-managed-preferences-invocation.md)
invoca un helper propio distinto; sus permisos/observaciones no autorizan Claude.
No persistir aquí resultados reales de N0/N1 o la categoría de cuenta del usuario.

## AD-01. Tres entregas distintas

| Etapa | Resultado | Efectos autorizados |
| --- | --- | --- |
| AD-1, diseño aprobado | Contrato, riesgos y criterios | Solo documentos del Toolkit y fuentes oficiales |
| AD-2, base implementada | Parser, supervisor y pruebas sintéticas | Implementación aprobada; cero clientes/cuentas reales |
| AD-3, lote eventual | Una observación nativa de auth status | Autorización aparte, con artefacto/rutas/efectos y revisión previa del arranque |

Una aprobación abarca operaciones normales de su etapa, no preguntas por cada
archivo. Un fallo no habilita reintentos, login, otras cuentas o nuevos flags.
No usar el resultado de AD-3 para ejecutar automáticamente S3.3.

## AD-02. Receta cerrada y fuera de alcance

Única receta candidata: ejecutable exacto fijado desde código confiable, seguido
de los argumentos literales `auth`, `status`. Sin prompt, stdin textual, shell,
alias, PATH discovery, --text, --print, resume, modelo o esfuerzo.
No producir un comando para que el usuario lo ensaye antes de la revisión.

No login/logout, setup-token, doctor, consultas MCP/plugins, update/install,
configuración, refresh manual, API key o proveedor alternativo como fallback.
No modificar HOME, copiar credenciales o crear otra identidad para conseguir
una respuesta. No añadir safe-mode/restricted/settings flags por analogía:
su soporte/alcance con este subcomando tendría que justificarse por separado.

La documentación describe una salida JSON y exits 0/1 según el estado de login.
Esto respalda la pregunta de autenticación, no todos los efectos del arranque.
[Contrato CLI](https://code.claude.com/docs/en/cli-reference).

## AD-03. Datos mínimos y lectura de la salida

| Campo retenido | Tipo/interpretación | Lo que no se completa |
| --- | --- | --- |
| loggedIn | Booleano observado | No afirma disponibilidad de inferencia o cuota |
| authMethod | Enum conocido: none, claude.ai, oauth_token, api_key, api_key_helper, third_party | No inspecciona token o ejecuta un helper para resolver un valor desconocido |
| subscriptionType | Pro, Max, Team, Enterprise, Free o null | Si el cliente omite el campo, null; no se rellena desde el chat |

Resultado válido con loggedIn=false y exit 1 significa diagnóstico de sesión
ausente, no fallo de transporte ni permiso para hacer login. Un exit 0 exige
loggedIn=true. Diferencias en esos datos impiden dar una observación válida.
No adivinar otras combinaciones imposibles entre método/categoría/login sin
evidencia de la versión; conservar clasificación incompatible o desconocida.

Clasificación de acceso: compatible-declared (claude.ai con categoría de pago
observada), signed-out, incompatible o unresolved. Ninguna abre un gate real.
API/helper/token provisto/third-party se informan como incompatibles con la ruta
de suscripción prevista; no se prueba su credencial ni se convierte a otro método.

El parser propuesto recibe bytes incrementalmente y selecciona únicamente esas
tres claves top-level. Debe ignorar valores de email, organización, IDs,
configDirectory y campos desconocidos sin reconstruir sus strings/objetos.
No usar configDirectory para elegir rutas o secretos. Validar JSON completo,
duplicados/UTF-8/Unicode/tipos y límites; no emitir datos provisionales.
Si no puede ofrecer esa retención acotada, registrarlo antes de aprobar la lectura.
No reutilizar silenciosamente un decoder de JSON completo como si descartara
valores durante el parseo. No prometer borrado forense del runtime/SO/transporte.

## AD-04. Condición previa específica del diagnóstico

Separar autenticación de inferencia permite preguntar por login sin exigir un
modelo/contexto/tarea aprobados. No permite omitir efectos peligrosos de arranque.
Se requieren tres bloques antes de proponer AD-3:

1. Identidad: mismo artefacto/enlace/versión relevante fijados y actuales; fuentes
   aprobadas suficientes para revisar este subcomando, sin adoptar una actualización.
2. Efectos: revisión explícita y pertinente de qué puede cargar/ejecutar el
   arranque de auth status en esa instalación/ruta. Helpers/políticas o comportamiento
   de startup relevante desconocidos mantienen blocked-before-start.
3. Consentimiento: usuario aprueba una sola consulta y sus efectos enumerados,
   incluyendo el acceso del propio cliente a su autenticación nativa/cache o
   inicialización/tráfico interno que resulte pertinente. El wrapper no abre
   keychain, tokens, plists o almacenes de credenciales por su cuenta.

El permiso no convierte incertidumbre en prueba técnica. No admitir una consulta
solo porque se llame auth, aparezca en la documentación o haya una atestación
de Pro personal. Tampoco convertir una proyección de CFPreferences o una ausencia
de archivo en exclusión efectiva de toda política de Claude.

Las fuentes actuales no garantizan que este subcomando esté exento de toda
inicialización/helper. La exención documentada de auth para un chequeo concreto
de forceRemoteSettingsRefresh/gateway no prueba ausencia de todos los efectos.
[Entrega de política remota](https://code.claude.com/docs/en/server-managed-settings).

Si no puede resolverse un efecto relevante dentro de un alcance razonable,
cerrar con el efecto/fuente faltante y conservar el traspaso manual. No crear
un nuevo perfil para autorizar lo que el anterior denegó bajo el mismo alcance.
La posible implementación AD-2 no significa que AD-3 sea viable todavía.

## AD-05. Seguridad, presupuesto y observabilidad

Permiso propio opaco, un uso, revocable y ligado a configuración/receta/entorno,
no un booleano o JSON del modelo. Orquestación confiable debe tener consentimiento
humano antes de emitirlo. Handles N1/S3.1/S3.2/C1/S2 no sirven en AD.

Entorno mínimo fijado desde código: HOME original, TMPDIR propio, PATH del sistema,
LANG/LC_ALL; sin herencia de claves API, perfiles/proveedores, proxies, tracing
o inyección. Si falta una variable imprescindible documentada, detener y revisar,
no expandir el entorno automáticamente. El entorno no elimina por sí solo
fuentes que el cliente lea desde sus propios archivos.

Parent privado aprobado fuera de proyectos/Git/Obsidian/sincronización conocida,
workspace nuevo 0700 y stdin ignore. Pin con hash/metadatos antes/después; checks
son cooperativos, no contención atómica del namespace. Señales solo al grupo
del proceso propio; incertidumbre/descendientes/residuos impiden conservar campos.

| Recurso | Techo propuesto para AD-3 |
| --- | --- |
| Intentos nativos | Uno, únicamente auth status |
| Inferencia/conversación solicitada | Ninguna |
| Plazo de proceso / total operativo | 15 s / 90 s, preparación y cierre incluidos |
| Gracia/confirmación | 1 s / 1 s dentro del plazo; cerrar incertidumbre cuando expire |
| stdout/stderr | 32 KiB por canal, contador incremental y sin archivo crudo |
| Artefacto inspeccionado | 512 MiB máximo, lectura por bloques, sin ejecutar para pinnear |
| Reintentos/fallback | Cero |
| Persistencia de resultados | Solo chat por defecto; evidencia privada exige alcance explícito |

Lecturas del SO, callbacks y event loop no tienen cancelación universal; no
prometer coste cero, ausencia de escrituras/cache o llamadas internas cero.
No se consulta facturación. La declaración económica vigente se pedirá cuando
sea necesaria para proponer inferencia, no como prueba artificial de un login.

## AD-06. Contratos y tareas propuestos

API implementada: `createAuthDiagnosticParser(schema, limits?)` para el protocolo y
`createAuthDiagnosticCollector(schema, trustedConfiguration, authorization)`
para la única receta, con cuarto argumento opcional de dependencias confiables
de pruebas. Ver detalles y límites de confianza en AD-07.

Esquemas cerrados y caps explícitos. Estados: blocked-before-start, failed,
canceled, timed-out, indeterminate o observation-complete. Reporte separado
de la proyección; no campos si faltan cierre válido/terminación/post-pin.
Conservar nativeExecuted y métricas observadas sin negar el arranque real.
inferenceRequested/runtimeReady/verifiedAdmission/externalBillingVerified y
remoteCancellationVerified siempre false; actualModelCalls desconocido.

| Dependencia | Resultado | Archivos probables |
| --- | --- | --- |
| AD-A | Wire/proyección/report y parser selectivo | schemas/agent-client-auth-diagnostic.schema.json, src/client-auth-diagnostic-parser.js |
| AD-B | Invocación de receta fija con permiso/identidad/efectos previos | src/client-auth-diagnostic.js, contrato propio; sin editar S3.2 |
| AD-C | Fixtures/pruebas y revisión | testing/auth-diagnostic, test/client-auth-diagnostic.test.js |

Pruebas requeridas: login true/false y exits; método incompatible; categoría
omitida; campos personales/desconocidos descartados; JSON/Unicode/duplicados;
chunks/vacíos/límites/retención; consentimientos falsos/serializados/otros perfiles;
startup pendiente/rechazado; pin/cambio posterior; entorno/env extra; receta/prompt
prohibidos; timeout/cancelación/revocación; grupo/pipe/residuos/fin tardío.
Solo procesos/datos ficticios. La regresión mantiene el rechazo de S3.2 cuando
sus nueve condiciones no están resueltas. No subir tests sintéticos a prueba nativa.

## Criterios y cierre histórico del diseño AD-1

1. Solo receta auth status, sin inferencia o efectos ampliados por un fallo.
2. Tres campos/categorías, login ausente válido y privacidad selectiva explícita.
3. Identidad, efectos previos y consentimiento separados de permisos de piloto.
4. Scope propio sin modificar nueve condiciones/guardas de S3.2 o contratos previos.
5. Límites, origen incierto, control local y estados desconocidos no se maquillan.
6. Implementación/pruebas sintéticas y lote real necesitan aprobaciones distintas.
7. Sin datos reales persistidos, cuentas/clientes/configuración/Git en esta etapa.
8. Fuentes, enlaces/formato y preservación se comprueban antes de entregar.

Consulta oficial: 2026-10-06 (America/Bogota). La referencia de settings específicos
no pudo abrirse con la herramienta (error interno) y las búsquedas oficiales
no acreditaron un comportamiento universal de auth status respecto a helpers.
No se inventaron overrides o garantías para completar ese vacío.

Resultado de quality-gate: **Aprobado con observaciones para el diseño AD-1**.
Las skills de especificación y calidad separaron diagnóstico de autenticación,
efectos previos y admisión de inferencia. La ausencia de una garantía documental
de startup no se reemplazó con flags inventados o una autorización más amplia.

Verificación documental: 2026-10-06 (America/Bogota).

- Código/esquema S3.2 conservan las nueve condiciones; comparación automática
  de sus IDs realizada sin cambios. Ningún guard/configuración fue modificado.
- Once pruebas existentes seleccionadas: **11/11**, 118 ms; cero fallos,
  canceladas, omitidas o pendientes. Incluyen documentación no elevada a prueba
  local y rechazo antes de workspace/spawn cuando faltan controles.
- Dos documentos: 13 enlaces locales existentes, 11 tablas consistentes,
  formato correcto, `git diff --check` limpio e índice sin staging.
- Preservación SHA-256: 210 de 211 archivos previos intactos; solo el índice
  documental S3.2 actualizado, un documento nuevo y cero borrados.
- Escaneo limitado de patrones sensibles sin hallazgos; no es certificación
  universal. Sin resultados personales de N0/N1, categorías de cuenta o pins
  reales guardados en este diseño. No se consultaron lotes privados anteriores.
- Sin implementación AD-2 o regresión completa repetida: no hubo cambios
  funcionales. Las pruebas existentes no certifican el nuevo recolector.

| Criterio | Evidencia de diseño/revisión |
| --- | --- |
| 1 | Receta única, sin flags adicionales/prompts/modelo, fallo sin fallback |
| 2 | Tres campos, salida 0/1 por login y categoría omitida preservada |
| 3 | Tres bloques previos y aprobación propia; inicialización no negada sin prueba |
| 4 | APIs S3.2/esquema intactos y once tests existentes seleccionados |
| 5 | Scope, bytes/plazos/incertidumbre y acceso sin certificación económica |
| 6 | AD-1/AD-2/AD-3 separados con efectos y autorización enumerados |
| 7 | Solo dos documentos; sin cuentas, cliente, datos personales o Git |
| 8 | Fuentes oficiales, vacío de settings reconocido, links/formato/huellas |

AD-2 fue aprobada después de este cierre de diseño. La sección siguiente registra
esa implementación por separado; no convierte las once pruebas previas en
evidencia del recolector nuevo.

## AD-07. Base implementada y límites de confianza

| Componente | Implementación |
| --- | --- |
| Contrato cerrado | [Esquema AD](../schemas/agent-client-auth-diagnostic.schema.json) |
| Parser incremental | [Parser](../src/client-auth-diagnostic-parser.js) |
| Permiso y supervisor propios | [Recolector](../src/client-auth-diagnostic.js) |
| Transportes ficticios | [Fixture C](../testing/auth-diagnostic/fixture.c) |
| Casos de aceptación y rechazo | [Pruebas AD](../test/client-auth-diagnostic.test.js) |

El parser consume `Uint8Array`/`Buffer` genuinos con `push(bytes)`, acepta chunks
vacíos y solo devuelve proyección mediante `finish(exitCode)` cuando toda la
gramática, Unicode, claves y salida 0/1 son válidos. `abort()` invalida el intento.
Las tres claves seleccionadas se reconocen después de decodificar escapes;
sus strings se comparan incrementalmente con candidatos de enums fijos. No
existe acumulador de texto de valores, JSON.parse del payload o reconstrucción
de objetos desconocidos. Los duplicados se detectan mediante digests SHA-256
transitorios de claves, en todos los objetos; no se retienen hashes de valores.
Un enum nuevo exige revisar el contrato, no probar otro proveedor.

Los contadores `retainedRawBytes: 0` y `retainedUnselectedValueTextBytes: 0`
describen estado retenido por el parser, no buffers de entrada/transporte,
temporales del motor o memoria del SO. Puede retener hasta tres escalares
aprobados y digests acotados de claves; no ofrece borrado forense. Los números
ignorados se validan gramaticalmente sin convertirlos, incluso si representarían
un número no finito en JavaScript. Nunca se utilizan para decisiones.

El contrato de configuración requiere:

- Procedencia declarada `synthetic-fixture` o `native-client-declaration`, receta
  fija `auth-status-v1` y versión previamente revisada, no descubierta ejecutando.
- Artefacto regular con enlace de entrada simbólico exacto: ambos se fijan por
  metadatos; el contenido del artefacto se verifica por bloques de hasta 64 KiB
  antes y después, limitados por los bytes restantes del tamaño fijado y del
  techo de 512 MiB. No se solicita una lectura extra para comprobar EOF; una
  lectura de cero bytes antes del tamaño fijado falla. SHA-256 y metadatos del
  descriptor y del nombre se comprueban al terminar. Esta base exige esa forma
  de instalación; no adopta otros formatos.
- Parent 0700 con identidad fijada y raíces excluidas suministradas por
  orquestación confiable; se rechazan coincidencias, ancestros Git/Obsidian y
  rutas de sincronización conocidas. La lista no descubre todos los servicios
  de sincronización ni reemplaza la revisión humana de la ubicación.
- Dos revisiones separadas (`identityReview`, `startupReview`), estado reviewed,
  evidencia referenciada por hash y binding al artefacto/enlace/versión/ruta/HOME
  actuales; efectos enumerados y ninguno relevante sin resolver.
- Límites no coercitivos: un intento, 15 s de proceso y 90 s totales como techos,
  gracia y confirmación incluidas dentro del presupuesto del proceso, 32 KiB por
  canal y 512 MiB de artefacto. Se permiten presupuestos menores para pruebas.

`authDiagnosticReviewBinding(configuration)` **solo calcula un vínculo**, no
comprueba la veracidad de una revisión ni lee su evidencia. La versión y hashes
de evidencia tampoco constituyen por sí mismos una auditoría de startup.
El emisor confiable es responsable de revisar efectos/configuración pertinente
vigentes y de obtener el consentimiento humano exacto antes de llamar a
`createAuthDiagnosticPermit(schema, configuration)`. Configuración, esquema y
dependencias son entradas de orquestación confiable, nunca JSON de un modelo.
No se expuso una herramienta o comando CLI que permita a una IA autoaprobarse.

El handle vive en un WeakMap propio, ligado a configuración y HOME/UID/perfil,
un solo uso, con vencimiento y `revokeAuthDiagnosticPermit(handle)`. Otros
perfiles/handles, JSON, copias, proxies o revisión insuficiente fallan antes de
IO del diagnóstico, workspace o spawn. El permiso se consume incluso si después
se cancela o falla; no habilita reintento.

`collector.run()` invoca exclusivamente el enlace fijado con `["auth", "status"]`.
Todo argumento explícito, incluso `undefined`, se rechaza con
`auth-input-forbidden` antes de IO, workspace o spawn, sin inspeccionar su valor.
Si había un permiso válido, se consume: el rechazo no habilita un reintento.
No añade flags no acreditados. Usa HOME original y las cinco variables HOME,
TMPDIR, PATH, LANG y LC_ALL; stdin ignorado, sin shell, grupo Unix propio.
Cualquier stderr no vacío falla cerrado, sin persistirlo. La proyección solo se
conserva tras exit/close de proceso, close de ambos canales, ausencia confirmada
del grupo, pin posterior y cleanup sin residuos; revocación/cancelación durante
el cierre también la descartan. Callbacks tardíos no alteran el reporte entregado.
Si llega un evento de spawn tras el cierre incierto, se intenta terminar su
grupo sin añadir razones al informe ya devuelto, incluso si la señal falla.
Ese intento tardío no acredita terminación ni permite limpiar el workspace
retenido o recuperar la proyección descartada.

`processStarted` cuenta el evento de arranque observado; `nativeExecuted` solo
se marca para la procedencia nativa declarada. Los fixtures permanecen explícitos
y no se convierten a cuenta real. `actualModelCalls` sigue null: no hay solicitud
de inferencia, pero esta API no mide llamadas internas del cliente.
No hay hooks de persistencia, credenciales, configuración, instalación, retries
o fallback. El supervisor no certifica identidad de cuenta, facturación,
aislamiento de árbol completo, cancelación remota o contención atómica del
namespace. IO cooperativo/event loop pueden exceder un plazo; un cierre tardío
se reporta indeterminate, no una garantía de cancelación dura del SO.

## AD-08. Cierre de implementación AD-2

Pruebas ejecutadas únicamente con JSON ficticio, transportes virtuales y el
fixture C compilado localmente; no con el cliente Claude ni cuentas reales.
La suite cubre 72 combinaciones de login/método/categoría sin inventar
combinaciones imposibles, todos los cortes de un payload UTF-8, corpus de JSON
anidado, tipos/enums, duplicados/escapes, límites y descarte selectivo.
Incluye permisos ajenos/falsos/reutilizados/expirados, revisiones pendientes,
pin/enlace/parent antes y después, permisos especiales prohibidos del ejecutable,
aborto/revocación, budget, canales/grupo, residuos y callbacks tardíos.

Resultado de quality-gate: **Aprobado con observaciones para la base AD-2**.
La revisión rigurosa separó el contrato selectivo, la revisión de efectos y
el consentimiento; evitó ampliar el recolector antiguo o considerar los fixtures
como evidencia nativa. Verificación: 2026-10-06 (America/Bogota).

- Suite nueva: **221/221**, 12.590 s; regresión completa: **2.920/2.920**,
  95.742 s. Cero fallos, canceladas, omitidas o pendientes en ambas.
- Comprobación sintáctica de ambos módulos y del test; esquema compilado por
  Ajv sin coerción/defaults, reportes cerrados y sin promesas de readiness.
- Preservación SHA-256: **211 de 212 archivos previos intactos**, un documento
  actualizado, cinco archivos nuevos y cero borrados. Código, esquemas y pruebas
  de S3.2 permanecen intactos, incluidos sus nueve controles y rechazo previo.
- Siete enlaces locales existentes, seis tablas consistentes; formato de archivos
  nuevos/revisados comprobado, `git diff --check` limpio e índice sin staging.
- Escaneo limitado de patrones sensibles sin hallazgos, no certificación universal.
  Sin datos personales, resultados reales, rutas/pins de clientes instalados o
  categorías de cuenta del usuario persistidos en esta entrega.
- Sin Claude, cuentas, lecturas de credenciales/configuración/prefs, proveedores,
  instalación, automatizaciones, cambios de Avisens/Obsidian, commit o push.
  Las compilaciones y procesos pertenecen exclusivamente al fixture ficticio.

AD-3 continúa **sin admisión ni autorización nativa**. Sigue pendiente acreditar
qué inicialización/helpers/políticas puede cargar auth status en la instalación
exacta. La implementación no resuelve ese vacío, no reduce los nueve controles
de S3.2 y no prepara una consulta real automáticamente. Si ese efecto no puede
acreditarse dentro de un alcance razonable, conservar el flujo manual e informar
el bloqueo concreto. No arrancar auth status para averiguarlo.

## AD-09. Aceptación de AD-2 y revisión documental del siguiente paso

El usuario aceptó la entrega AD-2 con «apruebo». La aceptación permite continuar
la revisión previa, no emitir un permiso de ejecución nativa ni crear un commit.
Revisión documental realizada el 2026-10-06 (America/Bogota), exclusivamente
con fuentes públicas y notas del Toolkit; sin consultar configuración,
credenciales, lotes privados, versión instalada o cuentas reales.

La [referencia oficial de CLI](https://code.claude.com/docs/en/cli-reference)
respalda la salida JSON y el contrato de exit, pero no garantiza ausencia de
inicialización, refresh o escrituras del cliente. La exención de los subcomandos
auth en [política remota](https://code.claude.com/docs/en/server-managed-settings)
se limita al chequeo y salida de startup descritos allí; no es una exclusión
general de los efectos del arranque.

Hay además evidencia pertinente sobre cambios de comportamiento:

- Las [notas oficiales de v2.1.289](https://github.com/anthropics/claude-code/releases/tag/v2.1.289)
  señalan, para VS Code, la reversión de un cambio de v2.1.288 en auth status
  que podía aumentar los cierres de sesión. Es una afirmación del proveedor
  sobre ese cambio/superficie, no prueba de que afecte a la instalación del usuario
  ni garantía de ausencia de otros efectos en v2.1.289.
- El [reporte público #95822](https://github.com/anthropics/claude-code/issues/95822)
  describe una reproducción con credenciales ficticias en macOS: refresh OAuth
  iniciado durante el arranque de auth status y salida antes de persistirlo,
  con diferencias según el tiempo de respuesta. Es un reporte de su autor en
  el repositorio del proveedor, **no confirmación independiente o del mantenedor**
  de que ese comportamiento exista en la instalación local. No se reprodujo,
  copiaron sus credenciales/logs ni ejecutaron sus instrucciones.

Inferencia de esta revisión: el efecto que falta acreditar no es solo si la
receta solicita inferencia, sino si su inicialización puede renovar/modificar
autenticación o cargar helpers/políticas relevantes en el artefacto y ruta
exactos. Documentación general, un exit válido o un nombre de comando de
diagnóstico no resuelven esa cuestión. Las referencias nuevas no justifican
actualizar el cliente, añadir flags, ampliar permisos o cambiar de perfil.

Resultado de quality-gate para proponer AD-3: **Sin evidencia suficiente**.
Se conserva `blocked-before-start`; no se emitió un handle ni se preparó un lote
nativo. No es un rechazo de la base AD-2, cuya aceptación y pruebas se mantienen.
Se cierra esta revisión documental con la fuente/efecto faltantes explícitos:
evidencia pertinente y vigente del startup de la instalación exacta, incluyendo
refresh/cache/credenciales y helpers/políticas. No repetir inspecciones equivalentes
ni ejecutar auth status para resolver el vacío.

Mientras falte esa evidencia, permanece disponible el traspaso manual ya
construido: encargos acotados, respuesta del otro agente y revisión separada,
sin que el Toolkit compruebe cuentas o arranque clientes por sí mismo. Cambiar
los criterios de AD-3 o autorizar otro tipo de ejecución requiere especificar
el nuevo alcance y sus riesgos antes de solicitar aprobación.

Entrega documental únicamente: sin cambios funcionales, consultas reales,
automatizaciones, Obsidian, staging, commit o push. Los 2.920 tests de AD-08
corresponden a la ejecución anterior, no a una regresión repetida en esta revisión.

## AD-10. Consolidación local y correcciones del límite de invocación

Entrega autorizada y verificada el 2026-10-09 (America/Bogota): correcciones,
pruebas sintéticas, cierre documental y commit local de los seis archivos de AD.
No incluye push, consultas a cuentas, arranque de clientes reales, configuración,
preferencias, automatizaciones ni cambios de Avisens u Obsidian.

La revisión encontró tres fallos reproducibles que las pruebas previas no
cubrían. Se corrigieron sin ampliar la receta ni reducir controles de S3.2:

| Hallazgo | Corrección | Evidencia sintética nueva |
| --- | --- | --- |
| `run()` ignoraba argumentos explícitos | Rechazo `auth-input-forbidden` antes de IO; permiso válido consumido sin inspeccionar valores | `undefined`, texto, objeto, getter y proxy; cero IO/workspace/spawn, sin reintento |
| El lector pedía bloques completos y un bloque de EOF fuera del tamaño fijado | Cada petición se limita a tamaño restante y techo; cero prematuro falla; SHA-256 y metadatos posteriores conservados | Tamaño estable, lecturas cortas, truncado y crecimiento justo en 512 MiB; no se lee el byte añadido |
| Un spawn tardío con señal fallida añadía una razón al informe devuelto | Terminación tardía de mejor esfuerzo separada del informe entregado | EPERM, ESRCH y error sin código; eventos tardíos no modifican campos, razones ni proyección |

Resultados de esta ejecución, no reutilizados del cierre histórico AD-08:

- Seis pruebas de regresión nuevas contra el código anterior: **0/6**, seis
  fallos esperados que reprodujeron los problemas y sus casos límite.
- Suite AD corregida: **227/227**, exit 0; sin fallos, canceladas, omitidas o todo.
- Candidato aislado: base versionada `6cd6811` más únicamente los seis archivos
  de AD. Regresión completa con `node --test --test-concurrency=1
  --test-reporter=tap`: **3.279/3.279**, exit 0; sin fallos, canceladas, omitidas
  o todo. Duración observada: 183.873,255291 ms, no una garantía de rendimiento.
- Las tres comprobaciones `node --check` pasaron individualmente. Los doce
  contratos del esquema compilaron en Ajv estricto, sin coerción/defaults.
- Siete enlaces locales comprobados también en el candidato; tablas, cercas,
  finales de línea y formato revisados. Escaneo limitado de patrones sensibles
  sin hallazgos, no certificación universal de ausencia de secretos.

Las seis pruebas nuevas usan solamente filesystem y transporte simulados en
memoria. La suite existente compila y ejecuta su fixture C ficticio; ningún
resultado es evidencia sobre la instalación o la cuenta del usuario. Los cinco
archivos de esquema/código/pruebas/fixture conservan los bytes probados; después
de la regresión solo se añadió este cierre documental.

Resultado de quality-gate: **Aprobado para consolidación local de AD-1/AD-2**.
AD-3 sigue `blocked-before-start`: falta evidencia pertinente del startup de la
instalación exacta y consentimiento específico para sus efectos. No se emitió
un permiso nativo ni se sustituyeron esos requisitos por los resultados de tests,
huellas, categoría de suscripción declarada o autorización de este commit.
