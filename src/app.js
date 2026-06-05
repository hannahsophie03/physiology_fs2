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
let pendingEditImgUrl = null;
let noteImages    = [];
let fcImages      = { front: null, back: null }; // { dataUrl } | null pro Seite

// ---------- Init ----------
document.addEventListener("DOMContentLoaded", () => {
  buildNav();
  bindModals();
  bindFormatToolbars();
  bindAutosave();
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
 * Rendert Markdown + LaTeX + Tabellen zu HTML.
 * Verarbeitet den Text zeilenweise um Kollisionen zwischen
 * Tabellen, LaTeX und Markdown zuverlässig zu vermeiden.
 */
function renderContent(raw) {
  if (!raw) return "";
  try {
    // Schritt 1: Text in Blöcke aufteilen (Tabellen vs. normaler Text)
    const blocks = splitIntoBlocks(raw);

    return blocks.map(block => {
      if (block.type === "table") return renderTableBlock(block.lines);
      return renderTextBlock(block.text);
    }).join("");
  } catch(e) {
    // Fallback: einfaches Escaping, niemals einen Fehler nach außen werfen
    console.error("renderContent error:", e);
    return raw.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\n/g,"<br>");
  }
}

/** Trennt rohen Text in Tabellen-Blöcke und Text-Blöcke */
function splitIntoBlocks(raw) {
  const lines  = raw.split("\n");
  const blocks = [];
  let textAcc  = [];
  let i = 0;

  while (i < lines.length) {
    // Tabelle beginnt wenn aktuelle Zeile Pipes hat UND nächste Zeile eine Trennzeile ist
    if (
      i + 1 < lines.length &&
      /^\|.+\|/.test(lines[i].trim()) &&
      /^\|[\s\-:|]+\|$/.test(lines[i + 1].trim())
    ) {
      // Bisherigen Text-Akkumulator flushen
      if (textAcc.length) { blocks.push({ type: "text", text: textAcc.join("\n") }); textAcc = []; }
      // Alle Zeilen der Tabelle sammeln
      const tableLines = [];
      while (i < lines.length && /^\|/.test(lines[i].trim())) {
        tableLines.push(lines[i].trim());
        i++;
      }
      blocks.push({ type: "table", lines: tableLines });
    } else {
      textAcc.push(lines[i]);
      i++;
    }
  }
  if (textAcc.length) blocks.push({ type: "text", text: textAcc.join("\n") });
  return blocks;
}

/** Rendert einen normalen Text-Block: HTML-escape → Markdown → LaTeX */
function renderTextBlock(text) {
  // LaTeX schützen
  const store = [];
  text = text
    .replace(/\$\$([\s\S]+?)\$\$/g, (_, expr) => { store.push({ mode: true,  expr }); return `\x00LATEX${store.length-1}\x00`; })
    .replace(/\$([^\n$]+?)\$/g,     (_, expr) => { store.push({ mode: false, expr }); return `\x00LATEX${store.length-1}\x00`; });

  // HTML escapen
  text = text.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");

  // Markdown Inline
  text = text
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g,     "<em>$1</em>")
    .replace(/__(.+?)__/g,     "<u>$1</u>")
    .replace(/-&gt;/g,         "→")   // -> zu →
    .replace(/=&gt;/g,         "⇒")   // => zu ⇒
    .replace(/\{(#[0-9a-fA-F]{3,6})\|(.+?)\}/g, '<span style="color:$1">$2</span>'); // {#farbe|Text}

  // Zeilenweise für Listen + Einrücken
  const lines = text.split("\n");
  let html = "";
  let inUl = false;
  let inOl = false;

  const closeList = () => {
    if (inUl) { html += "</ul>"; inUl = false; }
    if (inOl) { html += "</ol>"; inOl = false; }
  };

  lines.forEach(line => {
    // Einrücken: führende Leerzeichen (2 oder 4) → padding
    const indentMatch = line.match(/^(\s+)/);
    const indent = indentMatch ? Math.floor(indentMatch[1].length / 2) : 0;
    const indentStyle = indent > 0 ? ` style="padding-left:${indent * 1.2}em"` : "";

    // Ungeordnete Liste: - item oder * item
    const ulMatch = line.match(/^(\s*)[-*] (.+)/);
    // Geordnete Liste: 1. item
    const olMatch = line.match(/^(\s*)\d+\. (.+)/);

    if (ulMatch) {
      if (inOl) { html += "</ol>"; inOl = false; }
      if (!inUl) { html += `<ul class="md-list">`; inUl = true; }
      html += `<li${indentStyle}>${ulMatch[2]}</li>`;
    } else if (olMatch) {
      if (inUl) { html += "</ul>"; inUl = false; }
      if (!inOl) { html += `<ol class="md-list">`; inOl = true; }
      html += `<li${indentStyle}>${olMatch[2]}</li>`;
    } else {
      closeList();
      html += `<span${indentStyle}>${line}</span><br>`;
    }
  });
  closeList();

  // LaTeX einsetzen
  html = html.replace(/\x00LATEX(\d+)\x00/g, (_, idx) => {
    const { mode, expr } = store[parseInt(idx)];
    try { return katex.renderToString(expr, { displayMode: mode, throwOnError: false }); }
    catch { return mode ? `<code>$$${expr}$$</code>` : `<code>$${expr}$</code>`; }
  });

  return html;
}

/** Rendert einen Tabellen-Block zu HTML */
function renderTableBlock(lines) {
  const header = parseTableRow(lines[0]);
  const align  = lines[1] ? parseAlignRow(lines[1]) : [];
  const rows   = lines.slice(2).map(parseTableRow);

  const cell = (tag, content, i) => {
    const a = align[i] || "left";
    return `<${tag} style="text-align:${a}">${renderTextBlock(content)}</${tag}>`;
  };

  let html = '<div class="md-table-wrap"><table class="md-table"><thead><tr>';
  header.forEach((c, i) => { html += cell("th", c, i); });
  html += "</tr></thead><tbody>";
  rows.forEach(row => {
    html += "<tr>";
    row.forEach((c, i) => { html += cell("td", c, i); });
    html += "</tr>";
  });
  return html + "</tbody></table></div>";
}

function parseTableRow(line) {
  return line.replace(/^\||\|$/g, "").split("|").map(c => c.trim());
}
function parseAlignRow(line) {
  return line.replace(/^\||\|$/g, "").split("|").map(c => {
    c = c.trim();
    if (c.startsWith(":") && c.endsWith(":")) return "center";
    if (c.endsWith(":")) return "right";
    return "left";
  });
}


// ---------- Format-Toolbar ----------

const toolbarColors = {}; // aktive Textfarbe pro Toolbar-ID

const TEXT_COLOR_PRESETS = [
  { label: "Standard", value: null },
  { label: "Rot",      value: "#e03131" },
  { label: "Orange",   value: "#d9480f" },
  { label: "Gelb",     value: "#f59f00" },
  { label: "Grün",     value: "#2f9e44" },
  { label: "Blau",     value: "#1971c2" },
  { label: "Lila",     value: "#7048e8" },
  { label: "Grau",     value: "#868e96" },
];

function bindFormatToolbars() {
  document.querySelectorAll(".format-toolbar").forEach(toolbar => {
    const targetId  = toolbar.dataset.for;
    const toolbarId = targetId || "note-body";
    toolbarColors[toolbarId] = null;

    const getTextarea = () => document.getElementById(targetId || "note-body");

    toolbar.querySelectorAll(".fmt-btn").forEach(btn => {
      btn.addEventListener("mousedown", e => {
        e.preventDefault();
        const ta = getTextarea();
        if (!ta) return;
        if (btn.dataset.fmt === "color") {
          openTextColorPicker(e, toolbarId, ta);
        } else {
          applyFormat(ta, btn.dataset.fmt, toolbarColors[toolbarId]);
        }
      });
    });
  });

  // Tab = einrücken (oder Listeneinzug)
  ["note-body", "fc-front", "fc-back"].forEach(id => {
    const ta = document.getElementById(id);
    if (!ta) return;
    ta.addEventListener("keydown", e => {
      if (e.key === "Tab") {
        e.preventDefault();
        const s    = ta.selectionStart;
        const line = ta.value.lastIndexOf("\n", s - 1) + 1;
        const lineText = ta.value.slice(line, s);
        const isUl = /^(\s*)([-*] )/.test(lineText);
        const isOl = /^(\s*)(\d+\. )/.test(lineText);
        if (isUl || isOl) {
          // Listenpunkt einrücken/ausrücken
          if (e.shiftKey) {
            // Ausrücken: führende 2 Leerzeichen entfernen
            if (ta.value.slice(line, line + 2) === "  ") {
              ta.value = ta.value.slice(0, line) + ta.value.slice(line + 2);
              ta.selectionStart = ta.selectionEnd = Math.max(line, s - 2);
            }
          } else {
            ta.value = ta.value.slice(0, line) + "  " + ta.value.slice(line);
            ta.selectionStart = ta.selectionEnd = s + 2;
          }
        } else {
          // Normales Einrücken
          ta.value = ta.value.slice(0, s) + "  " + ta.value.slice(ta.selectionEnd);
          ta.selectionStart = ta.selectionEnd = s + 2;
        }
      }

      // Enter: Auto-Nummerierung bei geordneten Listen
      if (e.key === "Enter") {
        const s     = ta.selectionStart;
        const line  = ta.value.lastIndexOf("\n", s - 1) + 1;
        const lineText = ta.value.slice(line, s);
        const olMatch = lineText.match(/^(\s*)(\d+)\. (.+)/);
        const ulMatch = lineText.match(/^(\s*)([-*]) (.+)/);
        if (olMatch) {
          e.preventDefault();
          const nextNum  = parseInt(olMatch[2]) + 1;
          const insert   = "\n" + olMatch[1] + nextNum + ". ";
          ta.value = ta.value.slice(0, s) + insert + ta.value.slice(s);
          ta.selectionStart = ta.selectionEnd = s + insert.length;
        } else if (ulMatch) {
          e.preventDefault();
          const insert = "\n" + ulMatch[1] + ulMatch[2] + " ";
          ta.value = ta.value.slice(0, s) + insert + ta.value.slice(s);
          ta.selectionStart = ta.selectionEnd = s + insert.length;
        }
      }
    });
  });

  // Tastaturkürzel — Note UND Karteikarten
  ["note-body", "fc-front", "fc-back"].forEach(id => {
    document.getElementById(id).addEventListener("keydown", e => {
      if (e.ctrlKey || e.metaKey) {
        if (e.key === "b") { e.preventDefault(); applyFormat(e.target, "bold"); }
        if (e.key === "i") { e.preventDefault(); applyFormat(e.target, "italic"); }
        if (e.key === "u") { e.preventDefault(); applyFormat(e.target, "underline"); }
      }
    });
  });
}

function openTextColorPicker(e, toolbarId, textarea) {
  document.getElementById("text-color-popover")?.remove();

  const popover = document.createElement("div");
  popover.id = "text-color-popover";
  popover.className = "color-picker-popover";

  const presetRow = document.createElement("div");
  presetRow.className = "color-preset-row";
  TEXT_COLOR_PRESETS.forEach(({ label, value }) => {
    const dot = document.createElement("button");
    dot.className = "color-dot" + (toolbarColors[toolbarId] === value ? " active" : "");
    dot.title = label;
    dot.style.background = value || "transparent";
    if (!value) dot.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
    dot.addEventListener("click", () => {
      setToolbarColor(toolbarId, value);
      if (value) applyFormat(textarea, "color", value);
      popover.remove();
      textarea.focus();
    });
    presetRow.appendChild(dot);
  });
  popover.appendChild(presetRow);

  const customRow = document.createElement("div");
  customRow.className = "color-custom-row";
  const lbl = document.createElement("span"); lbl.textContent = "Eigene Farbe:";
  const inp = document.createElement("input");
  inp.type = "color";
  inp.value = toolbarColors[toolbarId] || "#e03131";
  inp.addEventListener("change", () => {
    setToolbarColor(toolbarId, inp.value);
    applyFormat(textarea, "color", inp.value);
    popover.remove();
    textarea.focus();
  });
  customRow.appendChild(lbl); customRow.appendChild(inp);
  popover.appendChild(customRow);

  document.body.appendChild(popover);
  const rect = e.target.closest("button").getBoundingClientRect();
  let left = rect.left;
  if (left + 220 > window.innerWidth - 8) left = window.innerWidth - 228;
  popover.style.top  = `${rect.bottom + 6 + window.scrollY}px`;
  popover.style.left = `${Math.max(8, left)}px`;

  // Öffnungszeit merken — Klicks innerhalb von 200ms nach Öffnen ignorieren
  const openedAt = Date.now();
  document.addEventListener("pointerdown", function close(ev) {
    if (Date.now() - openedAt < 200) return;
    if (!popover.contains(ev.target)) {
      popover.remove();
      document.removeEventListener("pointerdown", close);
    }
  });
}

function setToolbarColor(toolbarId, color) {
  toolbarColors[toolbarId] = color;
  const swatchId = toolbarId === "note-body"  ? "note-color-swatch"
                 : toolbarId === "fc-front"   ? "fc-front-color-swatch"
                 : "fc-back-color-swatch";
  const swatch = document.getElementById(swatchId);
  if (swatch) swatch.style.background = color || "transparent";
}

function applyFormat(textarea, fmt, activeColor = null) {
  const start  = textarea.selectionStart;
  const end    = textarea.selectionEnd;
  const sel    = textarea.value.slice(start, end);
  const before = textarea.value.slice(0, start);
  const after  = textarea.value.slice(end);

  // Textfarbe
  if (fmt === "color" && activeColor) {
    const content  = sel || "Text";
    const inserted = `{${activeColor}|${content}}`;
    textarea.value = before + inserted + after;
    textarea.setSelectionRange(start + activeColor.length + 2, start + inserted.length - 1);
    textarea.focus();
    return;
  }

  const formats = {
    "bold":         { wrap: ["**", "**"],     placeholder: "fetter Text" },
    "italic":       { wrap: ["*",  "*"],      placeholder: "kursiver Text" },
    "underline":    { wrap: ["__", "__"],     placeholder: "unterstrichener Text" },
    "latex-inline": { wrap: ["$",  "$"],      placeholder: "E = mc^2" },
    "latex-block":  { wrap: ["$$\n", "\n$$"], placeholder: "\\frac{d}{dx}" },
    "ul":           { wrap: ["", ""],         placeholder: "", linePrefix: "- " },
    "ol":           { wrap: ["", ""],         placeholder: "", linePrefix: "1. " },
  };

  const f = formats[fmt];
  if (!f) return;

  if (f.linePrefix !== undefined) {
    const lines    = (sel || "Listenpunkt").split("\n");
    const prefixed = lines.map((l, i) => fmt === "ol" ? `${i+1}. ${l}` : `- ${l}`).join("\n");
    textarea.value = before + prefixed + after;
    textarea.setSelectionRange(start, start + prefixed.length);
    textarea.focus();
    return;
  }

  const content  = sel || f.placeholder;
  const inserted = f.wrap[0] + content + f.wrap[1];
  textarea.value = before + inserted + after;
  textarea.setSelectionRange(start + f.wrap[0].length, start + f.wrap[0].length + content.length);
  textarea.focus();
}


// ---------- Autosave Drafts ----------
// Separater Key pro Typ+ID damit neue und bestehende Items sich nicht überschreiben

function draftKey(type, id) {
  return `physio_draft_${type}_${id ?? "new"}`;
}

function saveDraft(type, id, data) {
  try { localStorage.setItem(draftKey(type, id), JSON.stringify({ ...data, _ts: Date.now() })); } catch {}
}

function loadDraft(type, id) {
  try {
    const raw = localStorage.getItem(draftKey(type, id));
    if (!raw) return null;
    const d = JSON.parse(raw);
    if (Date.now() - (d._ts || 0) > 4 * 60 * 60 * 1000) { clearDraft(type, id); return null; } // 4h
    return d;
  } catch { return null; }
}

function clearDraft(type, id) {
  localStorage.removeItem(draftKey(type, id));
}

function bindAutosave() {
  // Notiz-Felder
  ["note-title-input", "note-body"].forEach(id => {
    document.getElementById(id).addEventListener("input", () => {
      saveDraft("note", editingItemId, {
        title: document.getElementById("note-title-input").value,
        body:  document.getElementById("note-body").value,
      });
      showDraftIndicator("modal-note");
    });
  });

  // Karteikarten-Felder
  ["fc-front", "fc-back"].forEach(id => {
    document.getElementById(id).addEventListener("input", () => {
      saveDraft("fc", editingItemId, {
        front: document.getElementById("fc-front").value,
        back:  document.getElementById("fc-back").value,
      });
      showDraftIndicator("modal-flashcard");
    });
  });
}

/** Zeigt "● Entwurf" neben dem Modal-Titel */
function showDraftIndicator(modalId) {
  const titleEl = document.querySelector(`#${modalId} .modal-title`);
  if (!titleEl || titleEl.querySelector(".draft-indicator")) return;
  const dot = document.createElement("span");
  dot.className = "draft-indicator";
  dot.title = "Nicht gespeicherter Entwurf";
  dot.textContent = " ●";
  titleEl.appendChild(dot);
}

function hideDraftIndicator(modalId) {
  document.querySelector(`#${modalId} .draft-indicator`)?.remove();
}

function tryRestoreNote(currentId) {
  const draft = loadDraft("note", currentId);
  if (!draft) return;

  // Nur Banner zeigen wenn Draft sich vom aktuellen Stand unterscheidet
  const curTitle = document.getElementById("note-title-input").value;
  const curBody  = document.getElementById("note-body").value;
  if (draft.title === curTitle && draft.body === curBody) return;

  showRestoreBanner("modal-note", () => {
    document.getElementById("note-title-input").value = draft.title || "";
    document.getElementById("note-body").value = draft.body || "";
    showDraftIndicator("modal-note");
  }, () => clearDraft("note", currentId));
}

function tryRestoreFc(currentId) {
  const draft = loadDraft("fc", currentId);
  if (!draft) return;

  const curFront = document.getElementById("fc-front").value;
  const curBack  = document.getElementById("fc-back").value;
  if (draft.front === curFront && draft.back === curBack) return;

  showRestoreBanner("modal-flashcard", () => {
    document.getElementById("fc-front").value = draft.front || "";
    document.getElementById("fc-back").value  = draft.back  || "";
    showDraftIndicator("modal-flashcard");
  }, () => clearDraft("fc", currentId));
}

function showRestoreBanner(modalId, onRestore, onDiscard) {
  const box = document.querySelector(`#${modalId} .modal-box`);
  if (!box || box.querySelector(".draft-banner")) return;
  const banner = document.createElement("div");
  banner.className = "draft-banner";
  banner.innerHTML = `
    <span>↩ Nicht gespeicherter Entwurf gefunden</span>
    <div style="display:flex;gap:6px">
      <button class="draft-restore">Wiederherstellen</button>
      <button class="draft-discard">Verwerfen</button>
    </div>`;
  banner.querySelector(".draft-restore").addEventListener("click", () => { onRestore(); banner.remove(); });
  banner.querySelector(".draft-discard").addEventListener("click", () => { onDiscard(); banner.remove(); });
  box.insertBefore(banner, box.firstChild);
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

// ---------- Kachel verschieben ----------
function makeMoveBtn(item) {
  const btn = document.createElement("button");
  btn.className = "icon-btn move-btn";
  btn.title = "In Ordner verschieben";
  btn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M5 12h14"/><path d="M12 5l7 7-7 7"/></svg>`;
  btn.addEventListener("click", e => { e.stopPropagation(); openMoveDialog(item); });
  return btn;
}

async function openMoveDialog(item) {
  // Alle Ordner im aktuellen Topic laden (außer dem Item selbst wenn es ein Ordner ist)
  const allItems = await Store.getItems(activeTopic, null);
  // Auch Ordner in Unterordnern sammeln
  const allFolders = [];
  async function collectFolders(folderId, depth) {
    const children = await Store.getItems(activeTopic, folderId);
    for (const c of children) {
      if (c.type === "folder" && c.id !== item.id) {
        allFolders.push({ ...c, depth });
        await collectFolders(c.id, depth + 1);
      }
    }
  }
  await collectFolders(null, 0);

  // Altes Modal entfernen
  document.getElementById("modal-move")?.remove();

  const modal = document.createElement("div");
  modal.id = "modal-move";
  modal.className = "modal";

  const box = document.createElement("div");
  box.className = "modal-box";
  box.style.maxWidth = "380px";
  box.innerHTML = `<div class="modal-title">Kachel verschieben</div>
    <div class="move-folder-list"></div>
    <div class="modal-footer">
      <button class="btn-cancel" id="move-cancel">Abbrechen</button>
    </div>`;

  const list = box.querySelector(".move-folder-list");

  // Root-Option
  const rootBtn = document.createElement("button");
  rootBtn.className = "move-folder-option" + (item.folderId === null ? " current" : "");
  rootBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg> Hauptebene`;
  rootBtn.addEventListener("click", async () => {
    await Store.updateItem(activeTopic, item.id, { folderId: null });
    modal.remove(); renderGrid();
  });
  list.appendChild(rootBtn);

  allFolders.forEach(f => {
    const btn = document.createElement("button");
    btn.className = "move-folder-option" + (item.folderId === f.id ? " current" : "");
    btn.style.paddingLeft = `${12 + f.depth * 16}px`;
    btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg> ${escHtml(f.name)}`;
    btn.addEventListener("click", async () => {
      await Store.updateItem(activeTopic, item.id, { folderId: f.id });
      modal.remove(); renderGrid();
    });
    list.appendChild(btn);
  });

  if (allFolders.length === 0 && item.folderId === null) {
    const hint = document.createElement("p");
    hint.style.cssText = "font-size:13px;color:var(--text-muted);padding:8px 0";
    hint.textContent = "Noch keine Ordner vorhanden.";
    list.appendChild(hint);
  }

  box.querySelector("#move-cancel").addEventListener("click", () => modal.remove());
  modal.addEventListener("click", e => { if (e.target === modal) modal.remove(); });
  modal.appendChild(box);
  document.body.appendChild(modal);
}

// ---------- Kachelfarbe ----------
const COLOR_PRESETS = [
  { label: "Keine",  value: null },
  { label: "Grün",   value: "#bbf7d0" },
  { label: "Rot",    value: "#fecaca" },
  { label: "Gelb",   value: "#fef08a" },
  { label: "Blau",   value: "#bfdbfe" },
  { label: "Lila",   value: "#e9d5ff" },
  { label: "Orange", value: "#fed7aa" },
];

function applyCardColor(el, color) {
  if (color) {
    el.style.background       = color;
    el.style.borderColor      = color;
  } else {
    el.style.background       = "";
    el.style.borderColor      = "";
  }
}

function makeColorBtn(item, targetEl) {
  const btn = document.createElement("button");
  btn.className = "icon-btn color-btn";
  btn.title = "Farbe";
  btn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="4" fill="currentColor" stroke="none"/></svg>`;

  btn.addEventListener("click", e => {
    e.stopPropagation();
    openColorPicker(e, item, targetEl);
  });
  return btn;
}

function openColorPicker(e, item, targetEl) {
  // Bestehenden Picker schließen
  document.getElementById("color-picker-popover")?.remove();

  const popover = document.createElement("div");
  popover.id = "color-picker-popover";
  popover.className = "color-picker-popover";

  // Preset-Farben
  const presetRow = document.createElement("div");
  presetRow.className = "color-preset-row";
  COLOR_PRESETS.forEach(({ label, value }) => {
    const dot = document.createElement("button");
    dot.className = "color-dot" + (item.color === value ? " active" : "");
    dot.title = label;
    dot.style.background = value || "transparent";
    if (!value) dot.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
    dot.addEventListener("click", async () => {
      await Store.updateItem(activeTopic, item.id, { color: value });
      item.color = value;
      applyCardColor(targetEl, value);
      popover.remove();
    });
    presetRow.appendChild(dot);
  });
  popover.appendChild(presetRow);

  // Freier Farbwähler
  const customRow = document.createElement("div");
  customRow.className = "color-custom-row";
  const customLabel = document.createElement("span");
  customLabel.textContent = "Eigene Farbe:";
  const colorInput = document.createElement("input");
  colorInput.type = "color";
  colorInput.value = item.color && item.color.startsWith("#") ? item.color : "#ffffff";
  colorInput.addEventListener("input", async () => {
    await Store.updateItem(activeTopic, item.id, { color: colorInput.value });
    item.color = colorInput.value;
    applyCardColor(targetEl, colorInput.value);
  });
  customRow.appendChild(customLabel);
  customRow.appendChild(colorInput);
  popover.appendChild(customRow);

  // Positionieren
  document.body.appendChild(popover);
  const rect = e.target.closest("button").getBoundingClientRect();
  const pw = popover.offsetWidth || 220;
  let left = rect.left;
  if (left + pw > window.innerWidth - 8) left = window.innerWidth - pw - 8;
  popover.style.top  = `${rect.bottom + 6 + window.scrollY}px`;
  popover.style.left = `${left}px`;

  const openedAt = Date.now();
  document.addEventListener("pointerdown", function close(ev) {
    if (Date.now() - openedAt < 200) return;
    if (!popover.contains(ev.target)) { popover.remove(); document.removeEventListener("pointerdown", close); }
  });
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
  card.querySelector(".card-actions").insertBefore(makeMoveBtn(item), card.querySelector(".delete-btn"));
  card.querySelector(".card-actions").insertBefore(makeColorBtn(item, card), card.querySelector(".delete-btn"));
  applyCardColor(card, item.color);
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

  const frontImg = item.frontImage ? `<img class="fc-card-img" src="${item.frontImage}" alt="" />` : "";
  const backImg  = item.backImage  ? `<img class="fc-card-img" src="${item.backImage}"  alt="" />` : "";

  const card = document.createElement("div");
  card.className = "flashcard";
  card.innerHTML = `<div class="flashcard-inner">
    <div class="flashcard-front">
      <div class="fc-label">Frage</div>
      <div class="fc-text">${renderContent(item.front)}</div>
      ${frontImg}
      <div class="fc-hint">Klicken zum Umdrehen</div>
    </div>
    <div class="flashcard-back">
      <div class="fc-label">Antwort</div>
      <div class="fc-text">${renderContent(item.back)}</div>
      ${backImg}
    </div>
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
  actions.insertBefore(makeMoveBtn(item), actions.querySelector(".delete-btn"));
  actions.insertBefore(makeColorBtn(item, card), actions.querySelector(".delete-btn"));
  applyCardColor(card, item.color);

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
  card.querySelector(".card-actions").insertBefore(makeMoveBtn(item), card.querySelector(".delete-btn"));
  card.querySelector(".card-actions").insertBefore(makeColorBtn(item, card), card.querySelector(".delete-btn"));
  applyCardColor(card, item.color);
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
  card.querySelector(".card-actions").insertBefore(makeMoveBtn(item), card.querySelector(".delete-btn"));
  card.querySelector(".card-actions").insertBefore(makeColorBtn(item, card), card.querySelector(".delete-btn"));
  applyCardColor(card, item.color);
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
  bindFcImageUpload();

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
  fcImages = { front: null, back: null };
  document.getElementById("fc-modal-title").textContent = "Neue Karteikarte";
  document.getElementById("fc-front").value = "";
  document.getElementById("fc-back").value = "";
  renderFcImagePreview("front", null);
  renderFcImagePreview("back", null);
  hideDraftIndicator("modal-flashcard");
  openModal("modal-flashcard");
  setTimeout(() => tryRestoreFc(null), 0);
}
function openFlashcardEdit(item) {
  editingItemId = item.id;
  fcImages = { front: item.frontImage || null, back: item.backImage || null };
  document.getElementById("fc-modal-title").textContent = "Karteikarte bearbeiten";
  document.getElementById("fc-front").value = item.front;
  document.getElementById("fc-back").value = item.back;
  renderFcImagePreview("front", fcImages.front);
  renderFcImagePreview("back",  fcImages.back);
  hideDraftIndicator("modal-flashcard");
  openModal("modal-flashcard");
  setTimeout(() => tryRestoreFc(item.id), 0);
}
async function saveFlashcard() {
  const front = document.getElementById("fc-front").value.trim();
  const back  = document.getElementById("fc-back").value.trim();
  if (!front && !back) return;
  const patch = { front, back, frontImage: fcImages.front, backImage: fcImages.back };
  if (editingItemId) await Store.updateItem(activeTopic, editingItemId, patch);
  else await Store.addItem(activeTopic, { type: "flashcard", folderId: activeFolder, ...patch });
  clearDraft("fc", editingItemId);
  hideDraftIndicator("modal-flashcard");
  closeModal("modal-flashcard"); renderGrid();
}

// ---------- Flashcard Bild-Upload ----------
function bindFcImageUpload() {
  ["front", "back"].forEach(side => {
    const btn  = document.getElementById(`fc-${side}-img-btn`);
    const inp  = document.getElementById(`fc-${side}-img-file`);
    const rmv  = document.getElementById(`fc-${side}-img-remove`);

    btn.addEventListener("click", () => inp.click());
    inp.addEventListener("change", () => {
      if (inp.files[0]) readFileAsDataUrl(inp.files[0], url => {
        fcImages[side] = url;
        renderFcImagePreview(side, url);
        inp.value = "";
      });
    });
    rmv.addEventListener("click", () => {
      fcImages[side] = null;
      renderFcImagePreview(side, null);
    });
  });
}

function renderFcImagePreview(side, url) {
  const wrap = document.getElementById(`fc-${side}-img-preview`);
  const img  = document.getElementById(`fc-${side}-img`);
  if (url) {
    img.src = url;
    wrap.classList.remove("hidden");
  } else {
    img.src = "";
    wrap.classList.add("hidden");
  }
}

// ---------- Note modal ----------
function openNoteNew() {
  editingItemId = null;
  noteImages = [];
  document.getElementById("note-modal-title").textContent = "Neue Notiz";
  document.getElementById("note-title-input").value = "";
  document.getElementById("note-body").value = "";
  renderNoteImageList();
  hideDraftIndicator("modal-note");
  openModal("modal-note");
  setTimeout(() => tryRestoreNote(null), 0);
}
function openNoteEdit(item) {
  editingItemId = item.id;
  noteImages = item.images ? item.images.map(i => ({ ...i })) : [];
  document.getElementById("note-modal-title").textContent = "Notiz bearbeiten";
  document.getElementById("note-title-input").value = item.title || "";
  document.getElementById("note-body").value = item.body || "";
  renderNoteImageList();
  hideDraftIndicator("modal-note");
  openModal("modal-note");
  setTimeout(() => tryRestoreNote(item.id), 0);
}
async function saveNote() {
  const title  = document.getElementById("note-title-input").value.trim();
  const body   = document.getElementById("note-body").value.trim();
  if (!body && noteImages.length === 0) return;
  const images = noteImages.slice();
  if (editingItemId) await Store.updateItem(activeTopic, editingItemId, { title, body, images });
  else await Store.addItem(activeTopic, { type: "note", title, body, images, folderId: activeFolder });
  clearDraft("note", editingItemId);
  hideDraftIndicator("modal-note");
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
  const titleEl = document.getElementById("note-view-title");
  titleEl.innerHTML = renderContent(item.title || "Notiz");

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

  // Text
  overlay.querySelector(".fc-zoom-front .fc-text").innerHTML = renderContent(item.front);
  overlay.querySelector(".fc-zoom-back .fc-text").innerHTML  = renderContent(item.back);
  overlay.querySelector(".fc-zoom-hint").textContent = "Klicken zum Umdrehen";

  // Bilder in Zoom
  ["front", "back"].forEach(side => {
    const imgUrl  = side === "front" ? item.frontImage : item.backImage;
    const face    = overlay.querySelector(`.fc-zoom-${side}`);
    // Altes Bild entfernen
    face.querySelector(".fc-zoom-img")?.remove();
    if (imgUrl) {
      const img = document.createElement("img");
      img.className = "fc-zoom-img";
      img.src = imgUrl;
      img.title = "Klicken zum Vergrößern";
      img.addEventListener("click", e => {
        e.stopPropagation();
        document.getElementById("lightbox-img").src = imgUrl;
        document.getElementById("lightbox-caption").textContent = "";
        openModal("lightbox");
      });
      face.appendChild(img);
    }
  });

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
