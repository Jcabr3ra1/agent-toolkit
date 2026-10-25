# Sistema de memorias de proyecto

- Estado: contrato base v0.1
- Alcance: arquitectura reutilizable
- Plataformas: Codex y Claude Code

## Problema

Los agentes necesitan contexto estable de un proyecto, pero cargar documentación completa en cada conversación aumenta el consumo, introduce información irrelevante y facilita que distintas herramientas trabajen con versiones divergentes.

La solución debe permitir que varios agentes consulten la misma memoria sin convertirla en sustituto del repositorio, mezclar proyectos ni conceder escritura automática sin control.

## Objetivo

Definir un sistema reproducible que conecte un repositorio fuente, una memoria privada y uno o más agentes mediante acceso progresivo, trazable y seguro.

Cada nuevo proyecto debe poder adoptar el sistema sin copiar manualmente la configuración de otro proyecto ni heredar su conocimiento privado.

## Fuera de alcance de v0.1

- Crear repositorios remotos o cuentas externas.
- Instalar automáticamente software del sistema.
- Almacenar secretos, tokens o credenciales.
- Modificar el repositorio fuente durante la creación de la memoria.
- Implementar búsqueda vectorial o embeddings.
- Permitir escrituras silenciosas desde el MCP.
- Sincronizar memorias de proyectos diferentes entre sí.

## Principios

1. **Una memoria por proyecto:** cada bóveda tiene límites, historial y permisos independientes.
2. **El repositorio manda:** código, pruebas y documentación vigente describen el comportamiento actual.
3. **Lectura progresiva:** los agentes buscan y leen únicamente el contexto necesario.
4. **MCP de solo lectura:** la conexión de consulta no expone herramientas de escritura.
5. **Escritura controlada:** actualizar una nota exige autorización explícita o una automatización previamente autorizada.
6. **Fuente canónica única:** Skills y plantillas reutilizables viven en `Agent-Toolkit`; el conocimiento específico vive en la memoria correspondiente.
7. **Trazabilidad:** las notas estables indican sus fuentes y las automatizaciones registran qué cambios revisaron.
8. **Idempotencia:** repetir una instalación o comprobación no destruye ni duplica contenido existente.
9. **Portabilidad:** los contratos no dependen de rutas exclusivas de macOS; cada instalación resuelve sus propias rutas.
10. **Privacidad por diseño:** los proyectos no pueden consultar memorias ajenas de forma implícita.

## Arquitectura

```text
Repositorio fuente de verdad
          │
          │ evidencia vigente
          ▼
Memoria privada del proyecto ◄──── Git privado
          │
          │ MCP de solo lectura
          ▼
Skill específica del proyecto
          │
          ├── Codex
          └── Claude Code

Agent-Toolkit
├── Skills generales
├── Perfiles de agentes
├── Plantillas reutilizables
├── Esquemas
├── Adaptadores por plataforma
└── Validadores e instaladores futuros
```

## Separación de responsabilidades

| Componente | Responsabilidad | No debe contener |
| --- | --- | --- |
| Repositorio fuente | Código, pruebas, configuración y documentación técnica vigente | Copias de la bóveda o credenciales |
| Memoria del proyecto | Contexto estable, decisiones, arquitectura explicada, hitos y traspasos | Código duplicado, secretos o conversaciones completas |
| Skill del proyecto | Selección de fuentes, orden de consulta y reglas de mantenimiento | Todo el contenido de la memoria |
| MCP | Acceso limitado a las rutas autorizadas | Herramientas de escritura habilitadas por defecto |
| `Agent-Toolkit` | Componentes generales y portables | Conocimiento exclusivo de un proyecto |
| Automatización | Detectar eventos y mantener conocimiento estable | Tratar ramas abiertas como estado vigente |

## Manifiesto del proyecto

Cada memoria tendrá un archivo `project-memory.json` validable con `schemas/project-memory.schema.json`.

Ejemplo:

```json
{
  "$schema": "../Agent-Toolkit/schemas/project-memory.schema.json",
  "schemaVersion": "1.0.0",
  "project": {
    "id": "mi-proyecto",
    "name": "Mi Proyecto"
  },
  "source": {
    "repositoryPath": "/ruta/al/repositorio",
    "defaultBranch": "main",
    "integrationBranch": "develop"
  },
  "memory": {
    "vaultPath": "/ruta/a/mi-proyecto-memory",
    "mcpServerName": "mi-proyecto-memory",
    "repositoryBranch": "main",
    "syncMode": "git-manual",
    "layout": {
      "profile": "canonical-v1"
    }
  },
  "agents": [
    { "id": "codex", "enabled": true },
    { "id": "claude", "enabled": true }
  ],
  "security": {
    "mcpAccess": "read-only",
    "sensitiveDataPolicy": "forbidden",
    "writeRequiresExplicitAuthorization": true,
    "allowCredentialsInMemory": false
  }
}
```

