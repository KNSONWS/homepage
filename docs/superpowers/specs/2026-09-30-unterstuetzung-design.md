# Unterstützung bei Arbeitsblättern + 15-Minuten-Zeiten – Konzept

Stand 2026-09-30, freigegeben im Gespräch (Abschnitte 1–4).

## Ziel

Wer bei einem Arbeitsblatt eines Kollegen mitgeholfen hat, wird als **Unterstützung** eingetragen:
Person und Tätigkeit. Die Person, die das Arbeitsblatt angelegt hat, behält 100 % der Zeit; jede
unterstützende Person bekommt zusätzlich **50 % der Arbeitszeit, aufgerundet auf volle 15 Minuten**.
Die Unterstützungszeit wird dem Kunden berechnet und im Kundenportal einzeln ausgewiesen.

Gleichzeitig werden Arbeitszeiten **überall nur noch in 15-Minuten-Schritten** erfasst. Das hebt die
Entscheidung vom 2026-09-26 („ganze Minuten, keine 15er-Schritte“) auf.

Die Verträge (Abo-Bedingungen, AGB) halten Rundung und Unterstützung fest.

Nicht im Umfang: Auswertung der Stunden je Mitarbeiter, Umrechnung alter Arbeitsblätter,
Rechnungserstellung.

## Rechenregel

```
supportMinutes(totalTime) = ceil(totalTime / 2 / 15) * 15     // 0 bei totalTime <= 0
worksheetMinutes(ws)      = totalTime + Anzahl Unterstützer * supportMinutes(totalTime)
```

Beispiele: 15 → 15, 30 → 15, 45 → 30, 60 → 30, 75 → 45, 70 (alt) → 45.
Kommentare und Git-Pushs ohne nachgetragene Zeit haben `totalTime` 0, also auch 0 Unterstützung.

Die Regel steht in beiden Systemen (WOMS und Portal) mit denselben Testfällen. Die Minuten der
Unterstützung werden **nie gespeichert**, sondern immer aus `totalTime` berechnet. Ändert sich die
Arbeitszeit, stimmt die Unterstützung automatisch.

## Datenmodell

Appwrite `woms-database`, Collection `worksheets`, neues Attribut:

- `supporters` – String, nicht Pflicht, Größe 4000, JSON-Array:
  `[{ "employeeId": "<Appwrite-User-ID>", "name": "Andrej Stevanovski", "task": "Farbkonzept" }]`

Regeln: `task` ist Pflicht (1–200 Zeichen, getrimmt). Jede `employeeId` höchstens einmal. Die Person,
die das Arbeitsblatt angelegt hat, darf nicht als Unterstützung stehen (bei Git-Pushs: der Mitarbeiter,
dem der Push gehört, siehe `isWorksheetCreator`). `name` wird beim Eintragen gespeichert, damit die
Zeile auch nach dem Löschen eines Mitarbeiters lesbar bleibt.

Das Attribut legt ein Skript `scripts/setup-supporters.mjs` an (idempotent). Der Nutzer führt es aus,
weil Claude den Appwrite-Schlüssel nicht verwenden darf.

## WOMS (Ticketsystem)

### 15-Minuten-Schritte

Betroffen: `CreateWorksheetModal` (neues Arbeitsblatt), `WorksheetTimesModal` („Zeiten bearbeiten“ und
„Zeit nachtragen“ bei Git).

- Das Feld „Arbeitszeit“ wird eine Auswahl: 15 min, 30 min, 45 min, 1 h, 1 h 15 … bis 12 h (48 Werte).
  Kein freies Eintippen mehr.
- Beginn und Ende bleiben freie Uhrzeiten (bei Git ist das Ende die Uhrzeit des Pushs). Die
  automatisch berechnete Zeit (`minutesBetween`) wird auf den nächsten 15-Minuten-Schritt
  **aufgerundet**; danach kann ein anderer Wert gewählt werden. Dauer 0 → 15 min vorausgewählt.
- Hat ein altes Arbeitsblatt eine Zeit außerhalb des Rasters (z. B. 70), ist beim Bearbeiten der
  nächsthöhere Schritt (75) vorausgewählt.
- Beim Speichern wird geprüft, dass `totalTime` ein positives Vielfaches von 15 ist (außer bei
  „Nur Kommentar“, dort 0).
- `useWorksheets.createWorksheet` rechnet eine fehlende Zeit ebenfalls aufgerundet.

### Unterstützung eintragen

