# Verificador externo

## Estado y alcance

Esta función tiene dos partes. `agent-task prepare` redacta un encargo con el rol
`reviewer`; el subcomando optativo `agent-task external-verifier` puede invocar
Codex CLI después de una vista previa y una confirmación separada. `prepare` nunca
inicia un cliente. `preview` no llama al modelo. Solo `run`, ejecutado con el
código de confirmación mostrado, envía el prompt a Codex.

El adaptador inicial admite únicamente `provider: openai` y `client: codex-cli`.
No ejecuta Claude Code, no usa API keys, no cambia de cuenta o proveedor y no
acepta rutas de imagen. El importador de `PLAN.md` sigue fuera de este paso.

El propósito no crea un tercer modo global. Requiere `mode: autonomous` para
usar la ruta de selección del revisor ya existente, pero mantiene `read` y
`verify` como las únicas acciones declaradas. La identidad de la tarea conserva
el propósito para que aparezca en el resumen y en el borrador.

## Contrato de entrada

El formato del encargo `task` sube a `1.1.0` únicamente cuando declara:

```json
{
  "identity": {
    "role": "reviewer",
    "mode": "autonomous",
    "purpose": "external-verifier"
  }
}
```

Los encargos `1.0.0` sin `purpose` siguen usando el flujo anterior. El preparador
solo produce `prepared-draft` para el verificador externo si se cumplen estas
condiciones:

- `request` coincide en proyecto, tarea, revisión, rol y modo.
- La autorización declarada contiene exactamente `read` y `verify`.
- Todos los archivos tienen operación `inspect`.
- Cada referencia de instrucciones, contexto, entrega anterior o propuesta apunta
  a una ruta relativa incluida exactamente en esa lista inspeccionable.
- `projectRules.forbiddenActions` incluye `apply` y `propose`.
- `checks` está vacío; no se piden comandos.
- El selector entrega una recomendación para el rol reviewer y la categoría de
  revisión declarada.

Si el contrato contradice estas condiciones, la preparación queda `invalid` o
`blocked`, sin borrador. Las instrucciones de entrega proporcionadas por quien
crea la tarea no se muestran en este propósito: se reemplazan por una solicitud
fija de hallazgos, sin cambios ni comandos.

## Recorrido y confirmación

Desde la raíz del Toolkit, el ejemplo ficticio se prepara así:

```bash
node bin/agent-task.js prepare \
  --task examples/external-verifier/task.example.json \
  --request examples/external-verifier/request.example.json \
  --catalog examples/external-verifier/catalog.example.json \
  --policy examples/external-verifier/policy.example.json
```

El resumen textual identifica el verificador externo; con `--json` aparece
`identity.purpose: external-verifier`. Añade `--show-brief` solo cuando quieras
exponer el encargo completo en el terminal. Preparar no guarda ni envía el
encargo.

Para usar el adaptador, el request, catálogo y política reales deben recomendar
`openai/codex-cli`, y el modelo/esfuerzo deben corresponder a una ruta aprobada
del selector. Usa una carpeta de entrega ya existente con permisos `0700`, fuera
de la carpeta del proyecto y distinta de la carpeta personal. El directorio padre
de `--delivery` debe existir dentro de esa carpeta y el archivo no debe existir.

```bash
node bin/agent-task.js external-verifier preview \
  --task /ruta/privada/task.json \
  --request /ruta/privada/request.json \
  --catalog /ruta/privada/catalog.json \
  --policy /ruta/privada/policy.json \
  --source /ruta/al/proyecto \
  --handoff /ruta/privada/handoff-0700 \
  --delivery revision-r01.md
```