Las rutas son valores locales. El manifiesto no debe incluir tokens dentro de URLs, variables de entorno sensibles ni valores de archivos `.env`.

### Perfiles de estructura

- `canonical-v1`: usa la estructura de la plantilla oficial. Es el perfil predeterminado cuando `layout` no está presente, para conservar compatibilidad con manifiestos v1 existentes.
- `declared`: permite incorporar una memoria estable anterior sin renombrar ni duplicar sus carpetas. Exige `requiredDirectories` y `requiredNotes` explícitos, no vacíos y relativos a la raíz de la bóveda.

Las rutas declaradas no pueden ser absolutas, usar `..`, barras invertidas ni separadores finales. El perfil solo cambia qué elementos estructurales comprueba `doctor`; no reduce las validaciones de esquema, enlaces, secretos, Git o seguridad.

## Ciclo de vida

### 1. Inicializar

1. Validar nombre, identificador y rutas.
2. Comprobar que el repositorio fuente existe.
3. Crear la estructura mínima de la bóveda sin sobrescribir archivos.
4. Generar el manifiesto y la Skill específica.
5. Preparar configuraciones MCP sin activarlas silenciosamente.

### 2. Conectar

1. Ejecutar `project-memory connect <memoria> --agent <agente>` para revisar el
   plan sin modificar el equipo.
2. Aplicar el plan explícitamente con `--apply` cuando no existan conflictos.
3. Instalar el enlace simbólico hacia la Skill canónica de la memoria.
4. Activar únicamente herramientas MCP de lectura mediante la política propia
   de Codex o Claude Code.
5. Reiniciar la sesión y probar listado, búsqueda y lectura de una nota conocida.

### 3. Consultar

1. Identificar la necesidad concreta.
2. Consultar el perfil del proyecto.
3. Buscar antes de leer.
4. Contrastar con el repositorio cuando la respuesta dependa del comportamiento actual.
5. Informar fuentes, vacíos y contradicciones.

### 4. Mantener

1. Detectar un evento estable, como un Pull Request fusionado o una decisión aprobada.
2. Analizar impacto documental.
3. Enumerar las notas candidatas.
4. Obtener autorización o comprobar la automatización autorizada.
5. Editar rutas exactas, validar y sincronizar.

### 5. Archivar

1. Marcar la memoria como inactiva sin borrar su historial.
2. Deshabilitar MCP, Skills y automatizaciones asociadas.
3. Conservar el manifiesto y la evidencia necesaria para restauración.

## Seguridad

### Amenazas principales

- Un agente escribe en la memoria durante una consulta.
- Una Skill carga datos de otro proyecto.
- Una automatización documenta trabajo todavía no fusionado.
- Un manifiesto contiene credenciales o una URL con token.
- Una instalación sobrescribe una bóveda existente.
- Dos agentes editan simultáneamente las mismas notas.

### Controles obligatorios

- MCP configurado como `read-only` y sin herramientas de escritura.
- Rutas permitidas explícitas y separadas por proyecto.
- Política `sensitiveDataPolicy: forbidden`.
- Escritura autorizada y limitada a notas enumeradas.
- Git con agregado por rutas exactas.
- Comprobación de secretos, formato, enlaces y estado remoto antes de sincronizar.
- Detención ante conflictos, cambios ajenos o fuentes ambiguas.

## Compatibilidad

El contrato usa JSON y rutas como cadenas para funcionar en macOS, Linux y Windows. Los adaptadores futuros resolverán diferencias como:

- rutas y separadores del sistema;
- ubicación de Skills y configuración MCP;
- soporte de enlaces simbólicos;
- comandos de instalación y permisos;
- capacidades específicas de cada cliente MCP.

El esquema no presupone que todas las plataformas se ejecutan en la misma máquina.

## Requisitos de la futura CLI

La CLI evoluciona sin modificar este contrato y ofrece:

- `project-memory init`: mostrar plan y crear una memoria de forma idempotente;
- `project-memory doctor`: validar manifiesto, estructura, enlaces, Git y posibles secretos;
- `project-memory connect`: preparar la integración segura de Codex o
  Claude Code, con vista previa e idempotencia;
- `project-memory status`: resumir salud, sincronización y conexiones en modo
  de solo lectura.

Las operaciones destructivas estarán fuera de v0.1. La vista previa será el comportamiento predeterminado y los cambios requerirán una opción explícita de aplicación.

### Contrato de `init`

