// ============================================================
//  store.js — Datenpersistenz
//
//  Datenmodell:
//  {
//    _subjects: [
//      { id, name, topics: [{id, label}] }
//    ],
//    [topicId]: { items: [...] }   ← unverändert
//  }
//
//  Migration: Bestehendes physio_data ohne _subjects bekommt
//  automatisch ein "Humanphysiologie"-Fach mit den 13 festen Topics.
// ============================================================

const SERVER_MODE = location.hostname === "localhost" || location.hostname === "127.0.0.1";
const STORAGE_KEY = "physio_data";

const DEFAULT_PHYSIO_TOPICS = [
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

const Store = (() => {
  let _cache = null;

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  async function _load() {
    if (_cache) return _cache;
    let data = {};
    if (SERVER_MODE) {
      try { const res = await fetch("/api/data"); data = await res.json(); }
      catch { data = {}; }
    } else {
      try { data = JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; }
      catch { data = {}; }
    }
    // Migration: kein _subjects → Humanphysiologie-Fach anlegen
    if (!data._subjects) {
      data._subjects = [{
        id: "humanphysio",
        name: "Humanphysiologie",
        topics: DEFAULT_PHYSIO_TOPICS.map(t => ({ id: t.id, label: t.label })),
      }];
      await _persist(data);
    }
    _cache = data;
    return _cache;
  }

  async function _persist(data) {
    _cache = data;
    if (SERVER_MODE) {
      try {
        await fetch("/api/data", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        });
      } catch { console.error("Speichern fehlgeschlagen — läuft server.js?"); }
    } else {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    }
  }

  async function _topicData(topicId) {
    const data = await _load();
    if (!data[topicId]) data[topicId] = { items: [] };
    return { data, topic: data[topicId] };
  }

  return {
    isServerMode() { return SERVER_MODE; },
    clearCache() { _cache = null; },

    // ---- Fächer ----

    async getSubjects() {
      const data = await _load();
      return data._subjects || [];
    },

    async addSubject(name) {
      const data = await _load();
      const subject = { id: uid(), name, topics: [] };
      data._subjects.push(subject);
      await _persist(data);
      return subject;
    },

    async renameSubject(subjectId, name) {
      const data = await _load();
      const s = data._subjects.find(s => s.id === subjectId);
      if (s) { s.name = name; await _persist(data); }
    },

    async deleteSubject(subjectId) {
      const data = await _load();
      const s = data._subjects.find(s => s.id === subjectId);
      if (s) {
        // Topic-Daten löschen
        s.topics.forEach(t => { delete data[t.id]; });
        data._subjects = data._subjects.filter(s => s.id !== subjectId);
        await _persist(data);
      }
    },

    // ---- Topics eines Fachs ----

    async getTopics(subjectId) {
      const data = await _load();
      const s = data._subjects.find(s => s.id === subjectId);
      return s ? s.topics : [];
    },

    async addTopic(subjectId, label) {
      const data = await _load();
      const s = data._subjects.find(s => s.id === subjectId);
      if (!s) return null;
      const topic = { id: uid(), label };
      s.topics.push(topic);
      await _persist(data);
      return topic;
    },

    async renameTopic(subjectId, topicId, label) {
      const data = await _load();
      const s = data._subjects.find(s => s.id === subjectId);
      if (!s) return;
      const t = s.topics.find(t => t.id === topicId);
      if (t) { t.label = label; await _persist(data); }
    },

    async deleteTopic(subjectId, topicId) {
      const data = await _load();
      const s = data._subjects.find(s => s.id === subjectId);
      if (!s) return;
      s.topics = s.topics.filter(t => t.id !== topicId);
      delete data[topicId];
      await _persist(data);
    },

    // ---- Items (unverändert) ----

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
      await _persist(data);
      return item;
    },

    async updateItem(topicId, itemId, patch) {
      const { data, topic } = await _topicData(topicId);
      const idx = topic.items.findIndex(i => i.id === itemId);
      if (idx === -1) return;
      topic.items[idx] = { ...topic.items[idx], ...patch };
      await _persist(data);
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
      await _persist(data);
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

    async statsInFolder(topicId, folderId) {
      const { topic } = await _topicData(topicId);
      const all = topic.items;
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

    async getItemsDeep(topicId, type) {
      const { topic } = await _topicData(topicId);
      return topic.items.filter(i => i.type === type);
    },

    async raw() { return await _load(); },

    async rawSet(data) {
      _cache = null;
      await _persist(data);
    },

    async reorderItems(topicId, folderId, orderedIds) {
      const { data, topic } = await _topicData(topicId);
      orderedIds.forEach((id, idx) => {
        const item = topic.items.find(i => i.id === id);
        if (item) item.order = idx;
      });
      await _persist(data);
    },
  };
})();
