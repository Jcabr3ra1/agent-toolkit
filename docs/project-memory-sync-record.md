# Project Memory Sync Record

## Estado

- Especificación aprobada; base implementada y verificada localmente.
- Fecha: 2026-10-01.
- Profundidad: rigurosa; es la primera operación de `sync` que escribe datos.
- Alcance: registrar una revisión terminada en el Markdown de una memoria.
- Dependencias: [sync plan](project-memory-sync.md),
  [sync inspect](project-memory-sync-inspect.md) y
  [diagnóstico de la memoria](project-memory-doctor.md).

El usuario aprobó el contrato y autorizó implementar y probar la base en
Agent-Toolkit. El comando está disponible en esta revisión local; su ejecución
sobre una memoria real requiere autorización específica. No se registraron PR
reales ni se modificó AVISENS. El usuario aprobó también la entrega y autorizó
su commit local. La publicación en GitHub requiere autorización separada.

## Problema

Después de revisar un cambio integrado, hay que dejar constancia de la revisión
para que otro agente no repita el trabajo. Actualmente `sync plan` consulta
el registro y `sync inspect` reúne evidencia, pero ninguno añade filas.

El registro manual puede duplicar PR, marcar trabajo incompleto como revisado
o modificar accidentalmente otras notas. Hace falta una operación pequeña,
visible desde Obsidian y limitada a registrar una conclusión ya revisada.

## Objetivo y fuera de alcance

Añadir una sola fila de revisión, con vista previa predeterminada, validación
de la fuente, aplicación explícita e idempotencia: repetir exactamente el
mismo registro no vuelve a escribir ni duplica la fila.

Esta entrega no redacta ni modifica las notas técnicas. Tampoco crea commits,
agrega archivos a Git, hace push, fusiona PR, programa tareas, ejecuta modelos
de IA ni instala configuraciones. No implementa permisos permanentes ni el
modo autónomo. El código del repositorio fuente no se modifica.

## Punto de partida antes de esta entrega

- La tabla Markdown es el estado canónico de cambios revisados.
- `readReviewedPullRequests` acepta el encabezado canónico y uno legado.
- `sync plan` considera revisado un enlace válido con estado `Revisado`.
- `sync inspect` consulta un PR explícito, sus archivos y comprobaciones.
- Su estado `ready` no demuestra una revisión semántica ni aprueba el código.
- El manifiesto declara repositorio, rama de revisión, bóveda y política.
- Había 101 pruebas existentes; ninguna verificaba `sync record`.

## Interfaz implementada

```text
project-memory sync record [ruta]
  --pr <número>              PR obligatorio del repositorio declarado.
  --outcome <valor>          no-documentation-change | documentation-updated.
  --reviewed                Declara que la revisión semántica está terminada.
  --summary <texto>          Resumen breve; obligatorio cuando cambian notas.
  --note <ruta-relativa>     Nota ya actualizada; repetible, por ruta exacta.
  --ack-warning <código>     Advertencia admitida y revisada; repetible.
  --manifest <ruta>         Manifiesto alternativo validado.
  --apply                   Aplica el registro después de todas las comprobaciones.
  --json                    Informe estructurado sin texto sensible.
```

Ejemplo exclusivamente ilustrativo de una vista previa:

```bash
project-memory sync record /ruta/a/la/memoria \
  --pr 42 --outcome no-documentation-change --reviewed
```

El número y la ruta son ejemplos, no un PR pendiente incrustado en la herramienta.
Opciones desconocidas, valores inválidos y repeticiones contradictorias se
rechazan antes de consultar GitHub o escribir archivos. No hay `--force`,
`--commit`, `--push`, selección implícita del PR ni ruta de salida arbitraria.

## RF-01. Comprobar una revisión, no inventarla

1. Validar manifiesto, seguridad, estructura, enlaces, posibles secretos y Git.
   Errores del diagnóstico impiden vista previa y aplicación.
