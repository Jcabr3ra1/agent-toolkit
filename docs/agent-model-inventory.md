# Inventario privado de clientes y modelos

## Estado y objetivo

- Especificación y entrega documental aprobadas el 2026-10-02; commit local autorizado.
- Profundidad: estándar, por separación entre datos públicos, cuenta y evaluación.
- Alcance inicial: procedimiento y plantillas documentales, no descubridor automático.

Preparar datos de confianza para el [selector local](agent-model-selector.md):
identificar el cliente real, registrar modelos observables y separar acceso
de cuenta de capacidad evaluada. Un inventario no aprueba perfiles ni ejecuta IA.

La Skill `spec-driven-development` guía las puertas y los criterios; OpenAI Docs
guio el contraste inicial con documentación oficial, sin asumir acceso de la
cuenta. `quality-gate` guio la revisión de alcance, evidencia y privacidad.

## Problema y comportamiento actual comprobado

El selector y los contratos quedaron registrados en `dac91fe`. La adaptación
de [encargos y revisiones](agent-team-model-handoff.md) quedó en `5728a55`.
Los ejemplos del catálogo, política y solicitud son ficticios. No representan
un inventario activo de los clientes ni modelos de la cuenta del usuario.

No existe un comando de inventario en Agent-Toolkit ni un adaptador que pueda
certificar el modelo de una respuesta. No se comprobaron en esta etapa versiones,
menús o acceso de los CLI instalados. La variante de Gemini mostrada anteriormente
debe identificarse: no se supone equivalente al Gemini CLI estándar.

Faltan inventario privado, evaluación autorizada por rol y política real para
probar una recomendación aplicable. No basta copiar nombres de una página pública.

## Alcance y exclusiones

La implementación documental autorizada comprende solamente:

- [Guía de inventario](../templates/model-inventory/README.md): procedimiento manual, privacidad y puertas.
- [Formulario genérico](../templates/model-inventory/01-inventario.md): registro de observaciones.
- Actualización de esta especificación con evidencia de esa entrega.

Esta etapa no cambia esquemas, selector, CLI, Skills instaladas, cuentas, modelos
de sesiones, código de proyectos, Obsidian o automatizaciones. No crea inventarios
reales, carpetas privadas, catálogos activos, políticas o inferencias. La creación
documental no incluía commit ni push; posteriormente el usuario aprobó la entrega
y autorizó su registro local por rutas exactas. La publicación sigue excluida.

## Requisitos

### RF-01. Identificar cliente antes de indicar comandos

Recoger nombre y variante, versión observada, procedencia, fecha de observación
y superficie usada: CLI, extensión o aplicación. Una ruta o un nombre comercial
no certifica que el binario sea el oficial; un wrapper se registra como tal.

Primero contrastar la versión y documentación pertinentes. No ejecutar un cliente
desconocido para descubrirlo ni inventar comandos para una variante no documentada.
Una inspección local se delimitará en otra etapa: evitar arranque de sesiones,
hooks, actualizaciones, autenticación y carga automática de contexto del proyecto.
Cuando no exista un método seguro, solicitar una observación manual acotada.

### RF-02. Observaciones pequeñas, con procedencia

Cada registro contendrá fecha UTC, identificador local de evidencia, tipo de
fuente y limitación. La plantilla distinguirá:

- Modelo etiquetado en un menú, y su identificador para solicitarlo si está documentado.
- Versión exacta frente a alias, opción automática o identificador no confirmado.
- Esfuerzos y herramientas documentados frente a comprobados en el cliente.
- Restricciones visibles, crédito adicional y compatibilidad todavía desconocida.
- Rol que se propone evaluar, no aprobado por el simple registro.

El menú puede mostrar modelos no utilizables. No traducir etiquetas a slugs por
intuición, deducir contexto máximo, igualar esfuerzos entre marcas o asignar
prioridades por novedad. Sin identificador compatible confirmado, conservar la
observación en Markdown; no fabricar un perfil válido del esquema.

### RF-03. Tres ejes independientes

| Eje | Evidencia admisible | Qué no demuestra |
| --- | --- | --- |
| Oferta del cliente | Documentación oficial o menú observado, con versión/fecha | Acceso efectivo ni calidad para un rol |
| Disponibilidad de cuenta | Declaración explícita o metadata del cliente, con fecha y alcance | Que cada petición será aceptada ni que respondió ese modelo |
| Evaluación por rol | Entrega y comprobaciones autorizadas, con procedencia y revisión | Aprobación para otros roles, riesgos o versiones |

Conservar estas observaciones por separado. La disponibilidad se representará
como `available`, `unavailable` o `unknown`, con `user-declaration` o
`client-metadata`, conforme al [contrato](agent-model-selection-contracts.md).
Una declaración puede ser válida como dato declarado; nunca se llama acceso
verificado por inferencia. Un menú genérico, por sí solo, deja acceso `unknown`.

