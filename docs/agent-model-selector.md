# Selector local de modelos

## Estado y alcance

Contratos e implementación autorizados por el usuario el 2026-10-02; entrega
aprobada después para commit local, sin push. La base
está implementada en [model-selection.js](../src/model-selection.js) y se verifica
con [pruebas aisladas](../test/model-selection.test.js). No hay comando CLI
integrado, modelos reales configurados ni ejecución de agentes en esta entrega.

El módulo recomienda a partir de datos explícitos; no interpreta una descripción
libre ni consulta cuentas para descubrir qué modelo tienen. Sigue la
[especificación](agent-model-selection.md) y los
[contratos aprobados](agent-model-selection-contracts.md).

## API de la base

La [extensión autorizada de preferencias](agent-model-preference.md) añade
`createModelSelector(baseSchema, preferenceSchema)` para entradas `2.0.0`.
Ambos esquemas se proporcionan en memoria y son de confianza. Omitir el segundo
mantiene solo `1.0.0`; cargarlo no cambia las decisiones de solicitudes `1.0.0`.
El orden y la evidencia de cierre descritos más abajo pertenecen a la base v1;
la extensión tiene contrato, pruebas y evidencia separados. No integra un CLI.

`createModelSelector(schema)` recibe el esquema empaquetado, cargado por el
consumidor como JSON de confianza, y devuelve `selectModel(input)`. La separación
evita lecturas de archivos dentro del núcleo y no necesita modificar el requisito
Node >=20 para importar módulos JSON. No pasar esquemas recibidos de un encargo
o de una fuente no confiable: el esquema define la frontera de validación.

```js
import { createModelSelector } from "./src/model-selection.js";

// El consumidor proporciona estos cuatro documentos ya cargados en memoria.
const selectModel = createModelSelector(schema);
const result = selectModel({ request, catalog, policy });
```

Este fragmento documenta la API; no es un instalador ni un comando de terminal.
El esquema inválido impide inicializar la fábrica. Después de inicializarla,
una solicitud malformada devuelve un informe `invalid`, sin ejecutar nada.

No se leen archivos de proyectos, variables de autenticación, rutas locales,
credenciales o cuotas. No hay red, procesos, escrituras ni envío a proveedores.
Las importaciones normales de módulos de Node/AJV pertenecen a la carga del
programa, no al acceso al contexto privado de una tarea.

## Orden de la decisión

1. Copiar datos JSON acotados sin mutar las entradas; validar los tres documentos
   por su contrato específico, sin coerción o eliminación de propiedades.
2. Rechazar duplicados por identificador, referencias inexistentes, revisiones
   contradictorias, esfuerzos incompatibles y capacidades incoherentes.
3. Identificar información faltante. La omisión nunca se convierte en riesgo
   bajo, permiso de escritura, contador cero o acceso disponible.
4. Comprobar acciones declaradas, rol, categoría y presupuestos. Solo el rol
   ejecutor puede recomendarse para aplicación; necesita escritor autorizado.
5. Usar la ruta exacta de rol/proveedor/cliente y el modo/categoría permitidos.
6. Excluir perfiles no aprobados, no evaluados para el alcance, insuficientes en
   capacidades verificadas o sin disponibilidad declarada vigente.
7. Respetar la elección explícita admisible o escoger el `rank` menor; con
   empate comparar `profileId` por códigos, sin orden regional ni fecha de novedad.
8. Devolver decisión, motivos, descartes, límites y huellas; nunca ejecutarla.

Un catálogo puede incluir perfiles de otros clientes, pero no entran en la ruta
actual. El inventario de una solicitud corresponde a su cliente y proveedor;
una referencia cruzada se informa como dato contradictorio. La revisión de un
perfil no puede tener fecha posterior a `evaluationTime`.

Las capacidades verificadas deben estar declaradas también y no superar un
límite de contexto declarado conocido. `null` en contexto verificado no significa
capacidad ilimitada. La disponibilidad debe ser `available`, con antigüedad
entre cero y el máximo configurado inclusive, respecto al instante de entrada.

## Acciones mínimas declaradas

| Rol | Acciones mínimas |
| --- | --- |
| Coordinador | `read` |
| Revisor | `read`, `verify` |
| Tutor | `read`, `explain` |
| Proponente | `read`, `propose` |
| Ejecutor | `read`, `apply`, `verify` |

