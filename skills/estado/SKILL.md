---
name: estado
description: Muestra en una tabla el estado de la revisión cruzada entre Claude y Codex en el repositorio actual (colaboraciones abiertas, encargos pendientes y últimos veredictos), sin modificar nada. Úsala solo cuando el usuario escriba /estado o $estado.
---

# Estado de la revisión cruzada

Solo lectura: no reclames, envíes, canceles ni cierres nada.

1. `projectRoot` es la ruta absoluta de la raíz del repositorio actual.
2. Llama `get_collaboration` sin `taskId` para listar las colaboraciones abiertas.
3. Para cada una, llama `get_collaboration` con su `taskId`.
4. Muestra exactamente este formato:

```markdown
**Revisión cruzada** · <proyecto> · <n> colaboraciones abiertas

| Colaboración | Principal | Encargos | Pendiente ahora | Último veredicto | ¿Vigente? |
| --- | --- | --- | --- | --- | --- |
| Validar firma de Meta | Claude | 3 (2 completados, 1 pendiente) | Codex debe revisar | Requiere cambios | Sí |

**Qué toca ahora**
- Codex: escribir `$revisar` si no está esperando.
```

- **Encargos:** total y reparto por estado (`pending`, `claimed`, `completed`, `stale`, `cancelled`).
- **Pendiente ahora:** quién tiene que actuar: el revisor si hay un encargo `pending` o `claimed`; el principal si el último encargo está `completed` y aún no hay otro; «Nadie» si no hay encargos.
- **Último veredicto:** el texto que sigue a «Veredicto:» en el último informe completado; si no aparece, «Sin veredicto».
- **¿Vigente?:** «Sí» si el último informe tiene `current: true`; «No, cambió el código» si `filesCurrent` es falso; «No, cambió el contexto» si `contextCurrent` es falso.
- **Qué toca ahora:** una línea por acción, con el comando exacto (`/revisar`, `$revisar`, `/programar <tarea>` o `$programar <tarea>`).

Si no hay colaboraciones abiertas, dilo en una línea y sugiere `/programar <tarea>` para empezar.

Si el usuario pide el rendimiento de los modelos, ejecuta
`node /Users/juan_jaller/programacion/Agent-Toolkit/bin/agent-toolkit-inbox.js rendimiento`
(añade `--project-root <projectRoot>` para limitarlo a este proyecto) y muestra
su tabla tal cual. No usa ningún modelo ni modifica nada.
