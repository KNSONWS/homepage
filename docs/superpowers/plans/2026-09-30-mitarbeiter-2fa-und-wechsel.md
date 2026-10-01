# Mitarbeiter-2FA per E-Mail-Code + Wechsel Ticketsystem ⇄ Projekt-Admin – Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mitarbeiter melden sich in Ticketsystem und Projekt-Admin nur mit Passwort + E-Mail-Code an (Appwrite-MFA), und ein Seitenleisten-Eintrag wechselt ohne zweiten Login ins Projekt-Admin, ein Kopfzeilen-Button zurück.

**Architecture:** Appwrite 1.8.1 erzwingt den zweiten Faktor (`user.mfa` + `emailVerification`). Das Ticketsystem (React, SDK 13) ruft die MFA-Endpunkte über `client.call` auf; das Kundenportal (Express) führt beim Mitarbeiter-Login die Challenge serverseitig mit der Appwrite-Sitzung aus der Login-Antwort durch. Der Wechsel nutzt die vorhandenen Einmal-Tokens aus `staffPreviewTokens.js` mit neuem `purpose: 'switch'`.

**Tech Stack:** Kundenportal: Node/Express, `node --test`, Appwrite-Nachbau `test/support/appwriteMock.js`. Ticketsystem: React 18 + Vite, Appwrite-Web-SDK 13.0.2, neu `node --test` für reine Module; UI-Prüfung per esbuild-Harness + Playwright im Scratchpad (Rezept: Memory „woms-ticketsystem“, `MemoryMax` beachten).

**Spec:** `docs/superpowers/specs/2026-09-30-mitarbeiter-2fa-und-wechsel-design.md` (dieser Worktree)

**Repos / Worktrees:**
- Ticketsystem: `/home/webklar/apps/ticket.webklar.com/dev-2fa`, Branch `feature/mitarbeiter-2fa` (von `origin/test` 3b6a821). `node_modules` ist getrackt → nur `git add <dateien>`, nie `-A`. **Nie pushen** (Webhook deployt jeden Branch).
- Kundenportal: `/home/webklar/apps/kundenbereich.webklar.com/dev-2fa`, Branch `feature/mitarbeiter-2fa` von `origin/main` (d5c70a5), anlegen in Task 1 (`git -C build worktree add -b feature/mitarbeiter-2fa ../dev-2fa origin/main`, `node_modules` als Symlink auf `../build/node_modules`). Nicht pushen.

## Global Constraints

- Appwrite-Endpunkte (1.8.1): `POST /v1/account/mfa/challenges {factor:'email'}` → `{ $id, expire }`; `PUT /v1/account/mfa/challenges {challengeId, otp}`; Admin: `PATCH /v1/users/:id/mfa {mfa}`, `PATCH /v1/users/:id/verification {emailVerification}`.
- Fehlertypen: `user_more_factors_required` (401, halbe Sitzung), `user_invalid_token` (401, Code falsch/abgelaufen), `user_email_not_verified`, `general_rate_limit_exceeded` / Status 429.
- Code gilt 1 Stunde (Appwrite). Offene Portal-Code-Anmeldung: 10 Minuten, max. 5 Fehlversuche.
- Einmal-Link: 60 s, einmalig, `purpose: 'switch'`; Preview-Tokens ohne `purpose` gelten als `'preview'`.
- MFA-Aufrufe senden `X-Appwrite-Locale: de`.
- Texte (wörtlich, in beiden Systemen gleich):
  - Hinweis: `Wir haben dir einen Code an {maskierteEmail} geschickt.`
  - Feld-Label: `Code aus der E-Mail`; Buttons: `Anmelden`, `Code erneut senden`, `Abbrechen`, (halbe Sitzung beim Laden) `Code senden`
  - `user_invalid_token` → `Code falsch oder abgelaufen.`
  - 429 → `Zu viele Versuche. Bitte warte einige Minuten.`
  - `user_email_not_verified` → `2FA ist für dein Konto noch nicht eingerichtet – bitte Kenso Bescheid geben.`
  - Portal nach 5 Fehlversuchen / abgelaufen → `Bitte melde dich erneut an.`