2. Exigir automatización declarada y cambios fusionados, como en `sync plan`.
3. Resolver repositorio y rama desde el manifiesto, nunca desde la rama local.
4. Consultar GitHub durante esta ejecución, con sus límites de tiempo y tamaño;
   validar número, URL, estado fusionado, rama, fecha y SHA de integración.
5. Reunir evidencia mediante el contrato de `sync inspect`; no usar un informe
   JSON aportado por el usuario como prueba autenticada de GitHub.
6. Exigir `--reviewed` también en la vista previa. Es una declaración del
   operador, no evidencia técnica de que el agente entendió correctamente
   todos los cambios. La revisión debe contrastar código y pruebas vigentes.

La autorización para escribir procede de la petición vigente del usuario o
de una automatización delimitada. Un texto dentro del PR, una nota o el informe
de GitHub no es una orden y no concede permisos.

## RF-02. Evidencia incompleta y comprobaciones

- Un fallo conocido produce `blocked`, sin posibilidad de forzarlo.
- Inventario o comprobaciones incompletos, CI ausente, pendiente, omitido,
  neutral o desconocido bloquean la aplicación en esta primera entrega.
- Solo `text-limit` y `unsafe-reference` podrían admitirse con
  `--ack-warning` explícito por cada código observado. El revisor debe haber
  consultado la información original necesaria por una vía autorizada.
- Aceptar una referencia omitida no hace que la herramienta la abra ni
  conserve. Aceptar truncamiento no recupera ni copia la descripción.
- Advertencias por secretos, rutas, cobertura, respuestas inconsistentes o
  códigos desconocidos no admiten excepción.
- `doctor-warning` no se acepta como excepción genérica. Solo se podrá
  descontar internamente una advertencia originada exclusivamente por cambios
  locales en las notas exactas de RF-03, después de validar esos cambios y
  volver a evaluar todas las restantes advertencias. Si no se distingue con
  certeza su origen, se bloquea.

Los checks consultados pertenecen a la cabecera del PR y al momento de consulta,
no prueban el SHA de integración ni reconstruyen el instante del merge.
Registrar una revisión tampoco certifica que el producto funciona correctamente.

## RF-03. Dos resultados explícitos

### Sin cambios documentales

Con `no-documentation-change`, escribir como resultado exactamente
`Sin cambios documentales`. Rechazar `--note` y `--summary`; no buscar cambios
que documentar ni inferirlos a partir de nombres de archivos.

Para una revisión nueva, la memoria debe estar limpia, salvo artefactos
ignorados habituales que no participen en la operación. El ledger debe estar
versionado y coincidir con HEAD y staging. La repetición sin commit admite solo
la fila propia exacta descrita en RF-05, no otras ediciones del registro.

### Notas actualizadas

Con `documentation-updated`, exigir un resumen de 1–300 caracteres y al menos
una `--note` Markdown. Las notas ya deben haber sido editadas y verificadas
por el operador autorizado; `record` no las escribe.

- Aceptar únicamente rutas relativas exactas dentro de la bóveda, sin
  retrocesos, glob, directorios, enlaces simbólicos ni componentes enlazados.
- Excluir el ledger, manifiestos, `.git`, `.obsidian`, Skills, configuraciones,
  rutas de credenciales y cualquier archivo que no sea Markdown regular.
- Admitir notas modificadas o nuevas en la estructura permitida; no borrados,
  renombrados, submódulos, conflictos ni archivos ausentes.
- Cada nota declarada debe tener un cambio real o ser nueva; no basta con
  enumerar una ruta para afirmar que fue actualizada.
- Todo cambio local versionable de la memoria debe corresponder exactamente
  a esas notas. Un archivo ajeno, aunque no esté en staging, bloquea el registro.
- Revisar notas y diff con controles de formato, enlaces y patrones sensibles;
  esos controles no sustituyen la revisión del significado ni detectan todos
  los secretos posibles.
- Revisar tanto el archivo actual como el contenido preparado para commit:
  una nota staged debe ser un Markdown regular, sin conflictos ni texto UTF-8
  inválido. No basta con que la versión visible en Obsidian sea correcta.

