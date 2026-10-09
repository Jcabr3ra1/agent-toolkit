# Tu primera prueba con Agent Toolkit

Esta guía te permite comprobar la base local sin conectar cuentas, modificar un
proyecto ni gastar cuota de IA. Usarás un ejemplo inventado; después podrás
decidir qué memoria o encargo real quieres preparar.

## 1. Comprueba tu copia

Abre una terminal en la raíz de **Agent-Toolkit**, donde están `package.json`,
`bin/` y `examples/`. No ejecutes estos pasos dentro del backend de otro proyecto.

Si ya tienes la biblioteca local, usa esa copia revisada. Para clonar desde
GitHub, espera a que se publique la revisión aprobada y utiliza la URL privada
confirmada para ti. Clonar una copia antigua no incorpora cambios pendientes
locales. La [beta R1](agent-toolkit-private-beta.md) todavía separa documentación,
validación integrada y publicación: esta guía no realiza la clonación ni un push.

```bash
git status --short
node --version
```

Un checkout limpio muestra salida vacía en el primer comando. Si hay cambios
que no reconoces, consérvalos y solicita revisión; no los borres para seguir.
El segundo muestra tu versión de Node.js, el programa que ejecuta la herramienta.

El paquete declara Node.js 20 o superior. Las comprobaciones documentadas de esta
entrega se hicieron en macOS con Node.js `v24.14.1` y dependencias ya instaladas;
no certifican todas las versiones o sistemas operativos.

También necesitas las dependencias de esta copia, incluido Ajv. Si faltan,
detente y prepara la instalación local con un alcance separado; consulta la
[guía técnica](uso.md). Esta prueba no instala dependencias, comandos globales
o clientes de IA por su cuenta. No necesitas añadir API keys para estos ejemplos.

## 2. Descubre las dos herramientas

```bash
node bin/project-memory.js --help
node bin/agent-task.js --help
```

- `project-memory` trabaja con memorias de proyecto: crear, diagnosticar,
  preparar conexiones y revisar cambios con controles.
- `agent-task` ayuda a preparar un encargo y comprobar archivos enumerados.

Se espera la ayuda de cada herramienta y exit 0. Estos comandos no crean una
bóveda, conectan clientes ni consultan una cuenta. Usar `node bin/...` evita
suponer que ya instalaste un comando global.

## 3. Prepara un encargo ficticio

Copia este comando completo, todavía desde la raíz de Agent-Toolkit:

```bash
node bin/agent-task.js prepare \
  --task examples/task-prepare/task.example.json \
  --request examples/model-selection/request.preference.example.json \
  --catalog examples/model-selection/catalog.preference.example.json \
  --policy examples/model-selection/policy.preference.example.json \
  --json
```

Verás un resumen estructurado. Los resultados principales esperados son:

- `state`: `prepared-draft`, es decir, borrador preparado, no autorizado.
- `mode`: `tutor`; el usuario conserva la escritura del paso.
- Modelo ficticio `example-alpha-r2`, con esfuerzo ficticio `brief`.
- `executed`, `sent`, `wrote`, `runtimeReady` y `verifiedAdmission`: `false`.
- `modelVerification`: `unknown` y `observedModels`: lista vacía.
- `availabilityCurrentVerified`: `false`; no comprobó disponibilidad hoy.

No se ejecutó ese modelo ni se enviaron instrucciones a Claude, Gemini o Codex.
Las fechas y perfiles del ejemplo son históricos e inventados: no sirven como
catálogo real ni prueban acceso a tu suscripción.

Si aparece `needs-info`, `blocked`, `invalid` o un error, conserva el diagnóstico
y revisa la copia/entradas. No actives créditos, cambies permisos o sustituyas
los archivos con datos de un proyecto para hacer pasar el ejemplo.

## 4. Entiende qué comprueba una entrega

```bash
node bin/agent-task.js verify --help
```

Se espera la ayuda y exit 0. `verify` compara los archivos listados con huellas
de contenido revisadas. No prueba que el código sea correcto ni que alguien
haya autorizado aplicarlo. Para una prueba con archivos, consulta el
[ejemplo de verificación](../examples/task-verify/README.md); no inventes un
contrato para una carpeta real o calcules un pin sin revisar primero su contenido.

## 5. Elige el siguiente uso real

No tienes que hacerlo todo a la vez:

- Para una memoria nueva: empieza por la vista previa de
  [project-memory init](project-memory-init.md). Crear y conectar son pasos
  diferentes; no copies datos de otra bóveda.
- Para aprender programando: usa un [encargo tutor](../templates/agent-team/README.md).
  El agente explica, tú escribes y se revisa el resultado.
- Para delegar: delimita archivos, criterios y permisos. Un encargo autónomo
  sigue necesitando autorización y entrega manual a cada participante.

Un encargo real vive en una carpeta privada acordada, no en los ejemplos
versionados. Antes de compartirlo, revisa su contenido y el permiso del receptor.
Actualizar Obsidian, instalar conexiones, hacer commits o publicar no se
autoriza por haber completado esta prueba.

## Estado de esta guía

R1.1 documenta y comprueba ayudas y preparación ficticia existentes. No demuestra
instalación limpia, recorrido integrado de una memoria nueva, compatibilidad
de cuentas o publicación remota. Esas verificaciones son etapas separadas de
[R1](agent-toolkit-private-beta.md).
