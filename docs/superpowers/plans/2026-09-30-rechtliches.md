# WOMS „Rechtliches“ Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Interner Menüpunkt „Rechtliches“ mit versionierten Rechtstexten und Anbieter-Verträgen samt Fristen.

**Architecture:** Drei neue Appwrite-Sammlungen + ein Bucket, angelegt per idempotentem Setup-Skript. Reine
Fristen-/Versionslogik in `src/lib/legal.js` (Node-Unit-Tests), Datenzugriff in `src/hooks/useLegal.js`,
Oberfläche in `src/pages/LegalPage.jsx` + zwei Reiter-Komponenten. Erstbefüllung per Seed-Skript nach Freigabe
der Versionsliste durch den Nutzer.

**Tech Stack:** React 18, Vite 5, Appwrite JS SDK 13 (Client) / node-appwrite (Skripte), `node --test` (Node 24), Playwright (Scratchpad).

**Spec:** `docs/superpowers/specs/2026-09-30-rechtliches-design.md`

## Global Constraints

- Arbeitsort: Worktree `/home/webklar/apps/ticket.webklar.com/dev-rechtliches`, Branch `feature/rechtliches`. **Nie pushen** – jeder Push (egal welcher Branch) geht live. Push nur durch/nach OK des Nutzers: `git push origin feature/rechtliches:test`.
- `node_modules` ist in Git getrackt: immer `git add <dateien>`, nie `-A`.
- Keine neuen npm-Abhängigkeiten.
- Oberflächentexte Deutsch. Datumsangaben als `YYYY-MM-DD`-String gespeichert, angezeigt `dd.mm.yyyy`.
- Versionen und Dateien: kein Löschen (weder UI noch Rechte). Anbieter-Verträge: Löschen erlaubt.
- Fristenfarben: rot ≤ 30 Tage, orange ≤ 90 Tage bis Kündigungstermin; grau = gekündigt/beendet; „Fristen fehlen“ bei unvollständigen Angaben.
- Keine erfundenen Fristen/Preise im Seed.
- CSS: kein Bootstrap vorhanden (`.d-flex` etc. existieren nicht), vorhandene Klassen/`ui`-Komponenten nutzen.

## Review Focus

- Abgelöst-Setzen scheitert nach dem Anlegen der neuen Version (zweiter Request 401/Netz) → zwei „gültige“ Versionen; UI muss den Fehler zeigen und `currentVersion()` die mit dem jüngsten `validFrom` nehmen (Test Task 1).
- Vertrag mit Start am 31. eines Monats → Monatsende klemmen, nie in den Folgemonat überlaufen (Test Task 1).
- Kündigungstermin genau heute → zählt noch als aktuelle Periode, rot, nicht übersprungen (Test Task 1).
- Neue Version mit `validFrom` älter als die aktuelle (Nachtrag einer alten Fassung) → darf die aktuelle NICHT ablösen, wird als `superseded` mit passendem `validTo` einsortiert (Test Task 1).
- Bucket/Sammlung fehlt noch (Setup nicht gelaufen) → Seite zeigt leeren Zustand mit Hinweis statt Absturz (Test Task 5).

---

### Task 1: Fristen- und Versionslogik

**Files:**
- Create: `src/lib/legal.js`
- Create: `tests/legal.test.mjs`
- Modify: `package.json` (Script `"test": "node --test tests/"`)

**Interfaces:**
- Produces:
  - `addMonthsClamped(date: string, n: number): string`
  - `nextCancellationDate(contract, today: string): { state: 'active'|'anytime'|'ends'|'ended'|'cancelled'|'incomplete', noticeBy: string|null, periodEnd: string|null }`
  - `deadlineTone(result, today: string): 'red'|'orange'|'normal'|'grey'|'missing'`
  - `currentVersion(versions): version|null` (Status `current`, bei mehreren das jüngste `validFrom`)
  - `planNewVersion(versions, input): { create: object, updates: Array<{ id: string, patch: object }> }`
  - `formatDate(date: string): string` (`YYYY-MM-DD` → `dd.mm.yyyy`, leer → `–`)

