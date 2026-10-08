# S3 — Preparación del primer piloto nativo por suscripción

## Estado y objetivo

Consolidación local autorizada el 2026-10-07 (America/Bogota): validación
secuencial aislada de la base versionada más los cinco archivos S3.1, dos
precisiones documentales, evidencia privada y commit local. Este alcance no
repite las consultas nativas históricas, no consulta cuentas ni aprueba S3.2/S3.3.
El resultado de esta consolidación se registra al final.

Especificación propuesta el 2026-10-05 (America/Bogota), tras «listo sigamos».
S3.1 fue autorizada posteriormente con «autorizo», incluyendo implementación,
pruebas, versión/ayuda y dos notas en el lote privado enumerado. El recolector
está implementado; la evidencia del lote nativo se registra en el cierre.
Profundidad SDD: rigurosa. S3.2 recibió autorización propia y cerró la revisión
local con controles incompletos, sin consultar cuenta. S3.3 sigue pendiente.
La autorización de [S2 con fixtures](agent-client-supervised-local.md) no se
reutiliza como permiso nativo. [S1](agent-client-supervised-subscription.md) conserva su evaluador
puro y la ruta estricta C1/C2 no se debilita.

Objetivo: comprobar una variante concreta de Claude Code y preparar un encargo
textual supervisado usando la sesión nativa de suscripción. Sin API keys ni
gasto adicional. La primera tarea será sintética, no código de un proyecto.
No elegir otro proveedor para superar un bloqueo del candidato.

Identidad parcial y firma local se revisaron en los lotes anteriores. No prueban
versión efectiva, configuración activa, ausencia de herramientas ni facturación.
S2 demuestra control de programas propios, no aislamiento de Claude.

## Tres entregas y permisos separados

| Etapa | Resultado | Efectos y estado de autorización |
| --- | --- | --- |
| S3.1: diagnóstico | Versión observada y opciones candidatas, sin sesión de conversación | Autorizado: implementar/probar el recolector y consultar solo versión/ayuda del candidato aprobado |
| S3.2: preflight | Variante, controles, acceso y condición económica revisados | Proyección no secreta de configuración, estado nativo de acceso y confirmación humana actual |
| S3.3: piloto | Una respuesta sintética capturada y revisada | Un arranque de inferencia, contexto explícito y efectos previamente enumerados |

Cada entrega necesita aprobación de su alcance completo, no preguntas por cada
operación normal. Un fallo detiene el lote sin reintentar, cambiar cliente,
ampliar permisos o activar créditos. Aprobar S3.1 no aprueba S3.2/S3.3.

## S3.1 — Diagnóstico acotado aprobado

Actualización: implementado y ejecutado bajo la autorización específica; las
secciones de diseño conservan el alcance aprobado. La evidencia final figura
al final, sin copiar metadatos personales de instalación.

Resultado observable: leer la versión que declara el ejecutable y contrastar
la ayuda con documentación de esa versión, manteniendo pendientes los controles
que no se puedan comprobar. No repetir otra auditoría de firma completa.

1. Leer únicamente la observación privada previa autorizada y revalidar el
   candidato: ruta exacta, enlace, tipo, propietario y huella. Una sustitución
   desde ese lote bloquea; no adoptar una actualización en silencio.
2. Crear un lote privado nuevo exclusivo y un workspace vacío propio. La ruta
   absoluta se aprueba junto con este lote antes de cualquier escritura.
3. Ejecutar directamente el artefacto identificado, sin shell, alias, perfiles
   ni resolución nueva de `PATH`. Dos recetas cerradas: `--version` y `--help`.
   Sin stdin textual; descriptor de entrada cerrado. Ningún `-p`, prompt,
   subcomando de cuenta, diagnóstico general, plugin, MCP, instalación o update.
4. Capturar bytes acotados, retirar secuencias de control y extraer exclusivamente
   versión y presencia de opciones relevantes. No guardar la ayuda/errores crudos,
   URLs embebidas, emails, tokens o instrucciones emitidas por el cliente.
5. Revalidar el artefacto, registrar resultados y cerrar con faltantes concretos.
   Si la primera operación falla, no se inicia la segunda para buscar una salida.

La versión emitida es una declaración del ejecutable vinculada al artefacto
observado; no autentica la release ni certifica todas sus capacidades. Ausencia
de una opción en ayuda no prueba falta de soporte. No inventar un binding válido.

