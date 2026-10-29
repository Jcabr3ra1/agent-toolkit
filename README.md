<p align="center">
  <img src="assets/brand/agent-toolkit-mark.png" alt="Logo de Agent Toolkit: módulos morados y lilas alrededor de un núcleo hexagonal" width="240">
</p>

<h1 align="center">Agent Toolkit</h1>

<p align="center"><strong>El contexto de tu proyecto, compartido entre los agentes que tú eliges.</strong></p>

<p align="center">Memoria por proyecto · herramientas revisables · control humano</p>

<p align="center"><sub>v0.1.0 · beta privada · requiere acceso al repositorio</sub></p>

---

## Una memoria clara para trabajar con varios agentes

Agent Toolkit reúne herramientas locales para que Codex, Claude y otros
asistentes puedan consultar el contexto estable de un proyecto. El código sigue
siendo la fuente principal de verdad; la memoria vive aparte, en archivos que
puedes leer y organizar.

No es otro chatbot ni un agente que hace todo por su cuenta. Prepara conexiones,
diagnósticos y encargos para que tú revises cada paso antes de aplicarlo o
entregarlo.

## Qué puedes hacer

- **Crear y revisar memorias de proyecto.** Prepara una estructura separada del
  repositorio y comprueba su estado antes de conectarla.
- **Conectar Codex o Claude.** Configura una consulta de solo lectura a la
  memoria, con una vista previa antes de modificar la configuración del agente.
- **Preparar encargos revisables.** Define alcance, criterios y modo tutor o
  autónomo; la herramienta genera un borrador y tú decides si lo entregas.
- **Comprobar cambios concretos.** Compara archivos enumerados con sus huellas y
  reúne evidencia para una revisión.
- **Coordinar revisiones entre sesiones.** Prepara el contexto y los resultados
  para una entrega manual entre agentes.

La biblioteca incluye además perfiles de exploración, análisis, arquitectura,
documentación, tutoría y revisión de calidad.

## Inicio rápido

Necesitas acceso al repositorio privado y **Node.js 24.x**. Desde una terminal:

```bash
git clone https://github.com/Jcabr3ra1/agent-toolkit.git
cd agent-toolkit
node --version
npm ci --ignore-scripts
```

`node --version` debe mostrar una versión 24.x. Instala las dependencias desde
la raíz del repositorio y comprueba las herramientas:

```bash
node bin/project-memory.js --help
node bin/agent-task.js --help
```

No requiere una instalación global: ejecuta los comandos con `node bin/...`
desde la carpeta `agent-toolkit`. El paquete es privado y no está publicado en
npm.

## Instala las skills y comprueba tu equipo

```bash
node bin/agent-toolkit.js doctor --agent all
node bin/agent-toolkit.js setup --agent all
```

`setup` muestra una vista previa. Añade `--apply` para enlazar las skills sin
reemplazar destinos existentes; devuelve los comandos de registro MCP como pasos
explícitos. Superpowers se instala aparte y es opcional. Consulta la
[guía de instalación, consumo y recuperación](docs/guias/consolidacion.md).

La skill global `cerrar-memoria` sirve para todos los proyectos, incluidos Agent
Toolkit y AVISENS: `/cerrar-memoria` en Claude y `$cerrar-memoria` en Codex.
Identifica la bóveda y las ramas por su manifiesto y conserva las reglas locales.
Los proyectos nuevos reutilizan ese cierre; `cerrar-avisens` es un alias compatible.

Gemini aporta consultas, investigación, análisis de texto/imágenes/PDF/vídeo y
generación de imágenes mediante Antigravity. El audio automático está bloqueado
tras fallar su validación nativa. Consulta [capacidades y uso](docs/guias/herramientas-gemini.md).

## Prepara y conecta una memoria

Reemplaza `/ruta/a/mi-proyecto` por la ruta real de tu repositorio. Primero
prepara una memoria en **vista previa**; este comando no escribe archivos:

```bash
node bin/project-memory.js init ../memoria-mi-proyecto \
  --project-id mi-proyecto \
  --project-name "Mi Proyecto" \
  --source /ruta/a/mi-proyecto
```

Revisa el destino y el plan que muestra la herramienta. Si son correctos,
repite el mismo comando añadiendo `--apply` para crear la memoria. Después,
compruébala:

```bash
node bin/project-memory.js doctor ../memoria-mi-proyecto
```

Para preparar una conexión de solo lectura con Codex, primero revisa su vista
previa:

```bash
node bin/project-memory.js connect ../memoria-mi-proyecto --agent codex
```

Si el plan es correcto, repítelo con `--apply`:

```bash
node bin/project-memory.js connect ../memoria-mi-proyecto --agent codex --apply
node bin/project-memory.js status ../memoria-mi-proyecto
```

Para Claude, cambia `codex` por `claude`. Después de aplicar la conexión,
reinicia la sesión del agente y prueba una consulta pequeña sobre una nota que
ya conozcas. La conexión no instala Codex ni Claude Code.

## Empieza sin tocar un proyecto real

La [guía de primeros pasos](docs/guias/primeros-pasos.md) usa datos ficticios y explica
cómo probar los comandos sin conectar cuentas, modificar un proyecto ni ejecutar
modelos de IA.

## Documentación

El [índice de documentación](docs/README.md) reúne las guías y referencias por tema.

| Necesito… | Guía |
| --- | --- |
| Probar la herramienta paso a paso | [Primeros pasos](docs/guias/primeros-pasos.md) |
| Consultar comandos y opciones | [Guía de comandos](docs/guias/guia-de-comandos.md) |
| Entender el uso completo | [Guía de uso](docs/guias/uso.md) |
| Crear una memoria | [Project Memory Init](docs/memoria/project-memory-init.md) |
| Conectar Codex o Claude | [Project Memory Connect](docs/memoria/project-memory-connect.md) |
| Diagnosticar una memoria y sus conexiones | [Project Memory Status](docs/memoria/project-memory-status.md) |
| Entender la arquitectura | [Sistema de memoria](docs/memoria/project-memory-system.md) |
| Preparar y comprobar encargos | [Preparar encargos](docs/agentes/coordinacion/agent-task-prepare.md) · [Verificar entregas](docs/agentes/coordinacion/agent-task-verify.md) |
| Coordinar revisión entre sesiones | [Flujo de revisión cruzada](docs/agentes/coordinacion/peer-review-workflow.md) |
| Usar las herramientas de Gemini | [Herramientas de Gemini](docs/guias/herramientas-gemini.md) |
| Revisar la identidad visual | [Identidad de marca](assets/brand/README.md) |

## Límites y cuidado de datos

- La memoria de cada proyecto se mantiene separada; no guardes contraseñas,
  tokens ni credenciales en ella.
- Crear memorias y conexiones requiere revisar la vista previa y usar
  `--apply` de forma explícita.
- El MCP de memoria ofrece lectura. Preparar un encargo no lo envía ni arranca
  otro asistente automáticamente.
- Una conexión configurada no garantiza por sí sola que el cliente la haya
  cargado; comprueba el estado y haz una consulta pequeña.

Consulta la [guía de uso](docs/guias/uso.md) para conocer las opciones, límites y
procedimientos completos.
