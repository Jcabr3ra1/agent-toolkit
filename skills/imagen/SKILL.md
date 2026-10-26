---
name: imagen
description: Genera una imagen con Gemini (Antigravity CLI) a partir de una descripción y la guarda. Úsala solo cuando el usuario escriba /imagen o $imagen, o pida expresamente una imagen con Gemini. No la uses con datos privados.
---

# Imagen con Gemini

Gemini genera la imagen con el subagente `image-generator` de `agy` (Antigravity
CLI), desde una carpeta vacía propia. Es una herramienta aparte de la revisión
cruzada.

1. La descripción es el texto que el usuario escribió después de `/imagen` o
   `$imagen`. Si no escribió nada, pídesela en una línea y espera. Si no dijo
   dónde guardarla, pregunta en la misma línea (por ejemplo, una carpeta del
   proyecto); sin carpeta, queda solo en `~/.agent-toolkit/gemini/imagen/`.
2. **Privacidad:** solo sale a Google el texto de la descripción. No incluyas
   código, rutas, secretos ni datos de proyecto que el usuario no haya escrito.
3. Confirma en una línea: «Genero una imagen con Gemini (`gemini-3.8-flash-low`)
   con: «…». ¿Procedo?». Omite la pregunta solo si el usuario ya pidió ejecutarlo.
4. Ejecuta (la generación termina después de la consulta; el comando espera
   hasta 4 minutos a que aparezca el archivo):

   ```
   node /Users/juan_jaller/programacion/Agent-Toolkit/bin/agent-toolkit-gemini.js imagen --prompt "<descripción>" [--copiar-a <carpeta>] [--espera-seg <n>]
   ```

   `--copiar-a` copia el resultado sin sobrescribir. Si la carpeta ya tiene un
   archivo con ese nombre, el comando lo dice: no lo fuerces.
5. Si el archivo copiado está dentro de las carpetas de trabajo, míralo con
   Read para comprobarlo y descríbelo en una línea; si no, di la ruta. No
   afirmes que cumple lo pedido sin haberlo visto.
6. Si falla o no termina a tiempo, di el motivo y la carpeta donde puede aparecer;
   no reintentes sin avisar.

El vídeo no está disponible en esta herramienta.
