# Admisión y ejecución controlada de clientes

## Estado y autorización

Diseño detallado de la etapa C de
[los adaptadores](agent-client-adapters.md), preparado el 2026-10-03 tras «sigue».
Diseño y C1 aprobados por el usuario con «epruebo y autorizo» tras la propuesta
de aprobar exclusivamente implementación y pruebas offline. C2.1 fue aprobada e
implementada el 2026-10-03; C2.2 fue autorizada e implementada el 2026-10-04 con
fixtures, según la especificación local. El
expediente C3.1a (etapa separada) está aprobado e implementado
solo offline. El primer lote C3.1b terminó con identificación parcial, sin
ejecutar Claude; el contraste de controles permanece incompleto. El siguiente
lote de procedencia (etapa separada) fue autorizado y
ejecutado: firma local satisfactoria, sin arranque del cliente; no certifica
controles ni gasto. C3.2 sigue pendiente. El diseño de una
ruta supervisada distinta (etapa separada) tiene una
base S1 implementada y probada solo offline; no modifica este contrato estricto
ni habilita ejecución.
Continuar el diseño no autoriza
procesos de IA, pruebas de cuentas, llamadas a modelos o un presupuesto nuevo.
Profundidad SDD: rigurosa, por permisos, concurrencia, contexto privado y consumo.

La consolidación C1 offline fue autorizada el 2026-10-06 para validar seis rutas,
ajustar referencias documentales, registrar el cierre y crear commit local.
El resultado posterior está al final. No autoriza push, persistencia, procesos,
clientes nativos, cuotas nuevas o aplicaciones sobre bóvedas reales.

La propuesta inicial fue solo documental. C1 conserva el planificador A y
[los parsers B](agent-client-output.md). No modifica sus contratos ni conecta
funciones nuevas a `project-memory`. El acceso por suscripción, sin API keys
ni gasto adicional, sigue siendo obligatorio; no se promete cobertura económica
solo porque un cliente esté autenticado.

## Objetivo y alcance

Permitir que un coordinador lance un encargo textual previamente autorizado,
con cliente/modelo/esfuerzo explícitos, controles preventivos evaluados,
presupuesto reservado y cancelación comprobable. El resultado queda para revisión.
En tutor, el usuario sigue escribiendo el código. Proponer texto en modo autónomo
no autoriza editar proyectos, hacer Git o actualizar Obsidian.

La primera base es offline: admite declaraciones y calcula transiciones, pero
no las convierte en hechos verificados. La ejecución nativa se mantiene cerrada
hasta evaluar una instalación exacta y aprobar sus efectos y pruebas reales.

Fuera de alcance: login, copiar tokens, modificar configuración global, instalar
o actualizar clientes, cambiar proveedor, activar créditos, reintentos automáticos,
aplicar código, PR, despliegues, sincronización de memoria y servicio permanente.

## Entregas y puertas independientes

| Entrega | Qué construye | Qué prueba |
| --- | --- | --- |
| C1: núcleo offline | Contratos de admisión, presupuesto y transiciones puras | Fixtures ficticias; sin IO ni clientes |
| C2: infraestructura local | Persistencia privada, reserva atómica y supervisor | Procesos ficticios sin IA ni credenciales |
| C3: integración nativa | Variantes evaluadas y lanzamiento textual | Solo cliente y presupuesto expresamente autorizados |

Cada entrega necesita aprobación de su alcance. Aprobar C1 no aprueba C2 ni C3.
Una prueba C2 solo certifica el mecanismo ensayado, no el aislamiento, facturación
o cancelación remota de Codex o Claude.

## RC-01. Admisión vinculada, fresca y revocable

La admisión se vincula a proyecto/tarea/revisión/rol/modo, huella del plan,
cliente/variante/versión exacta, identidad del artefacto ejecutable, sistema
operativo, modelos/esfuerzos admitidos y revisión de controles. Las declaraciones
del plan no sustituyen evidencia de confianza del coordinador.

Cada evidencia identifica fuente, alcance, fecha, vencimiento y limitaciones.
Se distingue `documented`, `locally-tested`, `pending` y `rejected`: documentación
por sí sola no permite `locally-tested`. Evidencia faltante, futura, vencida,
revocada, contradictoria o de otra instalación bloquea. Actualizar un cliente
invalida su admisión anterior; no se heredan controles por número de versión.

