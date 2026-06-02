# Humanphysiologie Tutor — Entwickleranleitung

## Projektstruktur

```
physiologie-tutor/
├── index.html          ← HTML-Gerüst: Nav, Screens, alle Modals
├── ANLEITUNG.md        ← Diese Datei
└── src/
    ├── store.js        ← Datenpersistenz (localStorage)
    ├── app.js          ← Gesamte Anwendungslogik
    └── style.css       ← Alle Styles (Dark Mode inklusive)
```

Kein Build-Schritt, kein npm. Einfach `index.html` in VS Code per
**Live Server** öffnen (Rechtsklick → *Open with Live Server*).

---

## Aufsetzen

1. ZIP entpacken, Ordner in VS Code öffnen
2. Extension **Live Server** (ritwickdey) installieren
3. `index.html` → Rechtsklick → *Open with Live Server*

Daten werden automatisch im Browser gespeichert (`localStorage`).
Kein Server, kein API-Key nötig.

---

## Datenmodell

Alle Daten liegen unter dem `localStorage`-Key `physio_data`:

```json
{
  "muskel": {
    "items": [
      { "id": "abc1", "type": "flashcard", "folderId": null,
        "front": "Was ist eine Sarkomere?", "back": "...", "createdAt": 1234567890 },
      { "id": "abc2", "type": "note",      "folderId": null,
        "title": "Übersicht", "body": "...", "createdAt": 1234567891 },
      { "id": "abc3", "type": "image",     "folderId": null,
        "title": "Gleitfilamenttheorie", "dataUrl": "data:image/...", "createdAt": 1234567892 },
      { "id": "abc4", "type": "folder",    "folderId": null,
        "name": "Kontraktion",            "createdAt": 1234567893 }
    ]
  }
}
```

`folderId: null` → Root-Ebene des Topics.
`folderId: "abc4"` → Item liegt im Ordner mit der ID `abc4`.
Ordner können beliebig tief verschachtelt werden.

---

## Komponenten erweitern

### Neues Thema hinzufügen

In `src/app.js` das Array `TOPICS` am Anfang der Datei erweitern:

```js
const TOPICS = [
  { id: "zellphysio", label: "Zellphysiologie & Homöostase" },
  // ...
  { id: "pharmako", label: "Pharmakologie" },  // ← neu
];
```

Das war's — der Nav-Button und die Datenspeicherung funktionieren automatisch.

---

### Neuen Inhaltstyp hinzufügen (z.B. "Formel")

Schritte am Beispiel eines Formel-Typs:

#### 1. Modal in `index.html`

```html
<div id="modal-formel" class="modal hidden">
  <div class="modal-box">
    <div class="modal-title">Neue Formel</div>
    <input id="formel-name-input" placeholder="Name der Formel…" />
    <textarea id="formel-text" placeholder="Formel oder Gleichung…" rows="3"></textarea>
    <div class="modal-footer">
      <button class="modal-close" id="formel-cancel">Abbrechen</button>
      <button class="btn-save" id="formel-save">Speichern</button>
    </div>
  </div>
</div>
```

#### 2. Button im Add-Chooser (`index.html`)

```html
<button class="add-type-btn" data-type="formel">
  <svg ...><!-- Icon --></svg>
  Formel
</button>
```

#### 3. Modal öffnen in `src/app.js` — in `bindModals()`

```js
if (type === "formel") openFormelModal();
```

Und die Funktion ergänzen:

```js
function openFormelModal() {
  document.getElementById("formel-name-input").value = "";
  document.getElementById("formel-text").value = "";
  openModal("modal-formel");
}
```

#### 4. Speichern

```js
document.getElementById("formel-cancel").addEventListener("click", () => closeModal("modal-formel"));
document.getElementById("formel-save").addEventListener("click", () => {
  const name = document.getElementById("formel-name-input").value.trim();
  const text = document.getElementById("formel-text").value.trim();
  if (!name || !text) return;
  Store.addItem(activeTopic, { type: "formel", name, text, folderId: activeFolder });
  closeModal("modal-formel");
  renderGrid();
});
```

#### 5. Card rendern — in `makeCard()`

```js
if (item.type === "formel") return makeFormelCard(item);
```

```js
function makeFormelCard(item) {
  const card = document.createElement("div");
  card.className = "card formel-card";
  card.innerHTML = `
    <div class="card-title">${escHtml(item.name)}</div>
    <div class="formel-text">${escHtml(item.text)}</div>
    <div class="card-actions">
      <button class="icon-btn delete-btn" title="Löschen">✕</button>
    </div>
  `;
  card.querySelector(".delete-btn").addEventListener("click", () => {
    Store.deleteItem(activeTopic, item.id);
    renderGrid();
  });
  return card;
}
```

#### 6. Stil in `src/style.css`

```css
.formel-text {
  font-family: monospace;
  font-size: 15px;
  color: var(--accent);
  margin-top: 6px;
}
```

---

### Karteikarten-Lernmodus ergänzen

Ein möglicher Startpunkt — Button auf der Topic-Seite, der alle Karten des Topics
nacheinander anzeigt und per Tastendruck (Leertaste = umdrehen, → = weiter) durchgeht:

```js
// In app.js
function startLearnMode() {
  const cards = Store.getItems(activeTopic, null)
    .filter(i => i.type === "flashcard");
  if (!cards.length) return alert("Keine Karteikarten vorhanden.");
  let idx = 0;

  // Overlay aufbauen, Karten durchblättern, ...
  // (eigene Implementierung)
}
```

---

### Styles ändern

Alle Farben und Abstände stehen als CSS-Variablen am Anfang von `src/style.css`:

```css
:root {
  --accent: #3b5bdb;    /* Akzentfarbe (Buttons, Links) */
  --bg:     #ffffff;    /* Hintergrund */
  /* ... */
}
```

Dark Mode wird automatisch per `@media (prefers-color-scheme: dark)` gesteuert.

---

## Datenmigration / Export

Da alles in `localStorage` liegt, kannst du die Daten so exportieren:

```js
// In der Browser-Konsole (F12):
copy(localStorage.getItem("physio_data"))
// → Clipboard enthält alle Daten als JSON
```

Und so importieren:

```js
localStorage.setItem("physio_data", '{ ... dein JSON ... }')
location.reload()
```

---

## Häufige Fehler

| Problem | Lösung |
|---------|--------|
| Seite lädt, aber Klicks tun nichts | F12 → Console → Fehlermeldung nachschauen |
| Daten weg nach Browser-Wechsel | `localStorage` ist pro Browser/Profil getrennt |
| Bilder sehr groß → Seite langsam | Vor dem Upload in einem Tool komprimieren (z.B. squoosh.app) |
| Dark Mode zeigt weißen Text auf weißem Grund | CSS-Variable `--bg` im Dark-Mode-Block prüfen |