| Recurso | Techo explícito del diagnóstico |
| --- | --- |
| Procesos propios de Claude | Dos como máximo, una vez por receta |
| Conversaciones/prompts/turnos solicitados | Ninguno |
| Tiempo por proceso / total de lote | 15 s / 90 s, incluyendo preparación y terminación |
| Gracia / confirmación local | 1 s / 1 s dentro del plazo de cada proceso |
| stdout / stderr por proceso | 128 KiB / 32 KiB, vigilados antes de acumular |
| Artefacto / enlaces | Uno, hasta 512 MiB incremental; hasta ocho saltos |
| Reintentos, descargas o cambios de instalación | Cero |
| Evidencia propia | Dos notas Markdown nuevas, `0700`/`0600`, sin sobrescribir |

No solicitar conversación reduce el alcance, pero no garantiza que una CLI
nativa no lea estado, cree caches o haga inicialización interna. Estos efectos
posibles deben ser reconocidos al autorizar el diagnóstico; no presentarlo como
un proceso puro ni prometer cero tráfico observado sin medirlo.

Entorno de confianza mínimo: preservar identidad/HOME original, sin copiar
autenticación o cambiar raíces; no heredar claves API, proveedores alternativos,
inyección de runtime, proxies, comandos de tracing o variables arbitrarias.
Evaluar opciones de bloqueo de updates y tráfico no esencial exclusivamente
para el proceso hijo, sin cambiar configuración del usuario. Una variable
documentada no equivale a aislamiento del sistema operativo.

El recolector local debe controlar bytes, plazo y cierre de su grupo también
cuando no hay salida. Un resultado incierto detiene el lote; nunca termina
sesiones ajenas. Solo limpiar su workspace vacío con identidad comprobada.
No guardar razonamiento interno ni el entorno completo.

Destino lógico propuesto: `PRIVATE_EVALUATIONS_ROOT/s3-1-claude-01`, fuera de
Toolkit, proyectos y Obsidian, sin ancestros Git o rutas sincronizadas conocidas.
Notas: `01-diagnostico.md` y `03-revision.md`. No crear JSON de admisión si falta
binding; no copiar instalación, versión/huellas privadas o rutas personales al
repositorio de herramientas. Si el lote existe, detener; no cambiar sufijo solo.

## Separación de contratos y pruebas

Se implementaron [recolector](../src/client-native-diagnostics.js),
[contrato diagnóstico cerrado](../schemas/agent-client-native-diagnostics.schema.json)
y [pruebas](../test/client-native-diagnostics.test.js), con
[dobles sintéticos](../testing/native-diagnostics/fixture.cjs).
No se registran recetas nativas en S2.

El constructor recibe el candidato y las dependencias desde código de confianza;
un JSON, modelo o nota no puede escoger ejecutable, shell, argv o destino.
Antes del lote real, comprobar con dobles: recetas exactas, exclusión de prompt,
handles/entradas inválidas, bytes partidos, Unicode, errores, silencio, timeout,
cambios de artefacto, directorios adversos y privacidad de salidas.

El informe distingue `nativeExecuted` de inferencia solicitada. Si el cliente
arrancó para ayuda/versión, no registrar `nativeExecuted: false`. No afirmar
llamadas internas cero por ausencia de prompt: conservar cantidad desconocida
y alcance diagnóstico explícito. `runtimeReady` y `verifiedAdmission` siempre
falsos; sin permiso de inferencia, reserva S2, ticket C1 o activación del catálogo.

El éxito de estas pruebas permite ejecutar el diagnóstico solo con su permiso
humano ya aprobado; no autoriza por sí mismo el candidato nativo.

## S3.2 — Condiciones anteriores a una conversación

Esta matriz es un plan posterior, no una receta de lanzamiento ni evidencia
de la instalación. Los mecanismos deben contrastarse con la versión observada.

