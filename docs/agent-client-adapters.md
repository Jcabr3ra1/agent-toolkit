# Adaptadores locales de clientes de IA

## Estado y objetivo

Especificación y etapa A aprobadas por el usuario el 2026-10-03 mediante
«aprueba y implementa». Se implementó el contrato y el planificador puro;
no hay runner, clientes activados ni ejecuciones de IA autorizadas por este
documento. Profundidad: rigurosa, por las fronteras de procesos,
autenticación, contexto privado y consumo de una suscripción.

### Estado vigente — 2026-10-25

Se añadió una ruta acotada para `agent-task external-verifier`: solo Codex CLI,
solo tareas con `purpose: external-verifier` y destino `openai/codex-cli`. La
vista previa local no usa el modelo; la invocación necesita un segundo comando
con código y huella de un solo uso después de que la persona revise cuenta,
modelo, archivos y `argv`. Esta excepción no implementa el runner general de
esta especificación, no habilita Claude Code, no admite tareas de edición
y no automatiza consentimiento. La verificación real y cualquier consumo siguen
requiriendo autorización concreta del usuario.

La ruta desactiva capacidades locales conocidas y usa el sandbox `read-only`;
no acredita identidad exacta de cuenta, plan, cuota, número de inferencias ni
ausencia de efectos internos del cliente. Los detalles y límites están en la
[guía del verificador externo](agent-task-external-verifier.md).

El objetivo es convertir una recomendación admisible del selector en un plan
de participación de un cliente concreto, conservando permisos, límites y
evidencia. Elegir modelo, preparar ejecución, ejecutar, revisar una respuesta
y aplicar código son acciones distintas: ninguna autoriza automáticamente
la siguiente.

La primera entrega A/B contenía únicamente un contrato y un planificador puro
con pruebas offline. El lanzamiento acotado descrito arriba se añadió después y
tiene autorización, pruebas y límites separados.

La etapa B fue autorizada el 2026-10-03 con «listo dale» y añade
[parsers offline](agent-client-output.md). No cambia la autorización de procesos
ni verifica instalaciones reales. Su contrato y evidencia se documentan aparte.

El 2026-10-06 el usuario autorizó consolidar A/B en una entrega local de ocho
rutas: validación aislada, precisiones documentales, cierre y commit local.
El resultado se registra al final; no concede push, lanzamiento de clientes,
consultas de cuentas, admisión nativa o cambios en bóvedas.

## Base existente y compatibilidad

Se conserva el [selector local](agent-model-selector.md), su
[contrato base](agent-model-selection-contracts.md), la
[extensión de preferencias](agent-model-preference.md) y la
[procedencia en los encargos](agent-team-model-handoff.md).

El selector no autentica cuentas, no persiste contadores y no ejecuta procesos.
Una disponibilidad declarada o una huella de JSON no demuestra permiso humano,
acceso efectivo ni ausencia de cobros adicionales. Los adaptadores no pueden
reclasificar un perfil candidato como aprobado ni fabricar evaluaciones.

La base nueva admite entradas del selector `2.0.0`. Una entrada antigua no se
migra implícitamente: se informa como incompatible con este adaptador, sin
cambiar el comportamiento existente del selector para versiones anteriores.

## Alcance y exclusiones

El alcance general previsto para adaptadores se limita a respuestas textuales
de tutor, proponente y revisor. La excepción implementada es el verificador
externo de Codex descrito al inicio: no amplía los roles del runner general.
El coordinador conserva la decisión y revisión. El usuario sigue siendo el
escritor en modo tutor. Una propuesta en modo autónomo tampoco equivale a
autorizar aplicación de archivos.

Quedan fuera de alcance del runner general: edición automática de proyectos,
ejecutor de código, Git, PR, despliegues, mantenimiento de Obsidian,
instalaciones, actualización de clientes, configuración global, cambio de plan,
login, uso de API keys, créditos adicionales y publicación de encargos privados.
El adaptador limitado del verificador usa la CLI ya instalada; no crea un
servicio permanente ni admite otros roles.

La arquitectura es reutilizable: los documentos públicos del Toolkit no
incluyen rutas personales, cuentas, modelos elegidos para un proyecto ni
respuestas privadas. Los catálogos y expedientes de evaluación pertenecen al
espacio privado autorizado de cada instalación.

