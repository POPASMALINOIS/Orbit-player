(() => {
  "use strict";

  const VOLUME_KEY = "orbit-player-volume";

  // iOS keeps HTMLMediaElement audio alive on the lock screen more reliably
  // when it is not routed through a Web Audio AudioContext.
  window.__orbitBackgroundAudioMode = true;
  window.__orbitUseHardwareVolume = true;

  try {
    localStorage.setItem(VOLUME_KEY, "1");
  } catch {
    // Storage may be unavailable in private browsing; playback still works.
  }

  for (const property of ["AudioContext", "webkitAudioContext"]) {
    try {
      Object.defineProperty(window, property, {
        configurable: true,
        writable: true,
        value: undefined
      });
    } catch {
      try {
        window[property] = undefined;
      } catch {
        // The property may be protected by the browser.
      }
    }
  }
})();
