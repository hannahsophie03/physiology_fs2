// ============================================================
//  app.js — Hauptlogik
// ============================================================

const TOPICS = [
  { id: "zellphysio", label: "Zellphysiologie & Homöostase" },
  { id: "muskel",     label: "Muskelphysiologie" },
  { id: "blut",       label: "Blut" },
  { id: "immun",      label: "Immunsystem" },
  { id: "atmung",     label: "Atmung" },
  { id: "saeure",     label: "Säure-/Basen-Haushalt" },
  { id: "niere",      label: "Niere" },
  { id: "herz",       label: "Herz-/Kreislaufphysiologie" },
  { id: "verdauung",  label: "Verdauungstrakt" },
  { id: "hormone",    label: "Hormone" },
  { id: "zns",        label: "ZNS" },
  { id: "sehen",      label: "Sehen" },
  { id: "hoeren",     label: "Hören" },
];

let activeTopic   = null;
let activeFolder  = null;
let editingItemId = null;
let pendingImgUrl = null;
let pendingEditImgUrl = null;   // für Bild-bearbeiten
let noteImages    = [];         // [{dataUrl, caption}] — temporär im Notiz-Modal

// ---------- Init ----------
document.addEventListener("DOMContentLoaded", () => {
  buildNav();
  bindModals();
  bindFormatToolbars();
  showHome();
  bindBackup();
  startAutoBackup();
  bindEsc();
  if (Store.isServerMode()) {
    const badge = document.createElement("span");
    badge.id = "server-badge";
    badge.textContent = "● Server";
    badge.title = "Daten werden in data.json gespeichert";
    document.getElementById("nav-logo").appendChild(badge);
  }
});

// ---------- ESC zum Schließen ----------
function bindEsc() {
  document.addEventListener("keydown", e => {
    if (e.key !== "Escape") return;
    // Schließe das zuletzt geöffnete sichtbare Modal
    const open = [...document.querySelectorAll(".modal:not(.hidden)")];
    if (open.length) closeModal(open[open.length - 1].id);
  });
}

// ---------- Auto-Backup ----------
const AUTO_BACKUP_INTERVAL_MS = 10 * 60 * 1000; // 10 Minuten

function startAutoBackup() {
  setInterval(async () => {
    const data = await Store.raw();
    const hasContent = Object.values(data).some(t => t.items && t.items.length > 0);
    if (!hasContent) return; // nichts zu sichern

    if (Store.isServerMode()) {
      // Server-Modus: POST an eigenen Backup-Endpoint
      try {
        await fetch("/api/backup", {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify(data),
        });
        showAutoBackupToast();
      } catch { /* Server nicht erreichbar — still ignorieren */ }
    } else {
      // Datei-Modus: automatisch runterladen
      const ts   = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 16);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href = url; a.download = `physio-auto-${ts}.json`;
      a.click(); URL.revokeObjectURL(url);
      showAutoBackupToast();
    }
  }, AUTO_BACKUP_INTERVAL_MS);
}

function showAutoBackupToast() {
  let toast = document.getElementById("backup-toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "backup-toast";
    document.body.appendChild(toast);
  }
  toast.textContent = "✓ Auto-Backup gespeichert";
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 3000);
}

// ---------- Markdown + LaTeX Rendering ----------

/**
 * Wandelt Markdown-Syntax und LaTeX in HTML um.
 * Unterstützt: **fett**, *kursiv*, __unterstrichen__, $inline$, $$block$$
 */
function renderContent(raw) {
  if (!raw) return "";

  // LaTeX-Blöcke schützen (Platzhalter), damit Markdown-Regex sie nicht zerstört
  const latexBlocks  = [];
  const latexInlines = [];

  let text = raw
    // $$...$$ Block
    .replace(/\$\$([\s\S]+?)\$\$/g, (_, expr) => {
      latexBlocks.push(expr);
      return `%%LATEXBLOCK${latexBlocks.length - 1}%%`;
    })
    // $...$ inline
    .replace(/\$([^\n$]+?)\$/g, (_, expr) => {
      latexInlines.push(expr);
      return `%%LATEXINLINE${latexInlines.length - 1}%%`;
    });

  // Markdown
  text = text
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")  // HTML escapen
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")   // **fett**
    .replace(/\*(.+?)\*/g,     "<em>$1</em>")            // *kursiv*
    .replace(/__(.+?)__/g,     "<u>$1</u>")              // __unterstrichen__
    .replace(/\n/g, "<br>");                             // Zeilenumbrüche

  // LaTeX wieder einsetzen und rendern
  latexBlocks.forEach((expr, i) => {
    let rendered = "";
    try { rendered = katex.renderToString(expr, { displayMode: true, throwOnError: false }); }
    catch { rendered = `<code>$$${expr}$$</code>`; }
    text = text.replace(`%%LATEXBLOCK${i}%%`, rendered);
  });
  latexInlines.forEach((expr, i) => {
    let rendered = "";
    try { rendered = katex.renderToString(expr, { displayMode: false, throwOnError: false }); }
    catch { rendered = `<code>$${expr}$</code>`; }
    text = text.replace(`%%LATEXINLINE${i}%%`, rendered);
  });

  return text;
}

