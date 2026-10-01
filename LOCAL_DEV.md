# Lokale Entwicklung (Appwrite)

## Warum funktioniert es auf dem Server, aber nicht mit `npm run dev`?

| | Server (`ticket.webklar.com`) | Lokal (`localhost:5173`) |
|---|---|---|
| App-URL | `https://ticket.webklar.com` | `http://localhost:5173` |
| API-URL | `https://ticket.webklar.com/v1` (nginx-Proxy) | oft `https://ticket.webklar.com/v1` direkt |
| **Gleiche Origin?** | Ja | **Nein** (Cross-Origin) |
| Session-Cookie | `domain=.ticket.webklar.com` | Browser speichert Cookie **nicht** fùr localhost |

Auf dem Server leitet nginx `/v1/` an Appwrite weiter und schreibt Cookies auf `ticket.webklar.com` um. Die React-App und die API sind **dieselbe Site** ù Login funktioniert.

Lokal ruft der Browser die API auf einer **anderen Domain** auf. Appwrite setzt Cookies fùr `.ticket.webklar.com`. Die werden bei Requests von `localhost:5173` **nicht mitgeschickt** ? `guests missing scopes`, Login scheint tot.

CORS fùr `http://localhost:5173` ist auf dem Server erlaubt ù das reicht allein nicht fùr HttpOnly-Session-Cookies.

## Lùsung: Vite-Proxy + `.env.local`

1. Datei anlegen (nicht in Git):

   ```bash
   cp .env.example .env.local
   ```

2. In `.env.local` muss stehen:

   ```env
   VITE_APPWRITE_ENDPOINT=http://localhost:5173/v1
   VITE_APPWRITE_PROJECT_ID=6a1058610003c5a13a05
   VITE_APPWRITE_DATABASE_ID=woms-database
   VITE_APPWRITE_BUCKET_ID=woms-attachments
   ```

3. Dev-Server starten:

   ```bash
   npm install
   npm run dev
   ```

`vite.config.js` leitet `/v1` an `https://ticket.webklar.com` weiter und schreibt Cookie-Domains auf `localhost` um ù Verhalten wie nginx auf dem Server.

## Fehler: ÑFailed to load resourceì / **504** in der Konsole

Typisch bei `VITE_APPWRITE_ENDPOINT=http://localhost:5173/v1`: Der Vite-Proxy erreicht Appwrite nicht rechtzeitig.

1. **Neuesten Code holen** (`git pull`) ó Proxy zeigt jetzt direkt auf `appwrite.webklar.com` mit l‰ngerem Timeout.
2. Dev-Server **komplett stoppen** (Strg+C) und neu starten: `npm run dev`
3. In `.env.local` pr¸fen:
   ```env
   VITE_APPWRITE_ENDPOINT=http://localhost:5173/v1
   ```
4. Im Browser **Network**-Tab: Welche URL liefert 504?
   - `http://localhost:5173/v1/...` ? Proxy/Netzwerk (Firewall, VPN, Server nicht erreichbar)
   - `https://ticket.webklar.com/v1/...` ? ohne Proxy; Endpoint in `.env.local` auf `localhost:5173` stellen
5. Test im Terminal (ersetzt 5173 durch deinen Vite-Port):
   ```bash
   curl -sS -o /dev/null -w "%{http_code}\n" http://localhost:5173/v1/health \
     -H "X-Appwrite-Project: 6a1058610003c5a13a05"
   ```
   Erwartung: **401** (nicht 504) ó dann ist der Proxy ok.

**Notfall ohne Proxy:** In `.env.local` tempor‰r `VITE_APPWRITE_ENDPOINT=https://ticket.webklar.com/v1` ó Login-Cookies funktionieren lokal dann oft nicht, aber du siehst ob der Server erreichbar ist.

## Checkliste bei Problemen

- [ ] `.env.local` existiert (`.env` allein reicht; Vite lùdt `.env.local` mit hùherer Prioritùt)
- [ ] Endpoint ist `http://localhost:5173/v1`, **nicht** `https://appwrite.webklar.com/v1` (altes Projekt)
- [ ] Nach Login: DevTools ? Application ? Cookies ? `localhost` ? `a_session_6a1058610003c5a13a05`
- [ ] Appwrite Console ? Projekt **Ticket-System** ? Platforms ? `localhost` eingetragen

## Git / Deploy

- `.env` und `.env.local` sind in `.gitignore` ù jeder Entwickler braucht eigene `.env.local`
- Server-Build nutzt Container-Env (`VITE_APPWRITE_ENDPOINT=https://ticket.webklar.com/v1`)
- Push nach Gitea deployt nur den **Frontend-Code**, nicht deine lokale `.env.local`
