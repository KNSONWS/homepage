# Unterstützung bei Arbeitsblättern + 15-Minuten-Zeiten – Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mitarbeiter können auf Arbeitsblättern als Unterstützung (Person + Tätigkeit) eingetragen werden und bekommen 50 % der Arbeitszeit (aufgerundet auf 15 min) angerechnet; Zeiten gibt es überall nur noch in 15-Minuten-Schritten; Kundenportal, Stundenkonto und Verträge ziehen mit.

**Architecture:** Neues JSON-Attribut `supporters` auf `worksheets`; Minuten werden nie gespeichert, sondern mit derselben Rechenregel in WOMS (`src/lib/support.js`) und Portal (`server/services/worksheetMinutes.js`) aus `totalTime` berechnet. WOMS bekommt eine gemeinsame Zeitauswahl (`DurationSelect`) und zwei Wege, Unterstützung einzutragen (Ersteller im Zeiten-Formular, Helfer über „Ich habe unterstützt“). Das Portal zeigt Unterstützung als eigene Zeilen, eine Gesamtzeit oben und zieht sie im Abo-Stundenkonto ab. Abo-Bedingungen Fassung 5 und AGB § 9 Abs. 2 halten die Regeln fest.

**Tech Stack:** WOMS React/Vite + Appwrite Web SDK 13, Tests `node --test` (+ esbuild `tests/unit/load.mjs`), Playwright-Harness; Portal Node/Express ESM, `node --test test/*.test.js`, Vanilla-JS `public/app.js`; webklar.com React/TS + vitest.

**Spec:** `docs/superpowers/specs/2026-09-30-unterstuetzung-design.md` (WOMS-Repo, Commit a336dc0)

## Repos und Arbeitsverzeichnisse

| Teil | Repo / Zweig | Worktree | Livegang |
|---|---|---|---|
| WOMS (Tasks 1–6) | JUSN/tickte-system, `feature/unterstuetzung` von `origin/test` | `/home/webklar/apps/ticket.webklar.com/dev-unterstuetzung` (existiert) | `git push origin feature/unterstuetzung:test` |
| Portal (Tasks 7–10) | Portal-Repo, `feature/unterstuetzung` von `origin/main` | `/home/webklar/apps/kundenbereich.webklar.com/dev-unterstuetzung` (in Task 7 anlegen) | `git push origin feature/unterstuetzung:main` |
| webklar.com (Task 11) | JUSN/Webklar, `fix/agb-haftung` (f40e889) | `/home/webklar/apps/webklar.com/dev-agb-haftung` (existiert, erst auf `origin/main` rebasen) | `git push origin fix/agb-haftung:main` |

Worktree-Regeln (alle drei Repos): `node_modules` ist ein Symlink auf `../build/node_modules`; nach Rebase/Checkout `rm -rf node_modules && ln -s ../build/node_modules node_modules`. In WOMS ist `node_modules` getrackt → nur `git add <dateien>`, nie `-A`. Nichts pushen ohne OK des Nutzers; der WOMS-Webhook deployt JEDEN gepushten Zweig.

## Global Constraints

