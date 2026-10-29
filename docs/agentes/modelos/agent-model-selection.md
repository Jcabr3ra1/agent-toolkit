# Selección de modelos por tarea

## Estado y alcance

- Especificación, contratos y entrega aprobados el 2026-10-02 para commit local.
- Fecha: 2026-10-02.
- Profundidad: estándar; la ejecución posterior requiere controles de seguridad.
- Alcance: política reutilizable para el equipo de agentes de Agent-Toolkit.

Esta entrega incluye un selector local y sus contratos. No cambia el modelo de una
sesión, configura clientes, inicia agentes, instala herramientas, modifica código
de proyectos, contrata API ni crea commits. Las conexiones y cuotas reales de
las cuentas siguen pendientes de comprobación para el futuro ejecutor.

La [extensión de versiones y esfuerzo](agent-model-preference.md)
recoge la preferencia posterior del usuario por versiones recientes dentro
de la familia adecuada y esfuerzo variable. Su especificación e implementación
fueron autorizadas por separado: el contrato `2.0.0` añade esa decisión y el
contrato `1.0.0` conserva el comportamiento descrito aquí. No hay migración,
clientes activos ni ejecución implícita.

## Problema y evidencia

El piloto tutor completó un cambio pequeño de documentación. El encargo no
indicó un modelo y el usuario informó que Claude estaba usando Opus. La revisión
confirmó el cambio, pero no certificó una versión concreta del modelo mediante
telemetría. Este resultado no demuestra que Opus eligiera la tarea ni que un
modelo más ligero hubiera dado el mismo resultado.

El usuario necesita evitar seleccionar manualmente un modelo para cada trabajo
y evitar que todo vaya al más reciente o exigente. El sistema debe poder crecer
cuando cambien modelos, cuentas y clientes sin convertir novedades en permisos.

## Objetivo y conceptos separados

Elegir el perfil aprobado menos exigente que previsiblemente pueda cumplir el
encargo, dadas su dificultad, riesgo, capacidades necesarias y acceso permitido.
La calidad se comprueba después; el selector no conoce infaliblemente el mejor
modelo ni deduce capacidad solo del nombre o fecha de lanzamiento.

- **Rol:** coordinador/revisor, tutor/proponente o ejecutor.
- **Cliente y proveedor:** herramienta local y servicio autorizado para ese rol.
- **Modelo y esfuerzo:** versión solicitada y ajuste de razonamiento compatible.
- **Modo:** tutor o autónomo; no se altera para compensar un modelo insuficiente.
- **Permisos:** acciones y datos autorizados; no cambian al seleccionar o escalar.

Esta política respeta el reparto de roles confirmado. En tutor Claude sigue enseñando,
el usuario escribe y Codex revisa; elegir otro modelo no crea un segundo tutor.
Los documentos complementarios `agent-team-handoffs.md` y `agent-work-modes.md`
quedan pendientes de versionado separado, fuera del commit del selector.

## Primera base: recomendación sin ejecución

El [módulo local](agent-model-selector.md) evalúa datos estructurados del encargo
contra un catálogo y una política versionados. Devuelve recomendación, motivo,
límites y bloqueos.
No invocará un modelo para clasificar tareas ni ejecutará procesos de agentes.
En el inicio, el coordinador declara dificultad y requisitos; no se promete
comprensión automática de una descripción libre.

En la fase manual el usuario selecciona el modelo en su cliente. Escribir una
recomendación en Markdown no cambia una sesión ni verifica qué modelo respondió.
Solo la futura capa ejecutora, autorizada aparte, podría pasar la selección al
CLI y contrastar sus resultados. Tampoco cambiaría el modelo de este chat por
el mero hecho de recomendar otro para una tarea posterior.

## RF-01. Entrada explícita y clasificación

La entrada incluye `projectId`, `taskId`, revisión, rol, cliente, proveedor,
modo, categoría, dificultad, riesgo, requisitos y límites autorizados.

Categorías iniciales: documentación, tutoría, propuesta de implementación,
diagnóstico, aplicación y revisión. Dificultad: `low`, `medium` o `high`.
Riesgo: `low` o `high`. Autenticación, seguridad, migraciones, acciones
irreversibles o datos sensibles requieren riesgo alto aunque el cambio sea corto.

Requisitos: herramientas necesarias, tipo de entrada, contexto y formato de
salida. No inferir que pocas líneas significan poco riesgo, ni que todo bug
necesita el perfil máximo. Una aplicación mecánica puede ser sencilla; cambios
de contratos, arquitectura o concurrencia no se reducen a copiar texto.

Si falta una decisión relevante, devolver `needs-info` con los datos concretos
que faltan. No elegir el perfil mayor a ciegas. Una tarea marcada tutor no tiene
un agente escritor; una selección no convierte ese paso en autónomo.

