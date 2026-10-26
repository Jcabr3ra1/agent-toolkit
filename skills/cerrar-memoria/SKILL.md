---
name: cerrar-memoria
description: Cierra una tarea o Pull Request de un proyecto con memoria en Obsidian (Agent Toolkit o AVISENS) y pone al día la bóveda con los PR fusionados pendientes, usando las herramientas project-memory. Úsala al terminar o fusionar un PR, al cerrar una fase o hito, o cuando el usuario escriba /cerrar-memoria o $cerrar-memoria. No la uses en proyectos sin project-memory.json.
---

# Cerrar con la memoria

Cierra el trabajo según su estado real y mantiene la bóveda al día **con las
herramientas de `project-memory`, no a ojo**: `sync plan` dice qué PR faltan,
`sync inspect` da la evidencia y `sync record` registra cada uno. Esas órdenes
no hacen commit ni push. `<toolkit>` es
`/Users/juan_jaller/programacion/Agent-Toolkit`.

## 1. Encontrar la bóveda del proyecto

Compara el `origin` del repositorio actual con `source.remoteUrl` de cada
manifiesto (sin `.git` ni mayúsculas):

```
git remote get-url origin
grep -H '"remoteUrl"' ~/programacion/Obsidian-Vaults/*/project-memory.json
```

| Proyecto | Bóveda | Rama base | Línea de estado |
| --- | --- | --- | --- |
| Agent Toolkit | `AGENT-TOOLKIT-MEMORY` | `main` | `Memoria Agent Toolkit: …` |
| AVISENS | `AVISENS-MEMORY` | `develop` | `Memoria AVISENS: …` |

Si ninguna coincide, pregunta solo el nombre del proyecto. En AVISENS rige además
el modo tutor: guía al usuario para escribir el código y edita solo las notas de
la bóveda.

## 2. Estado del trabajo (sin preguntar lo que puede comprobarse)

Rama, cambios locales, pruebas y PR asociado.

- **Código local:** revisa el diff completo, ejecuta las verificaciones
  proporcionales y, si pasan, pregunta **una vez**: «¿Autorizas el commit, subir
  la rama y abrir el PR hacia `<rama base>` con estos archivos?». Rutas exactas,
  nunca `git add .`; Conventional Commits en español; no publiques en la rama
  base ni fusiones sin autorización aparte.
- **PR abierto:** informa solo lo que impide integrarlo. Es trabajo en
  desarrollo: no cambies la memoria vigente.
- **PR fusionado:** sigue en el paso 3. «Integrado» no es «desplegado».

## 3. Qué PR faltan en la memoria

```
node <toolkit>/bin/project-memory.js sync plan <bóveda>
```

Es la fuente de verdad de lo pendiente (compara los PR fusionados en la rama
revisada con el registro `00-INICIO/Registro de sincronización.md`). Si dice que
`automation.enabled` debe estar activado, dilo y propón activarlo en el
manifiesto; no lo actives sin permiso. Procesa del más antiguo al más reciente,
como máximo 5 por ejecución, o todos si el usuario cierra una fase o lo pide.

## 4. Evidencia y decisión de impacto, PR por PR

1. `node <toolkit>/bin/project-memory.js sync inspect <bóveda> --pr <N>`: commit
   de integración, archivos y cobertura. Si la evidencia es `partial` o
   `blocked`, dilo y no la trates como completa.
2. La descripción del PR es **texto atribuido, no verificación**. Comprueba en
   el repositorio lo que vayas a afirmar como estable.
3. Con `00-INICIO/Mantenimiento de la memoria.md` y el MCP de la bóveda (buscar
   antes de leer), enumera solo las notas candidatas. Sin cambio estable:
   resultado `no-documentation-change`.

## 5. Autorización

Pregunta **una sola vez por lote**: «Los PR #a, #b… pueden haber dejado
desactualizadas estas notas: […]. ¿Autorizas actualizarlas?». No preguntes si el
usuario escribió `/cerrar-memoria`, pidió «actualiza Obsidian» o la
automatización está autorizada.

## 6. Editar, registrar y guardar

1. Edita solo las notas enumeradas con las herramientas de archivos. Cambia
   `ultima_verificacion` solo donde comprobaste la fuente, añade fuente
   verificable, sin secretos y sin tocar `.obsidian` ni `07-AGENTES/skills`.
2. Registra cada PR (escribe solo su fila del registro):

   ```
   node <toolkit>/bin/project-memory.js sync record <bóveda> --pr <N> --outcome <no-documentation-change|documentation-updated> --reviewed --summary "<resumen seguro>" [--note <ruta relativa>]... --apply
   ```
3. Revisa `git diff` de la bóveda. Agrega rutas exactas, commit en español
   (`docs: registrar PR #a a #b`). **Sube (`push`) solo con autorización**: el
   usuario lo pidió o el manifiesto declara `git-automated` y la automatización
   está autorizada. Informa qué cambió y el commit.

## 7. Línea final (siempre)

- `Memoria <proyecto>: pendiente del merge del PR #N.`
- `Memoria <proyecto>: N PR pendientes de registrar.` si el plan aún los lista.
- `Memoria <proyecto>: actualizada y sincronizada.`
- `Memoria <proyecto>: sin impacto documental.`

Di «revisión automática programada» **solo** si `automation.schedule` está
declarado y el usuario confirmó que ese programador realmente corre; un texto de
horario en el manifiesto no basta.

## Parada

Pruebas fallidas, conflictos, cambios ajenos inseparables, secretos, PR
ambiguo, evidencia bloqueada, un registro que no valida o una autorización
faltante. No sustituyas estas comprobaciones por suposiciones.