| Aspecto | Condición para proponer el piloto |
| --- | --- |
| Variante | Mismo cliente, versión, artefacto, entorno y política revisados; cualquier cambio invalida el lote |
| Herramientas/delegación | Exclusión preventiva y evidencia pertinente; no basta ordenar «no uses herramientas» |
| MCP | Impedir servidores/conectores y no solo sus llamadas; políticas incompatibles bloquean |
| Hooks/personalizaciones | Fuentes efectivas acotadas, sin hooks o comandos heredados peligrosos; no modificar políticas |
| Acceso | Sesión nativa de suscripción identificada; claves API/helpers/proveedores alternativos excluidos |
| Economía | Declaración humana actual de créditos/gasto adicional desactivados para esa sesión/cuenta |
| Modelo/esfuerzo | Modelo concreto disponible y evaluado; versión vigente de la familia apropiada, no alias móvil |
| Contexto/efectos | Encargo sintético y permisos enumerados; sin proyectos, memoria MCP, Git o escritura de código |
| Historial/supervisión | Registro nativo propio, presupuesto conservado y mecanismo local probado, sin reutilizar el cero fixture |

La revisión de configuración usará solo una proyección aprobada no secreta de
las claves pertinentes. No abrir almacenes de credenciales, recibos, transcripciones
ni archivos mezclados con secretos para completar el informe. Si no hay una
fuente segura y suficiente para un control crítico, dejarlo pendiente y parar.
No elevar una declaración del usuario a prueba de instalación.

Un futuro `auth status` requiere autorización S3.2, filtrado inmediato de campos
no personales y soporte comprobado; no login, logout, tokens o cambios de plan.
El acceso autenticado no verifica gasto desactivado. No reutilizar automáticamente
la declaración histórica del usuario ni pedirle valores de claves o capturas con
datos personales. No iniciar inferencia si esta condición sigue pendiente.

## Hallazgos oficiales para contrastar, no garantías locales