Inmediatamente antes de reservar y arrancar se revalidan selección, identidad,
autorización vigente, contexto permitido, instalación y presupuesto. No se
refrescan fechas ni se cambia modelo/esfuerzo para salvar un plan obsoleto.
Un permiso de ejecución viene de un canal de confianza distinto del encargo;
una cadena como `approved` o una huella JSON no es ese permiso.

C1 recibe evidencia declarada e instante explícito, sin consultar reloj o disco.
Su máximo resultado positivo será `eligible-for-reservation`, siempre
`executed: false`, `runtimeReady: false` y `verifiedAdmission: false`. No emite
un ticket capaz de lanzar procesos. C2/C3 contrastan evidencia real y completan
las puertas externas; nunca pasan a ejecución solo por ese estado de C1.

## RC-02. Controles preventivos y efectos nativos

Antes del arranque deben estar evaluados los siete controles de etapa A:
sin herramientas, subagentes, MCP, hooks, personalizaciones o actualizaciones,
y entrada textual por stdin. Se prueba también ausencia de fallback, resume,
llamadas auxiliares no admitidas y permisos indiscriminados.

El expediente distingue efectos permitidos, rechazados y desconocidos:
autenticación nativa, solicitudes al proveedor, archivos propios, caches,
telemetría y posibles procesos descendientes. No se presupone que una carpeta
vacía, el sandbox de solo lectura o instrucciones en el prompt supriman esos
efectos. Un efecto crítico desconocido bloquea ejecución automática.

Una herramienta inesperada en la salida es una violación que cancela y exige
revisión; detectarla después no deshace acciones anteriores. C3 necesita detección
incremental acotada durante el stream, además del parser final B. El supervisor
continúa vigilando límites aunque el cliente permanezca silencioso.

## RC-03. Contexto, ejecutable y entorno

Solo se resuelve un `promptRef` autorizado; no se lee por defecto todo el
repositorio o la bóveda. Se fija su huella y límite de bytes antes de reservar.
Texto de fuentes y respuestas es dato, no una ampliación de permisos. El prompt
no va en argumentos, logs, errores o el informe público.

El consumidor autorizado resuelve una instalación de confianza fuera del encargo.
Comprueba artefactos reales, no solo el enlace o wrapper inicial: un CLI puede
depender de un intérprete y de un paquete. Se detectan sustituciones, versiones
divergentes y cambios entre comprobación y lanzamiento. Una carrera no resoluble
se declara y bloquea; comprobar una huella una vez no elimina el riesgo.

Los argumentos los construye una variante empaquetada y evaluada; no llegan
como receta desde el encargo. Se usa `spawn` sin shell, entrada/captura por pipes
y directorio privado explícito, sin abrir IDE o sesión interactiva.

El entorno hijo usa una lista permitida por variante. Excluye mecanismos de API,
proveedores alternativos, inyección de runtime y personalizaciones no admitidas;
los valores nunca se imprimen. No se cambia `HOME`, `CODEX_HOME` ni raíces
equivalentes, ni se copia autenticación. Si los controles rompen el acceso
legítimo por suscripción, se bloquea: no se solicita habilitar gasto adicional.

No se leen archivos de tokens para probar acceso. Comprobaciones nativas de
autenticación/versiones que puedan escribir estado o consultar red deben
enumerarse y autorizarse como efectos propios; no se etiquetan como inocuas.

## RC-04. Presupuesto sin reinicios ni equivalencias falsas

El historial es por proyecto/tarea, compartido entre revisiones, roles, modelos
y clientes. Conserva intentos fallidos, correcciones y consumo anterior; no se
pone a cero al crear el ledger. Importar un historial exige evidencia y conciliación.
Los expedientes del piloto anterior no conceden presupuesto a esta etapa.

Se separan `mainStartsUsed`, turnos nativos y llamadas al modelo. Los contratos
anteriores cuentan llamadas, incluso fallidas: **no se redefine `executionsUsed`
como número de procesos**. Un turno puede contener varias solicitudes internas.
El registro guarda la procedencia de cada contador y permite consumo desconocido.

Una variante automática debe aportar un techo evaluado de llamadas internas por
arranque, incluyendo reintentos y auxiliares, que permita reservar el presupuesto
correspondiente. Si ese techo es desconocido o el cliente no puede imponer el
límite requerido, se bloquea: un máximo de turnos, tokens o procesos no lo sustituye.
Los tokens reportados tampoco se convierten en cuota de suscripción verificada.

