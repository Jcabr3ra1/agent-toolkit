# N1 — Consulta selectiva de preferencias macOS

## Estado y alcance de esta entrega

Consolidación local autorizada el 2026-10-08 (America/Bogota): validar siete
rutas en una copia aislada y secuencial, compilar/enlazar e inspeccionar símbolos
del backend real sin ejecutarlo, ejecutar solo los backends ficticios, ajustar
esta nota, registrar evidencia privada de entrega y crear un commit local.
No incluye consulta real de preferencias, N1-I, clientes, cuentas o push.
El cierre actual se registra al final, separado de la evidencia histórica.

Diseño preparado el 2026-10-05 (America/Bogota), tras «sigamos» al cerrar
el inventario N0. Profundidad SDD: rigurosa. Solo investigación, especificación
y revisión documental; sin implementar un lector o consultar preferencias reales.
La aprobación posterior «apruebo» autorizó el helper y lector, compilación y
pruebas con datos ficticios. La base se implementó bajo ese alcance; no se
ejecutó el backend Core Foundation ni se consultaron preferencias reales.

[N0](agent-client-isolated-native-feasibility.md) no observa la fuente MDM.
El dato siguiente sería presencia/tipo y carácter forzado de claves concretas,
no otra ronda de metadata de archivos. El objetivo no es diagnosticar todo el
dispositivo ni certificar el aislamiento del cliente.

Esta consulta requiere un alcance nuevo: los valores consultados pueden contener
comandos, URLs, variables o credenciales, aun cuando la salida solo muestre tipos.
No reutilizar la autorización lstat N0 o de [SC-1](agent-client-selective-config.md).
No escribir resultados reales de esa máquina en el repositorio genérico.

## Hechos oficiales y decisión de viabilidad

