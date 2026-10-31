---
name: desarrollo-con-pruebas
license: MIT
description: Aplica el ciclo rojo, verde y refactorización para implementar funciones o correcciones mediante pruebas que primero fallan por el requisito buscado. Úsala cuando se elija desarrollo guiado por pruebas en código comprobable; no la fuerces en cambios documentales, configuración pura o tareas sin prueba automatizada razonable.
---

# Desarrollo con pruebas (TDD)

Escribe primero una prueba que exprese el comportamiento requerido, comprueba que falla por el motivo correcto y escribe solo el código necesario para pasarla. Si nunca viste fallar la prueba, no has comprobado que detecte el defecto.

## Cuándo aplica y cuándo usar otro flujo

| Tipo de tarea | Qué hacer |
| --- | --- |
| Nueva función, cambio de lógica, validación o contrato de código | Aplicar el ciclo **Rojo → Verde → Refactorizar** de esta skill. |
| Corrección de un fallo ya diagnosticado con `depurar` | Escribir primero la prueba de regresión que reproduce el fallo y luego corregir. |
| Cambio documental, texto de ayuda, configuración estática o activos visuales | **No forzar TDD**: documentar y ejecutar la comprobación apropiada (enlaces, formato, validación de esquema o inspección). |
| Prototipo descartable (`spike`) autorizado como exploración | Omitir o reducir pruebas durante la exploración; si el resultado se quiere conservar para producción, pasar entonces por especificación y pruebas reales. |

Si en la sesión ya está activo `test-driven-development` de Superpowers, mantén **un único ciclo** sin duplicar pasos, respetando siempre las reglas locales de abajo sobre modo `tutor` y preservación de trabajo existente.

## Ciclo Rojo → Verde → Refactorizar

1. **ROJO — Escribir una prueba mínima del comportamiento:**
   - Una sola responsabilidad por prueba, con nombre descriptivo y expectativas calculadas de forma independiente (sin reutilizar la función bajo prueba).
   - Ejercita código real; usa dobles o mocks solo para fronteras lentas o externas inevitables. Consulta [cómo escribir buenas pruebas](references/buenas-pruebas.md).
2. **Verificar ROJO — Observar el fallo esperado:**
   - Ejecuta el comando de prueba pertinente y lee la salida completa.
   - Confirma que **falla por ausencia del requisito** (aserciones o interfaz aún no implementada), no por errores de sintaxis, imports rotos o erratas en el test.
   - Si pasa a la primera, la prueba no exige nada nuevo: corrige la prueba antes de tocar código de producción.
3. **VERDE — Implementar el código mínimo:**
   - Escribe la solución más simple y clara que satisfaga la prueba actual, sin anticipar opciones no pedidas ni mezclar cambios ajenos.
4. **Verificar VERDE — Comprobar prueba y suite:**
   - Ejecuta la prueba nueva y confirma que pasa sin errores ni advertencias inesperadas.
   - Antes de dar el cambio por terminado, ejecuta también la **suite relevante del proyecto** (`npm test`, `node --test` o el comando del repositorio). Informa por su nombre cualquier fallo que aparezca, incluso si era previo o ajeno al alcance.
5. **REFACTORIZAR — Limpiar manteniendo el verde:**
   - Solo con las pruebas en verde, elimina duplicación, aclara nombres o extrae utilidades sin añadir comportamiento nuevo, y vuelve a ejecutar las pruebas.

## Reglas esenciales en Agent Toolkit

- **No destruir trabajo existente:** nunca borres ni descartes código ya escrito por el usuario o presente en el árbol de trabajo para imponer el orden del método. Si ya existe implementación parcial, consérvala, informa al usuario y comprueba la cobertura sobre el siguiente incremento o verifica el fallo de forma acordada y no destructiva.
- **Modo `tutor` (escritura humana paso a paso):**
  1. *Paso Rojo:* explica qué comportamiento protege la prueba, entrega el bloque de prueba para el archivo exacto e indica el comando y el fallo concreto que el usuario debe observar al ejecutarlo; **detente y espera**.
  2. *Paso Verde:* tras confirmar con el usuario el fallo esperado, explica y entrega la implementación mínima y el comando para verla pasar; **detente y espera**.
  3. *Paso Refactor (si aplica):* entrega la mejora opcional conservando las pruebas en verde.
  En `tutor` el agente no edita archivos funcionales salvo petición explícita («escríbelo tú en este paso»).
- **Permisos:** ejecutar comandos, editar archivos, crear commits o actualizar memoria siguen sujetos a las autorizaciones vigentes de la sesión y del proyecto.

## Ejemplo verificable (modo tutor y autónomo)

- **Requisito:** rechazar identificadores de perfil con saltos de ruta como `../fuera`.
- **Rojo:** añadir prueba `assert.rejects(() => validarPerfil('../fuera'), /perfil no válido/u)` y ejecutar `node --test test/perfiles.test.js` → confirmar fallo porque `../fuera` aún no se rechaza. *(En `tutor`, el agente entrega solo este paso y espera la salida del usuario).*
- **Verde:** validar el identificador con `/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/u` en el módulo correspondiente → repetir `node --test test/perfiles.test.js` y después la suite del proyecto → pasa en verde.

Lee [criterios para pruebas honestas](references/buenas-pruebas.md) al diseñar casos, dobles o comprobaciones de regresión. Adaptada de [obra/superpowers](https://github.com/obra/superpowers) (`7.0.1`, licencia MIT en [LICENSE.txt](LICENSE.txt)).
