// ============================================================
//  app.js — Hauptlogik
// ============================================================

// ---------- Konfiguration ----------
const TOPICS = [
  { id: "zellphysio",    label: "Zellphysiologie & Homöostase" },
  { id: "muskel",        label: "Muskelphysiologie" },
  { id: "blut",          label: "Blut" },
  { id: "immun",         label: "Immunsystem" },
  { id: "atmung",        label: "Atmung" },
  { id: "saeure",        label: "Säure-/Basen-Haushalt" },
  { id: "niere",         label: "Niere" },
  { id: "herz",          label: "Herz-/Kreislaufphysiologie" },
  { id: "verdauung",     label: "Verdauungstrakt" },
  { id: "hormone",       label: "Hormone" },
  { id: "zns",           label: "ZNS" },
  { id: "sehen",         label: "Sehen" },
  { id: "hoeren",        label: "Hören" },
];

// ---------- State ----------
let activeTopic   = null;   // topicId string
let activeFolder  = null;   // folderId string | null
let editingItemId = null;   // für Bearbeiten-Modals
let pendingImgUrl = null;   // base64 für Image-Upload

// ---------- Init ----------
document.addEventListener("DOMContentLoaded", () => {
  buildNav();
  bindModals();
  showHome();
  bindBackup();
});

// ---------- Backup & Import ----------
function bindBackup() {
  document.getElementById("btn-export").addEventListener("click", exportBackup);
  document.getElementById("btn-import").addEventListener("click", () => {
    document.getElementById("import-file-input").click();
  });
  document.getElementById("import-file-input").addEventListener("change", e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const parsed = JSON.parse(ev.target.result);
        if (typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
        if (!confirm("Backup importieren? Alle aktuellen Daten werden überschrieben.")) return;
        localStorage.setItem("physio_data", JSON.stringify(parsed));
        alert("Import erfolgreich! Seite wird neu geladen.");
        location.reload();
      } catch {
        alert("Ungültige Datei. Bitte eine Backup-JSON-Datei auswählen.");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  });
}

