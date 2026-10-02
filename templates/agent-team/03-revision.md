# Revisión: [título del encargo]

Separar las afirmaciones del ejecutor de la revisión del coordinador. No incluir
secretos, datos personales, credenciales o salidas extensas. No marcar `verified`
solo por recibir un mensaje de éxito o por existir una prueba aprobada.

## Identidad y entradas consumidas

- projectId: [mismo que el encargo]
- taskId: [mismo que el encargo]
- mode: [tutor | autonomous]
- revision: [misma revisión del encargo]
- step: [paso o entrega actual]
- status: [review-needed | verified | blocked | waiting-user | cancelled]
- author: [ejecutor o usuario; después, revisor identificado en su sección]
- recipient: [coordinador]
- createdAt: [fecha y hora con zona]
- consumedAssignment: [ruta y SHA-256 del encargo]
- consumedProposal: [ruta y SHA-256 de la propuesta]
- correctionRound: [0 | 1 | 2; conservar contador entre revisiones]
- authorizationChecked: [verificada en la sesión del receptor | pendiente]

## A. Resultado del escritor y comprobaciones

Esta sección la completa Gemini en autónomo. En tutor se recoge lo escrito por
el usuario; un agente puede documentar esa evidencia sin atribuirse su autoría.

- Reporter: [responsable del informe]
- FunctionalWriter: [usuario en tutor | ejecutor autorizado en autónomo]
- Outcome: [sin aplicar | aplicado | parcial | incierto | bloqueado]
- Before: [rama, HEAD y estado contrastado antes de escribir]
- After: [rama, HEAD y estado real después; HEAD puede no cambiar sin commit]
- ExactFilesChanged: [lista | ninguno]
- RemainingFiles: [lista | ninguno]
- ConcurrencyOrBaseMismatch: [detalle | ninguno]
- UnauthorizedActionsTaken: ninguna

### Modelo del escritor, cuando es un agente

En tutor marcar este apartado «No aplica: escritor humano». No atribuir al
usuario el modelo de Claude; la observación del proponente se revisa en B.
En autónomo registrar la decisión propia del ejecutor, no la de Claude.

- selectionIdentity: [projectId / taskId / revision / role | no aplica: usuario]
- consumedDecision: [decisión privada del ejecutor | no aplica: usuario]
- consumedDecisionFileSha256: [huella de bytes | no aplica]
- consumedCanonicalHashes: [huellas audit JSON | no aplica]
- requestedModel: [modelo solicitado para el ejecutor | no aplica: usuario]
- observedModels: [modelos identificados por evidencia | no confirmado | no aplica: usuario]
- verification: [unknown por defecto | reported | verified tras revisión | no aplica: usuario]
- modelEvidenceKind: [execution-metadata | session-state | user-declaration | none | no aplica]
- modelEvidenceRefAndScope: [procedencia, referencia privada y ejecución/momento | ninguna]
- modelLimitations: [metadata ausente, alias o auxiliares | ninguna comprobada]
- accumulatedHistory: [rondas, executionsUsed y durationUsedSeconds; no reiniciar]

Una declaración propia del escritor no es revisión independiente. Conservar
los datos ausentes como desconocidos, no como éxito, modelo elegido o permiso.

Una aplicación parcial o incierta requiere informar rutas y detenerse. No ocultar
errores, continuar a ciegas o revertir trabajo por cuenta propia. En tutor no
se interpreta la escritura intencional del usuario como una base previa inválida:
se contrasta el resultado con el paso y la propuesta aceptada.

| Comando / revisión | Directorio y entorno | Estado | Resultado resumido |
| --- | --- | --- | --- |
| [comprobación] | [entorno real] | [aprobada / fallida / no ejecutada] | [evidencia acotada o motivo] |

- Fallos previos o ajenos: [detalle y evidencia | ninguno observado]
- Fallos introducidos por la tarea: [detalle y evidencia | ninguno observado]
- Comprobaciones pendientes: [detalle | ninguna]

## B. Revisión independiente del coordinador

Esta sección la completa Codex después de inspeccionar el resultado real.
No sobrescribir la sección A para ocultar un fallo; añadir una nueva revisión
si cambia la entrega. Los resultados declarados se distinguen de lo comprobado.