## Componentes y fronteras

| Componente | Responsabilidad | Efectos permitidos |
| --- | --- | --- |
| Selector existente | Recomendar a partir de datos explícitos | Ninguno sobre proyectos, red o procesos |
| Planificador puro | Validar compatibilidad y preparar una intención acotada | Ninguno; recibe JSON de confianza en memoria |
| Preflight futuro | Contrastar cliente, controles, acceso e historial | Solo comprobaciones expresamente admitidas |
| Runner futuro | Reservar presupuesto y ejecutar un cliente autorizado | Un proceso principal acotado y sus efectos declarados |
| Normalizador offline | Interpretar capturas como datos no autenticados | Sin comandos ni seguimiento de enlaces de la salida |
| Revisor | Contrastar respuesta, contrato y procedencia | Según el permiso separado de revisión |

El preflight no se etiqueta automáticamente como «sin efectos»: incluso una
consulta nativa puede escribir estado del cliente o consultar su servicio.
Esos efectos deben conocerse y autorizarse. El planificador no realiza preflight.

## RF-01. Entradas y decisión vinculadas

El contrato propuesto `agent-client-adapter/1.0.0` identificará:

- Proyecto, tarea, revisión, rol y modo, idénticos a la solicitud del selector.
- Solicitud, catálogo y política v2 originales, más la decisión que se pretende
  consumir. Los esquemas empaquetados son de confianza, no parte del encargo.
- Cliente, variante, versión exacta y registro de capacidades del adaptador.
  La versión del adaptador y la del cliente son campos distintos.
- Alcance textual, referencia de autorización y procedencia del contexto.
  Una referencia en JSON es una declaración, no la aprobación misma.
- Resumen explícito de historial, presupuesto y controles del entorno, con
  procedencia y fecha. Información ausente no se sustituye por cero o éxito.

Antes de preparar, se recalcula la selección y se contrasta identidad,
recomendación y huellas canónicas. Una decisión alterada, de otra revisión,
incompatible o distinta de la recalculada produce bloqueo o entrada inválida,
según sea una incompatibilidad de alcance o de estructura.

Solo `recommended` permite preparar. `needs-info`, `blocked` e `invalid` se
conservan con sus motivos. Los perfiles no aprobados siguen bloqueados aunque
el cliente anuncie que el modelo existe o haya contestado un microejercicio.

Las huellas `audit` del selector identifican JSON canónico. Si hay archivos
privados guardados, sus huellas de bytes se registran por separado. Ninguna
huella prueba autenticación, consentimiento o calidad.

## RF-02. Salida de planificación, no de ejecución

La salida propuesta incluirá versión de contrato, identidad, estado, motivos,
información faltante, huellas de entrada y una intención de lanzamiento o `null`.

| Estado del plan | Significado |
| --- | --- |
| `invalid` | Estructura, versión o referencias contradictorias |
| `needs-info` | Falta información crítica explícita |
| `blocked` | La política, selección o compatibilidad impide continuar |
| `prepared` | Los datos suministrados permiten describir una intención |

Toda salida del planificador conserva `executed: false`. `prepared` no significa
«cuenta verificada», «entorno aislado» ni «autorizado a ejecutar». El informe
enumerará los gates externos pendientes; el runner debe contrastarlos mediante
un canal de confianza antes de iniciar un proceso.

La intención usa argumentos estructurados, no una cadena de shell. Contiene
identificadores de controles requeridos, modelo y esfuerzo solicitados, límites,
referencia al prompt y variante de cliente. No contiene secretos ni valores de
variables de autenticación. Las rutas absolutas y el texto privado se resuelven
solo en el futuro consumidor autorizado; no se imprimen por defecto.

## RF-03. Cliente, modelo y esfuerzo explícitos

La ruta proveedor/cliente de la política es obligatoria. No se intercambian
clientes por similitud de nombre ni se cambia de proveedor para evitar un error.

| Ruta | Variante prevista | Requisito de admisión |
| --- | --- | --- |
| OpenAI / Codex | CLI nativo de Codex | Registro compatible de versión y controles |
| Anthropic / Claude | Claude Code nativo | Registro compatible de versión y controles |

