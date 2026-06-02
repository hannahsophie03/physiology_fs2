// ============================================================
//  server.js — Lokaler Entwicklungsserver
//
//  Start:  node server.js
//  Öffne:  http://localhost:3000
//
//  Daten werden in data.json im selben Ordner gespeichert.
//  Diese Datei kannst du in VS Code live beobachten.
// ============================================================

const http = require("http");
const fs   = require("fs");
const path = require("path");

const PORT      = 3000;
const DATA_FILE = path.join(__dirname, "data.json");
const ROOT      = __dirname;

// data.json anlegen falls nicht vorhanden
if (!fs.existsSync(DATA_FILE)) {
  fs.writeFileSync(DATA_FILE, "{}", "utf8");
  console.log("📄 data.json angelegt.");
}

// MIME-Typen
const MIME = {
  ".html": "text/html",
  ".js":   "text/javascript",
  ".css":  "text/css",
  ".json": "application/json",
  ".png":  "image/png",
  ".jpg":  "image/jpeg",
  ".svg":  "image/svg+xml",
};

const server = http.createServer((req, res) => {
  const url    = req.url;
  const method = req.method;

  // --- API: Daten lesen ---
  if (method === "GET" && url === "/api/data") {
    try {
      const data = fs.readFileSync(DATA_FILE, "utf8");
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(data);
    } catch {
      res.writeHead(500); res.end("Lesefehler");
    }
    return;
  }

  // --- API: Daten schreiben ---
  if (method === "POST" && url === "/api/data") {
    let body = "";
    req.on("data", chunk => body += chunk);
    req.on("end", () => {
      try {
        // Validieren
        JSON.parse(body);
        // Hübsch formatiert speichern
        const pretty = JSON.stringify(JSON.parse(body), null, 2);
        fs.writeFileSync(DATA_FILE, pretty, "utf8");
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end('{"ok":true}');
      } catch {
        res.writeHead(400); res.end("Ungültiges JSON");
      }
    });
    return;
  }

  // --- Statische Dateien ausliefern ---
  let filePath = path.join(ROOT, url === "/" ? "index.html" : url);

  // Sicherheitscheck: kein Zugriff außerhalb des Projektordners
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403); res.end("Forbidden"); return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404); res.end("Nicht gefunden: " + url); return;
    }
    const ext  = path.extname(filePath);
    const mime = MIME[ext] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": mime });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log("");
  console.log("  🚀 Physiologie Tutor läuft!");
  console.log(`  → http://localhost:${PORT}`);
  console.log(`  → Daten live in: data.json`);
  console.log("");
  console.log("  Zum Beenden: Strg+C");
  console.log("");
});
