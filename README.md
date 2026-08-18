# Orbit Player

Orbit Player es un reproductor multimedia nativo para iPhone con una interfaz radial inspirada en la experiencia de los reproductores clásicos, pero con diseño, marca e interacción propios.

## Estado actual

La versión `0.1.0` incluye un primer prototipo funcional:

- interfaz SwiftUI adaptable a distintos tamaños de iPhone;
- rueda táctil circular con desplazamiento angular y respuesta háptica;
- navegación por Música, Vídeos, Ahora suena, Favoritos y Ajustes;
- importación de archivos de audio y vídeo desde la app Archivos;
- copia segura de los archivos a la biblioteca privada de la aplicación;
- reproducción con `AVPlayer`;
- reproducción de audio en segundo plano;
- controles desde la pantalla bloqueada, el Centro de control y auriculares;
- favoritos persistentes;
- reproductor de vídeo a pantalla completa;
- compilación automática en GitHub Actions.

## Requisitos

- macOS compatible con una versión moderna de Xcode;
- una versión de Xcode compatible con iOS 17 o posterior;
- iOS 17 o posterior;
- [XcodeGen](https://github.com/yonaskolb/XcodeGen) para generar el proyecto de Xcode.

## Abrir el proyecto

```bash
brew install xcodegen
./Scripts/bootstrap.sh
```

El script genera `OrbitPlayer.xcodeproj` y lo abre en Xcode.

También se puede ejecutar manualmente:

```bash
xcodegen generate
open OrbitPlayer.xcodeproj
```

## Probar en iPhone

1. Abre el proyecto en Xcode.
2. Selecciona el equipo de desarrollo en **Signing & Capabilities**.
3. Conecta el iPhone o selecciona un simulador.
4. Ejecuta el esquema **OrbitPlayer**.
5. Pulsa `+` para importar música o vídeos desde Archivos.

## Estructura

```text
OrbitPlayer/
├── Models/          Modelos de biblioteca y navegación
├── Services/        Importación, persistencia y reproducción
├── Utilities/       Tema visual y cálculo de la rueda
├── Views/           Interfaz principal, pantalla y rueda
└── Resources/       Info.plist y catálogo de recursos
```

## Próximas fases

- integración con Apple Music mediante MusicKit;
- lectura de metadatos y carátulas reales;
- listas de reproducción;
- búsqueda y ordenación;
- control de orientación para vídeo;
- AirPlay y selector de ruta;
- pruebas en dispositivo y distribución mediante TestFlight.

## Propiedad

Orbit Player es un proyecto de titularidad privada y vocación comercial. La publicación del código en este repositorio no concede licencia de reutilización, distribución o explotación a terceros.