Las rutas se deduplican y ordenan para comparar resultados de forma estable.
La celda de resultado usa exactamente `resumen; Notas: ruta1, ruta2`.
La bóveda debe tener su propio repositorio Git; `assume-unchanged` y
`skip-worktree` impiden afirmar limpieza y bloquean el registro.

No tocar cambios del repositorio fuente. Se consulta la evidencia remota;
la suciedad de un checkout fuente no autoriza a repararlo ni se confunde con
la evidencia del PR integrado. Si se usa ese checkout en la revisión humana,
el revisor debe comprobar que lee la versión pertinente.

## RF-04. Preservar y validar la tabla

Mantener frontmatter, encabezados, comentarios, otras secciones, orden de filas
y saltos de línea existentes. Añadir la fila al final de la única tabla válida
del registro, sin reordenar o normalizar el documento completo.

A diferencia del lector tolerante de `plan`, la escritura exige exactamente
cinco columnas y una tabla no ambigua. Admitir los dos encabezados existentes
sin convertir uno al otro. Filas malformadas, duplicadas o referencias a otro
repositorio impiden aplicar: no se reparan silenciosamente.

No se toman tablas ilustrativas dentro de código, frontmatter o comentarios
HTML como registros. Se preserva el BOM UTF-8 cuando existe. Los saltos de
línea deben ser uniformes: LF o CRLF; mezclarlos requiere corregir el archivo
antes de registrar. Un documento no cerrado o incompatible no se normaliza.

La fila guarda:

- enlace canónico al PR fusionado;
- estado `Revisado`;
- fecha UTC generada por la herramienta;
- resultado validado; en `documentation-updated`, resumen y rutas de las notas;
- `—` en `Commit de memoria`.

No inventar el hash del futuro commit que incluirá la fila. El informe devuelve
el SHA de integración como evidencia de la fuente, no como commit de la bóveda.
Relacionar el registro con commits existentes o añadir otra columna requerirá
una especificación posterior, no cambiar el formato en esta entrega.

Rechazar texto o rutas con `|`, saltos de línea, controles, backticks o sintaxis
que pueda romper una celda, crear enlaces arbitrarios o ocultar contenido.
No insertar títulos, descripciones, logs o instrucciones del PR en la tabla.

## RF-05. Idempotencia y discrepancias

- Si ya hay una fila revisada con el mismo resultado normalizado y las mismas
  notas, devolver `unchanged`, conservando la fecha y contenido originales.
- Si la fila existente declara otro resultado o notas distintas, devolver
  `conflict`. No sobrescribir, anexar una segunda revisión ni corregir el historial.
- Una fila ambigua o incompleta del PR solicitado exige intervención humana.
- Un registro legado válido sigue siendo reconocible por `sync plan`.

Para `unchanged`, comprobar identidad remota, integridad del ledger y ausencia
de cambios ajenos. No exigir que las notas de una fila ya registrada sigan
modificadas hoy: pueden haberse guardado en un commit. No revalidar retrospectivamente
un resultado semántico como si se estuviera realizando una revisión nueva.

Si se repite `--apply` antes del commit, se admite que el ledger esté modificado
únicamente por la fila exacta que esta operación habría añadido al HEAD limpio.
Su versión staged debe coincidir con HEAD o con ese mismo resultado completo;
un cambio ajeno preparado para commit también bloquea. Después del commit, la
fila revisada conserva su fecha aunque las notas ya estén limpias.

## RF-06. Escribir sin sobrescribir trabajo concurrente

La vista previa no escribe nada: ni temporales, bloqueos, índices ni caches.
Usar Git con `--no-optional-locks` durante las inspecciones y desactivar
`core.fsmonitor` solo para esas invocaciones, sin cambiar la configuración local.

Con `--apply`, crear un bloqueo exclusivo de esta operación junto al registro.
Otro bloqueo detiene la escritura; no borrar uno antiguo automáticamente.
Rechazar symlinks o rutas que escapen a la bóveda antes y durante la aplicación.

