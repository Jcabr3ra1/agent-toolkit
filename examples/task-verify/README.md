# Un contrato de verificación ficticio

Este ejemplo usa únicamente datos inventados. Cada huella del
[contrato](contract.example.json) es el SHA-256 de un string ficticio,
incluido su salto de línea final:

| Entrada | Operación | before | after |
| --- | --- | --- | --- |
| demo-guide | inspect | `demo guide unchanged\n` | igual |
| demo-readme | modify | `demo readme v1\n` | `demo readme v2\n` |
| demo-new-note | create | ausente | `demo new note\n` |
| demo-obsolete | delete | `demo obsolete note\n` | ausente |
| demo-proposal (handoff) | inspect | `demo proposal r01\n` | igual |

Las palabras inspect/modify/create/delete son **expectativas**, no órdenes:
verify no crea, modifica ni borra nada.

## Preparar fixtures privadas para probarlo

Hazlo solo con autorización y fuera de cualquier repositorio, bóveda de
Obsidian, carpeta sincronizada o HOME exacto:

1. Crea dos directorios temporales tuyos y distintos, sin anidar: uno hará
   de raíz *source* y otro de *handoff* con modo exactamente 0700, sin bits
   setuid/setgid/sticky. El contrato puede guardarse en handoff.
2. Escribe en ellos los strings de la tabla en las rutas del contrato.
   Ejemplo: `docs/readme.md` con `demo readme v1` y un salto de línea.
3. Copia el contrato a una ubicación privada, **revísalo** y anota en un canal
   aparte la huella SHA-256 de sus bytes. Esa anotación es el pin de `--expect`;
   no lo obtengas de la salida de verify ni del propio contrato.
4. Ejecuta la fase before. Después cambia los archivos al estado after y
   ejecuta la fase after.

```text
node bin/agent-task.js verify \
  --contract <contrato-privado.json> --expect <pin-anotado-al-revisar> \
  --source <raíz-source-ficticia> --handoff <raíz-handoff-ficticia> \
  --phase before
```

Los valores entre `<>` son marcadores: no pongas aquí rutas reales de tus
proyectos. Las pruebas automáticas crean equivalentes efímeros en un directorio
temporal propio.

## Qué significa el resultado

`matched` solo dice que los archivos listados coinciden con sus huellas en esa
fase. No aprueba código, pruebas, Git, modelos ni permiso, y no ve archivos no
listados. Si un contrato copiara el hash de una entrega incorrecta, verify
también daría `matched`: la confianza en el contrato es una revisión humana.

Consulta el [contrato y sus límites](../../docs/agentes/coordinacion/agent-task-verify.md).