`project-memory init` recibe un destino nuevo o compatible, la identidad del proyecto y la ruta de un repositorio Git existente. En vista previa calcula todos los archivos, conflictos y elementos sin cambios sin escribir en disco.

Con `--apply` crea el manifiesto, la bóveda canónica y la Skill específica únicamente cuando la validación completa no detecta conflictos. Repetir la misma operación conserva los archivos sin reescribirlos. Un archivo existente con contenido diferente detiene toda la operación.

La primera versión no inicializa Git, no crea remotos, no configura MCP y no instala Skills. Estas responsabilidades pertenecen a comandos o adaptadores posteriores.

### Contrato de `connect`

`project-memory connect` recibe una memoria válida y un agente habilitado en el
manifiesto. Inspecciona el enlace de la Skill, el servidor MCP homónimo y la
política de herramientas sin escribir nada en modo de vista previa.

Con `--apply` crea únicamente los componentes ausentes. Un enlace que apunte a
otra Skill o un MCP homónimo con otro comando, argumentos o bóveda detiene toda
la operación. La política resultante expone nueve operaciones de lectura y
excluye las operaciones de creación, edición, escritura y movimiento del
servidor filesystem.

Repetir la operación sobre una conexión correcta conserva la configuración sin
duplicarla. El comando no copia credenciales, no modifica el repositorio fuente
y no escribe contenido en la bóveda.

### Contrato de `status`

`project-memory status` combina el diagnóstico de la memoria con la inspección
de Skill, MCP y política de herramientas para todos los agentes habilitados. No
aplica planes ni modifica archivos.

Una memoria y conexiones completas producen `OK`; elementos que necesitan
creación o actualización producen `WARNING`; manifiestos inválidos, fallos de
inspección y configuraciones homónimas diferentes producen `ERROR`. El modo
`--strict` convierte las advertencias en un código de salida distinto de cero
para su uso en automatizaciones.

## Actualización controlada de notas

El ciclo local distingue detección (`sync plan`), evidencia (`sync inspect`),
aplicación de contenido ya revisado (`sync apply`) y registro de la conclusión
(`sync record`). No se encadenan como autorizaciones implícitas.

`apply` exige una propuesta externa, versiones exactas y la huella de una vista
previa aprobada. Valida una memoria virtual antes de escribir y comparte bloqueo
con `record`. Reemplaza solo notas existentes, sin tocar el ledger o Git. Varias
notas no forman una transacción atómica: un fallo exige revisar el resultado
parcial, sin rollback automático. Su base está probada y revisada para entrega
local; adopción real, publicación y automatización requieren pasos separados.

El [contrato de aplicación](project-memory-sync-apply.md) documenta los límites,
la evidencia y lo que no certifica. MCP y las conexiones siguen en solo lectura.

## Criterios de aceptación del contrato base

- El esquema acepta el ejemplo documentado.
- El esquema rechaza escritura MCP, credenciales permitidas y autorizaciones implícitas.
- Se pueden declarar agentes adicionales sin cambiar el esquema.
- Ningún campo obligatorio contiene información secreta.
- La arquitectura mantiene separadas herramientas, repositorio y memoria.
- AVISENS puede adoptar el manifiesto posteriormente sin mover su bóveda ni su repositorio.
- Una memoria existente puede declarar su estructura sin debilitar las demás comprobaciones del doctor.
- El diseño permite añadir generador, validadores y adaptadores sin romper el contrato v1.

## Plan de evolución

1. **Contrato base:** especificación, esquema y ejemplo validado.
2. **Plantilla canónica:** estructura genérica de bóveda y Skill de memoria.
3. **Validador:** comando `doctor` con comprobaciones locales y salida accionable.
4. **Generador:** comando `init` con vista previa e idempotencia.
5. **Adaptadores:** Codex y Claude Code. Implementado en la CLI.
6. **Automatización:** impacto documental por eventos estables y respaldo programado.
7. **Índice avanzado:** búsqueda semántica local únicamente cuando el volumen lo justifique.

## Decisiones pendientes

- Elegir el nombre público del comando y del paquete.
- Definir el formato de distribución para Windows cuando los enlaces simbólicos no estén disponibles.
- Seleccionar el mecanismo de activación de automatizaciones por eventos.

Estas decisiones no bloquean el contrato ni la plantilla canónica.

## Respaldo de la biblioteca

El 2026-10-01 el usuario autorizó publicar esta biblioteca en un repositorio
privado de GitHub. Es un respaldo independiente de las memorias: no contiene
las bóvedas, manifiestos locales ni información privada de proyectos.

La creación manual del remoto no añade esa capacidad a `project-memory init`
ni cambia los permisos MCP. El README principal presenta el producto en
lenguaje sencillo; los comandos se conservan en la [guía de uso](uso.md).
