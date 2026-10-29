# Preferencia de versiones y esfuerzo por tarea

## Estado y alcance

- Fecha: 2026-10-02.
- Estado: especificación y entrega aprobadas; commit local autorizado el 2026-10-02, sin push.
- Profundidad: estándar; modifica contratos y decisiones del recomendador.
- Base: [selección por tarea](agent-model-selection.md),
  [contratos](agent-model-selection-contracts.md) y
  [selector implementado](agent-model-selector.md).

El usuario confirmó tres preferencias: utilizar la versión más reciente dentro
de la familia adecuada, separar proveedores por cliente y variar el esfuerzo
según la tarea. Este documento define la extensión implementada, no una configuración activa.
Los menús aportados y las suscripciones declaradas no aprueban perfiles por rol.
Sus inventarios y capturas permanecen fuera de este repositorio reutilizable.

## Comportamiento anterior y problema

La base valida una ruta exacta de rol/proveedor/cliente, filtra perfiles
admisibles y escoge el menor `rank`, desempatando por `profileId`. Devuelve
`priority.effort` o `null`: no adapta ese esfuerzo a la dificultad de la tarea.
No contiene familias ni un orden revisado de versiones.

La especificación anterior evita elegir por novedad global. Esa protección se
mantiene: lo nuevo no equivale a lo más apropiado ni a lo más capaz. La nueva
preferencia actúa solamente dentro de una familia elegible y evaluada.

## Objetivo y exclusiones

Recomendar una combinación explicable de familia, versión y esfuerzo sin
ejecutar agentes ni consumir cuota para clasificar el encargo. La clasificación
sigue siendo una entrada explícita del coordinador, no comprensión automática
de texto libre. El modo tutor no se convierte en autónomo.

Fuera de alcance: adaptadores, llamadas a modelos, cambios de sesión o defaults,
lectura de credenciales, compras, APIs, vigilancia de lanzamientos, publicación,
memoria de proyectos, instalación y migración automática de inventarios privados.
No se cambian las autorizaciones o límites al recomendar.

## Requisitos

### RF-P01. Ruta y proveedores delimitados

La política enumera familias permitidas por ruta exacta de rol/proveedor/cliente.
Un cliente capaz de ofrecer varios proveedores no autoriza utilizarlos todos.
La configuración prevista del usuario separa el cliente de Codex y el de Claude.

Esta separación se declara en datos revisados, no con búsquedas de palabras
en etiquetas. Identificar el cliente y sus identificadores reales
precede a activar su ruta; no se equipara una variante con el CLI oficial por
su aspecto. Un identificador ambiguo sigue pendiente.

Una ruta no cambia de proveedor para superar cuota, permisos o un error.
La presencia de un perfil ajeno en el catálogo general no lo hace elegible.

### RF-P02. Familia antes que versión

La política establece un orden de familias justificable por rol y alcance.
Se escoge la primera familia con una combinación completa admisible. No se
deduce ese orden del nombre, número de versión o fecha.

Dos familias distintas no se ordenan por números de versiones: una revisión
alta de una familia ligera no desplaza por ese motivo a una familia diferente.
Tampoco se usa siempre la familia más exigente para mantener versiones recientes.

### RF-P03. Versión reciente dentro de la familia

Cada versión tiene una identidad revisada y un ordinal entero de sucesión,
con referencias de evidencia. El ordinal solo se compara dentro de la misma
familia, proveedor y cliente. No se interpreta la versión como un decimal,
no se ordena por etiquetas y no se crea un alias `latest`.

Dentro de la familia elegida, preferir la versión de mayor ordinal que tenga
una combinación de esfuerzo aprobada y evaluada para la tarea, capacidades
suficientes, acceso declarado vigente y límites compatibles.

Si una versión nueva sigue como candidata o no cumple requisitos, no se activa.
Puede elegirse la versión aprobada admisible anterior, indicando el descarte
y su motivo. Es «más reciente admisible», no «último lanzamiento garantizado».
Si ninguna combinación sirve, bloquear; no usar el default del cliente.

