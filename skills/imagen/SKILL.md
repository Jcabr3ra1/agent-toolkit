---
name: imagen
description: Genera una imagen con Gemini por Antigravity. Úsala cuando el usuario escriba /imagen o $imagen, o pida expresamente una imagen con Gemini.
---

# Imagen con Gemini

Lee [gemini](../gemini/SKILL.md) y usa `imagen --prompt` con la descripción del
usuario. Si falta la descripción, solicítala. Sin destino elegido conserva la
carpeta propia; no hace falta preguntar dónde guardar para empezar. Muestra el
resultado cuando el cliente pueda visualizarlo. Si tarda en aparecer, usa
`recuperar` sin volver a generar. La petición explícita autoriza esa generación.
