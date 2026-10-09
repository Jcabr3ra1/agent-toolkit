# R1 — Primera beta privada utilizable

## Estado

- R1.1: verificado para consolidación documental local; autorización del
  2026-10-09 (America/Bogota), con commit local de cuatro documentos.
- R1.2: validación integrada propuesta; requiere autorización de su lote aislado.
- R1.3: revisión y publicación privada propuestas; requieren autorización aparte.
- Versión declarada del paquete: `0.1.0`, sin cambio de versión en esta entrega.
- Profundidad: estándar para R1.1; rigurosa para las puertas de escritura,
  conservación de datos y publicación de las etapas posteriores.

Crear esta especificación no autoriza sus etapas futuras, clientes nativos,
inferencias, cuentas, instalación, tags, releases, npm o automatizaciones.

## Problema

La biblioteca tiene herramientas locales y contratos probados, pero muchos
documentos reflejan etapas distintas. Una persona que clone una copia anterior
puede no encontrar los comandos nuevos o confundir una recomendación con permiso
para ejecutar. Tener módulos probados tampoco acredita el recorrido integrado
de un proyecto nuevo, una instalación limpia o una publicación vigente.

## Objetivo

Preparar una primera beta privada que permita comenzar con pasos claros,
identificar qué funciona y comprobar un recorrido completo con datos ficticios
antes de publicar el estado revisado. La coordinación entre clientes sigue
manual; la ejecución automática no es un requisito que se dé por resuelto para
llamar utilizable a la base local.

## Fuera de alcance

- Admitir clientes de IA reales, completar AD-3 o consultar cuentas/consumo.
- Activar modelos, instalar Skills/perfiles o cambiar configuración del usuario.
- Modificar Avisens, otra fuente real o una bóveda de Obsidian.
- Crear una automatización, escribir mensajes entre chats o vigilar carpetas.
- Publicar en npm, hacer público el repositorio o prometer compatibilidad completa.
- Ejecutar GitHub, fetch, push, tags o releases dentro de R1.1.
- Búsqueda semántica, embeddings, nuevos proveedores o autonomía ilimitada.

## Comportamiento actual comprobado

La base revisada para R1.1 es `25df93ac277d2ede40977d2bb3a00884d1faac7e`, con
árbol de trabajo limpio. La referencia local `origin/main` muestra 25 commits
pendientes; no se consultó el remoto y ese número no acredita su estado actual.

- [project-memory](uso.md) crea y diagnostica memorias, prepara conexiones y
  contiene operaciones de revisión/aplicación con límites explícitos.
- [agent-task prepare](agent-task-prepare.md) produce un borrador por destinatario
  a partir de datos declarados; no guarda, envía o ejecuta el encargo.
- [agent-task verify](agent-task-verify.md) compara archivos listados bajo un
  contrato fijado; no aprueba calidad, Git, permisos, modelos o consumo.
- La [guía del equipo](../templates/agent-team/README.md) conserva traspaso manual,
  autoría tutor y autorización separada por rol.
- AD-3 y la inferencia automática de clientes reales permanecen sin admisión.

Evidencia histórica relevante: el candidato funcional de [AD-1/AD-2](agent-client-auth-diagnostic.md)
pasó **3.279/3.279 pruebas** el 2026-10-09, sin fallos, canceladas, omitidas o
todo, con concurrencia 1. Se construyó desde `6cd6811` más los seis archivos de
AD; las consolidaciones posteriores solo cambiaron documentación. La referencia
anterior de 1.001 pruebas del 2026-10-06 pertenece a otra entrega, no a la suma
de todos los módulos actuales. Ninguna cifra es una certificación de producción.

Esta entrega no repite la regresión completa ni una instalación de dependencias.
El entorno local comprobado es macOS con Node.js `v24.14.1` y dependencias ya
instaladas. `package.json` declara Node.js `>=20`; no equivale a haber ejecutado
la regresión completa en todas esas versiones, Linux o Windows.

## Requisitos

### Funcionales

- RF-R01: una [guía inicial](primeros-pasos.md) parte de un checkout aprobado,
  explica requisitos, raíz de ejecución, comandos y resultados esperados.
- RF-R02: la primera prueba usa solo ayudas y ejemplos ficticios existentes,
  sin instalar software, leer proyectos reales o llamar proveedores.
- RF-R03: el README explica el producto en lenguaje accesible y distingue base
  local, evidencia histórica, validación integrada pendiente y publicación pendiente.
