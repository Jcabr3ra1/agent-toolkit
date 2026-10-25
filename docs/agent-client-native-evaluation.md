# C3.1 — Expediente de evaluación de clientes nativos

## Estado, objetivo y alcance

Propuesta del 2026-10-04, preparada tras «sigue». C3.1a fue aprobada con
«apruebo» tras delimitar implementación y pruebas offline, sin cuentas, clientes,
commit o push. La base offline está implementada. No hay cliente real admitido.
Profundidad SDD: rigurosa, por autenticación, privacidad, efectos y consumo.

La consolidación C3.1a fue autorizada el 2026-10-06: validación aislada de cuatro
rutas, dos precisiones documentales, cierre y commit local sin push. No incluye
consultar cuentas, inspeccionar instalaciones o ejecutar clientes de IA.
El cierre posterior al final se limita al evaluador offline y no completa C3.1b/C3.2.

La [base C2.2](agent-client-runtime-local.md) supervisa procesos ficticios.
Este expediente prepara el contraste de una instalación real antes de la
[prueba C3.2](agent-client-runtime.md). No transforma resultados de fixtures,
flags publicados o una declaración de suscripción en permisos de ejecución.

Objetivo: reunir evidencia mínima de identidad, controles, efectos y límites;
mostrar qué falta y por qué una variante permanece bloqueada. Completar el
expediente es útil aunque la instalación no pueda cumplir el contrato automático.

Fuera de alcance: lanzar clientes, consultar cuentas, leer credenciales,
instalar o actualizar, cambiar configuración global, usar API keys o créditos,
modificar modelos activos, escribir código de proyectos, Obsidian, Git remoto
y automatizaciones. No se crea ni elige un destino privado en esta entrega.

## Entregas y autorización

| Paso | Entrega | Efectos y autorización |
| --- | --- | --- |
| C3.1a | Contrato y evaluador offline del expediente | Aprobación de implementación y pruebas sintéticas; cero clientes, IO o red en la función |
| C3.1b | Contraste de una instalación exacta | Permiso separado con cliente, lecturas, posibles escrituras/red, límites y destino privado explícitos |
| C3.2 | Prueba textual nativa | Solo tras gates satisfechos y presupuesto nuevo; no autorizada aquí |

C3.1a está implementada solo offline. Su aprobación no permite C3.1b.
«Sigue» continúa el diseño; no concede llamadas ni efectos nativos.
El permiso previo de otro piloto no se reutiliza ni reinicia sus contadores.

## RE-01. Contrato estricto y sin efectos

La base usa `agent-client-native-evaluation.schema.json` versión `1.0.0` y una
función pura `evaluateClientNativeEvidence(input)`, sin integración al CLI.
Solo JSON inerte acotado; rechazar campos extra, claves repetidas en entrada
serializada, getters, tipos coercibles, ciclos y profundidad/tamaño excesivos.
Reutilizar validación acotada existente cuando su contrato sea compatible.

Entrada propuesta, con nombres cerrados y sin rutas/comandos arbitrarios:

- `schemaVersion`, `evaluationId`, `now`: versión, identificador e instante
  explícito. La función no consulta reloj, disco, entorno o autenticación.
- `expectedBinding` y `binding`: cliente, variante, versión exacta, plataforma,
  arquitectura, identidad de instalación, huella del conjunto de artefactos y
  revisión de controles. Comparar la vinculación completa, sin deducir versiones.
- `installation`: resumen del intérprete, wrapper y paquete aplicables, por IDs
  y huellas; fuente/alcance/fecha/vencimiento de la evidencia, no contenido privado.
- `controls`: exactamente una evaluación de cada control RE-02, por identificador.
- `effects`: exactamente una evaluación por efecto RE-03 y su disposición.
- `access`: acceso por sesión de suscripción, gasto externo deshabilitado y
  evidencia separada; no IDs de cuenta, emails, tokens o recibos.
- `accounting`: techo de llamadas por arranque, control preventivo y limitaciones;
  un techo desconocido es `null`, nunca cero ni uno por defecto.
- `observations`: códigos cerrados de limitación; sin logs o texto crudo del cliente.

Cada evaluación usa `documented`, `locally-tested`, `pending` o `rejected`,
fuente permitida y un `evidenceRef` opaco; incluye fecha, vencimiento y alcance.
Una referencia o huella solo vincula datos: no autentica al operador ni prueba
el contenido. La evidencia original y su aprobación viven fuera del encargo.
Documentación, declaración del operador y prueba de instalación no son equivalentes.

