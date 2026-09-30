# Project Memory Status

`project-memory status` ofrece una vista consolidada y de solo lectura sobre la
salud de una memoria y sus conexiones locales.

## Uso

```bash
project-memory status /ruta/a/la/memoria
project-memory status /ruta/a/la/memoria --agent codex
project-memory status /ruta/a/la/memoria --json
project-memory status /ruta/a/la/memoria --strict
```

También admite `--manifest <ruta>` para seleccionar un manifiesto concreto.

## Alcance

El informe combina:

1. validación del manifiesto, estructura, enlaces, secretos y Git mediante
   `project-memory doctor`;
2. presencia y destino de la Skill específica;
3. identidad del MCP y la bóveda permitida;
4. política de herramientas de solo lectura para cada agente habilitado.

Por defecto revisa todos los agentes habilitados declarados en el manifiesto.
`--agent` limita la comprobación a uno de ellos.

## Estados

| Estado | Significado | Código normal | Código con `--strict` |
| --- | --- | --- | --- |
| `OK` | Memoria saludable y conexiones completas | `0` | `0` |
| `WARNING` | Hay una conexión ausente, una política pendiente o una advertencia de `doctor` | `0` | `1` |
| `ERROR` | Manifiesto inválido, conflicto o fallo de inspección | `1` | `1` |

Los agentes deshabilitados no cuentan como fallo. El informe nunca ejecuta
`--apply`, no registra MCP, no crea enlaces y no modifica configuraciones.

## Criterios de aceptación

- Una memoria saludable con todas sus conexiones devuelve `OK`.
- Una conexión que necesita creación o actualización devuelve `WARNING`.
- Un MCP o enlace homónimo diferente devuelve `ERROR`.
- `--strict` convierte advertencias en un código de salida distinto de cero.
- `--json` conserva la evidencia de `doctor` y el detalle por agente.
- Repetir la orden no cambia ningún archivo ni configuración.