function exportBackup() {
  const data = localStorage.getItem("physio_data") || "{}";
  const date = new Date().toISOString().slice(0, 10);
  const blob = new Blob([data], { type: "application/json" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = `physiologie-backup-${date}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

// ---------- Nav ----------
function buildNav() {
  const nav = document.getElementById("nav-topics");
  TOPICS.forEach(t => {
    const btn = document.createElement("button");
    btn.className = "nav-topic-btn";
    btn.textContent = t.label;
    btn.dataset.id = t.id;
    btn.addEventListener("click", () => openTopic(t.id));
    nav.appendChild(btn);
  });
}

function openTopic(topicId) {
  activeTopic  = topicId;
  activeFolder = null;
  document.querySelectorAll(".nav-topic-btn").forEach(b => {
    b.classList.toggle("active", b.dataset.id === topicId);
  });
  renderTopicScreen();
}

// ---------- Screens ----------
function showHome() {
  document.getElementById("home-screen").classList.remove("hidden");
  document.getElementById("topic-screen").classList.add("hidden");
}

function renderTopicScreen() {
  document.getElementById("home-screen").classList.add("hidden");
  document.getElementById("topic-screen").classList.remove("hidden");

  const topic = TOPICS.find(t => t.id === activeTopic);
  document.getElementById("topic-title").textContent = topic.label;

  renderBreadcrumb();
  renderGrid();
}

// ---------- Breadcrumb ----------
function renderBreadcrumb() {
  const bc = document.getElementById("breadcrumb");
  if (!activeFolder) { bc.classList.add("hidden"); bc.innerHTML = ""; return; }
  bc.classList.remove("hidden");

  // Build path
  const path = [];
  let fid = activeFolder;
  while (fid) {
    const item = Store.getItem(activeTopic, fid);
    if (!item) break;
    path.unshift(item);
    fid = item.folderId || null;
  }

  bc.innerHTML = "";
  const root = document.createElement("span");
  root.className = "bc-part";
  root.textContent = TOPICS.find(t => t.id === activeTopic).label;
  root.addEventListener("click", () => { activeFolder = null; renderTopicScreen(); });
  bc.appendChild(root);

  path.forEach(p => {
    const sep = document.createElement("span");
    sep.className = "bc-sep";
    sep.textContent = "/";
    bc.appendChild(sep);
    const part = document.createElement("span");
    part.className = "bc-part";
    part.textContent = p.name;
    const pid = p.id;
    part.addEventListener("click", () => { activeFolder = pid; renderTopicScreen(); });
    bc.appendChild(part);
  });
}

// ---------- Grid ----------
function renderGrid() {
  const grid = document.getElementById("content-grid");
  grid.innerHTML = "";

  // Stats card only at root
  if (!activeFolder) {
    const stats = Store.stats(activeTopic);
    if (stats.flashcards + stats.notes + stats.images + stats.folders > 0) {
      grid.appendChild(makeStatsCard(stats));
    }
  }

  const items = Store.getItems(activeTopic, activeFolder);

  if (items.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-hint";
    empty.textContent = "Noch nichts hier. Klicke auf „+ Hinzufügen";
    grid.appendChild(empty);
    return;
  }

  // Folders first
  const folders    = items.filter(i => i.type === "folder");
  const nonFolders = items.filter(i => i.type !== "folder");

  [...folders, ...nonFolders].forEach(item => {
    grid.appendChild(makeCard(item));
  });
}

// ---------- Stats card ----------
function makeStatsCard(stats) {
  const card = document.createElement("div");
  card.className = "stats-card";
  card.innerHTML = `
    <div class="stats-title">Übersicht</div>
    <div class="stats-grid">
      <div class="stat-item"><span class="stat-num">${stats.flashcards}</span><span class="stat-lbl">Karteikarten</span></div>
      <div class="stat-item"><span class="stat-num">${stats.notes}</span><span class="stat-lbl">Notizen</span></div>
      <div class="stat-item"><span class="stat-num">${stats.images}</span><span class="stat-lbl">Bilder</span></div>
      <div class="stat-item"><span class="stat-num">${stats.folders}</span><span class="stat-lbl">Ordner</span></div>
    </div>
  `;
  return card;
}

// ---------- Card factory ----------
function makeCard(item) {
  if (item.type === "folder")    return makeFolderCard(item);
  if (item.type === "flashcard") return makeFlashcard(item);
  if (item.type === "note")      return makeNoteCard(item);
  if (item.type === "image")     return makeImageCard(item);
  return document.createElement("div");
}

// -- Folder --
function makeFolderCard(item) {
  const card = document.createElement("div");
  card.className = "card folder-card";

  const children = Store.getItems(activeTopic, item.id);
  const counts = {
    fc: children.filter(c => c.type === "flashcard").length,
    n:  children.filter(c => c.type === "note").length,
    img:children.filter(c => c.type === "image").length,
  };
  const summary = [
    counts.fc  ? `${counts.fc} Karte${counts.fc>1?"n":""}` : "",
    counts.n   ? `${counts.n} Notiz${counts.n>1?"en":""}` : "",
    counts.img ? `${counts.img} Bild${counts.img>1?"er":""}` : "",
  ].filter(Boolean).join(" · ") || "Leer";

  card.innerHTML = `
    <div class="card-icon folder-icon">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
    </div>
    <div class="card-body">
      <div class="card-title">${escHtml(item.name)}</div>
      <div class="card-meta">${summary}</div>
    </div>
    <div class="card-actions">
      <button class="icon-btn delete-btn" title="Löschen">✕</button>
    </div>
  `;
  card.querySelector(".card-icon, .card-body").addEventListener("click", () => {
    activeFolder = item.id;
    renderTopicScreen();
  });
  // make whole card body clickable
  card.querySelector(".card-body").style.cursor = "pointer";
  card.querySelector(".delete-btn").addEventListener("click", e => {
    e.stopPropagation();
    if (confirm(`Ordner „${item.name}" und alle Inhalte löschen?`)) {
      Store.deleteItem(activeTopic, item.id);
      renderGrid();
    }
  });
  return card;
}

// -- Flashcard --
function makeFlashcard(item) {
  const wrapper = document.createElement("div");
  wrapper.className = "flashcard-wrapper";

  const card = document.createElement("div");
  card.className = "flashcard";
  card.innerHTML = `
    <div class="flashcard-inner">
      <div class="flashcard-front">
        <div class="fc-label">Frage</div>
        <div class="fc-text">${escHtml(item.front)}</div>
        <div class="fc-hint">Klicken zum Umdrehen</div>
      </div>
      <div class="flashcard-back">
        <div class="fc-label">Antwort</div>
        <div class="fc-text">${escHtml(item.back)}</div>
      </div>
    </div>
  `;
  card.addEventListener("click", () => card.classList.toggle("flipped"));

  const actions = document.createElement("div");
  actions.className = "fc-actions";
  actions.innerHTML = `
    <button class="icon-btn fc-expand-btn" title="Vergrößern">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>
    </button>
    <button class="icon-btn" title="Bearbeiten">✎</button>
    <button class="icon-btn delete-btn" title="Löschen">✕</button>
  `;
  actions.querySelector(".fc-expand-btn").addEventListener("click", () => openFlashcardZoom(item));
  actions.querySelector(".icon-btn:nth-child(2)").addEventListener("click", () => openFlashcardEdit(item));
  actions.querySelector(".delete-btn").addEventListener("click", () => {
    Store.deleteItem(activeTopic, item.id);
    renderGrid();
  });

  wrapper.appendChild(card);
  wrapper.appendChild(actions);
  return wrapper;
}

