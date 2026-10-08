# IA-1 — Base offline de una variante textual aislada

## Estado, propósito y límites

Consolidación local autorizada el 2026-10-07 (America/Bogota): validar cuatro
rutas de forma aislada y secuencial, ajustar esta nota, registrar evidencia
privada de la entrega y crear un commit local. No incluye configuración real,
cuentas, clientes, recetas operativas, IA-2, admisión nativa o push.
El resultado actual se registra al final, separado del cierre histórico.

Diseño preparado el 2026-10-05 (America/Bogota). Profundidad SDD: rigurosa.
La autorización posterior «autorizo» permitió construir IV-A–IV-C y probarlos
exclusivamente offline en Agent-Toolkit. No autorizó lecturas privadas,
configuración adicional, cuentas, clientes nativos, commit o push.

[SC-1](agent-client-selective-config.md) permite conocer estructura local;
[S3.2](agent-client-supervised-preflight.md) sigue sin controles efectivos completos.
Objetivo: proponer restricciones por sesión que mantengan intactos los archivos
del usuario. No eliminar hooks/MCP configurados ni registrar contenido personal
en esta biblioteca. Primer candidato: Claude Code por suscripción, no API.

Se distinguen tres hechos: una personalización está configurada; un mecanismo
está documentado; ese mecanismo funcionó en la variante instalada. No tratarlos
como equivalentes. No rebajar S3.2/C1/S1 para transformar los primeros en permiso.

## Etapas y autorización

| Etapa | Resultado | Efectos |
| --- | --- | --- |
| IA-1 offline | Constructor/evaluador de descripción de variante y pruebas sintéticas | Solo archivos del Toolkit autorizados; sin IO/cliente en la API |
| IA-2 posterior | Plan de comprobaciones pertinentes de la variante instalada | Autorización nueva; no reciclar versión/ayuda como prueba de aislamiento |
| S3.2 posterior | Nueva revisión de controles/acceso cuando exista evidencia suficiente | Lote nuevo explícito; no reusar su permiso consumido |
| S3.3 posterior | Piloto con presupuesto/contexto/cliente/modelo fijados | Autorización separada de inferencia |

La implementación original entregó IA-1 offline, no creó material privado nuevo
ni ejecutó IA-2/S3.2/S3.3. La consolidación actual añade únicamente evidencia
privada de su entrega local, no observaciones o pruebas nativas.
El traspaso manual permanece disponible mientras los gates nativos sigan cerrados.

## IV-01. Configuración propuesta por sesión

La variante se describe con IDs cerrados de mecanismos, no una cadena de shell,
argv aportado por el modelo o JSON arbitrario de settings. El ejecutable, modelo,
workspace y archivos operativos se resolverán en una integración posterior.

| Riesgo | Mecanismos candidatos a contrastar | Pendiente que no resuelven por sí solos |
| --- | --- | --- |
| Herramientas y código | Herramientas vacías y deny total; modo restringido | Efectos anteriores a una llamada de herramienta |
| Personalizaciones locales | Safe mode, modo restringido y fuentes de settings acotadas | Política administrada/embebida y composición de opciones |
| Hooks | Override de sesión disableAllHooks | Hooks administrados, cuya exclusión no acredita el override personal |
| MCP | Configuración estricta con mapa propio vacío | Conflicto con configuración administrada y alcance del host |
| Conectores/IDE/navegador | Descubrimiento de conectores desactivado; navegador no habilitado | Fuentes del host y soporte efectivo de la combinación |
| Skills/plugins/delegación | Personalizaciones excluidas y herramientas no disponibles | Trabajo auxiliar o delegado fuera de los mecanismos probados |
| Updates/telemetría | Entorno hijo mínimo y controles documentados | Tráfico esencial, caches y efectos internos no certificados |
| Resume/persistencia/fallback | No resume/continue, no persistencia de sesión y fallback no solicitado | Defaults/políticas o fallback interno no evaluado |

Lista de candidatos, no receta aprobada. No sumar flags a ciegas ni decidir que
un JSON vacío elimina fuentes inferiores. Una combinación incompatible bloquea;
no quitar la restricción y seguir con el mismo permiso.

No usar bypassPermissions, aceptar todas las herramientas, --add-dir, cargar
plugins, IDE, canales, cloud, agents, worktree o expandir entorno para resolver
un error. No cambiar HOME, copiar tokens, ejecutar hooks de configuración o
modificar configuración administrada/global/proyecto.

## IV-02. Suscripción y límites conservados

