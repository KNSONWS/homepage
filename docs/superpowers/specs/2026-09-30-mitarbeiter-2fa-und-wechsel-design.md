# Mitarbeiter-2FA per E-Mail-Code + Wechsel Ticketsystem ⇄ Projekt-Admin

Stand: 2026-09-30 · Status: Design vom Nutzer freigegeben (Teil 1 + Teil 2), Spec wartet auf Review

## Ziel

1. Jeder Mitarbeiter-Login (Ticketsystem ticket.webklar.com **und** Projekt-Admin project.webklar.com)
   verlangt nach dem Passwort einen 6-stelligen Code, der per E-Mail kommt. Pflicht für alle
   Mitarbeiter. Kunden bleiben unverändert.
2. Aus der Seitenleiste des Ticketsystems springt man ohne zweiten Login ins Projekt-Admin; aus dem
   Projekt-Admin führt ein Button zurück ins Ticketsystem.

Entscheidungen des Nutzers: E-Mail-Code statt TOTP/KeePass; 2FA über Appwrite selbst (Variante A),
nicht als reine Oberflächen-Sperre; Pflicht für alle Mitarbeiter.

## Ausgangslage (geprüft)

- Beide Systeme nutzen dieselben Appwrite-Konten (Appwrite **1.8.1**, Projekt `6a1058610003c5a13a05`).
- Appwrite verschickt bereits Mails: `_APP_SMTP_HOST=mail.your-server.de:587`, Absender
  `WEBklar <noreply@webklar.com>`.
- Appwrite-MFA (1.8.1): Ist `user.mfa = true` und die E-Mail bestätigt (`emailVerification = true`),
  braucht jede Sitzung 2 Faktoren. Eine Passwort-Sitzung hat nur den Faktor `password`; jeder
  Nicht-MFA-Aufruf liefert dann `401 user_more_factors_required`. Das gilt auch für **bereits
  bestehende** Sitzungen und für JWTs aus solchen Sitzungen.
  - `POST /v1/account/mfa/challenges` `{factor:'email'}` → `{ $id, expire }`, schickt die Mail
    (Vorlage `mfaChallenge`). Code gilt **1 Stunde**. Limit 10 Anfragen pro Nutzer und Zeitfenster.
  - `PUT /v1/account/mfa/challenges` `{challengeId, otp}` → Sitzung bekommt Faktor `email`.
    Falscher/abgelaufener Code: `401 user_invalid_token`.
  - Server-API mit Key: `PATCH /v1/users/:id/mfa {mfa}`, `PATCH /v1/users/:id/verification {emailVerification}`.
- Ticketsystem: Appwrite-Web-SDK **13.0.2** (kennt kein MFA). AuthContext meldet per
  `createEmailPasswordSession` an und prüft mit `account.get()`.
- Projekt-Admin: `POST /api/auth/login` ruft serverseitig `/account/sessions/email` ohne API-Key auf,
  nimmt nur die `userId` und setzt die Portal-Sitzung (`role: 'admin'`) für Mitarbeiter
  (`resolveStaffAccount`). **Mit MFA wäre das eine Umgehung**, weil die halbe Sitzung reicht.
- `requireAppwriteStaff` (JWT-Prüfung für `/api/admin/*` aus dem Ticketsystem) verlangt das
  Label `admin`. Mitarbeiter ohne Admin-Label kommen per Portal-Login trotzdem ins Projekt-Admin
  (`staff.isAdmin = false`).
- Einmal-Link-Mechanismus existiert: `services/staffPreviewTokens.js` (Map im Speicher, 60 s, einmalig),
  genutzt von `/api/admin/preview-open` → `/api/auth/staff-preview`.
- Projekt-Admin (`public/admin.html`) hat keine Seitenleiste, sondern Kopfzeile + Tabs.

## Teil 1: Anmeldung mit E-Mail-Code

### Ablauf für Mitarbeiter

1. E-Mail + Passwort.
2. Anzeige „Wir haben dir einen Code an k…@webklar.com geschickt“ + 6-stelliges Codefeld
   (`inputmode="numeric"`, `autocomplete="one-time-code"`), Link „Code erneut senden“, Link „Abbrechen“
   (meldet die halbe Sitzung ab, zurück zur Passwort-Eingabe).
3. Richtiger Code → angemeldet. Falscher/abgelaufener Code → „Code falsch oder abgelaufen“, Feld bleibt.

### Ticketsystem (Repo JUSN/tickte-system)

