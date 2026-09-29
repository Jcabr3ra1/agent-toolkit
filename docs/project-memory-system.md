# Sistema de memorias de proyecto

- Estado: contrato base v0.1
- Alcance: arquitectura reutilizable
- Plataformas iniciales: Codex, Claude Code y Gemini CLI

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
          ├── Claude Code
          └── Gemini CLI

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
    "syncMode": "git-manual"
  },
  "agents": [
    { "id": "codex", "enabled": true },
    { "id": "claude", "enabled": true },
    { "id": "gemini", "enabled": true }
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

## Ciclo de vida

### 1. Inicializar

1. Validar nombre, identificador y rutas.
2. Comprobar que el repositorio fuente existe.
3. Crear la estructura mínima de la bóveda sin sobrescribir archivos.
4. Generar el manifiesto y la Skill específica.
5. Preparar configuraciones MCP sin activarlas silenciosamente.

### 2. Conectar

1. Instalar enlaces simbólicos o mecanismos equivalentes por plataforma.
2. Activar únicamente herramientas MCP de lectura.
3. Probar listado, búsqueda y lectura de una nota conocida.
4. Registrar la integración solo después de comprobarla.

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

La primera CLI se implementará sin modificar este contrato y ofrecerá:

- `project-memory init`: mostrar plan y crear una memoria de forma idempotente;
- `project-memory doctor`: validar manifiesto, estructura, enlaces, Git y posibles secretos;
- `project-memory connect`: preparar la integración de un agente concreto;
- `project-memory status`: resumir salud, sincronización y conexiones.

Las operaciones destructivas estarán fuera de v0.1. La vista previa será el comportamiento predeterminado y los cambios requerirán una opción explícita de aplicación.

## Criterios de aceptación del contrato base

- El esquema acepta el ejemplo documentado.
- El esquema rechaza escritura MCP, credenciales permitidas y autorizaciones implícitas.
- Se pueden declarar agentes adicionales sin cambiar el esquema.
- Ningún campo obligatorio contiene información secreta.
- La arquitectura mantiene separadas herramientas, repositorio y memoria.
- AVISENS puede adoptar el manifiesto posteriormente sin mover su bóveda ni su repositorio.
- El diseño permite añadir generador, validadores y adaptadores sin romper el contrato v1.

## Plan de evolución

1. **Contrato base:** especificación, esquema y ejemplo validado.
2. **Plantilla canónica:** estructura genérica de bóveda y Skill de memoria.
3. **Validador:** comando `doctor` con comprobaciones locales y salida accionable.
4. **Generador:** comando `init` con vista previa e idempotencia.
5. **Adaptadores:** Codex, Claude Code y Gemini CLI.
6. **Automatización:** impacto documental por eventos estables y respaldo programado.
7. **Índice avanzado:** búsqueda semántica local únicamente cuando el volumen lo justifique.

## Decisiones pendientes

- Elegir el nombre público del comando y del paquete.
- Decidir si `Agent-Toolkit` tendrá un remoto privado.
- Definir el formato de distribución para Windows cuando los enlaces simbólicos no estén disponibles.
- Seleccionar el mecanismo de activación de automatizaciones por eventos.

Estas decisiones no bloquean el contrato ni la plantilla canónica.
