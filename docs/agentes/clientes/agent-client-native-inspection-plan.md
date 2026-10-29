# C3.1b — Primer lote de inspección de Claude

## Estado y alcance aprobado

Actualización de cierre: I-01–I-05 fueron autorizados y ejecutados; la revisión
privada terminó con identificación parcial, sin arranques de Claude. No se
creó expediente JSON por binding incompleto. El lote posterior de
[procedencia y viabilidad](agent-client-native-provenance-plan.md) también cerró;
su resultado parcial está registrado allí, sin admisión de inferencia.
Las secciones siguientes conservan el plan original y sus límites; las frases
de aprobación pendiente describen el estado anterior, no el cierre actual.

Plan preparado el 2026-10-04 tras «apruebo», referido al siguiente paso de
[C3.1a](agent-client-native-evaluation.md): preparar una evaluación local antes
de autorizar sus pruebas. Esta aprobación permite la preparación del lote,
no iniciar clientes, consultar cuentas o escribir un expediente privado nuevo.
Profundidad SDD: rigurosa. No se inspeccionó la instalación en esta preparación.

Cliente propuesto: **Claude Code**, proveedor Anthropic, por su rol previsto de
tutor/proponente. No cambiar a otro cliente si esta evaluación queda incompleta.
En la preparación original, versión, ruta, procedencia e identidad instaladas
todavía no se habían observado. Esa descripción es histórica: no sustituye la
identificación parcial registrada en el cierre ni acredita controles de arranque.

La primera inspección será exclusivamente de archivos de instalación. No ejecuta
Claude, ni siquiera para ayuda, versión, diagnósticos o autenticación. No llama
modelos ni pretende certificar aislamiento o facturación a partir de lecturas.

## Resultado buscado y límites

Entregar una identificación parcial comprobable y una matriz honesta de lo que
falta. La inspección podrá terminar correctamente con la automatización bloqueada.
No fabricar versión, huellas de configuración o evidencia para obtener JSON válido.

| Presupuesto propuesto | Límite de este lote |
| --- | --- |
| Arranques de Claude / turnos / llamadas a modelos | 0 / 0 / 0 |
| Red durante la inspección | Ninguna; no consultas de cuentas o descargas |
| Archivos de instalación | Máximo 32 archivos regulares, explícitamente vinculados al cliente |
| Lectura por artefacto / total | Hasta 512 MiB / 1 GiB, incremental y sin volcar contenidos |
| Metadatos textuales | Hasta 64 KiB por manifiesto; extraer solo nombre/versión/rutas de entrada pertinentes |
| Enlaces simbólicos | Hasta ocho saltos; resolver y registrar, no ejecutar el destino |
| Tiempo operativo | Hasta 120 segundos; detener ante exceso, no ampliar automáticamente |
| Escritura | Un lote privado nuevo, sin sobrescribir ni modificar instalaciones |

Estos límites controlan el trabajo de inspección, no cuotas ni garantías de un
cliente que no se arranca. El presupuesto del piloto anterior no se reutiliza.

## Operaciones del lote, por dependencia

| Paso | Operación autorizable | Evidencia o parada |
| --- | --- | --- |
| I-01 | Resolver el nombre `claude` sin invocarlo, en shell sin carga de perfiles | Identificar un archivo ejecutable; alias/función o ambigüedad detienen el lote |
| I-02 | Leer tipo, propietario, permisos y cadena de enlaces del artefacto | Rechazar dispositivo, FIFO, ruta remota o destino ajeno al cliente; sin búsqueda recursiva del home |
| I-03 | Leer manifiestos no secretos explícitamente asociados y calcular huellas acotadas | Identificar binario o wrapper/dependencias; no ejecutar código ni scripts de paquetes |
| I-04 | Releer identidad/estadísticas al finalizar las huellas | Cambio concurrente o sustitución deja `artifact-race-unresolved`; no repetir para esconderlo |
| I-05 | Crear observación y revisión mínimas en un destino privado nuevo | No generar expediente JSON si faltan campos de identidad obligatorios |