La fecha de observación no se renueva al copiar archivos. Si caduca según
`availabilityMaxAgeSeconds`, se requiere evidencia nueva, no actualizar el reloj
para que pase el selector. Un timestamp futuro o contradictorio se investiga.

### RF-04. Entrada como candidato, no recomendación activa

Todo modelo nuevo se registra como candidato a evaluación, no `approved`.
Convertirlo posteriormente a JSON requiere revisión humana y validación mediante
el esquema existente, sin añadir campos privados a ese contrato.

Capacidades no probadas permanecen sin verificar: listas vacías y contexto `null`
cuando corresponda; no copiar capacidades declaradas al bloque verificado.
Las listas vacías significan que no se verificó ninguna capacidad, no que el
modelo carezca necesariamente de ella. No inventar fuentes o evaluaciones para
cumplir campos obligatorios. Sin fuente identificada, mantener el borrador fuera
del catálogo; si no hay perfiles estructuralmente válidos, no generar catálogo.

Separar observación Markdown de documentos del selector: `availability` pertenece
a la solicitud privada, no al catálogo reutilizable. Los estados y prioridades
del catálogo/política se revisan antes de recomendar. Un candidato queda excluido.

### RF-05. Costes, permisos y comportamiento del cliente

No leer almacenes de autenticación, tokens, variables de secretos, registros
completos o datos personales para identificar planes. No instalar ni actualizar
clientes. No activar API, consumo extra, créditos adicionales o cambios de plan.
No prometer que usar una suscripción carece de costes ni cuotas.

Si el tipo de consumo está desconocido o exige facturación adicional, detener
la futura prueba hasta resolverlo. `session-account` no certifica inclusión en
el plan; la comprobación de costes queda como puerta humana previa a inferencia.

Inspeccionar no significa seleccionar: no confirmar una fila del menú, persistir
un default o alterar una sesión para hacer el inventario. Registrar enrutamiento,
alias, fallback o auxiliares documentados; si no pueden observarse/controlarse,
dejar esa limitación sin prometer una ejecución estricta compatible.
No desactivar protecciones ni sortear un bloqueo con otro cliente/proveedor.

### RF-06. Almacenamiento privado y revisiones

La biblioteca versiona solo formularios genéricos. Los registros reales irían
fuera de Agent-Toolkit, Obsidian y repositorios/sincronización, en una ruta
privada acordada antes de escribir. La carpeta del piloto anterior no otorga
permiso para guardar inventarios nuevos ni se modifica retrospectivamente.

El formulario registrará revisión, procedencia y datos mínimos, sin email, nombre
legal, ID de cuenta, credenciales o rutas personales publicadas. Una captura
se recorta/redacta antes de guardarla o compartirla; por defecto conservar resumen
y referencia local, no la captura completa ni salidas del terminal extensas.

No compartir un inventario de cuenta entre proveedores por defecto. El futuro
traspaso contiene solo el perfil/evidencia necesarios y autorizados para ese rol.
Una nueva observación crea revisión; no sobrescribe evidencia anterior ni
concede permisos para cambiar de modo, ejecutar pruebas o publicar.

## Criterios de aceptación de las plantillas

| ID | Caso documental | Resultado esperado |
| --- | --- | --- |
| CA-01 | Cliente estándar frente a variante no identificada | Versión/procedencia explícitas; sin comandos supuestos para la variante |
| CA-02 | Modelo visible sin evidencia de acceso | Oferta registrada, disponibilidad `unknown`, sin prueba implícita |
| CA-03 | Acceso declarado y metadata específica contradictoria | Ambas procedencias conservadas; resolución humana, sin elevar certeza |
| CA-04 | Modelo nuevo sin evaluación | Candidato, capacidades sin verificar y exclusión de recomendaciones |
| CA-05 | Identificador, fuente o fecha pendientes | Borrador; no JSON inventado, timestamp renovado ni catálogo vacío inválido |
| CA-06 | Evidencia caducada o futura | Se solicita comprobación concreta, no se altera para pasar el selector |
| CA-07 | Menú que persiste defaults o permite consumo extra | Inspección sin confirmar selección; coste pendiente bloquea inferencia |
| CA-08 | Cuota, alias, auxiliares o fallback no observables | Limitación registrada; sin nuevas llamadas, proveedor alternativo o falsa verificación |
| CA-09 | Registro real o captura con datos de cuenta | No entra en biblioteca/Obsidian; ruta privada y minimización separadas |
| CA-10 | Crear y revisar los formularios | Solo documentación; pilotos, código, CLI y archivos ajenos intactos |

Son criterios documentales, no pruebas de acceso o conducta de modelos reales.

## Diseño, alternativas y reversión

Empezar con formulario Markdown manual y revisado; no crear otro esquema de
inventario ni un recolector que ejecute comandos arbitrarios. La conversión a
los tres contratos existentes será otra tarea después de tener datos válidos.