// ---------- Format-Toolbar ----------
function bindFormatToolbars() {
  document.querySelectorAll(".format-toolbar").forEach(toolbar => {
    // Zugehöriges Textarea ermitteln: data-for oder nächstes textarea-Geschwisterelement
    const targetId = toolbar.dataset.for;
    const getTextarea = () => targetId
      ? document.getElementById(targetId)
      : toolbar.nextElementSibling;

    toolbar.querySelectorAll(".fmt-btn").forEach(btn => {
      btn.addEventListener("mousedown", e => {
        e.preventDefault(); // Fokus im Textarea behalten
        const ta  = getTextarea();
        if (!ta) return;
        const fmt = btn.dataset.fmt;
        applyFormat(ta, fmt);
      });
    });
  });

  // Tastaturkürzel im Notiz-Body
  document.getElementById("note-body").addEventListener("keydown", e => {
    if (e.ctrlKey || e.metaKey) {
      if (e.key === "b") { e.preventDefault(); applyFormat(e.target, "bold"); }
      if (e.key === "i") { e.preventDefault(); applyFormat(e.target, "italic"); }
      if (e.key === "u") { e.preventDefault(); applyFormat(e.target, "underline"); }
    }
  });
}

function applyFormat(textarea, fmt) {
  const start = textarea.selectionStart;
  const end   = textarea.selectionEnd;
  const sel   = textarea.value.slice(start, end);
  const before = textarea.value.slice(0, start);
  const after  = textarea.value.slice(end);

  const formats = {
    "bold":         { wrap: ["**", "**"],   placeholder: "fetter Text" },
    "italic":       { wrap: ["*",  "*"],    placeholder: "kursiver Text" },
    "underline":    { wrap: ["__", "__"],   placeholder: "unterstrichener Text" },
    "latex-inline": { wrap: ["$",  "$"],    placeholder: "E = mc^2" },
    "latex-block":  { wrap: ["$$\n", "\n$$"], placeholder: "\\frac{d}{dx}" },
  };

  const f = formats[fmt];
  if (!f) return;

  const content  = sel || f.placeholder;
  const inserted = f.wrap[0] + content + f.wrap[1];
  textarea.value = before + inserted + after;

  // Selektion auf den Inhalt setzen (ohne Wrapper)
  const newStart = start + f.wrap[0].length;
  const newEnd   = newStart + content.length;
  textarea.setSelectionRange(newStart, newEnd);
  textarea.focus();
}


function bindBackup() {
  document.getElementById("btn-export").addEventListener("click", exportBackup);
  document.getElementById("btn-import").addEventListener("click", () => document.getElementById("import-file-input").click());
  document.getElementById("import-file-input").addEventListener("change", e => {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = async ev => {
      try {
        const parsed = JSON.parse(ev.target.result);
        if (typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
        if (!confirm("Backup importieren? Alle aktuellen Daten werden überschrieben.")) return;
        await Store.rawSet(parsed);
        alert("Import erfolgreich! Seite wird neu geladen.");
        location.reload();
      } catch { alert("Ungültige Datei."); }
    };
    reader.readAsText(file);
    e.target.value = "";
  });
}

async function exportBackup() {
  const data = await Store.raw();
  const date = new Date().toISOString().slice(0, 10);
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href = url; a.download = `physiologie-backup-${date}.json`;
  a.click(); URL.revokeObjectURL(url);
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
  activeTopic = topicId; activeFolder = null;
  document.querySelectorAll(".nav-topic-btn").forEach(b => b.classList.toggle("active", b.dataset.id === topicId));
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
  document.getElementById("topic-title").textContent = TOPICS.find(t => t.id === activeTopic).label;
  renderBreadcrumb();
  renderGrid();
}

// ---------- Breadcrumb ----------
async function renderBreadcrumb() {
  const bc = document.getElementById("breadcrumb");
  if (!activeFolder) { bc.classList.add("hidden"); bc.innerHTML = ""; return; }
  bc.classList.remove("hidden");
  const path = [];
  let fid = activeFolder;
  while (fid) {
    const item = await Store.getItem(activeTopic, fid);
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
    const sep = document.createElement("span"); sep.className = "bc-sep"; sep.textContent = "/"; bc.appendChild(sep);
    const part = document.createElement("span"); part.className = "bc-part"; part.textContent = p.name;
    const pid = p.id;
    part.addEventListener("click", () => { activeFolder = pid; renderTopicScreen(); });
    bc.appendChild(part);
  });
}