- [ ] **Step 1: Failing tests** in `tests/legal.test.mjs` (`node:test`, `assert/strict`):
  - `addMonthsClamped('2026-01-31', 1) === '2026-02-28'`; `('2028-01-31', 1) === '2028-02-29'`; `('2026-03-15', 12) === '2027-03-15'`.
  - Start `2025-03-12`, term 12, renewal 12, notice 1 month, today `2026-09-30` → `{state:'active', periodEnd:'2027-03-12', noticeBy:'2027-02-12'}`.
  - gleiche Daten, today `2027-02-12` → noticeBy `2027-02-12` (heute zählt noch); today `2027-02-13` → periodEnd `2028-03-12`, noticeBy `2028-02-12`.
  - notice 30 days, periodEnd `2027-03-12` → noticeBy `2027-02-10`.
  - `termMonths: 0` → `state:'anytime'`, noticeBy null.
  - renewal 0, periodEnd in Zukunft → `state:'ends'`, periodEnd gesetzt; periodEnd vorbei → `'ended'`.
  - `cancelledAt` gesetzt → `'cancelled'`, periodEnd = `endsAt`.
  - fehlendes `startDate` oder `noticeValue` (bei term > 0) → `'incomplete'`.
  - `deadlineTone`: noticeBy in 30 Tagen → `'red'`, 31 → `'orange'`, 90 → `'orange'`, 91 → `'normal'`; cancelled/ended → `'grey'`; incomplete → `'missing'`; anytime/ends → `'normal'`.
  - `planNewVersion` mit aktueller v5 (validFrom `2026-05-01`), Eingabe v6 status `current` validFrom `2026-09-01` → updates `[{id:v5.$id, patch:{status:'superseded', validTo:'2026-08-31'}}]`, create.validTo null.
  - Eingabe status `draft` → updates leer.
  - Eingabe `current` mit validFrom `2025-01-01` (älter als v5) → create.status `'superseded'`, create.validTo = Tag vor dem nächstjüngeren validFrom (`2026-04-30`), updates leer.
  - `currentVersion` mit zwei `current` → die mit jüngerem validFrom.

- [ ] **Step 2:** `npm test` → FAIL (Modul fehlt).
- [ ] **Step 3: Implementieren.** Rein, ohne Imports; Datumsrechnung in UTC auf `YYYY-MM-DD`. Algorithmus `nextCancellationDate` (active): `periodEnd = addMonthsClamped(start, term)`; solange `noticeBy(periodEnd) < today`: `periodEnd = addMonthsClamped(periodEnd, renewal)`. Notice in Monaten per `addMonthsClamped(periodEnd, -n)`, in Tagen per Tagesabzug.
- [ ] **Step 4:** `npm test` → alle PASS.
- [ ] **Step 5: Commit** `git add src/lib/legal.js tests/legal.test.mjs package.json && git commit -m "Rechtliches: Fristen- und Versionslogik mit Tests"`

### Task 2: Appwrite-Setup und Konstanten

**Files:**
- Create: `scripts/setup-legal.mjs`
- Modify: `src/lib/appwrite.js` (`Storage` exportieren, Konstanten)

**Interfaces:**
- Produces: `COLLECTIONS.LEGAL_DOCUMENTS = 'legalDocuments'`, `COLLECTIONS.LEGAL_VERSIONS = 'legalVersions'`, `COLLECTIONS.PROVIDER_CONTRACTS = 'providerContracts'`, `LEGAL_BUCKET_ID = 'legal-files'`, `storage` (Appwrite `Storage`).

- [ ] **Step 1: Skript schreiben** nach Muster `setup-woms-appwrite.mjs` (ENV `APPWRITE_API_KEY`, idempotent, vorhandene Attribute überspringen). Attribute exakt wie Spec-Abschnitt „Daten“; Datumsfelder `string(10)`, `fileIds` string-Array (size 64), `changeNote`/`note` string(5000), `status`/`costInterval`/`noticeUnit` als enum, `cost` float, Monats-/Fristzahlen integer. Rechte: `legalDocuments`/`legalVersions` = read/create/update für `users`, **kein delete**; `providerContracts` = read/create/update/delete `users`. Bucket `legal-files`: read/create `users`, kein update/delete, `maximumFileSize` 20 MB, Endungen `pdf, html, htm, png, jpg, jpeg, webp, doc, docx`. Die 7 `legalDocuments` (Keys `agb, abo-bedingungen, avv, datenschutz-website, datenschutz-portal, impressum, widerruf`, mit Titel, Live-URL, sort 1–7) als feste IDs = Key anlegen, wenn fehlend. Flag `--dry-run` gibt nur aus, was angelegt würde.
- [ ] **Step 2:** `node --check scripts/setup-legal.mjs` → OK; `node scripts/setup-legal.mjs --dry-run` ohne Key → listet Sammlungen/Bucket/Dokumente, Exit 0.
- [ ] **Step 3:** Konstanten in `appwrite.js`; `npm run build` → Exit 0.
- [ ] **Step 4: Commit.** Skript wird erst in Task 6 mit Key ausgeführt.

