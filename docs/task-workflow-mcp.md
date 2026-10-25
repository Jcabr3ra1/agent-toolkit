# Flujo local entre Codex y Claude Code

El servidor MCP local coordina Codex CLI y Claude Code CLI y guarda cada
entrega en una tarea compartida. Los clientes no mantienen una conversación
abierta entre sí: Agent Toolkit prepara cada etapa, presenta su vista previa y
espera la confirmación del usuario antes de llamar al cliente.

## Requisitos

- Node.js 20 o posterior.
- Codex CLI con sesión de ChatGPT disponible.
- Claude Code CLI 2.1.248 o posterior con sesión `claude.ai` disponible.
- Un repositorio local en una rama de trabajo. La implementación se bloquea en
  `main` y `master`, o si el árbol ya contiene cambios.

Las apps de escritorio no suministran la sesión a este flujo: se usan las
sesiones que detectan las CLIs. El Toolkit no puede consultar la identidad
exacta, el plan ni la cuota. No inicia llamadas a API por su cuenta y bloquea
proveedores que no sean la sesión de ChatGPT/Codex o `claude.ai`.

## Instalar y conectar en Codex

Desde la raíz de Agent Toolkit, instala las dependencias:

```sh
npm install
```

Registra el proceso local en `~/.codex/config.toml`, reemplazando las rutas por
las de tu instalación:

```toml
[mcp_servers.agent-toolkit]
command = "node"
args = ["/ruta/absoluta/Agent-Toolkit/bin/agent-toolkit-mcp.js"]
cwd = "/ruta/absoluta/Agent-Toolkit"
startup_timeout_sec = 10
tool_timeout_sec = 240
```

Reinicia Codex y comprueba que aparezcan las herramientas de Agent Toolkit. El
MCP se registra en Codex; Claude Code CLI se inicia localmente desde el flujo.

## Crear una tarea

`start_task` recibe objetivo, alcance, criterios, modo, nombre del proyecto y
dos permisos optativos:

- `allowImplementation`: permite preparar una etapa de edición de Claude.
- `allowFinalReview`: permite volver a Codex después de la implementación.

Ambos están desactivados por defecto. La revisión final requiere también
`allowImplementation=true`. Activarlos solo habilita las herramientas; cada
llamada todavía necesita su vista previa y confirmación interactiva. Las tareas
creadas antes de habilitar estos permisos deben recrearse para usar las nuevas
etapas.

En modo `tutor`, la etapa de Claude solo devuelve código e instrucciones; no
requiere `allowImplementation`, no edita y no genera una revisión final sobre
cambios que aún no se aplicaron.

## Recorrido

1. Codex prepara `preview_codex_plan`. La vista previa muestra modelo,
   esfuerzo, sesión, ruta, comando y prompt. No llama al modelo.
2. Después de aprobarla, `run_codex_plan` ejecuta Codex con sandbox de solo
   lectura y guarda el plan estructurado.
3. `preview_claude_proposal` usa el modelo y el esfuerzo recomendados por el
   plan. Tras una aprobación separada, `run_claude_proposal` llama a Claude en
   modo de lectura y guarda la propuesta.
4. Si la tarea habilitó `allowImplementation`, revisa la propuesta y prepara
   `preview_claude_implementation`. Esta vista previa muestra que la llamada
   puede editar archivos, su lista de herramientas, el repositorio, la rama y
   el estado del árbol. El Toolkit solo la deja lista en una rama distinta de
   `main`/`master` y con el árbol limpio. Vuelve a comprobar esa condición al
   ejecutar.
5. Al aprobar esa vista previa, `run_claude_implementation` autoriza la huella
   exacta de la propuesta y llama a Claude. La CLI recibe `Read`, `Glob`,
   `Grep`, `Edit` y `Write`; no recibe Bash, red, MCP ni subagentes. El permiso
   alcanza el repositorio completo, aunque el prompt limita el cambio a las
   rutas `modify`/`create` del plan. El resultado informa los archivos que Git
   detectó como cambiados; las pruebas no se ejecutan en esta etapa.
6. Si además se habilitó `allowFinalReview`, Agent Toolkit prepara
   `preview_codex_review` con el plan, la propuesta y la entrega guardada.
   Por defecto reutiliza el modelo y esfuerzo fijados en la vista previa de
   planificación; puedes indicar juntos otros valores. Después de una
   aprobación separada, Codex inspecciona el repositorio con sandbox de solo
   lectura y guarda la revisión. No debe afirmar pruebas que no haya verificado.

Una tarea sin permisos optativos termina después de la propuesta. Cancelar una
confirmación no inicia la CLI. Si el cliente MCP no ofrece confirmación
interactiva, la ejecución queda bloqueada.

## Cuentas, llamadas y datos locales

- Cada vista previa se usa una sola vez y vence después de 20 minutos.
- Cada confirmación muestra el comando exacto, sesión detectada, modelo,
  esfuerzo, permisos y prompt completo.
- La disponibilidad real del modelo no se consulta ni se garantiza.
- Las CLIs se ejecutan en procesos no interactivos y sus respuestas se guardan
  en `~/.agent-toolkit/workflows/` con permisos locales restringidos.
- La ejecución falla de forma cerrada ante un cambio de sesión, rama, commit o
  estado del árbol desde la vista previa de implementación.
- No se repiten automáticamente las llamadas fallidas, no se hacen commits ni
  pushes y el Toolkit no afirma que la implementación pasó pruebas.
- Cada tarea termina cuando se guarda la revisión final o antes si sus permisos
  opcionales están desactivados.

## Verificación

Las pruebas del Toolkit usan CLIs ficticias para comprobar las puertas de
autorización, el orden de etapas, la detección de cambios y el bloqueo de
escrituras en repositorios no seguros. Una prueba con clientes ficticios no
confirma que los modelos estén disponibles ni sustituye una demostración real
de cada etapa. La primera demostración real cubrió Codex planificando y Claude
devolviendo una propuesta de solo lectura. La implementación y la revisión final
requieren una tarea nueva con permisos optativos habilitados y aprobación
separada en cada vista previa.