- Zeit-Raster: `TIME_STEP = 15` Minuten; Auswahl 15 min … 12 h (`MAX_STEP_MINUTES = 720`, 48 Werte; 720 = bestehendes `MAX_MINUTES` der Push-Zeitmail). *Abweichung von der Spec (dort „bis 10 h“) zugunsten eines Maximums in beiden Systemen – Spec-Zeile wird in Task 1 angepasst.*
- Berechnete Dauer wird **aufgerundet** auf das nächste Vielfache von 15; Dauer 0/fehlend → 15 vorausgewählt.
- `supportMinutes(t) = t > 0 ? ceil(t / 2 / 15) * 15 : 0`; Testvektoren überall: 15→15, 30→15, 45→30, 60→30, 75→45, 70→45, 0→0, -5→0, '60'→30, null→0.
- `worksheetMinutes(ws) = base + supporters.length * supportMinutes(base)`, `base = Number(ws.totalTime) || 0`; Kommentar-Filter bleibt beim Aufrufer.
- `supporters`-Eintrag: `{ employeeId: string, name: string, task: string }`; `task` getrimmt 1–200 Zeichen; `employeeId` eindeutig; gespeichert als JSON-String, Attribut `supporters` String 4000, nicht Pflicht.
- Alte Arbeitsblätter werden nicht umgerechnet.
- Anzeige-Texte (exakt): Haken „Unterstützung“, Feld „Wobei?“, Knopf „+ weitere Person“, Knopf „Ich habe unterstützt“ / „Meine Unterstützung bearbeiten“, Listenzeile WOMS „↳ Unterstützung {Vorname} · {task} · {Zeit}“, Portal „↳ Unterstützung {Vorname}: {task}“ + Zeit, Portal-Kopf „Arbeitszeit gesamt: {Zeit}“, Stundenkonto-Zusatz „inkl. {Zeit} Unterstützung“.
- Vorname = erstes Wort von `name`.
- Zeitformat WOMS wie bisher `formatTime` („1h 30min“); Portal wie bisher `fmtMinutes`/`fmtHours`.
- Berechtigungen nur in der Oberfläche; Appwrite-Rechte bleiben unverändert.
- Claude darf keinen Appwrite-API-Key benutzen: Skripte mit Key führt der Nutzer aus.
- Commits enden mit `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. Ersteller speichert das Zeiten-Formular, während ein Kollege sich gerade selbst als Unterstützung eingetragen hat → dessen Eintrag darf nicht still verloren gehen (Task 4: Konflikt-Prüfung beim Speichern).
2. Altes Arbeitsblatt mit 70 min wird zum Bearbeiten geöffnet → 75 ist vorausgewählt, und Unterstützung rechnet dann mit 75 (Task 3 + Task 1-Vektoren).
3. Git-Push: der zugeordnete Pusher sieht „Zeiten bearbeiten“ statt „Ich habe unterstützt“; ein Push ohne nachgetragene Zeit bietet keinem „Ich habe unterstützt“ an (Task 1 `canAddOwnSupport`, Task 5).
4. `supporters` kaputt (kein JSON, kein Array, Eintrag ohne `task`, doppelte Person) → WOMS-Liste, Portal-Projektansicht und Stundenkonto laufen weiter und ignorieren nur den kaputten Teil (Task 1, Task 7).
5. Mitarbeiterliste lädt nicht oder ein Mitarbeiter hat kein `userId` → Auswahl zeigt Hinweis statt leerer Zeilen, „Ich habe unterstützt“ funktioniert trotzdem mit `user.$id`/`user.name` (Task 4, Task 5).

---

## WOMS

### Task 1: Rechenregeln (Zeit-Raster + Unterstützung)

**Files:**
- Create: `src/lib/timeSteps.js`, `src/lib/support.js`
- Test: `tests/unit/support.test.mjs` (lädt Module über `tests/unit/load.mjs`)
- Modify: `docs/superpowers/specs/2026-09-30-unterstuetzung-design.md` („bis 10 h (40 Werte)“ → „bis 12 h (48 Werte)“)

**Interfaces:**
- Produces (`timeSteps.js`): `TIME_STEP = 15`, `MAX_STEP_MINUTES = 720`, `roundUpToStep(minutes: number|null): number` (≤0/NaN/null → 15, sonst `ceil(m/15)*15`), `isValidStep(minutes: any): boolean` (ganze Zahl, >0, %15===0, ≤720), `stepOptions(current?: number): {value:number,label:string}[]` (15…720; liegt `current` gültig über 720, wird er angehängt), `stepLabel(minutes): string` („15 min“, „1 h“, „1 h 15 min“).
- Produces (`support.js`): `supportMinutes(total): number`, `parseSupporters(raw: string|array|null): Supporter[]` (nie Exception; verwirft Einträge ohne `employeeId`/`task`, trimmt, kürzt `task` auf 200, erster Eintrag je `employeeId` gewinnt), `serializeSupporters(list): string`, `worksheetMinutes(ws): number`, `firstName(name): string`, `canAddOwnSupport(ws, user, employee): boolean` (`user.$id` vorhanden, `!ws.isComment`, `Number(ws.totalTime) > 0`, `!isWorksheetCreator(ws, user, employee)`), `upsertSupporter(list, entry): Supporter[]`, `removeSupporter(list, employeeId): Supporter[]`, `validateSupporters(list, creatorUserId): string|null` (Fehlertext: „Bitte bei jeder Person angeben, wobei sie unterstützt hat.“, „Jede Person nur einmal eintragen.“, „Du kannst dich nicht selbst als Unterstützung eintragen.“).
- Consumes: `isWorksheetCreator` aus `src/lib/ticketForm.js`.

- [ ] **Step 1: Failing tests** in `tests/unit/support.test.mjs`: Vektoren aus Global Constraints für `supportMinutes`; `roundUpToStep`: 0→15, 50→60, 60→60, 61→75, null→15; `isValidStep`: 15/720 true, 70/0/735/'x'/7.5 false; `stepOptions()` Länge 48, erstes `{15,'15 min'}`, `[3]` = `{60,'1 h'}`, `[4]` = `{75,'1 h 15 min'}`; `stepOptions(900)` Länge 49; `parseSupporters`: `'kaputt'`→[], `'{}'`→[], `'[{"employeeId":"a","name":"Andrej S","task":" Farbe "},{"employeeId":"a","name":"x","task":"y"},{"employeeId":"b","name":"Nico"}]'` → `[{employeeId:'a',name:'Andrej S',task:'Farbe'}]`; `worksheetMinutes({totalTime:60, supporters:<2 Einträge>})` = 120, `{totalTime:70, supporters:<1>}` = 115, ohne `supporters` = `totalTime`; `canAddOwnSupport`: fremdes normales Blatt mit Zeit → true, eigenes → false, Kommentar → false, Git ohne Zeit (`isComment:true,totalTime:0`) → false, Git mit Zeit gepusht von `knso` für `employee.shortcode 'KNSO'` → false, für anderen Mitarbeiter → true; `validateSupporters` für die drei Fehler und `null` für gültige Liste; `firstName('Andrej Stevanovski')` = 'Andrej'.
- [ ] **Step 2:** `npm test` → neue Tests FAIL (Modul fehlt).
- [ ] **Step 3:** `timeSteps.js` und `support.js` mit den Signaturen oben implementieren (reine Funktionen, keine Imports außer `ticketForm.js`).
- [ ] **Step 4:** `npm test` → alle grün.
- [ ] **Step 5:** Spec-Zeile anpassen; commit `git add src/lib/timeSteps.js src/lib/support.js tests/unit/support.test.mjs docs/superpowers/specs/2026-09-30-unterstuetzung-design.md && git commit -m "Unterstützung: Rechenregeln für 15-Minuten-Raster und Unterstützungszeit"`.

### Task 2: Appwrite-Attribut `supporters` (Skript für den Nutzer)

**Files:**
- Create: `scripts/setup-supporters.mjs`
- Test: `tests/setup-supporters.test.mjs`

**Interfaces:**
- Produces: `export const ATTRIBUTE = { key: 'supporters', type: 'string', size: 4000, required: false }`; `export function planAttribute(existing: {key,type,size}[]): 'create'|'exists'|'conflict'` (`conflict` = Key vorhanden mit anderem Typ oder Größe < 4000). CLI wie `scripts/setup-legal.mjs`: `--dry-run`, `APPWRITE_API_KEY`, Endpoint/Projekt/DB-Defaults identisch, Collection `worksheets`; bei `create` POST `/databases/woms-database/collections/worksheets/attributes/string`, danach Status pollen bis `available` (max. 30 s); bei `conflict` Exit 1 mit Meldung. Hauptteil nur, wenn als Skript gestartet (`import.meta.url === pathToFileURL(process.argv[1]).href`).

- [ ] **Step 1: Failing test:** `planAttribute([])` = 'create'; `[{key:'supporters',type:'string',size:4000}]` = 'exists'; `[{key:'supporters',type:'string',size:255}]` = 'conflict'; `[{key:'supporters',type:'integer'}]` = 'conflict'.
- [ ] **Step 2:** `npm test` → FAIL.
- [ ] **Step 3:** Skript implementieren.
- [ ] **Step 4:** `npm test` grün; `node scripts/setup-supporters.mjs --dry-run` ohne Key → gibt geplanten Schritt aus, Exit 0, kein Netzwerkzugriff.
- [ ] **Step 5:** Commit „Unterstützung: Setup-Skript für das Attribut supporters“.

### Task 3: Zeiten nur in 15-Minuten-Schritten

**Files:**
- Create: `src/components/ui/DurationSelect.jsx` (+ Export in `src/components/ui/index.js`, falls dort gebündelt)
- Modify: `src/components/CreateWorksheetModal.jsx` (Feld „Arbeitszeit (Minuten)“ Z. ~238–254, Auto-Berechnung Z. ~60–67, Submit Z. ~105), `src/components/WorksheetTimesModal.jsx` (Z. 21–31, 117–134), `src/hooks/useWorksheets.js` (`createWorksheet` Z. ~146–153, `updateWorksheetTimes` Z. ~222–231)
- Test: `.superpowers/sdd/2026-09-30-unterstuetzung/ui.mjs` (Playwright, siehe Test-Rezept unten), `tests/unit/support.test.mjs` erweitern falls neue reine Hilfen

**Interfaces:**
- Consumes: `stepOptions`, `roundUpToStep`, `isValidStep`, `MAX_STEP_MINUTES` (Task 1), `minutesBetween` (ticketForm).
- Produces: `<DurationSelect id value onChange disabled />` – `<select>` über `stepOptions(value)`, `onChange(minutes:number)`; Label „Arbeitszeit“.

Verhalten: Beide Modals rechnen automatisch `roundUpToStep(minutesBetween(start,end))`, solange nicht manuell gewählt; Hinweis darunter „✓ Aus Beginn und Ende berechnet, aufgerundet auf 15 Minuten“ bzw. „Von Hand gewählt“. `WorksheetTimesModal` startet mit `isValidStep(stored) ? stored : roundUpToStep(stored || berechnet)`. „Nur Kommentar“ deaktiviert die Auswahl und speichert 0. `createWorksheet` rundet eine fehlende/ungültige Zeit mit `roundUpToStep`; `createWorksheet` (nicht Kommentar) und `updateWorksheetTimes` lehnen `!isValidStep(totalTime)` ab mit „Die Arbeitszeit muss in 15-Minuten-Schritten angegeben werden.“

- [ ] **Step 1: Failing UI-Checks** in `ui.mjs`: (a) neues Arbeitsblatt 09:00–09:50 → Auswahl zeigt „1 h“, gespeichert `totalTime: 60`; (b) 23:30–00:15 → 45; (c) Auswahl hat 48 Optionen, keine freie Zahleneingabe (`input[type=number]` im Formular fehlt); (d) Zeiten bearbeiten bei `totalTime: 70` → „1 h 15 min“ vorausgewählt, Speichern schickt 75; (e) Git „Zeit nachtragen“ Beginn 14:00, Ende 14:37 → 45; (f) „Nur Kommentar“ → Auswahl disabled, gespeichert 0.
- [ ] **Step 2:** Harness bauen und laufen lassen → Checks FAIL.
- [ ] **Step 3:** `DurationSelect` bauen, in beiden Modals einsetzen, `useWorksheets` anpassen.
- [ ] **Step 4:** `npm test` grün; `ui.mjs` (a)–(f) grün.
- [ ] **Step 5:** Commit „Arbeitszeit nur in 15-Minuten-Schritten, berechnete Zeit wird aufgerundet“.

### Task 4: Unterstützung im Formular des Erstellers

**Files:**
- Create: `src/components/SupportersEditor.jsx`
- Modify: `src/components/WorksheetTimesModal.jsx`, `src/components/CreateWorksheetModal.jsx`, `src/hooks/useWorksheets.js`, `src/components/TicketCard.jsx` (Mitarbeiterliste an die Modals geben)
- Test: `ui.mjs` erweitern

**Interfaces:**
- Consumes: `parseSupporters`, `serializeSupporters`, `validateSupporters`, `supportMinutes`, `stepLabel` (Task 1); `useEmployees()` → `employees` mit `userId`, `displayName`.
- Produces: `<SupportersEditor value={Supporter[]} onChange={(list)=>void} employees={[]} excludeUserId={string} minutes={number} />` – Haken „Unterstützung“ (an, wenn `value.length`), Zeilen *Mitarbeiter* (`<select>`, ohne `excludeUserId`, ohne in anderen Zeilen gewählte, Mitarbeiter ohne `userId` weggelassen) + *Wobei?* (`maxLength 200`, required) + Entfernen; „+ weitere Person“; je Zeile Vorschau „= {stepLabel(supportMinutes(minutes))}“; Haken aus → `onChange([])`; keine Mitarbeiter → Hinweis „Mitarbeiterliste konnte nicht geladen werden.“
- Produces (`useWorksheets`): `updateWorksheetTimes(worksheet, times, currentUser, employee)` akzeptiert zusätzlich `times.supporters: Supporter[]` und `times.supportersBefore: string` (Rohwert beim Öffnen). Vor dem Schreiben: `databases.getDocument` frisch; ist `fresh.supporters ?? ''` ≠ `supportersBefore ?? ''`, Abbruch mit `{ success:false, error:'Inzwischen hat jemand die Unterstützung geändert. Bitte das Formular schließen und neu öffnen.' }`. Sonst patcht es `supporters: serializeSupporters(list)` mit. `createWorksheet(data, currentUser)` übernimmt `data.supporters` (Array) serialisiert.

- [ ] **Step 1: Failing UI-Checks:** (g) Ersteller öffnet „Zeiten bearbeiten“ (60 min), setzt Haken, wählt Andrej „Farbkonzept“ und Nico „Texte“ → PATCH enthält `supporters` mit beiden, Vorschau je „= 30 min“; (h) eigene Person fehlt in der Auswahl, schon gewählte Person fehlt in der zweiten Zeile; (i) leeres „Wobei?“ → Speichern blockiert mit Fehlertext aus Task 1; (j) Mock ändert `supporters` zwischen Öffnen und Speichern → Konfliktmeldung, kein PATCH; (k) neues Arbeitsblatt mit Unterstützung → `createDocument` enthält `supporters`; (l) Employees-Mock liefert 500 → Hinweistext sichtbar.
- [ ] **Step 2:** → FAIL.
- [ ] **Step 3:** Implementieren.
- [ ] **Step 4:** `npm test` + `ui.mjs` grün (a)–(l).
- [ ] **Step 5:** Commit „Unterstützung: Ersteller trägt helfende Personen im Arbeitsblatt ein“.

### Task 5: „Ich habe unterstützt“

**Files:**
- Create: `src/components/OwnSupportModal.jsx`
- Modify: `src/components/WorksheetList.jsx` (Kopf-Knöpfe Z. ~164–200), `src/components/TicketCard.jsx`, `src/hooks/useWorksheets.js`
- Test: `ui.mjs` erweitern

**Interfaces:**
- Consumes: `canAddOwnSupport`, `parseSupporters`, `upsertSupporter`, `removeSupporter`, `serializeSupporters` (Task 1).
- Produces (`useWorksheets`): `saveOwnSupport(worksheet, task: string|null, currentUser, employee): Promise<{success, error?}>` – prüft `canAddOwnSupport`, liest das Dokument frisch (`getDocument`), setzt/ersetzt den Eintrag `{ employeeId: user.$id, name: employee?.displayName || user.name, task }` bzw. entfernt ihn bei `task === null`, patcht nur `{ supporters }`, aktualisiert den State.
- Produces (`WorksheetList` Props): `canAddSupport(ws): boolean`, `onOwnSupport(ws): void`; Knopf-Text „Ich habe unterstützt“ bzw. „Meine Unterstützung bearbeiten“, wenn `parseSupporters(ws.supporters)` die eigene `user.$id` enthält (dafür neue Prop `currentUserId`).
- `OwnSupportModal`: Titel „Unterstützung eintragen“, Feld „Wobei?“ (required, 200), Anzeige „Dir werden {stepLabel(supportMinutes(ws.totalTime))} angerechnet.“, Knöpfe „Speichern“ und – wenn schon eingetragen – „Eintrag entfernen“.

- [ ] **Step 1: Failing UI-Checks:** (m) Nicht-Ersteller sieht bei fremdem 60-min-Blatt „Ich habe unterstützt“, Ersteller nicht; (n) Speichern mit „Design geprüft“ → vor dem PATCH ein GET des Dokuments; PATCH-Body enthält nur `supporters` mit dem bestehenden Eintrag (vom Mock) **und** dem neuen; (o) danach heißt der Knopf „Meine Unterstützung bearbeiten“, „Eintrag entfernen“ entfernt nur den eigenen; (p) Git-Push ohne Zeit und Kommentar: kein Knopf; Git-Push mit Zeit von `knso`: Kenso sieht „Zeiten bearbeiten“, Andrej sieht „Ich habe unterstützt“.
- [ ] **Step 2:** → FAIL.
- [ ] **Step 3:** Implementieren.
- [ ] **Step 4:** `npm test` + `ui.mjs` grün.
- [ ] **Step 5:** Commit „Unterstützung: Mitarbeiter tragen sich selbst als Unterstützung ein“.

### Task 6: Anzeige in WOMS

**Files:**
- Modify: `src/components/WorksheetList.jsx` (eingeklappter Kopf Z. ~146–155 und aufgeklappter Körper Z. ~214–240), `src/components/WorksheetSummary.jsx`, `src/hooks/useWorksheets.js` (`getTotalTime` Z. ~255–259)
- Test: `ui.mjs` erweitern

**Interfaces:**
- Consumes: `parseSupporters`, `supportMinutes`, `worksheetMinutes`, `firstName` (Task 1).

Verhalten: Aufgeklappt unter Mitarbeiter/Zeit je Eintrag eine Zeile „↳ Unterstützung Andrej · Farbkonzept · 30min“ (Zeit mit dem vorhandenen `formatTime`). Eingeklappt bei vorhandener Unterstützung zusätzlich kleines Badge „+{n} Unterstützung“. `WorksheetSummary` und `getTotalTime` summieren `worksheetMinutes(ws)` über `!ws.isComment`.

- [ ] **Step 1: Failing UI-Checks:** (q) Blatt 60 min mit 2 Unterstützern → zwei Zeilen „↳ Unterstützung Andrej · Farbkonzept · 30min“ / „↳ Unterstützung Nico · Texte · 30min“, Kopf-Badge „+2 Unterstützung“; (r) Summe „Arbeitszeit gesamt 2h 0min“ bei diesem einen Blatt; (s) `supporters: 'kaputt'` → Blatt rendert normal ohne Zeilen, keine Konsolen-Exception.
- [ ] **Step 2:** → FAIL.
- [ ] **Step 3:** Implementieren.
- [ ] **Step 4:** `npm test` + `ui.mjs` grün; Deploy-naher Build: `git archive HEAD | …` in `docker run --rm node:20-alpine` (`npm install && npm run build`) Exit 0.
- [ ] **Step 5:** Commit „Unterstützung: Anzeige in Arbeitsblatt-Liste und Gesamtzeit“.

**WOMS-Test-Rezept** (aus Memory, `ui.mjs`): esbuild-Harness mit JS-API (`require('<worktree>/node_modules/esbuild').build`), `define` für `import.meta.env.*`, Loader `.js=jsx`, `.ttf`/`.woff2`, Stub-Plugin für ProjectContextPanel/TicketProjects/InvoicePanel; Bau unter `systemd-run --scope -p MemoryMax=450M -p MemorySwapMax=0`, Playwright headless unter MemoryMax 700M, Bundle über `page.route` von `https://ticket.test`, Appwrite-REST (`/v1/account`, `/v1/databases/woms-database/collections/{worksheets,employees}/documents[/:id]`) gemockt, PATCH/POST-Bodies in `window.__calls` protokolliert. `set -o pipefail`, Exit-Codes prüfen.

