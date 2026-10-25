# Verificador externo

## Estado y alcance

Esta etapa añade un propósito explícito a `agent-task prepare` para redactar un
encargo de revisión con el rol `reviewer`. El borrador limita las acciones
declaradas a lectura/verificación y enumera archivos únicamente para inspección.
La entrega sigue siendo manual: esta etapa no invoca clientes ni envía datos.

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

## Recorrido manual

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
exponer el encargo completo en el terminal. No se guarda, envía ni ejecuta
automáticamente.

Para comparar que los archivos listados siguen iguales antes y después de una
revisión, prepara un contrato de `agent-task verify` con operación `inspect` y
la misma huella esperada en ambas fases. Fija sus bytes con `--expect` y ejecuta
`verify --phase before` y luego `verify --phase after`. Si también se quiere
comprobar el archivo de respuesta, su huella esperada debe revisarse primero y
quedar fijada en un contrato aprobado aparte. Consulta
[la guía de verify](agent-task-verify.md) para sus límites y requisitos de rutas.

## Límite de solo lectura

La preparación comprueba que el contrato del encargo no permite escribir; no
configura el sistema operativo ni el cliente receptor. El texto de una
instrucción no es una barrera técnica. **No ejecutes este encargo en un cliente
con acceso de escritura.** La etapa del adaptador deberá imponer y probar un modo
de solo lectura del cliente antes de invocarlo; si no puede verificarlo, debe
detenerse. Tampoco se debe interpretar `agent-task verify: matched` como una
prueba de calidad, de que el agente no hizo cambios transitorios, o de que no
tocó rutas no enumeradas.

La base actual no conoce la cuenta, el modelo real, el consumo, la disponibilidad
actual ni las protecciones efectivas del cliente. El borrador no les concede
permiso. Revisa y comparte solo los archivos necesarios; hashes y rutas también
pueden ser información privada.

## Criterios de aceptación de esta etapa

1. `purpose` es opcional y desactivado por omisión; una tarea estándar `1.0.0`
   conserva el resultado anterior.
2. El propósito externo exige reviewer/autonomous, acciones exactas read/verify,
   rutas inspect, referencias contenidas en la lista y cero checks.
3. El resumen identifica el propósito y el borrador no imprime instrucciones de
   entrega libres que contradigan el límite de lectura.
4. Las suites completas pasan con `npm test` y una demostración local recorre
   `prepare`, `verify --phase before` y `verify --phase after` sobre archivos
   temporales. Esta demostración no invoca un modelo.

Este cierre no incluye el adaptador, una invocación externa real, ruta de imagen
ni importación de `PLAN.md`.
