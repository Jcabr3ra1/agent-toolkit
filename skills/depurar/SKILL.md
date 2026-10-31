---
name: depurar
license: MIT
description: Investiga la causa raíz de fallos, pruebas en rojo, regresiones, intermitencias o comportamientos inesperados antes de proponer o aplicar correcciones. Úsala ante cualquier defecto técnico investigable; usa un ajuste directo sin esta skill solo para erratas textuales obvias o preguntas conceptuales sin fallo en ejecución.
---

# Depurar por causa raíz

Reúne evidencia reproducible y localiza el origen del fallo antes de proponer cambios de código. Parchear el síntoma sin entender la causa genera regresiones y retrabajo.

## Cuándo aplica y cuándo usar algo más simple

| Situación | Proceso |
| --- | --- |
| Errata evidente señalada por el usuario o fallo de sintaxis trivial recién introducido | Corregir o indicar la línea exacta y ejecutar la comprobación directa. |
| Pregunta sobre cómo funciona un módulo sin error activo | Inspeccionar y explicar en lectura; no abrir proceso de depuración. |
| Prueba fallida, error en ejecución, regresión, bloqueo o fallo de integración | Seguir las **4 fases** de esta skill sin saltar a parches tentativos. |
| Fallo intermitente, carrera o problema entre múltiples capas (CLI, MCP, red, base de datos) | Seguir las 4 fases y cargar [las técnicas de diagnóstico](references/tecnicas-de-diagnostico.md). |

Si en la sesión ya se aplicó `systematic-debugging` de Superpowers o el usuario ya aportó reproducción y trazas verificadas, **reutiliza esa evidencia** y retoma en la fase correspondiente sin repetir pasos resueltos.

## Regla principal

**Ninguna corrección propuesta o aplicada sin investigar primero la causa raíz.**

Si te descubres pensando «pruebo este cambio rápido a ver si pasa» o proponiendo una lista de arreglos antes de leer la traza y el flujo de datos, detente y vuelve a la Fase 1.

## Las 4 fases

### Fase 1: Investigar y reproducir

1. **Leer el error completo:** inspecciona mensajes, códigos de salida, rutas, líneas y trazas enteras sin ignorar advertencias previas.
2. **Reproducir con consistencia:** ejecuta (cuando esté permitido) el comando o caso mínimo que dispara el problema. Si no es reproducible todavía, reúne más datos en lugar de adivinar.
3. **Revisar qué cambió:** consulta `git status`, `git diff`, commits recientes, configuración local o diferencias de entorno (versión de Node, rutas de `PATH`, permisos, sistema operativo).
4. **Rastrear hasta el origen:** cuando el error estalla al fondo de la pila, sigue hacia atrás quién pasó el valor inválido hasta encontrar el disparador real. En sistemas de varias capas, comprueba qué entra y qué sale en cada frontera antes de tocar lógica.

### Fase 2: Contrastar patrones

1. Localiza en el mismo repositorio un flujo parecido que sí funcione.
2. Lee la referencia completa sin saltar líneas y enumera todas las diferencias (argumentos, entorno, permisos, orden de inicialización, tipos).
3. Identifica los supuestos implícitos que el caso roto incumple.

### Fase 3: Formular y contrastar una hipótesis

1. Enuncia **una sola hipótesis concreta**: «La causa raíz es X porque la evidencia Y muestra Z».
2. Diseña la comprobación mínima que confirma o descarta esa hipótesis cambiando **una sola variable a la vez**.
3. Si la evidencia la descarta, revierte o descarta esa prueba sin destruir trabajo previo del usuario y formula una hipótesis nueva basada en lo observado. Nunca apiles un parche encima de otro fallido.

### Fase 4: Corregir en el origen y verificar

1. **Fijar el fallo en una prueba:** crea o guía la prueba mínima reproducible que falla por la causa identificada (usa `desarrollo-con-pruebas` cuando aplique). Si no cabe prueba automatizada razonable, documenta el comando exacto de reproducción.
2. **Aplicar un único arreglo en el origen:** corrige donde nace el dato o estado inválido, no solo donde revienta. No mezcles limpiezas ni refactorizaciones ajenas.
3. **Comprobar con evidencia fresca:** verifica que la prueba nueva pasa, que la suite relevante sigue en verde y que el síntoma original desapareció (aplica `quality-gate`).
4. **Límite de 3 intentos:** si tras **3 correcciones** el problema reaparece o abre fallos nuevos en otros puntos, **detente**. No intentes el parche número 4: expón la evidencia al usuario y evalúa si el diseño o acoplamiento actual requiere un replanteamiento.

## Modos de trabajo y permisos

- Respeta las instrucciones del proyecto, el sandbox activo y los permisos del encargo. Esta skill no habilita escritura, red, commits ni cambios en la configuración personal.
- **En modo `tutor`:** realiza solo lecturas y diagnósticos no mutantes autorizados. Si necesitas instrumentación temporal, explica qué línea diagnóstica añadir y dónde para que el usuario la pruebe y comparta la salida. Una vez confirmada la causa raíz, entrega la prueba y luego la corrección como **pasos individuales verificables** para que la persona escriba.
- **No destruyas trabajo existente:** conserva cambios previos del usuario; si estorban para aislar la reproducción, infórmalo y acuerda cómo apartarlos antes de tocarlos.

## Ejemplo verificable

- **Síntoma:** una vista previa marca `blocked` en Linux mientras en CI pasa.
- **Fase 1 (evidencia):** en lugar de cambiar la condición de bloqueo, se inspecciona `blockedReason` y el entorno filtrado: `git` vive en `~/.local/bin/git`, pero el inspector interno ejecuta `git` con un `PATH` fijo `/usr/bin:/bin`, devolviendo `ENOENT`.
- **Fase 3 (hipótesis):** el bloqueo no proviene de la rama del proyecto sino de que el proceso de inspección no resuelve `git` desde el `PATH` del entorno cuando está fuera de `/usr/bin`.
- **Fase 4 (corrección y prueba):** prueba con un ejecutable `git` fuera de `/usr/bin` que falla antes del cambio → resolver `git` de forma segura para la inspección sin abrir el `PATH` del cliente hijo → prueba nueva y suite en verde.

Consulta [las técnicas de diagnóstico](references/tecnicas-de-diagnostico.md) para rastreo hacia atrás, validación por capas y esperas por condición. Adaptada de [obra/superpowers](https://github.com/obra/superpowers) (`7.0.1`, licencia MIT en [LICENSE.txt](LICENSE.txt)).
