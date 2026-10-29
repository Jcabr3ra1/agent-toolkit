# Guía de comandos de Agent Toolkit

Todo lo que puedes usar, paso a paso. Está escrita para este equipo: el repositorio
está en `~/programacion/Agent-Toolkit` y los comandos de línea se ejecutan desde esa
carpeta con `node bin/<nombre>.js` (no hay instalación global).

## 1. El mapa en una tabla

| Quiero… | Uso | Dónde se escribe |
| --- | --- | --- |
| Que Claude programe y Codex revise (o al revés) | `/programar` y `/revisar` | En cada terminal |
| Ver cómo van las revisiones | `/estado` | En cualquier terminal |
| Delegar código a un modelo y esfuerzo fijos | Plugin `niveles` | Claude Code (lo usa la skill sola) |
| Ahorrar tokens esperando en Codex | `registrar` y `avisar` | Terminal (lo ejecutan las skills) |
| Ver qué modelos hay y la tabla de niveles | `agent-toolkit-inbox modelos` | Terminal |
| Medir qué nivel rinde | `agent-toolkit-inbox rendimiento` | Terminal |
| Investigar en la web o generar una imagen con Gemini | `/investigar` y `/imagen` | En la terminal de Claude o Codex |
| Poner al día la memoria de Obsidian tras un PR | `/cerrar-memoria` (`/cerrar-avisens` en AVISENS) | En la terminal del proyecto |
| Consultar la memoria de un proyecto | Skills `agent-toolkit` y `avisens` | Las usa el agente |

En Claude Code las skills se invocan con `/nombre`; en Codex, con `$nombre`.

## 2. Puesta en marcha (una sola vez, y tras actualizar)

### 2.1. Actualizar el repositorio

```sh
cd ~/programacion/Agent-Toolkit
git switch main && git pull --ff-only
npm ci --ignore-scripts
```

Después **reinicia Claude Code y Codex**: cargan el MCP al arrancar y no se enteran
de los cambios hasta entonces. Hazlo tras cada fusión en `main`.

### 2.2. Conectar el MCP en ambos clientes

Ya lo tienes conectado como `agent-toolkit-workflow`. Compruébalo:

```sh
claude mcp list
codex mcp list
```

Si faltara, se registra así (sustituye la ruta si es otra):

```sh
claude mcp add --scope user --transport stdio agent-toolkit-workflow -- node ~/programacion/Agent-Toolkit/bin/agent-toolkit-mcp.js
codex mcp add agent-toolkit-workflow -- node ~/programacion/Agent-Toolkit/bin/agent-toolkit-mcp.js
```

### 2.3. Instalar las skills (con enlaces, para que se actualicen solas)

Tus copias de `revision-cruzada`, `programar` y `revisar` son **copias antiguas** y
`investigar`, `imagen` y `cerrar-memoria` no están instaladas. Con enlaces simbólicos
quedan siempre iguales al repositorio. Este bloque aparta lo que sea una copia
(`.bak`) antes de enlazar:

```sh
cd ~/programacion/Agent-Toolkit
for s in revision-cruzada programar revisar estado investigar imagen cerrar-memoria; do
  for d in ~/.claude/skills ~/.codex/skills; do
    mkdir -p "$d"
    if [ -e "$d/$s" ] && [ ! -L "$d/$s" ]; then mv "$d/$s" "$d/$s.bak"; fi
    ln -sfn "$PWD/skills/$s" "$d/$s"
  done
done
```

Reinicia las terminales para que las vean.

### 2.4. Instalar el plugin de niveles (Claude Code)

Dentro de Claude Code:

```text
/plugin marketplace add Jcabr3ra1/agent-toolkit
/plugin install niveles@agent-toolkit
```

Comprueba con `claude plugin list` que aparece `niveles`.

### 2.5. Crear los agentes de nivel de Codex

```sh
node bin/agent-toolkit-inbox.js agentes              # vista previa, no escribe
node bin/agent-toolkit-inbox.js agentes --escribir   # crea los que falten
```

Crea `nivel_ligero`, `nivel_normal`, `nivel_exigente` y `nivel_alto` en
`~/.codex/agents`. Nunca sobrescribe ni borra: si ya existe uno distinto lo respeta, y
con `--escribir --forzar` lo aparta como `nivel_<x>.toml.anterior-<fecha>-<id>` antes
de crear el nuevo. Repítelo con `--forzar` cuando cambien los modelos.

