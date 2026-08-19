# Orbit Player

Orbit Player es una **PWA personal para iPhone** con una interfaz radial inspirada en la experiencia de los reproductores clásicos, pero con diseño e identidad propios.

## Enfoque del proyecto

La PWA es la versión principal y la que se seguirá desarrollando. No está planteada para comercialización ni para la App Store; su objetivo es proporcionar un reproductor cómodo para uso personal.

## Funciones actuales

- interfaz adaptable a iPhone;
- rueda táctil circular con navegación angular;
- importación de MP3, M4A, AAC, WAV y otros formatos compatibles desde Archivos;
- detección de archivos por extensión cuando iOS no informa correctamente del tipo MIME;
- reproducción de audio y vídeo con elementos HTML5;
- biblioteca persistente mediante IndexedDB;
- favoritos persistentes;
- recuperación de los archivos al volver a abrir la PWA;
- funcionamiento sin conexión después de la primera carga;
- Media Session cuando el navegador la admite;
- instalación desde Safari mediante **Añadir a pantalla de inicio**.

## Abrir la aplicación

La PWA publicada se encuentra en:

`https://popasmalinois.github.io/Orbit-player/`

## Desarrollo

Los archivos de la PWA están en `Preview/`. Cada modificación de esa carpeta se publica automáticamente en la rama `gh-pages`.

```text
Preview/
├── index.html
├── styles.css
├── app.js
├── sw.js
├── manifest.webmanifest
└── icon.svg
```

## Privacidad

Los archivos importados se almacenan localmente en el navegador mediante IndexedDB. No se envían a GitHub ni a ningún servidor.

## Código nativo

El repositorio conserva un prototipo SwiftUI anterior como referencia, pero el desarrollo activo queda centrado en la PWA.
