import SwiftUI
import UniformTypeIdentifiers

struct RootPlayerView: View {
    @EnvironmentObject private var library: MediaLibraryStore
    @EnvironmentObject private var playback: PlaybackController

    @State private var route: PlayerRoute = .home
    @State private var selectedIndex = 0
    @State private var showAudioImporter = false
    @State private var showVideoImporter = false
    @State private var showImportOptions = false
    @State private var showVideoPlayer = false

    private var visibleItems: [MediaItem] {
        switch route {
        case .music:
            library.audioItems
        case .videos:
            library.videoItems
        case .favorites:
            library.favoriteItems
        default:
            []
        }
    }

    private var selectionCount: Int {
        switch route {
        case .home:
            HomeMenuEntry.all.count
        case .music, .videos, .favorites:
            max(visibleItems.count, 1)
        case .settings:
            SettingsMenuEntry.all.count
        case .nowPlaying, .about:
            1
        }
    }

    var body: some View {
        GeometryReader { proxy in
            let compact = proxy.size.height < 750
            let horizontalPadding = max(15, min(24, proxy.size.width * 0.055))
            let displayHeight = min(
                compact ? proxy.size.height * 0.48 : proxy.size.height * 0.50,
                430
            )
            let wheelSide = min(
                min(
                    proxy.size.width - horizontalPadding * 2,
                    compact ? proxy.size.height * 0.40 : proxy.size.height * 0.42
                ),
                360
            )

            ZStack {
                LinearGradient(
                    colors: [OrbitTheme.backgroundTop, OrbitTheme.backgroundBottom],
                    startPoint: .top,
                    endPoint: .bottom
                )
                .ignoresSafeArea()

                Circle()
                    .fill(OrbitTheme.accent.opacity(0.075))
                    .frame(width: proxy.size.width * 0.95)
                    .blur(radius: 70)
                    .offset(y: -proxy.size.height * 0.28)

                VStack(spacing: compact ? 13 : 17) {
                    appHeader

                    RetroDisplayView(route: route, selectedIndex: selectedIndex)
                        .frame(height: displayHeight)

                    ClassicWheelView(
                        onRotate: handleRotation,
                        onMenu: handleMenu,
                        onPrevious: playback.previous,
                        onNext: playback.next,
                        onPlayPause: playback.togglePlayback,
                        onSelect: handleSelect
                    )
                    .frame(width: wheelSide, height: wheelSide)

                    Spacer(minLength: 0)
                }
                .padding(.horizontal, horizontalPadding)
                .safeAreaPadding(.top, 6)
                .safeAreaPadding(.bottom, 4)
            }
        }
        .confirmationDialog(
            "Añadir contenido",
            isPresented: $showImportOptions,
            titleVisibility: .visible
        ) {
            Button("Importar música") {
                showAudioImporter = true
            }
            Button("Importar vídeos") {
                showVideoImporter = true
            }
            Button("Cancelar", role: .cancel) {}
        } message: {
            Text("Selecciona archivos guardados en el iPhone, iCloud Drive o un proveedor disponible en Archivos.")
        }
        .fileImporter(
            isPresented: $showAudioImporter,
            allowedContentTypes: [.audio],
            allowsMultipleSelection: true
        ) { result in
            handleImportResult(result, kind: .audio)
        }
        .fileImporter(
            isPresented: $showVideoImporter,
            allowedContentTypes: [.movie],
            allowsMultipleSelection: true
        ) { result in
            handleImportResult(result, kind: .video)
        }
        .fullScreenCover(isPresented: $showVideoPlayer) {
            VideoPlayerScreen(playback: playback)
        }
        .alert(
            "Orbit Player",
            isPresented: Binding(
                get: { library.errorMessage != nil },
                set: { if !$0 { library.errorMessage = nil } }
            )
        ) {
            Button("Aceptar", role: .cancel) {
                library.errorMessage = nil
            }
        } message: {
            Text(library.errorMessage ?? "")
        }
        .onChange(of: route) { _, _ in
            selectedIndex = 0
        }
        .onChange(of: library.items.count) { _, _ in
            selectedIndex = min(selectedIndex, max(selectionCount - 1, 0))
        }
    }

