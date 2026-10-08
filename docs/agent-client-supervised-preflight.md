# S3.2 — Revisión previa de acceso, controles y economía

## Estado, problema y alcance

Consolidación local autorizada el 2026-10-07 (America/Bogota): corregir el
inventario de raíz, añadir su regresión, validar siete rutas de forma aislada,
ajustar esta nota, registrar evidencia privada y crear un commit local.
No incluye consultas de cuentas, clientes reales, push ni el piloto S3.3.
El resultado actual se separa del cierre histórico y se registra al final.

Diseño preparado el 2026-10-05 (America/Bogota), tras «apruebo», referido al
cierre S3.1 y al siguiente paso. PF-A–PF-D fueron autorizados después con
«autorizo». La base está implementada y el lote local cerró con proyección
insuficiente: no arrancó Claude ni consultó acceso. Profundidad SDD: rigurosa.
La evidencia final figura al final; el diseño conserva el alcance aprobado.

El [diagnóstico S3.1](agent-client-supervised-native.md) observó versión/ayuda
del candidato, pero no comprobó acceso, configuración efectiva o gasto externo.
La presencia de opciones no basta para iniciar una conversación de suscripción.
El [evaluador S1](agent-client-supervised-subscription.md) tampoco autentica las
declaraciones, y [S2](agent-client-supervised-local.md) sigue siendo fixture-only.

Objetivo: entregar una matriz de hechos, declaraciones y faltantes, vinculada
al mismo candidato y una variante textual propuesta. Solo Claude Code. Una
aprobación específica abarca preparación, pruebas y un lote completo, sin pedir
confirmación por cada comprobación normal. S3.3 sigue separado y no autorizado.

## Resultado y estados propios

| Estado | Qué significa |
| --- | --- |
| `invalid` | Datos o contrato inválidos; sin comprobación nativa |
| `incomplete` | Faltan controles, fuente segura o vinculación de evidencia |
| `blocked` | Acceso incompatible, gasto habilitado, contradicción o condición insegura |
| `review-complete` | Revisión de sus fuentes terminada; todavía no permiso de inferencia |

Un resultado puede cerrar correctamente el lote manteniendo un bloqueo.
Ninguno fija `runtimeReady`, `verifiedAdmission` o `externalBillingVerified` a
`true`. Las llamadas internas y la cancelación remota siguen desconocidas.
No convertir `review-complete` en receta de arranque o ticket C1/C2/S2.

## PF-01. Identidad y privacidad antes de cualquier consulta

Revisar únicamente la observación privada S3.1 autorizada y revalidar el mismo
artefacto/enlace antes y después del lote. Actualización o diferencia de huella
invalida la evaluación; no adoptar otro candidato o repetir firmas para ocultarlo.

Destino lógico: `PRIVATE_EVALUATIONS_ROOT/s3-2-claude-01`. La ruta absoluta será
enumerada en la aprobación, fuera de proyectos, Toolkit, Obsidian y carpetas
sincronizadas conocidas. Creación exclusiva `0700`, dos notas Markdown `0600`:
`01-preflight.md` y `03-revision.md`. Sin sobrescrituras ni JSON de admisión.

Workspace propio vacío y stdin cerrado; entorno de confianza mínimo, preservando
HOME original sin copiar autenticación ni heredar claves API, proveedores
alternativos, proxies, tracing o inyección de runtime. No modificar permisos de
carpetas preexistentes, configuración, políticas o conectores para pasar un gate.

## PF-02. Proyección no secreta de controles

Esta etapa no abre ficheros completos de configuración para buscar secretos y
después redactarlos. La proyección debe venir de una fuente aprobada, acotada,
con procedencia y fecha; una declaración humana permanece como tal.

Inventario de metadatos permitido después de autorizar: presencia/tipo de rutas
de política pertinentes, seleccionadas de documentación y evidencia privada,
sin contenido o búsqueda recursiva. Ausencia de una fuente local no demuestra
ausencia de política remota o embebida. Hasta 16 rutas explícitas, sin glob.

| Dato proyectado | Valor admitido, sin contenido operativo |
| --- | --- |
| Fuentes de política | Presencia/ausencia/desconocido y tipo de fuente, sin texto de políticas |
| Hooks y comandos heredados | Presencia/desactivación/desconocido; nunca cuerpos de comandos |
| MCP/conectores/IDE | Presencia/exclusión/desconocido; sin URLs, headers o credenciales |
| Helpers API/proveedor alternativo | Presencia/ausencia/desconocido; sin comando, token o endpoint |
| Modelo/fallback/delegación | IDs no personales y presencia/ausencia, solo de fuente segura autorizada |
| Controles de la variante | Mecanismo candidato, soporte observado/documentado y evidencia pendiente |