La duplicidad contradictoria de ordinales o metadatos de una versión es inválida.
Un ordinal desconocido no se inventa: impide recomendar automáticamente esa
familia bajo esta preferencia hasta completar los datos.

### RF-P04. Esfuerzo variable y evaluado

Las reglas de esfuerzo dependen de rol, categoría, dificultad y riesgo. Cada
regla enumera ajustes en un orden local revisado y vincula evidencia de la
combinación exacta modelo/esfuerzo/alcance. Enumerar ajustes soportados no
demuestra calidad en ellos.

| Situación | Orientación para diseñar reglas, no equivalencia universal |
| --- | --- |
| Cambio acotado con requisitos claros | Evaluar primero un ajuste ligero admitido |
| Implementación habitual o tutoría entre varios pasos | Evaluar un ajuste equilibrado |
| Diagnóstico ambiguo, arquitectura o revisión de seguridad | Evaluar un ajuste suficiente para su dificultad y riesgo |

Elegir el primer ajuste permitido con evidencia aplicable y dentro del techo
de la regla. Un riesgo alto no se rebaja por tener pocas líneas. Tampoco se
afirma que `high` sea necesariamente el ajuste correcto en todas las familias.
Los nombres y su orden son locales: no se trasladan niveles entre proveedores.

Reglas solapadas o un orden contradictorio son inválidos. Sin regla que cubra
la combinación de tarea completa, devolver `blocked`. Ajuste fuera de las
opciones del perfil: `invalid`. Falta de clasificación: `needs-info`.

Un modelo sin control de esfuerzo solo permite `null` con una regla y evidencia
para su comportamiento por defecto. No se presenta `null` como esfuerzo bajo
ni se hereda silenciosamente el ajuste de una sesión anterior.

### RF-P05. Elección explícita y escalamiento

Una elección explícita compatible del usuario conserva prioridad sobre la
preferencia de novedad y queda identificada como excepción deliberada. Una
elección incompatible se bloquea, sin sustituirla por otra más nueva.

Subir el esfuerzo después de una revisión exige criterios incumplidos y
evidencia por calidad. Después puede considerarse otra versión o familia de
la misma ruta, siempre evaluada y previamente permitida. La política declara
una progresión de combinaciones; no se infiere escalamiento de un ordinal de
versión, del número de perfil ni de comparar palabras como `medium` y `high`.

Cambiar versión sin aumentar esa progresión no cuenta como escalada de calidad.
No se modifica una entrega previa ni se reintenta automáticamente. Cada futura
llamada, incluso fallida, cuenta para los presupuestos existentes. Se mantienen
las dos rondas autónomas y los contadores acumulados, sin reiniciarlos.

Permisos, autenticación, entorno, cuota o base obsoleta producen bloqueo, no
escalamiento por calidad. Más esfuerzo no otorga permiso para escribir.

### RF-P06. Explicación y honestidad de la salida

Además de los campos existentes, el informe incluye familia elegida,
ordinal/evidencia de versión, regla/evidencia de esfuerzo, motivo de selección,
excepciones y descartes. Diferencia orden de familias, novedad y progresión de
calidad. No usa un único `rank` para fingir que los tres significan lo mismo.

Conservar versiones y huellas de documentos, determinismo y los estados
`recommended`, `needs-info`, `blocked`, `invalid`. Siempre `executed: false`;
modelos efectivamente observados vacíos y verificación de respuesta desconocida.
Una recomendación no afirma el ajuste real usado por el CLI.

## Diseño y evolución de contratos

Contrato `2.0.0`, por cambiar el significado del orden de selección:

- Catálogo: metadatos de familia/versión y evaluaciones por esfuerzo, separadas
  de capacidades anunciadas y de disponibilidad privada.
- Política: familias permitidas y su orden por ruta, reglas de esfuerzo,
  progresión aprobada de calidad y referencias a la revisión exacta del catálogo.
