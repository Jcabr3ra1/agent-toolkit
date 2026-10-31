# Desarrollo local de NexaKit

## Preparar el repositorio

```bash
git clone https://github.com/Jcabr3ra1/nexakit.git
cd nexakit
npm ci --ignore-scripts
npm link --ignore-scripts
```

Requiere Node.js 24 o superior. Para retirar el enlace global de desarrollo: `npm uninstall -g nexakit`.

## Comprobar cambios

```bash
npm test
npm run catalog:validate
node bin/nexakit.js
```

Para incorporar nuevas skills y generar su inventario de archivos, sigue [Añadir y validar skills](../skills/ampliar-catalogo.md).

En Windows se omiten las comprobaciones POSIX de propietario y modo. `AGENT_TOOLKIT_QUIET_PLATFORM_WARNINGS=1` silencia el aviso correspondiente.

## Empaquetar y publicar

`npm pack` ejecuta `prepack` y copia `package-lock.json` en `assets/runtime/package-lock.json` para el verificador experimental. No edites esa copia a mano.

```bash
npm pack --dry-run
```

Para publicar una versión en npm cuando la versión y las verificaciones estén listas:

```bash
npm login
npm run prepack
npm publish --access public
```

## Más documentación

- [Índice completo](../README.md)
- [Uso del asistente](../skills/recomendador.md)
- [Guía de comandos y coordinación](guia-de-comandos.md)
- [Crear una memoria de proyecto](../memoria/project-memory-init.md)
- [Conectar una memoria](../memoria/project-memory-connect.md)
