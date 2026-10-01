# WOMS „Rechtliches“ – Konzept

Stand 2026-09-30, freigegeben im Gespräch (Umfang A, Rolle „Archiv + Überblick“, Anbieter mit Fristen).

## Ziel

Ein interner Menüpunkt **Rechtliches** (`/rechtliches`) in WOMS, der alle Rechtstexte von WEBklar mit
lückenloser Versionsgeschichte und alle Verträge mit Anbietern samt Fristen an einer Stelle zeigt.
Nur Mitarbeiter, keine Kunden. Die Texte werden weiter auf webklar.com und im Kundenportal gepflegt;
WOMS speichert feste Kopien jeder Version (Archiv, keine Quelle).

Nicht im Umfang: Firmenunterlagen, kundenbezogene Dokumente, Mail-Erinnerungen, automatische
Übernahme neuer Versionen aus den Deploys.

## Oberfläche

Seite mit zwei Reitern.

**Unsere Rechtstexte** – je Text eine Karte: AGB, Abo-Bedingungen, AVV, Datenschutz Website,
Datenschutz Portal, Impressum, Widerrufsbelehrung/-formular. Karte zeigt aktuelle Version, „gilt seit“,
Link zur Live-Seite. Klick öffnet die Versionsgeschichte (neu → alt): Nummer, gültig von/bis,
Änderungsnotiz, Datei ansehen/herunterladen. Aktuell = grün, Entwurf = graues Abzeichen.
„Neue Version“: Datei, Nummer, gültig ab, Notiz, Status. Wird eine Version gültig, bekommt die bisher
gültige automatisch `validTo` = neues `validFrom` minus 1 Tag und Status „abgelöst“.

**Verträge mit Anbietern** – Liste mit Anbieter, Zweck, Kosten, Laufzeit, Kündigungsfrist, nächster
Kündigungstermin; sortiert nach nächstem Termin. Rot ≤ 30 Tage, orange ≤ 90 Tage, grau = gekündigt/beendet,
„Fristen fehlen“ wenn Angaben unvollständig. Detailansicht mit Dateien und Notiz; Anlegen, Bearbeiten,
„Als gekündigt markieren“.

## Daten (Appwrite `woms-database`)

- `legalDocuments`: `key` (z. B. `agb`), `title`, `liveUrl`, `sort`.
- `legalVersions`: `documentKey`, `version` (Text, z. B. „v6“), `validFrom`, `validTo`,
  `status` (`draft` | `current` | `superseded`), `changeNote`, `fileIds[]`.
- `providerContracts`: `provider`, `purpose`, `cost`, `costInterval` (`month` | `year`), `startDate`,
  `termMonths`, `renewalMonths` (0 = keine Verlängerung), `noticeValue` + `noticeUnit` (`days` | `months`),
  `cancelledAt`, `endsAt`, `note`, `fileIds[]`.

Bucket `legal-files`: PDF, HTML, Bilder, DOC/DOCX, max. 20 MB.
Rechte: `users` dürfen lesen, anlegen, bearbeiten. Kein Löschen bei Versionen und Dateien (Archiv bleibt
vollständig); Anbieter-Verträge dürfen gelöscht werden.
Anlage per Setup-Skript (`scripts/setup-legal.mjs`, idempotent wie `setup-woms-appwrite.mjs`),
braucht einmal einen Appwrite-API-Key.

## Code

- `src/lib/legal.js`: `nextCancellationDate(contract, today)`, `deadlineTone(date, today)`,
  `supersedePrevious(versions, newVersion)`; reine Funktionen.
- `src/hooks/useLegal.js`: Laden/Speichern der drei Sammlungen, Datei-Upload/-Link über Appwrite Storage.
- `src/pages/LegalPage.jsx` mit den Reitern; Route und Menüpunkt in `App.jsx`/`Navbar.jsx`.

`nextCancellationDate`: Ende der laufenden Periode = Start + Laufzeit, danach je + Verlängerung, bis das
Periodenende nach heute liegt; Termin = Periodenende minus Kündigungsfrist (Monatsende korrekt geklemmt,
z. B. 31.01. + 1 Monat = 28./29.02.). Liegt der Termin schon vorbei, zählt die nächste Periode.
Ohne Verlängerung: Vertragsende, danach „beendet“. Gekündigt: kein Termin, grau. Fehlende Angaben: `null`
→ „Fristen fehlen“.

## Erstbefüllung

Skript `scripts/seed-legal.mjs`: Versionen aus der Git-Geschichte von webklar.com (`JUSN/Webklar`) und
dem Kundenportal rekonstruieren (je live gegangene Fassung eine Version, Datum = Commit auf main,
gespeichert als HTML/PDF). Die Versionsliste bekommt der Nutzer **vor dem Eintragen** zur Prüfung,
damit die Nummerierung (AGB aktuell „v6“) zu seiner passt. Nicht-live-Stände (z. B. Abo-Bedingungen v4)
als `draft`. Anbieter Hetzner (Server, Mail), Porkbun, Stripe als Einträge ohne geratene Fristen/Preise.

## Test und Auslieferung

Unit-Tests für `lib/legal.js` (Monatsende, Schaltjahr, keine Verlängerung, gekündigt, fehlende Angaben,
Ablösung). Playwright-Test gegen Vite-Build mit gemocktem Appwrite (Reiter, Karte, Versionsgeschichte,
neue Version löst alte ab, Farben der Fristen). Worktree `dev-rechtliches`, Branch `feature/rechtliches`;
live erst nach OK des Nutzers per `push … :test`.