---

## Kundenportal

### Task 7: Rechenregel + Stundenkonto

**Files:**
- Setup: `git -C /home/webklar/apps/kundenbereich.webklar.com/build fetch origin && git -C … worktree add -b feature/unterstuetzung ../dev-unterstuetzung origin/main`, dann node_modules-Symlink.
- Create: `server/services/worksheetMinutes.js`
- Modify: `server/services/hourLedger.js` (`listPlanUsage` Z. 54–70), `public/app.js` (`renderHoursView` Z. ~1218–1221)
- Test: `test/worksheetMinutes.test.js`, `test/hourLedger.test.js` (neu, falls nicht vorhanden; sonst erweitern)

**Interfaces:**
- Produces: `supportMinutes(total)`, `parseSupporters(raw)`, `worksheetMinutes(ws)`, `firstName(name)` – gleiche Semantik und Testvektoren wie WOMS Task 1; `parseSupporters` loggt bei kaputtem Wert einmal `console.warn('[unterstuetzung] supporters unlesbar', ws?.$id)` über optionalen zweiten Parameter `context`.
- Produces (`listPlanUsage` Eintrag): zusätzlich `supportMinutes: number` (Summe der Unterstützung); `rawMinutes = worksheetMinutes(ws)`, `minutes = roundUsage(rawMinutes)`; Filter `worksheetMinutes(ws) > 0`.

