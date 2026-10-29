# Inventario de clientes y modelos

Esta base ayuda a saber qué cliente usas, qué modelos muestra y qué información
falta antes de elegir uno para una tarea. No descubre modelos automáticamente,
accede a cuentas, realiza llamadas de IA ni cambia configuraciones.

Contrato: [especificación del inventario](../../docs/agentes/modelos/agent-model-inventory.md).
Plantilla: [01-inventario.md](01-inventario.md).

## Tres cosas que no deben confundirse

| Pregunta | Qué registrar | Qué no asumir |
| --- | --- | --- |
| ¿El cliente muestra el modelo? | Etiqueta, versión/variante y fuente | Que tu cuenta pueda usarlo |
| ¿La cuenta tiene acceso declarado? | Estado, fecha, procedencia y alcance | Que cada llamada será aceptada o estará incluida en el plan |
| ¿Sirve para esta tarea? | Evaluación autorizada por rol y criterios | Que aparecer en el menú lo aprueba para escribir código |

Estas plantillas son formularios Markdown, no los JSON del selector. Los
corchetes y datos pendientes no son valores para alimentar una configuración.
Un inventario puede estar incompleto sin inventar permisos, modelos o fechas.

## Cómo se recogería un inventario real

1. Acordar un solo cliente y la ruta privada de destino, fuera de Agent-Toolkit,
   Obsidian, Git y sincronización. Autorizar fuentes y acciones mínimas de recogida.
   La carpeta del piloto anterior no se reutiliza por permiso implícito.
2. Crear una copia nueva de la plantilla únicamente con ese permiso. Registrar
   variante, superficie, versión y evidencia. Un wrapper no hereda los comandos
   del CLI estándar. No ejecutar un cliente desconocido para identificarlo.
3. Revisar documentación pertinente y acordar un método no mutante de inspección.
   No arrancar sesiones ni hooks, autenticarse, actualizar o cargar contexto de
   un proyecto. Si no hay método seguro, pedir observación manual acotada.
4. Recoger etiquetas, identificadores documentados y restricciones con fecha y
   procedencia. Inspeccionar sin confirmar selección: no cambiar modelos ni
   persistir defaults. Mantener acceso `unknown` si solo hay un menú genérico.
5. Contrastar datos y contradicciones sin probar inferencias. Conservar fecha
   original y revisiones previas. Solicitar evidencia nueva si falta vigencia,
   no cambiar timestamps para pasar el selector.
6. Revisar privacidad, disponibilidad declarada y coste por separado. No crear
   catálogo activo ni aprobar perfiles. Si corresponde, proponer después una
   evaluación pequeña por rol, con permisos, llamadas y tiempo delimitados.

Este procedimiento todavía no se ha ejecutado con los clientes del usuario.
Su aprobación documental no autoriza estas acciones reales ni crea la carpeta.
No hay nuevos comandos de Agent-Toolkit para este flujo en esta entrega.

## Modelos candidatos y datos pendientes

Todo modelo nuevo entra como candidato. La revisión del inventario no convierte
en verificadas las capacidades declaradas ni certifica el modelo que respondió.
Una declaración explícita del usuario es `user-declaration`; metadata concreta
del cliente es `client-metadata`. Conservar su alcance sin elevarlo a certeza.
Oferta genérica y declaración de acceso se registran separadas.

Para una futura conversión autorizada, respetar los [contratos existentes](../../docs/agentes/modelos/agent-model-selection-contracts.md):

- `availability` pertenece a la solicitud privada, no al catálogo reutilizable.
- Falta de pruebas puede dejar capacidades verificadas vacías y contexto `null`;
  no implica que el modelo sea incapaz ni que su contexto sea ilimitado.
- Identificador, fuente o fecha pendientes mantienen el borrador. Sin perfiles
  estructuralmente válidos no se genera un catálogo vacío ni un modelo inventado.