Si solo existe una fuente que mezcla datos secretos, no leerla: registrar
`safe-projection-unavailable`. No usar su hash para fingir una proyección segura.
No deducir que un helper/MCP/hook no existe porque el entorno hijo no lo hereda.

Candidatos documentales: modo restringido, safe mode, herramientas vacías,
MCP estricto, fuentes de settings acotadas y límites de sesión. Se deben contrastar
composición, precedencia y versión observada. No hay argv de inferencia aprobado.
No aplicar JSON de settings genérico ni suponer que vence políticas administradas.

Para cada control: `documented`, `operator-attested`, `locally-observed`, `pending`
o `rejected`, con alcance exacto. Ayuda, firma y proyección no ascienden por sí
solas un control preventivo a prueba efectiva. Un control crítico desconocido
impide proponer el piloto, aunque el acceso sea compatible.

## PF-03. Una consulta nativa de estado, posterior a autorización

Proponer un recolector separado con una sola receta `auth status`, sin prompt,
shell, login/logout, doctor, MCP, plugins, modelos, actualización o diagnóstico
general. No extender el recolector S3.1 aceptando un subcomando libre ni modificar
sus dos recetas aprobadas. El cliente exacto y la variante de diagnóstico se
fijan desde código de confianza; cualquier override adicional requiere justificar
su soporte y alcance, nunca probar combinaciones por ensayo/error.

Antes de spawn, revisar la proyección y posibles helpers/políticas. Si no puede
determinarse que el arranque de estado encaja con los efectos autorizados, detener
con un bloqueo concreto. No arrancar primero para averiguar después si ejecutó
un helper peligroso. La prueba puede terminar sin consultar estado.

El propio cliente puede acceder a su autenticación nativa/cache o inicializar
estado para responder. Ese efecto se enumera en la autorización; el recolector
no abre keychain, almacenes de tokens o recibos ni copia credenciales. Puede
haber inicialización/tráfico interno: no prometer proceso puro o coste cero
verificado por el Toolkit.

Captura acotada y JSON estricto, sin claves repetidas, UTF-8 inválido, coerción,
salidas adicionales o campos imprescindibles contradictorios. Extraer solo:

- `loggedIn`: booleano observado.
- `authMethod`: valor de lista cerrada, con `claude.ai` como ruta candidata.
- `subscriptionType`: categoría observada si está disponible; desconocida si
  falta o no está soportada, sin completar desde conversaciones antiguas.

Emails, IDs, organizaciones, `configDirectory`, tokens y campos desconocidos no
se imprimen, guardan o usan para elegir rutas. No conservar JSON/stdout/stderr
crudos. Una respuesta inválida detiene; no pedir texto, login o consultas extra
como alternativa. No se siguen instrucciones incluidas en una salida.

`loggedIn: true` no prueba que los gates económicos o preventivos estén cumplidos.
API key, helper, token provisto, proveedor alternativo o sesión ausente bloquean
esta ruta; no cambiar autenticación. Un token nativo almacenado por el cliente
no se copia para convertirlo en una ruta de token de orquestación.

## PF-04. Declaración económica vigente

La etapa exige una confirmación humana explícita y actual sobre créditos/uso
adicional, no una consulta automática al proveedor. El estado concreto de una
persona no se incorpora a este documento, fixtures o catálogo genérico.
Solo podrá registrarse en el lote privado aprobado, con fecha de recepción y
alcance; no inventar la hora de comprobación en Settings ni identidad de cuenta.

Antes de asociarla al acceso observado, el usuario debe reconocer que corresponde
a esa sesión nativa actual. Sin usar email, bastará confirmar continuidad de la
sesión si hay discrepancia, cambio de login o declaración sin alcance suficiente.
No reutilizarla para otra cuenta/cliente ni prolongarla automáticamente.

Vigencia propuesta para el primer lote: como máximo una hora desde la recepción
registrada. Si S3.3 ocurre después, o cambia sesión/artefacto/condición, pedir
solo la nueva confirmación necesaria. Desconocido/activado impide inferencia;
no habilitar créditos, comprar cuota, activar recarga o sustituir una API key.