- **Kein SDK-Upgrade.** Neues Modul `src/lib/mfa.js` mit zwei Funktionen über `client.call(...)` des
  vorhandenen SDK-Clients (nutzt dieselbe Sitzung/Cookie-Fallback wie das SDK):
  `createEmailChallenge()` → `challengeId`; `completeChallenge(challengeId, otp)`.
  Beide senden `X-Appwrite-Locale: de`, damit die deutsche Vorlage greift.
- `AuthContext`:
  - neuer Zustand `mfaPending` (`{ challengeId, email }` oder `null`).
  - `login()`: nach der Passwort-Sitzung `account.get()`; bei `user_more_factors_required` →
    Challenge anlegen, `mfaPending` setzen, `{ success: false, mfaRequired: true }` zurück.
  - `checkUser()` beim Laden: gleicher Fall (bestehende halbe Sitzung, z. B. direkt nach dem
    Einschalten) → **keine** neue Mail automatisch, sondern Code-Schritt mit Knopf „Code senden“.
    Grund: jedes Neuladen würde sonst eine Mail auslösen und das Limit (10) aufbrauchen.
  - `verifyCode(otp)`, `resendCode()`, `cancelMfa()` (= `deleteSession('current')`).
  - Nach erfolgreichem Code wie bisher `account.get()` + `ensureEmployeeExists`.
- `LoginPage.jsx`: zweiter Schritt „Code eingeben“; Routing: solange `mfaPending`, führt jede
  geschützte Route auf `/login`.
- Fehlertexte: `user_invalid_token` → „Code falsch oder abgelaufen“; `429`/`general_rate_limit_exceeded`
  → „Zu viele Versuche, bitte einige Minuten warten“; `user_email_not_verified` →
  „2FA ist für dein Konto noch nicht eingerichtet – bitte Kenso Bescheid geben“.

### Projekt-Admin (Repo Kundenportal, project.webklar.com)

- `loginWithAppwrite` liest zusätzlich die Sitzung aus der Antwort (`set-cookie`
  `a_session_<projectId>` via `headers.getSetCookie()`), damit der Server im Namen dieser Sitzung
  weiterarbeiten kann.
- `POST /api/auth/login` für **Mitarbeiter**: Ist `account.mfa === true` (aus `getUserById`), wird
  **keine** Portal-Sitzung gesetzt. Stattdessen:
  - Challenge über die Sitzung anlegen, Eintrag in einer Map im Speicher
    `{ userId, email, appwriteSessionCookie, challengeId, expiresAt: +10 min, attempts: 0 }`
    unter zufälligem Schlüssel; Schlüssel als signiertes, httpOnly-Cookie `webklar_portal_mfa`.
  - Antwort `{ mfaRequired: true, email: <maskiert> }`.
- `POST /api/auth/login/mfa` `{ otp }`: prüft den Code bei Appwrite (`PUT /account/mfa/challenges`
  mit der gespeicherten Sitzung). Erfolg → exakt der bisherige Mitarbeiter-Zweig (Portal-Sitzung +
  Preview-Cookie), Map-Eintrag + Cookie löschen. Max. 5 Fehlversuche pro Eintrag, dann Eintrag weg
  → neu anmelden.
- `POST /api/auth/login/mfa/resend`: neue Challenge für denselben Eintrag.
- Serverneustart verwirft offene Einträge → Nutzer meldet sich neu an (akzeptiert).
- Kunden-Zweig bleibt unverändert (Kunden haben `mfa = false`).
- `public/login.html` + `app.js`: zweiter Schritt mit Codefeld, gleiche Texte wie im Ticketsystem.

### Einmalige Einrichtung (Skript, nach dem Livegang beider Teile)

- Skript `scripts/mitarbeiter-2fa.mjs` im Kundenportal-Repo (läuft im Container mit dem Server-Key):
  - `--status`: listet alle Mitarbeiter (Collection `employees` → `userId`) mit `emailVerification`
    und `mfa`.
  - `--enable [userId|alle]`: setzt `emailVerification = true`, dann `mfa = true`.
  - `--disable <userId>`: Notfall-Schalter, wenn bei einer Person keine Mail ankommt.
  - Vor dem Einschalten wird die E-Mail-Adresse jedes Kontos angezeigt; nur Adressen, die
    tatsächlich Post empfangen, werden bestätigt.
- Wirkung: Alle bestehenden Mitarbeiter-Sitzungen fragen beim nächsten Aufruf nach dem Code.
- Keine Wiederherstellungscodes (Faktor ist das Postfach; Notfall = `--disable`).

### Code-Mail

- Appwrite-Vorlage `mfaChallenge`, Sprache `de`, als eigene Vorlage im Projekt hinterlegt
  (Betreff „Dein Anmeldecode für WEBklar“, Inhalt im Stil der WEBklar-Mailvorlagen: Logo, Code groß,
  „gilt 1 Stunde“, „Nicht du? Dann ändere bitte dein Passwort.“).
