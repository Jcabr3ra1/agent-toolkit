# Aprobaciones declaradas por encargo (RA-A)

Núcleo puro que calcula, a partir de un historial explícito, qué aprobaciones **declaradas** siguen en pie para un encargo.
No guarda nada, no pregunta a nadie, no ejecuta nada y **no concede permisos**.

## Qué es y qué no es

- Es un reducer determinista sobre datos: valida el historial completo, propone el siguiente evento y responde si una consulta coincide con lo declarado.
- No autentica a la persona que aprobó: `responseRef`, `decisionRef` y los hashes identifican contenido, no autoría.
- No sustituye la admisión nativa, los permisos del cliente ni el sistema operativo.
- Todo informe lleva `authorityVerified:false`, `executionAuthorized:false`, `persisted:false` y `nativeExecuted:false`. El estado `covered` no existe en este módulo: la coincidencia se llama `declared-covered`.
- Los efectos expresables son `workspace-write`, `test-execution`, `client-start` e `inference`. Git, memoria, publicación y gasto no se pueden expresar en esta versión; el módulo no afirma que los cubra en el futuro.

## Entradas

Todas llevan `schemaVersion: "1.0.0"`, un `history` (`projectId`, `taskId`, `events[]`, máximo 256) y un `checkpoint` explícito `{revision, historySha256}`.
Cada API acepta un envelope exacto: `replay` (`history`, `checkpoint`), `propose` (más `event`) y `cover` (más `now` y `query`). No se aceptan campos de otra API.
El `historySha256` se calcula con `approvalHash(history)`. Ese helper solo admite JSON inerte acotado (sin getters, proxies, ciclos ni funciones) y lanza `ParseFailure` en otro caso.
Una discrepancia del checkpoint bloquea; el módulo no puede saber si el checkpoint es auténtico ni el último.
Los instantes son cadenas UTC (`2026-10-18T14:00:00Z`); el módulo nunca lee el reloj.
Para texto o bytes usa `parseApprovalInput`, que limita el tamaño y rechaza claves duplicadas, UTF-8 inválido y claves peligrosas.
El límite efectivo de un historial grande lo marca `copyInertJson` (30 000 nodos): si se supera, el resultado es `invalid` con `metadata-limit`.

## Eventos

| Evento | Función |
| --- | --- |
| `request` | Ámbito (`scope`), artefacto inicial y base esperada con sus transiciones previstas. |
| `decision` | Aprobar o denegar, ligada al hash de la solicitud. Solo una por solicitud. |
| `correction` | Nueva revisión del artefacto, con huella y revisión nuevas, mismo ámbito y dentro de `maxCorrections`. |
| `reserve` / `start` / `result` | Una operación lógica: reserva (ocupa un uso), inicio y resultado. |
| `interrupt` / `reconcile` | Operación indeterminada y su conciliación declarada. |
| `revoke` / `close` | Cierres terminales. No borran consumos. |

### Coherencia acción / efecto / comprobación

`workspace-write` debe estar si y solo si alguna ruta tiene una acción distinta de `read`; `test-execution`, si y solo si hay comprobaciones. Se exige en el ámbito, en cada `reserve` y en cada consulta. Nunca se añaden efectos omitidos: una combinación incoherente es `invalid`.

### Identidad del trabajo

Para distinguir un trabajo nuevo de una repetición o un reintento, el módulo usa las rutas y acciones, las comprobaciones y los efectos (sin orden) y la huella del artefacto. No importan los identificadores, el orden de los arrays ni la base. Una corrección con huella nueva es trabajo nuevo y consume `maxOperations`; no es un reintento. Una operación ya terminada con el mismo trabajo no se vuelve a cubrir.

### Conciliación

- Una operación sin `start`, sin resultado o con un timeout sigue **indeterminada** y conserva su uso. Esas situaciones no tienen forma de evidencia en el contrato.
- Liberar un uso exige `not-started-confirmed`, con evidencia `non-start-confirmed` que incluya la huella de base inspeccionada (igual a la esperada), ligada a la reserva, al evento previo y al estado previo, y con una `decisionRef` de uso único. La operación pasa a `released-declared`.
- RA-A no autentica esa evidencia: quién puede emitirla y cómo se verifica son decisiones del host (RA-C).

## Restricción contable (R1)

Hasta disponer de un contexto contable completo, un historial admite una solicitud nueva solo si todas las anteriores no consumieron nada: están denegadas, o están revocadas o cerradas sin operaciones ni correcciones. Cualquier otra solicitud (solapada, de otro destinatario o tras consumo, incluida una renovación) se bloquea con `accounting-context-required`.
Esto impide reiniciar el cupo **dentro de un historial**. No impide que el host presente otro historial vacío para el mismo encargo: eso exige un ancla externa (RA-C). Un flujo con varios roles necesita, por ahora, un historial por rol.

## `mode` y roles

`recipient.client`, `recipient.role` y `recipient.mode` son etiquetas declaradas que se comparan exactamente. El módulo no mapea ni verifica modos (por ejemplo, tutor o autónomo) ni afirma soporte de ninguno.

## Operaciones

- `replay(input)`: valida todo el historial y devuelve un resumen cerrado por solicitud.
- `propose(input)`: valida un evento nuevo contra el historial y devuelve la transición (`proposed`, `noop` o `blocked`). No guarda nada.
- `cover(input)`: responde `declared-covered`, `approval-needed`, `blocked`, `reconciliation-required` o `invalid`. Con `operationId` consulta una operación ya reservada y no consume otro uso.

El informe es un contrato cerrado: `view`, sus estructuras anidadas y `proposal.event` no admiten propiedades desconocidas, y el estado impone qué campos están presentes.

## Hechos que contradicen el historial

Un `start` posterior a una revocación, un cierre o la caducidad hace que el historial sea inconsistente y se rechaza. RA-A no sustituye ese hecho por otro: el host debe conservar la observación real y conciliarla fuera de este módulo.

## Límites

No incluye persistencia, exclusión entre procesos, reinicio durable, ancla del último estado, resolución de procedencia humana, emisión de permisos C2, verificación de rutas físicas ni integración con clientes.
No debe anunciarse que el coordinador "deja de preguntar" hasta que esas piezas existan y se verifiquen.