La vista previa muestra el método de autenticación ChatGPT de Codex, el modelo y
esfuerzo, las rutas, tamaños y huellas de los archivos, la huella del prompt, el
`argv` de `codex exec` y un comando `run` exacto de un solo uso. Añade
`--show-prompt` si quieres inspeccionar el texto completo que se enviará. El
Toolkit no puede leer la identidad exacta de la cuenta, su plan, su cuota ni el
número de llamadas internas; la ejecución puede consumir uso de la sesión
ChatGPT activa. No ejecutes el comando `run` hasta aprobar esa vista previa en
tu conversación con el agente principal. El código vence en 20 minutos; si no lo
usas, elimina el archivo `.agent-task-external-*.json` de la carpeta privada.

El comando mostrado verifica el ticket, la cuenta y la base otra vez, y después
lanza Codex con `--sandbox read-only`, `--ephemeral`, `--ignore-user-config`,
aprobaciones `never` y las capacidades de shell, subagentes, plugins, apps,
búsqueda y herramientas visuales desactivadas según la versión local. El prompt
se envía por stdin, no en argumentos de shell. Se pasa al modelo únicamente el
objetivo, las referencias declaradas y el texto UTF-8 de los archivos enumerados;
no se incluye la ruta absoluta del proyecto. Si la versión no permite comprobar
y desactivar las capacidades requeridas, o si la sesión no informa autenticación
ChatGPT, la ejecución se bloquea.

La respuesta se guarda como un archivo nuevo con permisos `0600`; no se
sobrescribe una entrega existente. El adaptador vuelve a comprobar las huellas de
los archivos enumerados y la huella de la entrega con `agent-task verify`. No
reintenta una llamada fallida. Para empezar otra vez hay que preparar una nueva
vista previa.

Para comparar que los archivos listados siguen iguales antes y después de una
revisión, prepara un contrato de `agent-task verify` con operación `inspect` y
la misma huella esperada en ambas fases. Fija sus bytes con `--expect` y ejecuta
`verify --phase before` y luego `verify --phase after`. Si también se quiere
comprobar el archivo de respuesta, su huella esperada debe revisarse primero y
quedar fijada en un contrato aprobado aparte. Consulta
[la guía de verify](agent-task-verify.md) para sus límites y requisitos de rutas.

## Límite de solo lectura y verificación

El propósito del encargo es una declaración; el adaptador añade barreras locales
de solo lectura y desactiva las herramientas de acceso conocidas de Codex. El
modo `read-only` protege contra escrituras del agente, pero por sí solo permite
leer más archivos del disco. Por eso el adaptador también desactiva shell y las
otras capacidades conocidas, y construye el prompt únicamente con la lista
explícita. Esto no constituye una auditoría de la implementación instalada ni
una garantía frente a cambios transitorios. No interpretes
`agent-task verify: matched` como prueba de calidad o de ausencia de cambios
temporales.

El método ChatGPT reportado y los flags aparecen antes de confirmar. La identidad
de la cuenta, el consumo, la disponibilidad actual y las llamadas internas no se
verifican. Revisa el alcance y comparte solo archivos necesarios; texto, hashes y
rutas pueden ser información privada. La entrega requiere revisión humana.

## Criterios de aceptación de esta etapa

1. `purpose` es opcional y desactivado por omisión; una tarea estándar `1.0.0`
   conserva el resultado anterior.
2. El propósito externo exige reviewer/autonomous, acciones exactas read/verify,
   rutas inspect, referencias contenidas en la lista y cero checks.
3. El resumen identifica el propósito y el borrador no imprime instrucciones de
   entrega libres que contradigan el límite de lectura.
4. Las suites completas pasan con `npm test`; las pruebas de `preview` y `run`
   usan un ejecutable Codex simulado y no consumen una cuenta.
5. Una primera vista previa y una ejecución real requieren archivos de tarea
   aprobados por quien use el Toolkit. La confirmación concreta debe venir antes
   de la inferencia; no se simula ni se reutiliza desde esta documentación.

El adaptador Codex de esta etapa está cubierto por pruebas con un ejecutable
simulado; todavía no se ha hecho una llamada real. Las rutas de imagen y la
importación de `PLAN.md` permanecen fuera de este paso.