- Solicitud: conserva clasificación, autorización e inventario; añade historial
  suficiente para identificar combinación y progresión anteriores al escalar.
- Informe: evidencia de las tres decisiones y sus excepciones, sin ejecución.

El [esquema de preferencias](../../../schemas/agent-model-preference.schema.json)
se carga junto al esquema local `1.0.0`, ambos de confianza, sin descargar sus
referencias. Las evaluaciones antiguas sin evidencia por esfuerzo no se
promueven automáticamente. Los tres ejemplos nuevos son exclusivamente ficticios:
[catálogo](../../../examples/model-selection/catalog.preference.example.json),
[política](../../../examples/model-selection/policy.preference.example.json) y
[solicitud](../../../examples/model-selection/request.preference.example.json).

| Objeto | Propiedades nuevas o diferentes | Límite y significado |
| --- | --- | --- |
| Perfil | `familyId`, `versionOrdinal`, `versionEvidenceRefs` | Ordinal entero 0–1 000 000 o `null`; evidencia obligatoria |
| Evaluación | `effort` | Ajuste local o `null`; obligatorio y compatible con el perfil |
| Ruta | `families` en vez de `priorities` | 1–64 familias; proveedor/cliente/rol exactos |
| Familia | `familyId`, `rank`, `profileIds`, `effortRules`, `evidenceRefs` | Orden único 0–10 000; 1–256 perfiles; 0–64 reglas |
| Regla | `ruleId`, `category`, `difficulty`, `risk`, `maxEffortRank`, `options`, `evidenceRefs` | Alcance exacto, sin comodines; 1–256 opciones; techo 0–10 000 |
| Opción | `profileId`, `effort`, `effortRank`, `progressionRank`, `evidenceRefs` | Orden y progresión enteros 0–10 000, consistentes entre reglas |
| Solicitud/historial | `explicitEffort`, `history.previousEffort` | Elección explícita vinculada a perfil; esfuerzo previo obligatorio al escalar |

Todos los objetos son cerrados. Las listas y el conjunto de entrada tienen
límites; los topes globales de la [API](agent-model-selector.md) también se
aplican. El mismo perfil/ajuste mantiene su orden y progresión entre reglas de
una ruta; aumentar esfuerzo no puede reducir su progresión. La prioridad de
familia, el ordinal de versión y la progresión de calidad no se intercambian.

La API ampliada es `createModelSelector(baseSchema, preferenceSchema)`. Recibe
JSON ya cargado y devuelve `selectModel({ request, catalog, policy })`.
Omitir el segundo esquema mantiene disponible solo `1.0.0`; enviar `2.0.0`
entonces devuelve `invalid` con `preference-schema-not-loaded`. No hay comandos
CLI nuevos ni lectura automática de documentos privados.

La recomendación v2 incluye `familyId`, `familyRank`, `versionOrdinal`,
`effort`, `effortRank`, `effortRuleId` y `progressionRank`, con sus referencias
de evidencia. `alternatives` enumera combinaciones admisibles, no órdenes de
ejecución; `effortExcluded` explica descartes de ajustes, además de `excluded`
para perfiles. `audit.baseSchemaSha256` identifica el esquema anterior y
`audit.schemaSha256` el nuevo; las huellas de los tres documentos se conservan.

El algoritmo conserva validación y límites del núcleo anterior; después ordena
combinaciones por prioridad de familia, ordinal descendente y esfuerzo
ascendente. La escalada filtra previamente progresiones estrictamente mayores.
`older-than-known-version` identifica una excepción a la versión conocida más
reciente; `explicit-compatible-choice` distingue la elección expresa. No hay
comparaciones entre números de familias distintas ni fallback a sesión default.

Mantener soporte explícito de `1.0.0` con el comportamiento anterior y pruebas
de regresión. Documentos de versiones mezcladas se rechazan. No convertir
`rank` antiguo en orden de familia, sucesión o evidencia de esfuerzo.
La extensión no migra archivos ni instala políticas en cuentas por defecto.

