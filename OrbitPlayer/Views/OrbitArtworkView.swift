import SwiftUI

struct OrbitArtworkView: View {
    let seed: String
    let kind: MediaKind

    private var palette: [Color] {
        let palettes: [[Color]] = [
            [Color(red: 0.08, green: 0.20, blue: 0.30), Color(red: 0.12, green: 0.72, blue: 0.76)],
            [Color(red: 0.08, green: 0.09, blue: 0.18), Color(red: 0.58, green: 0.25, blue: 0.78)],
            [Color(red: 0.18, green: 0.055, blue: 0.09), Color(red: 0.96, green: 0.33, blue: 0.22)],
            [Color(red: 0.03, green: 0.13, blue: 0.12), Color(red: 0.34, green: 0.72, blue: 0.42)],
            [Color(red: 0.12, green: 0.12, blue: 0.13), Color(red: 0.50, green: 0.54, blue: 0.61)]
        ]

        let scalarTotal = seed.unicodeScalars.reduce(0) { $0 + Int($1.value) }
        return palettes[abs(scalarTotal) % palettes.count]
    }

    var body: some View {
        GeometryReader { proxy in
            let size = min(proxy.size.width, proxy.size.height)

            ZStack {
                LinearGradient(
                    colors: palette,
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )

                Circle()
                    .stroke(Color.white.opacity(0.85), lineWidth: max(2, size * 0.018))
                    .frame(width: size * 0.48, height: size * 0.48)
                    .shadow(color: Color.white.opacity(0.55), radius: size * 0.06)

                Circle()
                    .fill(Color.black.opacity(0.48))
                    .frame(width: size * 0.39, height: size * 0.39)

                Image(systemName: kind == .audio ? "waveform" : "play.fill")
                    .font(.system(size: size * 0.16, weight: .light))
                    .foregroundStyle(.white.opacity(0.9))

                VStack {
                    Spacer()
                    HStack(spacing: size * 0.035) {
                        ForEach(0..<5, id: \.self) { index in
                            Capsule()
                                .fill(Color.white.opacity(0.14 + Double(index) * 0.06))
                                .frame(width: size * 0.055, height: size * CGFloat(0.10 + Double(index) * 0.035))
                        }
                    }
                    .padding(.bottom, size * 0.08)
                }
            }
            .clipShape(RoundedRectangle(cornerRadius: size * 0.11, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: size * 0.11, style: .continuous)
                    .stroke(Color.white.opacity(0.16), lineWidth: 1)
            }
        }
        .aspectRatio(1, contentMode: .fit)
    }
}