- RF-R04: R1.2 debe unir operaciones existentes en un proyecto/memoria ficticios
  aislados y conservar evidencia de resultados y efectos realmente observados.
- RF-R05: R1.3 debe revisar el destino exacto, privacidad, divergencias y contenido
  saliente antes de un push expresamente autorizado; no usar un remoto por inferencia.

### No funcionales

- Cuatro rutas documentales exactas para R1.1; código, dependencias y configuración
  permanecen intactos. El agregado Git es por archivo y el commit es local.
- Sin secretos, respuestas privadas, inventarios reales o evidencia de cuentas
  en la biblioteca. Los ejemplos continúan siendo ficticios.
- Las fechas de pruebas y observaciones no se renuevan por actualizar un documento.
- Incertidumbre, conflicto o resultado parcial impiden declarar el hito completo.
- Una aprobación de R1.1 no instala, publica ni concede autorización nativa.

## Criterios de aceptación

### R1.1 — Documentación y primeras comprobaciones

- CA-R01: dado un checkout con sus dependencias existentes, las ayudas locales
  de `project-memory`, `agent-task` y `agent-task verify` terminan con exit 0.
- CA-R02: dados los cuatro JSON ficticios existentes, `prepare --json` devuelve
  `prepared-draft`, modelo ficticio `example-alpha-r2` y esfuerzo `brief`;
  ejecución, envío, escritura, admisión y readiness permanecen false, con modelo
  observado desconocido. No se convierte el ejemplo en política real.
- CA-R03: README, guía inicial y guía técnica distinguen clonar la biblioteca,
  preparar un encargo y conectar una memoria. Ninguna de esas acciones se
  presenta como ejecutar automáticamente un equipo o clonar una bóveda.
- CA-R04: los enlaces, anclas, tablas, cercas y finales de línea de las cuatro
  rutas son válidos; se conserva el resto del repositorio y el índice final queda vacío.
- CA-R05: el commit contiene solo las cuatro rutas; no hay push ni instalación.
  La cifra histórica de regresión no se presenta como una ejecución nueva de R1.1.

### R1.2 — Validación integrada, propuesta

- CA-R06: un lote autorizado usa exclusivamente directorios temporales propios,
  fuente Git y memoria ficticias separadas; evidencia GitHub simulada y explícita.
  No usa credenciales, API, perfiles instalados, red de proveedores o bóvedas reales.
- CA-R07: inicialización con preview/aplicación autorizada, diagnóstico, estado,
  detección/inspección simuladas y aplicación/registro forman un recorrido coherente.
  Cada paso usa la salida realmente obtenida del anterior; no fabrica una aprobación.
- CA-R08: repetir una operación idempotente no duplica registros ni reemplaza
  contenido distinto. PR abierto, checks adversos, pin/base divergentes y cambios
  ajenos se conservan o bloquean según los contratos existentes.
- CA-R09: la evidencia identifica bytes/revisión, comandos o APIs, resultados y
  límites. El cleanup solo retira recursos propios con identidad comprobada.
  Un fallo no se oculta ampliando permisos, reiniciando contadores o cambiando cliente.

### R1.3 — Publicación privada, propuesta

- CA-R10: destino, rama, privacidad y estado remoto se comprueban bajo permiso
  explícito. Se revisa el historial que efectivamente saldrá, no solo el último diff.
- CA-R11: conflictos, datos sensibles o un destino dudoso bloquean la publicación;
  no se fuerza, borra ni reescribe historia para resolverlos sin otra autorización.
- CA-R12: después de un push autorizado se contrasta el commit remoto exacto y
  se comprueba la privacidad. No se afirma que una descarga o instalación limpia
  funciona sin una prueba separada, acotada y realmente ejecutada.

## Casos límite y errores

- Copia antigua: comparar el hito/revisión disponible; no atribuir comandos nuevos
  al remoto antes de publicarlos ni arreglarlo instalando clientes de IA.
- Falta Node/dependencias: detener la prueba. Su preparación es una acción separada,
  no una instalación silenciosa ni una llamada a una API de pago.
- Datos ficticios caducados: son un ejemplo histórico con tiempo declarado;
  su éxito no verifica disponibilidad hoy en una cuenta real.
- Archivo o rama cambiados: repetir la revisión de la base, no sobrescribir trabajo
  concurrente ni conservar un pin como si siguiera vigente.
- Resultado parcial al escribir notas: registrar lo ocurrido; no hacer rollback
  ciego, marcar sincronizado el PR ni prometer una transacción total.
- Prueba omitida por plataforma: reportarla; no equivale a criterio satisfecho.

