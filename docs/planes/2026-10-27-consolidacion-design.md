# Consolidación de Agent Toolkit

Solicitud: implementar las cuatro mejoras propuestas (consumo, recorrido completo,
instalación/diagnóstico e instrucciones), y completar Gemini. El usuario añadió
análisis de imágenes, PDF, audio y vídeo. Modo de trabajo: implementación autónoma
local conforme a «hazlas porfavor». No incluye publicar, modificar bóvedas reales
ni sustituir las instalaciones que usan sesiones abiertas.

## Diseño

Se extiende la CLI y los almacenes actuales en Node 24, sin nueva plataforma ni
panel. Frente a añadir un servicio permanente o una interfaz nueva, este enfoque
reutiliza los permisos y los flujos conocidos y evita procesos en espera.

1. Consumo: mediciones explícitas por colaboración y llamada, con identificador
   idempotente, proveedor/modelo/fase, origen declarado y contadores opcionales.
   Lo desconocido es null; se informa cobertura de cada contador. Caché se muestra
   por separado, nunca se suma automáticamente a entrada/total. No se inventan
   costes, ahorro ni conversiones de tokens. CLI y MCP permiten registrar/consultar.
2. Instalación: un comando prepara o instala enlaces de las skills incluidas para
   Codex/Claude sin sobrescribir destinos. Diagnóstico de Node, dependencias,
   CLIs, skills y configuración MCP; Superpowers se identifica como opcional.
   No se cambian configuraciones MCP ajenas: se entregan comandos exactos para
   registrar el servidor cuando falta, y se reporta la necesidad de reinicio.
3. Recorrido: prueba repetible que une publicación, aviso, reclamación, informe,
   consumo, cierre y recuperación desde otro proceso/almacén; proyecto y memoria
   ficticios. La entrega de aviso se sustituye en prueba; no es una demostración
   de sesiones IA reales. Se conserva una receta manual de aceptación nativa.
4. Gemini: consultas, investigación, análisis de entradas elegidas, historial y
   recuperación de imágenes sin repetir inferencia. Directorios únicos, metadatos
   acotados y copias sin sobrescribir. Se verifica CLI instalada y documentación.
   La API multimodal queda sujeta a la respuesta explícita del usuario; no hay
   cambio silencioso de proveedor ni generación de audio/vídeo no comprobada.
5. Skills: rutas portables, autorización existente respetada, responsabilidades
   claras entre Toolkit y Superpowers; evitar repetir procesos completos.

## Criterios de aceptación

- Una medición repetida idéntica no duplica consumo; distinta con mismo id falla.
- Contadores negativos/no finitos, agentes/fases inválidos y claves extra fallan.
- Una sesión nueva recupera resultados y consumo; los registros antiguos siguen
  legibles y aparecen como sin mediciones, nunca como gratuitos.
- Preview de instalación no escribe; apply es idempotente y conserva conflictos.
- Gemini no colisiona con consultas simultáneas ni sigue rutas de artefactos
  recibidas sin validar; una recuperación nunca inicia un modelo.
- Archivos elegidos se validan antes de inferencia, con límites y sin symlinks.
- No se considera verificada una modalidad porque un mock devolvió una respuesta.
- Pruebas focalizadas y suite completa; evidencia real separada de simulaciones.

## Decisiones y límites

No se instala Superpowers automáticamente. No se migra el MCP de memoria protegido
ni se unifican SDKs: son proyectos previos distintos de las cuatro mejoras pedidas.
La aprobación del usuario se aplica al trabajo reversible del repositorio; el
resultado queda en un worktree para revisión, sin commit, push o merge implícitos.

## Alcance confirmado y evidencia posterior

El usuario eligió únicamente la suscripción Antigravity; se descarta la API.
La lectura nativa comprobó PNG, PDF simple y MP4 visual. WAV produjo contenido
inventado, por lo que audio queda bloqueado antes de inferir. Es un límite abierto
de la modalidad, no una capacidad terminada. Gemini puede asociar sus contadores
a una colaboración explícita; los otros clientes conservan registro explícito.
