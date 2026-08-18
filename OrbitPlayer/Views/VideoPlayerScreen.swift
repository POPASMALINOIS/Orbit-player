import AVKit
import SwiftUI

struct VideoPlayerScreen: View {
    @ObservedObject var playback: PlaybackController
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()

            VideoPlayer(player: playback.player)
                .ignoresSafeArea()

            VStack {
                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(playback.currentItem?.title ?? "Vídeo")
                            .font(.system(size: 16, weight: .semibold, design: .rounded))
                            .lineLimit(1)

                        Text("Orbit Player")
                            .font(.system(size: 11, weight: .medium, design: .rounded))
                            .foregroundStyle(Color.white.opacity(0.62))
                    }

                    Spacer()

                    Button {
                        dismiss()
                    } label: {
                        Image(systemName: "xmark")
                            .font(.system(size: 14, weight: .bold))
                            .frame(width: 38, height: 38)
                            .background(.ultraThinMaterial, in: Circle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Cerrar vídeo")
                }
                .padding(.horizontal, 18)
                .padding(.top, 10)

                Spacer()
            }
        }
        .statusBarHidden(true)
    }
}