La resolución inicial puede leer el `PATH` para localizar el nombre, pero no
imprime el entorno ni ejecuta funciones/aliases o perfiles de usuario. El código
de inspección usa el runtime existente, no instala dependencias o ejecutables.

Las rutas dependientes se resuelven solo desde archivos concretos del paquete
identificado. No seguir recetas de scripts, URLs, rutas de configuración o
instrucciones embebidas. Si un wrapper no puede identificarse sin interpretar
código arbitrario, detener su evaluación y pedir una observación acotada.
No explorar carpetas de proyectos, otras versiones o instalaciones para completar
un candidato que falló. Hallar un nombre no prueba que sea el producto oficial.

Leer un manifiesto acredita su contenido observado, no la versión efectiva del
ejecutable. Un nombre de archivo, comentario, cadena encontrada en un binario o
versión declarada por un wrapper tampoco certifican esa versión. Sin fuente
suficiente, guardar `unknown` en Markdown y no inventar `clientVersion` en JSON.

## Archivos y datos que quedan excluidos

No leer almacenes de autenticación, keychain, tokens, `.env`, registros,
transcripciones, configuración de cuentas o recibos. Tampoco abrir `.claude.json`,
configuración global/proyecto, MCP o políticas administradas en este primer lote.
No obtener huellas de archivos secretos ni imprimir contenido de wrappers/binarios.
Si la identificación conduce a uno de esos archivos, detener esa rama de lectura.

No usar `claude --help`, `--version`, `doctor`, `auth status`, `models`, `-p`,
login, logout, update, install, plugins, MCP, servidor, sesiones o menús. No
modificar permisos/configuración para poder continuar, ni terminar sesiones ajenas.
No copiar autenticación o cambiar `HOME`, `CODEX_HOME` o raíces equivalentes.
No usar API keys, habilitar créditos o cambiar suscripciones.

## Evidencia y ubicación privadas propuestas

Destino lógico: `PRIVATE_EVALUATIONS_ROOT/c3-1b-claude-01`. El usuario debe
aprobar su ruta absoluta antes de escribir; la biblioteca no contiene datos de
instalaciones personales. Propuesta en este chat: un lote nuevo bajo la carpeta
Agent-Handoffs previamente elegida, fuera de Toolkit y Obsidian.

Antes de crear el lote: comprobar destino local, propiedad, ausencia de enlaces,
repositorios Git y carpetas sincronizadas conocidas. Si no puede determinarse
la privacidad del destino, detener la escritura. No eliminar ni reparar nada.
Creación exclusiva, directorio `0700`, archivos `0600`, sin sobrescrituras;
un lote existente exige otra decisión, no un nuevo sufijo automático.

Archivos previstos:

- `01-inspeccion.md`: fecha real, alcance, rutas privadas pertinentes, identidad
  y artefactos observados, huellas, procedencia y limitaciones. Sin texto crudo,
  emails, cuentas o capturas extensas.
- `02-expediente.json`: solo si existen todos los campos estructurales necesarios
  de C3.1a, usando evidencias parciales honestas; no rellenar con datos ficticios.
  Su omisión por identidad/configuración desconocida es un resultado previsto.
- `03-revision.md`: operaciones realmente realizadas, presupuesto de inspección,
  faltantes/bloqueos y siguiente prueba pendiente. No repetir el piloto anterior.

Las rutas y huellas reales se guardan exclusivamente en el lote privado. El
resumen compartido no las copia a Git ni a notas de memoria. No activar catálogos,
registros del adaptador, ledger C1/C2, autorización nativa o automatizaciones.

## Matriz de interpretación y cierre

La inspección de archivos no acredita el comportamiento de arranque. Controles
documentados siguen `documented`; los que no tengan prueba local pertinente,
`pending`. Una revisión de archivos puede aportar identidad parcial, no ascender
automáticamente los once controles a `locally-tested`.