- [ ] **Step 1: Failing tests:** Vektoren; `parseSupporters` wie WOMS; `listPlanUsage` mit gemocktem `listDocuments` (Muster aus `test/support/appwriteMock`) – Blatt 60 min + 1 Unterstützer → `minutes 90, supportMinutes 30`; Blatt mit `supporters:'kaputt'` → `minutes 60`, kein Throw; `computeLedger` mit 60 min Guthaben und diesem 90-min-Eintrag → `overageMinutes 30`.
- [ ] **Step 2:** `npm test` → FAIL.
- [ ] **Step 3:** Implementieren; in `renderHoursView` hinter `−{fmtHours(u.minutes)}` bei `u.supportMinutes` ein `<span class="muted">inkl. {fmtHours(u.supportMinutes)} Unterstützung</span>`.
- [ ] **Step 4:** `npm test` grün (bekannt flaky/unabhängig: `repoMove.test.js`).
- [ ] **Step 5:** Commit „Unterstützung: Rechenregel und Abzug im Abo-Stundenkonto“.

### Task 8: Projektansicht – Unterstützungs-Zeilen und Gesamtzeit

**Files:**
- Modify: `server/services/customerProjectView.js` (`customerWorkEntry` Z. ~197–216, `customerWorkEntries` Z. ~219–233), `server/routes/projects.js` (`GET /:id/work` Z. ~78–95), `public/app.js` (`renderWorkEntry` Z. ~319–336, `renderOrder` Z. ~252–273, Projektdetails Z. ~386–396), `public/kundenbereich.css`, `server/services/customerActivity.js` (Z. ~36–47), `public/admin.js` (Z. ~167)
- Test: `test/customerProjectView.test.js` erweitern