    private var appHeader: some View {
        HStack(spacing: 12) {
            ZStack {
                RoundedRectangle(cornerRadius: 13, style: .continuous)
                    .fill(Color.white.opacity(0.055))
                    .frame(width: 43, height: 43)

                Circle()
                    .stroke(
                        LinearGradient(
                            colors: [Color.white.opacity(0.86), OrbitTheme.accent],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        ),
                        lineWidth: 4
                    )
                    .frame(width: 25, height: 25)

                Circle()
                    .fill(OrbitTheme.accent)
                    .frame(width: 5, height: 5)
                    .offset(x: 10, y: -8)
            }

            VStack(alignment: .leading, spacing: 1) {
                Text("Orbit Player")
                    .font(.system(size: 20, weight: .bold, design: .rounded))

                Text("Control atemporal. Sonido moderno.")
                    .font(.system(size: 10, weight: .medium, design: .rounded))
                    .foregroundStyle(OrbitTheme.secondaryText)
            }

            Spacer()

            Button {
                showImportOptions = true
            } label: {
                Image(systemName: "plus")
                    .font(.system(size: 15, weight: .bold))
                    .frame(width: 40, height: 40)
                    .background(Color.white.opacity(0.07), in: Circle())
                    .overlay {
                        Circle().stroke(Color.white.opacity(0.10), lineWidth: 1)
                    }
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Importar contenido")
        }
    }

    private func handleRotation(_ steps: Int) {
        guard steps != 0 else { return }

        if route == .nowPlaying {
            playback.adjustVolume(by: steps)
            return
        }

        let count = max(selectionCount, 1)
        var nextIndex = (selectedIndex + steps) % count
        if nextIndex < 0 {
            nextIndex += count
        }
        selectedIndex = nextIndex
    }

    private func handleMenu() {
        guard route != .home else { return }
        route = .home
    }

    private func handleSelect() {
        switch route {
        case .home:
            guard HomeMenuEntry.all.indices.contains(selectedIndex) else { return }
            let destination = HomeMenuEntry.all[selectedIndex].id

            if destination == .nowPlaying, playback.currentItem == nil {
                route = .music
            } else {
                route = destination
            }

        case .music:
            selectMedia(from: library.audioItems, emptyAction: { showAudioImporter = true })

        case .videos:
            selectMedia(from: library.videoItems, emptyAction: { showVideoImporter = true })

        case .favorites:
            selectMedia(from: library.favoriteItems, emptyAction: { route = .home })

        case .nowPlaying:
            guard let item = playback.currentItem else { return }
            library.toggleFavorite(item)

        case .settings:
            guard SettingsMenuEntry.all.indices.contains(selectedIndex) else { return }
            switch SettingsMenuEntry.all[selectedIndex].id {
            case .importAudio:
                showAudioImporter = true
            case .importVideo:
                showVideoImporter = true
            case .about:
                route = .about
            }

        case .about:
            route = .settings
        }
    }

    private func selectMedia(from items: [MediaItem], emptyAction: () -> Void) {
        guard !items.isEmpty else {
            emptyAction()
            return
        }
        guard items.indices.contains(selectedIndex) else { return }

        let item = items[selectedIndex]
        playback.play(item, in: items, URLProvider: library.fileURL(for:))

        if item.kind == .video {
            showVideoPlayer = true
        } else {
            route = .nowPlaying
        }
    }

    private func handleImportResult(
        _ result: Result<[URL], Error>,
        kind: MediaKind
    ) {
        switch result {
        case .success(let URLs):
            Task {
                await library.importFiles(URLs, as: kind)
                route = kind == .audio ? .music : .videos
                selectedIndex = 0
            }
        case .failure(let error):
            library.errorMessage = "No se pudo abrir el selector: \(error.localizedDescription)"
        }
    }
}