Solo se admiten estas dos rutas. Añadir otro cliente requerirá un registro,
esquemas y pruebas propios.

Se transmite el identificador explícito elegido por el selector, no un alias
móvil como «latest» o «default». Un modelo nuevo entra como candidato y necesita
evaluación; actualizar una lista no modifica perfiles aprobados silenciosamente.

El esfuerzo se valida contra esa versión de cliente y ese perfil exacto. No se
traduce `medium` a otro nivel aproximado ni se deja el valor global como sustituto.
Si falta un control necesario, se bloquea la ejecución automática. La política
de familias y versiones sigue siendo del selector, no del adaptador.

## RF-04. Autenticación y efectos nativos

Se usará únicamente la sesión de suscripción ya configurada para el cliente,
cuando su acceso y la política de gasto estén confirmados. No se crea una API key,
no se cambia la facturación y no se habilitan créditos externos. Un estado
«logged in» no demuestra por sí solo que toda ejecución esté cubierta por el plan.

El futuro runner filtra las variables del proceso hijo mediante una lista
permitida y excluye mecanismos de API o proveedores alternativos. No imprime
sus valores, no modifica el entorno del usuario y no lee archivos de tokens
para deducir acceso. La sesión nativa debe conservar su mecanismo legítimo.

No se cambia `HOME`, `CODEX_HOME` u otra raíz del cliente, no se copia una sesión,
no se extraen credenciales ni se relajan permisos para salvar un fallo de login.
Si aislamiento y autenticación son incompatibles, se declara el bloqueo.

Los clientes pueden persistir datos propios. Desactivar el historial de sesión
no demuestra que desaparezcan logs, caches, comprobaciones de actualización o
actividad de plugins. La admisión debe listar efectos conocidos, desconocidos
y límites, sin prometer aislamiento total a partir de un único flag.

## RF-05. Control de herramientas y contexto

Para cualquier runner general, antes de ejecutar deben estar comprobados controles
que impidan herramientas, subagentes, conexiones MCP, hooks y personalizaciones
no autorizadas. Una instrucción dentro del prompt no es un control de seguridad.
El adaptador externo aplica una lista explícita de desactivaciones para las
capacidades locales conocidas de Codex y omite su configuración de usuario; si
no puede reconocerlas se detiene. El sandbox de solo lectura tampoco equivale a
ausencia de lecturas o de red.

No basta con bloquear herramientas después de ver un evento: una inicialización
puede haber producido efectos antes. Si los controles preventivos no están
disponibles o no se han evaluado para la versión instalada, se bloquea el runner.
Un evento inesperado es además una violación que cancela y exige revisión.

Los prompts se construyen solo con contexto acotado y autorizado. Texto de
archivos, respuestas de IA y eventos de cliente se tratan como datos: no pueden
conceder permisos, cambiar políticas, ejecutar instrucciones ni añadir rutas.
No se carga todo un repositorio o toda una bóveda por defecto.

Un bloqueo puede terminar en un traspaso manual propuesto al usuario. No abre
una sesión interactiva automáticamente ni convierte un permiso manual histórico
en permiso permanente. La ejecución manual y sus efectos requieren aprobación
separada y siguen conservando las limitaciones de evidencia.

## RF-06. Preparación segura de un proceso futuro

El runner resuelve un ejecutable confiable y verifica versión y controles
inmediatamente antes del arranque. Revalida identidad, base, autorización,
vigencia de disponibilidad y presupuesto: no confía en un plan antiguo.

Usa argumentos separados, sin shell, sin interpolación de comandos y sin flags
arbitrarios del encargo. El prompt se transmite por una entrada admitida y
evaluada para esa variante, evitando su exposición en argumentos de proceso.
No se ejecuta un ejemplo de documentación como si fuese una receta validada.

Cada ejecución nueva tiene un solo encargo textual y un máximo explícito de
turnos. No usa resume, continue, sesiones cloud, aprobación indiscriminada de
permisos ni apertura de IDE. No reinicia, reintenta, cambia modelo o añade una
llamada auxiliar automáticamente ante errores o metadata ausente.

El registro de compatibilidad deberá distinguir controles documentados,
comprobados localmente y todavía pendientes. Una versión desconocida se bloquea;
no se heredan garantías solo porque su número sea mayor.