La política de frescura y revocación vendrá del coordinador de confianza,
no del expediente que intenta aprobarse. Debe comprobar evidencia futura,
caducada, revocada, incompatible y contradicciones, sin renovar fechas.
No recopilar ni calcular huellas de archivos de credenciales para este contrato.

Informe propuesto: `invalid`, `incomplete`, `blocked` o
`ready-for-installation-review`, con códigos ordenados de razones/faltantes,
IDs mínimos y huellas de entrada. Primero invalidar estructura; después
bloquear rechazos/contradicciones; después señalar faltantes o controles pendientes.
`ready-for-installation-review` significa coherencia de declaraciones suficientes,
no admisión real, autorización humana ni permiso de spawn.

Todos los informes conservan `executed: false`, `runtimeReady: false`,
`verifiedAdmission: false`. No generan tickets, archivos, modelos activos,
reserva de consumo ni evidencia C1 certificada. Un expediente favorable tampoco
actualiza los registros del selector o adaptador A automáticamente.

## RE-02. Matriz de controles preventivos

Usar los once identificadores de [C1](../src/client-runtime-core.js), sin
rebajar requisitos para hacer pasar una variante. Para cada uno: mecanismo,
alcance, evidencia positiva y negativa, y limitación; detalles sensibles privados.

| Control | Qué debe quedar contrastado antes del arranque |
| --- | --- |
| `no-tools` | Herramientas incorporadas y de terceros excluidas preventivamente |
| `no-subagents` | Delegación, auxiliares y tareas de fondo no admitidos |
| `no-mcp` | No descubrimiento ni inicio/conexión de servidores |
| `no-hooks` | Sin comandos de inicialización, sesión, cierre o eventos |
| `no-personalizations` | Sin instrucciones, plugins, skills o memoria heredados fuera del contexto autorizado |
| `no-updates` | Sin descargas, actualizaciones ni sustitución de artefactos |
| `stdin-text` | Entrada textual acotada por pipe; sin prompt en argumentos |
| `no-fallback` | Sin cambio automático de proveedor/modelo/esfuerzo |
| `no-resume` | Sesión nueva, sin restaurar contexto o consumo de otra conversación |
| `no-permission-bypass` | Sin permisos indiscriminados ni desactivar protecciones para avanzar |
| `internal-call-limit` | Techo impuesto y evaluado, incluyendo reintentos y solicitudes auxiliares |

Una instrucción del prompt no sustituye el mecanismo. Observar cero herramientas
en una respuesta no prueba exclusión preventiva. Controles de otra versión o
cliente no se heredan. Un máximo de turnos/tokens/procesos no equivale a llamadas.

## RE-03. Efectos, suscripción y consumo

Registrar los cinco efectos C1: `native-auth`, `provider-inference`, `client-state`,
`telemetry` y `descendants`, distinguiendo mecanismo evaluado y autorización.
Cada disposición es `allowed`, `rejected` o `unknown`. Un efecto presente
rechazado, crítico desconocido o no cubierto por la autorización bloquea.
Ausencia comprobada de un efecto opcional significa conjunto permitido vacío,
no que se autorice activarlo posteriormente. Declarar ausentes autenticación
nativa o inferencia contradice esta ruta de IA por suscripción y bloquea.

Los detalles privados delimitan lectura de sesión nativa sin copiar credenciales,
destinos de red, escrituras inevitables, conservación de datos y descendientes.
No prometer que un directorio vacío o la no persistencia de conversaciones evita
caches, estado, telemetría o actualizaciones. No registrar razonamiento interno.

Verificar el acceso por suscripción y la política de gasto por vías autorizadas,
sin leer tokens ni habilitar APIs. Un login no acredita cuota disponible o gastos
deshabilitados. Si controles y suscripción son incompatibles, mantener bloqueo.
No recomendar activar créditos para terminar la prueba.

El techo de llamadas incluye solicitudes fallidas, reintentos y auxiliares.
Si no es observable e imponible, el expediente lo mantiene desconocido y bloquea
la ejecución automática estricta. El traspaso manual sigue disponible, sin
presentarlo como equivalente a esa garantía. Terminar un grupo de procesos
locales no demuestra cancelación del consumo remoto.

## RE-04. Plan del contraste local, todavía no ejecutado

Antes de C3.1b, enumerar operaciones y sus efectos concretos. Preferir lecturas
acotadas de artefactos no secretos a invocar el cliente. No suponer que `--help`,
`--version`, listas de modelos o estado de autenticación carecen de IO/red.
Cada invocación nativa requiere clasificación y permiso previo del lote.

