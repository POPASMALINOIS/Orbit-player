import Foundation

/// Tipo de contenido que Orbit Player puede gestionar en su biblioteca local.
enum MediaKind: String, Codable, CaseIterable, Sendable {
    case audio
    case video

    var displayName: String {
        switch self {
        case .audio: return "Música"
        case .video: return "Vídeo"
        }
    }

    var systemImage: String {
        switch self {
        case .audio: return "music.note"
        case .video: return "film"
        }
    }
}

/// Referencia persistente a un archivo copiado dentro del contenedor de la app.
struct MediaItem: Identifiable, Codable, Hashable, Sendable {
    let id: UUID
    var title: String
    var subtitle: String
    var fileName: String
    var kind: MediaKind
    var duration: Double
    var importedAt: Date
    var isFavorite: Bool

    init(
        id: UUID = UUID(),
        title: String,
        subtitle: String = "Archivo local",
        fileName: String,
        kind: MediaKind,
        duration: Double = 0,
        importedAt: Date = Date(),
        isFavorite: Bool = false
    ) {
        self.id = id
        self.title = title
        self.subtitle = subtitle
        self.fileName = fileName
        self.kind = kind
        self.duration = duration
        self.importedAt = importedAt
        self.isFavorite = isFavorite
    }

    var durationText: String {
        guard duration.isFinite, duration > 0 else { return "--:--" }
        return Self.formatTime(duration)
    }

    static func formatTime(_ seconds: Double) -> String {
        guard seconds.isFinite, seconds >= 0 else { return "0:00" }
        let total = Int(seconds.rounded(.down))
        let hours = total / 3_600
        let minutes = (total % 3_600) / 60
        let remainingSeconds = total % 60

        if hours > 0 {
            return String(format: "%d:%02d:%02d", hours, minutes, remainingSeconds)
        }
        return String(format: "%d:%02d", minutes, remainingSeconds)
    }
}
