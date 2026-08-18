# Orbit Player — Vista previa táctil

Esta carpeta contiene una demostración web instalable para validar en iPhone la interfaz y la rueda de control antes de distribuir la aplicación nativa mediante TestFlight.

## Qué permite probar

- navegación circular por los menús;
- selección mediante el botón central;
- botones de menú, anterior, siguiente y reproducción;
- importación temporal de archivos de audio y vídeo;
- reproducción local en el navegador;
- favoritos durante la sesión;
- instalación desde Safari mediante **Añadir a pantalla de inicio**;
- funcionamiento sin conexión después de la primera carga.

## Privacidad

Los archivos elegidos por el usuario no se transmiten a GitHub ni a ningún servidor. El navegador crea referencias locales temporales y las elimina al cerrar o recargar la vista previa.

## Diferencia respecto de la app nativa

La vista previa sirve para comprobar el diseño y la interacción. No sustituye a la aplicación SwiftUI: la respuesta háptica real, MusicKit, la biblioteca persistente y la integración completa con iOS pertenecen al proyecto nativo.