La CLI documenta herramientas vacías, configuración MCP estricta, safe mode,
formato de salida, límite de turnos y persistencia de sesión. Son mecanismos
distintos: safe mode conserva parte de las políticas administradas, y el límite
de turnos no demuestra techo de llamadas. Help no enumera todas las opciones.
No hay argv aprobado todavía.
[Referencia CLI](https://code.claude.com/docs/en/cli-reference).

Bare no usa OAuth/keychain de la suscripción. Por ello no se propone como ruta
de inferencia; los ejemplos que necesitan API keys no se trasladan al piloto.
Una sesión print normal puede cargar hooks/MCP antes de una conversación.
[Ejecución programática](https://code.claude.com/docs/en/headless).

Los overrides de sesión no prevalecen sobre políticas administradas. Keys
omitidas pueden conservar valores de fuentes previas. No asumir aislamiento
por pasar un JSON vacío ni alterar políticas para satisfacer el piloto.
[Precedencia de configuración](https://code.claude.com/docs/en/settings).

MCP estricto tiene interacción específica con configuración administrada; un
mapa vacío no neutraliza todas las fuentes administrativas. Se debe comprobar
la variante, no instalar configuración administrada global para esta prueba.
[MCP administrado](https://code.claude.com/docs/en/managed-mcp).

`DISABLE_AUTOUPDATER`, `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC` y
`ENABLE_CLAUDEAI_MCP_SERVERS` documentan controles separados de updates,
tráfico no esencial y descubrimiento de conectores. No bloquean por sí solos
toda la red, credenciales o configuración efectiva.
[Variables de entorno](https://code.claude.com/docs/en/env-vars).

Los créditos pueden desactivarse desde Settings > Usage. El control pertenece
al proveedor, no al timeout del Toolkit; no habilitar créditos como alternativa.
Una atestación vigente conserva esa procedencia, no se vuelve verificación
automática por registrarse en JSON.
[Créditos del plan](https://support.claude.com/en/articles/12429409-manage-usage-credits-for-paid-claude-plans).

Consulta: 2026-10-05 (America/Bogota). No prueba flags instalados o estado de cuenta.

## S3.3 — Piloto posterior y autoría

Solo tras S3.2 revisada y permiso propio: una tarea ficticia breve, modelo y
esfuerzo fijados, máximo un arranque y sin reintentos. Presupuesto no superior
a S1; sin API keys, gasto externo, fallback automático o contexto de proyectos.
Consumo interno y cancelación remota siguen desconocidos si no hay evidencia.

Registrar y supervisar en un perfil nativo separado; no cambiar `fixture-only`
para conseguir permiso. Validar incrementalmente el protocolo real y conservar
solo respuesta final permitida, nunca razonamiento/transcripción completa.
Un evento prohibido cancela; no deshace posibles efectos previos. La salida es
dato no confiable y no puede autorizar su aplicación, credenciales o un segundo
intento. En modo tutor, el usuario escribe el código y Codex revisa el resultado.

S3.3 necesita especificación de adaptador/registro/parser nativos y pruebas antes
de ejecutarse. S2 no ofrece esas capacidades hoy. No anunciar autonomía completa,
soporte Gemini/Codex o integración de proyectos por cerrar un diagnóstico Claude.

## Criterios de cierre S3.1 y paradas

1. Candidato vinculado a la observación privada, sin actualización oculta.
2. Dos recetas máximas sin prompt, shell, subcomandos de cuenta, claves provistas
   o comandos extras; efectos internos posibles descritos, no negados sin prueba.
3. Plazos, bytes y terminación vigilados; errores y contexto insuficiente detienen.
4. Versión declarada, soporte documentado y soporte observado separados.
5. Datos privados solo en dos notas nuevas autorizadas; errores públicos redactados.
6. Pruebas sintéticas y regresión relevantes registradas antes del lote nativo.
7. Ningún resultado genera permiso de inferencia o certificación de facturación.
8. Contratos S1/S2/C1/C2, proyectos, Obsidian, conexiones y configuración intactos.

Si un control de S3.2 queda incompatible, conservar el traspaso manual y presentar
un único bloqueo concreto. No resolverlo con créditos, bypass o nuevas vueltas
de inspección de firma que no aporten viabilidad.

## Alcance de la autorización S3.1

La aprobación de S3.1 permite implementar/probar el recolector y ejecutar
exclusivamente las dos operaciones diagnósticas, con el destino privado absoluto
enumerado. No permite consultas de cuentas, prompt, modelos, cambios de
configuración, commit, push, actualizaciones, S3.2 o S3.3. Los apartados siguientes
separan la revisión original y la evidencia posterior; no confundir ambas.

## Revisión documental histórica del plan

Resultado de quality-gate: **Aprobado con observaciones para el plan**, no para
una ejecución nativa. Se revisaron alcance, presupuesto, privacidad, separación
de permisos y fuentes oficiales. Dos documentos: 13 enlaces locales existentes,
8 tablas consistentes, formato y `git diff --check` correctos. Escaneo limitado
de patrones sensibles sin hallazgos e índice sin staging.

Comparación SHA-256: 172 de 173 archivos previos intactos, solo el índice propio
de S1 actualizado, un documento nuevo y cero borrados. Sin cambios funcionales
ni regresión de código ejecutada en esta entrega documental. No se abrieron
clientes, cuentas o credenciales ni se creó el lote privado; tampoco se hicieron
commit, push, cambios en proyectos, Obsidian, conexiones o automatizaciones.

Se comprobó solo la existencia y tipo de los ancestros del destino propuesto:
el lote todavía no existe, sin symlinks o ancestros Git detectados. No acredita
por sí solo ausencia de sincronización, privacidad futura o permisos al escribir;
esos controles se repetirán al crear el lote autorizado.

Observaciones: S3.1 inicia un programa nativo aun sin solicitar inferencia;
documentación y ayuda no certifican aislamiento. S3.2 requiere evidencia de
controles/acceso y una confirmación económica actual. S3.3 mantiene autorización
independiente y necesita adaptador/registro/parser nativos propios. Ningún gate
se abrió con esta revisión documental.

## API entregada y evidencia histórica de cierre S3.1

Se entregaron el esquema independiente `agent-client-native-diagnostics.schema.json`,
el recolector `client-native-diagnostics.js`, su suite y una fixture Node privada
de prueba. El contrato contiene ocho definiciones cerradas y límites explícitos;
no se añadieron comandos CLI, recetas nativas a S2 o candidatos al catálogo.

`createDiagnosticPermit(configuration)` pertenece a la orquestación de confianza
que dispone de la aprobación humana, no a una petición JSON o salida del modelo.
`createNativeDiagnostics(schema, configuration, permit, dependencies)` devuelve
`run()`, sin argumentos, limitado a un lote. El permiso liga candidato, límites
y padre privado; es opaco, no serializable, revocable y se consume una sola vez.
Otro consumidor rechazado no puede revocar la sesión de quien lo consumió.

El artefacto aprobado se revalida antes de iniciar y después de cada operación,
con hash incremental, descriptor sin seguir enlaces y contraste de metadatos.
Solo dos argv fijos, entrada cerrada y entorno hijo construido explícitamente.
No imprimir/copiar entorno completo ni convertir documentación en evidencia
de que esas variables dominaron toda configuración nativa.

Salida separada: `report` acotado y `observation` privada de versión/opciones.
Ni streams crudos, rutas, cuentas o mensajes arbitrarios de excepción. Ayuda
solo aporta opciones de una lista cerrada; no se siguen enlaces o instrucciones.
Una ausencia mantiene soporte pendiente. `nativeExecuted` señala arranque del
cliente, no una llamada a IA; `actualModelCalls` queda `null` y los flags de
admisión, facturación y cancelación remota permanecen falsos.

Comprobación: 2026-10-05 (America/Bogota), macOS arm64, Node `v24.14.1`.

- Primera batería: 41/42; fallo de revocación de un permiso compartido por dos
  instancias. Se corrigió la propiedad de cierre y la batería pasó 42/42.
- Batería final ampliada: **48/48**, 4 150 ms; cero fallos, canceladas, omitidas
  o pendientes. Dobles ficticios, nunca clientes nativos, en las suites.
- Regresión completa antes del lote real: **2 015/2 015**, 141 778 ms, ejecución
  secuencial; cero fallos, canceladas, omitidas o pendientes.
- Lote real: dos consultas diagnósticas completadas, entrada cerrada y ningún
  prompt/conversación solicitado. Se conservó continuidad del candidato y se
  obtuvo versión declarada y una lista acotada de opciones de ayuda.
- Hubo observaciones transitorias de grupo no confirmado durante el sondeo;
  posteriormente se confirmó terminación local de ambos procesos. Se conservaron
  esos códigos en la evidencia privada; no se acreditó contención de descendientes
  desvinculados, cancelación remota o número real de llamadas internas.
- Solo dos notas nuevas en el destino privado autorizado, `0700`/`0600`, sin
  sobrescrituras, workspace residual, expediente de admisión o salida cruda.
  Los datos de instalación, versión concreta y huellas permanecen allí.

| Criterio S3.1 | Evidencia ejecutada |
| --- | --- |
| 1 | Artefacto/enlace revalidados incrementalmente antes/después; cambios/races bloqueados en dobles |
| 2 | Dos argv cerrados, stdin ignorado, entorno mínimo y rechazo de parámetros o permisos falsos |
| 3 | Silencio, TERM ignorado, abort, bytes/UTF-8, límites exactos, error de spawn y grupo incierto |
| 4 | Extracción de versión declarada y opciones literales; ausencia no convertida en fallo de soporte |
| 5 | Sin streams/rutas en informes; notas privadas con permisos y enlaces comprobados |
| 6 | Batería final y regresión completas antes de los dos arranques diagnósticos |
| 7 | Inferencia solicitada falsa, llamadas desconocidas y flags de admisión/economía falsos |
| 8 | Código previo conservado; sin proyecto, Obsidian, catálogo, conexiones o Git modificados por el recolector |

Resultado de quality-gate: **Aprobado con observaciones para S3.1 diagnóstico**.
No se consultaron cuentas, keychain, configuración o tráfico para certificar
ausencia de inicialización interna: el permiso reconoció efectos posibles del
programa nativo. Los plazos locales tampoco certifican cancelación remota.
Sin staging, commit ni push; no hay permiso de inferencia ni S3.2/S3.3 ejecutadas.

Revisión final: seis archivos propios sin patrones sensibles detectados, formato
y comprobación de espacios correctos; cuatro documentos, 20 enlaces locales
y 11 tablas revisados. Preservación SHA-256: 172 de 174 archivos previos intactos,
solo los dos documentos propios actualizados, cuatro archivos nuevos y ninguno
borrado. Dos notas privadas `0600`, sin temporales de prueba residuales.

Siguiente paso: S3.2, contrastar controles efectivos y acceso por una vía no
secreta, con declaración económica actual. No repetir firmas para llenar ese
vacío ni habilitar créditos. La memoria de proyectos sigue fuera de este piloto.
El borrador local S3.2, `docs/agent-client-supervised-preflight.md`, describe
proyección y consulta limitada; según su cierre histórico, el lote local detuvo
el arranque por evidencia insuficiente. Ese documento todavía no se incorpora
a esta entrega versionada. El siguiente paso sigue siendo resolver una fuente
segura, no iniciar S3.3.
## Consolidación versionada local de S3.1 — 2026-10-07

Esta sección registra únicamente la validación y entrega local autorizadas.
No repite ni renueva el diagnóstico nativo histórico anterior. La autorización
de este cierre comprende cinco rutas concretas, comprobaciones locales con
programas ficticios, dos precisiones documentales, evidencia privada y commit
local; no incluye push, cuentas, configuración o clientes reales de IA.

### Evidencia independiente de cierre

Comprobación: macOS arm64, Node `v24.14.1`.

| Comprobación | Resultado observado |
| --- | --- |
| Suite específica en el árbol de trabajo antes de autorizar el cierre | 48/48; salida 0; 4 109,856875 ms |
| Regresión aislada: base versionada más cinco archivos S3.1 | 2 362/2 362; salida 0; 147 779,035833 ms |
| Casos de la base / casos añadidos S3.1 | 2 314 / 48 |
| Fallos, canceladas, omitidas y pendientes en la regresión aislada | 0 / 0 / 0 / 0 |
| Ejecución | Secuencial: `node --test --test-concurrency=1 --test-reporter=spec` |
| Sintaxis | Tres comprobaciones `node --check`, cada una con salida 0 |
| Contrato | Ocho definiciones compiladas con Ajv2020 en modo estricto |

No se cambiaron timeouts, casos u omisiones para obtener este resultado.
La copia aislada contiene solo la base versionada y las cinco rutas enumeradas;
no incluye los otros borradores de diagnóstico, autenticación o controles.
El ajuste documental posterior no modifica los cuatro archivos de esquema,
implementación, pruebas o fixture cuyos bytes se probaron.

| Criterio S3.1 | Evidencia y alcance de esta consolidación |
| --- | --- |
| 1: candidato vinculado | Inspección del pin y comprobaciones sintéticas de huella, modo, propietario, identidad, enlace y cambios durante la lectura; no revalida una instalación real hoy |
| 2: recetas acotadas | Pruebas de dos argv fijos, stdin cerrado, configuración inmutable y permisos opacos; no se ejecuta versión/ayuda de un cliente real en este cierre |
| 3: límites y paradas | Dobles de silencio, TERM ignorado, abort, límites de bytes, UTF-8, error de arranque, cierre incierto y limpieza fallida |
| 4: declaración frente a soporte | Extractor de versión declarada y opciones cerradas, sin elevar ayuda o firmas a control efectivo |
| 5: privacidad | Pruebas de descarte de streams, rutas y errores arbitrarios; evidencia del cierre en carpeta privada propia, sin copiar instalación o datos de cuentas |
| 6: pruebas y regresión | 48 casos específicos y 2 362 casos aislados aprobados con los bytes revisados |
| 7: no admisión | `inferenceRequested`, `runtimeReady`, `verifiedAdmission`, `externalBillingVerified` y `remoteCancellationVerified` permanecen false; llamadas reales desconocidas |
| 8: preservación | Cinco rutas exactas; sin cambios a proyectos, Obsidian, catálogo, conexiones o configuración; trabajo ajeno conservado |

### Límites conservados

Resultado de quality-gate: **Aprobado con observaciones para consolidación local
de S3.1**, no para iniciar inferencia. Las pruebas sustituyen el ejecutable
candidato por programas Node sintéticos. Haber iniciado una fixture no demuestra
arranque de Claude ni uso de una cuenta; las pruebas del indicador
`nativeExecuted` validan su semántica mediante ese doble. `actualModelCalls`
permanece null y no se afirma cancelación remota verificada.

La autorización humana vive fuera de los datos no confiables. Los permisos
opacos y las dependencias inyectadas pertenecen a código de confianza, no son
un aislamiento frente a código malicioso dentro del mismo proceso. Las
comprobaciones de rutas y metadatos siguen limitadas a un entorno cooperativo;
no son contención atómica de cambios de otro proceso del mismo usuario.
Los plazos y señales locales no cancelan mágicamente operaciones de disco
bloqueadas ni certifican contención de descendientes desvinculados.

El resultado secuencial local no certifica otras plataformas ni todas las
condiciones de carga. Las fuentes externas citadas arriba conservan su fecha
histórica: no se actualizaron ni verificaron nuevamente en este cierre.
S3.2/S3.3, gasto del proveedor y preparación nativa siguen fuera de esta entrega.
