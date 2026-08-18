import Foundation

/// Funciones puras que convierten el movimiento angular del dedo en pasos de menú.
enum WheelMath {
    static func angle(for point: CGPoint, around center: CGPoint) -> Double {
        atan2(point.y - center.y, point.x - center.x) * 180 / .pi
    }

    static func normalizedDelta(from previous: Double, to current: Double) -> Double {
        var delta = current - previous

        if delta > 180 {
            delta -= 360
        } else if delta < -180 {
            delta += 360
        }

        return delta
    }

    static func consumeSteps(
        accumulated: inout Double,
        adding delta: Double,
        threshold: Double = 11
    ) -> Int {
        guard threshold > 0 else { return 0 }

        accumulated += delta
        let steps = Int(accumulated / threshold)
        accumulated -= Double(steps) * threshold
        return steps
    }
}