- E-Mail-Maskierung: erstes Zeichen des lokalen Teils + `…@` + Domain (`kenso@webklar.com` → `k…@webklar.com`).
- Seitenleiste: Label `Projekt-Admin`, Icon `IconExternalLink`; Kopfzeile Portal: `← Ticketsystem` → `https://ticket.webklar.com/tickets`.
- Kunden-Login und Mitarbeiter mit `mfa = false` verhalten sich exakt wie heute.

## Review Focus

1. **Portal-Umgehung:** Mitarbeiter mit `mfa = true` darf nach `POST /api/auth/login` **kein** `webklar_portal_session`- und kein Preview-Cookie bekommen – Test in Task 3.
2. **Reload mit halber Sitzung im Ticketsystem:** darf keine Mail automatisch auslösen und nicht in einer Login-Schleife enden – Test in Task 6 (UI-Harness).
3. **Token-Verwechslung:** Ein Switch-Token darf nicht über `/api/auth/staff-preview` einlösbar sein und umgekehrt – Test in Task 4.
4. **Halbe Sitzung beim Wechsel:** JWT aus halber Sitzung → `/account` 401 → `switch-link` 401, kein Token – Test in Task 4.
5. **Abbrechen/Neu-Login mit halber Sitzung im Ticketsystem:** `deleteSessions()` vor dem Neu-Login muss auch mit halber Sitzung klappen (in Appwrite zur MFA-Gruppe gehörend? – wenn nicht, wird der Fehler geschluckt wie heute und die lokale Sitzung trotzdem gelöscht) – Test in Task 5.

---

## Teil A – Kundenportal (`kundenbereich.webklar.com/dev-2fa`)

### Task 1: Appwrite-Sitzung aus dem Login + MFA-Aufrufe im Namen der Sitzung

**Files:**
- Modify: `server/services/appwriteClient.js` (`appwriteFetch`, `loginWithAppwrite`)
- Modify: `test/support/appwriteMock.js` (Sessions + MFA-Nachbau)
- Test: `test/staffMfa.test.js` (neu, erster Teil)

**Interfaces:**
- Produces:
  - `loginWithAppwrite(email, password) → { $id, email, name: '', sessionCookie: string }` (`sessionCookie` = Wert von `a_session_<projectId>` aus `set-cookie`, sonst `''`).
  - `appwriteSessionFetch(path, { method, body, sessionCookie }) → data` – wie `appwriteFetch`, zusätzlich Header `Cookie: a_session_<projectId>=<sessionCookie>` und `X-Appwrite-Locale: de`; Fehler mit `.status`, `.type` wie `appwriteFetch`.
  - Mock: `POST /v1/account/sessions/email` (setzt `set-cookie a_session_<project>=sess-<userId>`; Nutzer aus `mock.addUser({ $id, email, password, mfa, emailVerification, labels })`), `GET /v1/users/:id` liefert `mfa`, `emailVerification`, `labels`, `email`; `GET /v1/account` mit Cookie → 401 `user_more_factors_required` solange mfa und Faktor fehlt; `POST/PUT /v1/account/mfa/challenges` (OTP abrufbar über `mock.lastOtp(userId)`, `mock.expireChallenges()`); `PATCH /v1/users/:id/mfa`, `PATCH /v1/users/:id/verification`; Zähler `mock.mailsSent(userId)`.

- [ ] **Step 1:** Worktree anlegen (siehe Kopf), `npm test` im Worktree → alle bestehenden Tests grün (Ausgangslage notieren).
- [ ] **Step 2: Failing test** in `test/staffMfa.test.js`:
  - `loginWithAppwrite liefert sessionCookie` → `assert.equal(user.sessionCookie, 'sess-u_staff')`.
  - `appwriteSessionFetch schickt Cookie und Locale` → Challenge anlegen, `mock.mailsSent('u_staff') === 1`, Mock hat Header `x-appwrite-locale: de` gesehen.
