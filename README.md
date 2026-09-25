# Agent Toolkit

Biblioteca personal y reutilizable de Skills y perfiles de agentes para trabajar con distintos proyectos sin mezclar su contexto específico.

## Estructura

- `skills/`: procedimientos reutilizables compatibles con el formato `SKILL.md`.
- `agents/codex/`: agentes personales de Codex en formato TOML.
- `agents/claude/`: subagentes personales de Claude Code en Markdown con frontmatter YAML.

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
- Agentes para Codex: `~/.codex/agents/`.
- Agentes para Claude Code: `~/.claude/agents/`.

Los enlaces evitan copias divergentes: una actualización en esta biblioteca queda disponible para ambas plataformas después de reiniciar la sesión cuando sea necesario.

## Límites

- No guardar secretos, credenciales, tokens ni datos personales.
- No incluir conocimiento exclusivo de un proyecto.
- Mantener las instrucciones específicas dentro del repositorio o memoria de cada proyecto.
- Revisar y validar cada componente antes de instalarlo.
- Mantener los perfiles generales en modo de solo lectura salvo que exista una necesidad y autorización claras.

## Versionado

La biblioteca se versiona localmente con Git. La creación de un repositorio remoto es una decisión separada.
