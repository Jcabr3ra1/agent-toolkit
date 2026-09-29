# Protocolo de agentes

## Consulta

1. Identificar el objetivo concreto.
2. Consultar el mapa o el perfil del proyecto cuando sea necesario.
3. Buscar antes de leer.
4. Leer únicamente las notas relacionadas.
5. Contrastar con `{{SOURCE_REPOSITORY}}` cuando la respuesta dependa del estado actual.
6. Diferenciar hechos, decisiones y suposiciones.

## Escritura controlada

El MCP `{{MCP_SERVER_NAME}}` permanece en modo de solo lectura.

Antes de modificar la memoria, un agente debe:

1. Enumerar las notas candidatas y el motivo.
2. Obtener autorización explícita o comprobar una automatización autorizada.
3. Editar únicamente las rutas autorizadas.
4. Revisar formato, enlaces, fuentes y posibles secretos.
5. Sincronizar por rutas exactas y detenerse ante conflictos.

## Seguridad

Nunca solicitar ni guardar contraseñas, tokens, claves, credenciales, archivos `.env` ni datos personales sensibles.

## Coordinación

- Delegar tareas independientes y con límites claros.
- Evitar escritores simultáneos sobre los mismos archivos.
- Mantener decisiones y autorizaciones en el agente principal.
- Exigir evidencia, riesgos y siguiente paso en cada traspaso.
