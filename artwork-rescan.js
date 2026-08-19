(() => {
  "use strict";

  const PATCH_VERSION = "2026.08.19.6";
  const MAIN_DATABASE_NAME = "orbit-player-pwa";
  const MAIN_MEDIA_STORE = "media";
  const COVER_DATABASE_NAME = "orbit-player-cover-cache";
  const COVER_DATABASE_VERSION = 1;
  const COVER_STORE = "covers";
  const MAX_SCAN_BYTES = 24 * 1024 * 1024;
  const MIN_IMAGE_BYTES = 1024;

  const mediaInput = document.querySelector("#mediaInput");
  const audioPlayer = document.querySelector("#audioPlayer");
  const videoPlayer = document.querySelector("#videoPlayer");

  if (!mediaInput || !audioPlayer || !videoPlayer || !("indexedDB" in window)) return;

  const coversByFingerprint = new Map();
  const coversByTitle = new Map();
  const objectURLs = new Map();
  let coverDatabasePromise;
  let applyTimer;

  function normalize(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\uFFFD/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .toLocaleLowerCase("es");
  }

  function sourceTitleFromName(fileName) {
    return String(fileName || "").replace(/\.[^.]+$/, "").trim() || "Sin título";
  }

  function fingerprint(file) {
    return `${file.name}|${file.size}|${file.lastModified}`;
  }

  function readASCII(bytes, offset, length) {
    let result = "";
    const end = Math.min(offset + length, bytes.length);
    for (let index = offset; index < end; index += 1) {
      result += String.fromCharCode(bytes[index]);
    }
    return result;
  }

  function readSyncSafe(bytes, offset) {
    if (offset + 3 >= bytes.length) return 0;
    return (
      ((bytes[offset] & 0x7f) << 21) |
      ((bytes[offset + 1] & 0x7f) << 14) |
      ((bytes[offset + 2] & 0x7f) << 7) |
      (bytes[offset + 3] & 0x7f)
    ) >>> 0;
  }

  function readUIntBE(bytes, offset, length) {
    let value = 0;
    for (let index = 0; index < length && offset + index < bytes.length; index += 1) {
      value = (value * 256) + bytes[offset + index];
    }
    return value >>> 0;
  }

  function equalsAt(bytes, offset, signature) {
    if (offset < 0 || offset + signature.length > bytes.length) return false;
    for (let index = 0; index < signature.length; index += 1) {
      if (bytes[offset + index] !== signature[index]) return false;
    }
    return true;
  }

  function removeUnsynchronisation(bytes) {
    const output = new Uint8Array(bytes.length);
    let writeIndex = 0;

    for (let readIndex = 0; readIndex < bytes.length; readIndex += 1) {
      output[writeIndex] = bytes[readIndex];
      writeIndex += 1;
      if (bytes[readIndex] === 0xff && bytes[readIndex + 1] === 0x00) {
        readIndex += 1;
      }
    }

    return output.slice(0, writeIndex);
  }

  function cleanText(value) {
    return String(value || "")
      .replace(/\u0000/g, "")
      .replace(/^\uFEFF/, "")
      .replace(/\uFFFD+/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function decodeUTF16BE(bytes) {
    const evenLength = bytes.length - (bytes.length % 2);
    const swapped = new Uint8Array(evenLength);
    for (let index = 0; index < evenLength; index += 2) {
      swapped[index] = bytes[index + 1];
      swapped[index + 1] = bytes[index];
    }
    try {
      return new TextDecoder("utf-16le").decode(swapped);
    } catch {
      return "";
    }
  }

  function decodeTextFrame(frame) {
    if (!frame?.length) return "";
    const encoding = frame[0];
    let data = frame.slice(1);

    while (data.length && data[data.length - 1] === 0) {
      data = data.slice(0, -1);
    }

    try {
      if (encoding === 3) return cleanText(new TextDecoder("utf-8").decode(data));
      if (encoding === 2) return cleanText(decodeUTF16BE(data));
      if (encoding === 1) {
        if (data[0] === 0xff && data[1] === 0xfe) {
          return cleanText(new TextDecoder("utf-16le").decode(data.slice(2)));
        }
        if (data[0] === 0xfe && data[1] === 0xff) {
          return cleanText(decodeUTF16BE(data.slice(2)));
        }
        return cleanText(new TextDecoder("utf-16le").decode(data));
      }
      return cleanText(new TextDecoder("windows-1252").decode(data));
    } catch {
      return cleanText(Array.from(data, (byte) => String.fromCharCode(byte)).join(""));
    }
  }

  function parseTextMetadata(tagBytes, version, flags) {
    let bytes = tagBytes;
    if (flags & 0x80) bytes = removeUnsynchronisation(bytes);

    let offset = 0;
    if (flags & 0x40) {
      if (version === 3 && bytes.length >= 4) {
        offset = Math.min(4 + readUIntBE(bytes, 0, 4), bytes.length);
      } else if (version === 4 && bytes.length >= 4) {
        offset = Math.min(readSyncSafe(bytes, 0), bytes.length);
      }
    }

    const result = {};

    while (offset < bytes.length) {
      let identifier;
      let frameSize;
      let headerSize;

      if (version === 2) {
        if (offset + 6 > bytes.length) break;
        identifier = readASCII(bytes, offset, 3);
        frameSize = readUIntBE(bytes, offset + 3, 3);
        headerSize = 6;
      } else {
        if (offset + 10 > bytes.length) break;
        identifier = readASCII(bytes, offset, 4);
        frameSize = version === 4
          ? readSyncSafe(bytes, offset + 4)
          : readUIntBE(bytes, offset + 4, 4);
        headerSize = 10;
      }

      if (!/^[A-Z0-9]{3,4}$/.test(identifier) || frameSize <= 0) break;
      if (offset + headerSize + frameSize > bytes.length) break;

      const frame = bytes.slice(offset + headerSize, offset + headerSize + frameSize);
      if ((identifier === "TIT2" || identifier === "TT2") && !result.title) {
        result.title = decodeTextFrame(frame);
      } else if ((identifier === "TPE1" || identifier === "TP1") && !result.artist) {
        result.artist = decodeTextFrame(frame);
      } else if ((identifier === "TALB" || identifier === "TAL") && !result.album) {
        result.album = decodeTextFrame(frame);
      }

      offset += headerSize + frameSize;
      if (result.title && result.artist && result.album) break;
    }

    return result;
  }

  function findJPEG(bytes, startOffset) {
    for (let start = startOffset; start + 3 < bytes.length; start += 1) {
      if (!(bytes[start] === 0xff && bytes[start + 1] === 0xd8 && bytes[start + 2] === 0xff)) continue;

      for (let end = start + 3; end + 1 < bytes.length; end += 1) {
        if (bytes[end] === 0xff && bytes[end + 1] === 0xd9) {
          const length = end + 2 - start;
          if (length >= MIN_IMAGE_BYTES) {
            return { start, end: end + 2, type: "image/jpeg" };
          }
          break;
        }
      }
    }
    return null;
  }

  function findPNG(bytes, startOffset) {
    const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

    for (let start = startOffset; start + signature.length <= bytes.length; start += 1) {
      if (!equalsAt(bytes, start, signature)) continue;

      let offset = start + signature.length;
      while (offset + 12 <= bytes.length) {
        const chunkLength = readUIntBE(bytes, offset, 4);
        const chunkType = readASCII(bytes, offset + 4, 4);
        const nextOffset = offset + 12 + chunkLength;
        if (nextOffset > bytes.length) break;
        offset = nextOffset;

        if (chunkType === "IEND") {
          const length = offset - start;
          if (length >= MIN_IMAGE_BYTES) {
            return { start, end: offset, type: "image/png" };
          }
          break;
        }
      }
    }

    return null;
  }

  function findWebP(bytes, startOffset) {
    for (let start = startOffset; start + 12 <= bytes.length; start += 1) {
      if (readASCII(bytes, start, 4) !== "RIFF" || readASCII(bytes, start + 8, 4) !== "WEBP") continue;
      const payloadLength = (
        bytes[start + 4] |
        (bytes[start + 5] << 8) |
        (bytes[start + 6] << 16) |
        (bytes[start + 7] << 24)
      ) >>> 0;
      const end = start + 8 + payloadLength;
      if (end <= bytes.length && end - start >= MIN_IMAGE_BYTES) {
        return { start, end, type: "image/webp" };
      }
    }
    return null;
  }

  function findGIF(bytes, startOffset) {
    for (let start = startOffset; start + 6 < bytes.length; start += 1) {
      const header = readASCII(bytes, start, 6);
      if (header !== "GIF87a" && header !== "GIF89a") continue;

      for (let end = bytes.length - 1; end > start + MIN_IMAGE_BYTES; end -= 1) {
        if (bytes[end] === 0x3b) {
          return { start, end: end + 1, type: "image/gif" };
        }
      }
    }
    return null;
  }

  function findLargestEmbeddedImage(bytes) {
    const candidates = [
      findJPEG(bytes, 0),
      findPNG(bytes, 0),
      findWebP(bytes, 0),
      findGIF(bytes, 0)
    ].filter(Boolean);

    if (!candidates.length) return null;
    candidates.sort((left, right) => (right.end - right.start) - (left.end - left.start));
    return candidates[0];
  }

  async function analyseBlob(blob, details) {
    const header = new Uint8Array(await blob.slice(0, 10).arrayBuffer());
    let version = 0;
    let flags = 0;
    let scanLength = Math.min(blob.size, MAX_SCAN_BYTES);

    if (header.length === 10 && readASCII(header, 0, 3) === "ID3") {
      version = header[3];
      flags = header[5];
      const declaredTagSize = readSyncSafe(header, 6);
      if (declaredTagSize > 0) {
        scanLength = Math.min(blob.size, 10 + declaredTagSize, MAX_SCAN_BYTES);
      }
    }

    const rawBytes = new Uint8Array(await blob.slice(0, scanLength).arrayBuffer());
    const tagBytes = rawBytes.slice(10);
    const textMetadata = version >= 2 && version <= 4
      ? parseTextMetadata(tagBytes, version, flags)
      : {};

    const byteVariants = [rawBytes];
    if (flags & 0x80) byteVariants.push(removeUnsynchronisation(rawBytes));

    let bestImage = null;
    let bestBytes = null;

    for (const bytes of byteVariants) {
      const image = findLargestEmbeddedImage(bytes);
      if (!image) continue;
      if (!bestImage || image.end - image.start > bestImage.end - bestImage.start) {
        bestImage = image;
        bestBytes = bytes;
      }
    }

    const artworkBlob = bestImage && bestBytes
      ? new Blob([bestBytes.slice(bestImage.start, bestImage.end)], { type: bestImage.type })
      : null;

    return {
      fingerprint: details.fingerprint,
      sourceTitle: details.sourceTitle,
      title: textMetadata.title || details.sourceTitle,
      artist: textMetadata.artist || "",
      album: textMetadata.album || "",
      artworkBlob,
      artworkMime: artworkBlob?.type || "",
      parserVersion: PATCH_VERSION,
      updatedAt: Date.now()
    };
  }

  function openCoverDatabase() {
    if (!coverDatabasePromise) {
      coverDatabasePromise = new Promise((resolve, reject) => {
        const request = indexedDB.open(COVER_DATABASE_NAME, COVER_DATABASE_VERSION);
        request.onupgradeneeded = () => {
          const database = request.result;
          if (!database.objectStoreNames.contains(COVER_STORE)) {
            database.createObjectStore(COVER_STORE, { keyPath: "fingerprint" });
          }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error("No se pudo abrir la caché de portadas"));
      }).catch(() => null);
    }
    return coverDatabasePromise;
  }

  async function coverRequest(mode, operation) {
    const database = await openCoverDatabase();
    if (!database) return null;

    return new Promise((resolve, reject) => {
      const transaction = database.transaction(COVER_STORE, mode);
      const store = transaction.objectStore(COVER_STORE);
      const request = operation(store);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("Error en la caché de portadas"));
      transaction.onerror = () => reject(transaction.error || new Error("Error en la transacción de portadas"));
    });
  }

  function registerCover(record) {
    if (!record?.fingerprint) return;
    coversByFingerprint.set(record.fingerprint, record);

    for (const value of [record.sourceTitle, record.title]) {
      const key = normalize(value);
      if (key) coversByTitle.set(key, record);
    }

    if (record.artworkBlob instanceof Blob && !objectURLs.has(record.fingerprint)) {
      objectURLs.set(record.fingerprint, URL.createObjectURL(record.artworkBlob));
    }
  }

  async function saveCover(record) {
    registerCover(record);
    try {
      await coverRequest("readwrite", (store) => store.put(record));
    } catch {
      // La portada seguirá visible durante esta sesión.
    }
  }

  async function loadSavedCovers() {
    try {
      const records = await coverRequest("readonly", (store) => store.getAll());
      if (!Array.isArray(records)) return;
      records.forEach(registerCover);
    } catch {
      // Se reconstruirá la caché a partir de la biblioteca principal.
    }
  }

  async function readMainLibrary() {
    return new Promise((resolve) => {
      const request = indexedDB.open(MAIN_DATABASE_NAME);
      request.onsuccess = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(MAIN_MEDIA_STORE)) {
          database.close();
          resolve([]);
          return;
        }

        const transaction = database.transaction(MAIN_MEDIA_STORE, "readonly");
        const getAllRequest = transaction.objectStore(MAIN_MEDIA_STORE).getAll();
        getAllRequest.onsuccess = () => {
          database.close();
          resolve(getAllRequest.result || []);
        };
        getAllRequest.onerror = () => {
          database.close();
          resolve([]);
        };
      };
      request.onerror = () => resolve([]);
      request.onblocked = () => resolve([]);
    });
  }

  async function scanExistingLibrary() {
    const records = await readMainLibrary();

    for (const record of records) {
      if (record.kind !== "audio" || !(record.blob instanceof Blob)) continue;

      const existing = coversByFingerprint.get(record.fingerprint);
      if (existing?.parserVersion === PATCH_VERSION) continue;

      try {
        const analysed = await analyseBlob(record.blob, {
          fingerprint: record.fingerprint,
          sourceTitle: record.title || "Sin título"
        });
        await saveCover(analysed);
      } catch {
        // Un archivo defectuoso no debe impedir analizar el resto de la biblioteca.
      }
    }

    scheduleApply();
  }

  function coverForText(value) {
    return coversByTitle.get(normalize(value)) || null;
  }

  function artworkURL(record) {
    if (!record?.artworkBlob) return "";
    if (!objectURLs.has(record.fingerprint)) {
      objectURLs.set(record.fingerprint, URL.createObjectURL(record.artworkBlob));
    }
    return objectURLs.get(record.fingerprint);
  }

  function applyArtwork(element, record) {
    const url = artworkURL(record);
    if (!element || !url) return;
    element.classList.add("orbit-rescanned-artwork");
    element.style.setProperty("--orbit-rescanned-artwork", `url("${url}")`);
  }

  function resolveRecord(titleElement) {
    if (!titleElement) return null;
    const candidates = [
      titleElement.dataset.orbitCoverSourceTitle,
      titleElement.dataset.orbitSourceTitle,
      titleElement.textContent
    ];

    for (const candidate of candidates) {
      const record = coverForText(candidate);
      if (record) return record;
    }
    return null;
  }

  function updateMediaSession(record, fallbackTitle) {
    if (!("mediaSession" in navigator) || typeof MediaMetadata === "undefined" || !record) return;
    const url = artworkURL(record);
    if (!url) return;

    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: cleanText(record.title) || cleanText(fallbackTitle) || "Orbit Player",
        artist: cleanText(record.artist) || "Archivo local",
        album: cleanText(record.album) || "Orbit Player",
        artwork: [{
          src: url,
          sizes: "512x512",
          type: record.artworkMime || record.artworkBlob.type || "image/jpeg"
        }]
      });
    } catch {
      // Algunas versiones de Safari no muestran URLs blob en la pantalla bloqueada.
    }
  }

  function applyToInterface() {
    for (const row of document.querySelectorAll(".media-row")) {
      const titleElement = row.querySelector(".row-copy strong");
      if (titleElement && !titleElement.dataset.orbitCoverSourceTitle) {
        titleElement.dataset.orbitCoverSourceTitle = titleElement.dataset.orbitSourceTitle || titleElement.textContent || "";
      }
      const record = resolveRecord(titleElement);
      if (record) applyArtwork(row.querySelector(".thumb"), record);
    }

    const nowTitle = document.querySelector(".now-playing .track-copy strong");
    if (nowTitle && !nowTitle.dataset.orbitCoverSourceTitle) {
      nowTitle.dataset.orbitCoverSourceTitle = nowTitle.dataset.orbitSourceTitle || nowTitle.textContent || "";
    }
    const nowRecord = resolveRecord(nowTitle);
    if (nowRecord) {
      applyArtwork(document.querySelector(".now-art"), nowRecord);
      applyArtwork(document.querySelector(".cover.center"), nowRecord);
      updateMediaSession(nowRecord, nowTitle?.textContent);
    }

    const homeTitle = document.querySelector(".cover-title strong");
    if (homeTitle && !homeTitle.dataset.orbitCoverSourceTitle) {
      homeTitle.dataset.orbitCoverSourceTitle = homeTitle.dataset.orbitSourceTitle || homeTitle.textContent || "";
    }
    const homeRecord = resolveRecord(homeTitle);
    if (homeRecord) applyArtwork(document.querySelector(".cover.center"), homeRecord);
  }

  function scheduleApply() {
    window.clearTimeout(applyTimer);
    applyTimer = window.setTimeout(applyToInterface, 80);
  }

  async function analyseImportedFile(file) {
    const extension = String(file.name || "").split(".").pop().toLowerCase();
    const mime = String(file.type || "").toLowerCase();
    if (extension !== "mp3" && mime !== "audio/mpeg" && mime !== "audio/mp3") return;

    try {
      const record = await analyseBlob(file, {
        fingerprint: fingerprint(file),
        sourceTitle: sourceTitleFromName(file.name)
      });
      await saveCover(record);
      scheduleApply();
    } catch {
      // El archivo seguirá siendo reproducible aunque no pueda extraerse su portada.
    }
  }

  function injectStyles() {
    const style = document.createElement("style");
    style.textContent = `
      .orbit-rescanned-artwork {
        background-image: var(--orbit-rescanned-artwork) !important;
        background-size: cover !important;
        background-position: center !important;
        background-repeat: no-repeat !important;
      }
      .orbit-rescanned-artwork::before {
        opacity: .06 !important;
      }
    `;
    document.head.appendChild(style);
  }

  function install() {
    injectStyles();

    mediaInput.addEventListener("change", (event) => {
      const files = Array.from(event.target.files || []);
      for (const file of files) void analyseImportedFile(file);
    }, true);

    for (const player of [audioPlayer, videoPlayer]) {
      player.addEventListener("play", scheduleApply);
      player.addEventListener("loadedmetadata", scheduleApply);
    }

    const observer = new MutationObserver(scheduleApply);
    observer.observe(document.body, { subtree: true, childList: true });

    void loadSavedCovers()
      .then(() => {
        scheduleApply();
        return new Promise((resolve) => window.setTimeout(resolve, 700));
      })
      .then(scanExistingLibrary)
      .catch(() => {
        // La aplicación continúa funcionando sin portadas.
      });
  }

  install();

  window.addEventListener("beforeunload", () => {
    for (const url of objectURLs.values()) URL.revokeObjectURL(url);
  });
})();
