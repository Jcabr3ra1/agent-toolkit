# Project Memory Sync

- Estado: especificación aprobada; base v0.1 implementada
- Primera entrega: `project-memory sync plan`
- Proveedor inicial: GitHub mediante `gh`

## Problema

Una memoria de proyecto debe enterarse de cambios estables sin confundir ramas,
pushes o Pull Requests abiertos con comportamiento vigente. La automatización
también debe evitar revisar dos veces el mismo PR y conservar un registro visible
desde Obsidian.

## Decisión propuesta

El registro Markdown de sincronización será la única fuente de estado procesado.
No se añadirá un JSON oculto que pueda divergir de lo que ve el usuario en
Obsidian.

La primera operación será estrictamente de solo lectura:

```bash
project-memory sync plan /ruta/a/la/memoria
```

Esta orden:

1. valida la memoria con `doctor`;
2. exige `automation.enabled: true` y `requiresMergedChange: true`;
3. resuelve el repositorio GitHub desde `source.remoteUrl`;
4. consulta con `gh` los PR fusionados en `automation.reviewBranch`;
5. lee `00-INICIO/Registro de sincronización.md`;
6. toma el PR revisado más reciente de la ventana consultada como línea base;
7. excluye los PR ya registrados y el historial anterior a esa línea base;
8. devuelve los PR pendientes ordenados del más antiguo al más reciente.

La línea base permite adoptar la herramienta en proyectos existentes sin tratar
todo el historial anterior al comienzo del registro como trabajo pendiente. Si
ningún PR revisado aparece dentro de la ventana consultada, no se presupone una
línea base y se presentan todos los resultados obtenidos.

No analiza todavía el impacto documental, no modifica notas y no registra un PR
como procesado. Esas responsabilidades pertenecen a las etapas posteriores de
revisión y registro controlado.

## Formato del registro

La tabla visible de Obsidian es el ledger canónico:

```markdown
| Cambio | Estado | Fecha | Resultado | Commit de memoria |
| --- | --- | --- | --- | --- |
| [#123](https://github.com/owner/repo/pull/123) | Revisado | 2026-09-29 | Sin cambios documentales | — |
```

Para memorias existentes también se acepta el encabezado equivalente usado por
AVISENS: `PR`, `Estado`, `Fecha de revisión`, `Resultado` y
`Commit de memoria`. Las filas conservan las mismas reglas en ambos formatos.

Un PR se considera procesado únicamente cuando existe una fila válida cuyo
enlace apunta a `/pull/<número>` y cuyo estado es `Revisado`. Filas incompletas,
otros enlaces o texto fuera de la tabla no cambian el estado.

## Interfaz de `sync plan`

```text
project-memory sync plan [ruta]
  --manifest <ruta>  Selecciona un manifiesto.
  --limit <número>   Máximo de PR fusionados a consultar; 100 por defecto.
  --json             Devuelve evidencia estructurada.
  --strict           Devuelve 1 cuando existen PR pendientes.
```

### Resultado estructurado

```json
{
  "command": "sync plan",
  "status": "pending",
  "repository": "owner/repo",
  "branch": "develop",
  "ledgerPath": "/ruta/00-INICIO/Registro de sincronización.md",
  "reviewed": [123],
  "baseline": {
    "number": 123,
    "mergedAt": "2026-09-28T10:00:00Z"
  },
  "pending": [
    {
      "number": 124,
      "title": "Cambio estable",
      "url": "https://github.com/owner/repo/pull/124",
      "mergedAt": "2026-09-29T10:00:00Z",
      "mergeCommit": "abc123"
    }
  ]
}
```

## Estados y códigos

| Estado | Significado | Código normal | Código con `--strict` |
| --- | --- | --- | --- |
| `clean` | No existen PR fusionados sin revisar | `0` | `0` |
| `pending` | Existen PR pendientes de revisión | `0` | `1` |
| `error` | Configuración, GitHub, ledger o diagnóstico inválido | `1` | `1` |

## Seguridad

- No recibe ni almacena tokens; usa la autenticación existente de `gh`.
- No imprime variables de entorno ni configuración de autenticación.
- No modifica el repositorio fuente, la bóveda o la configuración de agentes.
- No considera PR abiertos, cerrados sin fusionar ni cambios en otras ramas.
- Se detiene si la memoria tiene errores, el remoto no es GitHub o el ledger no
  cumple el formato mínimo.
- El número de resultados tiene límite para evitar consultas y salidas sin cota.

## Casos límite

- Un mismo PR no puede aparecer dos veces en `pending`.
- Filas duplicadas revisadas se normalizan en la salida, sin modificar el ledger.
- Los PR anteriores al último PR revisado de la ventana no reabren el historial.
- Un PR fusionado después de otro pero registrado antes sigue excluyéndose.
- Una memoria sin automatización habilitada devuelve error accionable.
- Un repositorio sin PR fusionados devuelve `clean`.
- Los PR de una rama base distinta se ignoran.
- La falta de `gh` o de autenticación produce un error sin revelar credenciales.

## Fuera de alcance de esta entrega

- Editar notas Markdown.
- Determinar automáticamente qué afirmaciones deben cambiar.
- Añadir filas al registro.
- Crear commits o hacer push de la memoria.
- Configurar horarios, webhooks o tareas recurrentes.
- Soportar GitLab, Bitbucket u otros proveedores.

## Evolución prevista

1. `sync plan`: detección segura y reproducible de PR pendientes.
2. `sync inspect`: paquete de evidencia y mapa de áreas candidatas.
3. `sync record`: registro idempotente después de una revisión completada.
4. Adaptador de automatización: ejecución programada y silenciosa cuando no hay
   novedades.
5. Proveedores adicionales mediante adaptadores separados.

## Criterios de aceptación

- Solo aparecen PR realmente fusionados en la rama configurada.
- Los PR marcados `Revisado` en el ledger no vuelven a aparecer.
- La vista JSON permite a un agente inspeccionar cada PR por separado.
- La ejecución repetida no cambia ningún archivo.
- `--strict` permite usar el comando como gate de automatización.
- AVISENS puede adoptar el comando sin cambiar su estructura actual.
