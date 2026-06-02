# Humanphysiologie Tutor — Anleitung

## Projektstruktur

```
physiologie-tutor/
├── index.html       ← HTML-Gerüst
├── server.js        ← Node.js Server (Option B)
├── data.json        ← Datei, die du in VS Code live siehst
├── ANLEITUNG.md     ← Diese Datei
└── src/
    ├── store.js     ← Datenpersistenz (erkennt Modus automatisch)
    ├── app.js       ← Anwendungslogik
    └── style.css    ← Styles
```

---

## Zwei Modi

### Modus A — Direkt im Browser (kein Server)
Einfach `index.html` per Doppelklick öffnen.
Daten landen in `localStorage`. Kein Node.js nötig.

### Modus B — Node.js Server (Daten live in VS Code sehen)
Daten werden in `data.json` geschrieben — die du in VS Code
offen haben kannst und die sich bei jedem Klick aktualisiert.

---

## Modus B aufsetzen

### Schritt 1 — Node.js installieren (einmalig)
Falls noch nicht vorhanden: https://nodejs.org → LTS-Version herunterladen

Prüfen ob installiert:
```
node --version
```

### Schritt 2 — Server starten
Im Terminal (VS Code: Strg+Ö oder Terminal → Neues Terminal):
```
cd pfad/zum/ordner/physiologie-tutor
node server.js
```

Du siehst:
```
  🚀 Physiologie Tutor läuft!
  → http://localhost:3000
  → Daten live in: data.json
```

### Schritt 3 — Im Browser öffnen
http://localhost:3000

Oben links siehst du **● Server** — das bestätigt, dass der
Server-Modus aktiv ist und Daten in data.json geschrieben werden.

### Schritt 4 — data.json in VS Code öffnen
`data.json` im Explorer öffnen. Nach jedem Speichern in der App
aktualisiert sich die Datei. VS Code zeigt Änderungen automatisch an
(ggf. einmal in die Datei klicken damit sie neu lädt).

**Tipp:** Mit der Extension **Prettier** wird das JSON automatisch
formatiert und ist gut lesbar.

### Server stoppen
Im Terminal: **Strg+C**

---

## Inhalt anpassen

### Neues Thema hinzufügen
In `src/app.js` das Array `TOPICS` erweitern:
```js
{ id: "pharmako", label: "Pharmakologie" },
```

### Neuen Inhaltstyp (z.B. Formel)
Siehe ausführliche Anleitung im ursprünglichen ANLEITUNG.md.

### Farben ändern
In `src/style.css` die CSS-Variablen am Anfang:
```css
:root {
  --accent: #3b5bdb;  /* Akzentfarbe */
  --bg: #ffffff;      /* Hintergrund */
}
```

---

## Häufige Fehler

| Problem | Lösung |
|---------|--------|
| `node: command not found` | Node.js installieren (nodejs.org) |
| `EADDRINUSE` beim Serverstart | Port 3000 belegt → in server.js `PORT = 3001` setzen |
| Seite lädt nicht | Sicherstellen dass `node server.js` läuft, dann http://localhost:3000 |
| data.json aktualisiert sich nicht | Prüfen ob `● Server` oben links angezeigt wird |
| Daten weg nach Browser-Wechsel (Modus A) | localStorage ist pro Browser getrennt — Backup nutzen |