// ---------- Grid ----------
async function renderGrid() {
  const grid = document.getElementById("content-grid");
  grid.innerHTML = "";

  if (!activeFolder) {
    const stats = await Store.stats(activeTopic);
    if (stats.flashcards + stats.notes + stats.images + stats.folders > 0)
      grid.appendChild(makeStatsCard(stats));
  }

  const items = await Store.getItems(activeTopic, activeFolder);
  if (items.length === 0) {
    const e = document.createElement("div"); e.className = "empty-hint";
    e.textContent = "Noch nichts hier. Klicke auf „+ Hinzufügen";
    grid.appendChild(e); return;
  }

  const folders    = items.filter(i => i.type === "folder");
  const nonFolders = items.filter(i => i.type !== "folder");
  for (const item of [...folders, ...nonFolders]) {
    const el = await makeCard(item);
    grid.appendChild(el);
  }

  initDragDrop(grid);
}

// ---------- Stats card ----------
function makeStatsCard(stats) {
  const card = document.createElement("div");
  card.className = "stats-card";
  card.innerHTML = `<div class="stats-title">Übersicht</div><div class="stats-grid">
    <div class="stat-item"><span class="stat-num">${stats.flashcards}</span><span class="stat-lbl">Karteikarten</span></div>
    <div class="stat-item"><span class="stat-num">${stats.notes}</span><span class="stat-lbl">Notizen</span></div>
    <div class="stat-item"><span class="stat-num">${stats.images}</span><span class="stat-lbl">Bilder</span></div>
    <div class="stat-item"><span class="stat-num">${stats.folders}</span><span class="stat-lbl">Ordner</span></div>
  </div>`;
  return card;
}

// ---------- Card factory ----------
async function makeCard(item) {
  if (item.type === "folder")    return await makeFolderCard(item);
  if (item.type === "flashcard") return makeFlashcard(item);
  if (item.type === "note")      return makeNoteCard(item);
  if (item.type === "image")     return makeImageCard(item);
  return document.createElement("div");
}

// -- Folder --
async function makeFolderCard(item) {
  const card = document.createElement("div");
  card.className = "card folder-card draggable";
  card.dataset.id = item.id;
  const children = await Store.getItems(activeTopic, item.id);
  const fc = children.filter(c => c.type === "flashcard").length;
  const n  = children.filter(c => c.type === "note").length;
  const img= children.filter(c => c.type === "image").length;
  const summary = [fc?`${fc} Karten`:"", n?`${n} Notizen`:"", img?`${img} Bilder`:""].filter(Boolean).join(" · ") || "Leer";
  card.innerHTML = `
    <div class="drag-handle" title="Verschieben">⠿</div>
    <div class="card-icon folder-icon"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg></div>
    <div class="card-body" style="flex:1;cursor:pointer"><div class="card-title">${escHtml(item.name)}</div><div class="card-meta">${summary}</div></div>
    <div class="card-actions"><button class="icon-btn delete-btn" title="Löschen">✕</button></div>`;
  card.querySelector(".card-body").addEventListener("click", () => { activeFolder = item.id; renderTopicScreen(); });
  card.querySelector(".card-icon").addEventListener("click", () => { activeFolder = item.id; renderTopicScreen(); });
  card.querySelector(".delete-btn").addEventListener("click", async e => {
    e.stopPropagation();
    if (confirm(`Ordner „${item.name}" und alle Inhalte löschen?`)) { await Store.deleteItem(activeTopic, item.id); renderGrid(); }
  });
  return card;
}