## Criterios de aceptación

| ID | Comprobación con datos ficticios |
| --- | --- |
| CA-P01 | Dentro de una familia, versión admisible reciente gana aunque su etiqueta ordene al revés |
| CA-P02 | Una familia apta ligera no pierde ante otra solo por la fecha o número de versión |
| CA-P03 | Nueva candidata, retirada, sin evidencia o acceso caducado no se recomienda; descarte explicado |
| CA-P04 | Ordinal ausente/contradictorio y referencias cruzadas se rechazan sin inventar datos |
| CA-P05 | Misma versión admite esfuerzos distintos según reglas de tareas distintas |
| CA-P06 | Ajuste anunciado sin evaluación aplicable no basta; máximo y riesgo se respetan |
| CA-P07 | Solapamientos, ajuste no soportado y contradicciones producen rechazo explicable |
| CA-P08 | `null` solo pasa en una regla aprobada de comportamiento por defecto |
| CA-P09 | Ruta con proveedores ajenos no los selecciona; cambiar etiqueta no evita el bloqueo |
| CA-P10 | Elección explícita compatible gana; incompatible se bloquea sin sustitución |
| CA-P11 | Escalada conserva evidencia, ruta, alcance, escritor, contadores y techo de rondas |
| CA-P12 | Fallos de permiso/cuota/entorno no activan esfuerzo mayor ni fallback |
| CA-P13 | Igual entrada da igual resultado y no muta datos; archivos, red y procesos no se usan |
| CA-P14 | Salida explica familia, versión, esfuerzo y descartes sin afirmar ejecución real |
| CA-P15 | `1.0.0` conserva decisiones anteriores; mezcla de contratos se rechaza |
| CA-P16 | Sin clasificación se pide información; sin combinación admisible se bloquea |

## Plan por dependencias y puertas

- [x] T1. Especificar preferencias, límites y contraste con el núcleo actual:
  este documento. Verificar formato, enlaces y preservación del trabajo ajeno.
- [x] T2. Diseñar e implementar contratos versionados y ejemplos ficticios:
  esquema, contratos y pruebas estructurales, con aprobación y autorización previa.
- [x] T3. Implementar decisión pura y pruebas de CA-P01 a CA-P16:
  selector, ejemplos y tests; sin dependencias nuevas ni clientes reales.
- [x] T4. Revisar regresiones y entrega documental: actualizar las explicaciones
  de la base y del traspaso sin alterar el piloto privado o inventarios.
- [ ] T5. Evaluar perfiles reales y preparar política privada: autorización
  separada para inferencias y destinos; no cubierta por implementar el núcleo.
- [ ] T6. Aplicar recomendaciones mediante adaptadores: especificación y permiso
  separados para la ejecución, sus cuotas, cancelación y efectos.

T2 a T4 pueden formar una sola entrega con una autorización explícita de
implementación y pruebas. Un commit o push requiere autorización aparte.
La aprobación de preferencias no certifica modelos ni autoriza T5 o T6.

## Fuentes, límites y reversión

