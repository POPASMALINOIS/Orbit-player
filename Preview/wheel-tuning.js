(() => {
  "use strict";

  const wheel = document.querySelector("#wheel");
  const wheelHint = document.querySelector("#wheelHint");
  const audioPlayer = document.querySelector("#audioPlayer");
  const videoPlayer = document.querySelector("#videoPlayer");

  if (!wheel || !wheelHint || !audioPlayer || !videoPlayer) return;

  const STEP_DEGREES = 30;
  const SCRUB_SECONDS = 3;

  let tracking = false;
  let pointerId;
  let previousAngle = 0;
  let accumulatedAngle = 0;

  function clamp(value, minimum, maximum) {
    return Math.min(Math.max(value, minimum), maximum);
  }

  function angleAt(clientX, clientY) {
    const rect = wheel.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    return Math.atan2(clientY - centerY, clientX - centerX) * 180 / Math.PI;
  }

  function normalizedDelta(previous, current) {
    let delta = current - previous;
    if (delta > 180) delta -= 360;
    if (delta < -180) delta += 360;
    return delta;
  }

  function isInsideRing(clientX, clientY) {
    const rect = wheel.getBoundingClientRect();
    const x = clientX - (rect.left + rect.width / 2);
    const y = clientY - (rect.top + rect.height / 2);
    const distance = Math.hypot(x, y);
    return distance >= rect.width * 0.20 && distance <= rect.width * 0.52;
  }

  function activeMediaElement() {
    if (!videoPlayer.hidden && videoPlayer.src) return videoPlayer;
    if (audioPlayer.src) return audioPlayer;
    if (videoPlayer.src) return videoPlayer;
    return null;
  }

  function isNowPlayingScreen() {
    return Boolean(document.querySelector(".now-playing"));
  }

  function dispatchMenuStep(direction) {
    const key = direction > 0 ? "ArrowDown" : "ArrowUp";
    window.dispatchEvent(new KeyboardEvent("keydown", {
      key,
      code: key,
      bubbles: true,
      cancelable: true
    }));
  }

  function scrubCurrentTrack(direction) {
    const player = activeMediaElement();
    if (!player || !player.src || !Number.isFinite(player.currentTime)) return;

    const duration = Number.isFinite(player.duration) && player.duration > 0
      ? player.duration
      : Number.POSITIVE_INFINITY;
    player.currentTime = clamp(player.currentTime + (direction * SCRUB_SECONDS), 0, duration);
    player.dispatchEvent(new Event("timeupdate"));
  }

  function applyStep(direction) {
    if (isNowPlayingScreen()) {
      scrubCurrentTrack(direction);
    } else {
      dispatchMenuStep(direction);
    }
  }

  function beginTracking(event) {
    if (event.target.closest("button")) return;
    if (!isInsideRing(event.clientX, event.clientY)) return;

    event.preventDefault();
    event.stopImmediatePropagation();

    tracking = true;
    pointerId = event.pointerId;
    previousAngle = angleAt(event.clientX, event.clientY);
    accumulatedAngle = 0;
    wheel.classList.add("tracking");
    wheel.style.setProperty("--wheel-angle", `${previousAngle + 90}deg`);

    try {
      wheel.setPointerCapture(pointerId);
    } catch {
      // Pointer capture is optional on older Safari versions.
    }
  }

  function continueTracking(event) {
    if (!tracking || event.pointerId !== pointerId) return;

    event.preventDefault();
    event.stopImmediatePropagation();

    const currentAngle = angleAt(event.clientX, event.clientY);
    const delta = normalizedDelta(previousAngle, currentAngle);
    previousAngle = currentAngle;
    accumulatedAngle += delta;
    wheel.style.setProperty("--wheel-angle", `${currentAngle + 90}deg`);

    if (Math.abs(accumulatedAngle) < STEP_DEGREES) return;

    const direction = accumulatedAngle > 0 ? 1 : -1;
    accumulatedAngle = 0;
    applyStep(direction);
  }

  function endTracking(event) {
    if (!tracking) return;
    if (event?.pointerId !== undefined && pointerId !== undefined && event.pointerId !== pointerId) return;

    event?.preventDefault?.();
    event?.stopImmediatePropagation?.();

    if (pointerId !== undefined && wheel.hasPointerCapture?.(pointerId)) {
      try {
        wheel.releasePointerCapture(pointerId);
      } catch {
        // Safari may release it automatically.
      }
    }

    tracking = false;
    pointerId = undefined;
    previousAngle = 0;
    accumulatedAngle = 0;
    wheel.classList.remove("tracking");
  }

  function patchNowPlayingUI() {
    const nowPlaying = document.querySelector(".now-playing");

    if (!nowPlaying) {
      wheelHint.textContent = "Giro preciso: una opción cada 30°";
      return;
    }

    const volumeRow = nowPlaying.querySelector(".volume-row");
    if (volumeRow && !volumeRow.classList.contains("orbit-hardware-volume")) {
      volumeRow.classList.add("orbit-hardware-volume");
      volumeRow.innerHTML = `
        <span aria-hidden="true">◖</span>
        <strong>Volumen con los botones laterales del iPhone</strong>
        <span aria-hidden="true">◗</span>
      `;
    }

    const hint = nowPlaying.querySelector(".now-hint");
    if (hint) {
      hint.textContent = "Gira la rueda para avanzar o retroceder 3 s · centro para favorito";
    }

    wheelHint.textContent = "Gira para mover la reproducción · volumen con botones laterales";
  }

  function configureBackgroundPlayback() {
    audioPlayer.preload = "auto";
    audioPlayer.setAttribute("playsinline", "");
    audioPlayer.setAttribute("x-webkit-airplay", "allow");
    audioPlayer.volume = 1;

    videoPlayer.setAttribute("x-webkit-airplay", "allow");

    const updateSessionState = () => {
      if (!("mediaSession" in navigator)) return;
      try {
        navigator.mediaSession.playbackState = audioPlayer.paused ? "paused" : "playing";
      } catch {
        // Media Session is partially implemented on some Safari versions.
      }
    };

    audioPlayer.addEventListener("play", updateSessionState);
    audioPlayer.addEventListener("pause", updateSessionState);
    document.addEventListener("visibilitychange", updateSessionState);
    window.addEventListener("pageshow", updateSessionState);
  }

  wheel.addEventListener("pointerdown", beginTracking, true);
  wheel.addEventListener("pointermove", continueTracking, true);
  wheel.addEventListener("pointerup", endTracking, true);
  wheel.addEventListener("pointercancel", endTracking, true);
  wheel.addEventListener("lostpointercapture", endTracking, true);

  const observer = new MutationObserver(() => {
    window.clearTimeout(patchNowPlayingUI.timer);
    patchNowPlayingUI.timer = window.setTimeout(patchNowPlayingUI, 20);
  });
  observer.observe(document.body, { subtree: true, childList: true });

  const style = document.createElement("style");
  style.textContent = `
    .orbit-hardware-volume {
      min-height: 24px;
      display: grid !important;
      grid-template-columns: auto 1fr auto;
      align-items: center;
      gap: 9px;
      color: var(--muted);
      font-size: 10px;
      text-align: center;
    }
    .orbit-hardware-volume strong {
      font-weight: 650;
      line-height: 1.25;
    }
  `;
  document.head.appendChild(style);

  configureBackgroundPlayback();
  patchNowPlayingUI();
})();
