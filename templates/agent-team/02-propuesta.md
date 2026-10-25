# Propuesta: [título del encargo]

Documento de diseño o tutoría; no es permiso de aplicación. No incluir secretos,
datos personales, credenciales o salidas extensas.

## Identidad y entrada consumida

- projectId: [mismo que el encargo]
- taskId: [mismo que el encargo]
- mode: [tutor | autonomous]
- revision: [misma revisión del encargo]
- step: [paso o entrega actual]
- status: [waiting-user en tutor | proposed en autónomo | blocked]
- author: [proponente]
- recipient: [usuario en tutor | ejecutor autorizado en autónomo]
- createdAt: [fecha y hora con zona]
- consumedAssignment: [ruta exacta y SHA-256 de 01-encargo.md]
- consumedReview: [ninguna | ruta y SHA-256 de la revisión que solicita corrección]
- correctionRound: [0 | 1 | 2; no reiniciar el contador al cambiar de revisión]

## Base contrastada y permisos

- repositoryRoot: [raíz física verificada]
- branch: [rama observada]
- head: [SHA completo observado]
- initialGitState: [estado real y diferencias con el encargo]
- instructionsChecked: [instrucciones vigentes consultadas y posibles conflictos]
- authorizationChecked: [comprobada en la sesión | pendiente; no inferida del archivo]
- functionalFilesWrittenByProponent: ninguno

Si los identificadores, revisión, SHA del encargo, base o instrucciones no
coinciden, dejar `blocked`; describir la diferencia sin divulgar contenido privado.
No preparar una aplicación sobre una versión supuesta.

## Selección consumida y observación del proponente

- selectionIdentity: [projectId / taskId / revision / role del proponente]
- consumedDecision: [referencia privada de la decisión recibida | pendiente]
- consumedDecisionFileSha256: [huella de bytes contrastada | no aplica si no se guardó]
- consumedCanonicalHashes: [huellas audit del informe; no confundir con bytes]
- selectionState: [recommended | needs-info | blocked | invalid | pending]
- profileId: [perfil del proponente; no del ejecutor/revisor | pendiente]
- providerAndClient: [los autorizados en la decisión | pendiente]
- requestedModel: [modelo solicitado en esa decisión | pendiente]
- requestedEffort: [valor recomendado | null | pendiente]
- selectionCompatibilityChecked: [identidad, revisión, rol y restricciones contrastados | pendiente]
- observedModels: [identificados por evidencia | no confirmado]
- verification: unknown
- modelEvidenceKind: [execution-metadata | session-state | user-declaration | none]
- modelEvidenceRef: [referencia privada y procedencia | ninguna]
- modelEvidenceScope: [ejecución concreta / estado actual / declaración y momento | desconocido]
- modelEvidenceLimitations: [alias, auxiliares, ausencia o ambigüedad | ninguna comprobada]

Una decisión incompleta/bloqueada, identidad distinta o cliente/proveedor
incompatible deja la propuesta `blocked`, con la información o decisión que
falta. No pasar a otro modelo por cuenta propia ni reiniciar contadores.

La selección no prueba qué modelo respondió. `reported` conserva una declaración
del usuario o un estado de sesión; no certifica cada respuesta. `verified` solo
se registra tras contrastar evidencia del cliente de la ejecución concreta en
la revisión, indicando quién la comprobó. Un texto del agente que afirme su
modelo no lo acredita. No inventar modelo principal ante metadata ambigua.

Si los datos de ejecución todavía no existen al redactar esta propuesta, dejar
`unknown`; la observación posterior se registra en la revisión con procedencia,
sin reescribir esta entrega para simular que se conocía antes. Omitir salidas
extensas/privadas. Un modelo desconocido no prueba un fallo de calidad del código.

Las decisiones del ejecutor y del revisor son independientes y deben contrastarse
para sus propios roles. La recomendación no confirma permiso humano, no cambia
el modo ni configura un CLI. Metadata ausente o discrepancia sin política aprobada
impide aplicación automática estricta futura; requiere revisión humana, sin retry
que consuma cuota ni fallback. En tutor el usuario sigue siendo el escritor.

## Tutor: un único paso

Completar esta sección solo en `tutor`; el apartado autónomo queda «No aplica».

- Objetivo y motivo: [explicación sencilla ligada al criterio del paso]
- Archivo y ubicación: [ruta exacta, función o sección inspeccionada]
- Operación: [añadir | reemplazar | eliminar, con límites inequívocos]
- Código del paso: [bloque completo; respetar instrucciones del proyecto]
- Explicación: [entradas, resultado, términos nuevos y errores habituales]
- Comprobación: [comando permitido, dónde ejecutarlo y resultado esperado]
- Autor del código: usuario
- Siguiente estado: `waiting-user`

Esperar a que el usuario escriba. «Listo» solicita revisión del código real,
no declara el paso correcto. No entregar ni implementar el paso siguiente hasta
verificar el actual. Ningún agente aplica esta propuesta.

## Autónomo: cambios propuestos

Completar esta sección solo en `autonomous`; el apartado tutor queda «No aplica».

| Ruta relativa exacta | Operación | SHA-256 anterior o ausencia | Motivo / criterio |
| --- | --- | --- | --- |
| [ruta] | [modificar / crear / borrado solo con autorización específica] | [huella / debe estar ausente] | [CA y justificación] |

[Incluir por ruta un diff preciso o contenido y reemplazo inequívocos. Mostrar
los cambios antes de aplicarlos. Declarar efecto en contratos, datos o dependencias;
si excede el encargo, bloquear en vez de ampliar el alcance.]

### Plan de comprobación

| Criterio | Comando o revisión | Directorio | Resultado esperado |
| --- | --- | --- | --- |
| [CA] | [comprobación permitida] | [ruta] | [resultado observable] |

### Instrucción al ejecutor

Verificar autorización propia, identificadores, revisión y SHA-256 de documentos,
HEAD, rama y huellas antes de escribir. La base divergente, un cambio solapado,
un escritor concurrente o un permiso pendiente bloquean. No aplicar con fuerza.
Contrastar la decisión propia del rol ejecutor, no reutilizar la del proponente;
si está incompleta, bloqueada o contradice el encargo, solicitar resolución humana.

Aplicar solo los cambios listados y las pruebas autorizadas. Registrar resultado
y cualquier aplicación parcial en `03-revision.md`; no revertir, ampliar alcance,
crear commits, publicar o actualizar memoria automáticamente.

## Límites y bloqueos

- Pendiente o no comprobado: [detalle | ninguno]
- Riesgos y efectos secundarios: [detalle | ninguno]
- Motivo de bloqueo: [detalle | no aplica]
- Decisión necesaria: [pregunta concreta | ninguna]
- Siguiente acción manual: [quién debe leer esta entrega y cuándo]

Un cambio de modo requiere una instrucción válida del usuario y un encargo nuevo
basado en el trabajo real. No borrar ni pedir reescribir lo ya comprobado.
No hay envío automático ni barrera técnica de permisos; las cuotas siguen aplicando.
