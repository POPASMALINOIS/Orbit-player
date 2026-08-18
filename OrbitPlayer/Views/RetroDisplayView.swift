import SwiftUI

struct RetroDisplayView: View {
    let route: PlayerRoute
    let selectedIndex: Int

    @EnvironmentObject private var library: MediaLibraryStore
    @EnvironmentObject private var playback: PlaybackController

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

    var body: some View {
        VStack(spacing: 0) {
            displayHeader

            Divider()
                .overlay(Color.white.opacity(0.09))

            Group {
                switch route {
                case .home:
                    homeView
                case .music, .videos, .favorites:
                    mediaListView
                case .nowPlaying:
                    nowPlayingView
                case .settings:
                    settingsView
                case .about:
                    aboutView
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .background(
            LinearGradient(
                colors: [OrbitTheme.panelRaised, OrbitTheme.panel],
                startPoint: .top,
                endPoint: .bottom
            )
        )
        .clipShape(RoundedRectangle(cornerRadius: 25, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 25, style: .continuous)
                .stroke(Color.white.opacity(0.15), lineWidth: 1)
        }
        .shadow(color: .black.opacity(0.48), radius: 22, y: 12)
    }

    private var displayHeader: some View {
        HStack(spacing: 10) {
            VStack(alignment: .leading, spacing: 1) {
                Text(route.title)
                    .font(.system(size: 15, weight: .semibold, design: .rounded))
                    .lineLimit(1)

                Text(headerSubtitle)
                    .font(.system(size: 10, weight: .medium, design: .rounded))
                    .foregroundStyle(OrbitTheme.secondaryText)
                    .lineLimit(1)
            }

            Spacer()

            if route == .nowPlaying, playback.currentItem != nil {
                Image(systemName: playback.isPlaying ? "waveform" : "pause.fill")
                    .symbolEffect(.variableColor.iterative, isActive: playback.isPlaying)
                    .foregroundStyle(OrbitTheme.accent)
            } else {
                HStack(spacing: 3) {
                    ForEach(0..<4, id: \.self) { index in
                        Capsule()
                            .fill(index < 3 ? Color.white.opacity(0.78) : Color.white.opacity(0.24))
                            .frame(width: 3, height: CGFloat(5 + index * 3))
                    }
                }
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
    }

    private var headerSubtitle: String {
        switch route {
        case .home:
            return library.items.isEmpty ? "Biblioteca vacía" : "\(library.items.count) elementos"
        case .music:
            return "\(library.audioItems.count) canciones"
        case .videos:
            return "\(library.videoItems.count) vídeos"
        case .favorites:
            return "\(library.favoriteItems.count) guardados"
        case .nowPlaying:
            return playback.currentItem?.kind.displayName ?? "Sin reproducción"
        case .settings:
            return "Biblioteca y aplicación"
        case .about:
            return "Versión 0.1.0"
        }
    }

    private var homeView: some View {
        VStack(spacing: 10) {
            homeArtworkCarousel
                .padding(.top, 10)

            VStack(spacing: 1) {
                ForEach(HomeMenuEntry.all.indices, id: \.self) { index in
                    let entry = HomeMenuEntry.all[index]
                    menuRow(
                        title: entry.title,
                        systemImage: entry.systemImage,
                        selected: index == selectedIndex
                    )
                }
            }
            .padding(.horizontal, 10)
            .padding(.bottom, 9)
        }
    }

    private var homeArtworkCarousel: some View {
        HStack(spacing: -20) {
            OrbitArtworkView(seed: "Veridian Bloom", kind: .audio)
                .frame(width: 92, height: 92)
                .rotation3DEffect(.degrees(18), axis: (x: 0, y: 1, z: 0))
                .opacity(0.68)

            OrbitArtworkView(seed: "Satellite Skies", kind: .audio)
                .frame(width: 126, height: 126)
                .zIndex(2)
                .shadow(color: .black.opacity(0.55), radius: 16, y: 8)

            OrbitArtworkView(seed: "Midnight Drive", kind: .video)
                .frame(width: 92, height: 92)
                .rotation3DEffect(.degrees(-18), axis: (x: 0, y: 1, z: 0))
                .opacity(0.68)
        }
        .frame(maxWidth: .infinity)
        .overlay(alignment: .bottom) {
            VStack(spacing: 1) {
                Text(playback.currentItem?.title ?? "Satellite Skies")
                    .font(.system(size: 14, weight: .semibold, design: .rounded))
                    .lineLimit(1)
                Text(playback.currentItem?.subtitle ?? "Echo Maps")
                    .font(.system(size: 11, weight: .medium, design: .rounded))
                    .foregroundStyle(OrbitTheme.secondaryText)
                    .lineLimit(1)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 6)
            .background(.ultraThinMaterial, in: Capsule())
            .offset(y: 8)
        }
        .padding(.bottom, 10)
    }

    private var mediaListView: some View {
        Group {
            if visibleItems.isEmpty {
                emptyLibraryView
            } else {
                ScrollViewReader { proxy in
                    ScrollView(showsIndicators: false) {
                        LazyVStack(spacing: 2) {
                            ForEach(visibleItems.indices, id: \.self) { index in
                                let item = visibleItems[index]
                                mediaRow(item, selected: index == selectedIndex)
                                    .id(item.id)
                            }
                        }
                        .padding(10)
                    }
                    .onChange(of: selectedIndex) { _, newIndex in
                        guard visibleItems.indices.contains(newIndex) else { return }
                        withAnimation(.easeOut(duration: 0.18)) {
                            proxy.scrollTo(visibleItems[newIndex].id, anchor: .center)
                        }
                    }
                }
            }
        }
    }

    private var emptyLibraryView: some View {
        VStack(spacing: 12) {
            Image(systemName: route == .videos ? "film.stack" : "music.note.list")
                .font(.system(size: 38, weight: .light))
                .foregroundStyle(OrbitTheme.accent)

            Text(route == .favorites ? "Todavía no hay favoritos" : "No hay contenido importado")
                .font(.system(size: 16, weight: .semibold, design: .rounded))
                .multilineTextAlignment(.center)

            Text(route == .favorites
                 ? "Marca una canción o un vídeo con el corazón."
                 : "Pulsa el botón central para abrir el selector de Archivos.")
                .font(.system(size: 12, weight: .regular, design: .rounded))
                .foregroundStyle(OrbitTheme.secondaryText)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 28)
        }
    }

    private func mediaRow(_ item: MediaItem, selected: Bool) -> some View {
        HStack(spacing: 11) {
            OrbitArtworkView(seed: item.id.uuidString, kind: item.kind)
                .frame(width: 46, height: 46)

            VStack(alignment: .leading, spacing: 3) {
                Text(item.title)
                    .font(.system(size: 14, weight: selected ? .semibold : .medium, design: .rounded))
                    .lineLimit(1)

                HStack(spacing: 5) {
                    Text(item.kind.displayName)
                    Text("•")
                    Text(item.durationText)
                }
                .font(.system(size: 10, weight: .medium, design: .rounded))
                .foregroundStyle(OrbitTheme.secondaryText)
            }

            Spacer(minLength: 4)

            if item.isFavorite {
                Image(systemName: "heart.fill")
                    .font(.system(size: 12))
                    .foregroundStyle(OrbitTheme.accent)
            }

            Image(systemName: "chevron.right")
                .font(.system(size: 11, weight: .semibold))
                .foregroundStyle(selected ? OrbitTheme.accent : Color.white.opacity(0.28))
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 6)
        .background {
            RoundedRectangle(cornerRadius: 11, style: .continuous)
                .fill(selected ? OrbitTheme.accent.opacity(0.13) : Color.clear)
        }
        .overlay {
            if selected {
                RoundedRectangle(cornerRadius: 11, style: .continuous)
                    .stroke(OrbitTheme.accent.opacity(0.28), lineWidth: 1)
            }
        }
    }

    private var nowPlayingView: some View {
        Group {
            if let item = playback.currentItem {
                VStack(spacing: 12) {
                    OrbitArtworkView(seed: item.id.uuidString, kind: item.kind)
                        .frame(maxHeight: 165)
                        .shadow(color: .black.opacity(0.5), radius: 18, y: 9)

                    VStack(spacing: 3) {
                        Text(item.title)
                            .font(.system(size: 18, weight: .bold, design: .rounded))
                            .lineLimit(1)

                        Text(item.subtitle)
                            .font(.system(size: 12, weight: .medium, design: .rounded))
                            .foregroundStyle(OrbitTheme.secondaryText)
                            .lineLimit(1)
                    }

                    progressView

                    HStack(spacing: 9) {
                        Image(systemName: "speaker.fill")
                            .font(.system(size: 10))

                        GeometryReader { proxy in
                            ZStack(alignment: .leading) {
                                Capsule().fill(Color.white.opacity(0.14))
                                Capsule()
                                    .fill(OrbitTheme.accent)
                                    .frame(width: proxy.size.width * CGFloat(playback.volume))
                            }
                        }
                        .frame(height: 4)

                        Image(systemName: "speaker.wave.3.fill")
                            .font(.system(size: 10))
                    }
                    .foregroundStyle(OrbitTheme.secondaryText)
                    .padding(.horizontal, 20)

                    Text("Gira la rueda para ajustar el volumen")
                        .font(.system(size: 10, weight: .medium, design: .rounded))
                        .foregroundStyle(OrbitTheme.secondaryText)
                }
                .padding(14)
            } else {
                VStack(spacing: 12) {
                    Image(systemName: "play.slash")
                        .font(.system(size: 38, weight: .light))
                        .foregroundStyle(OrbitTheme.accent)
                    Text("No hay nada reproduciéndose")
                        .font(.system(size: 16, weight: .semibold, design: .rounded))
                    Text("Selecciona una canción o un vídeo desde la biblioteca.")
                        .font(.system(size: 12, design: .rounded))
                        .foregroundStyle(OrbitTheme.secondaryText)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, 28)
                }
            }
        }
    }

    private var progressView: some View {
        VStack(spacing: 5) {
            GeometryReader { proxy in
                let ratio = playback.duration > 0
                    ? min(max(playback.elapsed / playback.duration, 0), 1)
                    : 0

                ZStack(alignment: .leading) {
                    Capsule().fill(Color.white.opacity(0.14))
                    Capsule()
                        .fill(OrbitTheme.accent)
                        .frame(width: proxy.size.width * CGFloat(ratio))
                }
            }
            .frame(height: 5)

            HStack {
                Text(MediaItem.formatTime(playback.elapsed))
                Spacer()
                Text(MediaItem.formatTime(playback.duration))
            }
            .font(.system(size: 9, weight: .medium, design: .monospaced))
            .foregroundStyle(OrbitTheme.secondaryText)
        }
        .padding(.horizontal, 7)
    }

    private var settingsView: some View {
        VStack(spacing: 3) {
            ForEach(SettingsMenuEntry.all.indices, id: \.self) { index in
                let entry = SettingsMenuEntry.all[index]
                menuRow(
                    title: entry.title,
                    systemImage: entry.systemImage,
                    selected: index == selectedIndex
                )
            }
            Spacer(minLength: 4)
        }
        .padding(10)
    }

    private var aboutView: some View {
        ScrollView(showsIndicators: false) {
            VStack(spacing: 14) {
                ZStack {
                    RoundedRectangle(cornerRadius: 24, style: .continuous)
                        .fill(Color.black.opacity(0.28))
                        .frame(width: 92, height: 92)

                    Circle()
                        .stroke(
                            LinearGradient(
                                colors: [Color.white.opacity(0.85), OrbitTheme.accent],
                                startPoint: .topLeading,
                                endPoint: .bottomTrailing
                            ),
                            lineWidth: 7
                        )
                        .frame(width: 52, height: 52)

                    Circle()
                        .fill(OrbitTheme.accent)
                        .frame(width: 9, height: 9)
                        .offset(x: 21, y: -17)
                }

                Text("Orbit Player")
                    .font(.system(size: 21, weight: .bold, design: .rounded))

                Text("Control atemporal. Sonido moderno.")
                    .font(.system(size: 12, weight: .medium, design: .rounded))
                    .foregroundStyle(OrbitTheme.secondaryText)

                Text("Prototipo nativo 0.1.0")
                    .font(.system(size: 11, weight: .semibold, design: .rounded))
                    .padding(.horizontal, 12)
                    .padding(.vertical, 6)
                    .background(OrbitTheme.accent.opacity(0.15), in: Capsule())

                Text("Reproductor local para archivos de audio y vídeo con navegación circular, respuesta háptica y controles multimedia de iOS.")
                    .font(.system(size: 12, design: .rounded))
                    .foregroundStyle(OrbitTheme.secondaryText)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 20)
            }
            .padding(.vertical, 18)
        }
    }

    private func menuRow(title: String, systemImage: String, selected: Bool) -> some View {
        HStack(spacing: 11) {
            Image(systemName: systemImage)
                .font(.system(size: 14, weight: .medium))
                .frame(width: 20)
                .foregroundStyle(selected ? OrbitTheme.accent : Color.white.opacity(0.84))

            Text(title)
                .font(.system(size: 13, weight: selected ? .semibold : .medium, design: .rounded))
                .lineLimit(1)

            Spacer()

            Image(systemName: "chevron.right")
                .font(.system(size: 10, weight: .semibold))
                .foregroundStyle(selected ? OrbitTheme.accent : Color.white.opacity(0.30))
        }
        .padding(.horizontal, 11)
        .padding(.vertical, 7)
        .background {
            RoundedRectangle(cornerRadius: 10, style: .continuous)
                .fill(selected ? OrbitTheme.accent.opacity(0.13) : Color.clear)
        }
    }
}
