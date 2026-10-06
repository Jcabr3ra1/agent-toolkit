<p align="center">
  <img src="assets/brand/agent-toolkit-mark.png" alt="Símbolo de Agent Toolkit: piezas conectadas alrededor de una memoria común" width="144">
</p>

<h1 align="center">Agent Toolkit</h1>

<p align="center"><strong>El contexto de tu proyecto, compartido entre tus agentes.</strong></p>

<p align="center">Una memoria organizada · Varios agentes · Tú mantienes el control</p>

## ¿Para qué sirve?

Cambias de chat o de asistente y vuelves a explicar el proyecto desde cero.
Las decisiones quedan dispersas, las notas envejecen y se repite trabajo que
ya estaba hecho.

Agent Toolkit ayuda a organizar ese contexto para que tus agentes encuentren
lo que necesitan, sepan dónde comprobarlo y puedan continuar con menos
explicaciones repetidas.

No es otro chatbot ni un agente que hace todo por su cuenta. Es una caja de
herramientas para conectar asistentes con una memoria de proyecto clara,
compartida y mantenible.

## Una memoria que puedes entender

**Obsidian sigue siendo parte del sistema.** Allí puedes leer y organizar las
notas del proyecto: su propósito, arquitectura, decisiones, avances y pendientes.
Son archivos de texto; no una memoria invisible que solo entiende una IA.

Los agentes consultan esa misma información mediante una conexión limitada.
Sus instrucciones les ayudan a buscar primero y leer solo lo pertinente.
El código y las pruebas del proyecto siguen siendo la fuente principal de
verdad: las notas explican el contexto, no lo sustituyen.

## Lo que puedes hacer hoy

- **Preparar una memoria nueva** con una estructura común, sin copiar los datos
  de otro proyecto ni sobrescribir archivos distintos.
- **Conectar Codex, Claude Code y Gemini CLI** mediante sus configuraciones
  locales de Skills y acceso de lectura. Cada conexión requiere comprobarse
  también en el cliente real.
- **Detectar problemas** en la estructura, los enlaces, la configuración y
  posibles secretos antes de seguir trabajando.
- **Consultar el estado** de la memoria y de las conexiones declaradas.
- **Encontrar cambios integrados en GitHub** que aún no aparecen como revisados
  en el registro de la memoria.
- **Reunir evidencia de un cambio**: qué archivos afectó, qué comprobaciones
  tiene y qué áreas de las notas conviene revisar.
- **Registrar una revisión terminada** con vista previa y autorización explícita,
  sin duplicar su registro ni escribir otras notas.
- **Aplicar cambios de notas ya revisados**: muestra las diferencias, exige la
  huella del plan aprobado y comprueba versiones, enlaces y evidencia antes
  de reemplazar únicamente las notas enumeradas.
- **Preparar un encargo para otro agente**: a partir de los datos explícitos
  de una tarea, sugiere modelo y esfuerzo y arma un borrador que revisas y
  entregas tú. La sugerencia usa datos revisados que tú proporcionas; no
  comprueba cuentas, disponibilidad actual ni qué modelo responderá. No envía
  el encargo ni arranca otros asistentes.
- **Comprobar una entrega contra lo revisado**: detecta diferencias en los
  archivos que indicas, antes o después del trabajo. No revisa archivos fuera
  de esa lista ni sustituye la revisión de calidad.

También incluye procedimientos reutilizables para definir requisitos,
documentar decisiones, revisar calidad y pasar trabajo entre sesiones, junto
con perfiles especializados de exploración, análisis y tutoría.

## Cómo encaja en tu trabajo

1. **Organizas el proyecto.** Su código vive en su repositorio y su contexto en
   una memoria independiente.
2. **Conectas tus asistentes.** Consultan las notas relevantes y contrastan las
   afirmaciones con las fuentes del proyecto.
3. **Desarrollas y revisas los cambios.** Una rama en progreso no se presenta
   como comportamiento ya integrado.