- [ ] **Step 3:** `npm test` → FAIL (`sessionCookie` undefined / Funktion fehlt).
- [ ] **Step 4:** Implementieren: `appwriteFetch` gibt intern auch die Response-Header zurück (`response.headers.getSetCookie()`), `loginWithAppwrite` nimmt das Cookie `a_session_${config.appwrite.projectId}`; `appwriteSessionFetch` exportieren. Mock erweitern.
- [ ] **Step 5:** `npm test` → PASS (alle).
- [ ] **Step 6: Commit** `git add server/services/appwriteClient.js test/support/appwriteMock.js test/staffMfa.test.js && git commit -m "Portal-Login: Appwrite-Sitzung merken, MFA-Aufrufe im Namen der Sitzung"`

### Task 2: Offene Code-Anmeldungen (`staffMfa.js`)

**Files:**
- Create: `server/services/staffMfa.js`
- Test: `test/staffMfa.test.js` (erweitern)

**Interfaces:**
- Consumes: `appwriteSessionFetch` (Task 1).
- Produces:
  - `maskEmail(email: string) → string`
  - `startStaffMfa({ userId, email, sessionCookie }) → Promise<{ key: string, maskedEmail: string }>` – legt Challenge an, Eintrag `{ userId, email, sessionCookie, challengeId, expiresAt: now+10min, attempts: 0 }` in einer `Map`.
  - `verifyStaffMfa(key, otp) → Promise<{ ok: true, userId, email } | { ok: false, reason: 'invalid' | 'gone' }>` – `invalid` bei `user_invalid_token` (attempts+1; beim 5. Fehlversuch Eintrag löschen → danach `gone`), `gone` bei unbekanntem/abgelaufenem Schlüssel; bei Erfolg Eintrag löschen. Andere Fehler (z. B. 429) werden geworfen.
  - `resendStaffMfa(key) → Promise<boolean>` – neue Challenge, `challengeId` ersetzen; `false` wenn Eintrag weg.
  - `MFA_COOKIE = 'webklar_portal_mfa'`

- [ ] **Step 1: Failing tests:**
  - `maskEmail`: `'kenso@webklar.com' → 'k…@webklar.com'`, `'a@b.de' → 'a…@b.de'`, `'' → ''`.
  - `richtiger Code`: start → `verifyStaffMfa(key, mock.lastOtp('u_staff'))` → `{ ok: true, userId: 'u_staff', email }`; zweiter Aufruf mit gleichem Key → `{ ok:false, reason:'gone' }`.
  - `falscher Code 5x`: vier Mal `reason:'invalid'`, fünfter `invalid`, sechster `gone`.
  - `abgelaufen`: Zeit per `Date.now`-Stub +11 min → `gone`.
  - `resend`: `mock.mailsSent` steigt auf 2, alter OTP ungültig (`invalid`), neuer gültig.
- [ ] **Step 2:** `npm test` → FAIL (Modul fehlt).
- [ ] **Step 3:** `server/services/staffMfa.js` implementieren (Schlüssel `randomBytes(32).toString('hex')`, Aufräumen wie `staffPreviewTokens.purgeExpired`).
- [ ] **Step 4:** `npm test` → PASS.
- [ ] **Step 5: Commit** `git add server/services/staffMfa.js test/staffMfa.test.js && git commit -m "Portal: offene Mitarbeiter-Code-Anmeldungen (staffMfa)"`

### Task 3: Login-Route mit Code-Schritt + Login-Seite

**Files:**
- Create: `server/services/staffAccount.js` (verschiebt `resolveStaffAccount` aus `routes/auth.js` unverändert, exportiert)
- Modify: `server/routes/auth.js` (Login, neue Routen, Helfer `startStaffPortalSession`)
- Modify: `public/login.html`, `public/app.js` (`initLoginPage`), `public/login.css` (nur falls nötig)
- Test: `test/staffLogin.test.js` (neu, mit `startTestApp({ '/api/auth': authRoutes })`)

