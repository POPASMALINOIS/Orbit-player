# Orbit Player — PWA personal

Esta carpeta contiene la versión principal de Orbit Player. Es una PWA instalable en iPhone y está pensada para uso personal.

## Funciones actuales

- navegación circular mediante la rueda táctil;
- importación de MP3 y otros archivos de audio desde Archivos;
- detección por extensión cuando iOS no proporciona el tipo MIME;
- reproducción local de audio y vídeo;
- biblioteca persistente en IndexedDB;
- favoritos persistentes;
- recuperación de la biblioteca al volver a abrir la PWA;
- instalación desde Safari mediante **Añadir a pantalla de inicio**;
- funcionamiento sin conexión después de la primera carga;
- controles de reproducción mediante la rueda;
- metadatos básicos en Media Session cuando el navegador los admite.

## Privacidad

Los archivos se guardan únicamente en el almacenamiento local del navegador del dispositivo. No se transmiten a GitHub ni a ningún servidor.

## Instalación en iPhone

1. Abre Orbit Player en Safari.
2. Pulsa **Compartir**.
3. Selecciona **Añadir a pantalla de inicio**.
4. Abre la aplicación desde el icono instalado.

## Limitaciones de iOS

La reproducción debe iniciarse mediante una pulsación del usuario. El sistema puede controlar el volumen desde los botones físicos aunque Safari ignore cambios de volumen hechos por JavaScript. El almacenamiento local puede ser eliminado por iOS si el dispositivo necesita espacio.