## RF-02. Catálogo actualizable y política independiente

El catálogo se diseña como datos independientes del algoritmo. Los
[contratos estructurales](agent-model-selection-contracts.md) incluyen esquemas
y ejemplos ficticios; esta etapa no crea una configuración activa.

Cada perfil tendría:

- `profileId`, cliente y proveedor; identificador de modelo solicitado.
- Estado: `candidate`, `approved`, `deprecated` o `disabled`.
- Roles y categorías evaluados, dificultad y riesgo admitidos.
- Capacidades declaradas y verificadas, límites conocidos y fuentes/fecha.
- Ajustes de esfuerzo compatibles: no asumir los mismos nombres entre proveedores.
- Prioridad explícita por rol; criterios de evaluación y evidencia de su aprobación.
- Política de versiones: identificador concreto o alias deliberadamente aprobado.
- Tipo de acceso permitido; no exigir una API de pago ni copiar credenciales.

La configuración local privada declara qué perfiles tiene disponibles la cuenta,
con fecha y procedencia. Datos desconocidos no se convierten en disponibilidad
verificada. Un catálogo público de modelos no prueba acceso del usuario; la
comprobación real mediante inferencia consumiría cuota y necesita autorización.

La política ordena perfiles dentro de cada rol/proveedor, tras cumplir requisitos.
No hay una escala universal que haga equivalentes Luna, Haiku o Flash por nombre.
Las prioridades y capacidades se revisan con evidencia, no con el criterio
«última versión primero». El núcleo reutilizable no incluye datos de cuentas,
rutas personales, tokens, tareas privadas ni precios inventados.

## RF-03. Selección conservadora y explicable

1. Validar entrada, catálogo y política; rechazar estructuras desconocidas,
   perfiles duplicados o referencias inválidas.
2. Respetar rol, proveedor y cliente autorizados. Esta base no decide cambiar
   de proveedor ni compartir nuevas fuentes.
3. Excluir perfiles no aprobados, retirados, deshabilitados o sin disponibilidad
   declarada vigente para la cuenta.
4. Filtrar capacidades y evidencia para categoría, dificultad, riesgo y contexto.
   Si no puede comprobarse un requisito relevante, bloquear o pedir información.
5. Elegir el perfil restante de menor exigencia según la prioridad explícita
   aprobada para el rol; desempatar por `profileId`, no por fecha de lanzamiento.
6. Emitir motivo, perfiles descartados y límites de la recomendación sin ejecutar.

Si no queda ningún perfil admisible, devolver `blocked`, no usar el default del
CLI, `latest`, un modelo desconocido o la API como salida automática. Una elección
expresa del usuario se conserva si está permitida; si contradice la política,
se explica el conflicto en lugar de sustituirla silenciosamente.

Una orientación inicial, todavía sin demostrarla en las cuentas reales:

| Encargo | Perfil que se evaluaría primero | Motivo |
| --- | --- | --- |
| Explicar o mejorar un párrafo | Ligero aprobado para tutoría/documentación | Alcance acotado y revisión sencilla |
| Implementación entre varios módulos con requisitos claros | Equilibrado aprobado para propuesta | Necesita contexto y coherencia entre cambios |
| Diagnóstico ambiguo o revisión de seguridad | Perfil evaluado para ese riesgo y dificultad | El tamaño del diff no reduce la exigencia |
| Aplicar una propuesta exacta ya revisada | Perfil aprobado para aplicación y herramientas necesarias | No necesita repetir el diseño, pero sí respetar alcance |

No se asignan versiones reales activas en esta especificación. Un perfil ligero
que no cumpla los requisitos se excluye, aunque consuma menos.

## RF-04. Escalamiento y presupuestos

Un criterio incumplido con evidencia puede justificar un perfil más capaz dentro
de los perfiles aprobados para el mismo rol y alcance. Antes de escalar, separar
problemas de comprensión de fallos de entorno, formato, base o autorización.

Permisos denegados, una propuesta desactualizada, dependencias ausentes, cuota
agotada, autenticación fallida y pruebas no ejecutadas no prueban insuficiencia
del modelo. No se comprueba calidad invocando repetidamente otros agentes.

Escalar requiere motivo y evidencia de revisión vinculados al encargo vigente.
No aumenta las dos rondas de corrección autónoma del contrato de traspasos.
Cambiar de modelo, revisión o cliente no reinicia ese contador. En tutor las
correcciones siguen siendo pasos manuales; nunca se convierten en escritura
automática del usuario ni en intentos del ejecutor.

La política puede limitar perfiles y esfuerzo máximos, número de futuras
ejecuciones y tiempo autorizado. En esta base no reserva presupuesto ni ejecuta
reintentos. Si una cuota no es observable, se registra como desconocida: no se
promete medir o limitar exactamente todos los tokens/créditos de las suscripciones.

