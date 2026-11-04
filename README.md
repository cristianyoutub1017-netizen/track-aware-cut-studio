# Track Aware Cut Studio

Estoy creando el proyecto 'AutoCut GTA' (un editor de vídeo en Electron/React que automatiza cortes y zooms). Este es el repositorio con el código base actual:https://github.com/cristianyoutub1017-netizen/project-archive-migration.git

Siguiendo con lo que estábamos haciendo, necesito que corrijas un fallo crítico en el flujo de trabajo actual:

Eliminar la dependencia de archivos externos: No quiero tener que importar ningún análisis ni archivos JSON externos.

Automatización directa al abrir el vídeo: Cuando cargue el vídeo MP4 (en 4K) en la aplicación, debe haber un botón claro para "Analizar y crear proyecto" que lo haga todo de forma automática.

Detección de las 4 pistas de audio: El script debe ser capaz de detectar y separar automáticamente las 4 pistas de audio integradas en la grabación del vídeo (por ejemplo: micrófono, juego, discord, etc.) sin requerir pasos manuales adicionales.

Por favor, implementa esta corrección de forma limpia en el código.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/23457c8f-090f-4463-b6d3-c150019c95fb).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
