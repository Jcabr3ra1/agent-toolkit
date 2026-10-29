# Agent Toolkit, sin enredos

Guía rápida · Actualizada el 28 de octubre de 2026.

**Estado:** cierre global `cerrar-memoria` instalado para ambos clientes; abre una sesión nueva para cargarlo. Las demás novedades de `codex/toolkit-consolidacion` siguen pendientes de integrar y activar.

## Uso diario

Escribe las skills en el chat del agente: **`/` en Claude Code y `$` en Codex**. Los comandos que empiezan por `node` van en una terminal.

| Quiero… | Claude Code | Codex |
| --- | --- | --- |
| Programar y pedir revisión | `/programar explica la tarea` | `$programar explica la tarea` |
| Dejar esta sesión como revisora | `/revisar` | `$revisar` |
| Ver las revisiones pendientes | `/estado` | `$estado` |
| Usar Gemini | `/gemini explica qué necesitas` | `$gemini explica qué necesitas` |
| Cerrar y revisar la memoria | `/cerrar-memoria` | `$cerrar-memoria` |

**Para trabajar con dos agentes:** abre ambos en la misma carpeta del proyecto. En el revisor escribe `revisar`; en el principal, `programar` con tu tarea. Aprueba el encargo cuando te lo presente. El principal comprueba el informe y corrige lo necesario.

El revisor de Codex registra su sesión y termina el turno hasta recibir el aviso. Evita dejarlo consultando la bandeja repetidamente.

## Gemini: elige lo que necesitas

Usa **tu suscripción de Antigravity** mediante `agy`, sin clave de API. La skill `gemini` elige el comando; `investigar` e `imagen` siguen como accesos rápidos.

| Necesito… | Puedo pedirle al agente… |
| --- | --- |
| Una explicación | “Usa Gemini para explicar este concepto” |
| Buscar con fuentes | “Investiga con Gemini estas alternativas” |
| Leer archivos | “Analiza con Gemini este PDF y esta imagen” |
| Crear una imagen | “Genera con Gemini una ilustración de…” |
| Volver a un resultado | “Muéstrame el historial de Gemini y recupera este resultado” |

Elige los archivos que quieres enviar: **texto, imágenes, PDF o vídeo visual**. Máximo 8 archivos, 20 MiB por archivo y 32 MiB en total. Revisa las conclusiones contra los archivos: el estado «completo» lo declara el modelo.

**Audio bloqueado:** las pruebas dieron transcripciones incorrectas. El vídeo se analiza visualmente; no se transcribe su audio. No hay generación de audio ni vídeo.

### Si prefieres la terminal

Ejecuta estos ejemplos desde la raíz del Toolkit. Sustituye las rutas de ejemplo.

```sh
node bin/agent-toolkit-gemini.js consultar --prompt "Explica este concepto"
node bin/agent-toolkit-gemini.js investigar --prompt "Compara opciones con fuentes"
node bin/agent-toolkit-gemini.js analizar --prompt "Resume el documento" --archivo /ruta/informe.pdf
node bin/agent-toolkit-gemini.js imagen --prompt "Una ilustración de un bosque"
node bin/agent-toolkit-gemini.js historial
node bin/agent-toolkit-gemini.js recuperar --directorio /ruta/mostrada/en/historial
```

Cada consulta conserva respuesta, archivos y metadatos en `~/.agent-toolkit/gemini/`. Historial y recuperación no llaman al modelo. Si una imagen tarda, **recupérala antes de volver a generarla**. `--copiar-a /ruta/destino` copia sin sobrescribir.

## Preparar o actualizar la instalación

Tras integrar las novedades, ejecuta desde un checkout estable del Toolkit, con Node 24 y dependencias instaladas:

```sh
node bin/agent-toolkit.js doctor --agent all
node bin/agent-toolkit.js setup --agent all
```

`doctor` comprueba la instalación. `setup` muestra qué skills enlazaría, sin escribir. Si la vista previa es correcta:

```sh
node bin/agent-toolkit.js setup --agent all --apply
```

Si hay destinos distintos, los conserva y señala el conflicto. También muestra los comandos para registrar el MCP si falta. Reinicia Claude Code y Codex después de cambiar skills o MCP.

