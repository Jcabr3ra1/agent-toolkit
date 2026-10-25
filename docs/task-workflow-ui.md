# Flujo visual de tareas

La app local guía una tarea en cuatro etapas: Codex prepara el plan, Claude
Code contrasta el plan, Claude Code entrega o aplica el cambio y Codex revisa
el resultado. Los agentes no conversan directamente: tú llevas cada respuesta
de vuelta a la pantalla y decides cuándo avanzar.

## Iniciar la app

Desde la carpeta de Agent Toolkit, instala las dependencias la primera vez y
levanta la pantalla:

```sh
npm install
npm run ui
```

Abre `http://127.0.0.1:4321/` en el navegador. La app escucha solo en el equipo
local. Si el puerto está ocupado, inicia con otro puerto, por ejemplo:

```sh
AGENT_TOOLKIT_UI_PORT=4322 npm run ui
```

Luego abre `http://127.0.0.1:4322/`.

## Completar el recorrido

1. Escribe el objetivo, el nombre o ruta del proyecto y cómo reconocerás el
   resultado. La app no abre esa ruta: abre el proyecto en el cliente del agente
   antes de pegarle el encargo.
2. Deja **Tutor** para que Claude Code te dé el código y un paso de comprobación
   para que tú lo escribas. Puedes elegir **Autónomo** si quieres que Claude Code
   aplique la propuesta después de que la revises y marques la autorización
   explícita.
3. Prepara y copia el encargo de Codex. Pégalo en Codex con el proyecto abierto,
   espera su plan y pega aquí su respuesta.
4. Prepara el encargo de Claude Code. Pégalo en Claude Code para que contraste
   el plan con el estado real del proyecto y proponga los cambios. En esta etapa
   el encargo prohíbe editar archivos.
5. Revisa la propuesta. En modo tutor, pide a Claude Code un paso de código que
   tú escribirás. En modo autónomo, la casilla de autorización solo se muestra
   aquí; sin marcarla, el encargo no autoriza ediciones. Claude Code debe limitar
   el trabajo a la propuesta y no crear commits ni publicar.
6. Pega el resultado y la evidencia de comprobaciones. Prepara el último encargo,
   llévalo a Codex junto con el diff real y la evidencia del proyecto, y pega la
   revisión final para cerrar la tarea.

## Datos y límites

- Agent Toolkit arma los textos con una plantilla local. **Codex genera el plan
  al recibir el encargo**, usando el cliente, sesión y cuenta que tú elijas; la
  app no inicia sesión ni llama a OpenAI o Anthropic.
- La app no verifica qué cuenta, modelo, esfuerzo, permisos ni cuota están
  activos. La sugerencia de modelo y esfuerzo de `agent-task prepare` es un flujo
  de CLI separado y requiere los perfiles aprobados.
- La app no transmite las respuestas al servidor. Guarda el progreso en el
  almacenamiento local de este navegador. Puedes exportar o borrar la tarea
  desde la pantalla; no pegues contraseñas, tokens ni secretos.
- La autorización de la app se incorpora al texto que copias. Los permisos
  efectivos de escritura dependen también de la configuración de Claude Code.
- La revisión de Codex solo puede comprobar el código y las pruebas que estén
  disponibles en su cliente. Incluye el diff real y los resultados; el texto
  pegado en la app no demuestra por sí mismo que un cambio se aplicó.
