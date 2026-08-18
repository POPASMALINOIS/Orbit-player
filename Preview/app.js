(() => {
  "use strict";

  const $ = (selector) => document.querySelector(selector);

  const screenTitle = $("#screenTitle");
  const screenSubtitle = $("#screenSubtitle");
  const screenBody = $("#screenBody");
  const wheel = $("#wheel");
  const wheelHint = $("#wheelHint");
  const importButton = $("#importButton");
  const mediaInput = $("#mediaInput");
  const audioPlayer = $("#audioPlayer");
  const videoPlayer = $("#videoPlayer");
  const videoDialog = $("#videoDialog");
  const videoStage = $("#videoStage");
  const videoTitle = $("#videoTitle");
  const closeVideo = $("#closeVideo");
  const infoDialog = $("#infoDialog");
  const closeInfo = $("#closeInfo");

  const homeMenu = [
    { route: "music", title: "Música", icon: "♫" },
    { route: "videos", title: "Vídeos", icon: "▣" },
    { route: "nowPlaying", title: "Ahora suena", icon: "◉" },
    { route: "favorites", title: "Favoritos", icon: "♡" },
    { route: "settings", title: "Ajustes", icon: "≡" }
  ];

  const settingsMenu = [
    { action: "importAudio", title: "Importar música", icon: "♫" },
    { action: "importVideo", title: "Importar vídeos", icon: "▣" },
    { action: "about", title: "Acerca de Orbit Player", icon: "ⓘ" }
  ];

  const palettes = [
    "linear-gradient(145deg, #153246, #24a8b7)",
    "linear-gradient(145deg, #15172d, #7042a7)",
    "linear-gradient(145deg, #37111b, #e75538)",
    "linear-gradient(145deg, #0d302b, #56a862)",
    "linear-gradient(145deg, #202127, #69717f)",
    "linear-gradient(145deg, #1b2439, #d27b9e)"
  ];

  const demoCovers = [
    { title: "Veridian Bloom", artist: "North Arcade", gradient: palettes[3] },
    { title: "Satellite Skies", artist: "Echo Maps", gradient: palettes[0] },
    { title: "Midnight Drive", artist: "Neon Lines", gradient: palettes[2] }
  ];

  const state = {
    route: "home",
    selectedIndex: 0,
    library: [],
    queue: [],
    currentItem: null,
    currentQueueIndex: -1,
    isPlaying: false,
    volume: 0.72,
    pendingImportKind: null,
    favorites: new Set(loadFavorites()),
    tracking: false,
    previousAngle: null,
    accumulatedAngle: 0,
    toastTimer: null
  };

  const routeLabels = {
    home: "Orbit Player",
    music: "Música",
    videos: "Vídeos",
    nowPlaying: "Ahora suena",
    favorites: "Favoritos",
    settings: "Ajustes"
  };

  function escapeHTML(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function hashString(value) {
    let hash = 0;
    for (const character of String(value)) {
      hash = ((hash << 5) - hash + character.codePointAt(0)) | 0;
    }
    return Math.abs(hash);
  }

  function gradientFor(item) {
    return item.gradient || palettes[hashString(item.id || item.title) % palettes.length];
  }

  function formatTime(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
    const total = Math.floor(seconds);
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const remainder = total % 60;
    if (hours > 0) {
      return `${hours}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
    }
    return `${minutes}:${String(remainder).padStart(2, "0")}`;
  }

  function fingerprint(file) {
    return `${file.name}|${file.size}|${file.lastModified}`;
  }

  function loadFavorites() {
    try {
      const stored = JSON.parse(localStorage.getItem("orbit-preview-favorites") || "[]");
      return Array.isArray(stored) ? stored : [];
    } catch {
      return [];
    }
  }

  function persistFavorites() {
    localStorage.setItem("orbit-preview-favorites", JSON.stringify([...state.favorites]));
  }

  function isFavorite(item) {
    return Boolean(item && state.favorites.has(item.fingerprint));
  }

  function visibleItems() {
    switch (state.route) {
      case "music":
        return state.library.filter((item) => item.kind === "audio");
      case "videos":
        return state.library.filter((item) => item.kind === "video");
      case "favorites":
        return state.library.filter((item) => isFavorite(item));
      default:
        return [];
    }
  }

  function selectionCount() {
    switch (state.route) {
      case "home":
        return homeMenu.length;
      case "music":
      case "videos":
      case "favorites":
        return Math.max(visibleItems().length, 1);
      case "settings":
        return settingsMenu.length;
      default:
        return 1;
    }
  }

  function clampSelection() {
    const count = Math.max(selectionCount(), 1);
    state.selectedIndex = Math.min(Math.max(state.selectedIndex, 0), count - 1);
  }

  function setRoute(route) {
    state.route = route;
    state.selectedIndex = 0;
    render();
  }

  function renderHeader() {
    screenTitle.textContent = routeLabels[state.route] || "Orbit Player";

    switch (state.route) {
      case "home":
        screenSubtitle.textContent = state.library.length
          ? `${state.library.length} elementos locales`
          : "Biblioteca de demostración";
        break;
      case "music":
        screenSubtitle.textContent = `${visibleItems().length} canciones`;
        break;
      case "videos":
        screenSubtitle.textContent = `${visibleItems().length} vídeos`;
        break;
      case "favorites":
        screenSubtitle.textContent = `${visibleItems().length} guardados`;
        break;
      case "nowPlaying":
        screenSubtitle.textContent = state.currentItem
          ? state.currentItem.kind === "video" ? "Vídeo local" : "Música local"
          : "Sin reproducción";
        break;
      case "settings":
        screenSubtitle.textContent = "Biblioteca y aplicación";
        break;
      default:
        screenSubtitle.textContent = "Orbit Player";
    }
  }

  function rowTemplate({ icon, title, subtitle = "", selected, favorite = false }) {
    return `
      <div class="menu-row ${selected ? "selected" : ""}" role="option" aria-selected="${selected}">
        <span class="row-icon" aria-hidden="true">${escapeHTML(icon)}</span>
        <span class="row-copy">
          <strong>${escapeHTML(title)}</strong>
          ${subtitle ? `<span>${escapeHTML(subtitle)}</span>` : ""}
        </span>
        ${favorite ? '<span class="favorite-indicator" aria-label="Favorito">♥</span>' : ""}
        <span class="chevron" aria-hidden="true">›</span>
      </div>`;
  }

  function renderHome() {
    const current = state.currentItem || demoCovers[1];
    const currentGradient = state.currentItem ? gradientFor(state.currentItem) : demoCovers[1].gradient;

    const rows = homeMenu.map((entry, index) => rowTemplate({
      icon: entry.icon,
      title: entry.title,
      selected: index === state.selectedIndex
    })).join("");

    screenBody.innerHTML = `
      <div class="home-screen">
        <div class="cover-flow" aria-label="Carátulas">
          <div class="cover left" style="--cover-gradient:${demoCovers[0].gradient}"></div>
          <div class="cover center" style="--cover-gradient:${currentGradient}"></div>
          <div class="cover right" style="--cover-gradient:${demoCovers[2].gradient}"></div>
          <div class="cover-title">
            <strong>${escapeHTML(current.title || "Satellite Skies")}</strong>
            <span>${escapeHTML(current.artist || "Echo Maps")}</span>
          </div>
        </div>
        <div class="menu-list" role="listbox">${rows}</div>
      </div>`;
  }

  function renderMediaList() {
    const items = visibleItems();

    if (!items.length) {
      const isFavorites = state.route === "favorites";
      screenBody.innerHTML = `
        <div class="empty-state">
          <span class="empty-icon" aria-hidden="true">${isFavorites ? "♡" : state.route === "videos" ? "▣" : "♫"}</span>
          <strong>${isFavorites ? "Todavía no hay favoritos" : "No hay contenido importado"}</strong>
          <p>${isFavorites
            ? "Marca una canción o un vídeo desde Ahora suena."
            : "Pulsa el botón central o el signo + para seleccionar archivos del iPhone."}</p>
        </div>`;
      return;
    }

    screenBody.innerHTML = `
      <div class="list-screen">
        <div class="media-list" role="listbox">
          ${items.map((item, index) => `
            <div class="media-row ${index === state.selectedIndex ? "selected" : ""}" role="option" aria-selected="${index === state.selectedIndex}">
              <span class="thumb" style="--cover-gradient:${gradientFor(item)}" aria-hidden="true"></span>
              <span class="row-copy">
                <strong>${escapeHTML(item.title)}</strong>
                <span>${item.kind === "video" ? "Vídeo" : "Música"} · ${formatTime(item.duration)}</span>
              </span>
              ${isFavorite(item) ? '<span class="favorite-indicator" aria-label="Favorito">♥</span>' : ""}
              <span class="chevron" aria-hidden="true">›</span>
            </div>`).join("")}
        </div>
      </div>`;

    requestAnimationFrame(scrollSelectionIntoView);
  }

  function renderNowPlaying() {
    const item = state.currentItem;

    if (!item) {
      screenBody.innerHTML = `
        <div class="empty-state">
          <span class="empty-icon" aria-hidden="true">▷</span>
          <strong>No hay nada reproduciéndose</strong>
          <p>Importa y selecciona una canción o un vídeo desde la biblioteca.</p>
        </div>`;
      return;
    }

    const media = activeMediaElement();
    const elapsed = Number.isFinite(media.currentTime) ? media.currentTime : 0;
    const duration = Number.isFinite(media.duration) ? media.duration : item.duration;
    const progress = duration > 0 ? Math.min(Math.max(elapsed / duration, 0), 1) : 0;

    screenBody.innerHTML = `
      <div class="now-playing">
        <div class="now-art" style="--cover-gradient:${gradientFor(item)}"></div>
        <div class="track-copy">
          <strong>${escapeHTML(item.title)}</strong>
          <span>${escapeHTML(item.artist)}</span>
        </div>
        <div class="progress-area">
          <div class="progress-track"><div class="progress-fill" id="progressFill" style="width:${progress * 100}%"></div></div>
          <div class="time-row"><span id="elapsedTime">${formatTime(elapsed)}</span><span id="durationTime">${formatTime(duration)}</span></div>
        </div>
        <div>
          <div class="volume-row">
            <span aria-hidden="true">◖</span>
            <div class="volume-track"><div class="volume-fill" id="volumeFill" style="width:${state.volume * 100}%"></div></div>
            <span aria-hidden="true">◗</span>
          </div>
          <div class="now-hint">Gira la rueda para ajustar el volumen · centro para favorito</div>
        </div>
      </div>`;
  }

  function renderSettings() {
    screenBody.innerHTML = `
      <div class="list-screen">
        <div class="settings-list" role="listbox">
          ${settingsMenu.map((entry, index) => rowTemplate({
            icon: entry.icon,
            title: entry.title,
            selected: index === state.selectedIndex
          })).join("")}
        </div>
      </div>`;
  }

  function render() {
    clampSelection();
    renderHeader();

    switch (state.route) {
      case "home":
        renderHome();
        break;
      case "music":
      case "videos":
      case "favorites":
        renderMediaList();
        break;
      case "nowPlaying":
        renderNowPlaying();
        break;
      case "settings":
        renderSettings();
        break;
      default:
        setRoute("home");
        return;
    }

    updateWheelHint();
  }

  function updateWheelHint() {
    if (state.route === "nowPlaying" && state.currentItem) {
      wheelHint.textContent = `Volumen ${Math.round(state.volume * 100)} %`;
    } else {
      wheelHint.textContent = "Desliza el dedo alrededor de la rueda";
    }
  }

  function scrollSelectionIntoView() {
    const selected = screenBody.querySelector(".selected");
    selected?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }

  function rotateSelection(steps) {
    if (!steps) return;

    if (state.route === "nowPlaying" && state.currentItem) {
      state.volume = Math.min(Math.max(state.volume + steps * 0.035, 0), 1);
      audioPlayer.volume = state.volume;
      videoPlayer.volume = state.volume;
      const fill = $("#volumeFill");
      if (fill) fill.style.width = `${state.volume * 100}%`;
      updateWheelHint();
      haptic();
      return;
    }

    const count = Math.max(selectionCount(), 1);
    state.selectedIndex = ((state.selectedIndex + steps) % count + count) % count;
    render();
    haptic();
  }

  function handleSelect() {
    haptic(12);

    switch (state.route) {
      case "home": {
        const entry = homeMenu[state.selectedIndex];
        if (!entry) return;
        if (entry.route === "nowPlaying" && !state.currentItem) {
          setRoute("music");
        } else {
          setRoute(entry.route);
        }
        break;
      }
      case "music":
      case "videos":
      case "favorites": {
        const items = visibleItems();
        if (!items.length) {
          if (state.route === "favorites") {
            setRoute("home");
          } else {
            openImporter(state.route === "videos" ? "video" : "audio");
          }
          return;
        }
        const item = items[state.selectedIndex];
        playItem(item, items);
        break;
      }
      case "nowPlaying":
        toggleFavorite();
        break;
      case "settings": {
        const entry = settingsMenu[state.selectedIndex];
        if (!entry) return;
        if (entry.action === "importAudio") openImporter("audio");
        if (entry.action === "importVideo") openImporter("video");
        if (entry.action === "about") infoDialog.showModal();
        break;
      }
      default:
        setRoute("home");
    }
  }

  function handleMenu() {
    haptic(8);
    if (videoDialog.open) {
      closeVideoDialog();
      return;
    }
    if (state.route !== "home") setRoute("home");
  }

  function activeMediaElement() {
    return state.currentItem?.kind === "video" ? videoPlayer : audioPlayer;
  }

  function pauseAll() {
    audioPlayer.pause();
    videoPlayer.pause();
  }

  async function playItem(item, queue) {
    if (!item?.url) {
      showToast("Importa un archivo local para reproducirlo");
      return;
    }

    const itemChanged = state.currentItem?.id !== item.id;
    pauseAll();

    state.queue = [...queue];
    state.currentQueueIndex = state.queue.findIndex((candidate) => candidate.id === item.id);
    state.currentItem = item;

    const player = activeMediaElement();
    const other = item.kind === "video" ? audioPlayer : videoPlayer;
    other.removeAttribute("src");
    other.load();

    if (itemChanged || player.src !== item.url) {
      player.src = item.url;
      player.load();
    }
    player.volume = state.volume;

    if (item.kind === "video") {
      videoTitle.textContent = item.title;
      if (videoPlayer.parentElement !== videoStage) videoStage.appendChild(videoPlayer);
      videoPlayer.hidden = false;
      if (!videoDialog.open) videoDialog.showModal();
    } else if (videoDialog.open) {
      closeVideoDialog(false);
    }

    try {
      await player.play();
      state.isPlaying = true;
    } catch {
      state.isPlaying = false;
      showToast("Pulsa reproducción para iniciar el archivo");
    }

    if (item.kind === "audio") setRoute("nowPlaying");
    else renderHeader();
    updateMediaSession();
  }

  async function togglePlayback() {
    if (!state.currentItem) {
      const first = state.library[0];
      if (!first) {
        openImporter(null);
        return;
      }
      await playItem(first, state.library.filter((item) => item.kind === first.kind));
      return;
    }

    const player = activeMediaElement();
    if (player.paused) {
      try {
        await player.play();
        state.isPlaying = true;
      } catch {
        showToast("El navegador ha bloqueado la reproducción");
      }
    } else {
      player.pause();
      state.isPlaying = false;
    }
    updateMediaSession();
    if (state.route === "nowPlaying") renderNowPlaying();
  }

  function nextTrack() {
    if (!state.queue.length || state.currentQueueIndex < 0) return;
    state.currentQueueIndex = (state.currentQueueIndex + 1) % state.queue.length;
    playItem(state.queue[state.currentQueueIndex], state.queue);
  }

  function previousTrack() {
    if (!state.currentItem) return;
    const player = activeMediaElement();
    if (player.currentTime > 3) {
      player.currentTime = 0;
      return;
    }
    if (!state.queue.length || state.currentQueueIndex < 0) return;
    state.currentQueueIndex = (state.currentQueueIndex - 1 + state.queue.length) % state.queue.length;
    playItem(state.queue[state.currentQueueIndex], state.queue);
  }

  function toggleFavorite() {
    const item = state.currentItem;
    if (!item) return;
    if (isFavorite(item)) {
      state.favorites.delete(item.fingerprint);
      showToast("Eliminado de favoritos");
    } else {
      state.favorites.add(item.fingerprint);
      showToast("Añadido a favoritos");
    }
    persistFavorites();
    render();
  }

  function openImporter(kind) {
    state.pendingImportKind = kind;
    mediaInput.accept = kind === "audio"
      ? "audio/*"
      : kind === "video"
        ? "video/*"
        : "audio/*,video/*";
    mediaInput.click();
  }

  async function importFiles(files) {
    const supported = [...files].filter((file) => {
      if (state.pendingImportKind === "audio") return file.type.startsWith("audio/");
      if (state.pendingImportKind === "video") return file.type.startsWith("video/");
      return file.type.startsWith("audio/") || file.type.startsWith("video/");
    });

    if (!supported.length) {
      showToast("No se seleccionaron archivos compatibles");
      return;
    }

    showToast(`Importando ${supported.length} archivo${supported.length === 1 ? "" : "s"}…`);

    const imported = [];
    for (const file of supported) {
      const kind = file.type.startsWith("video/") ? "video" : "audio";
      const url = URL.createObjectURL(file);
      const duration = await readDuration(url, kind);
      const title = file.name.replace(/\.[^.]+$/, "").trim() || "Sin título";
      imported.push({
        id: crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`,
        title,
        artist: "Archivo local",
        kind,
        url,
        duration,
        fingerprint: fingerprint(file),
        size: file.size,
        lastModified: file.lastModified
      });
    }

    state.library.push(...imported);
    state.library.sort((a, b) => a.title.localeCompare(b.title, "es", { sensitivity: "base" }));
    state.selectedIndex = 0;

    const importedKinds = new Set(imported.map((item) => item.kind));
    if (state.pendingImportKind === "video" || (importedKinds.size === 1 && importedKinds.has("video"))) {
      setRoute("videos");
    } else {
      setRoute("music");
    }
    showToast(`${imported.length} archivo${imported.length === 1 ? " importado" : "s importados"}`);
  }

  function readDuration(url, kind) {
    return new Promise((resolve) => {
      const probe = document.createElement(kind === "video" ? "video" : "audio");
      const finish = (value) => {
        probe.removeAttribute("src");
        probe.load();
        resolve(Number.isFinite(value) ? value : 0);
      };
      const timeout = window.setTimeout(() => finish(0), 6000);
      probe.preload = "metadata";
      probe.src = url;
      probe.addEventListener("loadedmetadata", () => {
        clearTimeout(timeout);
        finish(probe.duration);
      }, { once: true });
      probe.addEventListener("error", () => {
        clearTimeout(timeout);
        finish(0);
      }, { once: true });
    });
  }

  function updateProgress() {
    if (!state.currentItem) return;
    const player = activeMediaElement();
    const duration = Number.isFinite(player.duration) ? player.duration : state.currentItem.duration;
    const ratio = duration > 0 ? Math.min(Math.max(player.currentTime / duration, 0), 1) : 0;

    const progressFill = $("#progressFill");
    const elapsedTime = $("#elapsedTime");
    const durationTime = $("#durationTime");
    if (progressFill) progressFill.style.width = `${ratio * 100}%`;
    if (elapsedTime) elapsedTime.textContent = formatTime(player.currentTime);
    if (durationTime) durationTime.textContent = formatTime(duration);

    if ("mediaSession" in navigator && Number.isFinite(duration) && duration > 0) {
      try {
        navigator.mediaSession.setPositionState({
          duration,
          playbackRate: player.playbackRate || 1,
          position: Math.min(Math.max(player.currentTime, 0), duration)
        });
      } catch {
        // Algunos navegadores no admiten positionState para todos los formatos.
      }
    }
  }

  function updateMediaSession() {
    if (!("mediaSession" in navigator) || !state.currentItem) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: state.currentItem.title,
      artist: state.currentItem.artist,
      album: "Orbit Player"
    });
    navigator.mediaSession.playbackState = state.isPlaying ? "playing" : "paused";
  }

  function setupMediaSession() {
    if (!("mediaSession" in navigator)) return;
    const handlers = {
      play: () => togglePlayback(),
      pause: () => togglePlayback(),
      previoustrack: () => previousTrack(),
      nexttrack: () => nextTrack(),
      seekbackward: (details) => {
        const player = activeMediaElement();
        player.currentTime = Math.max(player.currentTime - (details.seekOffset || 10), 0);
      },
      seekforward: (details) => {
        const player = activeMediaElement();
        const duration = Number.isFinite(player.duration) ? player.duration : Infinity;
        player.currentTime = Math.min(player.currentTime + (details.seekOffset || 10), duration);
      },
      seekto: (details) => {
        if (!Number.isFinite(details.seekTime)) return;
        activeMediaElement().currentTime = details.seekTime;
      }
    };

    for (const [action, handler] of Object.entries(handlers)) {
      try {
        navigator.mediaSession.setActionHandler(action, handler);
      } catch {
        // Acción no disponible en este navegador.
      }
    }
  }

  function closeVideoDialog(pause = true) {
    if (pause) videoPlayer.pause();
    videoPlayer.hidden = true;
    if (videoDialog.open) videoDialog.close();
    state.isPlaying = !activeMediaElement().paused;
    updateMediaSession();
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
    clearTimeout(state.toastTimer);
    state.toastTimer = window.setTimeout(() => toast.classList.remove("visible"), 2300);
  }

  function haptic(duration = 5) {
    if (navigator.vibrate) navigator.vibrate(duration);
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

  function isInsideWheelRing(clientX, clientY) {
    const rect = wheel.getBoundingClientRect();
    const x = clientX - (rect.left + rect.width / 2);
    const y = clientY - (rect.top + rect.height / 2);
    const distance = Math.hypot(x, y);
    return distance >= rect.width * 0.20 && distance <= rect.width * 0.52;
  }

  function startWheelTracking(event) {
    if (event.target.closest("button")) return;
    if (!isInsideWheelRing(event.clientX, event.clientY)) return;
    event.preventDefault();
    wheel.setPointerCapture(event.pointerId);
    state.tracking = true;
    state.previousAngle = angleAt(event.clientX, event.clientY);
    state.accumulatedAngle = 0;
    wheel.classList.add("tracking");
    wheel.style.setProperty("--wheel-angle", `${state.previousAngle + 90}deg`);
  }

  function moveWheel(event) {
    if (!state.tracking) return;
    event.preventDefault();
    const currentAngle = angleAt(event.clientX, event.clientY);
    const delta = normalizedDelta(state.previousAngle, currentAngle);
    state.previousAngle = currentAngle;
    state.accumulatedAngle += delta;
    wheel.style.setProperty("--wheel-angle", `${currentAngle + 90}deg`);

    const threshold = 11;
    const steps = Math.trunc(state.accumulatedAngle / threshold);
    if (steps !== 0) {
      state.accumulatedAngle -= steps * threshold;
      rotateSelection(steps);
    }
  }

  function stopWheelTracking(event) {
    if (!state.tracking) return;
    if (wheel.hasPointerCapture?.(event.pointerId)) wheel.releasePointerCapture(event.pointerId);
    state.tracking = false;
    state.previousAngle = null;
    state.accumulatedAngle = 0;
    wheel.classList.remove("tracking");
  }

  function wireEvents() {
    importButton.addEventListener("click", () => openImporter(null));
    mediaInput.addEventListener("change", async () => {
      const files = mediaInput.files;
      mediaInput.value = "";
      if (files?.length) await importFiles(files);
    });

    $("#menuKey").addEventListener("click", handleMenu);
    $("#prevKey").addEventListener("click", previousTrack);
    $("#nextKey").addEventListener("click", nextTrack);
    $("#playKey").addEventListener("click", togglePlayback);
    $("#selectKey").addEventListener("click", handleSelect);

    wheel.addEventListener("pointerdown", startWheelTracking);
    wheel.addEventListener("pointermove", moveWheel);
    wheel.addEventListener("pointerup", stopWheelTracking);
    wheel.addEventListener("pointercancel", stopWheelTracking);
    wheel.addEventListener("lostpointercapture", stopWheelTracking);

    closeVideo.addEventListener("click", () => closeVideoDialog());
    videoDialog.addEventListener("cancel", (event) => {
      event.preventDefault();
      closeVideoDialog();
    });
    closeInfo.addEventListener("click", () => infoDialog.close());
    infoDialog.addEventListener("click", (event) => {
      if (event.target === infoDialog) infoDialog.close();
    });

    for (const player of [audioPlayer, videoPlayer]) {
      player.addEventListener("timeupdate", updateProgress);
      player.addEventListener("durationchange", updateProgress);
      player.addEventListener("ended", nextTrack);
      player.addEventListener("play", () => {
        state.isPlaying = true;
        updateMediaSession();
      });
      player.addEventListener("pause", () => {
        state.isPlaying = false;
        updateMediaSession();
      });
      player.addEventListener("error", () => showToast("Este formato no puede reproducirse en el navegador"));
    }

    window.addEventListener("keydown", (event) => {
      if (event.key === "ArrowDown" || event.key === "ArrowRight") {
        event.preventDefault();
        rotateSelection(1);
      }
      if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
        event.preventDefault();
        rotateSelection(-1);
      }
      if (event.key === "Enter") handleSelect();
      if (event.key === "Escape") handleMenu();
      if (event.key === " ") {
        event.preventDefault();
        togglePlayback();
      }
    });

    window.addEventListener("beforeunload", () => {
      for (const item of state.library) {
        if (item.url) URL.revokeObjectURL(item.url);
      }
    });
  }

  function registerServiceWorker() {
    if (!("serviceWorker" in navigator) || location.protocol === "file:") return;
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("sw.js").catch(() => {
        // La demostración sigue funcionando sin instalación PWA.
      });
    });
  }

  audioPlayer.volume = state.volume;
  videoPlayer.volume = state.volume;
  wireEvents();
  setupMediaSession();
  registerServiceWorker();
  render();
})();