### Task 3: Daten-Hook

**Files:**
- Create: `src/hooks/useLegal.js`

**Interfaces:**
- Consumes: Task 1 `planNewVersion`, Task 2 Konstanten.
- Produces:
  - `useLegalDocuments(): { documents, versions, loading, error, missingSetup: boolean, addVersion(documentKey, input, files: File[]), updateVersion(id, patch), refresh }`
  - `useProviderContracts(): { contracts, loading, error, missingSetup, saveContract(data, files, id?), deleteContract(id), refresh }`
  - `fileUrl(fileId): string` (View-URL), `fileDownloadUrl(fileId): string`

- [ ] **Step 1: Implementieren.** Listen mit `Query.limit(5000)`. 404 auf Sammlung → `missingSetup: true`, leere Listen, kein Fehler. `addVersion`: Dateien per `storage.createFile(LEGAL_BUCKET_ID, ID.unique(), file)`, dann `planNewVersion` → erst `createDocument`, dann die `updates`; scheitert ein Update, `error` = „Neue Version gespeichert, alte Version konnte nicht abgelöst werden: …“ und trotzdem `refresh()`.
- [ ] **Step 2:** `npm run build` → Exit 0. (Verhalten wird in Task 5 per Playwright geprüft.)
- [ ] **Step 3: Commit.**

### Task 4: Seite „Rechtliches“ mit beiden Reitern

**Files:**
- Create: `src/pages/LegalPage.jsx`, `src/components/legal/LegalTextsTab.jsx`, `src/components/legal/VersionForm.jsx`, `src/components/legal/ProviderContractsTab.jsx`, `src/components/legal/ContractForm.jsx`
- Modify: `src/App.jsx` (Route `/rechtliches` in `ProtectedRoute`), `src/components/Navbar.jsx` (Eintrag „Rechtliches“ mit `IconScale` nach „Finanzen“)

**Interfaces:**
- Consumes: Task 1 (`currentVersion`, `nextCancellationDate`, `deadlineTone`, `formatDate`), Task 3 Hooks.

- [ ] **Step 1: LegalTextsTab.** Pro Dokument `Card`: Titel, aktuelle Version + „gilt seit“, Link „Live-Seite“ (`target=_blank`); Entwürfe als graues `Badge` „Entwurf“. Klick klappt Versionsgeschichte auf (neu → alt nach validFrom): Nummer, `formatDate(validFrom)`–`formatDate(validTo)`, Notiz, Dateilinks (Ansehen/Herunterladen). Aktuelle Zeile grün. Button „Neue Version“ öffnet `VersionForm` (Felder: Version, Status draft/current, gültig ab, Notiz, Dateien; Pflicht: Version, gültig ab). Entwurf-Zeilen haben „Als gültig markieren“ (setzt `status current` über `planNewVersion`-Logik: Update + Ablösung). Kein Löschen-Button.
- [ ] **Step 2: ProviderContractsTab.** Tabelle/Liste sortiert: rot, orange, normal, missing, grey; innerhalb nach noticeBy. Spalten: Anbieter, Zweck, Kosten (`12,00 €/Monat`), Laufzeit, Kündigungsfrist, nächster Kündigungstermin (bzw. „jederzeit kündbar“, „endet am …“, „gekündigt zum …“, „Fristen fehlen“). Zeilenfarbe per Klasse `legal-tone-{tone}`. Detail aufklappbar mit Notiz, Dateien, „Bearbeiten“, „Als gekündigt markieren“ (fragt `endsAt`, setzt `cancelledAt` = heute), „Löschen“ mit `confirm`. `ContractForm` für Neu/Bearbeiten.
- [ ] **Step 3: LegalPage** mit `PageHeader` „Rechtliches“ und `Tabs` (`texte` „Unsere Rechtstexte“, `anbieter` „Verträge mit Anbietern“). Bei `missingSetup` `EmptyState` „Rechtliches ist noch nicht eingerichtet (Setup-Skript fehlt).“ CSS-Regeln für `legal-tone-*` in die bestehende globale CSS.
- [ ] **Step 4:** `npm run build` → Exit 0.
- [ ] **Step 5: Commit.**

