import SwiftUI

@main
struct OrbitPlayerApp: App {
    @StateObject private var library = MediaLibraryStore()
    @StateObject private var playback = PlaybackController()

    var body: some Scene {
        WindowGroup {
            RootPlayerView()
                .environmentObject(library)
                .environmentObject(playback)
                .preferredColorScheme(.dark)
        }
    }
}
