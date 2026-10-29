# C3.1c — Procedencia y viabilidad del primer cliente

## Estado y objetivo

Actualización de cierre: P-01–P-04 fueron autorizados y ejecutados. La revisión
privada obtuvo firma local satisfactoria y continuidad del artefacto, sin
arranque del cliente. No completó versión efectiva, procedencia independiente,
controles o consumo. La continuación es el diseño de una
[ruta supervisada separada](agent-client-supervised-subscription.md), no otra
comprobación repetida de identidad ni un permiso de ejecución automática.
El resto conserva la especificación original; las autorizaciones pendientes
descritas abajo corresponden al estado previo a ese cierre.

Especificación preparada el 2026-10-04 (America/Bogota) tras «listo».
Profundidad SDD: rigurosa. La preparación original solo produjo documentación;
no ejecutó las comprobaciones propuestas ni amplió el permiso del lote anterior.
La ejecución posterior cerrada se distingue en el resumen inicial.

C3.1b terminó como identificación parcial de un artefacto estable. La huella
no acredita procedencia oficial, versión efectiva o controles de arranque.
La evidencia personal permanece exclusivamente fuera del repositorio.

Objetivo: contrastar la firma local del candidato Claude Code y determinar
si merece preparar un piloto posterior. No producir más evidencia de identidad
cuando el impedimento real sea un control incompatible con el cliente.

Referencias: [primer lote](agent-client-native-inspection-plan.md),
[expediente offline](agent-client-native-evaluation.md) y
[contrato de ejecución](agent-client-runtime.md).

## Alcance del lote que se propone autorizar

Un lote completo, sin preguntas entre operaciones normales:

1. Revalidar el mismo candidato: enlace, propietario, tipo y huella. Si cambió
   desde la observación privada, detener; no adoptar una actualización en silencio.
2. Examinar firma y metadatos con la herramienta del sistema macOS
   `/usr/bin/codesign`, sin ejecutar el artefacto de Claude.
3. Contrastar la información obtenida con documentación oficial disponible.
   Una firma válida y el nombre declarado del firmante no bastan para establecer
   por sí solos una identidad oficial autenticada.
4. Registrar alcance, discrepancias, limitaciones y conclusión en un nuevo lote
   privado; conservar intacta la evidencia anterior.
5. Cerrar con una decisión: preparar otra prueba acotada o mantener traspaso
   manual. No conceder permisos de ejecución como efecto del informe.

Quedan excluidos Claude incluso con `--version`/`--help`, cuentas, keychain,
configuración global/proyecto/administrada, secretos, inferencia, actualizaciones,
descargas, cambios en proyectos/Obsidian, automatizaciones, commit y push.
Tampoco instalar GPG, importar certificados o cambiar confianza/quarantine.

## Diseño de comprobaciones locales

| Paso | Operación prevista | Qué aporta y qué no |
| --- | --- | --- |
| P-01 | Revalidación acotada del enlace y huella del candidato anterior | Continuidad del artefacto, no autenticidad del proveedor |
| P-02 | `codesign --verify --strict --verbose=2` sobre su ruta exacta | Resultado local de integridad de firma; no versión efectiva ni seguridad de arranque |
| P-03 | `codesign --display --verbose=4` sobre la misma ruta | Identificador, autoridades, TeamIdentifier y metadatos disponibles; no volcados de certificados |
| P-04 | Revisar las observaciones antes/después y redactar el resultado privado | No elevar controles a `locally-tested` por firma o documentación |

Los comandos son especificaciones, no recetas ya autorizadas. La ruta se toma
del lote privado aprobado, nunca de texto producido por el cliente. Resolver
solo ese candidato; sin búsqueda de otras versiones, clientes o paquetes.
Si el firmante, identificador o TeamIdentifier no pueden vincularse de forma
suficiente a una referencia confiable, registrar procedencia pendiente.
El resultado de `codesign` no acredita notarización vigente ni verificación
del manifiesto firmado de la release. No ejecutar `spctl` ni consultar servicios
de Apple o Anthropic en este lote local.

## Presupuesto y conservación de evidencia

| Recurso | Límite propuesto |
| --- | --- |
| Arranques de Claude / turnos / inferencia | 0 / 0 / 0 |
| Invocaciones de codesign | Dos, sin reintentos |
| Tiempo por codesign / total operativo | 20 segundos / 120 segundos |
| Salida capturada por operación | 64 KiB; desbordamiento detiene, no guardar contenido crudo |
| Artefactos propios de Claude | Uno regular, 512 MiB máximo, hash incremental |
| Enlaces | Ocho saltos como máximo |
| Red y descargas solicitadas | Ninguna |
| Escrituras | Solo notas nuevas en un lote privado exclusivo |

El límite de salida debe aplicarse durante la captura, no truncando un buffer
sin límite al final. Timeout, reemplazo concurrente, herramienta no disponible,
salida inesperada o error se conservan como resultados; no ejecutar alternativas
ni ampliar permisos automáticamente. Terminar únicamente el proceso auxiliar
propio iniciado por el lote, nunca sesiones ajenas. No se promete aislamiento
de todos los efectos internos del sistema operativo.

Destino propuesto: `PRIVATE_EVALUATIONS_ROOT/c3-1c-claude-01`. Requiere aprobación
de su ruta absoluta antes de crear. Validar volumen local, propietario, ausencia
de enlaces/ancestros Git/rutas sincronizadas conocidas y creación exclusiva.
Directorio `0700`, archivos `0600`; si ya existe, detener sin sobrescribir.