| Aspecto | Resultado posible de este lote |
| --- | --- |
| Artefacto, ruta y huella | Observación local acotada; procedencia/completitud pueden seguir pendientes |
| Versión efectiva | Confirmada solo con evidencia suficiente; si no, `unknown` y sin JSON inventado |
| Herramientas, MCP, hooks, subagentes y personalizaciones | Documentación externa; efecto efectivo no probado |
| Configuración/entorno/política administrada | No inspeccionados; binding incompleto para admisión |
| Sesión de suscripción y gasto externo | No consultados; no verificados |
| Techo de llamadas, cancelación local/remota y efectos | No probados; automatización cerrada |

Las evaluaciones de acceso/consumo requieren otra operación autorizada y evidencia
pertinente. No renovar declaraciones antiguas del usuario ni presentar login o
plan declarado como garantía de gastos deshabilitados.

Criterios de cierre: operaciones y límites registrados; cero cliente/red/modelos;
sin lectura de secretos; artefactos sin modificación; escrituras privadas mínimas;
ningún gate certificado por el simple éxito de I-01–I-05. Incertidumbre, límite
excedido, ruta dudosa o cambio concurrente se conservan como resultado, no se
resuelven con un reintento o permisos ampliados.

## Fuentes y advertencias para una variante posterior

Fuentes oficiales consultadas el 2026-10-04; no prueban esta instalación:

- `--tools` vacío restringe incorporadas, no MCP. `--safe-mode` no elimina todas
  las políticas administradas: pueden conservar hooks y comandos de política.
  Por eso ninguno de esos flags, aislado, acredita arranque sin efectos.
  [Referencia CLI de Claude](https://code.claude.com/docs/en/cli-reference).
- `--bare` no usa login de suscripción. Sigue excluido de nuestra ruta sin API.
  No trasladar a este lote ejemplos de CI con credenciales de API.
  [Ejecución programática de Claude](https://code.claude.com/docs/en/headless).

En este lote no se aprobó una receta de lanzamiento. Consultar la documentación no confirma
que esas opciones existan o tengan el mismo alcance en una versión instalada.

## Revisión histórica previa y autorización original

Durante la preparación original, SDD delimitó un único lote de lectura y
escritura privada, separado de C3.2. Quality-gate revisó coherencia, límites,
formato y enlaces del plan antes de la inspección, no una instalación efectiva.
No se repitió la regresión de código en esa entrega documental.

Revisión documental histórica: **Aprobado con observaciones**. Formato, ocho enlaces
locales y siete tablas de los dos documentos revisados correctos; comprobación
de espacios y escaneo limitado de patrones sensibles sin hallazgos. La observación
principal era que el destino y la ejecución del lote aún no estaban autorizados.
En esa preparación no se consultaron instalaciones, cuentas o credenciales ni
se creó carpeta privada. Esos resultados describen la revisión original, no
comprobaciones repetidas en la consolidación actual.

La autorización que se pidió entonces abarcaba I-01–I-05 y la ruta privada
absoluta propuesta; posteriormente fue concedida y el lote cerró con el
resultado parcial descrito al inicio. No queda aquí una solicitud vigente para
repetirlo. Su alcance excluía clientes, cuentas, inferencia, commit y push.
Ampliar lecturas, destino o efectos sigue requiriendo autorización específica.

## Consolidación documental — 2026-10-09

El usuario autorizó aclarar el estado histórico y crear un commit local de
este documento y el de procedencia, sin push ni nuevas inspecciones. Se
conservan las operaciones, presupuestos, fuentes con su fecha original y
limitaciones del plan; no se copiaron rutas, huellas o evidencia personal.

Quality-gate: **Aprobado para consolidación documental**. Se revisaron los
enlaces locales, tablas y formato de ambos documentos; el código no cambió
y no se repitió la regresión funcional. Esto no renueva una revisión de
instalación, consentimiento o controles nativos.

El estado posterior del diagnóstico está en
[AD-1/AD-2](agent-client-auth-diagnostic.md#ad-10-consolidación-local-y-correcciones-del-límite-de-invocación).
Sus pruebas sintéticas no autorizan AD-3. No se reejecutaron I-01–I-05,
consultaron cuentas ni arrancaron clientes en esta consolidación.