- No aprobar alias, asignar prioridades o igualar esfuerzos por marca o novedad.
- Un candidato, disponibilidad desconocida/caducada o una contradicción sin
  resolver no se hacen admisibles copiando el formulario a un encargo.

El [selector local](../../docs/agentes/modelos/agent-model-selector.md) recomienda con datos
de confianza y no ejecuta. Evaluar calidad real y aprobar perfiles requiere una
etapa separada; el inventario no da permiso para inferencias o aplicación.

## Privacidad, consumo y efectos secundarios

Guardar solo lo necesario: referencias locales y resúmenes, no correos, nombres
legales, IDs de cuenta, secretos, conversaciones completas o logs extensos.
No leer almacenes de autenticación ni variables de credenciales para completar
el formulario. Una captura autorizada se recorta y redacta antes de guardarla
o compartirla; no publicar inventarios de cuenta en la biblioteca ni en Obsidian.

No compartir información de cuenta entre proveedores por defecto. Un traspaso
posterior incluirá únicamente el perfil y evidencia pertinentes autorizados,
no todo el inventario. Una huella no anonimiza ni prueba consentimiento.

Una sesión de cuenta no demuestra inclusión en una suscripción. Consumo
desconocido o facturación adicional bloquean la futura prueba hasta resolverlo.
No contratar API, activar créditos, cambiar autenticación/proveedor o prometer
cuotas ilimitadas. Alias, auxiliares y fallback opacos quedan como limitaciones,
sin reintentos o cambios de protecciones para evitarlos.

## Escenarios revisados de esta base

Los casos son documentales y usan un cliente ficticio `demo-cli`, variante
`demo-wrapper` y opción `Demo Small`, sin atribuir modelos reales a cuentas.
No se crearon inventarios privados ni ejecutaron clientes para estos escenarios.

| ID | Escenario y resultado esperado | Dónde se conserva la regla |
| --- | --- | --- |
| CA-01 | Variante desconocida: registrar pendiente, sin ejecutar ni asumir comandos del estándar | Formulario 2 y pasos 2–3 |
| CA-02 | Opción visible sin acceso: oferta registrada, disponibilidad `unknown` | Formulario 4 y 4A |
| CA-03 | Declaración disponible frente a metadata negativa: conservar ambas, bloquear conversión y pedir resolución | Formulario 3 y 4A |
| CA-04 | Modelo nuevo sin prueba: `candidate`, sin capacidades verificadas ni aprobación por rol | Formulario 4B |
| CA-05 | Identificador, fuente o fecha pendientes: borrador, sin JSON inventado ni catálogo vacío | Formulario 4, 5 y reglas de conversión |
| CA-06 | Evidencia caducada o futura: solicitar comprobación pertinente, conservar fecha original | Formulario 3 y 4A |
| CA-07 | Selección que escribe defaults o consumo adicional: solo inspeccionar; no llamar mientras coste siga pendiente | Formulario 4C y paso 4 |
| CA-08 | Cuota, alias, auxiliares o fallback opacos: registrar límites, sin reintento ni proveedor alternativo | Formulario 4C |
| CA-09 | Captura privada: resumir o recortar con permiso y guardar solo en ruta privada acordada | Formulario 1, 3, 5 y privacidad |
| CA-10 | Crear formularios: solo Markdown, sin cambios a clientes, pilotos, código o archivos ajenos | Alcance y evidencia en la especificación |

Esta matriz comprueba cobertura documental, no acceso efectivo, cumplimiento
de agentes o barreras técnicas. Una plantilla por sí sola no protege los archivos.

## Siguiente etapa

Revisar esta entrega y autorizar su commit local si se desea. Después acordar
ruta privada y recogida de un solo cliente identificado. No hacer inferencias,
crear políticas activas o seleccionar modelos como parte implícita de esa recogida.
La evaluación por rol y la ejecución futura tienen sus propias puertas.
