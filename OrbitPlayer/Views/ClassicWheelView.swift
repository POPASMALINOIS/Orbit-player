import SwiftUI
import UIKit

struct ClassicWheelView: View {
    let onRotate: (Int) -> Void
    let onMenu: () -> Void
    let onPrevious: () -> Void
    let onNext: () -> Void
    let onPlayPause: () -> Void
    let onSelect: () -> Void

    @State private var previousAngle: Double?
    @State private var accumulatedAngle = 0.0
    @State private var isTracking = false

    var body: some View {
        GeometryReader { proxy in
            let side = min(proxy.size.width, proxy.size.height)
            let center = CGPoint(x: proxy.size.width / 2, y: proxy.size.height / 2)

            ZStack {
                Circle()
                    .fill(
                        RadialGradient(
                            colors: [OrbitTheme.wheel.opacity(0.98), Color.black.opacity(0.96)],
                            center: .topLeading,
                            startRadius: 5,
                            endRadius: side * 0.58
                        )
                    )
                    .overlay {
                        Circle()
                            .stroke(Color.white.opacity(isTracking ? 0.22 : 0.10), lineWidth: 1)
                    }
                    .shadow(color: .black.opacity(0.62), radius: side * 0.08, y: side * 0.035)

                VStack {
                    Button(action: onMenu) {
                        Text("MENÚ")
                            .font(.system(size: side * 0.073, weight: .semibold, design: .rounded))
                            .tracking(0.5)
                            .foregroundStyle(.white.opacity(0.9))
                            .frame(width: side * 0.34, height: side * 0.20)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Volver al menú")

                    Spacer()

                    Button(action: onPlayPause) {
                        Image(systemName: "playpause.fill")
                            .font(.system(size: side * 0.092, weight: .semibold))
                            .foregroundStyle(.white.opacity(0.92))
                            .frame(width: side * 0.34, height: side * 0.20)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Reproducir o pausar")
                }
                .padding(.vertical, side * 0.045)

                HStack {
                    Button(action: onPrevious) {
                        Image(systemName: "backward.end.fill")
                            .font(.system(size: side * 0.086, weight: .semibold))
                            .foregroundStyle(.white.opacity(0.92))
                            .frame(width: side * 0.20, height: side * 0.34)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Anterior")

                    Spacer()

                    Button(action: onNext) {
                        Image(systemName: "forward.end.fill")
                            .font(.system(size: side * 0.086, weight: .semibold))
                            .foregroundStyle(.white.opacity(0.92))
                            .frame(width: side * 0.20, height: side * 0.34)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Siguiente")
                }
                .padding(.horizontal, side * 0.045)

                Button(action: onSelect) {
                    Circle()
                        .fill(
                            LinearGradient(
                                colors: [Color.white.opacity(0.08), Color.black.opacity(0.30)],
                                startPoint: .topLeading,
                                endPoint: .bottomTrailing
                            )
                        )
                        .overlay {
                            Circle()
                                .stroke(Color.white.opacity(0.12), lineWidth: 1)
                        }
                        .frame(width: side * 0.34, height: side * 0.34)
                        .shadow(color: .black.opacity(0.55), radius: side * 0.03, y: side * 0.02)
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Seleccionar")
            }
            .frame(width: side, height: side)
            .position(x: center.x, y: center.y)
            .contentShape(Circle())
            .gesture(
                DragGesture(minimumDistance: 6, coordinateSpace: .local)
                    .onChanged { value in
                        handleDrag(value.location, center: center, side: side)
                    }
                    .onEnded { _ in
                        previousAngle = nil
                        accumulatedAngle = 0
                        isTracking = false
                    }
            )
        }
        .aspectRatio(1, contentMode: .fit)
    }

    private func handleDrag(_ location: CGPoint, center: CGPoint, side: CGFloat) {
        let distance = hypot(location.x - center.x, location.y - center.y)
        let innerRadius = side * 0.20
        let outerRadius = side * 0.52

        guard distance >= innerRadius, distance <= outerRadius else {
            previousAngle = nil
            return
        }

        let currentAngle = WheelMath.angle(for: location, around: center)
        isTracking = true

        guard let previousAngle else {
            self.previousAngle = currentAngle
            return
        }

        let delta = WheelMath.normalizedDelta(from: previousAngle, to: currentAngle)
        self.previousAngle = currentAngle

        let steps = WheelMath.consumeSteps(
            accumulated: &accumulatedAngle,
            adding: delta
        )

        guard steps != 0 else { return }
        onRotate(steps)

        let feedback = UISelectionFeedbackGenerator()
        feedback.selectionChanged()
    }
}
