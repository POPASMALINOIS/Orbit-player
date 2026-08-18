import XCTest
@testable import OrbitPlayer

final class WheelMathTests: XCTestCase {
    func testNormalizedDeltaCrossesPositiveBoundary() {
        XCTAssertEqual(
            WheelMath.normalizedDelta(from: 175, to: -175),
            10,
            accuracy: 0.0001
        )
    }

    func testNormalizedDeltaCrossesNegativeBoundary() {
        XCTAssertEqual(
            WheelMath.normalizedDelta(from: -175, to: 175),
            -10,
            accuracy: 0.0001
        )
    }

    func testConsumeStepsKeepsRemainder() {
        var accumulated = 0.0
        let steps = WheelMath.consumeSteps(
            accumulated: &accumulated,
            adding: 26,
            threshold: 10
        )

        XCTAssertEqual(steps, 2)
        XCTAssertEqual(accumulated, 6, accuracy: 0.0001)
    }

    func testConsumeNegativeSteps() {
        var accumulated = 0.0
        let steps = WheelMath.consumeSteps(
            accumulated: &accumulated,
            adding: -24,
            threshold: 10
        )

        XCTAssertEqual(steps, -2)
        XCTAssertEqual(accumulated, -4, accuracy: 0.0001)
    }
}