**Interfaces:**
- Consumes: Task 1 + 2.
- Produces:
  - `resolveStaffAccount(appwriteUserId, email, account) → { isAdmin, name, email } | null` (aus `server/services/staffAccount.js`).
  - In `auth.js` lokal: `startStaffPortalSession(res, { userId, staff }) → Promise<void>` (setzt Portal-Sitzung + Preview-Cookie exakt wie heute der Mitarbeiter-Zweig; wird in Task 4 von `staff-switch` genutzt – deshalb exportieren als benannten Export).
  - `POST /api/auth/login`: Mitarbeiter mit `account.mfa === true` → Status 200 `{ mfaRequired: true, email: maskedEmail }` + signiertes httpOnly-Cookie `webklar_portal_mfa` (10 min, `sameSite: 'lax'`, `secure` wie Portal-Cookie); **keine** Portal-Sitzung.
  - `POST /api/auth/login/mfa {otp}` → 200 `{ success:true, role:'admin', admin }` | 401 `{ error:'Code falsch oder abgelaufen.' }` | 410 `{ error:'Bitte melde dich erneut an.' }` (+ MFA-Cookie löschen) | 429.
  - `POST /api/auth/login/mfa/resend` → 200 `{ success:true }` | 410.

- [ ] **Step 1: Failing tests** (`test/staffLogin.test.js`):
  - `Kunde ohne MFA: unverändert` → 200, Portal-Cookie gesetzt, kein `mfaRequired`.
  - `Mitarbeiter ohne MFA: unverändert` → 200 `role:'admin'`, Portal-Cookie gesetzt.
  - `Mitarbeiter mit MFA: kein Portal-Cookie vor dem Code` → 200 `{ mfaRequired:true, email:'k…@webklar.com' }`; `set-cookie` enthält `webklar_portal_mfa`, **nicht** `webklar_portal_session` und nicht das Preview-Cookie. `GET /api/auth/me` mit diesem Cookie-Stand → `authenticated:false`.
  - `richtiger Code` → 200 `role:'admin'`, Portal-Cookie gesetzt, MFA-Cookie gelöscht; `/me` → `role:'admin'`.
  - `falscher Code` → 401 Text wörtlich; nach 5 falschen → 410 `Bitte melde dich erneut an.`.
  - `ohne MFA-Cookie` → 410.
  - `resend` → 200, `mock.mailsSent` = 2.
- [ ] **Step 2:** `npm test` → FAIL.
- [ ] **Step 3:** Server implementieren: `resolveStaffAccount` verschieben; im Login nach `resolveStaffAccount` bei `account?.mfa === true` → `startStaffMfa`, sonst unverändert `startStaffPortalSession`. `staff` für den späteren Erfolg wird bei `verify` neu per `getUserById` + `resolveStaffAccount` ermittelt (nicht im Speicher halten).
- [ ] **Step 4:** `npm test` → PASS (alle, inkl. bestehender).
- [ ] **Step 5:** Login-Seite: bei `result.mfaRequired` Passwort-Formular ausblenden, Code-Schritt zeigen (Texte aus Global Constraints, Feld `inputmode="numeric" autocomplete="one-time-code" maxlength="6"`), `Abbrechen` = Seite neu laden (`/login.html`). Erfolg → `adminLoginTarget()`.
- [ ] **Step 6:** Sichtprüfung mit Playwright gegen den Test-Server aus Step 1 (Mock + App): Passwort → Code-Schritt sichtbar, falscher Code zeigt Text, richtiger Code landet auf `/admin.html`. Screenshot Handy- und Desktop-Breite.
- [ ] **Step 7: Commit** `git add server/services/staffAccount.js server/routes/auth.js public/login.html public/app.js test/staffLogin.test.js && git commit -m "Portal-Login: E-Mail-Code für Mitarbeiter mit 2FA"` (+ `public/login.css`, falls geändert)

### Task 4: Wechsel-Link + Rückweg-Button

**Files:**
- Modify: `server/services/staffPreviewTokens.js`
- Create: `server/routes/admin/switchLink.js`, mount in `server/index.js` als `app.use('/api/admin/switch-link', adminSwitchLinkRoutes)` neben `preview-open`
- Modify: `server/routes/auth.js` (neue Route `GET /staff-switch`, `staff-preview` prüft `purpose`)
- Modify: `public/admin.html` (Button in `.portal-header-actions` vor `#logout-btn`)
- Test: `test/staffSwitch.test.js` (neu)