Alternativas: catálogo público sin cuenta, descubrimiento automático o probar
todos los modelos. No se adoptan como primera etapa: no demuestran lo mismo
y pueden compartir contexto, escribir configuración o consumir cuota.

Reversión: retirar únicamente los documentos nuevos de esta etapa; sin resetear
Git, borrar encargos privados o modificar sesiones. La incertidumbre se registra,
no se corrige rellenando datos plausibles.

## Plan de tareas y puertas

- [x] T1. Preparar esta especificación y contrastar contratos/documentación oficial.
- [x] T2. Aprobar alcance documental; crear los dos formularios genéricos y revisar
  CA-01 a CA-10, enlaces, formato, datos sensibles y preservación de archivos.
- [x] T3. Aprobar entrega y autorizar commit local por rutas exactas.
- [ ] T4. Acordar ruta privada y autorizar recogida local mínima por cliente;
  comenzar por un solo cliente identificado, sin inferencias ni cambio de modelo.
- [ ] T5. Revisar inventario y proponer prueba por rol con entradas ficticias,
  comprobaciones, límite de llamadas/tiempo, permisos y tipo de consumo explícitos.
- [ ] T6. Autorizar y realizar esa prueba; revisar evidencia antes de aprobar perfil
  y política. No extender un piloto tutor a aplicación autónoma por defecto.

No se autoriza T4 a T6 al aprobar T2. No hay instalación ni envío automático
entre agentes; la ejecución local futura requiere su propia especificación.

## Fuentes oficiales y límites

Consultadas el 2026-10-02; no certifican los clientes o cuentas locales.

- OpenAI distingue controles y disponibilidad por cliente/cuenta: [modelos](https://learn.chatgpt.com/docs/models).
  Su selección no concede acceso o permisos del espacio de trabajo.
- Claude documenta alias y menú; confirmar selección puede persistir un default:
  [configuración de modelos](https://code.claude.com/docs/en/model-config).
  También documenta opciones con consumo adicional y comportamiento de fallback.
- Gemini CLI documenta selección manual/automática y que la elección principal
  no sustituye el modelo de subagentes: [selección de modelos](https://geminicli.com/docs/cli/model/).
  Eso no prueba equivalencia de un wrapper o variante instalada.

No se fijan versiones ni esfuerzos reales basándose solo en estas páginas.
La documentación deberá revalidarse al recoger el inventario del cliente real.

## Evidencia de propuesta y entrega documental

Se inspeccionaron los contratos versionados y la entrega de plantillas de equipo,
sin tocar el trabajo previo de sincronización. La propuesta inicial creó solo
esta especificación. Tras la aprobación explícita del usuario, se crearon los
dos formularios previstos; no se identificaron binarios, leyeron credenciales
ni ejecutaron inferencias.

Revisión de la propuesta: diez criterios definidos, tres enlaces locales
existentes, dos tablas coherentes y formato sin incidencias. El detector de datos
sensibles no encontró coincidencias; no es una auditoría exhaustiva. Las huellas
de los 103 archivos previos inspeccionados permanecieron intactas en esa etapa.

Revisión de T2 realizada el 2026-10-02:

- CA-01 a CA-10 contrastados mediante inspección de las reglas, recorridos
  documentales ficticios y comprobaciones de presencia de campos/reglas.
- Los dos formularios permanecen genéricos, sin modelos reales, datos de cuenta
  o rutas personales prellenadas. Ninguno es un contrato JSON ni inventario activo.
- Nueve enlaces locales existentes, cinco tablas con columnas coherentes, salto
  final y sin espacios sobrantes. `git diff --check` sin errores; la revisión
  directa incluyó los tres documentos sin versionar que Git todavía no compara.
- Detector existente de datos sensibles sin coincidencias en estos documentos;
  no se afirma una auditoría exhaustiva ni anonimización.
- Huellas de 103 archivos ajenos y tres documentos del piloto privado sin cambios
  frente a las bases tomadas antes de crear los formularios.
- Sin cambios de código, clientes, esquema, selector, Obsidian o cuentas. No hubo
  inferencias, recogida real, suite de pruebas funcionales, commit ni push.
  El área de preparación de Git estaba vacía al cerrar esa revisión.

Resultado de `quality-gate`: aprobado con observaciones para la base documental.
Los escenarios no demuestran acceso de cuenta, calidad de modelos, conducta de
agentes o barreras técnicas. La recogida y evaluación reales siguen pendientes.

Tras esa revisión, el usuario aprobó la entrega y autorizó el commit local de
estos tres documentos. No se incluyen cambios ajenos ni publicación.

Pendientes: ruta privada y alcance de recogida para un cliente. Acceso, modelos
disponibles, esfuerzos, cuotas y versión local siguen desconocidos hasta obtener
evidencia. Esta aprobación no autoriza recogida real ni inferencias.