**Interfaces:**
- Consumes: `parseSupporters`, `supportMinutes`, `worksheetMinutes`, `firstName` (Task 7).
- Produces: Work-Eintrag bekommt `supports: { name: string /*Vorname*/, task: string, minutes: number }[]` (leer = `[]`); zusammengefasste Git-Tage hängen `supports` aneinander; `minutes` des Eintrags bleibt die eigene Arbeitszeit (ohne Unterstützung). Neue Export-Funktion `workTotalMinutes(entries): number` = Σ (`minutes` + Σ `supports.minutes`). `GET /:id/work` antwortet zusätzlich `totalMinutes`. `customerActivity` liefert je Blatt zusätzlich `supportMinutes` (Summe); `admin.js` zeigt dann „, +{n} min Unterstützung“.
- Anzeige: `renderWorkEntry` hängt je Unterstützung `<li class="pd-support">↳ Unterstützung {name}: {task} <span class="pd-time">{fmtMinutes}</span></li>` in einer `<ul class="pd-supports">` unter den Eintrag. Kopf: bei `order` in `pd-order-head` ein `<span class="pd-total">Arbeitszeit gesamt: {fmtMinutes(totalMinutes)}</span>`; ohne `order` als erste Zeile des Abschnitts „Arbeiten am Projekt“; bei 0 nichts.

