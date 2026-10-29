# Ejemplo ficticio de verificador externo

Los archivos de esta carpeta declaran un encargo de revisión para un proyecto
inventado. La ruta `/fictitious/project`, los hashes, la disponibilidad y los
perfiles no corresponden a un repositorio ni a una cuenta real.

Desde la raíz de Agent-Toolkit:

```bash
node bin/agent-task.js prepare \
  --task examples/external-verifier/task.example.json \
  --request examples/external-verifier/request.example.json \
  --catalog examples/external-verifier/catalog.example.json \
  --policy examples/external-verifier/policy.example.json
```

El resumen textual identifica el propósito como verificador externo; con
`--json` aparece `identity.purpose: external-verifier`, junto a una recomendación
declarada para el rol reviewer. `--show-brief` expone el borrador completo; no
lo envía ni inicia ningún cliente.

Usa un contrato separado de `agent-task verify` para comprobar las huellas de
los archivos reales enumerados antes y después del trabajo. El árbol debe
ejecutar el receptor en modo técnico de solo lectura; estas plantillas solo
declaran el límite. Consulta la [guía del verificador externo](../../docs/agentes/coordinacion/agent-task-external-verifier.md)
y la [guía de verify](../../docs/agentes/coordinacion/agent-task-verify.md).
