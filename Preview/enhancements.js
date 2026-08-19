(() => {
  "use strict";

  const audioPlayer = document.querySelector("#audioPlayer");
  const videoPlayer = document.querySelector("#videoPlayer");
  const mediaInput = document.querySelector("#mediaInput");
  const previousButton = document.querySelector("#prevKey");
  const nextButton = document.querySelector("#nextKey");

  if (!audioPlayer || !videoPlayer || !mediaInput || !previousButton || !nextButton) {
    return;
  }

  const MAIN_DATABASE_NAME = "orbit-player-pwa";
  const MAIN_MEDIA_STORE = "media";
  const ARTWORK_DATABASE_NAME = "orbit-player-artwork";
  const ARTWORK_DATABASE_VERSION = 1;
  const ARTWORK_STORE = "tracks";
  const VOLUME_KEY = "orbit-player-volume";
  const MAX_ID3_TAG_SIZE = 32 * 1024 * 1024;

  const metadataByFingerprint = new Map();
  const metadataBySourceTitle = new Map();
  const artworkURLs = new Map();

  let artworkDatabasePromise;
  let audioContext;
  let audioGainNode;
  let videoGainNode;
  let audioGraphAvailable = true;
  let lastAppliedGain = -1;
  let applyingVolume = false;
  let applyTimer;

  function normalizeLookup(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim()
      .toLocaleLowerCase("es");
  }

  function sourceTitleFromName(fileName) {
    return String(fileName || "").replace(/\.[^.]+$/, "").trim() || "Sin título";
  }

  function fingerprint(file) {
    return `${file.name}|${file.size}|${file.lastModified}`;
  }

  function clamp(value, minimum, maximum) {
    return Math.min(Math.max(value, minimum), maximum);
  }

  function activeMediaElement() {
    if (videoPlayer.src && !videoPlayer.hidden) return videoPlayer;
    if (audioPlayer.src) return audioPlayer;
    if (videoPlayer.src) return videoPlayer;
    return null;
  }

  function showToast(message) {
    let toast = document.querySelector(".toast");
    if (!toast) {
      toast = document.createElement("div");
      toast.className = "toast";
      toast.setAttribute("role", "status");
      document.body.appendChild(toast);
    }

    toast.textContent = message;
    requestAnimationFrame(() => toast.classList.add("visible"));
    window.clearTimeout(showToast.timer);
    showToast.timer = window.setTimeout(() => toast.classList.remove("visible"), 2800);
  }

  function readDesiredGain() {
    const fill = document.querySelector("#volumeFill");
    if (fill) {
      const width = Number.parseFloat(fill.style.width);
      if (Number.isFinite(width)) return clamp(width / 100, 0, 1);
    }

    const stored = Number(localStorage.getItem(VOLUME_KEY));
    return Number.isFinite(stored) ? clamp(stored, 0, 1) : 0.72;
  }

  function createAudioGraph() {
    if (!audioGraphAvailable || audioContext) return Boolean(audioContext);

    const AudioContextConstructor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextConstructor) {
      audioGraphAvailable = false;
      return false;
    }

    try {
      audioContext = new AudioContextConstructor();

      const audioSource = audioContext.createMediaElementSource(audioPlayer);
      audioGainNode = audioContext.createGain();
      audioSource.connect(audioGainNode);
      audioGainNode.connect(audioContext.destination);

      const videoSource = audioContext.createMediaElementSource(videoPlayer);
      videoGainNode = audioContext.createGain();
      videoSource.connect(videoGainNode);
      videoGainNode.connect(audioContext.destination);

      audioPlayer.volume = 1;
      videoPlayer.volume = 1;
      applySoftwareGain(readDesiredGain(), true);
      return true;
    } catch (error) {
      audioGraphAvailable = false;
      console.warn("Orbit Player: no se pudo inicializar Web Audio.", error);
      return false;
    }
  }

  async function unlockAudioGraph() {
    if (!createAudioGraph()) return false;

    if (audioContext.state === "suspended") {
      try {
        await audioContext.resume();
      } catch {
        return false;
      }
    }

    return audioContext.state === "running";
  }

  function applySoftwareGain(value, immediate = false) {
    const gain = clamp(Number(value) || 0, 0, 1);
    if (Math.abs(gain - lastAppliedGain) < 0.002 && !immediate) return;

    lastAppliedGain = gain;

    if (!createAudioGraph()) return;

    const now = audioContext.currentTime;
    for (const node of [audioGainNode, videoGainNode]) {
      if (!node) continue;
      node.gain.cancelScheduledValues(now);
      if (immediate) {
        node.gain.setValueAtTime(gain, now);
      } else {
        node.gain.setTargetAtTime(gain, now, 0.018);
      }
    }

    applyingVolume = true;
    try {
      if (audioPlayer.volume !== 1) audioPlayer.volume = 1;
      if (videoPlayer.volume !== 1) videoPlayer.volume = 1;
    } catch {
      // iOS puede exponer volume como una propiedad no modificable.
    } finally {
      applyingVolume = false;
    }
  }

  function syncSoftwareGain() {
    applySoftwareGain(readDesiredGain());
  }

  function installVolumeBridge() {
    const unlock = () => {
      void unlockAudioGraph();
      window.setTimeout(syncSoftwareGain, 0);
    };

    document.addEventListener("pointerdown", unlock, { capture: true, passive: true });
    document.addEventListener("touchstart", unlock, { capture: true, passive: true });
    document.addEventListener("click", unlock, { capture: true, passive: true });

    for (const player of [audioPlayer, videoPlayer]) {
      player.addEventListener("play", () => {
        void unlockAudioGraph().then(syncSoftwareGain);
      });

      player.addEventListener("volumechange", () => {
        if (applyingVolume) return;
        window.setTimeout(syncSoftwareGain, 0);
      });
    }

    window.setInterval(syncSoftwareGain, 120);

    const observer = new MutationObserver(() => {
      window.clearTimeout(applyTimer);
      applyTimer = window.setTimeout(syncSoftwareGain, 16);
    });
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["style"]
    });
  }

  function seekBy(seconds) {
    const player = activeMediaElement();
    if (!player || !player.src) {
      showToast("Selecciona primero una canción o un vídeo");
      return;
    }

    const currentTime = Number.isFinite(player.currentTime) ? player.currentTime : 0;
    const duration = Number.isFinite(player.duration) && player.duration > 0
      ? player.duration
      : Number.POSITIVE_INFINITY;
    const target = clamp(currentTime + seconds, 0, duration);

    try {
      player.currentTime = target;
      player.dispatchEvent(new Event("timeupdate"));
      showToast(`${seconds > 0 ? "+" : "−"}${Math.abs(Math.round(seconds))} s`);
    } catch {
      showToast("Este archivo todavía no permite desplazarse");
    }
  }

  function installSeekButton(button, direction) {
    let holdTimeout;
    let repeatInterval;
    let held = false;
    let pointerId;

    const clearTimers = () => {
      window.clearTimeout(holdTimeout);
      window.clearInterval(repeatInterval);
      holdTimeout = undefined;
      repeatInterval = undefined;
    };

    const finish = (event, cancelled = false) => {
      if (pointerId !== undefined && event?.pointerId !== undefined && event.pointerId !== pointerId) {
        return;
      }

      clearTimers();

      if (pointerId !== undefined && button.hasPointerCapture?.(pointerId)) {
        try {
          button.releasePointerCapture(pointerId);
        } catch {
          // El puntero puede haberse liberado automáticamente.
        }
      }

      if (!cancelled && !held) {
        seekBy(direction * 10);
      }

      pointerId = undefined;
      held = false;
      button.classList.remove("seeking");
    };

    button.setAttribute(
      "aria-label",
      direction < 0 ? "Retroceder diez segundos" : "Avanzar diez segundos"
    );
    button.title = direction < 0
      ? "Pulsa para retroceder 10 s; mantén para rebobinar"
      : "Pulsa para avanzar 10 s; mantén para avanzar continuamente";

    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
    }, true);

    button.addEventListener("pointerdown", (event) => {
      if (event.button !== undefined && event.button !== 0) return;

      event.preventDefault();
      event.stopImmediatePropagation();
      pointerId = event.pointerId;
      held = false;

      try {
        button.setPointerCapture(pointerId);
      } catch {
        // No todos los navegadores permiten capturar el puntero en botones.
      }

      void unlockAudioGraph();
      holdTimeout = window.setTimeout(() => {
        held = true;
        button.classList.add("seeking");
        seekBy(direction * 5);
        repeatInterval = window.setInterval(() => seekBy(direction * 5), 260);
      }, 430);
    }, true);

    button.addEventListener("pointerup", (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      finish(event);
    }, true);

    button.addEventListener("pointercancel", (event) => finish(event, true), true);
    button.addEventListener("lostpointercapture", (event) => {
      if (pointerId !== undefined) finish(event, true);
    }, true);
    button.addEventListener("contextmenu", (event) => event.preventDefault());

    button.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      seekBy(direction * 10);
    }, true);
  }

  function installSeekControls() {
    installSeekButton(previousButton, -1);
    installSeekButton(nextButton, 1);

    const style = document.createElement("style");
    style.textContent = `
      .wheel-key.seeking {
        color: var(--accent) !important;
        text-shadow: 0 0 14px rgba(58, 170, 247, .85);
        transform: scale(.94);
      }
      .has-orbit-artwork {
        background-image: var(--orbit-artwork) !important;
        background-size: cover !important;
        background-position: center !important;
        background-repeat: no-repeat !important;
      }
      .has-orbit-artwork::before {
        opacity: .08 !important;
      }
    `;
    document.head.appendChild(style);
  }

  function openArtworkDatabase() {
    if (!("indexedDB" in window)) return Promise.resolve(null);

    if (!artworkDatabasePromise) {
      artworkDatabasePromise = new Promise((resolve, reject) => {
        const request = indexedDB.open(ARTWORK_DATABASE_NAME, ARTWORK_DATABASE_VERSION);

        request.onupgradeneeded = () => {
          const database = request.result;
          if (!database.objectStoreNames.contains(ARTWORK_STORE)) {
            database.createObjectStore(ARTWORK_STORE, { keyPath: "fingerprint" });
          }
        };

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error("No se pudo abrir la base de portadas"));
      }).catch(() => null);
    }

    return artworkDatabasePromise;
  }

  async function artworkDatabaseRequest(mode, operation) {
    const database = await openArtworkDatabase();
    if (!database) return null;

    return new Promise((resolve, reject) => {
      const transaction = database.transaction(ARTWORK_STORE, mode);
      const store = transaction.objectStore(ARTWORK_STORE);
      let request;

      try {
        request = operation(store);
      } catch (error) {
        reject(error);
        return;
      }

      if (request) {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error("Error de portada"));
      } else {
        transaction.oncomplete = () => resolve(undefined);
      }

      transaction.onerror = () => reject(transaction.error || new Error("Error de portada"));
      transaction.onabort = () => reject(transaction.error || new Error("Operación de portada cancelada"));
    });
  }

  function registerMetadata(metadata) {
    if (!metadata?.fingerprint) return;

    metadataByFingerprint.set(metadata.fingerprint, metadata);
    metadataBySourceTitle.set(normalizeLookup(metadata.sourceTitle), metadata);

    if (metadata.artworkBlob instanceof Blob && !artworkURLs.has(metadata.fingerprint)) {
      artworkURLs.set(metadata.fingerprint, URL.createObjectURL(metadata.artworkBlob));
    }
  }

  async function loadSavedMetadata() {
    try {
      const records = await artworkDatabaseRequest("readonly", (store) => store.getAll());
      if (!Array.isArray(records)) return;
      records.forEach(registerMetadata);
    } catch {
      // Las portadas se volverán a analizar a partir de los MP3 guardados.
    }
  }

  async function saveMetadata(metadata) {
    registerMetadata(metadata);
    try {
      await artworkDatabaseRequest("readwrite", (store) => store.put(metadata));
    } catch {
      // La portada seguirá disponible durante esta sesión.
    }
  }

  function readASCII(bytes, offset, length) {
    let value = "";
    const end = Math.min(offset + length, bytes.length);
    for (let index = offset; index < end; index += 1) {
      value += String.fromCharCode(bytes[index]);
    }
    return value;
  }

  function readSyncSafeInteger(bytes, offset) {
    return (
      ((bytes[offset] & 0x7f) << 21) |
      ((bytes[offset + 1] & 0x7f) << 14) |
      ((bytes[offset + 2] & 0x7f) << 7) |
      (bytes[offset + 3] & 0x7f)
    ) >>> 0;
  }

  function readBigEndianInteger(bytes, offset, length) {
    let value = 0;
    for (let index = 0; index < length; index += 1) {
      value = (value * 256) + bytes[offset + index];
    }
    return value >>> 0;
  }

  function removeUnsynchronisation(bytes) {
    const result = [];
    for (let index = 0; index < bytes.length; index += 1) {
      result.push(bytes[index]);
      if (bytes[index] === 0xff && bytes[index + 1] === 0x00) {
        index += 1;
      }
    }
    return new Uint8Array(result);
  }

  function decodeUTF16BE(bytes) {
    const swapped = new Uint8Array(bytes.length - (bytes.length % 2));
    for (let index = 0; index < swapped.length; index += 2) {
      swapped[index] = bytes[index + 1];
      swapped[index + 1] = bytes[index];
    }
    return new TextDecoder("utf-16le").decode(swapped);
  }

  function decodeText(bytes, encoding) {
    let data = bytes;

    while (data.length && data[data.length - 1] === 0) {
      data = data.slice(0, -1);
    }

    if (!data.length) return "";

    try {
      if (encoding === 3) {
        return new TextDecoder("utf-8").decode(data).replace(/\0/g, "").trim();
      }

      if (encoding === 1) {
        if (data[0] === 0xff && data[1] === 0xfe) {
          return new TextDecoder("utf-16le").decode(data.slice(2)).replace(/\0/g, "").trim();
        }
        if (data[0] === 0xfe && data[1] === 0xff) {
          return decodeUTF16BE(data.slice(2)).replace(/\0/g, "").trim();
        }
        return new TextDecoder("utf-16le").decode(data).replace(/\0/g, "").trim();
      }

      if (encoding === 2) {
        return decodeUTF16BE(data).replace(/\0/g, "").trim();
      }

      return new TextDecoder("windows-1252").decode(data).replace(/\0/g, "").trim();
    } catch {
      return Array.from(data, (byte) => String.fromCharCode(byte)).join("").replace(/\0/g, "").trim();
    }
  }

  function findTextTerminator(bytes, offset, encoding) {
    if (encoding === 1 || encoding === 2) {
      for (let index = offset; index + 1 < bytes.length; index += 2) {
        if (bytes[index] === 0 && bytes[index + 1] === 0) return index;
      }
      return bytes.length;
    }

    const terminator = bytes.indexOf(0, offset);
    return terminator >= 0 ? terminator : bytes.length;
  }

  function mimeFromImageBytes(bytes, fallback = "") {
    if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
    if (
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47
    ) return "image/png";
    if (readASCII(bytes, 0, 3) === "GIF") return "image/gif";
    if (readASCII(bytes, 0, 4) === "RIFF" && readASCII(bytes, 8, 4) === "WEBP") return "image/webp";
    return fallback.startsWith("image/") ? fallback : "";
  }

  function parsePictureFrame(frame, identifier) {
    if (!frame.length) return null;

    const encoding = frame[0];
    let offset;
    let mimeType = "";

    if (identifier === "PIC") {
      const format = readASCII(frame, 1, 3).toUpperCase();
      mimeType = format === "PNG" ? "image/png" : "image/jpeg";
      offset = 5;
    } else {
      const mimeEnd = frame.indexOf(0, 1);
      if (mimeEnd < 0) return null;
      mimeType = readASCII(frame, 1, mimeEnd - 1).toLowerCase();
      offset = mimeEnd + 2;
    }

    const descriptionEnd = findTextTerminator(frame, offset, encoding);
    const terminatorLength = encoding === 1 || encoding === 2 ? 2 : 1;
    const imageOffset = Math.min(descriptionEnd + terminatorLength, frame.length);
    const imageBytes = frame.slice(imageOffset);
    const detectedMime = mimeFromImageBytes(imageBytes, mimeType);

    if (!detectedMime || imageBytes.length < 16) return null;
    return new Blob([imageBytes], { type: detectedMime });
  }

  function parseTextFrame(frame) {
    if (!frame.length) return "";
    return decodeText(frame.slice(1), frame[0]);
  }

  async function parseID3Metadata(blob) {
    const header = new Uint8Array(await blob.slice(0, 10).arrayBuffer());
    if (header.length < 10 || readASCII(header, 0, 3) !== "ID3") {
      return {};
    }

    const version = header[3];
    if (![2, 3, 4].includes(version)) return {};

    const flags = header[5];
    const tagSize = readSyncSafeInteger(header, 6);
    if (!tagSize || tagSize > MAX_ID3_TAG_SIZE) return {};

    let bytes = new Uint8Array(await blob.slice(10, 10 + tagSize).arrayBuffer());
    if (flags & 0x80) bytes = removeUnsynchronisation(bytes);

    let offset = 0;

    if (flags & 0x40) {
      if (version === 3 && bytes.length >= 4) {
        offset = Math.min(4 + readBigEndianInteger(bytes, 0, 4), bytes.length);
      } else if (version === 4 && bytes.length >= 4) {
        offset = Math.min(readSyncSafeInteger(bytes, 0), bytes.length);
      }
    }

    const metadata = {};

    while (offset < bytes.length) {
      let identifier;
      let frameSize;
      let headerSize;

      if (version === 2) {
        if (offset + 6 > bytes.length) break;
        identifier = readASCII(bytes, offset, 3);
        frameSize = readBigEndianInteger(bytes, offset + 3, 3);
        headerSize = 6;
      } else {
        if (offset + 10 > bytes.length) break;
        identifier = readASCII(bytes, offset, 4);
        frameSize = version === 4
          ? readSyncSafeInteger(bytes, offset + 4)
          : readBigEndianInteger(bytes, offset + 4, 4);
        headerSize = 10;
      }

      if (!identifier.trim() || !/^[A-Z0-9]{3,4}$/.test(identifier)) break;
      if (!frameSize || offset + headerSize + frameSize > bytes.length) break;

      const frame = bytes.slice(offset + headerSize, offset + headerSize + frameSize);

      if ((identifier === "TIT2" || identifier === "TT2") && !metadata.title) {
        metadata.title = parseTextFrame(frame);
      } else if ((identifier === "TPE1" || identifier === "TP1") && !metadata.artist) {
        metadata.artist = parseTextFrame(frame);
      } else if ((identifier === "TALB" || identifier === "TAL") && !metadata.album) {
        metadata.album = parseTextFrame(frame);
      } else if ((identifier === "APIC" || identifier === "PIC") && !metadata.artworkBlob) {
        metadata.artworkBlob = parsePictureFrame(frame, identifier);
      }

      offset += headerSize + frameSize;

      if (metadata.title && metadata.artist && metadata.artworkBlob) {
        break;
      }
    }

    return metadata;
  }

  async function analyseTrack(blob, details) {
    const parsed = await parseID3Metadata(blob);
    return {
      fingerprint: details.fingerprint,
      sourceTitle: details.sourceTitle,
      title: parsed.title || details.sourceTitle,
      artist: parsed.artist || "",
      album: parsed.album || "",
      artworkBlob: parsed.artworkBlob || null,
      artworkMime: parsed.artworkBlob?.type || "",
      updatedAt: Date.now()
    };
  }

  async function analyseFile(file) {
    const extension = String(file.name || "").split(".").pop().toLowerCase();
    const isMP3 = extension === "mp3" || String(file.type || "").toLowerCase() === "audio/mpeg";
    if (!isMP3) return;

    const details = {
      fingerprint: fingerprint(file),
      sourceTitle: sourceTitleFromName(file.name)
    };

    const metadata = await analyseTrack(file, details);
    await saveMetadata(metadata);
    scheduleArtworkApplication();
  }

  async function analyseExistingLibrary() {
    if (!("indexedDB" in window)) return;

    await new Promise((resolve) => window.setTimeout(resolve, 800));

    const database = await new Promise((resolve) => {
      const request = indexedDB.open(MAIN_DATABASE_NAME);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    });

    if (!database || !database.objectStoreNames.contains(MAIN_MEDIA_STORE)) {
      database?.close();
      return;
    }

    const records = await new Promise((resolve) => {
      const transaction = database.transaction(MAIN_MEDIA_STORE, "readonly");
      const request = transaction.objectStore(MAIN_MEDIA_STORE).getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => resolve([]);
    });

    database.close();

    for (const record of records) {
      if (record.kind !== "audio" || !(record.blob instanceof Blob)) continue;

      const extension = String(record.title || "").split(".").pop().toLowerCase();
      const mime = String(record.mimeType || record.blob.type || "").toLowerCase();
      const likelyMP3 = mime === "audio/mpeg" || mime === "audio/mp3" || extension === "mp3";
      if (!likelyMP3 && !record.blob.size) continue;

      const existing = metadataByFingerprint.get(record.fingerprint);
      if (existing?.artworkBlob || existing?.updatedAt) continue;

      const metadata = await analyseTrack(record.blob, {
        fingerprint: record.fingerprint,
        sourceTitle: record.title || "Sin título"
      });
      await saveMetadata(metadata);
    }

    scheduleArtworkApplication();
  }

  function metadataForDisplayedTitle(value) {
    const lookup = normalizeLookup(value);
    return metadataBySourceTitle.get(lookup) || null;
  }

  function artworkURLFor(metadata) {
    if (!metadata?.artworkBlob) return "";
    if (!artworkURLs.has(metadata.fingerprint)) {
      artworkURLs.set(metadata.fingerprint, URL.createObjectURL(metadata.artworkBlob));
    }
    return artworkURLs.get(metadata.fingerprint);
  }

  function applyArtwork(element, metadata) {
    if (!element || !metadata?.artworkBlob) return;

    const url = artworkURLFor(metadata);
    if (!url) return;

    element.classList.add("has-orbit-artwork");
    element.style.setProperty("--orbit-artwork", `url("${url}")`);
  }

  function updateMediaSessionArtwork(metadata, fallbackTitle) {
    if (!("mediaSession" in navigator) || typeof MediaMetadata === "undefined" || !metadata) return;

    const artworkURL = artworkURLFor(metadata);
    const artwork = artworkURL
      ? [{
          src: artworkURL,
          sizes: "512x512",
          type: metadata.artworkMime || metadata.artworkBlob?.type || "image/jpeg"
        }]
      : [];

    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: metadata.title || fallbackTitle || "Orbit Player",
        artist: metadata.artist || "Archivo local",
        album: metadata.album || "Orbit Player",
        artwork
      });
    } catch {
      // Safari puede ignorar artwork con URL blob en algunas versiones.
    }
  }

  function applyArtworkToInterface() {
    for (const row of document.querySelectorAll(".media-row")) {
      const titleElement = row.querySelector(".row-copy strong");
      const sourceTitle = titleElement?.dataset.orbitSourceTitle || titleElement?.textContent || "";
      const metadata = metadataForDisplayedTitle(sourceTitle);
      if (!metadata) continue;

      if (titleElement && !titleElement.dataset.orbitSourceTitle) {
        titleElement.dataset.orbitSourceTitle = sourceTitle;
      }

      applyArtwork(row.querySelector(".thumb"), metadata);

      if (metadata.title && titleElement) {
        titleElement.textContent = metadata.title;
      }

      const subtitle = row.querySelector(".row-copy span");
      if (subtitle && metadata.artist) {
        const duration = subtitle.textContent.split("·").pop()?.trim() || "";
        subtitle.textContent = `${metadata.artist} · ${duration}`;
      }
    }

    const nowTitle = document.querySelector(".now-playing .track-copy strong");
    if (nowTitle) {
      const sourceTitle = nowTitle.dataset.orbitSourceTitle || nowTitle.textContent || "";
      const metadata = metadataForDisplayedTitle(sourceTitle);
      if (metadata) {
        if (!nowTitle.dataset.orbitSourceTitle) nowTitle.dataset.orbitSourceTitle = sourceTitle;
        if (metadata.title) nowTitle.textContent = metadata.title;

        const artist = document.querySelector(".now-playing .track-copy span");
        if (artist && metadata.artist) artist.textContent = metadata.artist;

        applyArtwork(document.querySelector(".now-art"), metadata);
        applyArtwork(document.querySelector(".cover.center"), metadata);
        updateMediaSessionArtwork(metadata, sourceTitle);
      }
    }

    const homeTitle = document.querySelector(".cover-title strong");
    if (homeTitle) {
      const sourceTitle = homeTitle.dataset.orbitSourceTitle || homeTitle.textContent || "";
      const metadata = metadataForDisplayedTitle(sourceTitle);
      if (metadata) {
        if (!homeTitle.dataset.orbitSourceTitle) homeTitle.dataset.orbitSourceTitle = sourceTitle;
        if (metadata.title) homeTitle.textContent = metadata.title;

        const artist = document.querySelector(".cover-title span");
        if (artist && metadata.artist) artist.textContent = metadata.artist;

        applyArtwork(document.querySelector(".cover.center"), metadata);
      }
    }
  }

  function scheduleArtworkApplication() {
    window.clearTimeout(scheduleArtworkApplication.timer);
    scheduleArtworkApplication.timer = window.setTimeout(applyArtworkToInterface, 40);
  }

  function installArtworkSupport() {
    mediaInput.addEventListener("change", (event) => {
      const files = Array.from(event.target.files || []);
      for (const file of files) {
        void analyseFile(file);
      }
    }, true);

    for (const player of [audioPlayer, videoPlayer]) {
      player.addEventListener("play", scheduleArtworkApplication);
      player.addEventListener("loadedmetadata", scheduleArtworkApplication);
    }

    const observer = new MutationObserver(scheduleArtworkApplication);
    observer.observe(document.body, { subtree: true, childList: true });

    void loadSavedMetadata()
      .then(() => {
        scheduleArtworkApplication();
        return analyseExistingLibrary();
      })
      .catch(() => {
        // La reproducción continúa aunque fallen los metadatos.
      });
  }

  installVolumeBridge();
  installSeekControls();
  installArtworkSupport();

  window.addEventListener("beforeunload", () => {
    for (const url of artworkURLs.values()) {
      URL.revokeObjectURL(url);
    }

    if (audioContext && audioContext.state !== "closed") {
      void audioContext.close();
    }
  });
})();