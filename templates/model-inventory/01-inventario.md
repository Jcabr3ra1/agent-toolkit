# Inventario: [cliente y revisión]

Formulario genérico, no inventario activo ni configuración. Completar una copia
privada solo después de autorizar su ruta y recogida. Los campos entre corchetes
son pendientes, no valores válidos de un JSON. No incluir credenciales, email,
nombre legal, ID de cuenta, conversaciones o salidas extensas.

## 1. Identidad y alcance autorizado

- inventoryId: [identificador local sin datos personales]
- revision: [r01 o revisión nueva, sin sobrescribir la anterior]
- previousInventory: [referencia y huella de bytes / ninguno comprobado]
- status: draft
- recordedAt: [instante UTC real de redacción / pendiente]
- recorder: [rol que registra, sin datos personales]
- collectionAuthorization: [instrucción directa del usuario y alcance / pendiente]
- privateDestinationApproved: [ruta acordada de la copia privada / pendiente]
- sharingScope: [destinatario y datos expresamente permitidos / no autorizado]
- allowedInspection: [fuentes y acciones concretas aprobadas / pendiente]
- excludedActions: inferencias, cambios de modelo o configuración, autenticación,
  instalación, publicación y lectura de almacenes de credenciales.

El formulario no acredita permisos. El receptor comprueba la autorización en su
sesión; sin ella no recoge ni guarda datos. La aprobación de una plantilla no
autoriza un inventario real. El piloto anterior permanece intacto.

## 2. Cliente y procedencia

- clientName: [nombre observado / no confirmado]
- clientVariant: [oficial / wrapper / otra variante / no identificada]
- surface: [CLI / extensión / aplicación / pendiente]
- provider: [proveedor identificado para este registro / pendiente]
- versionObserved: [versión realmente observada / no confirmada]
- versionEvidenceRef: [ID de evidencia de sección 3 / pendiente]
- identificationLimitations: [límites o contradicciones / ninguna tras comprobar]
- officialDocumentationRef: [fuente pertinente a la variante y versión / pendiente]
- inspectionMethodReviewed: [método no mutante delimitado y fuente / pendiente]

Un nombre o una ruta no certifica procedencia. No ejecutar un cliente desconocido
para identificarlo ni asumir comandos del CLI estándar para un wrapper. Si no
hay método seguro, solicitar una observación manual acotada. No arrancar sesiones,
hooks, actualizaciones ni carga de contexto del proyecto para hacer el inventario.

## 3. Registro mínimo de evidencia

Repetir una fila por observación, conservando datos contradictorios separados.
La fecha corresponde a la observación original, no al momento de copiarla.

| evidenceId | Tipo de fuente | ObservedAt UTC | Referencia privada o URL oficial | Alcance y resumen mínimo | Limitaciones |
| --- | --- | --- | --- | --- | --- |
| [ID local] | [documentación / menú / declaración del usuario / metadata del cliente] | [AAAA-MM-DDTHH:MM:SSZ / pendiente] | [referencia segura / pendiente] | [qué se observó, sin datos de cuenta] | [versión, vigencia o incertidumbre] |

Por defecto conservar resumen y referencia, no capturas completas. Recortar y
ocultar datos privados antes de guardar o compartir una captura autorizada.
No copiar logs, variables de entorno o archivos de autenticación. Una referencia
o hash no convierte una declaración en prueba independiente ni anonimiza datos.

## 4. Modelo observado — repetir un bloque por opción

Este bloque separa oferta, acceso y evaluación. Que aparezca en un menú no implica
que esté disponible ni aprobado para una tarea. No completar nombres por intuición.

### Opción: [etiqueta observada / pendiente]

- observationId: [ID local único]
- clientEvidenceRef: [identificación de sección 2 / pendiente]
- displayLabel: [etiqueta exacta observada / pendiente]
- offeredEvidenceRef: [ID de evidencia / pendiente]
- requestedModel: [identificador documentado para solicitarlo / no confirmado]
- identifierEvidenceRef: [fuente del identificador / pendiente]
- versionKind: [versión concreta / alias / automático / no confirmado]
- aliasResolution: [resolución y evidencia / desconocida / no aplica]
- effortOptionsObserved: [opciones documentadas con referencias / desconocidas]
- additionalRestrictions: [restricciones visibles / desconocidas]

### 4A. Disponibilidad declarada de cuenta

