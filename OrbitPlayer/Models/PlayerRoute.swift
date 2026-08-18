import Foundation

/// Pantallas que se muestran en el panel superior del reproductor.
enum PlayerRoute: String, Equatable, Sendable {
    case home
    case music
    case videos
    case nowPlaying
    case favorites
    case settings
    case about

    var title: String {
        switch self {
        case .home: return "Orbit Player"
        case .music: return "Música"
        case .videos: return "Vídeos"
        case .nowPlaying: return "Ahora suena"
        case .favorites: return "Favoritos"
        case .settings: return "Ajustes"
        case .about: return "Acerca de"
        }
    }
}

struct HomeMenuEntry: Identifiable, Equatable, Sendable {
    let id: PlayerRoute
    let title: String
    let systemImage: String

    static var all: [HomeMenuEntry] {
        [
            .init(id: .music, title: "Música", systemImage: "music.note"),
            .init(id: .videos, title: "Vídeos", systemImage: "film"),
            .init(id: .nowPlaying, title: "Ahora suena", systemImage: "play.circle"),
            .init(id: .favorites, title: "Favoritos", systemImage: "heart"),
            .init(id: .settings, title: "Ajustes", systemImage: "slider.horizontal.3")
        ]
    }
}

struct SettingsMenuEntry: Identifiable, Equatable, Sendable {
    enum Action: String, Sendable {
        case importAudio
        case importVideo
        case about
    }

    let id: Action
    let title: String
    let systemImage: String

    static var all: [SettingsMenuEntry] {
        [
            .init(id: .importAudio, title: "Importar música", systemImage: "music.note.list"),
            .init(id: .importVideo, title: "Importar vídeos", systemImage: "video.badge.plus"),
            .init(id: .about, title: "Acerca de Orbit Player", systemImage: "info.circle")
        ]
    }
}