**Interfaces:**
- Consumes: `resolveStaffAccount` (Task 3), `startStaffPortalSession` (Task 3).
- Produces:
  - `createStaffPreviewToken(payload)` unverändert; `consumeStaffPreviewToken(token, purpose = 'preview')` → `null`, wenn `(entry.purpose || 'preview') !== purpose` (Token wird dabei trotzdem verbraucht).
  - `POST /api/admin/switch-link` (Bearer-JWT): `/account` per JWT (wie `requireAppwriteStaff`, aber ohne Label-Pflicht), dann `getUserById` + `resolveStaffAccount`; kein Mitarbeiter → 403; → 200 `{ openUrl: 'https://<config.preview.baseHost>/api/auth/staff-switch?token=…' }`.
  - `GET /api/auth/staff-switch?token=` → gültig: `startStaffPortalSession` + `302 /admin.html`; sonst `302 /login.html?error=Link%20abgelaufen%2C%20bitte%20anmelden`.
  - Button: `<a class="portal-btn-outline" href="https://ticket.webklar.com/tickets">← Ticketsystem</a>`.

- [ ] **Step 1: Failing tests:**
  - `switch-link ohne JWT` → 401; `ungültiges JWT` → 401; `JWT aus halber Sitzung` (Mock liefert `user_more_factors_required`) → 401.
  - `Kunde` (`jwt-kunde`, kein employee) → 403.
  - `Mitarbeiter ohne admin-Label` (neues Mock-JWT `jwt-staff`, employee-Dokument vorhanden) → 200 mit `openUrl`.
  - `staff-switch gültig` → 302 `/admin.html`, Portal-Cookie `role:'admin'`, `isAdmin` passend.
  - `staff-switch zweimal` → zweiter Aufruf 302 auf `/login.html?error=…`.
  - `staff-switch nach 61 s` → 302 Login.
  - `Switch-Token über staff-preview` → 410; `Preview-Token über staff-switch` → 302 Login.
  - `admin.html enthält Rückweg-Link` → statischer Test: Datei enthält `href="https://ticket.webklar.com/tickets"` innerhalb `portal-header-actions`.
- [ ] **Step 2:** `npm test` → FAIL.
- [ ] **Step 3:** Implementieren.
- [ ] **Step 4:** `npm test` → PASS (alle).
- [ ] **Step 5: Commit** `git add server/services/staffPreviewTokens.js server/routes/admin/switchLink.js server/index.js server/routes/auth.js public/admin.html test/staffSwitch.test.js && git commit -m "Wechsel Ticketsystem → Projekt-Admin per Einmal-Link, Rückweg-Button"`

### Task 5 (Portal): Einrichtungs-Skript `scripts/mitarbeiter-2fa.mjs`

**Files:**
- Create: `scripts/mitarbeiter-2fa.mjs`, `server/services/staffMfaAdmin.js`
- Test: `test/staffMfaAdmin.test.js`

**Interfaces:**
- Produces (`staffMfaAdmin.js`): `listStaffMfaStatus() → Promise<Array<{ userId, name, email, emailVerification, mfa }>>` (alle `employees` mit `userId`); `enableStaffMfa(userId)` (erst verification, dann mfa); `disableStaffMfa(userId)`.
- Skript: `--status` (Tabelle), `--enable <userId>|alle` (zeigt vorher die Adressen, fragt `Ja/Nein` auf stdin; `--yes` überspringt), `--disable <userId>`. Läuft per `docker exec -w /app webklar-kundenbereich-server node scripts/mitarbeiter-2fa.mjs …`.

- [ ] **Step 1: Failing tests:** `listStaffMfaStatus` gegen Mock (2 employees, 1 ohne `userId` → ignoriert); `enableStaffMfa` ruft `verification` **vor** `mfa` (Reihenfolge im Mock protokolliert); `disableStaffMfa` setzt nur `mfa:false`.
- [ ] **Step 2:** FAIL → **Step 3:** implementieren → **Step 4:** `npm test` PASS.
- [ ] **Step 5: Commit** `git add scripts/mitarbeiter-2fa.mjs server/services/staffMfaAdmin.js test/staffMfaAdmin.test.js && git commit -m "Skript: 2FA für Mitarbeiter anzeigen, einschalten, abschalten"`

## Teil B – Ticketsystem (`ticket.webklar.com/dev-2fa`)

### Task 6: MFA-Modul + AuthContext + Login-Seite