// -- Flashcard --
function makeFlashcard(item) {
  const wrapper = document.createElement("div");
  wrapper.className = "flashcard-wrapper draggable";
  wrapper.dataset.id = item.id;

  const dragH = document.createElement("div");
  dragH.className = "drag-handle fc-drag-handle"; dragH.textContent = "⠿";
  wrapper.appendChild(dragH);

  const card = document.createElement("div");
  card.className = "flashcard";
  card.innerHTML = `<div class="flashcard-inner">
    <div class="flashcard-front"><div class="fc-label">Frage</div><div class="fc-text">${renderContent(item.front)}</div><div class="fc-hint">Klicken zum Umdrehen</div></div>
    <div class="flashcard-back"><div class="fc-label">Antwort</div><div class="fc-text">${renderContent(item.back)}</div></div>
  </div>`;
  card.addEventListener("click", () => card.classList.toggle("flipped"));

  const actions = document.createElement("div");
  actions.className = "fc-actions";
  actions.innerHTML = `
    <button class="icon-btn fc-expand-btn" title="Vergrößern"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg></button>
    <button class="icon-btn" title="Bearbeiten">✎</button>
    <button class="icon-btn delete-btn" title="Löschen">✕</button>`;
  actions.querySelector(".fc-expand-btn").addEventListener("click", () => openFlashcardZoom(item));
  actions.querySelector(".icon-btn:nth-child(2)").addEventListener("click", () => openFlashcardEdit(item));
  actions.querySelector(".delete-btn").addEventListener("click", async () => { await Store.deleteItem(activeTopic, item.id); renderGrid(); });

  wrapper.appendChild(card);
  wrapper.appendChild(actions);
  return wrapper;
}

// -- Note --
function makeNoteCard(item) {
  const card = document.createElement("div");
  card.className = "card note-card draggable";
  card.dataset.id = item.id;

  const preview = (item.body || "").length > 120 ? item.body.slice(0, 120) + "…" : (item.body || "");
  const hasImages = item.images && item.images.length > 0;

  card.innerHTML = `
    <div class="drag-handle" title="Verschieben">⠿</div>
    <div class="card-body" style="padding-right:36px;cursor:pointer">
      <div class="card-title">${escHtml(item.title || "Notiz")}</div>
      <div class="note-preview">${escHtml(preview)}</div>
      ${hasImages ? `<div class="note-img-strip">${item.images.map(img =>
        `<img src="${img.dataUrl}" alt="${escHtml(img.caption||'')}" />`
      ).join("")}</div>` : ""}
    </div>
    <div class="card-actions">
      <button class="icon-btn" title="Bearbeiten">✎</button>
      <button class="icon-btn delete-btn" title="Löschen">✕</button>
    </div>`;
  card.querySelector(".card-body").addEventListener("click", () => openNoteView(item));
  card.querySelector(".icon-btn:first-child").addEventListener("click", (e) => { e.stopPropagation(); openNoteEdit(item); });
  card.querySelector(".delete-btn").addEventListener("click", async (e) => { e.stopPropagation(); await Store.deleteItem(activeTopic, item.id); renderGrid(); });
  return card;
}

// -- Image --
function makeImageCard(item) {
  const card = document.createElement("div");
  card.className = "card image-card draggable";
  card.dataset.id = item.id;
  card.innerHTML = `
    <div class="drag-handle img-drag-handle" title="Verschieben">⠿</div>
    <img src="${item.dataUrl}" alt="${escHtml(item.title || '')}" loading="lazy" />
    <div class="img-caption">${escHtml(item.title || "")}</div>
    <div class="card-actions">
      <button class="icon-btn" title="Bearbeiten">✎</button>
      <button class="icon-btn delete-btn" title="Löschen">✕</button>
    </div>`;
  card.querySelector("img").addEventListener("click", () => openLightbox(item));
  card.querySelector(".icon-btn:first-child").addEventListener("click", () => openImageEdit(item));
  card.querySelector(".delete-btn").addEventListener("click", async () => { await Store.deleteItem(activeTopic, item.id); renderGrid(); });
  return card;
}

// ---------- Lightbox ----------
function openLightbox(item) {
  document.getElementById("lightbox-img").src = item.dataUrl;
  document.getElementById("lightbox-caption").textContent = item.title || "";
  openModal("lightbox");
}

