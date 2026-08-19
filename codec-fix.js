(() => {
  "use strict";

  const PATCH_VERSION = "2026.08.19.4";
  const PATCH_STORAGE_KEY = "orbit-player-id3-decoder-version";
  const METADATA_DATABASE_NAME = "orbit-player-artwork";
  const ENHANCEMENTS_SOURCE = `./enhancements.js?v=${PATCH_VERSION}`;
  const NativeTextDecoder = window.TextDecoder;

  function toBytes(input) {
    if (!input) return new Uint8Array();
    if (input instanceof Uint8Array) return input;
    if (ArrayBuffer.isView(input)) {
      return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
    }
    if (input instanceof ArrayBuffer) return new Uint8Array(input);
    return new Uint8Array();
  }

  function labelOf(value) {
    return String(value || "utf-8").trim().toLowerCase();
  }

  function decodeNative(label, bytes, options = {}) {
    try {
      return new NativeTextDecoder(label, options).decode(bytes);
    } catch {
      return "";
    }
  }

  function visibleText(value) {
    return String(value || "")
      .replace(/\u0000/g, "")
      .replace(/^\uFEFF/, "")
      .trim();
  }

  function textScore(value, preference = 0) {
    const text = visibleText(value);
    if (!text) return -10_000;

    const replacementCount = (text.match(/\uFFFD/g) || []).length;
    const controlCount = (text.match(/[\u0001-\u0008\u000B\u000C\u000E-\u001F\u007F]/g) || []).length;
    const mojibakeCount = (text.match(/(?:Ã.|Â.|â.|ðŸ|ï»¿)/g) || []).length;
    const letterCount = (text.match(/[\p{L}\p{N}]/gu) || []).length;
    const punctuationCount = (text.match(/[\p{P}\p{S}]/gu) || []).length;

    return preference
      + (letterCount * 3)
      + Math.min(text.length, 80)
      - (replacementCount * 1_000)
      - (controlCount * 120)
      - (mojibakeCount * 80)
      - (punctuationCount > text.length * 0.7 ? 40 : 0);
  }

  function chooseBest(candidates) {
    let best = candidates[0]?.text || "";
    let bestScore = Number.NEGATIVE_INFINITY;

    for (const candidate of candidates) {
      if (!candidate?.text) continue;
      const score = textScore(candidate.text, candidate.preference || 0);
      if (score > bestScore) {
        best = candidate.text;
        bestScore = score;
      }
    }

    return best;
  }

  function patchedDecode(primary, encoding, input, decoderOptions, streamOptions) {
    if (streamOptions?.stream || !primary.includes("\uFFFD")) return primary;

    const bytes = toBytes(input);
    if (!bytes.length) return primary;

    const label = labelOf(encoding);
    const candidates = [{ text: primary, preference: 30 }];

    if (label === "utf-8") {
      candidates.push(
        { text: decodeNative("utf-8", bytes, { ...decoderOptions, fatal: true }), preference: 35 },
        { text: decodeNative("windows-1252", bytes), preference: 28 },
        { text: decodeNative("utf-16le", bytes.length % 2 ? Uint8Array.from([...bytes, 0]) : bytes), preference: 8 },
        { text: decodeNative("utf-16be", bytes.length % 2 ? Uint8Array.from([...bytes, 0]) : bytes), preference: 5 }
      );
    } else if (label === "utf-16le") {
      const padded = bytes.length % 2 ? Uint8Array.from([...bytes, 0]) : bytes;
      const even = bytes.length % 2 ? bytes.slice(0, -1) : bytes;
      candidates.push(
        { text: decodeNative("utf-16le", padded), preference: 42 },
        { text: decodeNative("utf-16le", even), preference: 24 },
        { text: decodeNative("windows-1252", bytes), preference: 22 },
        { text: decodeNative("utf-16be", even), preference: 5 },
        { text: decodeNative("utf-8", bytes), preference: 2 }
      );
    } else if (label === "utf-16be") {
      const padded = bytes.length % 2 ? Uint8Array.from([0, ...bytes]) : bytes;
      const even = bytes.length % 2 ? bytes.slice(0, -1) : bytes;
      candidates.push(
        { text: decodeNative("utf-16be", padded), preference: 42 },
        { text: decodeNative("utf-16be", even), preference: 24 },
        { text: decodeNative("windows-1252", bytes), preference: 22 },
        { text: decodeNative("utf-16le", even), preference: 5 },
        { text: decodeNative("utf-8", bytes), preference: 2 }
      );
    } else {
      candidates.push(
        { text: decodeNative("windows-1252", bytes), preference: 32 },
        { text: decodeNative("utf-8", bytes, { fatal: true }), preference: 26 }
      );
    }

    return chooseBest(candidates);
  }

  function installDecoderPatch() {
    if (typeof NativeTextDecoder !== "function" || window.__orbitID3DecoderVersion === PATCH_VERSION) {
      return;
    }

    class OrbitTextDecoder {
      constructor(label = "utf-8", options = {}) {
        this._label = labelOf(label);
        this._options = { ...options };
        this._decoder = new NativeTextDecoder(label, options);
      }

      get encoding() {
        return this._decoder.encoding;
      }

      get fatal() {
        return this._decoder.fatal;
      }

      get ignoreBOM() {
        return this._decoder.ignoreBOM;
      }

      decode(input, options = {}) {
        const primary = this._decoder.decode(input, options);
        return patchedDecode(primary, this.encoding || this._label, input, this._options, options);
      }
    }

    try {
      Object.defineProperty(window, "TextDecoder", {
        configurable: true,
        writable: true,
        value: OrbitTextDecoder
      });
    } catch {
      window.TextDecoder = OrbitTextDecoder;
    }

    window.__orbitID3DecoderVersion = PATCH_VERSION;
  }

  function resetSavedMetadataIfNeeded() {
    let savedVersion = "";
    try {
      savedVersion = localStorage.getItem(PATCH_STORAGE_KEY) || "";
    } catch {
      // Safari puede limitar el almacenamiento en determinados modos privados.
    }

    if (!("indexedDB" in window) || savedVersion === PATCH_VERSION) {
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        try {
          localStorage.setItem(PATCH_STORAGE_KEY, PATCH_VERSION);
        } catch {
          // La corrección seguirá activa durante esta sesión.
        }
        resolve();
      };

      try {
        const request = indexedDB.deleteDatabase(METADATA_DATABASE_NAME);
        request.onsuccess = finish;
        request.onerror = finish;
        request.onblocked = () => window.setTimeout(finish, 700);
        window.setTimeout(finish, 1_500);
      } catch {
        finish();
      }
    });
  }

  function loadEnhancements() {
    if (document.querySelector('script[data-orbit-enhancements="true"]')) return;

    const script = document.createElement("script");
    script.src = ENHANCEMENTS_SOURCE;
    script.dataset.orbitEnhancements = "true";
    script.async = false;
    document.head.appendChild(script);
  }

  installDecoderPatch();
  void resetSavedMetadataIfNeeded().then(loadEnhancements);
})();