### 2.6. Comprobar que todo responde

```sh
node bin/agent-toolkit-inbox.js modelos
```

Muestra los modelos de Claude, los que Codex tiene y la tabla de niveles vigente.

## 3. Uso diario: programar con revisión cruzada

La idea: una terminal **programa** y la otra **revisa**. Cada encargo de revisión lo
apruebas tú.

### Paso a paso

1. **Terminal de Codex (revisor):** escribe `$revisar`. Registra su sesión y dice
   «Registrada; me avisarán…». Termina su turno y no gasta tokens esperando.
   Si no encuentra su sesión sola, te pide el id: en Codex, `/status`.
2. **Terminal de Claude (principal):** escribe `/programar <la tarea>`.
3. Claude puntúa la tarea y te muestra una línea (o una tabla) con el nivel y la
   configuración. Con Ligero o Normal sigue solo; desde Exigente espera tu
   confirmación.
4. Claude programa (o delega el código al agente del nivel), prueba y se revisa a sí
   mismo.
5. Claude te presenta el **encargo** para Codex con preguntas, archivos y criterio de
   aprobación. Tú lo apruebas.
6. Claude ejecuta `avisar`; Codex recibe el aviso en su sesión, reclama el encargo,
   revisa en solo lectura y entrega un informe.
7. Claude verifica cada hallazgo, corrige lo que se sostenga y te propone el siguiente
   paso. Como máximo hay **dos rondas** por cambio.
8. Cuando quieras, pides el commit y el PR. Tú decides el merge.

Si en vez de eso Claude es el revisor: en su terminal escribe `/revisar`; espera en
segundo plano sin gastar tokens y se activa cuando llega el encargo.

### Para ver el estado

`/estado` (o `$estado`) muestra una tabla con las colaboraciones abiertas, el encargo
pendiente, quién debe actuar y el último veredicto. No modifica nada.

### Los niveles

| Total | Nivel | Claude | Codex |
| --- | --- | --- | --- |
| 0–2 | Ligero | `haiku`, `low` | `gpt-6-luna`, `low` |
| 3–4 | Normal | `sonnet`, `medium` | `gpt-6.1-sol`, `medium` |
| 5–6 | Exigente | `sonnet`, `high` | `gpt-6.1-sol`, `high` |
| 7–10 | Alto | `opus`, `high` | `gpt-6-astra`, `high` |

El total sale de cinco criterios (riesgo, tamaño, ambigüedad, contexto y tipo de
trabajo). Riesgo alto (seguridad, datos, dinero, producción) fija un mínimo de
Exigente. Coordinar nunca pasa de Normal. Se sube de nivel solo si la corrección
falló, y `xhigh` solo si `high` ya falló. Los nombres reales de Codex salen de
`modelos`, así que pueden cambiar.

Los agentes de Claude son `niveles:nivel-ligero`, `niveles:nivel-normal`,
`niveles:nivel-exigente` y `niveles:nivel-alto`.

## 4. Comandos de línea

### 4.1. `agent-toolkit-inbox`

Se ejecuta con `node bin/agent-toolkit-inbox.js <subcomando>`.

| Subcomando | Para qué | Ejemplo |
| --- | --- | --- |
| `wait` | Espera un encargo o un informe sin usar el modelo y termina con una línea JSON | `wait --agent codex --project-root /ruta [--task <id> --review <id>] [--timeout-seconds 3600]` |
| `modelos` | Modelos disponibles y tabla de niveles | `modelos [--json]` |
| `rendimiento` | Qué modelo, esfuerzo y nivel han rendido (hallazgos que se sostienen) | `rendimiento [--project-root /ruta] [--json]` |
| `agentes` | Crea los agentes de nivel de Codex | `agentes [--escribir [--forzar]] [--json]` |
| `registrar` | Guarda la sesión de Codex como revisora del proyecto | `registrar --agent codex --project-root /ruta [--thread <id>]` |
| `avisar` | Entrega a esa sesión, con `codex queue`, un encargo ya aprobado | `avisar --project-root /ruta --task <id> --review <id>` |

Salidas de `wait`: `handoff` (llegó un encargo), `finished` (hay informe),
`closed` o `timeout` (código 3). `avisar` solo actúa sobre un encargo aprobado,
pendiente y dirigido a Codex, y el registro de la sesión caduca a las 24 horas.