No usar precios de API como si fueran el consumo de una suscripción. Un fallo
de cuota devuelve bloqueo; cualquier alternativa requiere su permiso previo y
no habilita gastos, otro proveedor o una autenticación distinta automáticamente.

## RF-05. Modelo solicitado, observado y no confirmado

La recomendación registra identificador solicitado, perfil, esfuerzo, versiones
del catálogo/política, huellas de entradas, motivo y estado. Es un documento de
selección, no una firma de autorización ni un comprobante de ejecución.

La futura entrega del cliente distinguirá:

- `requestedModel`: lo pedido por el coordinador.
- `observedModels`: modelos identificados por metadata del cliente, incluidos
  cambios o auxiliares si se informan; no inferir cuál fue principal si es ambiguo.
- `modelEvidence`: tipo y procedencia de la observación; separar metadata por
  ejecución de un estado actual de sesión o de una declaración del usuario.
- `verification`: `verified`, `reported` o `unknown`, con limitaciones explícitas.

Un mensaje que diga «soy Opus» o el catálogo de un cliente no prueba el modelo
de cada respuesta. Una sesión abierta puede conservar su modelo previo. Un
alias puede remapearse; fijar un identificador solicitado tampoco garantiza que
el proveedor no lo sustituya.

En ejecución estricta futura, metadata ausente/ambigua o un modelo fuera de
los aprobados impide aplicar la entrega automáticamente y deja revisión humana.
No se descarta silenciosamente la respuesta ni se repite la petición consumiendo
cuota. La política debe declarar qué auxiliares permite; si el cliente no puede
controlarlos o informarlos, comunicar la incompatibilidad, no prometer aislamiento.

## RF-06. Modelos nuevos, cambios y retiradas

Un modelo nuevo entra como `candidate`, nunca sustituye por sí solo un aprobado.
Su evaluación incluye documentación oficial, compatibilidad del CLI, acceso de
cuenta y tareas representativas de sus roles: calidad, respeto de instrucciones,
tiempo y consumo observable. Las comparaciones se autorizan porque consumen cuota.

Después de revisión se aprueba para categorías concretas, manteniendo historial
del catálogo y posibilidad de volver al perfil anterior. Un modelo nuevo no
hereda todos los usos del viejo por pertenecer a la misma familia.

Una retirada o remapeo inesperado bloquea el perfil afectado; no deja caer la
ejecución en el modelo por defecto. Una alternativa requiere aprobación previa,
compatibilidad y mismas restricciones. Mantener contratos de traspaso y propuestas
ya escritas; cambiar modelo no autoriza rehacer o sobrescribir trabajo.

Las actualizaciones del catálogo se revisan explícitamente. No se añade ahora
una vigilancia, descarga automática de listas ni modificación de configuraciones.

## Diseño propuesto y salida

Separar el selector puro de los futuros adaptadores de clientes y ejecutor.
El selector no lee almacenes de autenticación ni modifica manifiestos de memoria.
La primera salida estructurada contendría:

- `schemaVersion`, estado, proyecto, tarea, revisión, rol y modo.
- Perfil/modelo/esfuerzo recomendado, si hay selección válida.
- Motivo, descartes, capacidades/evidencia y restricciones aplicadas.
- Huellas y versiones de entrada, catálogo y política; información faltante.
- Próximas acciones manuales y condiciones de escalamiento; ninguna ejecución.

Estados: `recommended`, `needs-info`, `blocked`, `invalid`. En todos ellos
`executed: false`. La recomendación no altera archivos por defecto; guardarla
necesitaría una acción delimitada, sin sobrescribir una entrega previa.

Las plantillas de encargo podrían incorporar posteriormente una sección de
selección y las de revisión, evidencia de modelo. Esa adaptación requiere
aprobación; no reescribir los archivos privados del piloto ya completado.

## Criterios de aceptación de la primera implementación

- CA-01: Igual entrada, catálogo y política producen igual decisión y motivo;
  no se ejecutan procesos de agentes, red, autenticación ni escrituras.
- CA-02: Una tarea acotada selecciona el perfil menos exigente admisible, no
  el más nuevo; uno ligero incompatible queda excluido.
- CA-03: Riesgo alto, contexto y herramientas se aplican como requisitos;
  no se elige un perfil solo por tamaño del diff o nombre de familia.
- CA-04: Falta de datos devuelve `needs-info`; ausencia de candidato permitido
  devuelve `blocked`, sin fallback implícito al default del cliente.
- CA-05: Modo tutor y permisos no cambian al seleccionar/escalar; un cambio
  de proveedor no queda autorizado por una recomendación.
- CA-06: Un fallo de permisos, entorno, cuota o base no escala por calidad;
  una escalada válida necesita evidencia y respeta rondas y límites existentes.