// ---------- Modal helpers ----------
function openModal(id)  { document.getElementById(id).classList.remove("hidden"); }
function closeModal(id) { document.getElementById(id).classList.add("hidden"); }

// ---------- Bind modals ----------
function bindModals() {
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
  document.getElementById("folder-save").addEventListener("click", async () => {
    const name = document.getElementById("folder-name-input").value.trim(); if (!name) return;
    await Store.addItem(activeTopic, { type: "folder", name, folderId: activeFolder });
    document.getElementById("folder-name-input").value = "";
    closeModal("modal-folder"); renderGrid();
  });

  // Flashcard
  document.getElementById("fc-cancel").addEventListener("click", () => closeModal("modal-flashcard"));
  document.getElementById("fc-save").addEventListener("click", saveFlashcard);

  // Note
  document.getElementById("note-cancel").addEventListener("click", () => closeModal("modal-note"));
  document.getElementById("note-save").addEventListener("click", saveNote);
  bindNoteImageUpload();

  // Image (new)
  document.getElementById("img-cancel").addEventListener("click", () => { pendingImgUrl = null; closeModal("modal-image"); });
  document.getElementById("img-save").addEventListener("click", saveImage);
  setupImageDrop("img-drop-zone", "img-file-input", url => { pendingImgUrl = url; showPreview("img-preview", url); });

  // Image (edit)
  document.getElementById("img-edit-cancel").addEventListener("click", () => { pendingEditImgUrl = null; closeModal("modal-image-edit"); });
  document.getElementById("img-edit-save").addEventListener("click", saveImageEdit);
  setupImageDrop("img-edit-drop-zone", "img-edit-file", url => { pendingEditImgUrl = url; showPreview("img-edit-preview", url); });

  // Lightbox
  document.getElementById("lightbox-close").addEventListener("click", () => closeModal("lightbox"));
  document.getElementById("lightbox").addEventListener("click", e => { if (e.target === document.getElementById("lightbox")) closeModal("lightbox"); });

  // FC Zoom
  document.getElementById("note-view-close").addEventListener("click", () => closeModal("modal-note-view"));
  document.getElementById("modal-note-view").addEventListener("click", e => {
    if (e.target === document.getElementById("modal-note-view")) closeModal("modal-note-view");
  });
  document.getElementById("note-view-edit").addEventListener("click", () => {
    closeModal("modal-note-view");
    if (noteViewItem) openNoteEdit(noteViewItem);
  });

  document.getElementById("fc-zoom-close").addEventListener("click", () => closeModal("fc-zoom-overlay"));
  document.getElementById("fc-zoom-overlay").addEventListener("click", e => { if (e.target === document.getElementById("fc-zoom-overlay")) closeModal("fc-zoom-overlay"); });

  // Backdrop close (all modals except lightbox/zoom)
  document.querySelectorAll(".modal").forEach(modal => {
    modal.addEventListener("click", e => {
      if (e.target === modal && !["lightbox","fc-zoom-overlay"].includes(modal.id)) closeModal(modal.id);
    });
  });
}

// ---------- Note image upload (in modal) ----------
function bindNoteImageUpload() {
  const addBtn  = document.getElementById("note-add-img-btn");
  const fileInp = document.getElementById("note-img-file");
  addBtn.addEventListener("click", () => fileInp.click());
  fileInp.addEventListener("change", () => {
    if (fileInp.files[0]) readFileAsDataUrl(fileInp.files[0], url => {
      noteImages.push({ dataUrl: url, caption: "" });
      renderNoteImageList();
      fileInp.value = "";
    });
  });
}

