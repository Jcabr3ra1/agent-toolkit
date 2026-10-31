# Lista de comprobación de calidad y evidencia

## Evidencia mínima por tipo de afirmación

| Afirmación | Qué exige sobre el estado actual | Qué **no** basta |
| --- | --- | --- |
| «Las pruebas pasan» | Salida fresca del comando de pruebas con código `0` y recuento explícito (incluyendo cualquier fallo previo por su nombre) | Una ejecución anterior a los últimos cambios o «debería pasar» |
| «El fallo quedó corregido» | Prueba o reproducción del síntoma original pasando tras haber fallado antes del arreglo | Haber editado el código sin volver a reproducir el caso |
| «La prueba de regresión protege el caso» | Ciclo rojo → verde verificado por el requisito real | Prueba escrita después que pasó a la primera sin comprobar que detecta la rotura |
| «Cumple todos los requisitos» | Contraste punto por punto frente a la especificación o plan, con su prueba o inspección asociada | Que la suite general esté en verde sin revisar criterios omitidos |
| «El subagente completó la tarea» | Inspección directa de `git diff`, archivos tocados y comprobaciones propias | Confiar únicamente en el mensaje de éxito devuelto por el subagente |
| «La documentación / skill es válida» | Enlaces locales existentes, `git diff --check` limpio y validador de formato aprobado | Asumir que crear el archivo acredita su carga o seguimiento en una sesión abierta |

## Requisitos y alcance

- El cambio corresponde al alcance aprobado; los elementos fuera de alcance permanecen intactos.
- Cada criterio de aceptación tiene una prueba o inspección identificable.
- No se destruyó ni sobrescribió trabajo ajeno sin acuerdo explícito.

## Corrección

- Se revisaron el flujo principal, las entradas vacías o malformadas y los casos límite del foco de revisión.
- Los errores y estados parciales o bloqueados se manejan de forma explícita, sin éxitos silenciosos.
- No aparecen regresiones en contratos, firmas, rutas ni esquemas compartidos.

## Datos, permisos y seguridad

- Entradas, rutas, enlaces simbólicos y permisos se validan en la frontera adecuada.
- No se exponen secretos, tokens, rutas privadas indebidas ni contenido sensible en errores o logs.
- Migraciones, bloqueos concurrentes e idempotencia se evaluaron cuando aplican.

## Pruebas y verificación proporcional

- En cambios de código: las pruebas ejercitan comportamiento real (no aserciones vacías sobre mocks) y se ejecutó la suite relevante.
- En cambios documentales: se comprobaron enlaces relativos, coherencia con el código actual y formato (`git diff --check`).
- Toda comprobación no ejecutada (por sandbox, falta de cliente real o rol de solo lectura) queda declarada explícitamente como límite.

## Operación y entrega

- Se consideraron compatibilidad multiplataforma, impacto en clientes conectados y reversión cuando aplican.
- El diff es limpio y enfocado; rama, commit, PR y actualización de memoria conservan sus autorizaciones separadas.
- Los pendientes reales quedan registrados con su siguiente paso concreto.
