# Contratos de selección de modelos

## Estado y alcance

La especificación y estos contratos fueron aprobados por el usuario el
2026-10-02. La base del [selector local](agent-model-selector.md) ya los consume.
No son una configuración activa ni cambian modelos, cuentas, cuotas o permisos.

La Skill `spec-driven-development` guió la separación entre contrato, algoritmo
y comprobación. Esta etapa crea datos y pruebas de estructura, no un ejecutor.

## Tres documentos, un esquema versionado

El [esquema JSON](../schemas/agent-model-selection.schema.json) agrupa tres
contratos con `kind` distinto y `schemaVersion: "1.0.0"`. Cada documento se
valida por separado, sin resolver referencias de Internet ni descargar datos.
Los identificadores del esquema son nombres, no servidores que deban existir.

| Documento | `kind` | Qué describe | Ejemplo ficticio |
| --- | --- | --- | --- |
| Catálogo | `model-catalog` | Perfiles, capacidades y evaluaciones | [Catálogo](../examples/model-selection/catalog.example.json) |
| Política | `model-policy` | Orden permitido por rol, cliente y proveedor | [Política](../examples/model-selection/policy.example.json) |
| Solicitud | `model-request` | Necesidad, alcance e inventario privado declarado | [Solicitud](../examples/model-selection/request.example.json) |

Todos los ejemplos usan proveedores y modelos inventados. `approved` y las
evidencias `demo-*` solo sirven para pruebas: no aprueban modelos reales. No se
deben copiar como inventario de una cuenta. La solicitud real permanece fuera
del repositorio público/reutilizable y fuera de Obsidian si incluye datos privados.

## Catálogo: capacidad no equivale a novedad

Cada perfil tiene identidad, proveedor, cliente, modelo solicitado, estado y
política de versión. `pinned` declara un identificador concreto;
`approved-alias` declara un alias revisado. Ninguno demuestra qué respondió.
El nombre `latest` o un segmento `-latest` no se admite como modelo solicitado.
La aprobación de otros alias requiere comprobar su significado en la revisión.

Las capacidades declaradas se separan de las verificadas. Contexto desconocido
es `null`, nunca infinito. Las evaluaciones vinculan **un rol y una categoría**
con dificultades y riesgos concretos: evaluar tutoría no aprueba ejecución.
Un perfil aprobado necesita al menos una evaluación con referencias de evidencia.
El esquema comprueba que existan referencias; no que la evidencia sea auténtica.

`effortOptions` enumera valores admitidos para ese perfil, sin equivalencias
entre proveedores. Una lista vacía significa que no se debe pedir un ajuste
explícito. Los estados candidato, retirado y deshabilitado son datos válidos,
pero no deben poder recomendarse.

## Política: orden explícito y límites

Cada ruta agrupa rol/proveedor/cliente, modos y categorías permitidas. Su lista
de prioridades es exhaustiva: un perfil no listado no entra como alternativa.
Un `rank` menor tiene prioridad; con empate se ordena por `profileId` ascendente,
comparando cadenas por sus códigos y sin depender del idioma del sistema.
No se calcula una clasificación universal ni una equivalencia de familias.

Un esfuerzo explícito de una prioridad debe existir en el perfil referido. La
política vincula una revisión exacta del catálogo y prohíbe cambiar de proveedor,
usar fallbacks implícitos o salir del acceso `session-account`.

Las dos rondas de corrección siguen siendo el techo de correcciones autónomas.
El límite de ejecuciones futuras cuenta también la propuesta inicial y los
fallos, acumulados para toda la tarea. El tiempo es otro límite declarado,
no una reserva de tokens ni una garantía sobre cuotas opacas. El selector no
consume estos presupuestos; la ejecución posterior se especificará aparte.

## Solicitud: incompleta no significa malformada

Identidad, revisión, rol, modo e instante de evaluación son obligatorios. Otros
datos críticos pueden faltar para expresar una solicitud incompleta, no para
asumir valores por defecto. `evaluationTime` es una entrada UTC explícita:
la misma solicitud no cambia de resultado porque avance el reloj del sistema.

| Situación | Resultado del selector local |
| --- | --- |
| Campo desconocido, tipo incorrecto o identidad ausente | `invalid` |
| Falta cliente, proveedor, categoría, dificultad, riesgo o requisito crítico | `needs-info` con campos faltantes |
| Falta alcance/autorización resumida, historial o inventario | `needs-info`; no inventar permisos, contadores o acceso |
| Datos completos, sin perfil permitido disponible | `blocked` |
| Perfil admisible según todas las comprobaciones | `recommended`, siempre `executed: false` |

Una lista vacía de herramientas declara que no se necesita ninguna; su ausencia
significa información pendiente. Lo mismo aplica a `riskFactors`. Modalidad,
formato y contexto deben ser explícitos. Riesgos de seguridad, autenticación,
migración, irreversibilidad o datos sensibles requieren `risk: high`; una
contradicción se rechaza, no se rebaja ni se corrige silenciosamente.

El resumen de autorización contiene referencias al alcance, acciones permitidas
y escritor activo. **No concede permisos por existir en un JSON.** El receptor
valida la instrucción humana en un canal de confianza. En tutor el escritor es
el usuario, no hay rol ejecutor ni acción `apply`. Seleccionar no amplía alcance.