La categoría añade sus requisitos: tutoría necesita `explain`, propuesta
necesita `propose`, revisión necesita `verify` y aplicación necesita `apply` y
`verify`. Diagnóstico/documentación requieren `read`. El selector no añade
acciones que falten. En tutor se prohíbe `apply` y se mantiene escritor usuario;
en autónomo se comprueba que la aplicación tenga escritor autorizado.

Estas comprobaciones comparan datos declarados. **No demuestran autorización
humana ni sustituyen las restricciones del proyecto, del CLI o del sistema.**
El futuro receptor debe contrastar permiso, alcance y fuentes en un canal de
confianza antes de actuar. La recomendación no autoriza Git, PR, memoria,
despliegues, gastos o escritura fuera del alcance.

## Escalamiento y contadores

Una escalada por calidad necesita perfil anterior, criterios incumplidos y
referencias de evidencia. El perfil anterior debe estar en la misma ruta. Se
consideran solo prioridades con `rank` mayor que el anterior, que además cumplan
todos los requisitos actuales. Un empate no es escalamiento. La elección
explícita tampoco permite bajar o eludir esas reglas.

`rank` representa el orden aprobado para esa ruta, no una medida universal de
inteligencia. La evaluación de la política debe justificar que el siguiente
perfil sirve para corregir el fallo. El módulo verifica referencias y forma de
la evidencia; no abre ni autentica sus documentos ni garantiza que un perfil
más exigente resolverá el problema. La continuidad de rol/alcance entre entregas
se contrasta externamente: un identificador de perfil no demuestra esa historia.

Permisos, entorno, cuota, autenticación, base obsoleta o comprobaciones no
ejecutadas producen bloqueo, no cambio de proveedor o modelo por calidad.

Los contadores recibidos significan consumo **ya realizado** en toda la tarea.
La recomendación los conserva; no incrementa ni reinicia ninguno:

- En autónomo, dos rondas ya consumidas impiden otra recomendación de trabajo,
  incluso sin declarar escalada o cambiando revisión/modelo.
- En tutor ese techo no limita correcciones manuales ni convierte al agente en
  escritor; sí se conservan los presupuestos de futuras llamadas y tiempo.
- Ejecuciones o tiempo iguales o superiores al máximo bloquean la tarea.
- Perfil anterior o ronda autónoma sin ejecuciones previas es inconsistente.

Al no persistir historial, el núcleo **no detecta que otro sistema haya falseado
o reiniciado los valores**. El futuro coordinador debe contrastarlos con entregas
anteriores y registrar llamadas fallidas/auxiliares según su política. No se
afirma que esta base mida tokens o créditos de suscripciones.

## Informe de salida

| Campo | Significado |
| --- | --- |
| `state` | `recommended`, `needs-info`, `blocked` o `invalid` |
| `executed` | Siempre `false` |
| `identity` | Proyecto/tarea/revisión/rol/modo, solo si la solicitud es estructuralmente válida |
| `recommendation` | Perfil, modelo **solicitado**, esfuerzo explícito o `null`, prioridad y evidencia declarada |
| `constraints` | Alcance resumido y contadores/límites, sin ampliarlos |
| `missing` | Campos críticos ausentes, ordenados |
| `reasons` / `issues` | Códigos de decisión/rechazo, sin valores de entradas inválidas |
| `excluded` | Perfil y motivos de descarte; no es una nueva orden |
| `audit` | Versiones de catálogo/política y SHA-256 del esquema y de los tres documentos |
| `observedModels` | Lista vacía: no se ha ejecutado ningún modelo |
| `modelVerification` | `unknown`; seleccionar no prueba el modelo de una respuesta |
| `nextAction` | Acción manual para revisar, completar datos o resolver bloqueo |

Las huellas se calculan sobre JSON canónico: claves de objetos ordenadas,
arrays en su orden recibido. Son huellas del contenido estructurado, **no**
del archivo original ni firmas de autorización. Cambiar espacios en un archivo
JSON no cambia la huella del objeto; cambiar valores sí. El núcleo no lee bytes
de archivos para certificar una base Git.

No hay esquema de salida dedicado ni contrato de adaptadores todavía. El
informe de esta API está descrito aquí y cubierto por pruebas; integrar un
formato externo o comandos requiere una etapa posterior explícita.