Requisitos: preferencias expresadas por el usuario en este chat el 2026-10-02.
Estado actual: contrato `1.0.0` y código versionado del selector, inspeccionados.
La [documentación oficial de modelos de OpenAI](https://learn.chatgpt.com/docs/models)
consultada el 2026-10-02 distingue modelos/esfuerzo y advierte que los niveles
no se corresponden exactamente entre generaciones. OpenAI Docs ayudó a
conservar esa separación; no acredita las cuentas ni las variantes locales.

Spec-driven-development separó requisitos, diseño, pruebas y ejecución.
CA-P01 a CA-P16 se verifican con pruebas ficticias del núcleo, no con inferencias
reales. Validar referencias no autentica evaluaciones, permisos ni cuentas.
La novedad no garantiza mejor calidad ni menor consumo. Las cuotas opacas
impiden prometer medición exacta de tokens/créditos de las suscripciones.

Reversión: un consumidor puede omitir el segundo esquema para utilizar solo el
contrato anterior, sin convertir documentos v2. Retirar esta extensión exige
revertir únicamente sus rutas exactas y restaurar la API anterior, preservando
el resto del trabajo. No resetear repositorios ni borrar inventarios.

## Evidencia de la especificación inicial

El 2026-10-02 se comprobó `git diff --check`, formato de tablas y siete enlaces
locales en este documento y el documento base, sin incidencias. Se contrastaron
huellas de 106 archivos previos: solo cambió el documento base para enlazar esta
propuesta; los otros 105 conservaron sus bytes. No hubo coincidencias en el
detector acotado de tokens y claves privadas; no es una auditoría exhaustiva.
No se ejecutaron pruebas funcionales ni inferencias, ni se creó commit o push.

## Evidencia de implementación y revisión

Comprobaciones obtenidas el 2026-10-02 después de la autorización de T2 a T4:

- [Pruebas del selector v2](../../../test/model-preference.test.js): 91 aprobadas,
  cubriendo CA-P01 a CA-P16, decisión autónoma declarada y regresión v1.
- [Pruebas estructurales v2](../../../test/model-preference-contracts.test.js): 69
  aprobadas, con AJV estricto y sin coerción ni transformación de entradas.
- Pruebas enfocadas v1/v2: 331 aprobadas; las 171 anteriores se conservan intactas.
- Suite completa: `npm test`, 654 aprobadas y cero fallos. La suite inicial
  de esta etapa tenía 494 pruebas aprobadas; se añadieron 160.
- Cobertura enfocada: módulo v2 con 100 % de líneas/funciones y 98,14 % de ramas;
  módulo base con 100 % de líneas/funciones y 96,71 % de ramas. No equivale a
  una garantía de ausencia de errores ni a evaluación de modelos reales.
- Cuatro archivos JavaScript comprobados con `node --check`; JSON de esquema
  y ejemplos válido. Formato, tablas y enlaces locales revisados;
  `git diff --check` sin incidencias, incluidos los cambios previos del repositorio.
- Pruebas con archivos, red, procesos, reloj actual y aleatoriedad bloqueados
  durante inicialización y selección, después de cargar módulos y fixtures.
- Contraste de SHA-256 de 107 archivos previos: solo cambiaron las seis rutas
  documentales/funcionales de esta extensión; los otros 101 conservaron sus
  bytes. Las tres entregas del piloto privado conservaron sus huellas.
- Revisión acotada de patrones de tokens y claves privadas sobre las 13 rutas
  de la etapa, sin coincidencias. No es una detección exhaustiva de secretos.

La revisión `quality-gate` clasifica la base como aprobada con observaciones;
el usuario aprobó posteriormente la entrega y su registro local. Opera
sobre declaraciones, no autentica evidencia ni permiso
humano, no persiste historial y no mide consumo real de suscripciones. La
clasificación y los ordinales siguen siendo datos explícitos revisados. Los
clientes reales todavía no adoptan automáticamente estas recomendaciones.

No se ejecutaron inferencias ni se modificaron configuraciones de clientes,
inventarios privados, AVISENS, bóvedas o dependencias. El trabajo ajeno pendiente
se preservó. Antes de autorizar el registro local, el índice estaba vacío y
no se había creado commit ni hecho push de esta etapa.
Obsidian se aplazó por decisión del usuario hasta terminar la herramienta.

El registro local autorizado incluye únicamente las 13 rutas de la extensión,
sin mezclar el trabajo previo pendiente. No incluye push.

Siguiente puerta: T5, evaluar perfiles reales y preparar la política privada,
con autorización separada para inferencias, cuotas y destinos. T6, adaptar y
ejecutar clientes, también sigue pendiente y requiere su propia especificación.