Tomar hashes del ledger, manifiesto, notas declaradas y estado/index de Git;
volver a comprobarlos bajo el bloqueo. Un cambio invalida el plan completo.
Escribir la propuesta en un temporal exclusivo del mismo directorio, conservar
permisos del archivo original y sustituirlo mediante renombrado atómico.
Limpiar únicamente artefactos creados por esta ejecución.

El protocolo coordina instancias de `record`; no bloquea a Obsidian o a otro
editor que ignore el bloqueo. No se prometerá ausencia absoluta de carreras
con procesos externos: el operador debe evitar editar o sincronizar la memoria
durante la aplicación. Esta limitación debe figurar en ayuda y resultados.

En un error previo al reemplazo, el ledger original queda intacto. Después
del reemplazo, un fallo de limpieza se informa distinguiendo que el registro
ya fue aplicado; no se afirma falsamente que no se escribió nada.
No se hacen reversiones automáticas que pudieran borrar una edición posterior.

## Estados, salida y límites

| Estado | Significado | Salida |
| --- | --- | --- |
| `preview` | Plan válido sin escritura | 0 |
| `recorded` | Se añadió una fila | 0 |
| `unchanged` | Ya existe el mismo registro | 0 |
| `blocked` | Revisión o evidencia no apta | 1 |
| `conflict` | Datos, tabla o archivos incompatibles | 1 |
| `error` | No se pudo completar la operación | 1 |

Entradas inválidas producen código 2. La salida JSON declara comando, estado,
repositorio, rama, PR, SHA de integración, ruta del ledger, resultado, notas,
advertencias admitidas y si hubo escritura. No imprime credenciales, stderr
original del proveedor, cuerpos de notas o diffs completos.

Límites implementados: ledger y manifiesto 1 MiB cada uno, 20 notas por registro,
1 MiB por nota y 5 MiB de notas en total. Índice y respuestas locales de Git:
5 MiB; cada invocación de Git tiene 10 segundos de límite. La inspección remota
usa los presupuestos existentes de `inspect`, con inventario de hasta 1000
archivos. Un límite excedido bloquea: no truncar un archivo antes de validarlo
o sobrescribirlo. El filtro de secretos se aplica a toda la información leída
dentro de esos límites, incluido el contenido staged de las notas.

## Diseño implementado

1. Separar lectura estricta y representación de filas del ledger, manteniendo
   compatibilidad del lector actual. Probar encabezados y tablas ambiguas.
2. Preparar un plan normalizado con evidencia remota fresca, resultado y
   notas validadas. Separar validación del plan y escritura.
3. Incorporar la vista previa a CLI y salida humana/JSON sin cambios funcionales
   en `plan`, `inspect`, manifiestos ni conexiones.
4. Implementar aplicación con bloqueo, hashes, temporal y reemplazo; probar
   límites, fallos de disco y concurrencia sin usar memorias reales.
5. Revisar todas las pruebas anteriores y nuevas, documentación y diff.
   No registrar un PR real como prueba sin autorización separada.

Componentes: `src/sync-record.js` prepara y aplica; `src/sync-ledger.js` valida
y representa la tabla; `src/cli.js` expone opciones e informes;
`test/sync-record.test.js` verifica el contrato. Un ajuste acotado de
`src/doctor.js` desactiva fsmonitor en las consultas diagnósticas. No se cambian
el esquema, las conexiones ni las semánticas de `sync plan` y `sync inspect`.

## Criterios de aceptación

- CA-01: Un PR fusionado de la rama declarada puede producir una vista previa;
  PR abierto, otra rama, identidad inválida o GitHub indisponible no escriben.
- CA-02: Sin `--apply`, snapshots completos antes/después de memoria, fuente,
  índice y configuración son iguales, también en error.
- CA-03: `--apply` solo añade la fila y limpia sus propios temporales; no edita
  notas, Skills, manifiesto, fuente, índice ni remotos.
- CA-04: Aplicar dos veces el mismo resultado no duplica ni cambia la fecha;
  discrepancias y tablas malformadas conservan bytes originales.
- CA-05: Fallos o cobertura incompleta bloquean; únicamente las excepciones
  documentadas y explícitas permiten una revisión nueva.