## RF-07. Contadores, reserva y cancelación

El futuro historial persiste por tarea, no por cliente, modelo o revisión.
Incluye intentos fallidos y llamadas auxiliares conforme a una política explícita.
Los límites proceden del encargo aprobado; este documento no concede llamadas
ni amplía el presupuesto de un piloto anterior.

Antes del arranque se reserva una ejecución de forma atómica. Dos procesos no
pueden consumir simultáneamente el último cupo. Un intento iniciado se contabiliza
aunque no entregue respuesta. Reservas abandonadas o consumo incierto quedan
como pendientes de conciliación y bloquean nuevos arranques; no se liberan ni
se ponen a cero por conveniencia.

Se separan arranques del proceso principal, turnos nativos y llamadas al modelo.
Un proceso puede generar más de una llamada interna. Si el cliente no aporta
esa contabilidad, no se afirma «una llamada» ni se presentan tokens estimados
como cuotas de suscripción verificadas. El techo externo acota arranques y tiempo;
un límite de inferencias internas requiere un control nativo evaluado.

El runner usa un reloj monotónico y un plazo externo que cubra inicialización
y respuesta. El timeout nativo es complementario. Cancelar debe atender también
procesos descendientes; si no puede confirmarse su terminación, el estado es
indeterminado y no se permite continuar. No se afirma que cancelar revierta
efectos nativos ya producidos o garantice que el proveedor detuvo la inferencia.

## RF-08. Resultado y observación por ejecución

El sobre normalizado propuesto separa:

- Identidad y huellas del plan efectivamente consumido.
- Cliente y versión; modelo/esfuerzo solicitados.
- Estado de proceso: `not-started`, `running`, `completed`, `failed`, `canceled`,
  `timed-out` o `indeterminate`; salida nativa y terminación cuando se conocen.
- Respuesta final completa o ausente; no confundir un fragmento con entrega.
- Modelo y esfuerzo observados, cada uno con fuente, alcance y verificación.
- Consumo, duración y límites, indicando valores desconocidos y procedencia.
- Violaciones, limitaciones y revisión humana pendiente.

Modelo y esfuerzo observados pueden ser `null`. Su verificación usa
`verified`, `reported` o `unknown`, compatible con los encargos existentes.
Se registra además coincidencia `matched`, `mismatched` o `unknown` respecto
a lo solicitado. Los estados no se deducen del contenido de la respuesta.

Un campo de inicialización que refleja el argumento solicitado se identifica
como configuración reportada, no como prueba independiente de qué modelo generó
la respuesta. Para `verified`, el revisor contrasta metadata del cliente vinculada
a esa ejecución y explica qué demuestra. El esfuerzo no queda verificado solo
porque aparezca en un slug, un flag o una captura de la sesión.

Código de salida cero, un evento de éxito y una respuesta correcta son hechos
distintos. Ninguno por sí solo acredita modelo efectivo, esfuerzo, aislamiento
o calidad completa. Una respuesta con metadata desconocida puede revisarse
manualmente, pero no aprobar perfiles ni desencadenar aplicación automática.

## RF-09. Normalización y privacidad

Los parsers futuros serán específicos de cliente, variante y versión evaluada.
Reciben bytes no confiables con límites explícitos de total, línea, eventos,
respuesta y stderr. No almacenan indefinidamente un stream ni ejecutan campos
de herramientas. Límites ausentes o excedidos bloquean la aceptación.

La secuencia debe tener los eventos terminales esperados para el contrato local.
Truncamientos, duplicados contradictorios, esquemas incompatibles, herramientas,
subagentes o estados críticos desconocidos no se aceptan como éxito. Solo se
ignoran extensiones informativas expresamente clasificadas y probadas.

No se concatena dos veces texto incremental y respuesta final. Si son
incompatibles, se informa el conflicto. Uso acumulado y uso por turno no se
suman sin comprobar su semántica. Un terminal con espera de entrada no se
convierte en respuesta completa porque el proceso haya terminado.

No se guarda razonamiento interno, transcript completo, identificadores de
cuenta, credenciales, argumentos de herramientas o rutas privadas de logs.
Se conserva un resumen mínimo permitido y, solo con autorización, la respuesta
necesaria en el expediente privado. Errores nativos se sanitizan antes de mostrarse.