- [ ] **Step 1: Failing tests:** normales Blatt 60 min + Andrej „Farbkonzept“ → `supports: [{name:'Andrej', task:'Farbkonzept', minutes:30}]`, `minutes 60`; zwei Git-Pushs am selben Tag je mit einem Unterstützer → ein Eintrag mit zwei `supports`; `workTotalMinutes` über diese Einträge; Kommentar mit `supporters` → kein Eintrag; `supporters:'kaputt'` → `supports: []`.
- [ ] **Step 2:** → FAIL.
- [ ] **Step 3:** Implementieren (Server + `app.js` + CSS: `.pd-supports` eingerückt, gleiche Schriftgröße wie `.pd-entry-meta`).
- [ ] **Step 4:** `npm test` grün; UI-Blick mit dem statischen Fixture-Server aus [[kundenportal-testing]] (Projektdetails mit `work`-Fixture inkl. `totalMinutes` und `supports`, Desktop + 390 px Breite, Screenshot in den SDD-Ordner).
- [ ] **Step 5:** Commit „Unterstützung: eigene Zeilen und Gesamtzeit in den Projektdetails“.

### Task 9: Push-Zeitmail nur in 15-Minuten-Schritten

**Files:**
- Modify: `server/services/pushTimeEntry.js` (`parseMinutes` Z. ~40–47), `server/routes/pushTime.js` (Formular Z. ~153–156)
- Test: `test/pushTimeEntry.test.js` bzw. `test/pushTimeRoute.test.js` erweitern

