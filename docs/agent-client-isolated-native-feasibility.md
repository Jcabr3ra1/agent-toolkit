# IA-2-N0 — Viabilidad previa sin arrancar el cliente

## Estado y decisión

Consolidación documental autorizada el 2026-10-08 (America/Bogota): precisar
la parada, verificar esta nota con pruebas sintéticas, registrar evidencia
privada de entrega y crear un commit local de esta única ruta. No modifica
código ni ejecuta el inventario real; no incluye clientes, cuentas o push.
El cierre actual se registra al final, separado de la revisión histórica.

Preparado el 2026-10-05 (America/Bogota), tras «autorizo» al proponer definir
una comprobación viable con fuentes y efectos exactos. Profundidad SDD: rigurosa.
Se autoriza este diseño y su revisión, no lecturas privadas o ejecución nativa.

Resultado: **viable para un inventario local limitado, no suficiente para
admitir un arranque de Claude**. No se consultó la instalación para concluirlo;
es una decisión sobre el alcance del método, basada en código y fuentes oficiales.

El [planificador IA-2](agent-client-isolated-verification-plan.md) está implementado
offline y no autentica evidencia. No se propone otro evaluador genérico para
simular que el bloqueo de política efectiva quedó resuelto. El siguiente dato útil
debe proceder de una observación local autorizada con un resultado acotado.

## N0-01. Problema concreto

El arranque sigue pendiente porque falta evidencia suficiente de las fuentes
administradas y sus posibles efectos previos a la conversación. Configuración
personal observada, ayuda y referencias de prueba no resuelven esa condición.

El inventario propuesto solo responde si existen tres fuentes locales conocidas
y cuál es su tipo. No interpreta settings, decide precedencia, evalúa helpers,
comprueba autenticación o descarta políticas externas. Puede cerrar correctamente
manteniendo condiciones pendientes.

## N0-02. Fuentes exactas del primer inventario propuesto

Plataforma candidata de esta fase: macOS. No trasladar las rutas a otras
plataformas por heurística. Cada observación conserva fecha y alcance de sistema
local; no afirma compatibilidad de la documentación actual con una versión privada.

| ID no personal | Ruta literal | Observación permitida |
| --- | --- | --- |
| `system-managed-settings` | `/Library/Application Support/ClaudeCode/managed-settings.json` | Existencia y tipo, sin abrir el archivo |
| `system-managed-dropins` | `/Library/Application Support/ClaudeCode/managed-settings.d` | Existencia y tipo, sin enumerar entradas |
| `system-managed-mcp` | `/Library/Application Support/ClaudeCode/managed-mcp.json` | Existencia y tipo, sin abrir el archivo |

