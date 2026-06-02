// ============================================================
//  config.js — Hier kannst du alles anpassen!
//
//  1. Deinen Anthropic API Key eintragen (s. ANLEITUNG.md)
//  2. Neue Modi hinzufügen oder bestehende umbenennen
//  3. Neue Schnelleinstieg-Themen ergänzen
// ============================================================

const CONFIG = {

  // ----------------------------------------------------------
  //  API KEY — hier eintragen (string)
  //  Hol dir einen Key unter: https://console.anthropic.com
  // ----------------------------------------------------------
  API_KEY: "sk-ant-DEIN-KEY-HIER",


  // ----------------------------------------------------------
  //  MODI
  //  Jeder Eintrag ist ein Modus-Button oben in der App.
  //
  //  id:          interner Name (kein Leerzeichen)
  //  label:       Text auf dem Button
  //  placeholder: Platzhaltertext im Eingabefeld
  //  systemPrompt: Anweisung an Claude für diesen Modus
  // ----------------------------------------------------------
  MODES: [
    {
      id: "explain",
      label: "Erklären",
      placeholder: 'Thema eingeben, z.B. "Aktionspotenzial"',
      systemPrompt: `Du bist ein freundlicher Humanphysiologie-Tutor für Biologie-Studierende.
Erkläre das angefragte Thema klar, strukturiert und lernfreundlich.
Verwende Analogien wenn hilfreich.
Beschreibe auch wichtige Abbildungen/Diagramme verbal, da der Studierende keinen Drucker hat.
Antworte auf Deutsch. Halte dich unter 350 Wörter.`,
    },
    {
      id: "quiz",
      label: "Übungsfragen",
      placeholder: "Thema für Übungsfragen eingeben…",
      systemPrompt: `Du bist ein Humanphysiologie-Tutor.
Erstelle 3 Übungsfragen (Mix aus Multiple Choice und offene Fragen) zum angegebenen Thema,
wie sie in einer Uni-Klausur vorkommen könnten.
Gib danach die Lösungen mit kurzer Begründung an. Antworte auf Deutsch.`,
    },
    {
      id: "figure",
      label: "Abbildung beschreiben",
      placeholder: "Abbildung beschreiben lassen, z.B. "Frank-Starling-Kurve"",
      systemPrompt: `Du bist ein Humanphysiologie-Tutor.
Der Studierende kann Abbildungen aus dem Skript nicht drucken.
Beschreibe die typische Standardabbildung zum angegebenen Thema sehr detailliert:
was ist zu sehen, welche Achsen/Strukturen, welche Pfeile/Kurven, was bedeuten sie.
So dass der Studierende sich die Abbildung vorstellen und selbst zeichnen kann.
Antworte auf Deutsch.`,
    },
    {
      id: "compare",
      label: "Vergleichen",
      placeholder: 'z.B. "sympathisches vs. parasympathisches Nervensystem"',
      systemPrompt: `Du bist ein Humanphysiologie-Tutor.
Vergleiche die angegebenen Konzepte/Strukturen tabellarisch und erkläre
die wichtigsten Unterschiede und Gemeinsamkeiten.
Antworte auf Deutsch. Halte dich unter 350 Wörter.`,
    },

    // ----------------------------------------------------------
    //  NEUEN MODUS HINZUFÜGEN — einfach diesen Block kopieren
    //  und anpassen, dann die geschweifte Klammer nicht vergessen:
    // ----------------------------------------------------------
    // {
    //   id: "mnemonic",
    //   label: "Merksatz",
    //   placeholder: "Thema eingeben…",
    //   systemPrompt: `Erstelle einen einprägsamen Merksatz oder eine Eselsbrücke
    //     für das angegebene Thema aus der Humanphysiologie. Antworte auf Deutsch.`,
    // },
  ],


  // ----------------------------------------------------------
  //  SCHNELLEINSTIEG-CHIPS
  //  Einfach Strings ergänzen oder entfernen.
  // ----------------------------------------------------------
  QUICK_TOPICS: [
    "Aktionspotenzial",
    "Herzkreislauf",
    "Atemregulation",
    "Hormonregulation",
    "Niere & Osmoregulation",
    "Muskelkontraktion",
    "Blutgerinnung",
    "Verdauung",
    // Weitere Themen einfach hier ergänzen:
    // "Immunsystem",
    // "Thermoregulation",
  ],


  // ----------------------------------------------------------
  //  MODELL & ANTWORTLÄNGE — normalerweise nicht nötig anzupassen
  // ----------------------------------------------------------
  MODEL: "claude-sonnet-4-20250514",
  MAX_TOKENS: 1000,
};