**Files:**
- Create: `src/lib/mfa.js`, `tests/mfa.test.mjs`
- Modify: `src/lib/appwrite.js` (`export { client }`), `src/context/AuthContext.jsx`, `src/pages/LoginPage.jsx`, `package.json` (`"test": "node --test tests/"`)

**Interfaces:**
- Produces (`src/lib/mfa.js`, **ohne** Import von `appwrite.js`, damit Node es laden kann):
  - `createMfaApi(client) → { createEmailChallenge(): Promise<string /*challengeId*/>, completeChallenge(challengeId, otp): Promise<void> }` – über `client.call(method, new URL(client.config.endpoint + '/account/mfa/challenges'), { 'content-type': 'application/json', 'X-Appwrite-Locale': 'de' }, params)`.
  - `isMoreFactorsError(err) → boolean` (`err?.type === 'user_more_factors_required'`)
  - `mfaErrorMessage(err) → string` (Texte aus Global Constraints; Fallback `err.message || 'Anmeldung fehlgeschlagen'`)
  - `maskEmail(email) → string` (gleiche Regel wie Portal)
- AuthContext-Wert zusätzlich: `mfaPending: null | { challengeId: string | null, email: string }`, `verifyCode(otp) → {success, error?}`, `sendCode() → {success, error?}` (erstmals oder erneut), `cancelMfa() → Promise<void>`. `login()` liefert bei MFA `{ success:false, mfaRequired:true }`.

- [ ] **Step 1: Failing tests** (`tests/mfa.test.mjs`, Fake-Client zeichnet `call`-Argumente auf):
  - `createEmailChallenge` → Methode `post`, Pfad endet auf `/account/mfa/challenges`, Params `{ factor:'email' }`, Header `X-Appwrite-Locale: de`, Rückgabe = `$id`.
  - `completeChallenge('c1','123456')` → Methode `put`, Params `{ challengeId:'c1', otp:'123456' }`.
  - `isMoreFactorsError` true/false; `mfaErrorMessage` für `user_invalid_token`, Code 429, `user_email_not_verified`, sonstige.
  - `maskEmail('kenso@webklar.com') === 'k…@webklar.com'`.
- [ ] **Step 2:** `npm test` → FAIL.
- [ ] **Step 3:** `mfa.js` implementieren → `npm test` PASS.
- [ ] **Step 4:** AuthContext:
  - `login()`: nach `createSessionWithCleanup` → `account.get()`; `isMoreFactorsError` → `sendCode()` + `mfaPending` setzen → `{ success:false, mfaRequired:true }`.
  - `checkUser()`: `isMoreFactorsError` → `mfaPending = { challengeId: null, email: '' }`, **keine** Mail, `user` bleibt `null`, lokale Sitzung **nicht** löschen (anders als bei anderen 401).
  - `verifyCode`: `completeChallenge` → `account.get()` → `setUser`, `ensureEmployeeExists`, `mfaPending = null`.
  - `cancelMfa`: `account.deleteSession('current')` (Fehler schlucken), `clearAllLocalAppwriteSessions()`, `mfaPending = null`.
  - E-Mail für den Hinweis: beim Login aus dem Formular; beim Reload unbekannt → Hinweis ohne Adresse `Wir schicken dir einen Code an deine E-Mail-Adresse.` bis `Code senden` gedrückt ist.
- [ ] **Step 5:** LoginPage: bei `mfaPending` Code-Schritt statt Passwort-Formular (Texte wörtlich; `Code senden` nur wenn `challengeId === null`, sonst Codefeld + `Code erneut senden`); `/login` leitet wie bisher nur bei `user` weiter.
- [ ] **Step 6:** UI-Harness (Scratchpad, esbuild + Playwright, Appwrite per `page.route` nachgebaut, Rezept aus Memory): Checks
  - Login ohne MFA → `/tickets`.
  - Login mit MFA → Code-Schritt, Hinweis `k…@webklar.com`, **1** Challenge-POST.
  - falscher Code → `Code falsch oder abgelaufen.`; richtiger Code → `/tickets`.
  - `Code erneut senden` → 2. Challenge-POST.
  - Reload mit halber Sitzung → Code-Schritt mit `Code senden`, **0** Challenge-POSTs, keine Weiterleitungsschleife (URL bleibt `/login`, max. 1 `GET /account`).
  - `Abbrechen` → `DELETE /account/sessions/current`, Passwort-Formular sichtbar; danach neuer Login möglich, auch wenn der Mock `DELETE /account/sessions` mit 401 beantwortet.
  - 429 beim Challenge-POST → Text `Zu viele Versuche. Bitte warte einige Minuten.`
