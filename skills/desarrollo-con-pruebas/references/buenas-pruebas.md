# Cómo escribir buenas pruebas

Carga esta referencia al redactar pruebas nuevas, revisar tests existentes o decidir si hace falta un doble (`mock` / `fixture`).

## 1. Nombrar la rotura que la prueba atrapa

Antes de escribir el cuerpo del test, responde: **¿qué cambio erróneo en producción haría fallar esta prueba?**

- **Deriva el resultado esperado a mano:** usa literales o fixtures comprobados manualmente. Si calculas el valor esperado llamando a la misma función o helper bajo prueba, la aserción pasará incluso cuando la lógica esté rota.
- **Prueba comportamiento observable, no detectores de cambio:** evita fijar detalles internos privados o buscar líneas literales con expresiones regulares sobre archivos de código o scripts; ejecuta el módulo o comando con entradas controladas y comprueba su salida, efecto o código de retorno.
- **Tu frontera, no el framework:** comprueba los contratos, validaciones y efectos de tu código; no escribas pruebas para demostrar que Node.js, el router o la librería estándar funcionan como documentan sus autores.

## 2. Ejercitar el componente real

- **Nunca hagas aserciones sobre el propio mock:** comprobar que un mock devolvió lo que tú mismo le configuraste no demuestra nada del sistema real. Comprueba el resultado o estado real del componente bajo prueba.
- **Sustituye solo la frontera lenta o externa:** conoce primero todos los efectos secundarios del método real y reemplaza únicamente el nivel externo necesario (red, cliente remoto, reloj o proceso pesado), manteniendo real la lógica, validación y persistencia local en directorios temporales aislados.
- **Espeja estructuras reales completas:** cuando uses un fixture o respuesta simulada, incluye todos los campos relevantes del contrato real para no ocultar errores cuando el código lea propiedades omitidas.
- **Mantén las utilidades de limpieza fuera de producción:** los helpers que solo existen para pruebas viven en `test/` o `test-support/`, nunca como métodos artificiales en los módulos de producción.

## 3. Chequeo rápido de mutaciones

Antes de cerrar un archivo de pruebas, piensa si al menos una prueba caería en rojo ante estas mutaciones realistas en producción:

1. Condición invertida o rama omitida.
2. Falta de validación para entrada vacía, nula, malformada o sin permiso.
3. Efecto secundario ausente (no guardar, no cerrar, o modificar una ruta indebida).
4. Valor devuelto por defecto o constante equivocada.

Si una mutación importante dejaría toda la suite en verde, falta una aserción de comportamiento o una prueba de borde.

---

Referencia adaptada al español para Agent Toolkit a partir de `writing-good-tests.md` en [obra/superpowers](https://github.com/obra/superpowers) (`7.0.1`, MIT).
