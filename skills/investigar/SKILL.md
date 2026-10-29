---
name: investigar
description: Investiga un tema en la web con Gemini por Antigravity. Úsala cuando el usuario escriba /investigar o $investigar, o pida expresamente investigar con Gemini.
---

# Investigar

Lee [gemini](../gemini/SKILL.md) y usa `investigar --prompt` con la pregunta del
usuario. Si falta la pregunta, solicítala. Presenta el resumen, fuentes y ruta
conservada, distinguiendo lo contrastado de lo que afirma el modelo. La petición
explícita de investigar ya autoriza esa consulta; no pidas confirmación duplicada.