La salida completa puede contener referencias privadas de una tarea. No se
imprime, guarda ni envía por defecto. El consumidor debe tratarla como privada,
sin asumir que un detector de patrones garantiza ausencia de datos sensibles.

## Límites de datos y errores

Se aceptan objetos/arrays JSON planos, números finitos y primitivas JSON, con
máximo de 30 000 valores, profundidad 64, arrays de 256 elementos y 2 000 000
unidades UTF-16 acumuladas en claves/texto. Superar un límite devuelve `invalid`
con `non-json-input`, sin coerción ni truncado. Estos límites globales se aplican
además de los límites individuales del esquema.

Se rechazan ciclos, getters, `toJSON` funcional, prototipos especiales, claves
peligrosas, arrays con huecos, símbolos y tipos no JSON. Esta validación no es
un sandbox para objetos JavaScript hostiles como Proxies; el consumidor debe
recibir documentos JSON parseados, no código ejecutable de un encargo.

Un error estructural no copia valores o nombres de campos desconocidos al
informe. Los hashes no equivalen a anonimización de datos; tampoco se genera
una explicación mediante una llamada a una IA.

## Evidencia de cierre de esta base

Comprobaciones realizadas el 2026-10-02:

- 106 pruebas nuevas del selector y 65 de contratos: 171 aprobadas.
- `npm test`: 494 pruebas aprobadas, cero fallos.
- Sintaxis: `node --check` en módulo y pruebas, sin errores.
- Cobertura del selector aislado: 100 % de líneas/funciones, 96,49 % de ramas.
  Es evidencia de ejecución de tests, no garantía de corrección absoluta.
- Inspección del flujo y prueba con operaciones de archivos/red/procesos,
  reloj actual y aleatoriedad bloqueadas, sin efectos durante inicialización
  y selección después de cargar los módulos.
- `git diff --check` sin errores; formato, 17 enlaces locales y patrones sensibles
  revisados en los cinco archivos de esta etapa, sin coincidencias. La revisión
  por patrones no es exhaustiva. La huella del README del piloto se conservó.

| Criterio | Evidencia en `test/model-selection.test.js` |
| --- | --- |
| CA-01 | Determinismo, entradas congeladas, salida independiente y prueba sin efectos |
| CA-02 | Perfil ligero, prioridad explícita, desempate y perfil fuera de ruta |
| CA-03 | Capacidades verificadas, contexto, categoría/rol/dificultad/riesgo exactos |
| CA-04 | Omisiones, listas vacías y ausencia de candidato sin default |
| CA-05 | Tutor/escritor/alcance conservados; acciones y ruta comprobadas |
| CA-06 | Calidad con evidencia declarada, otros fallos bloqueados y límites |
| CA-07 | Contadores conservados, rondas agotadas y elección explícita sin sustitución |
| CA-08 | Estados no aprobados, inventario desconocido/caducado/futuro |
| CA-09 | Versiones, huellas, `executed: false`, observación desconocida |
| CA-10 | Duplicados, referencias, esfuerzos, calendario y entradas no JSON |
| CA-11 | Modelos ficticios, cuatro estados, sin API keys o inferencias |

Revisión `quality-gate`: aprobado con observaciones para el núcleo recomendador.
Se verificó esta matriz sobre datos declarados de confianza, no sobre permisos
humanos autenticados, historial persistido o evaluación real de modelos. RF-05
sigue requiriendo metadata y adaptadores en una fase posterior.

La Skill `spec-driven-development` mantuvo fuera de alcance la ejecución y los
clientes; `quality-gate` guió la matriz, las comprobaciones y estas limitaciones.
No se modificó AVISENS, Obsidian, CLI instalados, plantillas o entregas privadas;
no se añadieron dependencias ni se hizo push. El commit local de esta entrega
fue autorizado después de la revisión.

## Siguiente etapa y reversión

El usuario aprobó la entrega y autorizó el commit local por rutas exactas.
La siguiente etapa propuesta es adaptar las plantillas con recomendación y
procedencia, sin alterar el piloto privado. Requiere autorización de esa etapa;
no hay push ni ejecución implícita.

Reversión: retirar únicamente módulo, pruebas y esta documentación de la etapa;
no resetear el repositorio, modificar memorias ni borrar entregas privadas.