- availabilityStatus: unknown
- checkedAt: [fecha UTC de la evidencia original / pendiente]
- provenance: [user-declaration / client-metadata / pendiente]
- availabilityEvidenceRef: [evidencia concreta relativa al acceso / pendiente]
- availabilityScope: [alcance de declaración o metadata / desconocido]
- contradictoryEvidenceRefs: [IDs separados / ninguna tras comprobar]
- contradictionResolution: [decisión humana y evidencia / pendiente / no aplica]
- agePolicy: [availabilityMaxAgeSeconds aprobado / pendiente]
- ageCheck: [vigente / caducada / futura / pendiente]

Estados posibles: `available`, `unavailable`, `unknown`. Un menú genérico deja
acceso `unknown`; no es metadata específica de disponibilidad. Una declaración
explícita se conserva como `user-declaration`, nunca como inferencia verificada.
Ante contradicción, no escoger a ciegas: conservar ambas fuentes, bloquear la
conversión del dato disputado y pedir resolución humana. No renovar `checkedAt`
al copiar ni sustituir una fecha futura para pasar la política de vigencia.

### 4B. Capacidades declaradas y evaluación pendiente

- candidateStatus: candidate
- proposedRoles: [roles a evaluar / pendientes; no aprobados]
- declaredCapabilities: [herramientas, modalidades, formatos y contexto, con fuentes / desconocidas]
- verifiedCapabilities: [solo comprobadas con evidencia / ninguna comprobada]
- verifiedContextTokens: [cantidad respaldada por evidencia / desconocido]
- roleEvaluationRefs: [evaluaciones autorizadas anteriores pertinentes / ninguna comprobada]
- approvalForRole: pendiente; no se concede con el inventario.

No copiar capacidades declaradas a verificadas. En una conversión futura,
listas verificadas vacías y contexto `null` pueden representar falta de evidencia,
no incapacidad ni contexto ilimitado. No inventar fuentes o evaluaciones para
crear JSON. El nombre de una familia no justifica prioridades entre proveedores.
Un modelo nuevo queda como `candidate`; evaluar tutoría no aprueba aplicación.

### 4C. Consumo y límites del cliente

- accessTypeObserved: [sesión de cuenta / otro / desconocido, con evidencia segura]
- consumptionType: [incluido en plan declarado / crédito adicional / facturación API / desconocido]
- consumptionEvidenceRef: [ID de evidencia / pendiente]
- quotaVisibility: [límite observado y referencia / desconocida]
- selectionSideEffects: [persistencia de default u otros efectos documentados / desconocidos]
- routingAndFallback: [comportamiento documentado y referencia / desconocido]
- auxiliaryModels: [lo que informa/controla el cliente / desconocido]
- requestedVsObservedLimitations: [observabilidad por ejecución / desconocida]
- nextSafeAction: [resolver un dato / revisión documental; ninguna llamada por defecto]

`session-account` no demuestra que el modelo esté incluido en el plan. Consumo
desconocido o facturación adicional bloquean la futura inferencia hasta resolverlo;
no activar créditos, API, otra autenticación o proveedor para continuar.
Inspeccionar no significa seleccionar: no confirmar filas del menú ni persistir
defaults. Cuota, alias, auxiliares o fallback opacos se registran como límites,
sin reintentos ni promesa de compatibilidad estricta. No desactivar protecciones.

## 5. Revisión y siguiente puerta

- reviewer: [rol que contrasta]
- reviewedAt: [instante UTC de revisión / pendiente]
- evidenceIndependentlyChecked: [IDs y alcance contrastado / ninguna]
- evidenceReceivedOnly: [IDs recibidos sin comprobar de forma independiente / ninguna]
- unresolvedInformation: [datos faltantes y contradicciones / ninguna tras comprobar]
- privacyAndScopeCheck: [resultado / pendiente]
- documentaryDisposition: [borrador / listo para revisión / bloqueado / revisado]
- proposedNextAction: [recogida delimitada / evaluación a proponer / pendiente]
- realCatalogOrPolicyWritten: no autorizado por este formulario.
- inferences: no autorizadas por esta recogida.
- commitPushMemoryChanges: no autorizados por este formulario.

La revisión no demuestra el modelo de una respuesta que no se ejecutó. No llenar
`observedModels` ni `verified` de una entrega con nombres del menú. La conversión
posterior a catálogo/política/solicitud necesita autorización y validación del
contrato existente: `availability` va en la solicitud privada, no en el catálogo.
Sin identificador o fuente válida, mantener borrador; sin perfiles válidos,
no fabricar un catálogo vacío. Ninguna selección ejecuta por sí sola un modelo.

Una nueva observación crea una nueva revisión con su fecha, sin sobrescribir
evidencias anteriores. No concede permiso para cambiar de modo, iniciar pruebas
o compartir datos nuevos. Guardar esta copia real fuera de biblioteca, Obsidian,
Git y carpetas sincronizadas, en la ruta previamente acordada.
