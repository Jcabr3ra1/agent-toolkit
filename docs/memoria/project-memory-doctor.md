# Project Memory Doctor

`project-memory doctor` inspecciona una memoria de proyecto sin modificarla ni acceder a servicios externos.

## Uso

```bash
node bin/project-memory.js doctor /ruta/a/la/memoria
```

El comando busca, en orden:

1. `project-memory.json`;
2. `project-memory.local.json`;
3. `project-memory.example.json`.

También se puede indicar un manifiesto concreto:

```bash
node bin/project-memory.js doctor /ruta/a/la/memoria \
  --manifest /ruta/al/project-memory.json
```

## Comprobaciones

- JSON y esquema del manifiesto.
- URLs sin credenciales incrustadas.
- Disponibilidad local del repositorio fuente.
- Ruta y estructura de la bóveda.
- Notas fundamentales.
- Variables `{{...}}` pendientes.
- Enlaces Wiki y Markdown internos.
- Patrones de secretos de alta confianza.
- Repositorio Git, cambios locales, remoto y upstream conocido.

El diagnóstico Git es local. No ejecuta `fetch`, `pull`, `push`, commits ni escrituras.

## Perfiles de estructura

Si `memory.layout` no está presente o usa `canonical-v1`, el doctor exige las carpetas y notas de la plantilla oficial.

Una memoria anterior puede declarar su estructura estable:

```json
{
  "layout": {
    "profile": "declared",
    "requiredDirectories": ["00-INICIO", "01-PRODUCTO"],
    "requiredNotes": ["00-INICIO/Inicio del proyecto.md"]
  }
}
```

Las listas declaradas solo sustituyen la comprobación estructural. Todas las validaciones de seguridad, enlaces, variables, repositorios y Git continúan activas.

## Modos de salida

Salida legible:

```bash
node bin/project-memory.js doctor /ruta/a/la/memoria
```

Salida JSON:

```bash
node bin/project-memory.js doctor /ruta/a/la/memoria --json
```

Modo estricto:

```bash
node bin/project-memory.js doctor /ruta/a/la/memoria --strict
```

## Códigos de salida

| Código | Significado |
| --- | --- |
| `0` | Sin errores; las advertencias se permiten fuera del modo estricto. |
| `1` | Existen errores, o advertencias bajo `--strict`. |
| `2` | El comando o sus opciones son inválidos. |

## Límites

- La detección de secretos utiliza patrones de alta confianza y no reemplaza una herramienta especializada.
- La comparación con upstream utiliza referencias locales conocidas y no demuestra que el remoto no haya cambiado.
- El perfil `declared` confirma presencia, pero no evalúa si la taxonomía elegida es conceptualmente adecuada.
- Los enlaces dinámicos o generados por plugins pueden requerir revisión manual.