La sesión nativa conserva su identidad original; el entorno hijo es explícito
y no hereda claves API/helpers/proveedores alternativos, proxies o tracing.
No declarar ausencia efectiva de esas fuentes solo por excluir variables.

Bare no sustituye la ruta de suscripción. Si una versión futura cambia la ruta
por defecto de print, revaluar el binding; no adoptar API/credenciales adicionales
para que funcione. El artefacto/versión/configuración/entorno evaluados quedan
fijados; una actualización invalida evidencia anterior.

Un turno o un proceso no acredita una llamada interna. En la ruta supervisada,
techo de llamadas/cancelación remota permanecen desconocidos si no hay evidencia.
La variante no certifica cuota ni gasto; requiere atestación económica actual
y acceso nativo compatible antes de un piloto. No renueva declaraciones del chat.

## IV-03. Entrada y salida offline implementadas

API: `createIsolatedVariantEvaluator(schema, trustedPolicy)` devuelve
`evaluateIsolatedVariant(input)`. El esquema y la política se copian desde código
de confianza. Sin callbacks de lectura, reloj real, red, procesos o azar.

Input cerrado, hasta 32 KiB: versión de esquema, variante conocida, binding
no secreto de candidato, instante UTC explícito, modo/rol, observaciones locales
estructurales por referencia, mecanismos de la plantilla y evaluaciones por
mecanismo. Nada de rutas, comandos/hooks, URLs, tokens, cuentas o settings crudos.
Rechazar coerción, extras, duplicados, proxies/getters, ciclos y Unicode/fechas inválidos.

Proveniencias separadas: `documented`, `local-structure-observation`,
`operator-attested`, `native-variant-tested`, `pending`, `rejected`.
Las pruebas de fixtures no se presentan como native-variant-tested. Una referencia
o hash valida consistencia, no autentica la prueba ni el consentimiento.

La evaluación se vincula a variante, candidato, política y definición de mecanismos.
Cambiar cualquier componente deja pruebas anteriores fuera de scope; no refrescar
fechas para conservar un resultado favorable. Rechazo, caducidad, revocación,
futuro o incompatibilidad bloquean. Falta de evaluación mantiene incompleto.

Output cerrado: `invalid`, `incomplete`, `blocked`, `ready-for-variant-review`,
razones/faltantes ordenados y hash de descripción no secreta. Siempre:
`executed: false`, `runtimeReady: false`, `verifiedAdmission: false`,
`externalBillingVerified: false`, `effectiveIsolationVerified: false`.
No devolver receta ejecutable, ticket, reserva o permiso de acceso/inferencia.

`ready-for-variant-review` solo permite revisión humana de la descripción.
Ni esa salida ni un conjunto de strings que diga «probado» abren gates reales.
No adaptar automáticamente SC-1 al contrato S3.2 ni modificar sus nueve requisitos.

## IV-04. Comprobaciones futuras y bloqueos concretos

IA-2 deberá definir evidencia local pertinente para cada mecanismo/combinación,
con scope y efectos propios. Presencia en ayuda no acredita precedencia, ausencia
de hooks, conexión MCP o ruta de autenticación. Documentación no es esa prueba.

No usar --init-only para asumir que no ejecuta hooks: su finalidad puede incluirlos.
No iniciar una sesión/modelo para investigar retrospectivamente si corrió un
helper peligroso. No demostrar bloqueo preventivo solo buscando eventos en una
salida: la detección posterior no deshace los efectos.

Una prueba futura con sensores/dobles debe explicar qué controla realmente
y por qué no eleva una fixture a instalación verificada. Evidencia de políticas
administradas/remotas sigue pendiente si no existe fuente suficiente y autorizada.
Si no se puede ensayar un requisito con efectos aceptables, registrar exactamente
ese requisito y conservar el traspaso manual, no inventar un siguiente lote idéntico.

## Entregas IA-1 y pruebas por dependencia

| Paso | Resultado | Verificación |
| --- | --- | --- |
| IV-A | Esquema y plantilla interna de mecanismos, sin datos personales | IDs/roles/caps cerrados; no recetas del modelo |
| IV-B | Evaluador puro de composición/evidencia | Coherencia, scope, fuentes, frescura, revocación y bloqueo |
| IV-C | Pruebas/registro documental | Efectos instrumentados en cero, adversarios y regresión |

Rutas implementadas: `schemas/agent-client-isolated-variant.schema.json`,
`src/client-isolated-variant.js` y `test/client-isolated-variant.test.js`.
Política explícita: identificador, edad de evidencia hasta una hora,
referencias revocadas y variantes permitidas; sin defaults ocultos o auto-descubrimiento.

