# Guía de uso de Agent Toolkit

Esta guía reúne la información técnica que antes estaba en el README principal.
Para conocer el propósito sin entrar en comandos, vuelve a la
[presentación del proyecto](../README.md).

Los ejemplos que empiezan con `project-memory` presuponen que el comando está
instalado en tu equipo. Desde el repositorio también puedes ejecutarlos usando
`node bin/project-memory.js` seguido de la operación. `npm install` instala las
dependencias, pero por sí solo no instala el comando globalmente.

Núcleo personal y reutilizable para conectar agentes con distintos proyectos sin mezclar su contexto específico. Reúne Skills, perfiles especializados y el contrato base del sistema de memorias de proyecto.

## Estructura

- `skills/`: procedimientos reutilizables compatibles con el formato `SKILL.md`.
- `agents/codex/`: agentes personales de Codex en formato TOML.
- `agents/claude/`: subagentes personales de Claude Code en Markdown con frontmatter YAML.
- `docs/`: arquitectura, decisiones y guías del sistema reutilizable.
- `schemas/`: contratos verificables para manifiestos y configuraciones.
- `bin/`: punto de entrada de la CLI `project-memory`.
- `src/`: diagnósticos y operaciones seguras de la CLI.
- `test/`: pruebas automáticas con el ejecutor nativo de Node.js.

La arquitectura inicial del sistema de memoria está en [`docs/project-memory-system.md`](project-memory-system.md). Su manifiesto se valida con [`schemas/project-memory.schema.json`](../schemas/project-memory.schema.json).

## Skills disponibles

- `spec-driven-development`: transforma una necesidad en especificación, plan, tareas y verificación.
- `decision-records`: documenta decisiones confirmadas con contexto y consecuencias.
- `project-handoff`: prepara traspasos breves y verificables entre sesiones o agentes.
- `quality-gate`: revisa entregas contra requisitos, riesgos y evidencia.

## Perfiles disponibles

- `project_explorer`: explora repositorios en modo de solo lectura.
- `requirements_analyst`: convierte necesidades en requisitos comprobables.
- `solution_architect`: compara alternativas técnicas y sus consecuencias.
- `quality_reviewer`: detecta defectos, riesgos y pruebas faltantes.
- `docs_researcher`: consulta documentación oficial y versionada.
- `implementation_tutor`: guía implementaciones paso a paso sin sustituir al usuario.

## Instalación local

Este repositorio es la fuente canónica. Sus componentes se instalan mediante enlaces simbólicos:

- Skills para Codex: `~/.agents/skills/`.
- Skills para Claude Code: `~/.claude/skills/`.
- Skills para Gemini CLI: `~/.gemini/antigravity-cli/skills/`.
- Agentes para Codex: `~/.codex/agents/`.
- Agentes para Claude Code: `~/.claude/agents/`.

Los enlaces evitan copias divergentes: una actualización en esta biblioteca queda disponible para las plataformas conectadas después de reiniciar la sesión cuando sea necesario.

## Memorias de proyecto

Cada proyecto conserva por separado:

- su repositorio como fuente principal de verdad;
- una bóveda privada para contexto estable;
- un MCP de solo lectura;
- una Skill específica que aplica búsqueda progresiva;
- reglas de escritura y sincronización controladas.

`Agent-Toolkit` contiene únicamente componentes reutilizables. No almacena el conocimiento privado de los proyectos.

## Diagnóstico de una memoria

La primera herramienta ejecutable es `project-memory doctor`. Inspecciona una memoria sin modificarla.

```bash
npm install
node bin/project-memory.js doctor /ruta/a/la/memoria
```

Opciones principales:

- `--manifest <ruta>`: utiliza un manifiesto concreto.
- `--json`: devuelve un informe estructurado.
- `--strict`: trata las advertencias como error.

La guía completa está en [`docs/project-memory-doctor.md`](project-memory-doctor.md).

## Crear una memoria

`project-memory init` genera una vista previa segura de una memoria canónica:

```bash
project-memory init /ruta/al/proyecto-memory \
  --project-id mi-proyecto \
  --project-name "Mi Proyecto" \
  --source /ruta/al/repositorio
```

La creación solo ocurre al repetir el comando con `--apply`. No sobrescribe archivos distintos ni configura Git, MCP o agentes por su cuenta. Consulta [`docs/project-memory-init.md`](project-memory-init.md) para ver el contrato completo.

## Conectar un agente

`project-memory connect` inspecciona y prepara la Skill, el MCP y la política de
solo lectura de una plataforma concreta:

```bash
project-memory connect /ruta/a/proyecto-memory --agent codex
project-memory connect /ruta/a/proyecto-memory --agent claude
project-memory connect /ruta/a/proyecto-memory --agent gemini
```

La vista previa no modifica el equipo. Después de revisarla, `--apply` crea
únicamente los elementos ausentes y se detiene ante enlaces o servidores
homónimos diferentes. La guía completa está en
[`docs/project-memory-connect.md`](project-memory-connect.md).

## Consultar el estado

`project-memory status` reúne el diagnóstico de la bóveda y la comprobación de
todas las conexiones habilitadas:

```bash
project-memory status /ruta/a/proyecto-memory
```

La orden es de solo lectura. Admite `--agent`, `--json` y `--strict`, y distingue
entre un sistema saludable, una conexión pendiente y un conflicto. Consulta
[`docs/project-memory-status.md`](project-memory-status.md) para ver el
contrato completo.

## Planificar una sincronización

`project-memory sync plan` detecta los Pull Requests de GitHub que fueron
fusionados en la rama configurada y todavía no aparecen como revisados en el
registro Markdown de la memoria:

```bash
project-memory sync plan /ruta/a/proyecto-memory
```

La orden es de solo lectura: no modifica notas, no registra PR y no crea commits.
Admite `--limit`, `--json` y `--strict`. Consulta
[`docs/project-memory-sync.md`](project-memory-sync.md) para ver el contrato
completo.

## Inspeccionar un cambio fusionado

`sync inspect` reúne evidencia de un PR explícito y sugiere áreas de la memoria
que conviene revisar. Usa el repositorio y la rama declarados en el manifiesto:

```bash
project-memory sync inspect /ruta/a/proyecto-memory --pr 42
project-memory sync inspect /ruta/a/proyecto-memory --pr 42 --json --strict
```

El número `42` es un ejemplo: sustitúyelo por el PR que quieras inspeccionar.
Requiere GitHub CLI (`gh`) disponible y autenticado para ese repositorio.
No descarga código ni diffs, no ejecuta pruebas y no modifica notas ni el registro.
Los estados `ready`, `partial` y `blocked` describen la evidencia disponible;
`ready` no aprueba el código ni autoriza actualizar Obsidian. Con `--strict`,
`partial` y `blocked` devuelven código 1. Admite `--max-files` (200 por defecto).
Consulta el [contrato y la evidencia local](project-memory-sync-inspect.md).

## Registrar una revisión terminada

`sync record` deja constancia de una conclusión ya revisada. Su vista previa
consulta GitHub, verifica el PR fusionado y comprueba el registro y los cambios
locales, sin escribir archivos:

```bash
project-memory sync record /ruta/a/proyecto-memory \
  --pr 42 --outcome no-documentation-change --reviewed
```

Si el resultado es correcto y autorizas guardar la fila, repite la orden con
`--apply`. Si actualizaste notas, declara un resumen y sus rutas exactas:

```bash
project-memory sync record /ruta/a/proyecto-memory \
  --pr 42 --outcome documentation-updated --reviewed \
  --summary "Actualizar el contrato de integración" \
  --note "03-IMPLEMENTACION/Contrato de integración.md"
```

El PR, la ruta y la nota son ejemplos; usa las rutas permitidas de tu memoria.
Las notas deben estar editadas y revisadas antes: el comando no las redacta.
`--reviewed` declara una revisión semántica terminada; no certifica el código.
Admite `--manifest` y `--json`. No admite `--force`, `--commit` ni `--push`.

Para registrar una revisión nueva exige comprobaciones completas y satisfactorias;
se detiene ante archivos ajenos, conflictos, enlaces inseguros o patrones de
secretos. Repetir el mismo resultado conserva la fila y su fecha.
**No edites ni sincronices la memoria durante `--apply`**: su bloqueo coordina
esta herramienta, no Obsidian ni otros editores.

La nueva base está implementada, probada y aprobada para su commit local;
su publicación está pendiente. Consulta [el contrato y sus límites](project-memory-sync-record.md)
antes de aplicarla sobre una memoria real. No añade archivos a Git ni hace push.

## Límites

- No guardar secretos, credenciales, tokens ni datos personales.
- No incluir conocimiento exclusivo de un proyecto.
- Mantener las instrucciones específicas dentro del repositorio o memoria de cada proyecto.
- Revisar y validar cada componente antes de instalarlo.
- Mantener los perfiles generales en modo de solo lectura salvo que exista una necesidad y autorización claras.

## Versionado

La biblioteca se versiona con Git y se respalda en un repositorio privado de
GitHub. Esta publicación manual no añade creación de remotos a la CLI.