Antes de arrancar se reserva atómicamente un cupo de proceso, el techo de llamadas
y el tiempo máximo restante autorizado. El primer alcance admite una sola reserva
activa por tarea. Otro escritor ve la reserva y no consume el último cupo.

| Estado del intento | Consecuencia para presupuesto |
| --- | --- |
| `reserved` | Cupo y tiempo retenidos antes de entregar permiso de arranque |
| `started` | Intento contabilizado, incluso si falla o se cancela |
| `settled` | Consumo conciliado con evidencia suficiente |
| `reconciliation-required` | Consumo incierto; bloquea nuevos arranques |

La reserva se escribe de forma durable antes del spawn; el intento y la
transición posterior quedan ligados a su identificador. Una caída entre ambos
no se interpreta como «no gastó». No se reembolsa automáticamente por ausencia
de resultado, fallo de persistencia, PID desaparecido o supuesta reserva antigua.
Solo una conciliación autorizada y respaldada por evidencia resuelve incertidumbre.

## RC-05. Persistencia privada y exclusión mutua

C1 no escribe. C2 requiere destino privado explícito fuera de Toolkit, código
y Obsidian; esta propuesta no crea ni elige una carpeta nueva. Se prevén archivos
`0600`, directorios `0700`, validación de propiedad/tipo/rutas resueltas y rechazo
de enlaces simbólicos en componentes relevantes. No se siguen rutas del encargo.

Un protocolo local de exclusión mutua debe hacer indivisibles comprobar cupo,
reservar y guardar revisión nueva. La primera versión solo admite filesystem
local evaluado; no promete garantías en NFS, carpetas sincronizadas o remotas.
La escritura usa archivos temporales propios, sincronización durable y sustitución
atómica controlada. Una revisión ajena no se sobrescribe.

No se roba un bloqueo por antigüedad o porque un PID parezca ausente. Bloqueos
abandonados, archivos corruptos, revisiones divergentes y errores de persistencia
producen intervención requerida. La limpieza solo retira recursos del intento
propio; no borra carpetas amplias ni evidencia anterior.

El ledger guarda un resumen mínimo, no prompts, stdout/stderr, credenciales, cuentas
o razonamiento. Guardar respuesta privada es opcional, con autorización y ruta
explícitas, sin sobrescribir entregas existentes ni añadirlas a Git.

## RC-06. Supervisión, cancelación y resultado

El plazo usa reloj monotónico y cubre inicialización, stdin y respuesta. Límites
de bytes totales, línea, eventos y stderr se vigilan durante la recepción, antes
de acumular memoria indefinida. Un timeout nativo es complementario.

Timeout, cancelación humana, límite excedido, evento prohibido o error de pipe
activan cancelación de la unidad supervisada. La secuencia de terminación y su
gracia consumen el plazo autorizado; no amplían automáticamente el presupuesto.
Cada plataforma necesita un mecanismo evaluado para descendientes: matar solo
el PID principal no demuestra que hayan terminado procesos desvinculados.

El resultado de proceso distingue `not-started`, `completed`, `failed`, `canceled`,
`timed-out` e `indeterminate`. Si no puede confirmarse terminación local, se retiene
la reserva y se bloquea continuar. Confirmar terminación local no prueba que el
proveedor dejó de inferir; incertidumbre de consumo requiere conciliación.

Un éxito exige proceso terminado, límites respetados y captura final admitida por
B. `accepted` de B no significa calidad, autoría o modelo/esfuerzo verificados.
Los metadatos conservan sus estados `reported`/`unknown`; certificar procedencia
y calidad es trabajo posterior del revisor. No se abre una sesión manual ni se
reintenta, escala esfuerzo o cambia de cliente automáticamente ante bloqueos.

## Contratos propuestos y tareas por dependencia

| Tarea | Resultado | Archivos previstos y verificación |
| --- | --- | --- |
| C1.1 | Contrato estricto de admisión y contabilidad | Esquema `agent-client-runtime`; validación con fixtures ficticias |
| C1.2 | Puerta pura sin tickets ejecutables | Módulo `client-runtime-admission`; tipos, fechas, identidad y controles |
| C1.3 | Transiciones y reservas calculadas sin IO | Módulo `client-runtime-state`; conflictos, cupos y conciliación |
| C2.1 | Ledger durable en destino privado aprobado | Módulo `client-runtime-store`; escritores concurrentes y fallos inducidos |
| C2.2 | Supervisor de proceso sin shell | Módulo `client-runtime-supervisor`; hijos ficticios, streams y cancelación |
| C3.1 | Expediente de instalación exacta | Evidencia privada por variante; cada efecto y límite contrastados |
| C3.2 | Prueba textual nativa acotada | Presupuesto nuevo, autorización por cliente y revisión del resultado |