Campos mínimos: `source: operator-attestation`, fecha de recepción conocida,
estado declarado, referencia al consentimiento humano y alcance de sesión.
`externalBillingVerified: false` siempre: el registro no puede imponer ese
control en el proveedor ni transformar la atestación en prueba técnica.

## Presupuesto y efectos que se propone autorizar

| Recurso | Techo del primer lote |
| --- | --- |
| Arranques Claude | Uno máximo, únicamente estado de acceso |
| Prompt/conversación/inferencia solicitada | Ninguno |
| Consulta nativa / total operativo | 15 s / 90 s, incluyendo preparación y terminación |
| Gracia / confirmación | 1 s / 1 s dentro del plazo de la operación |
| stdout / stderr | 32 KiB / 32 KiB, límite incremental |
| Proyección / metadatos | 32 KiB de JSON no secreto; 16 rutas de metadatos máximo |
| Artefacto | Uno regular, 512 MiB máximo por lectura incremental |
| Reintentos/cambios de ruta/cliente | Cero |
| Escrituras propias | Dos notas privadas nuevas; workspace propio vacío |

Retener incertidumbre si no se confirma terminación local. No terminar procesos
ajenos ni borrar datos desconocidos. Directorios temporales propios solo se
retiran tras comprobación de identidad y cierre; no reparar un lote existente.
Llamadas internas reales/consumo remoto continúan `null`/desconocidos.

## Entregas, pruebas y reversión

| Paso | Resultado verificable | Archivos probables |
| --- | --- | --- |
| PF-A | Contrato y extractor de acceso/proyección cerrados | `schemas/agent-client-native-preflight.schema.json`, `src/client-native-preflight.js` |
| PF-B | Recolector de estado con permiso propio y límites | `src/client-native-access.js`, sin cambiar recetas S3.1 o S2 |
| PF-C | Casos adversos y regresión antes del cliente | `test/client-native-preflight.test.js`, fixtures sintéticas separadas |
| PF-D | Lote privado y revisión de faltantes | Dos notas nuevas autorizadas, sin ticket ni publicación |

Las rutas se implementaron y se enlazan en el cierre. Plan de pruebas: permisos falsos,
helpers/desconocimiento crítico, proyección con campos secretos o extra, fechas
caducadas/futuras, sesión distinta, acceso API/token/proveedor alternativo,
missing/campos contradictorios, JSON duplicado, UTF-8, timeout, procesos hijos,
errores, cambio de artefacto y privacidad. No usar cuentas/modelos en fixtures.

Reversión: no activar el futuro adaptador y mantener traspaso manual. Conservar
evidencia privada; no migrar o alterar C1/C2/S1/S2 ni borrar incertidumbre.

## Criterios de aceptación

1. Ninguna salida habilita conversación, modifica un proyecto o genera admisión.
2. Mismo candidato revalidado; proyección segura y efectos revisados antes de estado.
3. Sin leer secretos para luego filtrarlos; sin cuerpos de comandos/MCP o registros.
4. Único `auth status` permitido o bloqueo previo explicable; sin login/cambios.
5. Extracción conserva procedencia, estados desconocidos y datos personales descartados.
6. Declaración económica actual con alcance; nunca verificación automática de gastos.
7. Controles críticos desconocidos, rechazo o incompatibilidad bloquean el piloto.
8. Límites, privacidad, pruebas y preservación documentados; S3.3 no ejecutada.

## Fuentes oficiales y límites documentales

Consulta del 2026-10-05 (America/Bogota), no evidencia de la instalación:

- La referencia documenta `auth status` y modo restringido; ayuda no incluye
  todos los flags. Restringido conserva settings administrados, no es aislamiento
  total. [CLI](https://code.claude.com/docs/en/cli-reference).
- La precedencia tiene excepciones por clave; un override de sesión no elimina
  todas las fuentes previas. [Settings](https://code.claude.com/docs/en/settings).
- MCP estricto interactúa con política administrada y puede rechazar el inicio;
  no desactivar esa política para forzar una evaluación.
  [MCP administrado](https://code.claude.com/docs/en/managed-mcp).
- Settings > Usage controla créditos; desactivados permiten solo el uso incluido,
  según el proveedor. La consulta no confirmó ese estado en la cuenta del usuario.
  [Créditos del plan](https://support.claude.com/en/articles/12429409-manage-usage-credits-for-paid-claude-plans).

El índice oficial «All settings»/`settings-reference` no pudo abrirse con la
herramienta de consulta (error interno). No se adivinaron claves faltantes o
recetas de settings. Antes de aprobar una variante deben resolverse las referencias
precisas necesarias; esta limitación puede dejar controles pendientes.

## Alcance aprobado

La autorización explícita enumeró el nuevo destino privado absoluto y el acceso
nativo limitado condicional; incluyó implementación, pruebas y cierre del lote,
no inferencia. La condición previa resultó insuficiente y no se consultó la cuenta.
No implica
permiso de editar settings, cuentas, Git, Obsidian, configuración o automatizaciones.

## Revisión documental histórica del diseño

Resultado de quality-gate: **Aprobado con observaciones para el diseño**.
Se revisaron alcance, separación de permisos, datos personales, precedencia,
fuentes y criterios verificables. Dos documentos: 10 enlaces locales existentes,
8 tablas consistentes, formato correcto, `git diff --check` limpio e índice vacío.
Escaneo limitado de patrones sensibles sin hallazgos.

Preservación SHA-256: 177 de 178 archivos previos intactos; solo el índice propio
S3 actualizado, un documento nuevo y cero borrados. Sin modificaciones funcionales
ni regresión de código ejecutada, pues este lote es documental. El nuevo destino
privado propuesto no existe; no se creó carpeta ni evidencia privada.

No se inició Claude, consultaron cuentas, leyeron settings/credenciales o enviaron
prompts. Sin cambios a proyectos, Obsidian, Git, catálogos, conexiones o
automatizaciones. Observaciones: la proyección segura y los controles efectivos
siguen pendientes; el índice completo de settings no pudo consultarse. La
atestación económica conservada en el chat no sustituye esas comprobaciones.

## Entrega implementada y cierre histórico PF-A–PF-D

| Archivo | Responsabilidad |
| --- | --- |
| [Contrato](../schemas/agent-client-native-preflight.schema.json) | Proyección, acceso, atestación e informes cerrados |
| [Evaluador/extractor](../src/client-native-preflight.js) | Consistencia pura, fuentes/frescura y descarte de datos personales |
| [Archivos](../src/client-native-preflight-files.js) | Huella del único candidato y lstat del inventario explícito; no lectura de settings |
| [Consulta acotada](../src/client-native-access.js) | Permiso propio, guard previo y única receta auth status |
| [Pruebas](../test/client-native-preflight.test.js) | Casos adversos, permisos, fuentes, privacidad y procesos sintéticos |
| [Fixture](../testing/native-preflight/fixture.cjs) | Respuestas ficticias, sin cuentas/proveedores |

`createNativePreflightEvaluator(schema, trustedPolicy)` exige scope esperado,
frescura máxima explícita de una hora y referencias revocadas. Para admitir una
consulta exige nueve campos críticos con ausencia/desactivación, fuente local
pertinente y fecha/ref/scope. La validación comprueba coherencia, no autentica
referencias. Ayuda, firmas y declaraciones humanas no se elevan a pruebas locales.

`createNativeAccessExtractor` devuelve solo tres campos no personales. Datos
extra no se copian a errores, informes o rutas. Tier ausente queda `null`;
contradicciones, UTF-8 y JSON duplicado se rechazan. No inventa cuenta o identidad.

`createNativeAccessCollector` exige permiso opaco propio ligado a configuración
e input, desde código de confianza. Handles S3.1/S2 o serializados no sirven.
Revisa frescura con su propio reloj y bloquea antes de workspace/spawn cuando
la proyección no basta. Una observación nativa reemplaza claims previos de acceso
al reevaluar; una respuesta no concede permisos ni autoriza inferencia.

El inventario admite hasta 16 rutas explícitas y IDs string sin coerción. Solo
lstat de componentes; enlaces/errores conservan inseguridad/desconocimiento.
La validación también rechaza una raíz del sistema como destino del inventario,
antes de cualquier lstat, en lugar de declararla inexistente sin observarla.
El contenido leído pertenece exclusivamente al ejecutable aprobado: 512 MiB
incrementales y contraste de identidad/huellas antes/después. No abre settings,
credenciales o keychain para filtrar sus valores posteriormente.

Comprobación: 2026-10-05 (America/Bogota), macOS arm64, Node `v24.14.1`.

- Primera batería: **102/102**; ampliada a **111/111**, sin fallos.
- Revisión reforzó IDs contra coerción de booleanos/null; batería final:
  **112 casos**, todos incluidos en la regresión final.
- Regresión primera: **2 126/2 126**, 146 829 ms, secuencial; cero fallos.
- Regresión final: **2 127/2 127**, 80 822 ms, concurrencia dos; cero fallos,
  canceladas, omitidas o pendientes. Sin clientes/cuentas reales en las suites.
- Lote real: mismo candidato revalidado y cinco rutas de metadatos revisadas.
  Proyección segura insuficiente, guard bloqueado: **cero arranques de Claude**,
  sin auth status o prompt. No se suplió el faltante leyendo secretos.
- Dos notas privadas nuevas `0700`/`0600`, sin workspace residual, sobrescritura
  o expediente de admisión. Atestación humana privada, sin inventar hora de
  recepción o continuidad de una sesión todavía no observada.

| Criterio | Evidencia ejecutada |
| --- | --- |
| 1 | Flags siempre falsos, cero inferencia y ningún ticket generado |
| 2–3 | Candidato continuo; lstat sin contenido y proyección insuficiente no suplida leyendo secretos |
| 4 | Única receta probada con dobles; lote real detenido antes por la condición previa |
| 5 | Fuentes preservadas, PII/extra descartada, JSON/Unicode adversos y desconocimiento explícito |
| 6 | Atestación distinta de prueba económica, sin cuenta/recepción/continuidad inventadas |
| 7 | Hooks/helpers/políticas desconocidos bloquean consulta y propuesta de piloto |
| 8 | Pruebas, revisión y notas privadas; sin S3.3 o contratos anteriores alterados |

Resultado de quality-gate: **Aprobado con observaciones para implementación y
cierre condicional; admisión nativa bloqueada**. No demuestra fallo de login,
gastos activados o configuración peligrosa; demuestra que la evidencia permitida
no basta. Resolver la proyección necesita un alcance nuevo y verificable.
No basta repetir este permiso, otra firma o activar créditos.
Mantener traspaso manual mientras se diseña esa solución. Sin staging, commit,
push, cambios de proyectos, Obsidian, catálogos, conexiones o configuración.

Revisión final: nueve archivos propios sin patrones sensibles detectados;
cinco documentos, 29 enlaces locales y 17 tablas correctos, espacios limpios
e índice sin staging. Preservación SHA-256: 176 de 179 archivos previos intactos,
solo tres documentos propios actualizados, seis archivos nuevos y cero borrados.
Dos notas privadas `0600`; sin temporales o procesos de fixtures residuales.
El borrador local SC-1, `docs/agent-client-selective-config.md`, conserva su
autorización y evidencia históricas de lectura selectiva. No se incorpora a
esta entrega versionada ni convierte observaciones en controles efectivos
o permisos de arranque.

El borrador local AD-1, `docs/agent-client-auth-diagnostic.md`, define un perfil
separado y no se incorpora a esta entrega versionada. No cambia las nueve
condiciones de este preflight ni convierte documentación u observaciones
parciales en permiso; su revisión de efectos previos sigue siendo obligatoria.
## Consolidación versionada local S3.2 — 2026-10-07

Este cierre tiene autorización propia para siete rutas concretas, la corrección
del inventario de raíz, su prueba, ajustes de esta nota, validación aislada,
evidencia privada y commit local. No renueva observaciones de instalación,
declaraciones económicas o sesiones del lote histórico anterior; no incluye
clientes reales, consultas de cuentas, push o el piloto S3.3.

### Corrección aprobada y prueba de regresión

La revisión detectó que `inspectPreflightMetadata` admitía una raíz del sistema
y devolvía `kind: missing` sin observarla, porque no había componentes que
recorrer. Ahora rechaza esa entrada como inventario inválido antes de cualquier
lstat. La restricción pertenece exclusivamente a este inventario, no cambia
`absolutePhysicalName` ni las recetas o condiciones de admisión de otros módulos.

La prueba nueva verifica una raíz sola y una raíz precedida por otra ruta
explícita. Ambas deben rechazarse con el error genérico de inventario y cero
llamadas de metadatos: se valida el conjunto antes de observar cualquier entrada.
No se leyó la raíz real ni se invocó un cliente para reproducir el defecto.

| Comprobación | Resultado observado |
| --- | --- |
| Suite existente en la revisión anterior a la corrección | 112/112; salida 0; 3 754,891292 ms |
| Prueba nueva antes de aplicar la corrección | Fallo esperado: 1 caso, Missing expected rejection; salida 1 |
| Suite específica con la corrección | 113/113; salida 0; 3 765,211541 ms |
| Regresión aislada: base versionada más siete rutas S3.2 | 2 475/2 475; salida 0; 155 993,960834 ms |
| Casos de la base / casos añadidos S3.2 | 2 362 / 113 |
| Fallos, canceladas, omitidas y pendientes de las baterías finales | 0 / 0 / 0 / 0 |
| Sintaxis | Cinco comprobaciones node --check, cada una con salida 0 |
| Esquema | Doce definiciones compiladas con Ajv2020 en modo estricto |

Comprobación local: macOS arm64 y Node `v24.14.1`. La regresión usa
`node --test --test-concurrency=1 --test-reporter=spec`; no se cambiaron
timeouts, casos u omisiones para hacerla pasar. La copia aislada contiene
únicamente la base versionada y estas siete rutas, no los borradores SC-1/AD-1
u otros módulos aún no versionados. El cierre posterior solo modifica esta
nota: los seis archivos de contrato, implementación, pruebas y fixture
conservan exactamente los bytes probados.

### Criterios y evidencia del cierre actual

| Criterio | Evidencia y límites |
| --- | --- |
| 1: sin admisión | Contratos y pruebas mantienen flags de inferencia, admisión, facturación y preparación en false; ningún ticket generado |
| 2: candidato y control previo | Pruebas sintéticas de cambio de artefacto, frescura propia, permiso opaco y bloqueo antes de workspace/spawn cuando faltan controles; no revalida una instalación real hoy |
| 3: lectura acotada | Inventario explícito lstat-only, rechazo de raíces y datos inseguros; contenido leído solo del artefacto sintético aprobado, nunca settings o credenciales reales |
| 4: receta única o bloqueo | Dobles prueban auth status fijo, una sola tentativa, errores y cancelación; no se ejecuta auth status real en esta entrega |
| 5: procedencia y privacidad | Extractor descarta datos personales ficticios y campos extra, rechaza JSON duplicado, Unicode inválido y contradicciones; observación incompatible sustituye claims previos |
| 6: economía declarada | Evaluador distingue atestación de verificación, controla alcance/frescura y sesión; no comprueba créditos o gastos reales |
| 7: desconocidos conservados | Nueve campos críticos, fuente insegura/insuficiente, evidencia vencida o rechazada y acceso incompatible no generan preparación nativa |
| 8: cierre y preservación | Corrección reproducida antes y cubierta después; suite específica y regresión aislada; siete rutas exactas y borradores ajenos conservados, sin S3.3 |

### Límites conservados

Resultado de quality-gate: **Aprobado con observaciones para consolidación local
de S3.2**. El hallazgo del inventario quedó corregido y cubierto. Cerrar el código
no resuelve el bloqueo histórico de evidencia para una consulta real ni
demuestra acceso, autenticación, aislamiento preventivo o créditos desactivados
en una cuenta actual.

Las suites usan programas Node ficticios. Un indicador `nativeExecuted: true`
en esos dobles prueba la semántica de arranque observada, no ejecución de Claude
en este cierre. `actualModelCalls` permanece null; `runtimeReady`,
`verifiedAdmission`, `externalBillingVerified` y
`remoteCancellationVerified` permanecen false. El resultado puro
`review-complete` expresa consistencia de datos, no autentica referencias
ni concede un permiso de inferencia.

La orquestación, el reloj, los permisos opacos y las dependencias inyectadas
siguen siendo código de confianza. Las comprobaciones de rutas son cooperativas,
no contención atómica frente a procesos maliciosos del mismo usuario. Plazos
y señales locales no cancelan mágicamente disco bloqueado ni demuestran
cancelación remota o contención de descendientes desvinculados. La ejecución
secuencial en macOS arm64 no certifica otras plataformas o condiciones de carga.

Las fuentes externas de esta nota conservan su fecha histórica; no se
consultaron nuevamente para este cierre. Sin cambios a cuentas, settings,
credenciales, proyectos, Obsidian, catálogo, conexiones o automatizaciones.
S3.3 y los borradores SC-1/AD-1 conservan su alcance y autorización separados.
