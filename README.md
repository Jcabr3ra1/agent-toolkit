# Agent Toolkit

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

La arquitectura inicial del sistema de memoria está en [`docs/project-memory-system.md`](docs/project-memory-system.md). Su manifiesto se valida con [`schemas/project-memory.schema.json`](schemas/project-memory.schema.json).

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

La guía completa está en [`docs/project-memory-doctor.md`](docs/project-memory-doctor.md).

## Límites

- No guardar secretos, credenciales, tokens ni datos personales.
- No incluir conocimiento exclusivo de un proyecto.
- Mantener las instrucciones específicas dentro del repositorio o memoria de cada proyecto.
- Revisar y validar cada componente antes de instalarlo.
- Mantener los perfiles generales en modo de solo lectura salvo que exista una necesidad y autorización claras.

## Versionado

La biblioteca se versiona localmente con Git. La creación de un repositorio remoto es una decisión separada.