// -- Note --
function makeNoteCard(item) {
  const card = document.createElement("div");
  card.className = "card note-card";
  const preview = item.body.length > 120 ? item.body.slice(0, 120) + "…" : item.body;
  card.innerHTML = `
    <div class="card-body">
      <div class="card-title">${escHtml(item.title || "Notiz")}</div>
      <div class="note-preview">${escHtml(preview)}</div>
    </div>
    <div class="card-actions">
      <button class="icon-btn" title="Bearbeiten">✎</button>
      <button class="icon-btn delete-btn" title="Löschen">✕</button>
    </div>
  `;
  card.querySelector(".icon-btn:first-child").addEventListener("click", () => openNoteEdit(item));
  card.querySelector(".delete-btn").addEventListener("click", () => {
    Store.deleteItem(activeTopic, item.id);
    renderGrid();
  });
  return card;
}

// -- Image --
function makeImageCard(item) {
  const card = document.createElement("div");
  card.className = "card image-card";
  card.innerHTML = `
    <img src="${item.dataUrl}" alt="${escHtml(item.title || '')}" loading="lazy" />
    <div class="img-caption">${escHtml(item.title || "")}</div>
    <div class="card-actions">
      <button class="icon-btn delete-btn" title="Löschen">✕</button>
    </div>
  `;
  card.querySelector("img").addEventListener("click", () => openLightbox(item));
  card.querySelector(".delete-btn").addEventListener("click", () => {
    Store.deleteItem(activeTopic, item.id);
    renderGrid();
  });
  return card;
}

// ---------- Lightbox ----------
function openLightbox(item) {
  document.getElementById("lightbox-img").src = item.dataUrl;
  document.getElementById("lightbox-caption").textContent = item.title || "";
  openModal("lightbox");
}

// ---------- Modal helpers ----------
function openModal(id) { document.getElementById(id).classList.remove("hidden"); }
function closeModal(id) { document.getElementById(id).classList.add("hidden"); }
function closeAllModals() {
  document.querySelectorAll(".modal").forEach(m => m.classList.add("hidden"));
}

// ---------- Bind modals ----------
function bindModals() {

  // Add-type chooser
  document.getElementById("btn-add").addEventListener("click", () => openModal("modal-add"));
  document.getElementById("modal-add-close").addEventListener("click", () => closeModal("modal-add"));
  document.querySelectorAll(".add-type-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      closeModal("modal-add");
      const type = btn.dataset.type;
      if (type === "flashcard") openFlashcardNew();
      if (type === "note")      openNoteNew();
      if (type === "image")     openImageModal();
    });
  });

  // Folder
  document.getElementById("btn-new-folder").addEventListener("click", () => openModal("modal-folder"));
  document.getElementById("folder-cancel").addEventListener("click", () => closeModal("modal-folder"));
  document.getElementById("folder-save").addEventListener("click", () => {
    const name = document.getElementById("folder-name-input").value.trim();
    if (!name) return;
    Store.addItem(activeTopic, { type: "folder", name, folderId: activeFolder });
    document.getElementById("folder-name-input").value = "";
    closeModal("modal-folder");
    renderGrid();
  });

  // Flashcard
  document.getElementById("fc-cancel").addEventListener("click", () => closeModal("modal-flashcard"));
  document.getElementById("fc-save").addEventListener("click", saveFlashcard);

  // Note
  document.getElementById("note-cancel").addEventListener("click", () => closeModal("modal-note"));
  document.getElementById("note-save").addEventListener("click", saveNote);

  // Image
  document.getElementById("img-cancel").addEventListener("click", () => { pendingImgUrl = null; closeModal("modal-image"); });
  document.getElementById("img-save").addEventListener("click", saveImage);
  setupImageDrop();

  // Lightbox
  document.getElementById("lightbox-close").addEventListener("click", () => closeModal("lightbox"));
  document.getElementById("lightbox").addEventListener("click", e => {
    if (e.target === document.getElementById("lightbox")) closeModal("lightbox");
  });

  // Flashcard Zoom
  document.getElementById("fc-zoom-close").addEventListener("click", () => closeModal("fc-zoom-overlay"));
  document.getElementById("fc-zoom-overlay").addEventListener("click", e => {
    if (e.target === document.getElementById("fc-zoom-overlay")) closeModal("fc-zoom-overlay");
  });

  // Close modal on backdrop click
  document.querySelectorAll(".modal").forEach(modal => {
    modal.addEventListener("click", e => {
      if (e.target === modal && modal.id !== "lightbox") closeModal(modal.id);
    });
  });
}