Claude Code documenta la fuente de preferencias administradas macOS en el
dominio `com.anthropic.claudecode`.
[Fuente MDM](https://code.claude.com/docs/en/managed-settings).

Apple ofrece dos consultas distintas: `CFPreferencesCopyAppValue` obtiene un
valor por clave/aplicación y puede devolver null si no lo localiza;
`CFPreferencesAppValueIsForced` informa si el usuario puede cambiar esa clave.
Un false de la segunda no demuestra ausencia ni desactivación.
[Valor de preferencia](https://developer.apple.com/documentation/corefoundation/cfpreferencescopyappvalue(_:_:)),
[Carácter forzado](https://developer.apple.com/documentation/corefoundation/cfpreferencesappvalueisforced(_:_:)).

Decisión: **candidata viable para una proyección parcial**, pendiente de comprobar
herramientas nativas, bindings y límites con pruebas. No afirmar equivalencia
entre este método y la resolución completa que hace el cliente instalado.
Las páginas dinámicas de Apple no devolvieron su contenido completo al abrirlas;
los contratos de estas dos funciones se contrastaron en resultados oficiales
indexados. No se adivinaron APIs privadas o rutas plist.

## NP-01. Aplicación y selectores propuestos

Aplicación solicitada única: `com.anthropic.claudecode`. Sin aplicación aportada
por el modelo, comodines, búsqueda de perfiles o lista global de preferencias.
No suponer que un applicationID fija un único archivo físico: el SO resuelve
la consulta y su búsqueda interna no queda certificada por esta especificación.

| Clave literal | Pregunta limitada | Lo que no se evalúa |
| --- | --- | --- |
| `hooks` | Valor localizado, tipo y carácter forzado | Comandos, URLs, eventos, ejecución o precedencia |
| `policyHelper` | Valor localizado, tipo y carácter forzado | Ejecutable, argumentos o política calculada |
| `apiKeyHelper` | Valor localizado, tipo y carácter forzado | Comando, salida o credenciales |
| `env` | Valor localizado, tipo y carácter forzado | Nombres/valores de variables y efectos de su composición |
| `managedMcpServers` | Valor localizado, tipo y carácter forzado | Servidores, URLs, headers, credenciales o conexión |
| `disableAllHooks` | Valor localizado, tipo y carácter forzado | No se extrae el valor booleano ni se declara exclusión efectiva |

Lista parcial deliberada. No inventar cobertura de todas las claves de política
o de fases de arranque. Una presencia desconocida o una clave no examinada
sigue pendiente. Un valor null no se registra como ausencia universal de MDM.

Tipos de salida: `boolean`, `number`, `string`, `array`, `dictionary`, `other`
o `not-found-by-api`. Carácter forzado: `forced`, `not-forced` o `unknown`.
No devolver valores, tamaños, claves anidadas, descripciones de objetos, rutas
de backing store o datos de cuenta. Indicadores de admisión/efectividad siempre
falsos; resultado `partial-preference-observation`, nunca ready-for-runtime.

## NP-02. Lectura y privacidad que se propone autorizar después

El método sería un helper propio pequeño que llama a Core Foundation, no Claude,
un SDK de agentes, defaults con volcado completo o un programa configurado por
el usuario. No ejecutar comandos encontrados dentro de preferencias.

Cada valor puede materializarse íntegro dentro del SO/helper antes de inspeccionar
su tipo. Esto **no** reproduce la garantía de SC-1 de descartar strings mientras
se parsean bytes. No prometer un límite de tamaño de entrada antes de que el SO
devuelva el objeto, ni borrado forense de memoria, logs del SO o copias internas.
No concatenar, serializar, hashear o convertir a texto los valores consultados.
Liberar cada referencia obtenida antes de avanzar; cerrar el proceso tras el lote.

Sin CopyMultiple, CopyKeyList, enumeración de aplicaciones, sincronización/set
de preferencias, lectura directa de plists/cache, keychain, perfiles globales,
login, helpers de usuario, sudo o cambio de identidad/HOME. No contactar al
proveedor, instalar dependencias o cambiar configuración para que funcione.

La declaración económica o categoría de plan proporcionada por una persona
conserva esa procedencia. Server-managed settings dependen de la elegibilidad
de las credenciales/ruta; una declaración vigente de Pro personal acota esa
rama, pero no equivale a observación técnica de sesión/cache o exclusión de
política local. Se registra solo en el chat, no como dato personal de este catálogo.
[Entrega remota](https://code.claude.com/docs/en/server-managed-settings#platform-availability).

## NP-03. Arquitectura, implementación y límites

Se implementaron un bridge nativo mínimo y un lector de su protocolo, con origen
de datos explícito. El backend ficticio se enlaza por separado y no usa Core
Foundation. No simula una observación auténtica de la instalación.

| Componente | Responsabilidad | Puerta anterior a datos reales |
| --- | --- | --- |
| Helper Core Foundation, implementado | Seis claves fijadas en código, solo proyección de tipos/forzado | Compilado/enlazado sin ejecutarlo; pruebas con getters ficticios |
| Protocolo/lector Node, implementado | JSON cerrado, fuente, límites y errores redactados | UTF-8, duplicados, extras, cierre, límites y salidas prohibidas |
| Invocación controlada, borrador local separado | Helper fijado, permiso propio y supervisión propuestos fuera de esta entrega | Borrador N1-I: `docs/agent-client-managed-preferences-invocation.md`; lote real y permiso propios |

Se encontró Clang/SDK macOS en las Command Line Tools ya instaladas, sin
instalaciones o cambios. Las rutas se fijaron para las pruebas: el primer intento
con entorno mínimo no localizó cabeceras del sistema; se corrigió con el isysroot
documentado por la ayuda del compilador y observado mediante xcrun.
Compilación/enlace no ejecutan el helper. Las pruebas usan un backend ficticio
sin enlace a las APIs de preferencias; el binario de producción nunca se arrancó.

Presupuesto de un lote real propuesto: seis consultas de valor y seis de carácter
forzado, máximo un arranque del helper, cero reintentos, stdout/stderr hasta
32 KiB cada uno. Plazo local propuesto 15 s, con terminación y confirmación;
no implica cancelación de una operación interna del SO o una garantía de memoria.
La compilación no está incluida en ese presupuesto ni es un permiso de lectura.

Salida inválida, falta de soporte, error, lectura incompleta o terminación no
confirmada conservan desconocimiento. No intentar otro dominio/usuario/host,
otra API o una consulta al cliente como fallback. No almacenar stdout/stderr
crudos; solo proyección validada en el chat, sin carpeta privada nueva por defecto.

### Contrato implementado

| Archivo | Responsabilidad |
| --- | --- |
| [Helper C](../src/native/managed-preferences.c) | Backends seleccionados al compilar, cero argumentos, seis claves/tipos/forzado |
| [Interfaz C](../src/native/managed-preferences.h) | Tipos y ownership de copy/type/release/forced, sin callbacks de configuración |
| [Contrato](../schemas/agent-client-managed-preferences.schema.json) | Wire/report cerrados, seis campos y códigos conocidos |
| [Lector](../src/client-managed-preferences.js) | Decoder/stream puros, sin IO o arranque de procesos |
| [Backend ficticio](../testing/managed-preferences/backend.c) | Datos simulados, contadores de orden/ownership y fallos; sin Core Foundation |
| [Pruebas](../test/client-managed-preferences.test.js) | Protocolo adverso, compilación y ejecución exclusiva de fixtures |

El helper rechaza argumentos antes de consultar. Obtiene/libera una referencia
por clave antes de preguntar si está forzada o avanzar; solo retiene enums e
indicadores para emitir. Datos string/diccionario/array no se inspeccionan ni
serializan. Emite JSON una vez completadas las seis claves. Fallos antes de esa
emisión devuelven un error cerrado sin campos provisionales. El SO puede conservar
copias; release no es borrado forense ni demuestra ausencia de cache.

`createManagedPreferencesReader(schema, expectedSource)` devuelve un decoder
de `(wire, exitCode)`. Source esperado obligatorio: `synthetic` o
`core-foundation-claim`; la segunda sigue siendo una declaración de protocolo,
no prueba de que se consultó la instalación. Valida source/exit/forma y normaliza
el orden de las seis claves. Estados: `invalid`, `helper-failed`,
`partial-observation`; sin campos si hay error o input incompleto.

`createManagedPreferencesStreamReader` ofrece push/abort/finish. Un único buffer
retenido de 32 KiB evita crecimiento por fragmentos vacíos; no se publican campos
antes de cerrar y validar. Cierre doble, bytes extra, aborto o cambio informado
por el transporte dejan informe inválido. Los códigos de timeout/overflow/cambio
de artefacto son notificaciones del llamador, **no un supervisor implementado**.
Ni el decoder ni el stream abren archivos, pinnean artefactos, arrancan procesos,
ejecutan timers o prueban terminación. Esa parte queda en la invocación real futura.

`decision: no-native-start` siempre. `helperExecutionVerified`,
`preferencesQueriedVerified`, `runtimeReady`, `verifiedAdmission`,
`effectiveIsolationVerified` y `externalBillingVerified` siempre false. Los
primeros dos indican falta de verificación del decoder, no la afirmación de que
ningún proceso haya corrido antes de pasarle los datos. Null/false/forzado
incoherentes se conservan como observación parcial no atómica, nunca como permiso.

Esquema copiado de forma inerte, inputs hasta 32 KiB y source/exit sin coerción.
JSON duplicado, Unicode/UTF-8 inválido, proxies/getters/ciclos, extras y valores
crudos se rechazan con códigos redactados. No admitir esquemas/source aportados
por un modelo ni convertir una salida sintética a prueba nativa.

## Etapas, pruebas y aprobación

1. Implementación de bridge/protocolo autorizada y terminada con fuentes
   ficticias. Ninguna lectura de preferencias reales fue parte de esta etapa.
2. Bindings de compilación, tipos/ownership, null/false, extras, getters/errores
   ficticios, protocolo/bytes y privacidad se probaron. La verificación de un
   artefacto de ejecución y los plazos/terminación de un supervisor real siguen
   pendientes; los abortos del stream no se presentan como esa verificación.
   Regresión sin cuentas/clientes o preferencias reales.
3. Solo después: aprobar el lote con helper/artefacto/destino exactos y aceptar
   explícitamente la materialización temporal de valores posiblemente sensibles.
   Ese permiso no incluye callbacks arbitrarios, archivo de datos o Claude.
4. Informar observaciones parciales; no adaptar automáticamente IA-1/IA-2/S3.2
   o eliminar requisitos para permitir un arranque. Si no aporta la evidencia
   que falta, cerrar con esa limitación y conservar el traspaso manual.

## Criterios del diseño original

1. API de valor y API de forzado separadas, sin concluir ausencia a partir de false.
2. Aplicación/seis selectores exactos, cobertura parcial y fuente explicados.
3. Privacidad temporal distinta de SC-1 y límites de entrada/retención visibles.
4. Solo helper propio futuro, pruebas sintéticas primero y permiso de lectura separado.
5. Sin consultas remotas, almacenes de credenciales o promoción de atestaciones.
6. Presupuesto/salidas/paradas concretos; sin fallbacks o cambios de configuración.
7. Sin código nuevo, compilación, lectura de preferencias, cliente o Git en este diseño.
8. Fuentes, enlaces, formato y preservación se revisan antes del cierre.

## Revisión documental inicial (histórica)

Resultado de quality-gate: **Aprobado con observaciones para el diseño parcial**.
SDD separó diseño, implementación sintética y lectura real. La revisión hizo
explícitas la materialización de valores, la diferencia entre forzado/presencia
y la falta de equivalencia certificada con la resolución del cliente instalado.
No interpretar el documento como observación de la instalación o permiso nativo.

Comprobación documental: 2026-10-05 (America/Bogota).

- Dos documentos: 5 enlaces locales existentes, 7 tablas consistentes, formato
  correcto, `git diff --check` limpio e índice sin staging.
- Seis selectores literales, dos funciones oficiales y tres etapas separadas.
  Sin consultas reales de preferencias, herramientas nativas o cuentas.
- Preservación SHA-256: 198 de 199 archivos previos intactos; solo el índice
  N0 actualizado, un documento nuevo y cero borrados.
- Escaneo limitado de patrones sensibles sin hallazgos. No se copió la categoría
  de cuenta del usuario como estado de instalación o dato personal del Toolkit.
- Sin cambios funcionales ni pruebas de implementación N1 ejecutadas; no se
  repitió la regresión completa. Las pruebas previas no certifican este lector.

| Criterio | Evidencia documental |
| --- | --- |
| 1 | Contratos Apple separados; false no se convierte en ausencia |
| 2 | Dominio/seis claves/proyección cerrados y cobertura parcial |
| 3 | Materialización temporal y límite de entrada no certificado declarados |
| 4 | Helper propio futuro; pruebas ficticias antes de cualquier permiso real |
| 5 | Sin consulta de cuenta/cache/política remota; declaración humana diferenciada |
| 6 | Operaciones, salidas, plazos y parada sin fallback |
| 7 | Solo documentos; código/guards y configuración sin modificaciones |
| 8 | Fuentes, enlaces/tablas/formato, huellas e índice revisados |

Pendientes: bindings y compilador, implementación/pruebas sintéticas, alcance
de búsqueda de la API y autorización específica antes de consultar valores reales.
No se iniciaron clientes, instaló software, creó evidencia privada, modificó
Obsidian/proyectos/configuración/automatizaciones o hizo commit/push.

## Cierre histórico de la base N1 con datos ficticios

Verificación: 2026-10-05 (America/Bogota), macOS arm64.

- Primer intento nativo de compilación: cabeceras no encontradas bajo entorno
  mínimo. Se fijó explícitamente el SDK existente, sin instalar o cambiar tools.
  Ese fallo no se presentó como una prueba de preferencias o del cliente.
- Batería propia después de corregir el SDK: **138/138**, 5 812 ms;
  ampliada tras revisar retención de fragmentos: **141/141**, 5 224 ms.
  Cero fallos, canceladas, omitidas o pendientes en la batería final.
- Regresión completa final del estado revisado: **2 654/2 654**, 85 431 ms,
  concurrencia dos, sin fallos, canceladas, omitidas o pendientes.
- Backend real compilado/enlazado y símbolos de las dos APIs/release inspeccionados
  con nm. **Nunca se ejecutó ese binario**. Esto verifica enlace de compilación,
  no comportamiento de las APIs sobre preferencias del dispositivo.
- Backends ficticios compilados/ejecutados sin símbolos Core Foundation de
  preferencias. Contadores comprueban seis claves/aplicación/orden, liberación
  antes de forced/siguiente clave, fallo con valor obtenido y no emisión parcial.
- Datos secretos ficticios no aparecen en la salida. Protocolo estricto,
  tipos/forzado separados, cierre doble/aborto y límite exacto de 32 KiB probados.
  El decoder/stream instrumentados no llaman IO/red/procesos/reloj actual/azar.
- Sintaxis y esquema comprobados. Documento: 8 enlaces locales existentes,
  5 tablas consistentes y formato correcto. Escaneo limitado de patrones
  sensibles sin hallazgos; no es una certificación universal de privacidad.
- Preservación SHA-256: 199 de 200 archivos previos intactos; solo este documento
  propio actualizado, seis archivos nuevos y cero borrados. Artefactos compilados
  solo en temporales de pruebas, retirados por identidad al cerrar.
  `git diff --check` limpio e índice sin staging.

| Criterio de la implementación | Evidencia ejecutada |
| --- | --- |
| Selector/backend cerrado | Seis claves y aplicación literales; cero argumentos; fixture sin enlace a preferencias reales |
| Bindings/ownership | Compilación real sin ejecución; dobles con orden/release y fallos verificados |
| Sin contenido operativo | Solo enums; getters ficticios con secretos no serializados; extras/valores rechazados |
| Protocolo/límites | JSON/UTF-8/duplicados/proxies/coerción, 32 KiB exactos y buffer retenido único |
| Sin promoción de evidencia | sourceClaim explícito, seis indicadores de verificación/admisión siempre falsos |
| Fallos y cierre | Errores completos sin fields, aborto sin recuperación y cierre doble inválido |
| Contratos intactos | Regresión completa y huellas de IA-1/IA-2/SC-1/S3.2/C1/S1 conservadas |
| Alcance aprobado | Compilar real, ejecutar solo ficticio; sin preferencias/cuentas/clientes reales o Git |

Resultado de quality-gate: **Aprobado con observaciones para helper/protocolo y
pruebas sintéticas**. Las skills de especificación y calidad separaron compilación,
ejecución ficticia y consulta real, y reforzaron el límite de retención del stream.
No hay comprobación de preferencias reales, política efectiva, acceso o facturación.

Siguiente dependencia: diseñar e implementar una invocación controlada con
identidad del artefacto, entorno, permisos, límites y terminación verificados
mediante fixtures. Ni los abortos declarados por el stream ni el timeout del
harness de pruebas son ese supervisor. El borrador local N1-I,
`docs/agent-client-managed-preferences-invocation.md`, conserva su alcance y
evidencia históricos con fixtures; no se incorpora a esta entrega versionada.
Un lote real requeriría rutas/artefacto fijados y aceptación explícita del
tránsito temporal de valores bajo una autorización distinta.
No se reutiliza esta aprobación para ejecutarlo.

Sin backend real iniciado, preferencias/configuración privada consultadas,
clientes/modelos/cuentas, instalación, evidencia privada persistente, cambios a
proyectos/Obsidian/automatizaciones, commit o push.
## Consolidación versionada local N1 — 2026-10-08

Esta entrega tiene autorización propia para siete rutas: regresión aislada y
secuencial, compilación/enlace e inspección del backend real sin ejecutarlo,
ejecución exclusiva de backends ficticios, ajustes de esta nota, evidencia
privada de entrega y commit local. No renueva una consulta real de preferencias
ni incorpora N1-I, cuentas, clientes, configuración personal o push.

### Evidencia independiente

Comprobación local: macOS arm64, Node `v24.14.1`.

| Comprobación | Resultado observado |
| --- | --- |
| Suite propia de la revisión, mismos bytes del candidato | 141/141; salida 0; 5 280,163416 ms |
| Regresión aislada: base versionada más siete rutas N1 | 3 002/3 002; salida 0; 488 581,852875 ms |
| Casos de la base / casos añadidos N1 | 2 861 / 141 |
| Fallos, canceladas, omitidas y pendientes de las baterías finales | 0 / 0 / 0 / 0 |
| Backend Core Foundation | Compilación/enlace y símbolos inspeccionados; binario nunca ejecutado |
| Backends ficticios | Compilados y ejecutados; sin símbolos de consulta de preferencias en los casos inspeccionados |
| Sintaxis y esquema | Dos node --check con salida 0; cuatro definiciones compiladas con Ajv2020 estricto |

La regresión usa `node --test --test-concurrency=1 --test-reporter=spec`.
No se cambiaron código funcional, tiempos, casos u omisiones para hacerla
pasar. La duración corresponde a esta batería concreta, no a una garantía de
rendimiento o plazo del helper. La copia incluye solo la base versionada más
estas siete rutas; no N1-I u otros borradores. Después de las pruebas solo
cambió esta nota: los otros seis archivos conservan los bytes probados.

| Criterio de la base N1 | Evidencia y límites del cierre actual |
| --- | --- |
| Selector/backend cerrado | Seis claves/aplicación fijadas en C; argumentos rechazados antes de los getters ficticios; compilación diferenciada por backend |
| Bindings/ownership | Enlace de las APIs y release inspeccionado sin ejecutar producción; dobles comprueban orden, liberación y errores con valores obtenidos |
| Sin contenido operativo | Helper emite enums, no valores; fixture con secretos ficticios sin divulgación y protocolo que rechaza extras/contenido |
| Protocolo y límites | JSON/UTF-8/duplicados/proxies/coerción, 32 KiB exactos, splits, buffer único y fragmentos vacíos |
| Sin promoción de evidencia | Source esperado y sourceClaim explícitos; seis flags de verificación/admisión siempre false y decisión no-native-start |
| Fallos y cierre | Sin campos provisionales ante error; aborto y cierre doble no restauran una proyección válida |
| Contratos intactos | Regresión aislada completa; código previo y borradores ajenos preservados |
| Alcance propio | Compilar real, ejecutar solo ficticio; sin consultas privadas, N1-I o clientes reales; commit local autorizado, sin push |

### Límites conservados

Resultado de quality-gate: **Aprobado con observaciones para consolidación local
del helper/protocolo N1 y sus pruebas sintéticas**. La compilación y los símbolos
no prueban el comportamiento de las APIs sobre las preferencias de la máquina.
No se ejecutó el backend Core Foundation ni se consultaron preferencias reales.

El decoder/stream no abre archivos, fija identidad de un artefacto, supervisa
procesos o comprueba terminación. Sus abortos de transporte son notificaciones
del llamador, no supervisión implementada. `sourceClaim` es una declaración
del protocolo y no autentica quién ejecutó el helper o consultó una preferencia.
`decision: no-native-start` y `helperExecutionVerified`,
`preferencesQueriedVerified`, `runtimeReady`, `verifiedAdmission`,
`effectiveIsolationVerified` y `externalBillingVerified` siguen negativos.

Un uso real necesita permiso propio con artefacto/rutas/efectos exactos y
aceptación de materializar temporalmente valores completos posiblemente
sensibles. Release no certifica borrado forense ni ausencia de caches o copias
del SO. Not-found/false/forzado son observaciones parciales no atómicas; no
prueban ausencia de política, aislamiento efectivo o acceso de suscripción.

Esquema/source y compilador/dependencias son de confianza, no entradas de un
modelo. La instrumentación de decoder/stream se realizó después de importar:
no certifica ausencia de lectura al cargar módulos o un sandbox de código
malicioso. El resultado secuencial en macOS arm64 no certifica otras plataformas
o condiciones de carga. Las fuentes externas conservan fecha histórica, sin
consultas nuevas durante el cierre.

Sin backend real iniciado, preferencias/configuración/credenciales personales
consultadas, clientes, cuentas, prompts, cambios a proyectos, Obsidian,
catálogos de modelos, conexiones o automatizaciones. Sin push. N1-I y cualquier
lote real mantienen alcance y autorización separados.