function renderNoteImageList() {
  const list = document.getElementById("note-img-list");
  list.innerHTML = "";
  noteImages.forEach((img, idx) => {
    const row = document.createElement("div");
    row.className = "note-img-row";
    row.innerHTML = `
      <img src="${img.dataUrl}" alt="" class="note-img-thumb" />
      <input class="note-img-caption" placeholder="Bildunterschrift…" value="${escHtml(img.caption)}" />
      <button class="icon-btn delete-btn" title="Entfernen">✕</button>`;
    row.querySelector(".note-img-caption").addEventListener("input", e => { noteImages[idx].caption = e.target.value; });
    row.querySelector(".delete-btn").addEventListener("click", () => { noteImages.splice(idx, 1); renderNoteImageList(); });
    list.appendChild(row);
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
async function saveFlashcard() {
  const front = document.getElementById("fc-front").value.trim();
  const back  = document.getElementById("fc-back").value.trim();
  if (!front || !back) return;
  if (editingItemId) await Store.updateItem(activeTopic, editingItemId, { front, back });
  else await Store.addItem(activeTopic, { type: "flashcard", front, back, folderId: activeFolder });
  closeModal("modal-flashcard"); renderGrid();
}

// ---------- Note modal ----------
function openNoteNew() {
  editingItemId = null;
  noteImages = [];
  document.getElementById("note-modal-title").textContent = "Neue Notiz";
  document.getElementById("note-title-input").value = "";
  document.getElementById("note-body").value = "";
  renderNoteImageList();
  openModal("modal-note");
}
function openNoteEdit(item) {
  editingItemId = item.id;
  noteImages = item.images ? item.images.map(i => ({ ...i })) : [];
  document.getElementById("note-modal-title").textContent = "Notiz bearbeiten";
  document.getElementById("note-title-input").value = item.title || "";
  document.getElementById("note-body").value = item.body || "";
  renderNoteImageList();
  openModal("modal-note");
}
async function saveNote() {
  const title  = document.getElementById("note-title-input").value.trim();
  const body   = document.getElementById("note-body").value.trim();
  if (!body && noteImages.length === 0) return;
  const images = noteImages.slice();
  if (editingItemId) await Store.updateItem(activeTopic, editingItemId, { title, body, images });
  else await Store.addItem(activeTopic, { type: "note", title, body, images, folderId: activeFolder });
  closeModal("modal-note"); renderGrid();
}

// ---------- Image modal (new) ----------
function openImageModal() {
  pendingImgUrl = null;
  document.getElementById("img-title-input").value = "";
  document.getElementById("img-preview").classList.add("hidden");
  document.getElementById("img-preview").src = "";
  document.getElementById("img-file-input").value = "";
  openModal("modal-image");
}
async function saveImage() {
  if (!pendingImgUrl) return;
  const title = document.getElementById("img-title-input").value.trim();
  await Store.addItem(activeTopic, { type: "image", title, dataUrl: pendingImgUrl, folderId: activeFolder });
  pendingImgUrl = null; closeModal("modal-image"); renderGrid();
}

// ---------- Image edit ----------
function openImageEdit(item) {
  editingItemId = item.id;
  pendingEditImgUrl = null;
  document.getElementById("img-edit-title").value = item.title || "";
  document.getElementById("img-edit-preview").src = item.dataUrl;
  document.getElementById("img-edit-preview").classList.remove("hidden");
  document.getElementById("img-edit-file").value = "";
  openModal("modal-image-edit");
}
async function saveImageEdit() {
  const title = document.getElementById("img-edit-title").value.trim();
  const patch = { title };
  if (pendingEditImgUrl) patch.dataUrl = pendingEditImgUrl;
  await Store.updateItem(activeTopic, editingItemId, patch);
  pendingEditImgUrl = null; closeModal("modal-image-edit"); renderGrid();
}

// ---------- Note Detail View ----------
let noteViewItem = null;

function openNoteView(item) {
  noteViewItem = item;
  document.getElementById("note-view-title").textContent = item.title || "Notiz";

  const body = document.getElementById("note-view-body");
  body.innerHTML = "";

  // Text
  if (item.body) {
    const text = document.createElement("div");
    text.className = "note-view-text";
    text.innerHTML = renderContent(item.body);
    body.appendChild(text);
  }

  // Bilder
  if (item.images && item.images.length > 0) {
    const imgGrid = document.createElement("div");
    imgGrid.className = "note-view-img-grid";
    item.images.forEach(img => {
      const wrap = document.createElement("div");
      wrap.className = "note-view-img-wrap";
      const el = document.createElement("img");
      el.src = img.dataUrl;
      el.alt = img.caption || "";
      el.title = img.caption || "";
      el.addEventListener("click", () => {
        document.getElementById("lightbox-img").src = img.dataUrl;
        document.getElementById("lightbox-caption").textContent = img.caption || "";
        openModal("lightbox");
      });
      wrap.appendChild(el);
      if (img.caption) {
        const cap = document.createElement("div");
        cap.className = "note-view-img-caption";
        cap.textContent = img.caption;
        wrap.appendChild(cap);
      }
      imgGrid.appendChild(wrap);
    });
    body.appendChild(imgGrid);
  }

  openModal("modal-note-view");
}

// ---------- Flashcard Zoom ----------
function openFlashcardZoom(item) {
  const overlay = document.getElementById("fc-zoom-overlay");
  const inner   = overlay.querySelector(".fc-zoom-inner");
  inner.classList.remove("flipped");
  overlay.querySelector(".fc-zoom-front .fc-text").innerHTML = renderContent(item.front);
  overlay.querySelector(".fc-zoom-back .fc-text").innerHTML  = renderContent(item.back);
  overlay.querySelector(".fc-zoom-hint").textContent = "Klicken zum Umdrehen";
  inner.onclick = () => {
    inner.classList.toggle("flipped");
    overlay.querySelector(".fc-zoom-hint").textContent =
      inner.classList.contains("flipped") ? "Klicken zum Zurückdrehen" : "Klicken zum Umdrehen";
  };
  openModal("fc-zoom-overlay");
}

// ---------- Drag & Drop ----------
function initDragDrop(grid) {
  let dragging = null;
  let placeholder = null;

  grid.querySelectorAll(".draggable").forEach(el => {
    const handle = el.querySelector(".drag-handle");
    if (!handle) return;

    handle.addEventListener("mousedown", e => {
      e.preventDefault();
      dragging = el;
      const rect = el.getBoundingClientRect();
      const offsetX = e.clientX - rect.left;
      const offsetY = e.clientY - rect.top;

      // Placeholder
      placeholder = document.createElement("div");
      placeholder.className = "drag-placeholder";
      placeholder.style.width  = rect.width + "px";
      placeholder.style.height = rect.height + "px";

      // Clone as ghost
      el.classList.add("dragging");
      el.style.width  = rect.width + "px";
      el.style.left   = rect.left + "px";
      el.style.top    = rect.top + window.scrollY + "px";
      el.parentNode.insertBefore(placeholder, el);
      document.body.appendChild(el);

      const onMove = e => {
        el.style.left = (e.clientX - offsetX) + "px";
        el.style.top  = (e.clientY - offsetY + window.scrollY) + "px";

        // Find insertion point
        const afterEl = getDragAfterElement(grid, e.clientY);
        if (afterEl == null) grid.appendChild(placeholder);
        else grid.insertBefore(placeholder, afterEl);
      };

      const onUp = async () => {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        el.classList.remove("dragging");
        el.style.cssText = "";
        grid.insertBefore(el, placeholder);
        placeholder.remove();

        // Persist new order (only non-stats draggables)
        const orderedIds = [...grid.querySelectorAll(".draggable")].map(e => e.dataset.id).filter(Boolean);
        await Store.reorderItems(activeTopic, activeFolder, orderedIds);
      };

      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    });
  });
}

function getDragAfterElement(container, y) {
  const draggables = [...container.querySelectorAll(".draggable:not(.dragging)")];
  return draggables.reduce((closest, child) => {
    const box = child.getBoundingClientRect();
    const offset = y - box.top - box.height / 2;
    if (offset < 0 && offset > closest.offset) return { offset, element: child };
    return closest;
  }, { offset: Number.NEGATIVE_INFINITY }).element;
}

// ---------- Helpers ----------
function setupImageDrop(zoneId, inputId, onRead) {
  const zone  = document.getElementById(zoneId);
  const input = document.getElementById(inputId);
  zone.addEventListener("click", () => input.click());
  zone.addEventListener("dragover", e => { e.preventDefault(); zone.classList.add("drag-over"); });
  zone.addEventListener("dragleave", () => zone.classList.remove("drag-over"));
  zone.addEventListener("drop", e => {
    e.preventDefault(); zone.classList.remove("drag-over");
    if (e.dataTransfer.files[0]) readFileAsDataUrl(e.dataTransfer.files[0], onRead);
  });
  input.addEventListener("change", () => { if (input.files[0]) readFileAsDataUrl(input.files[0], onRead); });
}

function readFileAsDataUrl(file, cb) {
  const reader = new FileReader();
  reader.onload = e => cb(e.target.result);
  reader.readAsDataURL(file);
}

function showPreview(imgId, url) {
  const el = document.getElementById(imgId);
  el.src = url; el.classList.remove("hidden");
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