- CA-06: Ambos resultados cumplen sus requisitos; notas ajenas, glob,
  symlinks, archivos prohibidos o resumen inseguro bloquean sin filtraciones.
- CA-07: Se conservan LF/CRLF, frontmatter y texto externo a la tabla; ambos
  encabezados siguen siendo interpretables por `sync plan`.
- CA-08: Un segundo escritor, cambio de hash, cambio de manifiesto, disco lleno
  o fallo de renombrado no sobrescriben el ledger en el caso comprobado.
- CA-09: CLI, JSON y códigos distinguen aplicación, no-op, conflicto y error;
  una escritura aplicada con error posterior se informa como tal.
- CA-10: La suite existente sigue pasando; pruebas usan repositorios temporales
  y proveedor simulado, nunca datos o credenciales de proyectos reales.

## Riesgos y alternativas

Una declaración de revisión puede ser falsa: ninguna casilla ni CLI demuestra
comprensión semántica. Mantener el operador responsable y la evidencia trazable.
El bloqueo propio no controla otros editores: evitar edición concurrente y
explicar el límite. Los patrones de secretos no equivalen a prevención total.

Alternativas descartadas para esta etapa: JSON oculto paralelo, marcar como
revisado solo por tener CI verde, actualización autónoma de notas, `--force`
y commit/push incluido en el registro. Amplían responsabilidades y riesgos.

Reversión: antes de aplicar no hay nada que revertir. Después, revisar el diff
y restaurar únicamente la fila de esta operación con autorización y control
de cambios posteriores; nunca resetear la bóveda completa.

## Evidencia local y revisión de calidad

Verificación del 1 de octubre de 2026: `npm test`, con 213 pruebas aprobadas,
0 fallos y 0 omitidas. Incluye las 101 pruebas anteriores y 112 pruebas nuevas
de `sync record`. Todas las bóvedas y repositorios usados por esta entrega son
temporales; la evidencia de GitHub es simulada. Una prueba integra el diagnóstico
real con vista previa y aplicación en una memoria temporal.

| Criterio | Evidencia en `test/sync-record.test.js` |
| --- | --- |
| CA-01 | PR fusionado, abierto, identidad incorrecta, rama distinta y proveedor no disponible |
| CA-02 | Snapshots de bytes y permisos en memoria, fuente, índice y configuración; también ante entradas y fallos |
| CA-03 | Diferencia limitada al ledger; conservación de notas y staging; limpieza propia |
| CA-04 | Repetición antes/después de commit, fecha preservada, conflictos y tablas inválidas |
| CA-05 | CI adverso, pendiente, ausente y cobertura incompleta; excepciones explícitas acotadas |
| CA-06 | Notas exactas, cambios ajenos, rutas prohibidas, symlinks, límites, secretos y staging |
| CA-07 | Encabezados canónico/legado, LF/CRLF, frontmatter, BOM y lectura mediante `plan` |
| CA-08 | Bloqueo existente incluso ignorado por Git, cambios concurrentes y fallos simulados de escritura/rename |
| CA-09 | CLI, JSON, códigos y distinción de escritura aplicada con error posterior |
| CA-10 | Suite anterior sin regresiones y pruebas nuevas aisladas de proyectos reales |

Resultado de revisión: aprobado con observaciones. No se ha probado esta
operación con un PR real, en Windows ni ante pérdida de energía. Los fallos de
disco se simulan; no equivalen a probar todos los errores de cada sistema de
archivos. Se preservan los bits de permisos comprobados, no se promete copiar
ACL o atributos extendidos. El bloqueo coordina esta operación, no editores
externos. Los filtros no garantizan detectar todo dato sensible.

La entrega está aprobada para su commit local; no se publica en esta etapa.
Tampoco se aplicó `record` sobre AVISENS o sobre otra memoria real. La
publicación, la adopción real y la automatización son etapas separadas.

La primera base se propone conservadora: sin CI comprobable o cobertura
completa no cierra automáticamente la revisión. Otros proveedores, políticas
sin CI y formatos de registro adicionales necesitan decisiones posteriores.