4. **Revisas el impacto en la memoria.** Las herramientas actuales detectan e
   inspeccionan cambios; una persona o un agente autorizado decide qué notas
   deben actualizarse.

La consulta de memoria está separada de su escritura. La CLI puede aplicar
texto previamente redactado y autorizado y registrar una conclusión revisada
en otra operación. No redacta ni actualiza automáticamente las notas técnicas.
Registrar tampoco significa aprobar el código.

## Pensado para más de un proyecto

Agent Toolkit contiene las herramientas generales. Cada proyecto conserva su
propia memoria, instrucciones y límites de acceso.

Puedes reutilizar la estructura sin llevarte las decisiones, documentos
privados o credenciales de un proyecto a otro. Clonar esta biblioteca tampoco
clona las memorias ni conecta automáticamente los agentes.

## Control y límites claros

- Las conexiones de memoria se preparan con herramientas de **solo lectura**.
- Crear memorias y conexiones tiene una vista previa; aplicar cambios exige
  una acción explícita.
- No se deben guardar contraseñas, tokens, credenciales ni datos personales en
  las memorias. Las comprobaciones ayudan, pero no garantizan detectar todo.
- La herramienta se detiene ante los conflictos que comprueba; no intenta
  resolverlos sobrescribiendo archivos.
- No instala un sistema de permisos sin restricciones ni garantiza que todos
  los clientes se comporten igual.

## En qué punto está

**Base funcional en desarrollo · versión 0.1.0.** La entrega versionada
localmente y verificada el 6 de octubre de 2026 pasó 1.001 pruebas automatizadas.
Las etapas experimentales que aún no forman parte de esa entrega se revisan
por separado. También hay una inspección real de GitHub documentada; nada de
esto equivale a una certificación de producción o de todos los sistemas operativos.

| Etapa | Estado |
| --- | --- |
| Crear, diagnosticar y conectar memorias | Implementado |
| Consultar el estado de las conexiones | Implementado |
| Detectar e inspeccionar cambios fusionados | Implementado |
| Registrar revisiones sin duplicarlas | Implementado y probado localmente; pendiente de publicación |
| Aplicar notas revisadas con autorización y verificaciones | Versionado y probado localmente; publicación pendiente |
| Integrar el ciclo completo con una automatización | Pendiente |
| Preparar borradores de encargo tutor o autónomo | Versionado y probado localmente; entrega manual, publicación pendiente |
| Comprobar archivos de una entrega contra lo revisado | Versionado y probado localmente; solo archivos indicados, publicación pendiente |
| Lanzar agentes o aplicar encargos automáticamente | Pendiente; sin ejecución nativa admitida |
| Búsqueda semántica y nuevos proveedores | Evolución posterior, no comprometida |

El objetivo de la primera versión completa es cerrar el ciclo de revisión y
mantenimiento con controles. Las capacidades avanzadas se añadirán cuando
resuelvan una necesidad comprobada, no como requisitos para empezar.

## ¿Quieres usarlo o entender cómo está construido?

- [Guía de uso e instalación](docs/uso.md): comandos y conexiones locales.
- [Arquitectura del sistema](docs/project-memory-system.md): separación de
  herramientas, código y memoria.
- [Registro de revisiones](docs/project-memory-sync-record.md): comportamiento,
  controles y evidencia de la nueva base local.
- [Aplicación de notas revisadas](docs/project-memory-sync-apply.md): plan
  aprobado, escritura limitada y tratamiento de resultados parciales.
- [Preparación de encargos](docs/agent-task-prepare.md): borrador revisable,
  límites y ejemplo ficticio.
- [Comprobación de entregas](docs/agent-task-verify.md): comparación de los archivos
  indicados, sin aprobación automática ni ejecución de agentes.
- [Identidad visual](assets/brand/README.md): concepto y origen del logo.

La biblioteca se respalda en GitHub como repositorio privado. No incluye las
bóvedas de los proyectos ni publica su contenido.
