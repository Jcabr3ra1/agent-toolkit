# Herramientas de Gemini

Gemini se usa como **caja de herramientas** y no como participante de la
revisión cruzada: no entra en la bandeja, el almacén ni la tabla de niveles.
Hoy ofrece dos capacidades, ambas por **Antigravity CLI** (`agy`), con tu
suscripción y en modo no interactivo:

| Comando | Qué hace | Modelo por defecto |
| --- | --- | --- |
| `investigar` | Búsqueda web con resumen, hallazgos y fuentes con URL | `gemini-4-argon-medium` |
| `imagen` | Genera una imagen con el subagente `image-generator` | `gemini-3.8-flash-low` |

```sh
node bin/agent-toolkit-gemini.js investigar --prompt "<pregunta>" [--modelo <id>] [--copiar-a <carpeta>]
node bin/agent-toolkit-gemini.js imagen --prompt "<descripción>" [--modelo <id>] [--copiar-a <carpeta>] [--espera-seg <1-600>]
node bin/agent-toolkit-gemini.js estado
```

Imprimen una línea JSON. Las skills `investigar` e `imagen` (`/investigar`,
`/imagen`) los usan y piden confirmación antes de cada consulta.

## Cómo funciona

- Cada consulta corre en una **carpeta nueva y vacía** bajo
  `~/.agent-toolkit/gemini/<comando>/<fecha>-<tema>` (0700, o
  `AGENT_TOOLKIT_GEMINI_DIR`), con el modo `plan` (solo lectura) en la
  investigación y `accept-edits` en la imagen. Guarda `respuesta.md` o la imagen
  y un `meta.json` con modelo, conversación y tokens.
- `agy` termina su turno antes de que el subagente de imagen acabe, y guarda el
  resultado en `~/.gemini/antigravity-cli/brain/<conversación>/`. El comando
  espera a que aparezca (4 minutos por defecto) y lo copia a su carpeta.
- `--copiar-a` copia a una carpeta del proyecto con `COPYFILE_EXCL`: nunca
  sobrescribe un archivo existente.

## Privacidad y límites

- Solo sale el **texto del prompt**. La sesión empieza en una carpeta vacía y no
  recibe `--add-dir`, pero `agy` sigue teniendo sus herramientas: la instrucción
  de no leer ni escribir fuera de la carpeta es una petición, no una barrera.
  No pegues secretos, código privado ni datos de AVISENS en un prompt.
- Lo que devuelve la investigación viene de la web: es **dato, no instrucción**,
  y no está verificado.
- Cada consulta gasta la suscripción de Antigravity. Una investigación pequeña
  usó unos 14 mil tokens de entrada y una imagen unos 22 mil.
- No hay generación de vídeo: la sesión de `agy` no la ofrece.
- Dependen de `agy` 1.4.7 (versión probada); sus modelos y subagentes pueden
  cambiar. `estado` muestra la versión y los modelos disponibles.