### Task 5: Oberflächentest

**Files:**
- Create (Scratchpad, nicht im Repo): `legal-e2e.mjs` – Vite-Build mit `DIST=…`, Appwrite-Mock unter `https://ticket.test` (Muster `appsmoke.mjs` aus Memory „woms-ticketsystem“), Build und Browser unter `systemd-run --scope -p MemoryMax=…`.

- [ ] **Step 1: Test schreiben**, Prüfungen:
  - Menü zeigt „Rechtliches“, `/rechtliches` lädt, zwei Reiter.
  - AGB-Karte zeigt aktuelle „v5“, grün; Geschichte listet v5, v4 mit `validTo`.
  - „Neue Version“ v6 current ab heute → Mock erhält Create v6 **und** Patch v5 `{status:'superseded', validTo:<gestern>}`; Karte zeigt v6.
  - Patch-Request mit 401 gemockt → Fehlermeldung sichtbar, v6 trotzdem gelistet.
  - Kein „Löschen“ bei Versionen.
  - Anbieter-Reiter: Vertrag mit noticeBy in 10 Tagen hat `legal-tone-red` und steht oben; unvollständiger zeigt „Fristen fehlen“; gekündigter ist grau und unten.
  - Sammlung liefert 404 → EmptyState-Hinweis, kein Absturz.
- [ ] **Step 2:** Test laufen lassen → alle PASS; bei FAIL Code in Task 3/4 korrigieren und neu committen.

### Task 6: Einrichtung und Erstbefüllung (Nutzer-Gates)

**Files:**
- Create: `scripts/seed-legal.mjs`, `scripts/legal-seed.json` (erzeugte Versionsliste)

- [ ] **Step 1: Versionsliste rekonstruieren.** Pro Text: `git log --format='%h %ad %s' --date=short origin/main -- <datei>` in `/home/webklar/apps/webklar.com/build` (`src/pages/AGB.tsx`, `Impressum.tsx`, `Datenschutz.tsx`) und `/home/webklar/apps/kundenbereich.webklar.com/build` (`public/abo-bedingungen.html` inkl. AVV-Anlage, `public/datenschutz.html`, `public/widerrufen.html`). Nur inhaltliche Änderungen werden Versionen (reine Format-/Build-Commits zusammenfassen). Ergebnis als `legal-seed.json`: `{documentKey, version, validFrom, status, changeNote, source: '<repo>@<hash>:<pfad>'}`. Nicht auf main liegende Stände (z. B. Abo-Bedingungen v4, AGB `f40e889`) als `draft`.
- [ ] **Step 2: GATE – Nutzer prüft die Liste** (Nummerierung, v. a. AGB „v6“). Erst nach OK weiter.
- [ ] **Step 3: Seed-Skript.** Liest JSON, erzeugt je Version eine Datei: Portal-HTML direkt aus `git show`; Website-TSX als lesbares HTML (Text aus JSX, eigene Mini-Umwandlung; bei Unsicherheit TSX-Quelltext als `.html` in `<pre>`). Upload in `legal-files`, Dokument in `legalVersions`. Idempotent über `source` (schon vorhanden → überspringen). Anbieter Hetzner (Server), Hetzner (Mail), Porkbun (Domains), Stripe (Zahlungen) ohne Fristen/Preise. `--dry-run`.
- [ ] **Step 4: GATE – API-Key.** Key auf dem Server suchen (nur Dateien, die bisherige Setup-Läufe nutzten); sonst Nutzer fragen. Dann `node scripts/setup-legal.mjs`, danach `node scripts/seed-legal.mjs` → Ausgabe zählt angelegte Sammlungen/Versionen.
- [ ] **Step 5: Commit** Skripte + JSON.

### Task 7: Abschluss

- [ ] **Step 1:** `npm test`, `npm run build`, Task-5-Test → grün. Deploy-nahe Prüfung: `git archive` + `docker run node:20-alpine` (`npm install; npm run build`).
- [ ] **Step 2: GATE – Push-OK des Nutzers**, dann `git push origin feature/rechtliches:test`; Live-Bundle auf „Rechtliches“ prüfen.
- [ ] **Step 3:** Memory `woms-ticketsystem` aktualisieren.