## Diseño propuesto

No añadir un runner de IA o un comando de publicación en R1.1. La guía reutiliza
los bins y JSON actuales. R1.2 debe diseñar un lote aislado con APIs existentes
y dependencias de prueba confiables para GitHub, no abrir cuentas para completar
fixtures. Si necesita un test nuevo, debe fijar antes sus archivos y efectos.

R1.3 separa auditoría, aprobación y push. Una copia privada en GitHub es un respaldo
de biblioteca, no instalación de clientes, sincronización de Obsidian o admisión
del runtime. No se crea una etiqueta de release por el nombre «beta».

## Datos, privacidad y seguridad

Los contextos operativos siguen fuera del Toolkit. Solo datos genéricos y
ficticios se versionan. La revisión limitada de patrones sensibles no garantiza
ausencia universal de secretos; la revisión humana del historial saliente y
la identificación exacta del destino son puertas adicionales de R1.3.

Elegir tutor/autónomo o un modelo recomendado no concede permiso para enviar
contexto a otro proveedor. Toda entrega real necesita alcance y autorización
verificable en el receptor. Esta especificación no cambia las reglas de autoría
de un proyecto ni los requisitos de AD-3.

## Alternativas consideradas

- Esperar a la automatización nativa: no hace falta para usar las herramientas
  locales ya construidas; se conserva como una evolución separada, no como concluida.
- Publicar inmediatamente: se pospone hasta la validación y revisión saliente.
- Probar con AVISENS: se descarta para este hito; datos ficticios permiten acotar
  efectos sin modificar un proyecto o memoria reales.

## Riesgos y reversión

La principal confusión es presentar documentación o fixtures como prueba de una
cuenta, instalación limpia o producción. Los estados separados y evidencia fechada
evitan esa conclusión. R1.1 es documental: puede retirarse mediante un cambio
revisado sin migraciones o resets. La limpieza futura no incluye proyectos reales.

## Plan de tareas

- [x] R1.1: cuatro documentos, ayudas/ejemplo existentes, QA y commit local.
  Archivos: este documento, `primeros-pasos.md`, `README.md`, `uso.md`.
- [ ] R1.2: delimitar y autorizar el lote de integración antes de ejecutarlo.
  Archivos probables: especificación/evidencia del lote y test de integración,
  solo si la revisión del diseño determina que hace falta.
- [ ] R1.3: revisión saliente y destino privado; push únicamente con autorización
  específica. No mezclar una publicación con una instalación o inferencia real.

## Evidencia de cierre

Comprobaciones ejecutadas el 2026-10-09 (America/Bogota), desde la raíz del
Toolkit y con las dependencias existentes. Sin instalación, cuentas, red de
proveedores, proyectos reales, llamadas de IA, GitHub remoto o publicación.

| Criterio R1.1 | Evidencia |
| --- | --- |
| CA-R01 | Las tres ayudas locales finalizaron con exit 0; Node observado `v24.14.1` |
| CA-R02 | Ejemplo existente: `prepared-draft`, `example-alpha-r2`, `brief`; indicadores de ejecución/envío/escritura/admisión false, observaciones vacías y verificación de modelo unknown |
| CA-R03 | Guía y presentación revisadas: biblioteca distinta de bóveda; borrador distinto de permiso; entrega manual distinta de ejecución automática |
| CA-R04 | 39 referencias locales, incluido el logo; tablas, cercas y finales de línea comprobados; solo cuatro rutas del lote |
| CA-R05 | Staging por cuatro rutas exactas y verificación de bytes del commit; sin push. La regresión de 3.279 pruebas conserva su fecha histórica y no se repitió |

Comparación con la base de 235 archivos: 233 intactos, solo README y guía de
uso actualizados, dos documentos nuevos; ningún archivo previo borrado. Escaneo
limitado de patrones sensibles sin hallazgos, no garantía universal de ausencia
de secretos. Código, ejemplos y contratos conservaron sus bytes.

Quality-gate: **Aprobado para R1.1 documental**. R1.2/R1.3 no se consideran
verificadas por aprobar esta especificación. R1 tiene una de tres entregas
completadas; ese conteo no es una medida de capacidades de modelos ni del
porcentaje global de funcionalidades del Toolkit.

## Preguntas abiertas

- Alcance exacto del lote R1.2 y necesidad de nuevas pruebas de composición.
- Destino/rama y estado remoto vigentes en el momento de R1.3.
- Entornos adicionales e instalación limpia que se decidan validar después;
  no se comprometen ahora ni se afirman comprobados.
