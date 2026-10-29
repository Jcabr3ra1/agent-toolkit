# Project Memory Init

`project-memory init` prepara una memoria canónica para un proyecto existente. La vista previa es el comportamiento predeterminado; solo `--apply` autoriza la creación de archivos.

## Uso mínimo

```bash
project-memory init /ruta/a/proyecto-memory \
  --project-id mi-proyecto \
  --project-name "Mi Proyecto" \
  --source /ruta/al/repositorio
```

Para aplicar exactamente el plan mostrado:

```bash
project-memory init /ruta/a/proyecto-memory \
  --project-id mi-proyecto \
  --project-name "Mi Proyecto" \
  --source /ruta/al/repositorio \
  --apply
```

## Opciones

| Opción | Uso |
| --- | --- |
| `--project-id <id>` | Identificador en minúsculas y guiones. |
| `--project-name <nombre>` | Nombre visible del proyecto. |
| `--description <texto>` | Descripción breve de la memoria. |
| `--source <ruta>` | Repositorio Git que seguirá siendo la fuente principal de verdad. |
| `--default-branch <rama>` | Rama principal; por defecto `main`. |
| `--integration-branch <rama>` | Rama de integración; por defecto coincide con la principal. |
| `--source-remote <url>` | Remoto del código, siempre sin credenciales incrustadas. |
| `--memory-remote <url>` | Remoto futuro de la memoria, sin credenciales. |
| `--sync-mode <modo>` | `none`, `git-manual` o `git-automated`. |
| `--mcp-name <nombre>` | Nombre del MCP; por defecto `<project-id>-memory`. |
| `--json` | Emite el plan o resultado en JSON. |
| `--apply` | Crea los archivos después de validar todo el plan. |

## Garantías

- No modifica el repositorio fuente.
- No crea repositorios Git, remotos, MCP ni enlaces globales.
- Rechaza destinos iguales, internos o contenedores del repositorio fuente.
- Rechaza rutas raíz y el directorio personal como destinos directos.
- No escribe nada si existe un conflicto.
- Una segunda ejecución idéntica no reescribe archivos.
- Nunca admite credenciales incrustadas en URLs.

## Resultado

El destino contiene:

- `project-memory.json` con seguridad de solo lectura;
- la estructura canónica de la bóveda;
- una Skill específica en `07-AGENTES/skills/<project-id>`.

Después de aplicar, se debe ejecutar `project-memory doctor <destino> --strict` antes de configurar Git o conectar agentes.