**Person, die das Arbeitsblatt angelegt hat** (`canEditWorksheetTimes`): im Formular „Zeiten
bearbeiten“ und beim neuen Arbeitsblatt der Haken **„Unterstützung“**. Darunter Zeilen mit
*Mitarbeiter* (Auswahl aus `employees`, ohne sich selbst und ohne schon gewählte) und *Wobei?*
(Pflichttext), „+ weitere Person“, Entfernen je Zeile. Haken aus = Liste leeren.

**Alle anderen Mitarbeiter:** bei fremden Arbeitsblättern mit Arbeitszeit der Knopf
**„Ich habe unterstützt“**. Kleines Formular nur mit *Wobei?*. Ist man schon eingetragen, heißt der
Knopf „Meine Unterstützung bearbeiten“ und man kann die Tätigkeit ändern oder den Eintrag entfernen.
Andere Einträge und die Zeiten sind nicht änderbar.

Neue Hilfen in `lib/ticketForm.js` (oder `lib/support.js`): `supportMinutes`, `worksheetMinutes`,
`parseSupporters` (fehlertolerant, kaputtes JSON → leere Liste), `canAddOwnSupport(ws, user, employee)`
(nicht Ersteller, Arbeitsblatt hat Arbeitszeit), `upsertOwnSupport`, `removeOwnSupport`.

Unterstützung ist nur möglich bei Arbeitsblättern mit Arbeitszeit: nicht bei reinen Kommentaren, bei
Git-Pushs erst nach „Zeit nachtragen“.

Speichern: `updateWorksheet` patcht `{ supporters }`. „Ich habe unterstützt“ liest das Dokument
vorher frisch und schreibt nur den eigenen Eintrag um, damit gleichzeitige Einträge anderer nicht
überschrieben werden.

Berechtigungen: wie bisher nur in der Oberfläche durchgesetzt (die Collection erlaubt Update für
Benutzer). Keine Änderung an den Appwrite-Rechten.

### Anzeige

- `WorksheetList`: unter dem Arbeitsblatt je Unterstützung
  „↳ Unterstützung Andrej · Farbkonzept · 30 min“.
- `WorksheetSummary` „Arbeitszeit gesamt“ und `useWorksheets` Summen verwenden `worksheetMinutes`.
- Der Abo-Haken („+ Abo“, `countsToPlan`) gilt für das ganze Arbeitsblatt einschließlich Unterstützung.

## Kundenportal

- Gleiche Rechenregel als `server/services/worksheetMinutes.js` (oder vorhandenes Modul) mit
  `supportMinutes`, `worksheetMinutes`, `parseSupporters`. Kaputtes JSON → Eintrag überspringen und
  loggen, nie Absturz.
- **Stundenkonto** (`hourLedger.js`): Verbrauch eines Abo-Arbeitsblatts = `worksheetMinutes(ws)`
  statt `totalTime`. Die Zeile im Verlauf bekommt den Zusatz „inkl. 30 min Unterstützung“.
- **„Arbeiten am Projekt“** (`customerProjectView.js`, `public/app.js`): jeder Eintrag bekommt
  `supports: [{ name, task, minutes }]`, dargestellt als eigene Zeilen unter dem Schritt:
  „↳ Unterstützung Andrej: Farbkonzept · 30 min“. Werden mehrere Git-Pushs eines Tages zu
  „Website aktualisiert“ zusammengefasst, hängen alle Unterstützungen unter diesem Eintrag.
- **Gesamtzeit oben:** im Kopf der Projektdetails (neben Auftragsnummer und Status) die Zeile
  „Arbeitszeit gesamt: 4 h 30 min“ = Summe aller Schritte inkl. Unterstützung. Ohne Auftrag steht sie
  oben im Abschnitt „Arbeiten am Projekt“. Bei 0 wird sie nicht gezeigt.
- `customerActivity.js` gibt `supporters` mit weiter, wo `totalTime` weitergegeben wird.
- **Push-Zeitmail** (Spec af7ecce, noch nicht gebaut): „andere Zeit“ nur in 15-Minuten-Schritten;
  wird in jener Spec nachgetragen.

## Verträge

Stand heute: Abo-Bedingungen Version 4 (live seit 2026-09-30) § 4 enthält schon „aufgerundet auf volle
15 Minuten“ / „in Schritten von 15 Minuten“, aber nichts zur Unterstützung. AGB § 9 sagt nur
„Die Vergütung ergibt sich aus dem Angebot“.

