# Asistente por pasos y recomendador de skills

Agent Toolkit incluye un asistente interactivo en terminal por pasos (inspirado en flujos tipo `autoskills` / `clack`, con motor y catálogo propios sobre Node.js 24) y un subcomando en solo lectura para detectar el stack de un proyecto e instalar skills verificadas con hashes SHA-256.

## Uso rápido

```sh
# Abrir el asistente guiado por pasos en el proyecto actual (requiere terminal TTY)
npx nexakit
npx nexakit tui --project /ruta/al/proyecto

# Consultar recomendaciones en solo lectura (texto o JSON)
npx nexakit recommend --project /ruta/al/proyecto
npx nexakit recommend --project /ruta/al/proyecto --dry-run --json

# Desacoplar NexaKit del proyecto (vista previa segura primero, --apply para ejecutar)
npx nexakit detach --project /ruta/al/proyecto
npx nexakit detach --project /ruta/al/proyecto --apply
```
*(También puedes usar `node bin/nexakit.js` o el alias local `agent-toolkit`).*

## Flujo del asistente en 4 pasos (`agent-toolkit`)

1. **Paso 1 — Destino, modo y Git ignore:** elige los clientes (`Claude + Codex`, `Solo Claude` o `Solo Codex`), cómo ocultar el acoplamiento en Git y el modo en el proyecto:
   - **Enlace simbólico (por defecto):** enlaza `.agents/skills/<skill>` y `.claude/skills/<skill>` hacia la copia verificada de Agent Toolkit.
   - **Copia verificada + `.agent-toolkit/skills-lock.json`:** verifica cada archivo por SHA-256, lo copia localmente al proyecto y guarda tanto el manifiesto (`manifest.json`) como `skills-lock.json` dentro de `.agent-toolkit/` (sin dejar archivos sueltos en la raíz).
   - **Ignorar en Git:** bloque delimitado gestionado en `.gitignore` (por defecto) o en `.git/info/exclude` (100 % invisible en `git status` sin modificar el `.gitignore` del equipo).
2. **Paso 2 — Skills fundamentales verificadas para tu stack:** muestra únicamente las skills que encajan con las tecnologías observadas en `package.json` / `tsconfig.json` (premarcadas cuando aún no están instaladas).
3. **Paso 3 — Skills opcionales y añadidos:** separa en una pantalla propia las demás skills verificadas del catálogo (desmarcadas por defecto) y los complementos externos independientes como [obra/superpowers](superpowers-integration.md) (`7.0.1`, MIT).
4. **Paso 4 — Vista previa e integridad SHA-256:** comprueba en vivo los hashes SHA-256 contra [`catalogs/skills.json`](../../catalogs/skills.json), lista cada enlace, copia, registro en `.agent-toolkit/` y regla de ignore antes de escribir, respeta cualquier conflicto sin sobrescribir y cierra con la chuleta de comandos lista para empezar (accesible también en cualquier paso pulsando `c`).

## Desacoplado limpio del proyecto (`[d]` o `agent-toolkit detach`)

Cuando quieras retirar Agent Toolkit de un proyecto sin dejar rastro en Git ni en el árbol de trabajo:

- **Desde el asistente interactivo:** pulsa **`[d]`** en cualquier paso para abrir la vista previa segura de desacoplado y confirma con `Enter` / `s` (o cancela con `Esc` sin borrar nada).
- **Desde terminal:** ejecuta `agent-toolkit detach --project <ruta>` para revisar qué se retiraría y añade `--apply` para aplicarlo (`--global` retira además los enlaces globales en `~/.claude` / `~/.agents` y los `nivel_*.toml` generados en `~/.codex/agents`).
- **Garantías de seguridad:** elimina únicamente los enlaces creados hacia Agent Toolkit o las copias cuyos archivos coinciden por `SHA-256` con el catálogo, retira `.agent-toolkit/`, limpia el bloque gestionado en `.gitignore` / `.git/info/exclude` y poda carpetas vacías (`.agents/skills`, `.claude/skills`), conservando intacta cualquier skill propia o archivo editado por el usuario.

## Catálogo curado de 10 skills verificadas

El catálogo vive en [`catalogs/skills.json`](../../catalogs/skills.json) y se valida con [`schemas/skill-catalog.schema.json`](../../schemas/skill-catalog.schema.json) mediante [`src/skill-catalog.js`](../../src/skill-catalog.js). Las skills específicas de stack residen en `catalogs/skills/` para no contaminar las carpetas globales de proyectos que no usan esas tecnologías:

- **Frontend / React / Next.js:** `vercel-react-best-practices` (MIT), `vercel-composition-patterns` (MIT), `frontend-design` (Apache-2.0), `web-design-guidelines` (MIT), `webapp-testing` (Apache-2.0).
- **Bases de datos:** `supabase-postgres-best-practices` (MIT).
- **Backend Node.js y APIs:** `nodejs-backend-patterns` (MIT), `api-design-principles` (MIT).
- **Servidores MCP y seguridad transversal:** `mcp-builder` (Apache-2.0), `differential-review` (CC-BY-SA-4.0).