Las rutas de settings, drop-ins y MCP están documentadas para macOS.
[Fuentes administradas](https://code.claude.com/docs/en/managed-settings),
[MCP administrado](https://code.claude.com/docs/en/managed-mcp).

Se propone reutilizar [inspectPreflightMetadata](../src/client-native-preflight-files.js)
con la lista literal fijada desde código confiable. No hay argv de Claude,
callback del modelo, descubrimiento en PATH, entrada libre de rutas, glob,
lectura recursiva, readdir, readlink o resolución intencional de symlinks.
El helper existente no es un permiso: la llamada real requiere aprobar el alcance.

Ese helper revisa también los tres ancestros literales compartidos:
`/Library`, `/Library/Application Support` y `/Library/Application Support/ClaudeCode`.
Por tres destinos de cuatro componentes, el método requiere como máximo doce
llamadas `lstat`, sin contar una lectura de contenido. Un symlink, ancestro
no directorio o error impide tratar el destino como una fuente segura.

Proyección por ID: `file`, `directory`, `missing`, `unsafe` o `unknown`.
No imprimir UID, inode, tamaño, marcas de tiempo de archivos o errores crudos.
No guardar la estructura real de esa máquina en el repositorio genérico.

## N0-03. Qué evidencia aporta y qué no aporta

| Resultado local | Conclusión permitida | Lo que sigue pendiente |
| --- | --- | --- |
| Archivo de settings presente | Existe un candidato de política basada en archivo | Claves, helpers, precedencia y efecto de la política |
| Directorio de drop-ins presente | Existe una fuente que puede aportar fragmentos | Entradas y contenido; no inventariarlos automáticamente |
| Archivo MCP presente | Existe el candidato de configuración administrada MCP | Parseabilidad y compatibilidad; no probarlo arrancando el cliente |
| Destino ausente | Ese nombre no se encontró durante la observación | MDM, servidor, host y cambios posteriores |
| Tipo inesperado, enlace o error | No hay observación local suficiente/segura | Motivo categorizado; sin reparar o ampliar acceso |

No convertir `missing` en «sin política administrada», ni `file` en «política
activa», ni una configuración presente en fallo demostrado del cliente.
Son observaciones de estructura, no resultados `native-variant-tested`.
Tampoco se vuelcan a `locally-observed` de S3.2 para afirmar exclusión efectiva.

La fuente macOS MDM utiliza el dominio `com.anthropic.claudecode`; no se ha
identificado aquí una proyección suficiente y autorizada de su contenido efectivo.
No asumir una ruta plist única, listar perfiles globales o usar un volcado de
preferencias como atajo. [Política del sistema](https://code.claude.com/docs/en/managed-settings).

La documentación limita la disponibilidad de server-managed settings a planes
de organización y describe cache/fetch. La cuenta personal mencionada en una
conversación anterior no prueba la identidad o elegibilidad actual. No leer
cache, consultar cuenta, abrir consola o contactar un gateway en este inventario.
[Disponibilidad y entrega remota](https://code.claude.com/docs/en/server-managed-settings).

Un helper de política puede ejecutar un programa al arrancar para calcular
settings. Su presencia/contenido no se resuelve por el tipo del archivo;
esa incertidumbre no se investiga ejecutándolo.
[Helper de política](https://code.claude.com/docs/en/managed-settings#compute-the-policy-with-a-helper-program).

## N0-04. Efectos y presupuesto del lote local propuesto

| Recurso | Límite |
| --- | --- |
| Destinos de configuración | Tres rutas literales y los ancestros enumerados |
| Operaciones sobre esas fuentes | Hasta doce lstat; cero aperturas/lecturas de contenido |
| Enumeración y resolución | Cero readdir, glob, recursión, readlink o resolución de alias |
| Cliente Claude/otros clientes | Cero arranques, diagnósticos, cuentas, prompts o inferencias |
| Red solicitada por el recolector | Cero |
| Escrituras de evidencia | Ninguna; solo resultado categorizado en el chat actual |
| Reintentos, elevación o reparación | Cero; sin sudo, cambios de modo o ajustes de configuración |

No se prometen un snapshot atómico, contención frente a sustitución concurrente
de ancestros, ausencia de auditoría del SO o un plazo duro de cancelación para
lstat: el helper actual no ofrece esos contratos. Detecta enlaces observados,
pero la resolución de un ancestro cambiado entre llamadas podría seguir un
enlace: no presentar la comprobación como un sandbox basado en descriptores.
Esta limitación afecta la certeza/alcance de metadata nominal, no autoriza
lecturas de contenido. No usar el resultado como prueba de contención. Las fuentes
pueden cambiar después de observarlas; no reusar el resultado como autorización
de un arranque futuro. Los efectos del método no incluyen ejecución de código
del cliente, lectura de credenciales ni disparo intencional de hooks/MCP.

El helper recopila las categorías de los tres destinos aprobados. Un resultado
desconocido o inseguro corta el recorrido de componentes de ese destino, no
interrumpe globalmente la lista: puede consultar los otros destinos literales
ya autorizados, sin superar el techo de doce lstat. No ofrece aborto global
inmediato ante el primer resultado adverso.

Tras recopilar la lista, cualquier categoría desconocida, insegura o de tipo
inesperado cierra el lote sin ampliar alcance, repetirlo, buscar rutas alternativas
o iniciar otra fase. Una fuente presente se registra como tal, no se abre para
completar el diagnóstico. Si las tres faltan, registrar la ausencia local y los
pendientes externos; no continuar a auth status o inferencia.

## N0-05. Dependencias y salida útil

1. Aprobar una única inspección de esas rutas/ancestros, sin contenido o cliente.
2. Revisar el contrato existente con pruebas sintéticas pertinentes y ejecutar
   la llamada con targets fijados desde código confiable; no construir un módulo nuevo.
3. Informar las tres categorías y la condición concreta que sigue pendiente.
   Sin nuevo expediente privado, publicación, commit o push.
4. Decidir si hay una fuente adicional que realmente aporte el dato faltante.
   Cualquier lectura de contenido o consulta nativa necesitaría alcance propio.
   No producir automáticamente otra ronda de metadata de los mismos destinos.

La observación no requiere identidad del ejecutable, otra firma o repetir ayuda:
no pretende describir lo que leyó el cliente. Antes de cualquier prueba del
cliente sí habría que fijar identidad, configuración y efectos por separado.
No tratar el inventario como esa fijación.

Si no hay una fuente autorizable suficiente para MDM/remoto/helper, registrar
`not-observable-in-scope` y conservar el traspaso manual. Si se decide estudiar
una variante en otro entorno, definirla como candidata distinta; no copiar tokens,
cambiar HOME ni trasladar conclusiones a la sesión original.

## Alternativas descartadas para este lote

- Arrancar doctor/status/listado MCP para resolver retrospectivamente los efectos
  del arranque. La revisión de política ocurre antes, no después de esa ejecución.
- Invocar un SDK que resuelva settings completos y filtrar secretos al final.
  No está dentro de la lectura estructural autorizable propuesta.
- Reutilizar el scanner SC-1 pasando IDs nuevos: sus selectores están cerrados a
  dos fuentes y no incluyen política administrada. No cambiarlo para evitar
  una especificación de contenido/procedencia distinta.
- Presentar como prueba de contención una fixture, un evento ausente o un hash.
  IA-1/IA-2 mantienen sus contratos actuales y el resultado no-native-start.

## Criterios y revisión histórica

1. Tres destinos/ancestros exactos, sin cuerpos de configuración ni secretos.
2. Método existente y efectos observables identificados; ningún cliente requerido.
3. No confundir presencia/ausencia local con política efectiva o autenticación.
4. MDM/remoto/helper tienen pendiente explícito, no presunción de ausencia.
5. Límites de operaciones, salida, escritura y parada enumerados sin garantías ficticias.
6. Sin nuevos evaluadores, guards alterados, datos personales o permisos implícitos.
7. La ejecución futura se aprueba por el lote completo; este diseño no la ejecuta.
8. Enlaces/formato/preservación comprobados; conclusiones ligadas a fuentes y código.

Resultado de quality-gate: **Aprobado con observaciones para el diseño N0**.
La skill de especificación separó el lote local de un arranque nativo; la de
calidad explicitó el límite del helper frente a cambios concurrentes de ancestros.
Viabilidad limitada del inventario y admisión nativa todavía no observable son
decisiones distintas. No se ejecutó el inventario ni se leyeron fuentes privadas;
ningún resultado de instalación puede inferirse de este documento.

Comprobación documental del 2026-10-05 (America/Bogota):

- Tres pruebas existentes seleccionadas de metadata: **3/3**, 99 ms, sin
  fallos, canceladas, omitidas o pendientes. Solo fuentes/archivos ficticios de
  pruebas; no cliente o archivos de configuración del usuario.
- Comprobación adicional con lstat sustituido por un doble: tres targets,
  doce consultas máximas, proyección exclusivamente ID/tipo. Resultado sintético,
  no evidencia de existencia de las rutas reales.
- Dos documentos: 10 enlaces locales existentes, 10 tablas consistentes,
  formato correcto, `git diff --check` limpio e índice sin staging.
- Preservación SHA-256: 197 de 198 archivos previos intactos; solo el índice
  propio IA-2 actualizado, un documento nuevo y cero borrados. Sin cambios
  funcionales, por lo que no se repitió la regresión completa anterior.
- Escaneo limitado de patrones sensibles sin hallazgos; no certifica ausencia
  universal de secretos. Fuentes oficiales consultadas, sin datos de cuentas.

| Criterio | Evidencia de diseño/comprobación |
| --- | --- |
| 1 | Tres rutas y ancestros literales, tipos categorizados y cero contenido |
| 2 | Helper inspeccionado, tres pruebas existentes y doble de doce consultas |
| 3 | Conclusiones por tipo limitadas a estructura, sin atribuir precedencia/efectividad |
| 4 | Fuentes MDM/remota/helper identificadas y todavía pendientes |
| 5 | Techo de operaciones y límites reales de atomicidad/cancelación explicitados |
| 6 | Código/guards intactos; sin nuevo evaluador o datos personales |
| 7 | Solo diseño; inspección real requiere autorización de las rutas enumeradas |
| 8 | Enlaces/tablas/formato, fuentes, huellas e índice comprobados |

Sin configuración/evidencia privada, clientes, cuentas, inferencia, cambios a
proyectos/Obsidian, automatizaciones, material privado persistente, commit o push.
En ese cierre quedaba pendiente aprobar el lote N0. Recibió autorización
posterior y se cerró con su resultado exclusivamente en el chat, sin trasladar
datos reales a este repositorio. No se repite ese inventario.
El borrador local N1, `docs/agent-client-managed-preferences-plan.md`, separa
presencia/tipo y carácter forzado de claves concretas. No se incorpora a esta
entrega versionada; conserva su condición de privacidad y autorización propias,
sin habilitar un arranque de Claude.

## Consolidación documental local N0 — 2026-10-08

Esta revisión alinea la descripción con el helper existente. Su alcance es
documental: no cambia el código, crea un evaluador o repite el inventario real.
La evidencia privada de entrega y el commit local tienen permiso propio;
no forman parte de las escrituras permitidas en un futuro lote de inventario.

| Comprobación | Resultado observado |
| --- | --- |
| Pruebas existentes de metadatos/inventario seleccionadas | 4/4; salida 0; 113,368584 ms |
| Dobles lstat de los tres destinos | Dos escenarios; doce consultas cada uno; solo ID/tipo |
| Primer destino desconocido en el doble | Se conservó unknown y se visitaron los otros dos destinos previstos |
| Consultas reales a las rutas /Library en esos dobles | Cero |
| Código funcional y contratos | Sin modificaciones |
| Regresión completa | No repetida: entrega exclusivamente documental |

Las cuatro pruebas existentes usan archivos ficticios temporales o callbacks
sustituidos; no observan la configuración real del usuario. Los dos escenarios
adicionales sustituyen completamente lstat: sus categorías no describen esta
máquina. La selección incluye rechazo de raíces y de IDs con coerción.

| Criterio N0 | Evidencia y límite del cierre actual |
| --- | --- |
| 1: destinos exactos | Lista pública literal de tres destinos/ancestros contrastada con doble, sin consultas reales de esas rutas |
| 2: método existente | Helper versionado inspeccionado y cuatro pruebas propias seleccionadas; sin módulo nuevo o cliente |
| 3: conclusiones limitadas | Las categorías solo describen estructura nominal, nunca política efectiva, login o exclusión de efectos |
| 4: pendientes externos | MDM/remoto/helper siguen pendientes; no se consultaron fuentes privadas para resolverlos |
| 5: presupuesto y parada | Doce lstat máximos en los escenarios; colección de destinos seguida de cierre sin otras fases, no aborto global inmediato ni cancelación dura |
| 6: preservación | Código y guards intactos; sin datos de instalación reales o permisos implícitos |
| 7: autoridad separada | Cierre documental autorizado; inventario real y N1 no ejecutados ni renovados |
| 8: entrega | Enlaces, tablas, formato, escaneo limitado, huellas y alcance de un único documento comprobados |

Resultado de quality-gate: **Aprobado con observaciones para consolidación
documental del diseño N0**. La precisión no refuerza contención o permisos
del helper: solo evita prometer una parada global que no implementa.
La admisión nativa sigue pendiente y los resultados sintéticos no acreditan
la existencia, ausencia o configuración efectiva de las fuentes reales.

No se repitió la regresión completa porque no se modificó código funcional.
Los resultados previos de código conservan fecha y alcance propios. Las
fuentes externas también conservan su fecha histórica; no se consultaron de
nuevo para este cierre y no prueban compatibilidad con una versión instalada.

Sin inventario real, contenido de configuración, expedientes privados de
instalación, clientes, cuentas, prompts, cambios de configuración, proyectos,
Obsidian, automatizaciones, catálogos de modelos o push. El inventario conserva
límites cooperativos y no atómicos; no se promete cancelación dura de lstat.