- CA-07: Cambiar un modelo/perfil no reinicia rondas; una elección explícita
  compatible se respeta y una incompatible se informa sin sustituirla.
- CA-08: Modelos nuevos no aprobados, retirados o no disponibles no se seleccionan;
  aprobar uno requiere evidencia y revisión, no detección automática.
- CA-09: La salida identifica versiones, huellas, motivo y `executed: false`;
  no afirma modelo real ni acceso comprobado por una selección.
- CA-10: Catálogos malformados, duplicados, perfiles faltantes y esfuerzo no
  soportado producen rechazo explicable, no configuración aproximada.
- CA-11: Pruebas con modelos ficticios cubren selección, desempate, bloqueo y
  escalamiento sin necesitar API keys, gastar cuota ni revelar datos privados.

RF-05 exige pruebas de metadata y clientes en una fase posterior; el selector
puro no certifica el modelo de una ejecución que no ha ocurrido.

## Plan de tareas y siguiente puerta

- [x] T1. Documentar política, alcance y criterios — este documento — inspección
  de fuentes oficiales y contraste con la evidencia del piloto; no implementación.
- [x] T2. Definir esquemas de catálogo/política/entrada sobre la especificación aprobada
  — contratos, esquema y ejemplos ficticios — 65 pruebas de estructura;
  contratos aprobados por el usuario el 2026-10-02.
- [x] T3. Implementar selector puro autorizado — módulo y 106 pruebas aisladas —
  CA-01 a CA-11 comprobados sobre datos declarados de confianza; sin ejecutor
  ni cambios en clientes. Entrega aprobada por el usuario para commit local.
- [ ] T4. Adaptar plantillas con permiso — incluir recomendación y procedencia
  — conservar el piloto y verificar los dos modos sin envío automático.
- [ ] T5. Inventario local privado y pruebas de modelos autorizadas — CLI, acceso
  y evidencias por rol — no convertir catálogos públicos en acceso confirmado.
- [ ] T6. Especificar adaptadores y ejecución local por CLI — aprobación separada
  — permisos, cuotas, cancelación y modelo real antes de cualquier aplicación.

## Fuentes oficiales y límites de la consulta

Consultadas el 2026-10-02; son evidencia del comportamiento documentado, no
pruebas de nuestras versiones locales ni de acceso a modelos en las cuentas.

- OpenAI recomienda comparar configuraciones y conservar la más ligera que
  alcance la calidad requerida: [selección de modelos](https://developers.openai.com/api/docs/guides/model-selection).
- Codex documenta [ejecución no interactiva](https://learn.chatgpt.com/docs/non-interactive-mode).
  Sus opciones y metadata deben verificarse en el adaptador y versión reales.
- Claude documenta selección de modelos/alias, conservación de modelos en
  sesiones y metadata `modelUsage`: [configuración de modelos](https://code.claude.com/docs/en/model-config).
  Un alias o identificador solicitado no certifica la respuesta real.

No se cambian modelos ni se ejecutan inferencias
para resolver estas dudas durante la especificación.

## Riesgos, alternativas y reversión

Elegir un perfil más ligero puede producir una peor respuesta; la revisión y
la evaluación por rol corrigen la política, no la suposición de que todos sirven.
Modelos fuertes también fallan y su acuerdo no reemplaza pruebas del proyecto.

La prioridad explícita reduce reglas opacas, pero no mide automáticamente el
ahorro real. Cuotas opacas, remapeos y auxiliares limitan garantías de consumo
y versión. No se prometen aislamiento o detección total de información privada
solo mediante instrucciones.

Alternativas: selección manual completa, siempre el modelo más potente o un
clasificador remoto para cada pedido. La propuesta evita cuota adicional para
clasificación en su base y no altera el reparto de roles confirmado.

Reversión: revertir solo los archivos propios de la entrega del selector;
no resetear el repositorio ni alterar memorias, configuraciones o trabajo ajeno.
La ejecución por CLI y sus efectos se aprobarán por separado.

## Evidencia documental y pendientes

La especificación inicial se contrastó con fuentes oficiales y la revisión
privada del piloto cuando todavía no existía selector. Después de la aprobación
se prepararon contratos y ejemplos con 65 pruebas estructurales; con nueva
autorización se implementó el selector puro y 106 pruebas adicionales.

Suite completa: 494 pruebas aprobadas. La matriz de CA-01 a CA-11 del núcleo
y sus limitaciones se describen en [la entrega](agent-model-selector.md).
No se ejecutó ningún modelo ni se modificaron clientes reales.

Pendiente: adaptación de plantillas, inventario y
evaluación real de perfiles, y adaptadores autorizados aparte. La recomendación
funciona como módulo local con datos estructurados; no hay selección aplicada
automáticamente a sesiones ni autenticación de permisos/historial por este módulo.