- [ ] **Step 7:** `npx vite build` im Worktree (unter `systemd-run --scope -p MemoryMax=700M -p MemorySwapMax=0`) → Build ok.
- [ ] **Step 8: Commit** `git add src/lib/mfa.js tests/mfa.test.mjs src/lib/appwrite.js src/context/AuthContext.jsx src/pages/LoginPage.jsx package.json && git commit -m "Login mit E-Mail-Code (Appwrite-2FA)"`

### Task 7: Seitenleisten-Eintrag „Projekt-Admin“

**Files:**
- Modify: `src/components/Navbar.jsx`, `src/lib/employeeAdminApi.js` (oder neue kleine `src/lib/projectAdminSwitch.js` im gleichen Stil)

**Interfaces:**
- Consumes: `POST /api/admin/switch-link` (Task 4).
- Produces: `openProjectAdmin() → Promise<void>` – `account.createJWT()`, POST, `window.location.assign(openUrl)`; bei Fehler `window.location.assign('https://project.webklar.com/login.html')`.

- [ ] **Step 1:** Eintrag als `<button className="side-link">` (kein `<Link>`, externes Ziel) nach der Linkliste in derselben `side-group`, Icon `IconExternalLink`, Label `Projekt-Admin`, während des Ladens `disabled`; im eingeklappten Zustand `title` gesetzt wie die anderen.
- [ ] **Step 2:** UI-Harness-Checks: Eintrag für Mitarbeiter ohne Admin-Rolle sichtbar; Klick → genau 1 POST auf `https://project.webklar.com/api/admin/switch-link` mit `Authorization: Bearer …`, danach Navigation auf `openUrl`; Fehlerantwort 500 → Navigation auf `…/login.html`.
- [ ] **Step 3:** `npm test` + `vite build` ok.
- [ ] **Step 4: Commit** `git add src/components/Navbar.jsx src/lib/employeeAdminApi.js && git commit -m "Seitenleiste: direkt ins Projekt-Admin wechseln"`

## Teil C – Livegang (nur mit OK des Nutzers)

### Task 8: Code-Mail-Vorlage + Übergabe

**Files:**
- Create: `docs/superpowers/specs/2026-09-30-mfa-mailvorlage.html` (Ticketsystem-Worktree) – Betreff `Dein Anmeldecode für WEBklar`, HTML im Stil der Portal-Vorlagen (`dev-mailvorlagen`/`server/mail-templates`), Platzhalter `{{otp}}`, Text `Der Code gilt 1 Stunde.` und `Nicht du? Dann ändere bitte dein Passwort.`

- [ ] **Step 1:** Vorlage erstellen, lokal mit `{{otp}} = 123456` rendern, Screenshot an den Nutzer.
- [ ] **Step 2:** Übergabe an den Nutzer mit genauer Reihenfolge:
  1. Portal: `git -C /home/webklar/apps/kundenbereich.webklar.com/dev-2fa push origin feature/mitarbeiter-2fa:main` – danach Live-Check: `POST /api/admin/switch-link` ohne JWT → 401, Login-Seite lädt.
  2. Ticketsystem: `git -C /home/webklar/apps/ticket.webklar.com/dev-2fa push origin feature/mitarbeiter-2fa:test` – danach Live-Check Bundle enthält `Projekt-Admin`.
  3. Nutzer hinterlegt Vorlage in der Appwrite-Console (Auth → Templates → MFA-Challenge, Sprache Deutsch).
  4. `--status`, dann `--enable <Kensos userId>`, Nutzer probiert beide Logins + Wechsel, dann `--enable alle`.
- [ ] **Step 3:** Commit der Vorlage (`git add docs/superpowers/specs/2026-09-30-mfa-mailvorlage.html`).