**Superpowers es opcional y se instala aparte.** Ayuda con el proceso de desarrollo; Toolkit aporta coordinación, memoria y herramientas. El plugin `niveles` y los agentes por nivel también se preparan por separado.

### Modelos y agentes por nivel

```sh
node bin/agent-toolkit-inbox.js modelos
node bin/agent-toolkit-inbox.js agentes
node bin/agent-toolkit-inbox.js agentes --escribir
```

`modelos` muestra los nombres y niveles vigentes. `agentes` es una vista previa; `--escribir` crea los agentes que faltan en Codex. Para Claude, instala `niveles@agent-toolkit` desde el marketplace `Jcabr3ra1/agent-toolkit`.

## Qué guarda y cómo ver el consumo

| Dato | Dónde queda |
| --- | --- |
| Colaboraciones, informes y mediciones | `~/.agent-toolkit/workflows/peers/` |
| Resultados de Gemini | `~/.agent-toolkit/gemini/` |
| Memoria estable del proyecto | Su bóveda en Obsidian |

**Guardar una colaboración no actualiza Obsidian.** El cierre puede crear un borrador con contexto, informes y consumo; la memoria vigente se revisa con `cerrar-memoria`, según el estado del trabajo.

**Un solo comando para todos los proyectos:** `/cerrar-memoria` en Claude o `$cerrar-memoria` en Codex. Identifica la bóveda y las ramas desde `project-memory.json`, también en Agent Toolkit y AVISENS. Para un proyecto nuevo, crea su memoria con `project-memory init` y conéctala con `project-memory connect`; no necesitas inventar otro cierre. `cerrar-avisens` queda como alias del mismo flujo.

### Consultar consumo y rendimiento

```sh
node bin/agent-toolkit-inbox.js consumo --project-root /ruta/proyecto
node bin/agent-toolkit-inbox.js rendimiento --project-root /ruta/proyecto
```

`consumo` muestra tokens, caché, tiempo y cobertura de las llamadas registradas. `rendimiento` resume los resultados de las revisiones. **Todavía no hay una comparación controlada que demuestre ahorro de tokens.** Un dato desconocido no equivale a cero.

### Registrar o cerrar una colaboración

Sustituye `UUID` por el id de la colaboración y usa rutas absolutas. La carpeta de salida debe existir.

```sh
node bin/agent-toolkit-inbox.js medir --project-root /ruta/proyecto --task UUID --archivo /ruta/medicion.json
node bin/agent-toolkit-inbox.js cierre --project-root /ruta/proyecto --task UUID --salida /ruta/traspaso-nuevo.md
```

`medir` recibe una medición del cliente o manual; repetir un id con los mismos datos no duplica consumo. El formato está en `docs/consolidacion.md`. Gemini registra su uso al añadir `--task UUID --project-root /ruta/proyecto` a una consulta; Claude y Codex necesitan aportar sus mediciones.

`cierre` exige que no haya encargos activos. Crea un archivo nuevo y cierra la colaboración. Después se puede recuperar por su id. Si se creó el borrador pero falló el cierre, consérvalo y consulta el estado antes de repetir.

## Si algo falla

| Problema | Primer paso |
| --- | --- |
| No aparece una skill o un comando nuevo | Ejecuta `doctor` y comprueba qué checkout usa el MCP; reinicia el cliente |
| La instalación indica conflicto | Revisa las rutas que muestra `setup`; conserva la instalación que corresponda |
| Codex no recibe la revisión | Escribe `$revisar` en la sesión revisora del mismo proyecto |
| Gemini no responde o no encuentra el modelo | Ejecuta `node bin/agent-toolkit-gemini.js estado` |
| Falta una imagen generada | Consulta `historial` y usa `recuperar` |
| Un análisis dice parcial o no compatible | Revisa los límites y el archivo; no lo tomes como análisis completo |

Para más detalle, consulta en el repositorio `docs/consolidacion.md`, `docs/herramientas-gemini.md` y `docs/primeros-pasos.md`. Las herramientas internas del MCP las manejan las skills; no necesitas memorizarlas.

Las novedades pasaron 4.632 pruebas automatizadas. Sigue pendiente validar el recorrido completo con sesiones reales de Codex y Claude.