Notas: `01-procedencia.md` y `03-revision.md`, con metadatos mínimos y resultados
redactados. No cuentas, certificados exportados, configuración o salidas crudas.
Omitir `02-expediente.json` si el binding sigue incompleto. Datos, rutas y huellas
personales no se copian a Toolkit, Git u Obsidian.

## Viabilidad: separar identidad de controles

Esta matriz es documental, no prueba de esta instalación:

| Aspecto | Evaluación necesaria antes de un piloto automático |
| --- | --- |
| Herramientas y MCP | Exclusiones separadas; herramientas vacías no bastan para impedir conexiones |
| Personalizaciones y hooks | Safe mode conserva algunas políticas administradas; no garantiza ausencia total |
| Suscripción | Conservar acceso nativo sin copiar credenciales; bare no sustituye esa ruta |
| Reintentos, auxiliares y gasto | Un límite de turnos o presupuesto API no demuestra techo de llamadas por suscripción |
| Cancelación | Detener un proceso local no acredita que terminó el consumo remoto |

Si el techo preventivo de llamadas no puede acreditarse, el contrato automático
estricto permanece bloqueado aunque la firma sea correcta. No rebajar el gate,
simular llamadas limitadas ni sustituirlo por tokens, tiempo, turnos o dinero.
El traspaso manual puede continuar, con límites claramente distintos. Una ruta
menos estricta sería otro diseño con aprobación, no un permiso implícito.

## Criterios de aceptación y paradas

1. Mismo candidato que la observación privada, sin carreras o actualización oculta.
2. Dos verificaciones locales acotadas o razón explícita de por qué se detuvieron.
3. Firma, procedencia, versión declarada y versión efectiva diferenciadas.
4. Ningún arranque de Claude, lectura de configuración/cuentas o inferencia.
5. Solo evidencia privada nueva; ninguna aprobación de controles o tickets C1/C2.
6. Conclusión útil: faltantes concretos y decisión de avanzar o conservar manual.
7. Incertidumbre conservada, sin expediente inventado o promesas de coste cero.

La revisión de este plan valida límites y coherencia. La revisión del lote
ejecutado deberá relacionar cada criterio con evidencia; no reutilizar pruebas
de fixtures o regresiones de software como certificación de un cliente real.

## Fuentes oficiales

Consulta documental del 2026-10-04 (America/Bogota), separada del lote local
propuesto. Los sitios consultados no acreditan el artefacto instalado.

- Anthropic describe firmas macOS y comprobación con codesign; también publica
  manifiestos firmados para contrastar releases. Descargar/verificar esos
  manifiestos no forma parte del lote local.
  [Integridad y firmas de Claude Code](https://code.claude.com/docs/en/setup#binary-integrity-and-code-signing).
- La referencia distingue herramientas incorporadas, MCP, safe mode y políticas
  administradas. Los límites publicados no equivalen a pruebas locales ni a un
  techo de solicitudes por suscripción.
  [Referencia CLI](https://code.claude.com/docs/en/cli-reference).

## Puerta histórica de autorización

Revisión documental histórica de quality-gate: **Aprobado con observaciones**. Formato,
23 enlaces locales y 15 tablas revisados; comprobación de espacios sin errores
e índice Git sin archivos preparados. Escaneo limitado sin patrones sensibles
ni evidencia privada de instalación en los cuatro documentos de esta entrega.
Preservación por SHA-256: 149 de 152 archivos previos intactos, tres documentos
propios actualizados y uno nuevo; ninguno borrado. No se repitió la regresión
de código, pues aquella entrega solo modificó documentación. Estos resultados
no certificaron el cliente; en ese momento las comprobaciones locales propuestas
seguían pendientes. No son comprobaciones repetidas en la consolidación actual.

La propuesta original pedía autorizar P-01–P-04 y dos notas privadas, sin
arranque posterior del cliente. Esa autorización se concedió y el lote cerró
con firma local satisfactoria y continuidad del artefacto, pero sin completar
procedencia independiente, versión efectiva, controles o consumo. No queda
una solicitud vigente para repetirlo o actualizar sus observaciones.
Una operación nueva que requiera red, configuración, cuenta o cliente debe
delimitarse y autorizarse aparte, sin ampliar el alcance del lote histórico.

## Consolidación documental — 2026-10-09

El usuario autorizó aclarar los estados históricos de los dos planes y crear
su commit local, sin push ni inspecciones nuevas. Se conservaron operaciones,
presupuestos, fuentes con fecha original y limitaciones; la evidencia personal
permanece fuera del repositorio y no se consultó en esta entrega.

Quality-gate: **Aprobado para consolidación documental**. Enlaces locales,
tablas y formato revisados en ambos documentos; ningún cambio funcional,
sin repetir pruebas de código ni convertir firma o huella en permiso de ejecución.

El cierre posterior de la base de diagnóstico figura en
[AD-1/AD-2](agent-client-auth-diagnostic.md#ad-10-consolidación-local-y-correcciones-del-límite-de-invocación).
AD-3 sigue bloqueado y requiere evidencia pertinente y consentimiento específico.
Esta consolidación no reejecutó P-01–P-04, inició codesign o clientes, consultó
cuentas ni renovó las observaciones históricas de la instalación.