Las tareas C1.1–C1.3 están implementadas en la base offline descrita al final.
C2.1/C2.2 cuentan con los módulos descritos en la especificación local;
los nombres C3 siguen siendo previstos, no una integración nativa implementada.
C1 recibe documentos locales de confianza y entradas JSON acotadas, no callbacks,
comandos, rutas ejecutables o recetas proporcionadas por un encargo. Las dependencias
con efectos se introducen exclusivamente en las entregas posteriores aprobadas.

## Criterios de aceptación y verificación

1. C1 es determinista y no muta entradas; sin IO, red, procesos, reloj o azar en
   APIs instrumentadas. Los contratos de A/B y selección siguen pasando.
2. Datos malformados, tipos coercibles, getters/proxies/ciclos, campos desconocidos,
   exceso de tamaño/profundidad y claves peligrosas se rechazan sin filtraciones.
3. Solo identidad, autorización, instalación y evidencia compatibles y vigentes
   permiten elegibilidad declarada; nunca permiso efectivo ni lanzamiento en C1.
4. Controles documentados/pendientes no se certifican como probados. Herramientas,
   fallback, efectos críticos o contabilidad de llamadas desconocidos bloquean.
5. Cambiar revisión/modelo/cliente no reinicia historia. Dos intentos sobre el
   mismo snapshot no pueden consumir el último cupo en C2; C1 expresa el conflicto.
6. Toda caída entre reserva, spawn y cierre conserva consumo/reserva inciertos.
   Corrupción, fallo de persistencia o reserva abandonada no habilitan otra llamada.
7. El supervisor C2 termina procesos ficticios y descendientes bajo timeout,
   cancelación, pipes rotos y exceso de salida, o informa incertidumbre y bloquea.
8. C3 no ejecuta sin presupuesto nuevo y autorización específica. Resultados
   reales no cambian catálogos o autorizan aplicación automática.
9. Informes no exponen credenciales, entorno, prompts, razonamiento o errores
   nativos crudos. Toda captura/respuesta persistida tiene permiso y destino.

## Fuentes primarias y límites de evidencia

Consulta: 2026-10-03. Interfaces documentadas, no instalaciones certificadas:

- Codex documenta ejecución no interactiva, stdin, JSONL y controles de
  configuración. Su modo read-only puede ejecutar comandos: no equivale a
  ausencia de herramientas. El uso efímero tampoco elimina todos los efectos.
  [Modo no interactivo](https://learn.chatgpt.com/docs/non-interactive-mode),
  [seguridad y permisos](https://learn.chatgpt.com/docs/agent-approvals-security).
- Claude distingue herramientas incorporadas y MCP. Sus modos de arranque tienen
  alcances diferentes y pueden conservar políticas administradas; no se deduce
  «sin efectos» de un solo flag.
  [Referencia de CLI](https://code.claude.com/docs/en/cli-reference).

Los límites de llamadas internas, aislamiento, cuotas y mecanismos de autenticación
efectivos siguen pendientes de evidencia por instalación. No se adoptan ejemplos
de CI que habiliten API keys ni se trasladan controles entre clientes.

## Propuesta inicial de aprobación (histórica)

Se propone aprobar **solo el diseño y la implementación/pruebas offline de C1**.
No incluye C2/C3, una carpeta privada nueva, comprobaciones nativas de cuentas,
configuración, commits, push ni pruebas reales. Los gates pendientes no se eliminan
para conseguir una demostración que aparente ejecución automática.

SDD separó el diseño de seguridad de su implementación; OpenAI Docs se usó para
contrastar el alcance documental de Codex. La puerta de calidad de esta entrega
es documental: no acredita funcionamiento de un runner todavía inexistente.

## Comprobación documental inicial (histórica)

Revisión local del 2026-10-03 con `quality-gate`:

- Once enlaces locales resueltos y siete tablas con columnas consistentes entre
  esta propuesta y la especificación de adaptadores.
- Sin whitespace al final de líneas, líneas vacías finales adicionales o falta
  de newline final en ambos documentos; `git diff --check` sin incidencias.
- De los 124 archivos del inventario previo, solo cambió la especificación de
  adaptadores para enlazar esta propuesta; los otros 123 conservan sus huellas.
  Solo se añadió este diseño detallado. El índice de Git continúa vacío.
- No se detectaron rutas personales ni patrones evidentes de credenciales en
  los documentos modificados; no equivale a una auditoría exhaustiva de secretos.

Resultado: **Aprobado con observaciones como propuesta documental**, pendiente
de aprobación del usuario. Los criterios funcionales C1/C2/C3 no están verificados:
no existe implementación de esta etapa y no se ejecutaron pruebas funcionales
o nativas en este turno. Pasar la revisión de texto no cierra esos criterios.

No se cambiaron código, clientes, cuentas, catálogos privados, automatizaciones,
Obsidian o expedientes de evaluación. No hay commit ni push de esta propuesta.

## Diseño de la base C1 aprobada

Dos fábricas reciben los esquemas empaquetados locales de selección,
preferencias, adaptadores y runtime: `createClientRuntimeAdmission(...)` y
`createClientRuntimeState(...)`. No reciben funciones, recetas ejecutables ni
rutas privadas. Comparten validación y contabilidad sin IO.

Admisión recibe instante UTC explícito, entrada completa de planificación A,
informe A esperado, instalación esperada, evidencia declarada y ledger. Recalcula
A y contrasta el informe entero. Evidencia vincula identidad, huella canónica del
plan, instalación/artefacto/plataforma/revisión de controles, contexto y permiso.
Los controles y efectos se registran individualmente, sin aceptar omisiones,
duplicados o pruebas documentales como pruebas de instalación. Gasto externo,
llamadas internas, fechas y snapshot del historial se revisan por separado.

El ledger incluye importación explícita de historial, referencia de importación,
límites, revisión entera, intentos y totales calculados. Historial importado y
consumo conciliado no desaparecen al cambiar cliente o revisión. Los totales
deben coincidir con la suma de sus fuentes; reservas activas/consumo incierto
no se convierten en valores conciliados. El ledger es declarado, no autenticado.

Transiciones: `reserve`, `mark-started`, `interrupt`, `settle`. Reservar reevalúa
admisión; las otras registran observaciones declaradas, no permiso para ejecutar.
Cada operación exige revisión y huella del ledger esperado. Produce un nuevo
snapshot y propuesta de comparación/sustitución; no garantiza atomicidad real.
Dos propuestas sobre el mismo snapshot requieren que C2 rechace la segunda al
persistir. C1 bloquea cuando recibe la revisión/huella ya divergentes.

`interrupt` mantiene presupuesto retenido y solicita conciliación. `settle` exige
autorización de conciliación vigente, evidencia y terminación confirmada; no
reembolsa automáticamente. Declarar que no arrancó exige cero llamadas y tiempo.
Consumo superior a lo reservado se registra, no se oculta ni se recorta, y deja
el ledger bloqueado. Un intento ya conciliado no se modifica otra vez.

El primer formato limita el ledger a 128 intentos y contadores/tiempo enteros
acotados; alcanzar el límite bloquea, sin borrar historial. La compactación y
migración requieren una entrega futura. Informes inválidos/bloqueados omiten
el nuevo snapshot. Ningún resultado concede autorización o presupuesto real.

La contabilidad usa `runtimeHistory`: mantiene los campos del historial de
selección, pero permite registrar hasta 1 000 000 llamadas/segundos para no
recortar excesos que superen el formato del selector. No amplía políticas ni
permisos: un historial que no cabe en la planificación A no puede reutilizarse
como una nueva admisión. Superar el formato contable también bloquea sin borrar
el snapshot anterior; requiere una recuperación futura expresamente diseñada.

## API de C1 y archivos entregados

| Archivo | Responsabilidad |
| --- | --- |
| [Esquema runtime](../../../schemas/agent-client-runtime.schema.json) | Entradas, evidencia, ledger, transiciones e informes estrictos |
| [Admisión](../../../src/client-runtime-admission.js) | Recalcular A y evaluar elegibilidad declarada |
| [Transiciones](../../../src/client-runtime-state.js) | Proponer reserva, observación, interrupción o conciliación |
| [Núcleo compartido](../../../src/client-runtime-core.js) | JSON inerte, huellas canónicas, vigencia y contabilidad |
| [Pruebas offline](../../../test/client-runtime.test.js) | Fixtures ficticias, conflictos, límites y ausencia de efectos |

Las fábricas reciben, en orden, los objetos de los esquemas empaquetados de
selección, preferencias, adaptadores y runtime. Quien integra la biblioteca
los carga por su cuenta; el núcleo no los lee del disco ni busca esquemas remotos.
Cada fábrica devuelve una función síncrona, `admit(input)` o `transition(input)`.
Las pruebas entregadas muestran las estructuras completas con datos ficticios.

Admisión devuelve `invalid`, `needs-info`, `blocked` o `eligible-for-reservation`.
Transiciones devuelven `invalid`, `blocked` o `proposed`; solo este último incluye
`nextLedger` y `compareAndSwap`. Las huellas identifican contenido, no autentican
al operador ni una observación real. `mark-started` registra una declaración:
no autoriza ni comprueba un arranque. `persisted`, `executed`, `runtimeReady` y
`verifiedAdmission` siguen en `false` donde forman parte del informe.

La entrega C1 no añadió comando CLI, store, supervisor ni integración con proveedores.
Las etapas C2/C3 se revisan por separado. Su infraestructura y estado no forman
parte de esta consolidación C1; aprobar C1 no concede permisos para ellas.

## Verificación histórica de la entrega C1

Revisión del 2026-10-03 con `spec-driven-development` y `quality-gate`:

- `node --test --test-reporter=spec test/client-runtime.test.js`: primera base
  de 150 pruebas aprobada. La ampliación a 171 casos añadió recuperación de
  arranque desconocido, exceso contable, capacidad, cronología y entradas hostiles.
- `node --test --test-reporter=dot test/client-runtime.test.js`: 171 casos pasan.
- `node --test --test-reporter=spec`: 1 093 pruebas pasan, cero fallos,
  cancelaciones, omisiones o pendientes; incluye los 922 casos anteriores.
- `node --check` sin errores en los tres módulos nuevos.
- `git diff --check` sin incidencias; revisión adicional de los siete archivos
  de esta entrega, incluidos los nuevos: formato limpio, 16 enlaces locales
  resueltos y nueve tablas consistentes. Sin rutas personales ni patrones
  evidentes de claves privadas; esta búsqueda no sustituye una auditoría de secretos.
- Instrumentación de las APIs enumeradas en las pruebas: cero intentos de
  archivos, red, procesos, reloj actual o azar desde fábricas y operaciones C1.
  No es una certificación de aislamiento de clientes nativos.

| Criterios | Resultado y alcance |
| --- | --- |
| 1–4 | Verificados offline: determinismo, contratos, JSON inerte, vigencia, vinculación, controles y efectos declarados |
| 5 | Acumulación y conflictos de snapshot verificados; atomicidad durable sigue pendiente de C2 |
| 6 | Interrupción y conciliación declaradas verificadas; caídas reales y persistencia siguen pendientes de C2 |
| 7 | Pendiente: no hay supervisor ni pruebas de procesos descendientes |
| 8 | Ejecución nativa cerrada; pruebas de instalación y permisos de C3 pendientes |
| 9 | Informes acotados sin eco de datos privados de prueba; no hay capturas persistidas ni evaluación de errores nativos reales |

Preservación: de 125 archivos previos, solo cambiaron este documento y el estado
C1 en la especificación de adaptadores; los otros 123 conservan sus huellas.
Se añadieron un esquema, tres módulos y una suite de pruebas. El índice sigue
vacío; los cambios previos ajenos a C1 no se añadieron ni reformatearon.

Resultado: **Aprobado con observaciones para la base C1 offline**. La observación
principal es su naturaleza declarada: no autentica permisos, no mide consumo
real ni garantiza exclusión entre escritores. SDD delimitó la entrega y sus
puertas; quality-gate exigió regresión y preservación, sin presentar declaraciones
como evidencia de ejecución real.

No se iniciaron clientes de IA ni se probaron cuentas; no se tocaron suscripciones,
créditos, catálogos privados, Obsidian o automatizaciones. No hay commit ni push.
El siguiente alcance a aprobar es C2, con reserva durable y procesos ficticios,
sin inferencia ni credenciales.

## Diseño siguiente: C2

La especificación local de C2 (etapa separada) detalla almacenamiento,
caídas, concurrencia, supervisión ficticia y criterios de aceptación. **C2.1 fue
aprobada e implementada** el 2026-10-03; su evidencia y límites se registran allí.
C2.2 fue autorizada e implementada el **2026-10-04**, exclusivamente con procesos
ficticios y sesión cooperante de un solo uso. API, evidencia y límites figuran en
la especificación local. Los clientes reales continúan fuera de alcance:
probar la infraestructura no concede permiso de inferencia o consumo.

## Cierre de C1 offline para entrega local — 2026-10-06

Resultado de quality-gate: **Aprobado con observaciones para C1 offline**.
Las observaciones conservan sus límites: evidencia declarada, sin autenticidad,
reserva durable, exclusión entre escritores ni control de procesos reales.
No se añadieron funciones o excepciones para cerrar esta entrega.

Alcance de seis rutas: esquema runtime, tres módulos puros, suite de C1 y esta
especificación. Selector, adaptadores A y parser/decodificador B ya estaban
versionados y permanecen intactos. Stores, supervisores, fixtures de procesos,
auth nativa, rutas supervisadas y expedientes C3 quedan fuera del commit.

Se extrajo la base versionada y se superpusieron únicamente las seis rutas
en una copia temporal propia, usando las dependencias ya instaladas.

| Comprobación | Resultado observado |
| --- | --- |
| Regresión completa aislada | 1.440/1.440; exit 0; 37.408,792 ms |
| Fallos, canceladas, omitidas y pendientes | 0 |
| Cobertura incorporada | 171 pruebas C1 + 1.269 de la base anterior |
| Sintaxis de módulos y suite C1 | 4 node --check individuales, exit 0 |
| Revisión previa C1 en el árbol local | 171/171; exit 0; 1.064,696 ms |

```sh
node --test --test-concurrency=2 --test-reporter=spec
node --test --test-reporter=spec test/client-runtime.test.js
```

El primer comando corresponde a la copia aislada; el segundo, a la revisión
previa en el árbol local. No sumar ejecuciones repetidas como casos adicionales.
Las fixtures son declaraciones ficticias, sin consultas a cuentas o clientes.
Las pruebas instrumentan IO/red/procesos/reloj/azar después de cargar módulos,
sin convertir esa observación en aislamiento comprobado de una instalación.

### Trazabilidad de criterios y límites

La matriz histórica mantiene los criterios 1–4 y 9, y la parte offline de 5–6,
respaldados por las suites: vínculo y recálculo, vigencia/revocación declaradas,
controles y efectos, JSON inerte, presupuesto, conflictos de revisión/huella,
cronología, interrupción/conciliación y reportes sin afirmar ejecución real.
Los criterios 7–8 y la parte durable de 5–6 siguen fuera de C1:
no hay supervisor, prueba de instalación real o reserva atómica en disco.

`eligible-for-reservation` solo describe elegibilidad declarada; no entrega
una capacidad de lanzamiento. `proposed` solo devuelve nextLedger y comparación
esperada para una futura sustitución. No escribe ni vuelve indivisibles dos
propuestas concurrentes: C2 debe contrastarlas al persistir.
`persisted`, `executed`, `runtimeReady` y `verifiedAdmission` siguen false.
Los contadores declarados conservan excesos e incertidumbre; no representan
cuota de suscripción, crédito o consumo verificado por un proveedor.

Después de las pruebas solo se ajustó este documento: se conserva la evidencia
histórica, se aclaran cuatro referencias a etapas fuera de alcance y se registra
el cierre actual. Código, esquema y tests mantienen sus bytes probados.
Formato, enlaces, patrones sensibles limitados, hashes del índice y preservación
de archivos ajenos se comprueban antes del commit; el identificador se registra
aparte sin incorporar lotes privados al repositorio.

Pruebas observadas en macOS con Node v24.14.1, no certificación Linux/Windows.
La documentación externa conserva sus consultas históricas; este cierre no
revalida variantes nativas, facturación o modelos reales. No se modificaron
Skills, MCP, Obsidian, configuraciones de clientes o automatizaciones.

Siguiente puerta: revisar la infraestructura C2 por separado y exclusivamente
con fixtures autorizadas. La publicación y cualquier arranque nativo requieren
su propio permiso; no se activan por crear este commit local.