### 4.2. `agent-toolkit-gemini`

Usa tu Antigravity CLI (`agy`) y tu suscripción. Solo sale el texto del prompt.
No pegues secretos ni datos privados.

```sh
node bin/agent-toolkit-gemini.js estado
node bin/agent-toolkit-gemini.js investigar --prompt "tu pregunta" [--modelo gemini-4-argon-high] [--copiar-a ./docs]
node bin/agent-toolkit-gemini.js imagen --prompt "descripción" [--copiar-a ./assets] [--espera-seg 240]
```

Los resultados quedan en `~/.agent-toolkit/gemini/…`. `--copiar-a` copia a una
carpeta sin sobrescribir. No hay vídeo. Lo normal es usar las skills `/investigar` e
`/imagen`, que piden confirmación antes de cada consulta.

### 4.3. `project-memory` (memoria de Obsidian)

```sh
node bin/project-memory.js doctor <bóveda>             # diagnóstico
node bin/project-memory.js status <bóveda>             # conexión con Claude y Codex
node bin/project-memory.js sync plan <bóveda>          # qué PR fusionados faltan en la memoria
node bin/project-memory.js sync inspect <bóveda> --pr 42
node bin/project-memory.js sync record <bóveda> --pr 42 --outcome documentation-updated --reviewed --summary "…" --note "05-ENTREGAS/Entregas.md" --apply
node bin/project-memory.js sync apply <bóveda> --proposal propuesta.json --reviewed --apply
node bin/project-memory.js init <destino> --project-id … --project-name …   # crear una bóveda nueva (vista previa sin --apply)
node bin/project-memory.js connect <bóveda> --agent claude|codex             # conectar el MCP (vista previa sin --apply)
```

Las bóvedas son `~/programacion/Obsidian-Vaults/AGENT-TOOLKIT-MEMORY` y
`…/AVISENS-MEMORY`. `plan`, `inspect`, `doctor` y `status` solo leen. `record` y
`apply` escriben únicamente con `--apply` y **nunca hacen commit ni push**.

### 4.4. `agent-task` (borradores y verificación manual)

```sh
node bin/agent-task.js prepare --task t.json --request r.json --catalog c.json --policy p.json [--json | --show-brief]
node bin/agent-task.js verify --contract c.json --expect <sha256> --source <raíz> --handoff <raíz> --phase before|after
node bin/agent-task.js external-verifier preview …
```

No usa IA ni consulta cuentas por omisión. Es la parte más técnica del toolkit; úsala
solo si necesitas esos borradores.

## 5. Skills (comandos con `/` en Claude y `$` en Codex)

| Skill | Para qué | Notas |
| --- | --- | --- |
| `programar <tarea>` | Esta terminal programa y pide revisión a la otra | Elige nivel y delega por nivel |
| `revisar` | Esta terminal es la revisora | En Codex se registra; en Claude espera en segundo plano |
| `revision-cruzada` | Todas las reglas de las dos anteriores | `iniciar` o `atender` |
| `estado` | Tabla del estado de las revisiones | Solo lectura |
| `investigar <pregunta>` | Búsqueda web con fuentes vía Gemini | Pide confirmación |
| `imagen <descripción>` | Genera una imagen vía Gemini | Pide confirmación |
| `cerrar-memoria` | Cierra el PR y pone al día la bóveda de Obsidian | Usa `sync plan`; pregunta una vez por lote |
| `cerrar-avisens` | Lo mismo, para AVISENS | Ya existente en esa bóveda |
| `agent-toolkit`, `avisens` | Consultan la memoria de cada proyecto | Las usa el agente |
| `decision-records`, `project-handoff`, `quality-gate`, `spec-driven-development` | Decisiones, traspasos, revisión de entrega y especificaciones | Genéricas |

## 6. Plugin y agentes

- **Plugin `niveles`** (Claude Code): cuatro agentes con modelo y esfuerzo fijos que la
  sesión principal usa para delegar. No se escribe nada a mano.
- **Agentes de Codex** `nivel_*`: los crea `agentes --escribir`.
- **Agentes personales** de `agents/claude/*.md` y `agents/codex/*.toml`
  (`project_explorer`, `requirements_analyst`, `solution_architect`, `quality_reviewer`,
  `docs_researcher`, `implementation_tutor`): se instalan con enlaces en
  `~/.claude/agents` y `~/.codex/agents`. Su solo lectura en Codex es **por
  instrucción**, no por sandbox.