`history` acumula rondas, ejecuciones y tiempo de la tarea. Cambiar revisión,
perfil o cliente no permite reiniciar los contadores; el futuro coordinador debe
comprobarlos contra evidencia anterior. El esquema no puede demostrar esa historia.

`escalation.reason: quality` requiere criterios incumplidos y evidencia. Los
otros motivos representan bloqueos reales y no habilitan escalar por calidad.
Validar la forma de la evidencia no prueba que escalar sea la solución correcta.

## Disponibilidad: datos locales con fecha

`availability` vive en la solicitud privada y contiene perfil, estado, fecha,
procedencia y referencia de evidencia; no nombres, correos, tokens o rutas de
autenticación. Una declaración del usuario se conserva como declaración, no
como inferencia verificada. El catálogo no demuestra acceso a una cuenta.

Con `evaluationTime` y `availabilityMaxAgeSeconds`, el selector admite
solo `available` con antigüedad entre cero y el máximo inclusive. Fechas futuras,
registros caducados, ausentes, `unknown` o `unavailable` no autorizan recomendar
ese perfil. Los ejemplos no se refrescan automáticamente ni consultan los CLI.

## Validación estructural y semántica

El esquema usa Draft 2020-12, objetos cerrados, listas acotadas, enteros no
negativos y enumeraciones. `uniqueItems` detecta objetos idénticos, pero **no**
identificadores duplicados con contenido distinto. El selector local añade
comprobaciones semánticas, sin ejecutar agentes:

1. Identificadores de perfil/inventario únicos; rutas únicas por rol/proveedor/cliente
   y prioridades sin perfil repetido dentro de cada ruta.
2. Revisión de catálogo exacta, referencias existentes y correspondencia de
   cliente/proveedor de cada prioridad, inventario y elección explícita.
3. Esfuerzos compatibles; evidencia para la combinación exacta de rol, categoría,
   dificultad y riesgo; capacidad **verificada**, no solo anunciada.
4. Requisitos completos, coherencia de riesgo, autorización resumida e historial;
   las acciones deben permitir el rol/categoría solicitado sin ampliarlas.
5. Disponibilidad vigente y límites globales; escalada solo por calidad con
   perfil anterior y evidencia aplicable; elección explícita no sustituida.
6. Perfiles aprobados y compatibles únicamente; modelo retirado o alias remapeado
   exige revisar catálogo, no usar el default del cliente.

Datos malformados o referencias contradictorias producen `invalid`. Falta de
clasificación produce `needs-info`; incompatibilidad válida produce `blocked`.
La base implementada y sus límites de confianza se describen en la entrega del
selector. Evidencias, autorización real e historial anterior se contrastan fuera
del núcleo: validar referencias no autentica sus fuentes.

Las fechas tienen zona UTC y segundos, sin fracciones. El consumidor debe
activar validación real de `date-time` además del patrón: un regex no valida
fechas como el 30 de febrero. Las pruebas incluyen comprobación de calendario.
No habilitar coerción de tipos, eliminación de propiedades ni defaults en AJV.

## Evidencia y puerta siguiente

Las [pruebas de contratos](../test/model-selection-contracts.test.js) compilan el
esquema y prueban ejemplos y mutaciones válidas/inválidas. No prueban selección,
desempate, escalamiento efectivo ni modelos reales; esos criterios de la
[especificación](agent-model-selection.md) ahora tienen pruebas separadas en
el selector. Las 65 pruebas estructurales se conservan sin sustituirlas.

Comprobación local de esta etapa, desde Agent-Toolkit:

```sh
node --test test/model-selection-contracts.test.js
```

Evidencia de la etapa inicial de contratos, obtenida el 2026-10-02:

- 65 pruebas de contrato aprobadas, compilando AJV en modo estricto y sin
  transformar las entradas.
- Suite completa: `npm test`, 388 pruebas aprobadas, cero fallos.
- Formato de los siete archivos de esta etapa y diez enlaces locales comprobados;
  `git diff --check` sin errores. El README del piloto conserva su huella previa.
- La revisión de patrones sensibles encontró solo el literal ficticio del test
  que comprueba el rechazo del campo `apiKey`; se inspeccionó como falso positivo.
  No se encontraron otros patrones ni datos reales de proyectos en estos archivos.
  Esta comprobación es acotada, no una garantía de detección exhaustiva.
- Revisión con `quality-gate`: aprobado con observaciones para esta etapa de
  contratos. Duplicados por identificador, referencias, elegibilidad, contadores
  y permisos reales necesitan las comprobaciones semánticas descritas arriba;
  validar un JSON no las sustituye. No se certifican todavía CA-01 a CA-11.
- Sin cambios en fuentes funcionales, clientes, memoria ni entregas privadas;
  sin commit ni push. Se conservó el trabajo previo pendiente del repositorio.

Tras aprobar estos contratos se autorizó e implementó el selector puro con sus
pruebas; la suite completa pasó a 494 pruebas. Su evidencia y siguiente puerta
están en [la entrega](agent-model-selector.md). No se integra un comando CLI,
se adaptan plantillas privadas, se crean commits ni se ejecutan clientes todavía.
Revertir significa retirar solo los nuevos contratos, ejemplos y pruebas y
restaurar únicamente el estado documental de esta etapa, preservando trabajo ajeno.
