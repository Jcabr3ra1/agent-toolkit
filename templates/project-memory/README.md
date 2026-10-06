# Plantilla canónica de memoria de proyecto

Esta plantilla es una base reutilizable para organizar la memoria de un proyecto: sus decisiones, su arquitectura, sus entregas y el contexto que necesitan los agentes, guardados aparte del código fuente. Cada proyecto empieza con una copia limpia, sin información de otros proyectos. Copiarla no deja la memoria ni la conexión con los agentes funcionando: hay que personalizarla, validarla y comprobarla como se explica más abajo.

## Contenido

- `project-memory.example.json`: manifiesto válido y seguro que sirve como punto de partida.
- `vault/`: estructura mínima para una bóveda de Obsidian versionada con Git.
- `skill/project-id/`: Skill específica que enseña a los agentes cómo consultar la memoria.

## Variables de plantilla

Los archivos Markdown utilizan estas variables:

| Variable | Significado |
| --- | --- |
| `{{PROJECT_ID}}` | Identificador corto en minúsculas y con guiones |
| `{{PROJECT_NAME}}` | Nombre visible del proyecto |
| `{{SOURCE_REPOSITORY}}` | Ruta o nombre del repositorio fuente |
| `{{MEMORY_REPOSITORY}}` | Nombre del repositorio privado de memoria |
| `{{MCP_SERVER_NAME}}` | Nombre único del servidor MCP |
| `{{DEFAULT_BRANCH}}` | Rama principal del repositorio fuente |
| `{{INTEGRATION_BRANCH}}` | Rama donde se integran cambios, si existe |
| `{{DATE}}` | Fecha absoluta en formato `AAAA-MM-DD` |

El comando `project-memory init` ya sustituye estas variables al preparar una memoria nueva. Por defecto muestra una vista previa; solo `--apply` crea los archivos. No configura Git, MCP ni enlaces globales. Consulta la [guía de creación](../../docs/project-memory-init.md) y ejecuta `project-memory doctor <destino> --strict` antes de conectar agentes. En una preparación manual, sustituye las variables antes de activar la Skill.

## Estructura de la bóveda

```text
vault/
├── 00-INICIO/
├── 01-PRODUCTO/
├── 02-ARQUITECTURA/
├── 03-IMPLEMENTACION/
├── 04-DECISIONES/
├── 05-ENTREGAS/
├── 06-OPERACION/
├── 07-AGENTES/
├── 08-RECURSOS/
└── 09-ARCHIVO/
```

Las carpetas representan responsabilidades estables. Un proyecto puede añadir áreas propias sin cambiar el significado de las existentes.

El manifiesto utiliza `memory.layout.profile: canonical-v1` para exigir esta estructura. Una memoria anterior con una organización estable diferente puede usar el perfil `declared` y enumerar sus carpetas y notas fundamentales, sin renombrarlas ni duplicarlas.

## Alternativa de preparación manual

1. Copiar esta carpeta fuera de `Agent-Toolkit`.
2. Reemplazar todas las variables `{{...}}`.
3. Adaptar `project-memory.example.json` y validarlo con el esquema canónico.
4. Renombrar la carpeta de la Skill con `{{PROJECT_ID}}`.
5. Crear un repositorio Git privado para la bóveda.
6. Configurar un MCP limitado a la ruta de la bóveda y desactivar sus herramientas de escritura.
7. Enlazar la Skill en cada agente y comprobar una consulta real.

## Reglas de seguridad

- No copiar archivos `.env`, credenciales, tokens ni claves.
- No incluir secretos dentro de URLs del manifiesto.
- No habilitar escritura MCP.
- No sobrescribir una bóveda existente.
- No presentar una integración como activa antes de comprobarla.
- No tratar ramas abiertas como estado vigente.

La plantilla es una base, no una instalación terminada. Debe personalizarse y validarse para cada proyecto.