**Interfaces:** `parseMinutes(raw)` akzeptiert nur ganze Vielfache von 15 in 15–720, sonst `null`. Das Formular wird ein `<select name="minutes">` mit 15 … 720 in 15er-Schritten (Label wie `formatMinutes`), vorausgewählt `minutes` aus der Query bzw. 60. `QUICK_MINUTES` bleibt.

- [ ] **Step 1: Failing tests:** `parseMinutes('45')`=45, `'720'`=720, `'70'`=null, `'0'`=null, `'735'`=null; Route-Test: GET `/zeit/<token>` enthält `<select name="minutes"` mit 48 `<option`; POST `minutes=70` → Fehlerseite, kein Schreiben.
- [ ] **Step 2:** → FAIL.
- [ ] **Step 3:** Implementieren; Fehlertext „Bitte eine Zeit in 15-Minuten-Schritten wählen.“
- [ ] **Step 4:** `npm test` grün.
- [ ] **Step 5:** Commit „Push-Zeitmail: Zeit nur in 15-Minuten-Schritten“.

### Task 10: Abo-Bedingungen Fassung 5

**Gate:** Vor Step 3 den endgültigen § 4-Text (Spec, Abschnitt Verträge) dem Nutzer im Chat vorlegen und auf sein OK warten.

**Files:**
- Create: `public/vertragsunterlagen/v4/abo-bedingungen.html` + `public/vertragsunterlagen/v4/WEBklar-Abo-Vertragsunterlagen.pdf` (bytegleiche Kopien der heutigen Fassung 4)
- Modify: `public/abo-bedingungen.html` (§ 4 neuer Satz nach der Rundungsregel; Kopf „Version 5 · Stand {Datum}“ an beiden Stellen), `server/config.js` (`termsVersion: '{yyyy-mm-dd}-v5'` Z. ~158), `server/services/products.js` (`isTermsV4`/`termsDocFor` Z. ~28–55), `scripts/build-legal-pdfs.sh`, `public/WEBklar-Abo-Vertragsunterlagen.pdf` (neu erzeugt), `test/legalTexts.test.js`, `test/products.test.js`, alle Fundstellen von `isTermsV4`/`-v4` (`server/routes/abo.js`, `test/mailTemplates.test.js`, `server/mail-templates/K01 Vertragsbestaetigung.html`)
- `{Datum}` = Tag der Umsetzung; verschiebt sich der Livegang, im Livegang-Schritt anpassen.

**Interfaces:**
- Produces (`products.js`): `isCurrentTerms(v): boolean` (endet auf `-v5`), `isTermsV4OrNewer(v): boolean` (endet auf `-v4` oder `-v5`), `termsDocFor(v)`: `-v5` → `{ url:'/abo-bedingungen.html', pdfFile:'WEBklar-Abo-Vertragsunterlagen.pdf', endParagraph:'§ 11' }`; `-v4` → `{ url:'/vertragsunterlagen/v4/abo-bedingungen.html', pdfFile:'vertragsunterlagen/v4/WEBklar-Abo-Vertragsunterlagen.pdf', endParagraph:'§ 11' }`; sonst v3 wie bisher. `contractAttachmentFor` liefert als `filename` den Basisnamen. Alle bisherigen Aufrufer von `isTermsV4`, die „aktuelle Fassung“ meinen, nutzen `isCurrentTerms`; wo „Fassung 4 oder neuer“ gemeint ist (Hosting/Zusatzspeicher/Wechsel), `isTermsV4OrNewer`. `isTermsV4` entfällt.