- Wird über die Appwrite-Console gesetzt (Auth → Templates) – der Nutzer ist dort eingeloggt; ich
  bereite HTML und Betreff vor.

## Teil 2: Wechsel zwischen Ticketsystem und Projekt-Admin

### Hinweg (Ticketsystem → Projekt-Admin, ohne zweiten Login)

- `Navbar.jsx`: neuer Eintrag **„Projekt-Admin“** mit Symbol `IconExternalLink` nach „Finanzen“ /
  „Admin“, für alle Mitarbeiter sichtbar. Klick → `openProjectAdmin()` → `window.location.assign(openUrl)`
  (selber Tab). Während des Ladens deaktiviert; bei Fehler Fallback auf
  `https://project.webklar.com/login.html`.
- Kundenportal: `POST /api/admin/switch-link` (Bearer-JWT aus dem Ticketsystem):
  - eigene Prüfung statt `requireAppwriteStaff`: JWT gültig (`/account`) **und** `resolveStaffAccount`
    findet einen Mitarbeiter – so kommen auch Mitarbeiter ohne Admin-Label rüber, wie beim normalen
    Login.
  - Antwort `{ openUrl: 'https://project.webklar.com/api/auth/staff-switch?token=…' }`, Token über
    `createStaffPreviewToken` (60 s, einmalig) mit `{ userId, email, name, isAdmin, purpose: 'switch' }`.
- `GET /api/auth/staff-switch?token=…`: `consumeStaffPreviewToken`; nur `purpose === 'switch'`
  akzeptiert (und `staff-preview` akzeptiert umgekehrt keine Switch-Tokens). Setzt Portal-Sitzung +
  Preview-Cookie wie der Mitarbeiter-Login, Redirect `/admin.html`. Ungültig/abgelaufen → Redirect
  `/login.html?error=Link abgelaufen, bitte anmelden`.
- 2FA bleibt gewahrt: Das JWT stammt aus einer Sitzung, die nach Teil 1 nur mit Code voll gültig ist.

### Rückweg (Projekt-Admin → Ticketsystem)

- `admin.html` Kopfzeile: Button **„← Ticketsystem“** (Link `https://ticket.webklar.com/tickets`)
  vor „Abmelden“. Nur in der Admin-Ansicht; im Modus „Als Kunde ansehen“ und bei Kunden nicht.
- Kein automatischer Login in diese Richtung: Ist die Ticketsystem-Sitzung noch aktiv, ist man direkt
  drin, sonst Login mit Code.

## Tests

Mit nachgebautem Appwrite (Mock nach 1.8.1-Verhalten, keine echten Daten):

- Ticketsystem: Login ohne MFA unverändert; Login mit MFA → Code-Schritt; richtiger Code;
  falscher Code; abgelaufener Code; erneut senden; Abbrechen; halbe Sitzung beim Neuladen (keine
  automatische Mail); 429-Text; Seitenleisten-Eintrag öffnet `openUrl`, Fehler → Fallback.
- Projekt-Admin: Kunden-Login unverändert; Mitarbeiter ohne MFA unverändert; Mitarbeiter mit MFA
  bekommt **keine** Portal-Sitzung vor dem Code; richtiger/falscher Code; 5 Fehlversuche; resend;
  switch-link ohne/mit ungültigem JWT (401), mit halber Sitzung (401), Kunde (403), Mitarbeiter ohne
  Admin-Label (200); staff-switch einmalig, abgelaufen, falscher `purpose`; Rückweg-Button nur für
  Mitarbeiter und nicht im „Als Kunde ansehen“-Modus.
- Bestehende Testsuites beider Repos grün.

## Livegang (Reihenfolge)

1. Kundenportal live (Push nach `main` durch den Nutzer bzw. auf sein OK).
2. Ticketsystem live (Push nach `test` durch den Nutzer).
3. Code-Mail-Vorlage in der Appwrite-Console hinterlegen.
4. `mitarbeiter-2fa.mjs --status`, dann zuerst nur für Kenso `--enable`, einmal in beiden Systemen
   durchspielen, dann `--enable alle`.

Ohne Schritt 4 ändert sich für niemanden etwas (MFA aus → Login wie bisher); Teil 2 funktioniert
schon nach Schritt 1+2.

## Nicht enthalten

- TOTP/KeePass, SMS, Wiederherstellungscodes, 2FA für Kunden.
- Automatischer Login vom Projekt-Admin zurück ins Ticketsystem.
- SDK-Upgrade des Ticketsystems.