## 7. Herramientas del MCP `agent-toolkit-workflow`

Las llaman las skills. Solo las usarías a mano para depurar.

| Grupo | Herramientas |
| --- | --- |
| Revisión cruzada | `start_collaboration`, `get_collaboration`, `publish_peer_context`, `preview_peer_review`, `approve_peer_review`, `request_peer_review`, `wait_for_peer_handoff`, `claim_peer_review`, `submit_peer_review`, `record_review_outcome`, `cancel_peer_review`, `close_collaboration` |
| Flujo de tareas por etapas | `start_task`, `get_task`, `preview_codex_plan`, `run_codex_plan`, `preview_claude_proposal`, `run_claude_proposal`, `preview_claude_implementation`, `run_claude_implementation`, `preview_codex_review`, `run_codex_review`, `wait_for_task_activity`, `cancel_task_execution` |

`approve_peer_review` es la que te pide permiso: no la pongas en la lista de
permitidas ni en modo automático. Las respuestas son compactas; `get_collaboration`
acepta `completo: true` para ver el registro entero.

## 8. La memoria de Obsidian

- **Qué hay:** dos bóvedas (Agent Toolkit y AVISENS) con Git propio. Los agentes las
  leen por MCP de solo lectura y las skills `agent-toolkit` y `avisens`.
- **Cuándo se actualiza:** no sola. Cuando se fusiona un PR, ejecuta `/cerrar-memoria`
  en la terminal del proyecto: mira `sync plan`, revisa cada PR pendiente, te pide
  **una** autorización por lote, edita las notas, registra los PR y hace el commit.
  El push de la bóveda solo lo hace con tu autorización.
- **Agent Toolkit:** su repositorio no tiene CI, así que `sync record` se bloquea y las
  filas del registro se añaden a mano.
- **AVISENS:** el horario «todos los días 23:00» del manifiesto es solo texto: ningún
  programador lo ejecuta.

## 9. Dónde queda cada cosa

| Qué | Dónde |
| --- | --- |
| Colaboraciones y revisiones | `~/.agent-toolkit/workflows/peers/` |
| Sesión de Codex registrada como revisora | `~/.agent-toolkit/workflows/reviewers/` |
| Resultados de Gemini | `~/.agent-toolkit/gemini/` |
| Skills | `~/.claude/skills/` y `~/.codex/skills/` (enlaces al repositorio) |
| Agentes de Codex | `~/.codex/agents/` |
| Memorias | `~/programacion/Obsidian-Vaults/` |

## 10. Cuando algo no funciona

| Síntoma | Qué hacer |
| --- | --- |
| Cambié algo y no se nota | Reinicia Claude Code y Codex |
| `avisar` dice que Codex no se registró | En Codex, escribe `$revisar` (o `registrar --thread <id>`) |
| `registrar` no encuentra la sesión | En Codex, `/status` para el id y `registrar … --thread <id>` |
| Codex tarda en reaccionar al aviso | Si está en mitad de un turno, el aviso espera a que termine |
| El revisor de Codex no reclama el encargo | Su modelo no coincide con el recomendado: cambia con `/model` |
| `agentes` dice «ya existe y es distinto» | Es lo esperado: usa `--escribir --forzar` si quieres reemplazarlo (queda copia) |
| `sync record` dice `BLOCKED` | Faltan CI o carpetas de área: añade la fila a mano al registro |
| `doctor` avisa de cambios locales | Haz commit o descarta los cambios de la bóveda antes de `sync record` |
| `investigar` o `imagen` fallan | `agent-toolkit-gemini estado` para comprobar `agy` y los modelos |
| Una espera en Codex gasta tokens | Usa `registrar` y `avisar`; la espera cuesta un turno por minuto |

## 11. Límites que conviene recordar

- El esfuerzo de un agente delegado lo fija su archivo, pero una variable de entorno
  como `CLAUDE_CODE_EFFORT_LEVEL` puede imponerse. El modelo sí se comprobó.
- El aviso directo a Codex se probó contra una sesión inactiva, no con un encargo
  real de principio a fin.
- Gemini no participa en la revisión cruzada y no genera vídeo.
- Nada se fusiona, se sube ni se despliega sin tu autorización.