- **Abo-Bedingungen Version 5**, § 4 neuer Satz nach der Rundungsregel (Entwurf):
  „Wirkt an einem Arbeitsschritt eine weitere Person unterstützend mit, etwa bei Gestaltung,
  Abstimmung oder Prüfung, rechnen wir für sie die Hälfte der Arbeitszeit dieses Arbeitsschritts an,
  aufgerundet auf volle 15 Minuten; bei mehreren unterstützenden Personen gilt das für jede von ihnen.
  Im Kundenportal weisen wir jeden Arbeitsschritt mit seiner Arbeitszeit und jede Unterstützung mit
  Person, Tätigkeit und angerechneter Zeit einzeln aus.“
- **AGB § 9** neuer Absatz 2, nur für Abrechnung nach Aufwand (Festpreis-Angebote unberührt), Regel
  vollständig ausgeschrieben (kein Verweis auf die Abo-Bedingungen):
  „Wird nach Aufwand abgerechnet, erfassen wir die Arbeitszeit je Arbeitsschritt in Schritten von
  15 Minuten; angefangene 15 Minuten runden wir auf. Wirkt eine weitere Person unterstützend mit,
  rechnen wir für sie die Hälfte der Arbeitszeit des Arbeitsschritts an, aufgerundet auf volle
  15 Minuten; bei mehreren unterstützenden Personen gilt das für jede. Jeder Arbeitsschritt und jede
  Unterstützung ist im Kundenportal einsehbar.“
  Wird mit dem offenen § 11-Haftungsentwurf (webklar.com f40e889, fix/agb-haftung) zu **einer** neuen
  AGB-Version gebündelt.
- Alle Stellen, die die Texte wiederholen (PDF-Anhang der Vertragsmails, `vertragsunterlagen/`,
  Kalkulation, Portal-Texte), werden abgeglichen. Beide Texte kommen in WOMS „Rechtliches“ als neue
  Version.
- Laufende Abos bleiben auf ihrer Version. Einschätzung (keine Rechtsberatung): Version 4 rechnet die
  „tatsächlich aufgewendete Zeit“ ab; bei zwei Personen fällt mehr Zeit an, als mit 50 % berechnet
  wird, die Unterstützung ist also gedeckt.
- Die endgültigen Texte legt Claude dem Nutzer vor dem Livegang einzeln zur Freigabe vor.

## Alte Daten und Fehlerfälle

- Alte Arbeitsblätter bleiben unverändert (keine Massen-Umrechnung); 70 Minuten bleiben 70 Minuten,
  bis jemand das Blatt bearbeitet.
- Ohne `supporters` = keine Unterstützung.
- Gelöschter Mitarbeiter: gespeicherter Name bleibt, Zeile wird weiter gezeigt und berechnet.
- Doppelte Person / Ersteller als Unterstützung: Oberfläche verhindert es; beim Lesen werden Duplikate
  ignoriert.
- Arbeitszeit 0 oder „Nur Kommentar“: Unterstützung zählt 0 (Einträge bleiben gespeichert).

## Livegang (Reihenfolge)

1. Nutzer führt `scripts/setup-supporters.mjs` aus (Attribut `supporters`).
2. Kundenportal live (Push `main`), damit keine Unterstützung eingetragen werden kann, die der Kunde
   nicht sieht.
3. WOMS live (Push `feature/unterstuetzung:test`).
4. Verträge: Abo-Bedingungen v5 (Portal) und AGB (webklar.com) nach Freigabe der Texte; Versionen in
   „Rechtliches“ eintragen.

Nichts wird ohne das OK des Nutzers gepusht.

## Tests

- Rechenregel in beiden Systemen mit denselben Fällen (15, 30, 45, 60, 75, 70, 0, Kommentar).
- WOMS: Unit-Tests (`npm test`) für Rechnung, `parseSupporters`, Berechtigungen
  (`canAddOwnSupport`, Ersteller/Nicht-Ersteller, Git-Push), eigener Eintrag ändern/entfernen.
  Playwright mit nachgebautem Appwrite: 15-Minuten-Auswahl und Aufrunden, Haken „Unterstützung“ mit
  zwei Personen, „Ich habe unterstützt“, Anzeige in Liste und Summe.
- Portal: Tests für `customerWorkEntries` (Unterstützungs-Zeilen, zusammengefasste Git-Tage),
  Gesamtzeit, Stundenkonto mit Unterstützung, kaputtes JSON.
- Vor dem Livegang: Build wie beim Deploy (`docker run node:20-alpine`), Blick auf echte Daten nur
  lesend im Chrome des Nutzers.