El expediente privado se vincula a instalación, artefactos dependientes,
configuración efectiva no secreta y política administrada relevante. Cambios de
versión, huellas, política, entorno permitido o controles invalidan la revisión;
no basta la versión del wrapper. Una carrera de sustitución no resuelta bloquea.

El plan describe qué observación positiva/negativa probaría cada control, qué
queda sin probar sin inferencia y cómo supervisar/cancelar efectos autorizados.
No provocar herramientas, hooks o conexiones reales para demostrar su bloqueo
sin permiso específico. C3.1b no llama modelos: pruebas que requieran respuesta
quedan para C3.2, con presupuesto y controles previos ya suficientes.

No copiar autenticación, cambiar `HOME`/`CODEX_HOME` o equivalentes, ni editar
configuración del usuario para fabricar un entorno compatible. El destino
privado, filesystem local y política de conservación deberán aprobarse aparte;
no se almacenan capturas en Toolkit, proyectos, Git u Obsidian.

## Fuentes oficiales y candidatos documentales

Consulta: 2026-10-04. Solo evidencia `documented`; no se inspeccionaron clientes
locales. Los siguientes resúmenes no son recetas de ejecución aprobadas.

- Codex: ejecución no interactiva, stdin y JSONL; `--ephemeral` evita archivos de
  rollout. Read-only permite comandos, no excluye herramientas. Auto-review añade
  llamadas; no sirve como sustituto del techo evaluado.
  [Modo no interactivo](https://learn.chatgpt.com/docs/non-interactive-mode) y
  [aprobaciones y seguridad](https://learn.chatgpt.com/docs/agent-approvals-security).
- Claude: `--tools` vacío limita herramientas incorporadas, no MCP; hay controles
  separados. `--safe-mode` desactiva personalizaciones pero conserva herramientas.
  `--max-turns` cuenta turnos, no prueba el techo interno. Pendiente de contraste.
  [Referencia CLI](https://code.claude.com/docs/en/cli-reference).
- Claude: `--bare` no usa login de suscripción; excluido de esta ruta sin API.
  No se ejecuta ni se pide una key como alternativa.
  [Modo programático y bare](https://code.claude.com/docs/en/headless).

Recomendación, no selección aprobada: contrastar primero Claude Code por su rol
de tutor/proponente. Si no satisface los gates, conservarlo manual; no cambiar
contrato, proveedor o condiciones económicas silenciosamente.

## Tareas y criterios verificables para C3.1a

| ID | Entrega prevista | Verificación offline |
| --- | --- | --- |
| NE-01 | Esquema estricto en `schemas/agent-client-native-evaluation.schema.json` | Campos, IDs, fechas, estados y límites; fixtures ficticias |
| NE-02 | Evaluador en `src/client-native-evaluation.js` | Determinismo, no mutación, vinculación y motivos ordenados |
| NE-03 | Pruebas en `test/client-native-evaluation.test.js` | Casos positivos declarados y adversos; cero efectos |
| NE-04 | Evidencia de cierre documental | Regresión de A/B/C1/C2 y separación de permisos |

Criterios de aceptación:

1. Los once controles y cinco efectos son únicos y completos; faltantes no pasan.
2. Documentación o declaración sin prueba pertinente no se eleva a `locally-tested`.
3. Expiración, revocación, huellas/versiones/plataformas divergentes o
   contradicciones bloquean sin refrescar ni certificar identidades.
4. Acceso dudoso, gasto externo no deshabilitado, techo interno desconocido
   o no impuesto y efectos no autorizados impiden resultado favorable.
5. Incluso el mejor caso devuelve los tres indicadores de ejecución en `false`,
   sin permisos, reservas ni cambios en catálogos/C1/C2/CLI.
6. Pruebas instrumentan IO, procesos, red, reloj y azar; ninguna operación
   observada. Inputs adversos no filtran errores, payloads o entorno.
7. Fixtures usan clientes/instalaciones ficticios; no datos privados o cuentas.
8. Los contratos anteriores conservan su comportamiento y pasan regresión.

## API y límites de C3.1a implementada

Archivos: [esquema](../schemas/agent-client-native-evaluation.schema.json),
[evaluador](../src/client-native-evaluation.js) y
[pruebas](../test/client-native-evaluation.test.js).

`createClientNativeEvaluator(schema, trustedPolicy)` copia el esquema local de
confianza y la política del coordinador; devuelve `evaluateClientNativeEvidence`.
Construcción y evaluación, tras cargar módulos, no hacen IO/red ni consultan
reloj actual o azar. No aceptan rutas, callbacks, recetas o política del encargo.
La API requiere política explícita: edad máxima entera de 1 a 86 400 segundos y
hasta 256 referencias revocadas. Cambiar esa política requiere construir una
función nueva; no se alteran automáticamente fechas o listas capturadas.

Entrada: objeto JSON inerte, string JSON o Buffer/Uint8Array genuino; máximo
131 072 bytes serializados. El lector compartido limita además 30 000 nodos,
64 niveles y 256 elementos por array; rechaza proxies, getters, conversores,
claves peligrosas/duplicadas y Unicode/UTF-8 inválido en entrada serializada.
Fechas UTC exactas a segundos, sin coerción ni normalización de fechas inválidas.

Los campos de identidad/configuración/entorno son huellas declaradas. Todas las
evaluaciones se vinculan a la huella del binding completo. El conjunto de
artefactos se ordena por `artifactId` y se contrasta con `artifactSha256`; IDs
duplicados o wrapper sin intérprete y paquete no pasan. Esa lista no demuestra
que estén todos los artefactos reales: contrastarlos sigue siendo C3.1b.

Controles incluyen mecanismo y referencias de pruebas positivas/negativas;
efectos, presencia y autorización declarada. Acceso y gasto externo tienen
evaluaciones separadas. El techo interno es entero de 1 a 1 000 000 o `null`;
no se transforma un turno en una llamada. Observaciones críticas usan siete
códigos cerrados y bloquean, sin incluir mensajes nativos crudos.

Faltan secciones/matrices o pruebas pertinentes: `incomplete`. Rechazos,
contradicciones, revocación, fechas inválidas para vigencia, efectos desconocidos,
acceso/gasto no confirmados o techo no impuesto: `blocked`. Estructura inválida
precede esos estados. El mejor resultado solo permite revisión de declaraciones;
no se exporta automáticamente a C1/A, ni crea permisos, archivos o reservas.

## Revisión histórica de la entrega y siguiente paso

SDD separa contrato offline, contraste local y prueba nativa. La consulta anterior
de OpenAI Docs distingue controles documentados de garantías; no se reconsultaron
clientes o cuentas durante esta implementación. Quality-gate exige pruebas y
regresión, sin extender el cierre a admisión de clientes.

Evidencia ejecutada el 2026-10-04, en macOS y Node `v24.14.1`:

- Primera batería C3.1a: 236/236 pruebas; primera regresión: 1 487/1 487.
  La revisión posterior añadió el bloqueo de efectos obligatorios ausentes y
  reforzó casos adversos/instrumentación; esas cifras no son el cierre final.
- Batería final C3.1a: **239/239**, en 340 ms. Regresión final: **1 490/1 490**,
  en 78 395 ms; cero fallos, canceladas, omitidas o pendientes.
- Sintaxis de los dos módulos JavaScript y JSON del esquema válidos. Formato,
  25 enlaces locales y 13 tablas de los tres documentos revisados correctos.
  `git diff --check` sin errores; índice sin cambios preparados.
- Escaneo limitado de patrones sensibles sin coincidencias en los seis archivos
  de la entrega; no representa una auditoría exhaustiva de secretos.
- Preservación por SHA-256: 145 de los 148 archivos previos intactos; solo tres
  documentos propios actualizados y tres archivos nuevos. Ningún archivo borrado.

| Criterio | Evidencia |
| --- | --- |
| 1 | Once controles/cinco efectos; faltantes, duplicados y matrices vacías |
| 2 | Estados documentado/pendiente/rechazado y conflicto de fuente; sin promoción |
| 3 | Binding completo, dependencias, revocación, límites temporales y huellas |
| 4 | Efectos y permisos declarados, presencia, acceso/gasto separados, techo/limitaciones |
| 5 | Todos los estados sin ejecución/admisión; sin tickets, reservas o integración CLI |
| 6 | IO/red/procesos/reloj/azar instrumentados; JSON adverso, proxies/getters/bytes acotados |
| 7 | Fixtures e identidades sintéticas, sin versiones/cuentas de instalaciones reales |
| 8 | Regresión completa de los contratos previos; 1 490 pruebas aprobadas |

Resultado de quality-gate: **Aprobado con observaciones para C3.1a offline**.
Límite principal: valida coherencia de declaraciones de confianza, no inspecciona
la autenticidad de pruebas ni certifica clientes. No añade aislamiento preventivo
real, disponibilidad de cuota, cancelación remota o cobertura de facturación.
No se iniciaron clientes IA ni se consultaron cuentas, credenciales o modelos.
No se modificaron proyectos, Obsidian, configuración o automatizaciones.
**Sin commit ni push**; el trabajo previo ajeno se conserva.

Continuación de C3.1: cada lote delimita cliente/instalación, operaciones,
efectos, límites y destino privado antes de ejecutarlo.
El primer lote para Claude (etapa separada) fue
autorizado y ejecutado: identificación parcial, sin cliente ni inferencia;
evidencia personal solo en el lote privado. No completa el binding ni admite
ejecución. Sigue el plan de procedencia y viabilidad (etapa separada),
pendiente de autorizar su ejecución. No incluye inferencia, APIs, gasto adicional,
commit o push. C3.2 requiere
presupuesto y autorización propios; si un gate no puede probarse, conservar bloqueo.

## Cierre de C3.1a offline para entrega local — 2026-10-06

Resultado de quality-gate: **Aprobado con observaciones para el evaluador offline**.
La observación central permanece: coherencia de declaraciones no es autenticidad
de pruebas, admisión nativa o autorización de arranque.

Alcance de cuatro rutas: este documento, esquema, evaluador puro y suite sintética.
Los helpers C1/JSON ya estaban versionados y permanecen intactos. No se incluyen
expedientes personales, planes de inspección/procedencia, diagnósticos de cuentas,
rutas supervisadas, nuevas políticas privadas, CLI o módulos de lanzamiento.
Los apartados históricos conservan sus estados de ese momento; las referencias
a otros lotes no los convierten en parte de esta entrega ni los reejecutan.

### Evidencia independiente

Se extrajo la base versionada y se superpusieron solo las cuatro rutas en una
copia temporal propia. Las dos referencias a documentos todavía no incluidos
se comprobaron como texto, sin arrastrar sus dependencias. Se reutilizaron
dependencias instaladas, sin nuevas instalaciones o cambios de node_modules.

| Comprobación | Resultado observado |
| --- | --- |
| Regresión completa aislada | 1.837/1.837; exit 0; 66.784,487 ms |
| Fallos, canceladas, omitidas y pendientes | 0 |
| Cobertura incorporada | 1.598 anteriores + 239 del evaluador |
| Sintaxis individual | 2 node --check, ambas exit 0 |
| Revisión previa en árbol local | 239/239; exit 0; 334,639 ms |
| Contrato | Ajv2020 strict compiló input/policy/report |

```sh
node --test --test-concurrency=2 --test-reporter=spec
node --test --test-reporter=spec test/client-native-evaluation.test.js
```

El primer comando pertenece a la copia aislada; el segundo a la revisión previa
en el árbol local. No sumar ejecuciones repetidas como casos nuevos.
Los casos NE-01–NE-06 conservan la trazabilidad de la matriz histórica: controles
y efectos completos, vínculo y dependencias de artefactos, fuente/vigencia/revocación,
contradicciones, datos inertes y estados sin autorización o efectos.
No se emitieron tickets, reservas o registros nuevos de modelos.

Después de probar solo se registra este cierre en el documento, preservando
código, esquema y tests. Se comprueban formato/enlaces, patrones sensibles
limitados, bytes finales del índice y preservación antes del commit.
Las huellas e identificador del commit se registran aparte; no se copian datos
de instalaciones o lotes privados al repositorio.

### Qué sigue sin verificarse

- La función no consulta reloj, archivos, red, entorno, cuentas o autenticación.
  Recibe un instante explícito y datos de evidencia: no prueba sus hechos originales.
- ready-for-installation-review solo permite revisión de la coherencia declarada,
  no lanzamiento, compatibilidad real, permiso humano o acceso por suscripción.
- executed, runtimeReady y verifiedAdmission permanecen false. Pasar las fixtures
  no convierte un control documented/pending en locally-tested de una instalación.
- No se comprobaron versiones instaladas, inicialización, refresh, helpers,
  cuotas, gasto, límites internos de llamadas o cancelación remota.
- Pruebas observadas en macOS/Node v24.14.1; no certificación multiplataforma.
  Fuentes externas conservan sus consultas históricas, sin una revalidación nativa.

La revisión documental del estado conservado en el Toolkit no encontró una
admisión nativa que habilite C3.2. La identidad/firma parcial de otros lotes no
completa controles y consumo, y el diagnóstico de cuentas mantiene su gate
independiente. No se consultaron expedientes personales para promover ese estado.

Siguiente puerta: revisar por separado los contratos/diagnósticos posteriores
con sus límites, sin iniciar clientes por este cierre. Una consulta de cuentas,
inspección real, llamada de IA o publicación necesita nueva autorización y
evidencia suficiente; no se infiere del commit local de C3.1a.