// ---------- Flashcard modal ----------
function openFlashcardNew() {
  editingItemId = null;
  document.getElementById("fc-modal-title").textContent = "Neue Karteikarte";
  document.getElementById("fc-front").value = "";
  document.getElementById("fc-back").value = "";
  openModal("modal-flashcard");
}
function openFlashcardEdit(item) {
  editingItemId = item.id;
  document.getElementById("fc-modal-title").textContent = "Karteikarte bearbeiten";
  document.getElementById("fc-front").value = item.front;
  document.getElementById("fc-back").value = item.back;
  openModal("modal-flashcard");
}
function saveFlashcard() {
  const front = document.getElementById("fc-front").value.trim();
  const back  = document.getElementById("fc-back").value.trim();
  if (!front || !back) return;
  if (editingItemId) {
    Store.updateItem(activeTopic, editingItemId, { front, back });
  } else {
    Store.addItem(activeTopic, { type: "flashcard", front, back, folderId: activeFolder });
  }
  closeModal("modal-flashcard");
  renderGrid();
}

// ---------- Note modal ----------
function openNoteNew() {
  editingItemId = null;
  document.getElementById("note-modal-title").textContent = "Neue Notiz";
  document.getElementById("note-title-input").value = "";
  document.getElementById("note-body").value = "";
  openModal("modal-note");
}
function openNoteEdit(item) {
  editingItemId = item.id;
  document.getElementById("note-modal-title").textContent = "Notiz bearbeiten";
  document.getElementById("note-title-input").value = item.title || "";
  document.getElementById("note-body").value = item.body || "";
  openModal("modal-note");
}
function saveNote() {
  const title = document.getElementById("note-title-input").value.trim();
  const body  = document.getElementById("note-body").value.trim();
  if (!body) return;
  if (editingItemId) {
    Store.updateItem(activeTopic, editingItemId, { title, body });
  } else {
    Store.addItem(activeTopic, { type: "note", title, body, folderId: activeFolder });
  }
  closeModal("modal-note");
  renderGrid();
}

// ---------- Image modal ----------
function openImageModal() {
  pendingImgUrl = null;
  document.getElementById("img-title-input").value = "";
  document.getElementById("img-preview").classList.add("hidden");
  document.getElementById("img-preview").src = "";
  document.getElementById("img-file-input").value = "";
  openModal("modal-image");
}
function setupImageDrop() {
  const zone  = document.getElementById("img-drop-zone");
  const input = document.getElementById("img-file-input");

  zone.addEventListener("click", () => input.click());
  zone.addEventListener("dragover", e => { e.preventDefault(); zone.classList.add("drag-over"); });
  zone.addEventListener("dragleave", () => zone.classList.remove("drag-over"));
  zone.addEventListener("drop", e => {
    e.preventDefault(); zone.classList.remove("drag-over");
    const file = e.dataTransfer.files[0];
    if (file) readImageFile(file);
  });
  input.addEventListener("change", () => {
    if (input.files[0]) readImageFile(input.files[0]);
  });
}
function readImageFile(file) {
  const reader = new FileReader();
  reader.onload = e => {
    pendingImgUrl = e.target.result;
    const preview = document.getElementById("img-preview");
    preview.src = pendingImgUrl;
    preview.classList.remove("hidden");
  };
  reader.readAsDataURL(file);
}
function saveImage() {
  if (!pendingImgUrl) return;
  const title = document.getElementById("img-title-input").value.trim();
  Store.addItem(activeTopic, { type: "image", title, dataUrl: pendingImgUrl, folderId: activeFolder });
  pendingImgUrl = null;
  closeModal("modal-image");
  renderGrid();
}

// ---------- Flashcard Zoom ----------
function openFlashcardZoom(item) {
  const overlay = document.getElementById("fc-zoom-overlay");
  const inner   = overlay.querySelector(".fc-zoom-inner");

  inner.classList.remove("flipped");
  overlay.querySelector(".fc-zoom-front .fc-text").textContent = item.front;
  overlay.querySelector(".fc-zoom-back .fc-text").textContent  = item.back;
  overlay.querySelector(".fc-zoom-hint").textContent = "Klicken zum Umdrehen";

  inner.onclick = () => {
    inner.classList.toggle("flipped");
    overlay.querySelector(".fc-zoom-hint").textContent =
      inner.classList.contains("flipped") ? "Klicken zum Zurückdrehen" : "Klicken zum Umdrehen";
  };

  openModal("fc-zoom-overlay");
}

// ---------- Utils ----------
function escHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
