import AVFoundation
import Combine
import Foundation

@MainActor
final class MediaLibraryStore: ObservableObject {
    @Published private(set) var items: [MediaItem] = []
    @Published var errorMessage: String?

    private let fileManager: FileManager
    private let libraryDirectory: URL
    private let indexURL: URL
    private let encoder: JSONEncoder
    private let decoder: JSONDecoder

    init(fileManager: FileManager = .default) {
        self.fileManager = fileManager

        let applicationSupport = fileManager.urls(
            for: .applicationSupportDirectory,
            in: .userDomainMask
        ).first ?? fileManager.temporaryDirectory

        self.libraryDirectory = applicationSupport
            .appendingPathComponent("OrbitPlayerLibrary", isDirectory: true)
        self.indexURL = libraryDirectory.appendingPathComponent("library.json")

        self.encoder = JSONEncoder()
        self.encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        self.encoder.dateEncodingStrategy = .iso8601

        self.decoder = JSONDecoder()
        self.decoder.dateDecodingStrategy = .iso8601

        prepareDirectory()
        loadIndex()
    }

    var audioItems: [MediaItem] {
        items.filter { $0.kind == .audio }
    }

    var videoItems: [MediaItem] {
        items.filter { $0.kind == .video }
    }

    var favoriteItems: [MediaItem] {
        items.filter(\.isFavorite)
    }

    func fileURL(for item: MediaItem) -> URL {
        libraryDirectory.appendingPathComponent(item.fileName, isDirectory: false)
    }

    func importFiles(_ sourceURLs: [URL], as kind: MediaKind) async {
        guard !sourceURLs.isEmpty else { return }

        var imported: [MediaItem] = []
        var failures: [String] = []

        for sourceURL in sourceURLs {
            let gainedAccess = sourceURL.startAccessingSecurityScopedResource()
            defer {
                if gainedAccess {
                    sourceURL.stopAccessingSecurityScopedResource()
                }
            }

            do {
                let destination = uniqueDestination(for: sourceURL)
                try fileManager.copyItem(at: sourceURL, to: destination)

                let duration = await durationForMedia(at: destination)
                let rawTitle = sourceURL.deletingPathExtension().lastPathComponent
                let title = rawTitle.trimmingCharacters(in: .whitespacesAndNewlines)

                imported.append(
                    MediaItem(
                        title: title.isEmpty ? "Sin título" : title,
                        fileName: destination.lastPathComponent,
                        kind: kind,
                        duration: duration
                    )
                )
            } catch {
                failures.append(sourceURL.lastPathComponent)
            }
        }

        if !imported.isEmpty {
            items.append(contentsOf: imported)
            sortItems()
            persistIndex()
        }

        if !failures.isEmpty {
            errorMessage = "No se pudieron importar: \(failures.joined(separator: ", "))."
        }
    }

    func toggleFavorite(_ item: MediaItem) {
        guard let index = items.firstIndex(where: { $0.id == item.id }) else { return }
        items[index].isFavorite.toggle()
        persistIndex()
    }

    func remove(_ item: MediaItem) {
        guard let index = items.firstIndex(where: { $0.id == item.id }) else { return }

        let url = fileURL(for: items[index])
        do {
            if fileManager.fileExists(atPath: url.path) {
                try fileManager.removeItem(at: url)
            }
            items.remove(at: index)
            persistIndex()
        } catch {
            errorMessage = "No se pudo eliminar \(item.title)."
        }
    }

    private func prepareDirectory() {
        do {
            try fileManager.createDirectory(
                at: libraryDirectory,
                withIntermediateDirectories: true
            )
        } catch {
            errorMessage = "No se pudo preparar la biblioteca local."
        }
    }

    private func loadIndex() {
        guard fileManager.fileExists(atPath: indexURL.path) else { return }

        do {
            let data = try Data(contentsOf: indexURL)
            let decoded = try decoder.decode([MediaItem].self, from: data)
            items = decoded.filter { fileManager.fileExists(atPath: fileURL(for: $0).path) }
            sortItems()
        } catch {
            errorMessage = "La biblioteca guardada no se pudo leer."
        }
    }

    private func persistIndex() {
        do {
            let data = try encoder.encode(items)
            try data.write(to: indexURL, options: .atomic)
        } catch {
            errorMessage = "No se pudieron guardar los cambios de la biblioteca."
        }
    }

    private func sortItems() {
        items.sort {
            if $0.importedAt == $1.importedAt {
                return $0.title.localizedCaseInsensitiveCompare($1.title) == .orderedAscending
            }
            return $0.importedAt > $1.importedAt
        }
    }

    private func uniqueDestination(for sourceURL: URL) -> URL {
        let fileExtension = sourceURL.pathExtension
        let suffix = fileExtension.isEmpty ? "" : ".\(fileExtension.lowercased())"
        return libraryDirectory
            .appendingPathComponent(UUID().uuidString + suffix, isDirectory: false)
    }

    private func durationForMedia(at url: URL) async -> Double {
        let asset = AVURLAsset(url: url)

        do {
            let duration = try await asset.load(.duration)
            let seconds = duration.seconds
            return seconds.isFinite && seconds > 0 ? seconds : 0
        } catch {
            return 0
        }
    }
}
