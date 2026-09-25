# Lista de comprobación de calidad

## Requisitos

- El cambio corresponde al alcance aprobado.
- Cada criterio de aceptación tiene evidencia.
- Los elementos fuera de alcance permanecen sin cambios.

## Corrección

- Se revisó el flujo principal y los casos límite.
- Los errores se manejan de forma explícita.
- No aparecen regresiones evidentes en contratos o dependencias.

## Datos y seguridad

- Entradas y permisos se validan en el límite adecuado.
- No se exponen secretos ni datos sensibles.
- Migraciones, concurrencia e idempotencia se evaluaron cuando aplican.

## Pruebas

- Las pruebas relevantes existen y cubren el comportamiento, no la implementación accidental.
- Compilación, tipos, lint y pruebas se ejecutaron según el área afectada.
- Los fallos o comprobaciones no ejecutadas quedan declarados.

## Operación

- Logs y errores ayudan a diagnosticar sin filtrar información sensible.
- Se consideraron despliegue, compatibilidad y reversión cuando aplican.
- La documentación estable quedó actualizada.

## Entrega

- El diff es enfocado y no incluye trabajo ajeno.
- La rama y el Pull Request siguen las reglas del proyecto.
- Los pendientes tienen responsable o siguiente paso.
