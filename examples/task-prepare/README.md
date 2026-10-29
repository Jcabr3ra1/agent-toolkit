# Un encargo ficticio, sin ejecutar agentes

Este ejemplo usa únicamente datos inventados. La ruta del proyecto y las huellas
no corresponden a archivos reales. Las fechas pertenecen a una evaluación
ficticia histórica: no demuestran disponibilidad actual en una cuenta.

Desde la raíz de Agent-Toolkit:

```bash
node bin/agent-task.js prepare \
  --task examples/task-prepare/task.example.json \
  --request examples/model-selection/request.preference.example.json \
  --catalog examples/model-selection/catalog.preference.example.json \
  --policy examples/model-selection/policy.preference.example.json
```

Se espera `prepared-draft` y el modelo ficticio `example-alpha-r2`, con esfuerzo
`brief`. Añade `--json` para obtener el resumen estructurado o `--show-brief`
para mostrar el borrador completo, no ambos. La CLI no guarda ni envía el texto,
no lee README.md/AGENTS.md/notas del proyecto y no consulta proveedores.

Las entradas son [task](task.example.json),
[request](../model-selection/request.preference.example.json),
[catalog](../model-selection/catalog.preference.example.json) y
[policy](../model-selection/policy.preference.example.json).
No rellenar estos ejemplos versionados con datos de proyectos reales.

Un encargo real debe prepararse en documentos privados y revisar fuentes,
instrucciones y permiso directo antes de entregarlo al receptor. El resumen
no demuestra autenticación, actualidad de disponibilidad o identidad del modelo
que responderá. `--show-brief` expone el texto en tu terminal y sus posibles logs.

Consulta el [contrato y sus límites](../../docs/agentes/coordinacion/agent-task-prepare.md).