Persistir es responsabilidad del futuro runner, no del planificador o parser.
Requiere destino privado explícito, permisos restringidos, escrituras atómicas,
control de enlaces simbólicos y prohibición de sobrescribir evidencia existente.
Los JSON generados y los expedientes privados nunca se añaden al Toolkit por defecto.

## Documentación externa contrastada

Las siguientes interfaces están documentadas; no son certificados de
compatibilidad de las instalaciones locales. Consulta: 2026-10-03.

- Codex documenta `codex exec`, salida de eventos JSONL mediante `--json` y
  eventos de finalización o fallo. `--ephemeral` evita guardar rollouts de sesión;
  no prueba ausencia de toda escritura nativa.
  [Modo no interactivo de Codex](https://learn.chatgpt.com/docs/non-interactive-mode).
- Claude Code documenta `-p`, salida `stream-json`, selección de modelo y controles
  de herramientas. `--tools ""` no elimina por sí solo herramientas MCP; controles
  y flags adicionales dependen de versión. Esto exige evaluar también conexiones
  y personalizaciones antes del arranque.
  [Referencia de Claude Code](https://code.claude.com/docs/en/cli-reference).

No se adopta ninguna opción para omitir todos los permisos. Los ejemplos
externos de CI, facturación o autenticación no amplían el alcance autorizado.

## Plan de implementación y gates

### Etapa A: contrato y planificador puro

Alcance aprobado e implementado:

- Esquema empaquetado del plan y registros de compatibilidad con datos ficticios.
- Módulo puro que recalcule/valide la selección y produzca el informe de RF-02.
- Pruebas offline de validación, compatibilidad, permisos declarados y límites.
- Evidencia de pruebas y explicación de límites en esta especificación.

Archivos: [esquema](../schemas/agent-client-adapter.schema.json),
[planificador](../src/client-adapter-plan.js) y
[pruebas](../test/client-adapter-plan.test.js). No se conectan al CLI ni se añaden perfiles
reales aprobados. No se implementan preflight, spawn, login, persistencia o runner.

### Etapa B: parsers offline

Requiere aprobación separada. Fixtures ficticias y acotadas por variante;
normalización de estados y metadata sin invocar clientes ni almacenar transcripts.
Pasar estas pruebas no habilita ejecución ni demuestra compatibilidad local real.

### Etapa C: admisión de clientes y runner

Requiere diseño detallado aprobado de controles preventivos, efectos nativos,
historial atómico y cancelación; evidencia de compatibilidad de cada instalación;
presupuesto nuevo explícito y autorización de pruebas reales por cliente.
Si esos gates no se satisfacen, se mantiene el traspaso manual como alternativa.

El diseño detallado de etapa C (etapa separada) y su base C1 offline
están aprobados e implementados. C2.1/C2.2 con procesos ficticios también están
implementados; C3 con clientes nativos sigue pendiente. El
expediente C3.1a (etapa separada) está aprobado e implementado
offline; C3.1b/C3.2 siguen pendientes.
Implementar C1/C2 no habilita efectos nativos ni acredita admisión real de una instalación.

### Etapa D: integración y evaluación

Solo tras aprobar las etapas anteriores: conectar encargos, revisión y selector.
Evaluar perfiles con tareas representativas, conservando autoría tutor y límites.
Escritura autónoma y mantenimiento de memoria siguen siendo capacidades futuras
independientes; no se incorporan por haber completado un adaptador textual.

## Criterios verificables de aceptación de la etapa A

1. Entradas v2 válidas producen el mismo plan para los mismos datos, sin mutarlos.
2. Solo una selección recalculada `recommended` permite `prepared`; candidatos,
   decisiones alteradas y cambios de identidad no lo permiten.
3. Cliente/proveedor/variante incompatibles, versión no admitida y esfuerzo
   no compatible bloquean; no hay sustitución por otro modelo ni un default.
4. Autoría usuario en tutor impide una intención de aplicación; el alcance
   textual nunca habilita archivos, Git o mantenimiento de memoria.
5. Historial ausente, cuotas agotadas, controles pendientes, acceso desconocido
   y evidencia caducada se reflejan sin contadores ficticios ni permisos implícitos.
6. Toda salida tiene `executed: false`, sin observaciones de modelo inventadas,
   y explica que preparar no es verificar ni ejecutar.
7. Esquemas rechazan campos desconocidos, coerciones, límites inválidos y datos
   sobredimensionados antes de procesar la selección. Errores no exponen secretos.
8. Pruebas después de cargar módulos detectan cualquier intento de IO de archivos,
   red o procesos del núcleo. No se inicia un CLI ni se consume una suscripción.
9. Las pruebas existentes de selección y preferencias siguen pasando; cualquier
   incompatibilidad requiere revisión, no modificación silenciosa del contrato.

Los escenarios de parsers, cancelación, concurrencia y efectos reales tienen
gates posteriores propios. No se presentarán como verificados al cerrar etapa A.

## Riesgos y decisiones pendientes

- La etapa B tiene contrato y parsers offline. C1/C2 están implementadas con
  datos/procesos ficticios, según las especificaciones de runtime. C3 nativa y D
  siguen pendientes de aprobación e implementación. Ninguna versión real queda admitida por las
  capturas ficticias de las pruebas.
- Falta comprobar qué versiones locales pueden desactivar personalizaciones y
  herramientas antes de inicializarse, sin romper la autenticación legítima.
- La metadata efectiva de modelo/esfuerzo puede ser insuficiente; no se elimina
  ese gate para conseguir automatización aparente.
- El historial fiable y la contabilidad interna del cliente no existen todavía
  en esta integración. Ningún catálogo privado inactivo los sustituye.
- Las suscripciones y cuotas pueden cambiar. El adaptador no garantiza cobertura
  económica por sí solo ni propone habilitar gasto externo como solución.

La especificación fue elaborada con `spec-driven-development` y `openai-docs`.
La implementación se verificó con `spec-driven-development` y `quality-gate`.
Las comprobaciones de la etapa A no demuestran funcionamiento de un cliente real.

## Comprobación documental de la propuesta inicial

Revisión local del 2026-10-03: cuatro enlaces locales resueltos, tres tablas con
columnas consistentes y comprobación de formato sin incidencias. Los 114 archivos
del inventario previo conservan sus huellas; el índice de Git está vacío.
No se detectaron rutas personales ni patrones evidentes de credenciales en este
documento; esa búsqueda no constituye una auditoría exhaustiva de secretos.

Solo se añadió esta especificación. No se ejecutaron pruebas funcionales de
adaptadores, clientes, modelos ni procesos de inferencia. No se creó commit,
se hizo push o se modificaron los expedientes privados o la memoria de Obsidian.

## API implementada de la etapa A

`createClientAdapterPlanner(baseSchema, preferenceSchema, adapterSchema)` recibe
los tres esquemas empaquetados como JSON de confianza y devuelve
`planClientAdapter(input)`. El consumidor carga los documentos; el módulo no
lee rutas, variables de entorno, cuentas o configuraciones. No acepta un selector
inyectado por un encargo: recalcula con el selector local existente.

La entrada `1.0.0` está definida en `$defs/input` del nuevo esquema:

| Campo | Contenido |
| --- | --- |
| `selection` | Solicitud, catálogo y política originales del selector v2 |
| `decision` | Informe completo previamente obtenido; debe coincidir con el recalculado |
| `adapter` | Proveedor, cliente, variante y versión exacta declarados |
| `registry` | Registros declarados de compatibilidad, modelos, esfuerzos, roles, controles y evidencia |
| `context` | Alcance, referencia opaca al prompt, procedencia y autorización declarada |
| `environment` | Acceso por suscripción, gasto externo deshabilitado y controles declarados con fecha |
| `historyEvidence` | Snapshot del historial, estado de conciliación, fecha y evidencia declarados |
| `limits` | Un turno, plazo máximo y límites de salida, línea, eventos y stderr |

`adapter`, `context`, `environment`, `historyEvidence` y `limits` pueden omitirse
para recibir `needs-info`; sus valores no se completan automáticamente.
Un objeto presente pero malformado se rechaza como `invalid`. Las omisiones
que el contrato v2 admite se conservan como información faltante del selector.
Un permiso denegado o un control incompatible prevalece sobre completar datos.

`decision` se comprueba entero mediante JSON canónico: campos añadidos o
modificaciones en restricciones, motivos o huellas también se rechazan. La
identidad discrepante bloquea sin reproducir la identidad ajena. No se mantienen
campos arbitrarios de una decisión manipulada en el informe de salida.

Los registros son datos, no recetas ejecutables. No contienen comandos, rutas,
variables de autenticación ni flags nativos; la base no distribuye registros
aprobados para instalaciones reales. Un registro duplicado, de ruta incoherente
o evaluado en el futuro se rechaza. Una versión no admitida se bloquea, sin
heredar capacidades de otra versión del mismo cliente.

La intención usa pares abstractos `model`/`effort`, no argumentos nativos listos
para lanzar. Contiene `promptRef`, nunca el prompt o una ruta de archivo. Su
futura traducción a flags dependerá de una variante evaluada y autorizada.
Los modelos deben estar fijados y admitidos expresamente en el registro.

Se exigen siete controles declarados: sin herramientas, subagentes, MCP, hooks,
personalizaciones o actualizaciones, y entrada textual por stdin. El registro
y la declaración del entorno deben contenerlos. `prepared` sigue dejando
pendientes todos los gates externos: no autentica esas declaraciones.

El snapshot de `historyEvidence` debe coincidir con el historial completo del
selector, incluidos perfil y esfuerzo previos. Su estado declarado debe ser
`reconciled`; `pending` o `unknown` bloquean. No se implementó conciliación real,
reserva atómica, persistencia ni incremento de contadores.

Autorización, contexto, entorno e historial usan fechas UTC estrictas y se
contrastan con `evaluationTime` y `availabilityMaxAgeSeconds` de las entradas;
no se consulta el reloj del sistema ni se renueva evidencia. El futuro runner
debe revalidar contra el momento real de arranque.

Los límites locales del contrato son topes de formato, no presupuesto concedido:
un turno, hasta 86.400 segundos, 1 MiB de stdout, 64 KiB por línea y stderr,
y 10.000 eventos. El plazo declarado además no puede exceder el tiempo restante
de la tarea; la línea no puede superar el límite total de stdout.

Antes de validar/copiar el encargo, se acota JSON a 30.000 nodos, profundidad 64,
256 elementos por array y 2.000.000 bytes UTF-8 acumulados en claves/textos.
Se rechazan ciclos, getters, proxies, funciones, objetos especiales, claves
peligrosas y números no finitos, sin ejecutar `toJSON`. Esos topes no certifican
aislamiento de procesos: no hay ningún proceso de IA en esta base.

La salida usa `$defs/report`. Solo `prepared` contiene una intención; todos
los estados mantienen `executed: false`, `runtimeReady: false` y observación de
modelo/esfuerzo desconocida. Las huellas nuevas identifican JSON canónico de
esquema, entrada, registro y decisión, no archivos ni autorización humana.

## Evidencia histórica de cierre de la etapa A

Comprobaciones locales del 2026-10-03:

- `node --test --test-reporter=tap`: 759 pruebas aprobadas, cero fallos,
  canceladas, omitidas o pendientes. Incluye pruebas existentes de trabajo
  todavía no versionado; pasar la suite no aprueba esas entregas ajenas.
- `node --test --test-reporter=tap test/client-adapter-plan.test.js`: las 105
  pruebas nuevas del planificador aprobadas, cero fallos.
- `node --check` del planificador y sus pruebas: sin errores de sintaxis.
- Formato y navegación: siete enlaces locales resueltos y cuatro tablas
  consistentes. De los 116 archivos del inventario previo, solo cambió esta
  especificación; los otros 115 conservan sus huellas. El índice sigue vacío.
- La prueba CA-A08 instrumenta APIs de archivos, red y procesos, además del reloj
  y el azar, después de cargar módulos. Inicializar y obtener los cuatro estados
  no intenta esas operaciones. No prueba el aislamiento de un cliente nativo.
- Casos CA-A01 a CA-A07: rutas textuales ficticias, recalculado completo,
  candidatos bloqueados, esfuerzo/versiones incompatibles, autoría tutor,
  controles/evidencia ausentes, presupuesto agotado, historial divergente,
  fechas vencidas/futuras, límites y entradas no JSON.

La primera ejecución detectó una expectativa incorrecta en una prueba de
autoría: el contrato v2 existente ya rechaza esa entrada como `invalid`.
Se corrigió la prueba, conservando el contrato anterior. No se flexibilizaron
permisos ni se activaron perfiles para lograr el resultado.

Resultado de `quality-gate`: **Aprobado con observaciones**, limitado a etapa A.
Las observaciones son límites declarados: compatibilidad, acceso, gasto y
conciliación siguen siendo afirmaciones de entrada; su verificación efectiva
pertenece a etapas posteriores. No hay hallazgos funcionales abiertos de esta base.

No se modificaron clientes, cuentas, políticas privadas, modelos, Obsidian o
código de AVISENS. No hay commit ni push de esta entrega. El siguiente paso es
la etapa B, parsers offline, con aprobación independiente.

## Cierre de la entrega local A/B — 2026-10-06

Resultado de quality-gate: **Aprobado con observaciones para esta base offline**.
Las observaciones son los límites de evidencia y ejecución descritos aquí,
no permisos para ignorarlos ni hallazgos funcionales pendientes de esta entrega.

Se consolidan solo ocho rutas: dos contratos, planificador, parser, dos suites
y las dos especificaciones. Selector y decodificador JSON ya estaban versionados;
se conservan sin cambios. No se conecta esta biblioteca a una CLI de ejecución.
Las referencias de C/C3.1a anteriores describen trabajo de etapas separadas:
sus módulos no se incluyen ni se aprueban por el cierre de A/B.

La revisión independiente usó una copia temporal de la base versionada más
estas ocho rutas y dependencias ya instaladas, sin instalaciones adicionales.

| Comprobación | Resultado observado |
| --- | --- |
| Regresión completa aislada | 1.269/1.269; exit 0; 36.911,795 ms |
| Fail/cancelled/skipped/todo | 0 |
| Casos incorporados | 105 del planificador + 163 del parser; 1.001 previos preservados |
| Revisión previa A/B en el árbol local | 268/268; exit 0; 583,838 ms |
| Sintaxis | 4 node --check individuales, exit 0 |

```sh
node --test --test-concurrency=2 --test-reporter=spec
node --test --test-reporter=spec test/client-adapter-plan.test.js test/client-output-parser.test.js
```

El primer comando pertenece a la copia aislada; el segundo, a la revisión
previa en el árbol local. No sumar ambas ejecuciones como casos distintos.
Las pruebas de A/B instrumentan IO/procesos/red/reloj y usan capturas ficticias;
no acreditan una instalación real ni acceso o consumo incluido de una cuenta.

CA-A01–CA-A08 conservan su trazabilidad de la evidencia histórica: recálculo
completo, coherencia de rutas/versiones/esfuerzo, scope textual, autoría tutor,
datos/gates faltantes, reportes cerrados, JSON inerte y ausencia de efectos.
Los criterios de B se registran en [la especificación del parser](agent-client-output.md).

Después de las pruebas solo se añade este cierre y la precisión de referencias
en documentación. Código, contratos y tests conservan exactamente sus bytes
probados. El formato, enlaces, patrones sensibles limitados, hashes finales del
índice y preservación de archivos ajenos se comprueban antes del commit.

`prepared` sigue siendo una intención declarada, no un comando ejecutable.
`accepted` es estructura admisible para revisión, no calidad o identidad
autenticadas. No se aprobó el runner, historial persistente, cuentas, nuevos
perfiles de modelos, CLI nativa, API/créditos, Obsidian o aplicaciones autónomas.
Pruebas observadas en macOS con Node v24.14.1; no certificación multiplataforma.
Fuentes externas y formatos citados conservan sus fechas históricas; este cierre
no revalida el comportamiento de versiones instaladas de proveedores.

Siguiente paso: revisar por separado la etapa de control de ejecución offline,
sin dar por admitidos clientes nativos. Publicación y cualquier llamada real
requieren su propio alcance y autorización, no se infieren del commit local.

La actualización del 2026-10-25 incorpora únicamente el adaptador de
`external-verifier` definido al inicio de este documento. No cambia las
conclusiones históricas de A/B ni da por probada una llamada real. La primera
demostración con una cuenta requiere que la persona revise una vista previa y
confirme el comando de esa tarea concreta.