- [ ] **Step 1: Failing tests** (`legalTexts.test.js`): Fassung 4 bytegleich archiviert (sha256 HTML = `git show origin/main:public/abo-bedingungen.html`, fest eingetragen wie V3_SHA256); Fassung 5 enthält „Version 5“, nicht „Version 4“, § 4 enthält „die Hälfte der Arbeitszeit dieses Arbeitsschritts“, „aufgerundet auf volle 15 Minuten“, „jede Unterstützung mit Person, Tätigkeit und angerechneter Zeit“; Widerrufsbelehrung + Formular wortgleich mit Fassung 4. `products.test.js`: `termsDocFor` für `-v5`, `-v4`, `-v3`, `undefined`.
- [ ] **Step 2:** `npm test` → FAIL.
- [ ] **Step 3:** Nach OK des Nutzers: Archiv anlegen, Text einfügen, Version hochziehen, Code anpassen, PDFs mit `scripts/build-legal-pdfs.sh` neu erzeugen. Weitere Fundstellen der Rundungs-/Stundenregel suchen (`grep -rn "15 Minuten" public server/mail-templates`), bei Abweichung angleichen.
- [ ] **Step 4:** `npm test` grün; PDF öffnen und § 4 prüfen (Seitenumbruch, Kopfzeile „Version 5“).
- [ ] **Step 5:** Commit „Abo-Bedingungen Fassung 5: Unterstützung in § 4, Fassung 4 archiviert“.

## webklar.com

### Task 11: AGB § 9 Absatz 2

**Gate:** Endgültigen Text dem Nutzer vorlegen (zusammen mit Task 10 möglich), OK abwarten.

**Files:**
- Vorher: `git -C /home/webklar/apps/webklar.com/dev-agb-haftung fetch origin && git … rebase origin/main` (f40e889 liegt noch auf 1637a4a; main ist 3c9a879), node_modules-Symlink prüfen.
- Modify: `src/pages/AGB.tsx` (§ 9, Z. ~188–198: neuer zweiter Listenpunkt, bisherige 2 und 3 werden 3 und 4)
- Test: `src/test/agb-verguetung.test.tsx`

Text (vollständig ausgeschrieben, kein Verweis): „Wird nach Aufwand abgerechnet, erfasst WEBklar die Arbeitszeit je Arbeitsschritt in Schritten von 15 Minuten; angefangene 15 Minuten werden aufgerundet. Wirkt eine weitere Person unterstützend mit, rechnet WEBklar für sie die Hälfte der Arbeitszeit des Arbeitsschritts an, aufgerundet auf volle 15 Minuten; bei mehreren unterstützenden Personen gilt das für jede. Jeder Arbeitsschritt und jede Unterstützung ist im Kundenportal einsehbar.“ (AGB sprechen von „WEBklar“ in der dritten Person, daher angepasst.)

- [ ] **Step 1: Failing test:** § 9 hat 4 Absätze; Absatz 1 unverändert „Die Vergütung ergibt sich aus dem Angebot.“; Absatz 2 = Text oben; Absatz 4 „Für die Abos gelten die Vertragsbedingungen für die WEBklar-Abos.“
- [ ] **Step 2:** `npx vitest run src/test/agb-verguetung.test.tsx` → FAIL.
- [ ] **Step 3:** Absatz einfügen; prüfen, ob irgendwo auf „§ 9 Abs. 2/3“ der AGB verwiesen wird (`grep -rn "9 Abs" src` in webklar.com und `public/` des Portals) und anpassen.
- [ ] **Step 4:** `npx vitest run` grün (inkl. `agb-haftung.test.tsx`); `npm run build` Exit 0.
- [ ] **Step 5:** Commit „AGB § 9: Zeiterfassung in 15-Minuten-Schritten und Unterstützung“.

## Livegang (nur mit OK des Nutzers, in dieser Reihenfolge)

- [ ] 1. Nutzer: `cd /home/webklar/apps/ticket.webklar.com/dev-unterstuetzung && APPWRITE_API_KEY=… node scripts/setup-supporters.mjs` → „available“.
- [ ] 2. Portal: `git -C …/kundenbereich.webklar.com/dev-unterstuetzung push origin feature/unterstuetzung:main`; prüfen: Deploy-Marker/Commit im Container, `/api/projects/:id/work` liefert `totalMinutes`, Stundenkonto lädt, `/abo-bedingungen.html` zeigt „Version 5“, `/vertragsunterlagen/v4/abo-bedingungen.html` erreichbar.
- [ ] 3. WOMS: `git -C …/ticket.webklar.com/dev-unterstuetzung push origin feature/unterstuetzung:test`; prüfen: Live-Bundle enthält „Ich habe unterstützt“, Arbeitszeit-Auswahl vorhanden.
- [ ] 4. webklar.com: `git -C …/webklar.com/dev-agb-haftung push origin fix/agb-haftung:main`; `/agb` zeigt § 9 Abs. 2 und § 11 neu.
- [ ] 5. Nutzer lädt in WOMS „Rechtliches“ die neuen Versionen hoch (Abo-Bedingungen v5 PDF, AGB neue Version) mit Änderungsnotiz.
- [ ] 6. Lesender Check mit echten Daten im Chrome des Nutzers: ein Arbeitsblatt mit Unterstützung anlegen (Test-Ticket), Portal-Projektansicht zeigt die Zeile und Gesamtzeit.
- [ ] 7. Memory aktualisieren (woms-ticketsystem, webklar-kundenportal, webklar-website).
