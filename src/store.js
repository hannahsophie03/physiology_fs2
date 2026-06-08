// ============================================================
//  store.js — Datenpersistenz
//
//  Zwei Modi, automatisch erkannt:
//
//  SERVER-MODUS  (node server.js → http://localhost:3000)
//    → liest/schreibt data.json via API
//    → Änderungen sofort in VS Code sichtbar
//
//  DATEI-MODUS  (index.html direkt im Browser geöffnet)
//    → speichert in localStorage (wie vorher)
//
//  Datenmodell:
//    {
//      [topicId]: {
//        items: [ ...Item ]
//      }
//    }
//
//  Item-Typen:
//    { id, type:"flashcard", folderId, front, back, createdAt }
//    { id, type:"note",      folderId, title, body, createdAt }
//    { id, type:"image",     folderId, title, dataUrl, createdAt }
//    { id, type:"folder",    folderId, name,  createdAt }
// ============================================================

const SERVER_MODE = location.hostname === "localhost" || location.hostname === "127.0.0.1";
const STORAGE_KEY = "physio_data";

const Store = (() => {

  // ---- interner Cache (vermeidet unnötige Netzwerk-Roundtrips) ----
  let _cache = null;

  // ---- Laden ----
  async function _load() {
    if (_cache) return _cache;
    if (SERVER_MODE) {
      try {
        const res  = await fetch("/api/data");
        _cache = await res.json();
      } catch {
        _cache = {};
      }
    } else {
      try { _cache = JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; }
      catch { _cache = {}; }
    }
    return _cache;
  }

  // ---- Speichern ----
  async function _save(data) {
    _cache = data;
    if (SERVER_MODE) {
      try {
        await fetch("/api/data", {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify(data),
        });
      } catch {
        console.error("Speichern fehlgeschlagen — läuft server.js?");
      }
    } else {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    }
  }

  async function _topicData(topicId) {
    const data = await _load();
    if (!data[topicId]) data[topicId] = { items: [] };
    return { data, topic: data[topicId] };
  }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  // ---- Öffentliche API ----
  return {

    isServerMode() { return SERVER_MODE; },

    /** Cache leeren (z.B. nach Import) */
    clearCache() { _cache = null; },

    async getItems(topicId, folderId = null) {
      const { topic } = await _topicData(topicId);
      return topic.items
        .filter(i => (i.folderId ?? null) === folderId)
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    },

    async getItem(topicId, itemId) {
      const { topic } = await _topicData(topicId);
      return topic.items.find(i => i.id === itemId) || null;
    },

    async addItem(topicId, itemData) {
      const { data, topic } = await _topicData(topicId);
      const item = { id: uid(), createdAt: Date.now(), folderId: null, ...itemData };
      topic.items.push(item);
      await _save(data);
      return item;
    },

    async updateItem(topicId, itemId, patch) {
      const { data, topic } = await _topicData(topicId);
      const idx = topic.items.findIndex(i => i.id === itemId);
      if (idx === -1) return;
      topic.items[idx] = { ...topic.items[idx], ...patch };
      await _save(data);
      return topic.items[idx];
    },

    async deleteItem(topicId, itemId) {
      const { data, topic } = await _topicData(topicId);
      const item = topic.items.find(i => i.id === itemId);
      if (!item) return;
      const toDelete = new Set([itemId]);
      if (item.type === "folder") {
        let changed = true;
        while (changed) {
          changed = false;
          topic.items.forEach(i => {
            if (i.folderId && toDelete.has(i.folderId) && !toDelete.has(i.id)) {
              toDelete.add(i.id); changed = true;
            }
          });
        }
      }
      topic.items = topic.items.filter(i => !toDelete.has(i.id));
      await _save(data);
    },

    async stats(topicId) {
      const { topic } = await _topicData(topicId);
      const all = topic.items;
      return {
        flashcards: all.filter(i => i.type === "flashcard").length,
        notes:      all.filter(i => i.type === "note").length,
        images:     all.filter(i => i.type === "image").length,
        folders:    all.filter(i => i.type === "folder").length,
      };
    },

    /** Statistik für einen bestimmten Ordner (inkl. Unterordner) */
    async statsInFolder(topicId, folderId) {
      const { topic } = await _topicData(topicId);
      const all = topic.items;
      // Alle IDs sammeln die zum Ordner gehören (rekursiv)
      const folderIds = new Set([folderId]);
      let changed = true;
      while (changed) {
        changed = false;
        all.forEach(i => {
          if (i.type === "folder" && i.folderId && folderIds.has(i.folderId) && !folderIds.has(i.id)) {
            folderIds.add(i.id); changed = true;
          }
        });
      }
      const inScope = all.filter(i => i.folderId && folderIds.has(i.folderId));
      return {
        flashcards: inScope.filter(i => i.type === "flashcard").length,
        notes:      inScope.filter(i => i.type === "note").length,
        images:     inScope.filter(i => i.type === "image").length,
        folders:    inScope.filter(i => i.type === "folder").length,
      };
    },

    /** Alle Items eines Typs im ganzen Topic (über alle Ordner) */
    async getItemsDeep(topicId, type) {
      const { topic } = await _topicData(topicId);
      return topic.items.filter(i => i.type === type);
    },

    /** Alle Rohdaten lesen (für Backup-Export) */
    async raw() {
      return await _load();
    },

    /** Alle Rohdaten schreiben (für Backup-Import) */
    async rawSet(data) {
      _cache = null;
      await _save(data);
    },

    /** Reihenfolge der Items eines Folders neu setzen */
    async reorderItems(topicId, folderId, orderedIds) {
      const { data, topic } = await _topicData(topicId);
      orderedIds.forEach((id, idx) => {
        const item = topic.items.find(i => i.id === id);
        if (item) item.order = idx;
      });
      await _save(data);
    },
  };
})();
