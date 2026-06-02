// ============================================================
//  store.js — Datenpersistenz via localStorage
//
//  Datenmodell:
//    physio_data = {
//      [topicId]: {
//        items: [ ...Item ],          // alle Items flach gespeichert
//      }
//    }
//
//  Item-Typen:
//    { id, type:"flashcard", folderId, front, back, createdAt }
//    { id, type:"note",      folderId, title, body, createdAt }
//    { id, type:"image",     folderId, title, dataUrl, createdAt }
//    { id, type:"folder",    folderId, name,  createdAt }
//      (folderId = null → root; folderId = id eines Ordners → darin)
// ============================================================

const STORAGE_KEY = "physio_data";

const Store = (() => {

  function _load() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; }
    catch { return {}; }
  }

  function _save(data) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }

  function _topicData(topicId) {
    const data = _load();
    if (!data[topicId]) data[topicId] = { items: [] };
    return { data, topic: data[topicId] };
  }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  // --- Public API ---

  return {
    /** Alle Items eines Topics (optional: gefiltert nach folderId) */
    getItems(topicId, folderId = null) {
      const { topic } = _topicData(topicId);
      return topic.items.filter(i => (i.folderId ?? null) === folderId);
    },

    /** Ein einzelnes Item laden */
    getItem(topicId, itemId) {
      const { topic } = _topicData(topicId);
      return topic.items.find(i => i.id === itemId) || null;
    },

    /** Neues Item anlegen; gibt das Item zurück */
    addItem(topicId, itemData) {
      const { data, topic } = _topicData(topicId);
      const item = { id: uid(), createdAt: Date.now(), folderId: null, ...itemData };
      topic.items.push(item);
      _save(data);
      return item;
    },

    /** Bestehendes Item aktualisieren */
    updateItem(topicId, itemId, patch) {
      const { data, topic } = _topicData(topicId);
      const idx = topic.items.findIndex(i => i.id === itemId);
      if (idx === -1) return;
      topic.items[idx] = { ...topic.items[idx], ...patch };
      _save(data);
      return topic.items[idx];
    },

    /** Item löschen (Ordner: löscht rekursiv alle Kinder) */
    deleteItem(topicId, itemId) {
      const { data, topic } = _topicData(topicId);
      const item = topic.items.find(i => i.id === itemId);
      if (!item) return;
      const toDelete = new Set([itemId]);
      if (item.type === "folder") {
        // Rekursiv Kinder sammeln
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
      _save(data);
    },

    /** Statistik für ein Topic (für Übersicht) */
    stats(topicId) {
      const { topic } = _topicData(topicId);
      const all = topic.items;
      return {
        flashcards: all.filter(i => i.type === "flashcard").length,
        notes:      all.filter(i => i.type === "note").length,
        images:     all.filter(i => i.type === "image").length,
        folders:    all.filter(i => i.type === "folder").length,
      };
    },
  };
})();
