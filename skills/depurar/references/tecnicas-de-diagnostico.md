# Técnicas de diagnóstico

Carga esta referencia cuando el error aparezca lejos de su causa original, atraviese varios procesos o provoque fallos intermitentes en pruebas.

## 1. Rastreo hacia atrás (backward tracing)

Cuando un fallo ocurre en una operación profunda (por ejemplo, abrir una ruta equivocada, ejecutar un comando en el directorio raíz o recibir `undefined` en un validador interno):

1. **Anota el síntoma exacto** y la línea que lanza el error.
2. **Identifica la causa inmediata:** ¿qué variable o parámetro llegó con un valor inválido?
3. **Sube un nivel por llamada:** ¿qué función invocó a esta y de dónde sacó ese argumento?
4. **Repite hasta el disparador original:** busca inicializaciones incompletas, promesas sin esperar, configuraciones vacías o fixtures leídos antes de prepararse.
5. **Corrige en la fuente:** arreglar únicamente el consumidor final oculta el defecto y deja el dato corrupto circulando por el resto del flujo.

Si no basta con leer el código, captura el contexto justo **antes** de la operación peligrosa (ruta recibida, `process.cwd()`, variables relevantes y `new Error().stack`). En pruebas de Node.js usa `console.error` temporalmente si el runner silencia logs normales, y retira toda instrumentación temporal antes de cerrar.

## 2. Defensa en profundidad tras hallar la causa

Cuando un dato inválido atravesó varias capas sin detectarse, acompasa la corrección en el origen con validaciones proporcionales en las fronteras reales:

- **Capa 1 — Entrada pública / contrato:** rechazar entradas vacías, tipos erróneos o rutas no normalizadas al cruzar la interfaz.
- **Capa 2 — Lógica de dominio:** comprobar precondiciones propias de la operación antes de actuar.
- **Capa 3 — Guardas de entorno:** impedir efectos peligrosos fuera del contexto previsto (por ejemplo, en pruebas rechazar escrituras o `git init` fuera del directorio temporal propio).

No añadas capas redundantes sin propósito; añade aquellas donde otra ruta de llamada o un doble de prueba podría saltarse la primera validación. Comprueba que cada guarda rechaza el caso inválido esperado.

## 3. Esperas basadas en condición frente a fallos intermitentes

Las pruebas asíncronas que usan `setTimeout` o `sleep` con tiempos arbitrarios pasan en máquinas rápidas y fallan bajo carga o en otros sistemas operativos.

- **Regla:** espera a la **condición observable** que te importa (evento emitido, estado alcanzado, archivo escrito, línea JSON recibida), nunca a una estimación de cuántos milisegundos tardará.
- **Sondeo seguro:** si no existe evento directo, consulta el estado fresco dentro del bucle cada `10–25 ms` e incluye siempre un `timeout` explícito con un mensaje que indique qué condición no llegó a cumplirse.
- **Única excepción para tiempos fijos:** cuando se prueba un temporizador real (`debounce`, expiración de TTL, `timeout`). En ese caso espera primero la condición de arranque y documenta en una línea por qué el intervalo elegido corresponde al contrato probado.

---

Técnicas adaptadas al español para Agent Toolkit a partir de `systematic-debugging` en [obra/superpowers](https://github.com/obra/superpowers) (`7.0.1`, MIT).