- Reviewer: [responsable]
- ReviewedAt: [fecha y hora con zona]
- ActualDiffInspected: [sí y rutas | no y motivo]
- VersionsAndScopeChecked: [resultado o bloqueo]
- ChecksIndependentlyVerified: [lista | ninguna; no inventar ejecución]
- EvidenceReceivedOnly: [lista de salidas revisadas, no ejecutadas por el revisor]

### Contraste independiente de modelos y selección del revisor

- reviewerSelectionIdentity: [projectId / taskId / revision / role reviewer]
- reviewerDecisionRef: [decisión propia del revisor | pendiente; no copiar la de otro rol]
- reviewerDecisionFileSha256: [huella de bytes | no aplica]
- reviewerCanonicalHashes: [huellas audit del informe | pendientes]
- reviewerRequestedModel: [modelo solicitado para revisar | pendiente]
- reviewerObservedModels: [metadata contrastada | no confirmado]
- reviewerVerification: unknown
- reviewerEvidenceRefAndScope: [procedencia, referencia y ejecución/momento | ninguna]

| Participante y rol real | Decisión vigente / requestedModel | observedModels | verification y procedencia | Discrepancia / siguiente acción |
| --- | --- | --- | --- | --- |
| [proponente, ejecutor solo en autónomo o revisor] | [referencia e identidad propia] | [observados / no confirmado] | [verified / reported / unknown; quién contrastó y evidencia acotada] | [detalle / ninguna tras comprobar] |

Contrastar identidades, revisión, rol, huellas canónicas y bytes por separado.
`verified` exige evidencia del cliente para la ejecución específica, revisada
con procedencia; una declaración del usuario/estado actual queda `reported`.
El catálogo o la selección no certifican el modelo real. No inventar un principal
si hay auxiliares o alias ambiguos, ni sobrescribir la sección A o la propuesta.

- codeVerification: [verificado por criterios y evidencia | pendiente | no cumplido]
- modelReviewDisposition: [coincide con política | requiere revisión humana | desconocido]
- modelDiscrepancyResolution: [decisión humana/política previa válida y límites | pendiente | no aplica]
- strictAutomaticApplication: no habilitada por esta revisión
- historyAndLimitsChecked: [rondas y consumo acumulados contrastados con entregas | pendiente]

El código correcto no convierte `unknown` en `verified`, y un modelo `reported`
no demuestra que el código falle. Un paso tutor con todos sus criterios probados
puede verificarse manualmente, dejando el modelo desconocido como observación;
el usuario sigue escribiendo. Eso no habilita aplicación automática.
Metadata ausente o modelo no permitido requiere resolución antes de cualquier
aplicación estricta automática futura. No repetir llamadas, cambiar proveedor,
ampliar permisos o activar API para evitar esta revisión.

| Criterio del encargo | Estado | Evidencia y procedencia | Pendiente o corrección |
| --- | --- | --- | --- |
| [CA] | [verificado / pendiente / no cumplido] | [archivo, prueba o demostración y quién la obtuvo] | [detalle / ninguno] |

- Conclusión: [verified | waiting-user | review-needed | blocked | cancelled]
- Motivo: [explicación concreta]
- Cambios ajenos preservados: [detalle | ninguno observado]
- Permisos y restricciones respetados: [evidencia | no comprobado]

Solo criterios completos con evidencia permiten `verified`. En tutor un paso
erróneo o sin evidencia mantiene el mismo paso pendiente; no escribe el agente.
Un paso verificado permite el siguiente dentro del encargo, sin otra aprobación
redundante. Verificar código no autoriza publicar ni actualizar Obsidian.

## C. Corrección o cierre

- Próxima acción: [corregir este paso | siguiente paso | entregar resultado | pedir decisión]
- Destinatario: [responsable]
- Corrección delimitada: [criterios y rutas | no aplica]
- Próxima ronda autónoma: [1 | 2 | ninguna]
- Historial conservado: [correctionRound, executionsUsed y durationUsedSeconds; evidencia previa]
- Nueva selección necesaria: [motivo y rol afectados | ninguna; no reinicia el historial]
- Estado que se espera: [estado]
- Commit / push / PR / memoria: no realizados por defecto

Tras fallar la ronda autónoma 2, marcar `blocked` y solicitar intervención; no
crear ronda 3 ni reiniciar el contador en otro archivo. En tutor no existe bucle
automático de escritura. Un permiso denegado no se sortea con otro agente.

No hay envío automático entre chats ni barrera técnica de permisos. Al fallar
cuota o autenticación, detenerse; no contratar API ni activar facturación.