Fixtures con cliente/modelo/referencias ficticias, sin configuración real.
Casos: hooks/MCP configurados con exclusión solo documentada, políticas desconocidas,
conflictos, mecanismos omitidos/duplicados, ajustes no permitidos, prueba de otro
artefacto/variante, atestación promovida, referencias revocadas/expiradas, permiso
fake, ruta API/bare incompatible y binding cambiado. No iniciar clientes.

### Contrato de la base

Variante única: `claude-subscription-text-v1`. Candidato cerrado: cliente,
identificador ficticio/no secreto, huellas del artefacto/configuración/entorno,
referencia de versión y ruta de autenticación declarada. API/bare bloquean;
ruta desconocida queda incompleta. Ninguna declaración verifica login o plan.
Los modos `tutor`/`autonomous` y roles `proponent`/`reviewer` solo describen el
trabajo textual propuesto, no otorgan capacidad de escribir código.

`ISOLATED_MECHANISMS` contiene doce definiciones semánticas inmutables, cada
una con su huella; incluye exclusión independiente de fuentes administradas.
No contiene flags ni garantiza compatibilidad entre opciones de una instalación.
Se requieren los doce mecanismos, sus observaciones estructurales y sus
evaluaciones. Ausencias/estados desconocidos quedan incompletos; duplicados,
rechazos e incompatibilidades bloquean. `configured` no equivale por sí solo a
aislado ni a incompatible: una exclusión únicamente documentada sigue pendiente.

Las observaciones solo incluyen ID de mecanismo, estado, referencia y fecha.
La evaluación `pending` no lleva evidencia. Las otras evaluaciones incluyen
proveniencia, base, resultado, referencia, fecha y huellas de scope/definición.
Una base de documentación/estructura/atestación presentada como prueba nativa
bloquea por incoherencia. Strings coherentes de `native-variant-tested` son
revisables como declaraciones, nunca autenticadas por esta API.

`descriptionSha256` vincula variante, candidato, modo/rol, selección y
observaciones ordenadas. `scopeSha256` añade política y definiciones internas.
Un borrador pendiente devuelve ambas huellas; se puede usar el scope para
vincular evaluaciones posteriores de esa misma descripción, sin que ese hash
sea una firma, prueba o permiso. `now` queda fuera del binding: adelantar el
instante explícito comprueba caducidad sin renovar la evidencia. Referencias
revocadas, fechas futuras o edad superior al límite bloquean; el límite exacto
se acepta. Una política cambiada invalida el scope anterior.

Entrada/JSON de política hasta 32 KiB, UTC con segundos y calendario válido.
No se ejecutan getters/toJSON/trampas de proxies. Fallos devuelven códigos
cerrados sin valores, nombres arbitrarios ni errores crudos. Esquema y política
son suministrados por código confiable; no aceptar reemplazos de un modelo.
Las huellas no detectan secretos escondidos dentro de referencias legítimas:
el llamador debe utilizar IDs no personales, nunca credenciales como IDs.

## Criterios y siguiente puerta

1. Ni la entrada favorable produce IO, procesos, receta ejecutable o admisión.
2. Configurado/documentado/estructura/efectividad permanecen separados.
3. Plantilla cerrada sin overrides de un modelo, bypass, API o cambio de configuración.
4. Incertidumbre/conflicto/rechazo se conserva con faltantes concretos.
5. Ningún dato personal/secretos de configuración se incorpora a fixtures o informes.
6. Esquema/política/inputs inmutables; parser y errores acotados y redactados.
7. Pruebas y regresión con evidencia; contratos anteriores intactos.
8. Sin IA-2, S3.2 nuevo, S3.3, memoria, automatizaciones, commit o publicación.

La aprobación de IA-1 permite IV-A–IV-C exclusivamente offline. Una ejecución
nativa futura necesita otra especificación/permiso con candidato, controles,
contexto, efectos y presupuesto enumerados. No repetir autorizaciones por cada
operación normal del lote, pero tampoco usar esta para ampliar ese alcance.

## Fuentes oficiales y alcance de las inferencias

Consulta: 2026-10-05 (America/Bogota), no prueba de una instalación:

- Restringido acota herramientas/fuentes; safe mode conserva parte de la política
  administrada; herramientas vacías y MCP son controles diferentes.
  [CLI](https://code.claude.com/docs/en/cli-reference).
- disableAllHooks de sesión no neutraliza hooks administrados.
  [Hooks](https://code.claude.com/docs/en/hooks).
- Configuración MCP estricta interactúa con managed-mcp y puede rechazar inicio;
  no neutralizar política para que la prueba continúe.
  [MCP](https://code.claude.com/docs/en/managed-mcp).
- Variables de updates/tráfico/conectores son controles distintos, no sandbox
  universal. [Entorno](https://code.claude.com/docs/en/env-vars).
- Bare no utiliza el login de suscripción; no migrar a API para aislar.
  [Ejecución programática](https://code.claude.com/docs/en/headless).

Es inferencia de diseño, no garantía externa: combinar mecanismos específicos
podría delimitar el piloto sin editar archivos. Su viabilidad real requiere IA-2;
si no se demuestra, los gates permanecen cerrados.

## Revisión documental inicial (histórica)

Resultado de quality-gate: **Aprobado con observaciones para el diseño**.
SDD separó preparación offline y pruebas nativas; la revisión preservó gates
anteriores y la distinción entre estructura, documentación y efectividad.
Ninguna combinación fue marcada como probada por aparecer en una referencia.

Dos documentos revisados: 8 enlaces locales existentes, 8 tablas consistentes,
formato correcto, `git diff --check` limpio e índice sin staging. Escaneo limitado
de patrones sensibles sin hallazgos. Comparación SHA-256: 189 de 190 archivos
previos intactos, solo el índice propio SC-1 actualizado, un documento nuevo
y cero borrados. No hubo cambios funcionales ni regresión de código ejecutada.

Sin lecturas de configuración/evidencia privada adicionales, procesos nativos,
cuentas, prompts, carpeta privada nueva, cambios de proyecto/Obsidian,
automatizaciones, commit o push. Observaciones: viabilidad real y pruebas de
composición/políticas todavía pendientes. En esa revisión IA-1 era solo diseño;
IV-A–IV-C requerían aprobación expresa, recibida posteriormente para la base
offline descrita en este documento. No se autorizó admisión nativa.

## Cierre histórico de implementación IA-1

Comprobación offline: 2026-10-05 (America/Bogota).

- Batería propia final: **143/143**, 258 ms; cero fallos, canceladas,
  omitidas o pendientes. Instrumentación después de importar módulos:
  constructor y evaluación favorable sin IO, red, procesos, reloj actual ni azar.
- Regresión final: **2 354/2 354**, 83 144 ms, concurrencia dos; cero fallos,
  canceladas, omitidas o pendientes. Los contratos C1/S1/S3.2 no se modificaron.
- Sintaxis verificada, esquema compilado, informes cerrados y límite exacto de
  32 KiB comprobados. Getters/toJSON/trampas de proxies no fueron ejecutados.
- Dos documentos: 8 enlaces locales existentes, 9 tablas consistentes,
  sin espacios finales. Escaneo limitado de patrones sensibles sin hallazgos;
  no es una certificación de ausencia universal de secretos.
- Preservación SHA-256: 189 de 191 archivos previos intactos; solo los dos
  documentos propios cambiados, tres archivos nuevos, cero borrados.
  `git diff --check` limpio e índice sin staging.

| Criterio | Evidencia |
| --- | --- |
| 1 | Salidas sin receta/ticket, cinco indicadores siempre falsos e instrumentación de efectos |
| 2 | Tres procedencias no nativas conservan faltantes; configuración de hooks/MCP no se eleva |
| 3 | Doce mecanismos cerrados, API/bare bloqueados y extras/overrides rechazados |
| 4 | Duplicados, incompatibilidad, incertidumbre, calendario, caducidad y revocación |
| 5 | Fixtures ficticias, IDs estructurales y errores redactados; sin fuentes privadas |
| 6 | Copias inertes, entradas adversarias, tamaño exacto y política sin defaults |
| 7 | Suite propia/regresión completas y comparación de huellas de archivos anteriores |
| 8 | Sin clientes/cuentas, IA-2/S3.2/S3.3, memoria, automatización, commit o push |

Resultado de quality-gate: **Aprobado con observaciones para la base offline**.
SDD delimitó la implementación; la revisión reforzó procedencias y pruebas de
no ejecución. La observación principal permanece: ninguna referencia sintética,
huella o declaración autentica efectividad nativa, acceso, cuota o facturación.
El borrador local IA-2, `docs/agent-client-isolated-verification-plan.md`, define
evidencia pertinente, límites y viabilidad antes de cualquier arranque. No se
incorpora a esta entrega versionada; conserva su autorización y evidencia
históricas separadas. Su planificador offline no concede permiso de ejecutar
un cliente ni convierte estas declaraciones en evidencia efectiva para los
gates anteriores; sigue sin ejecutor o recolector de efectividad nativa.
## Consolidación versionada local IA-1 — 2026-10-07

Este cierre tiene autorización propia para validar cuatro rutas de forma
aislada y secuencial, ajustar esta nota, registrar evidencia privada y crear un
commit local. No repite o renueva lecturas privadas, pruebas de instalación,
estado de cuenta, configuración, IA-2 o un permiso de inferencia.

### Evidencia independiente

Comprobación local: macOS arm64, Node `v24.14.1`.

| Comprobación | Resultado observado |
| --- | --- |
| Suite propia durante la revisión, mismos bytes del candidato | 143/143; salida 0; 249,811625 ms |
| Regresión aislada: base versionada más cuatro rutas IA-1 | 2 702/2 702; salida 0; 152 364,969792 ms |
| Casos de la base / casos añadidos IA-1 | 2 559 / 143 |
| Fallos, canceladas, omitidas y pendientes de las baterías finales | 0 / 0 / 0 / 0 |
| Sintaxis | Dos comprobaciones node --check, cada una con salida 0 |
| Esquema | Diez definiciones compiladas con Ajv2020 en modo estricto |

La regresión usa `node --test --test-concurrency=1 --test-reporter=spec`.
No se modificaron código funcional, timeouts, casos u omisiones para hacerla
pasar. La copia contiene únicamente la base versionada más estas cuatro rutas,
no IA-2 u otros borradores pendientes. Después de la regresión solo cambió
esta nota; esquema, evaluador y pruebas conservan los bytes probados.

| Criterio IA-1 | Evidencia y límites del cierre actual |
| --- | --- |
| 1: sin ejecución/admisión | Informes cerrados y cinco flags siempre false; instrumentación tras importar módulos sin IO, red, procesos, reloj actual o azar desde constructor/evaluación |
| 2: procedencias separadas | Documentación, estructura y atestación no se elevan a pruebas efectivas; claims nativos sintéticos solo permiten revisar coherencia |
| 3: plantilla cerrada | Doce mecanismos inmutables; extras, overrides, rutas/argv y variante ajena rechazados; API/bare bloqueados |
| 4: incertidumbre y conflictos | Mecanismos/observaciones/evaluaciones ausentes, desconocidos, duplicados, rechazo, incompatibilidad, revocación y fechas futuras/vencidas conservados |
| 5: datos no personales | Fixtures y referencias ficticias, campos y errores acotados; no fuentes privadas consultadas ni recetas operativas devueltas |
| 6: inmutabilidad y límites | Esquema/política capturados, orden estable, límite exacto de 32 KiB, UTF-8 y calendario; getters, proxies y toJSON no ejecutados |
| 7: cierre verificable | 143 casos propios y 2 702 casos aislados; comparación de huellas, cuatro rutas exactas y trabajo ajeno preservado |
| 8: alcance posterior separado | Sin IA-2, consultas reales, S3.2 nuevo, S3.3, cambios de configuración, memoria o automatizaciones; commit local solo por este permiso propio, sin publicación |

### Límites conservados

Resultado de quality-gate: **Aprobado con observaciones para consolidación local
de IA-1**, no para certificar efectividad o ejecutar una variante instalada.

`ready-for-variant-review` expresa coherencia de declaraciones no autenticadas.
No demuestra que la prueba citada exista o corresponda a la instalación real.
Ni las huellas de descripción/scope ni referencias coherentes son firmas,
consentimiento humano o tickets de admisión. `executed`, `runtimeReady`,
`verifiedAdmission`, `externalBillingVerified` y
`effectiveIsolationVerified` permanecen false.

El esquema y la política pertenecen a código de confianza; esta API no admite
reemplazos aportados por un modelo. El instante UTC es explícito, no un reloj
actual comprobado. Sus límites y comparaciones de frescura no autentican la
fecha de una prueba. Los IDs deben ser no personales: una forma válida no
detecta automáticamente credenciales o secretos codificados en ellos.

La instrumentación observa constructor/evaluador después de cargar módulos;
no certifica ausencia de lectura al importar dependencias ni un sandbox para
código malicioso. Tampoco este resultado secuencial local certifica todas las
plataformas, cargas, mecanismos instalados, precedencias o efectos de un cliente.

Las fuentes externas conservan su fecha histórica, sin consultas nuevas en
este cierre. Sin lecturas de settings/estado global/credenciales reales,
clientes, cuentas, prompts, aplicación de flags o recetas, cambios a proyectos,
Obsidian, catálogos, conexiones o automatizaciones. Sin push. IA-2 y los
lotes nativos posteriores conservan alcance y autorización separados.
