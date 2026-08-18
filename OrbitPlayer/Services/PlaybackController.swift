import AVFoundation
import Combine
import MediaPlayer

@MainActor
final class PlaybackController: ObservableObject {
    let player = AVPlayer()

    @Published private(set) var currentItem: MediaItem?
    @Published private(set) var isPlaying = false
    @Published private(set) var elapsed: Double = 0
    @Published private(set) var duration: Double = 0
    @Published var volume: Float = 0.72 {
        didSet {
            let clamped = min(max(volume, 0), 1)
            if clamped != volume {
                volume = clamped
                return
            }
            player.volume = clamped
        }
    }

    private var queue: [MediaItem] = []
    private var URLsByID: [UUID: URL] = [:]
    private var timeObserver: Any?
    private var endObserver: NSObjectProtocol?

    init() {
        player.volume = volume
        configureAudioSession()
        configureObservers()
        configureRemoteCommands()
    }

    func play(
        _ item: MediaItem,
        in newQueue: [MediaItem],
        URLProvider: (MediaItem) -> URL
    ) {
        queue = newQueue
        URLsByID = Dictionary(uniqueKeysWithValues: newQueue.map { ($0.id, URLProvider($0)) })
        load(item, autoplay: true)
    }

    func play() {
        guard player.currentItem != nil else { return }
        try? AVAudioSession.sharedInstance().setActive(true)
        player.play()
        isPlaying = true
        updateNowPlayingInfo()
    }

    func pause() {
        player.pause()
        isPlaying = false
        updateNowPlayingInfo()
    }

    func togglePlayback() {
        isPlaying ? pause() : play()
    }

    func next() {
        guard let currentItem,
              let currentIndex = queue.firstIndex(where: { $0.id == currentItem.id }),
              !queue.isEmpty else { return }

        let nextIndex = queue.index(after: currentIndex)
        let wrappedIndex = nextIndex == queue.endIndex ? queue.startIndex : nextIndex
        load(queue[wrappedIndex], autoplay: true)
    }

    func previous() {
        guard let currentItem,
              let currentIndex = queue.firstIndex(where: { $0.id == currentItem.id }),
              !queue.isEmpty else { return }

        if elapsed > 3 {
            seek(to: 0)
            return
        }

        let previousIndex = currentIndex == queue.startIndex
            ? queue.index(before: queue.endIndex)
            : queue.index(before: currentIndex)
        load(queue[previousIndex], autoplay: true)
    }

    func seek(to seconds: Double) {
        let target = max(0, min(seconds, duration))
        player.seek(
            to: CMTime(seconds: target, preferredTimescale: 600),
            toleranceBefore: .zero,
            toleranceAfter: .zero
        )
    }

    func seek(by delta: Double) {
        seek(to: elapsed + delta)
    }

    func adjustVolume(by wheelSteps: Int) {
        guard wheelSteps != 0 else { return }
        volume += Float(wheelSteps) * 0.035
    }

    private func load(_ item: MediaItem, autoplay: Bool) {
        guard let url = URLsByID[item.id] else { return }

        currentItem = item
        elapsed = 0
        duration = item.duration

        let playerItem = AVPlayerItem(url: url)
        player.replaceCurrentItem(with: playerItem)
        updateNowPlayingInfo()

        if autoplay {
            play()
        }
    }

    private func configureAudioSession() {
        do {
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.playback, mode: .default, options: [])
        } catch {
            // La app sigue funcionando en primer plano aunque la sesión no pueda activarse.
        }
    }

    private func configureObservers() {
        let interval = CMTime(seconds: 0.25, preferredTimescale: 600)
        timeObserver = player.addPeriodicTimeObserver(
            forInterval: interval,
            queue: .main
        ) { [weak self] time in
            let seconds = time.seconds
            Task { @MainActor [weak self, seconds] in
                guard let self else { return }

                self.elapsed = seconds.isFinite && seconds >= 0 ? seconds : 0

                if let itemDuration = self.player.currentItem?.duration.seconds,
                   itemDuration.isFinite,
                   itemDuration > 0 {
                    self.duration = itemDuration
                }

                self.updateNowPlayingInfo()
            }
        }

        endObserver = NotificationCenter.default.addObserver(
            forName: .AVPlayerItemDidPlayToEndTime,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            Task { @MainActor in
                self?.next()
            }
        }
    }

    private func configureRemoteCommands() {
        let commandCenter = MPRemoteCommandCenter.shared()

        commandCenter.playCommand.removeTarget(nil)
        commandCenter.pauseCommand.removeTarget(nil)
        commandCenter.togglePlayPauseCommand.removeTarget(nil)
        commandCenter.nextTrackCommand.removeTarget(nil)
        commandCenter.previousTrackCommand.removeTarget(nil)
        commandCenter.changePlaybackPositionCommand.removeTarget(nil)

        commandCenter.playCommand.addTarget { [weak self] _ in
            Task { @MainActor in self?.play() }
            return .success
        }

        commandCenter.pauseCommand.addTarget { [weak self] _ in
            Task { @MainActor in self?.pause() }
            return .success
        }

        commandCenter.togglePlayPauseCommand.addTarget { [weak self] _ in
            Task { @MainActor in self?.togglePlayback() }
            return .success
        }

        commandCenter.nextTrackCommand.addTarget { [weak self] _ in
            Task { @MainActor in self?.next() }
            return .success
        }

        commandCenter.previousTrackCommand.addTarget { [weak self] _ in
            Task { @MainActor in self?.previous() }
            return .success
        }

        commandCenter.changePlaybackPositionCommand.addTarget { [weak self] event in
            guard let event = event as? MPChangePlaybackPositionCommandEvent else {
                return .commandFailed
            }
            let positionTime = event.positionTime
            Task { @MainActor [weak self, positionTime] in
                self?.seek(to: positionTime)
            }
            return .success
        }
    }

    private func updateNowPlayingInfo() {
        guard let currentItem else {
            MPNowPlayingInfoCenter.default().nowPlayingInfo = nil
            return
        }

        var info: [String: Any] = [
            MPMediaItemPropertyTitle: currentItem.title,
            MPMediaItemPropertyArtist: currentItem.subtitle,
            MPMediaItemPropertyAlbumTitle: "Orbit Player",
            MPNowPlayingInfoPropertyElapsedPlaybackTime: elapsed,
            MPNowPlayingInfoPropertyPlaybackRate: isPlaying ? 1.0 : 0.0,
            MPNowPlayingInfoPropertyMediaType: currentItem.kind == .video
                ? MPNowPlayingInfoMediaType.video.rawValue
                : MPNowPlayingInfoMediaType.audio.rawValue
        ]

        if duration.isFinite, duration > 0 {
            info[MPMediaItemPropertyPlaybackDuration] = duration
        }

        MPNowPlayingInfoCenter.default().nowPlayingInfo = info
    }
}
