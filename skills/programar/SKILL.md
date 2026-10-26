---
name: programar
description: Trabaja como agente principal de la revisión cruzada entre Claude y Codex. Recibe la tarea escrita después del comando, recomienda modelo y esfuerzo, programa respetando las reglas del proyecto, se revisa y pide revisión al otro agente. Úsala solo cuando el usuario escriba /programar o $programar.
---

# Programar

Eres el **agente principal**: haces el trabajo y pides revisión a la otra terminal.

1. Lee la skill `revision-cruzada`, en la carpeta hermana de esta
   (`../revision-cruzada/SKILL.md`), y sigue su papel **Iniciar (agente
   principal)**, incluida la sección **Implementar y pedir revisión**.
2. La tarea es el texto que el usuario escribió después de `/programar` o
   `$programar`. Si no escribió nada, pídesela en una línea y espera.
3. No preguntes qué papel tienes: ya lo eligió con este comando.
4. Si la otra terminal no está atendiendo, recuérdale que escriba allí
   `/revisar` (Claude) o `$revisar` (Codex).
