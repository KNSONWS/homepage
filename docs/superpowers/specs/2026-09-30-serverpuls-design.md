# Serverpuls – Server-Monitoring in WOMS

Stand: 2026-09-30 · Status: Design vom Nutzer im Chat freigegeben, Spec zur Prüfung

## Ziel

Ein neuer Navbar-Eintrag **Serverpuls** in WOMS (ticket.webklar.com) zeigt Admins die
Auslastung des Servers und das Wachstum der einzelnen Projekte über Tage, Wochen und
Monate – als Verlaufskurven „wie bei Aktien“. Feste Warnregeln (keine KI) melden
Probleme per E-Mail in drei Stufen.

Ausdrücklich **nicht KI-gesteuert**: Messung, Auswertung und Mails laufen
deterministisch in einem kleinen Dienst ohne Claude.

## Rahmenbedingungen

- Server: 8 Kerne, 15 GB RAM, 4 GB Swap (am 2026-09-30 voll), Platte 150 GB (76 % belegt),
  ~61 Container. Der Dienst selbst muss sehr sparsam sein (Limit 128 MB RAM, 0,5 CPU).
- WOMS ist eine statische React/Vite-SPA auf Appwrite; Server-Logik liegt in kleinen
  Node-Diensten hinter dem WOMS-nginx (Vorbild: `ticket-integrations`,
  `/api/integrations/`, Auth über Appwrite-JWT).
- Admin in WOMS = Appwrite-Konto mit Label `admin` (`AuthContext.jsx`).
- Der Deploy-Webhook von WOMS deployt jeden gepushten Branch; live geht nur per Push
  des Nutzers nach `test`.

## Entscheidungen

| Frage | Entscheidung |
|---|---|
| Name | Serverpuls |
| Rolle der KI | keine; feste Warnregeln |
| „Projekt“ | jede App / jeder Container (Previews als eigene Apps) mit CPU, RAM, Speicher |
| Warnkanal | E-Mail in drei Stufen Low / Medium / Critical |
| Mail-Takt | Critical sofort, Medium Sammelmail täglich 07:00, Low Wochenübersicht Mo 07:00 |
| Mail-Adresse | `server@webklar.com` ist Absender **und** einziger Empfänger |
| Umsetzung | eigener schlanker Dienst (kein Beszel, kein Netdata) |
| Sichtbarkeit | nur Admins (Navbar und API) |

## Architektur

```
Host /proc (ro) ──┐
docker-socket-proxy (nur GET containers/stats) ──┼──> serverpuls (Node 22, SQLite) ──> SMTP server@
/home/webklar/apps + Docker-Volumes (ro) ──┘            │
                                                        └── HTTP :8091  <── WOMS-nginx /api/serverpuls/  <── ServerpulsPage (uPlot)
```

### Einheiten

1. **Collector** (`collect/`): liest Messwerte, gibt reine Datenobjekte zurück.
   - `host.js` – `/proc/stat` (CPU % aus Differenz), `/proc/meminfo` (RAM verfügbar,
     Swap), `/proc/loadavg`, Zombies = Prozesse mit State `Z` in `/proc/*/stat`.
     Plattenbelegung `/` per `statfs` auf `/host/apps` (gleiches Dateisystem `/dev/sda1`).
   - `docker.js` – über den Socket-Proxy: Container-Liste (Name, Compose-Projekt/-Service,
     Status, Health, RestartCount) und `stats?stream=false` (CPU %, RAM).
   - `sizes.js` – Größe pro App: Ordner unter `/home/webklar/apps/<app>` plus Docker-
     Volumes der Container dieser App (`du -sb`, unter `nice -n 19 ionice -c3`).
     Außerdem „Aufräumbar“: ungenutzte Images, Build-Cache, gestoppte Container
     (`/system/df` über den Proxy).
2. **App-Zuordnung** (`apps.js`): Container → App über das Label
   `com.docker.compose.service` bzw. den Containernamen; eine kleine Mapping-Datei
   `config/apps.json` erlaubt Umbenennen/Zusammenfassen (z. B. `webklar-ticket-*` →
   „Ticketsystem“) und Ordnerzuordnung. Previews erscheinen einzeln.
3. **Speicher** (`store.js`): SQLite (`node:sqlite`) im Volume `serverpuls-data`.
   - Tabellen: `host_samples`, `app_samples`, `app_sizes`, `cleanup_samples`,
     `alerts` (Zustand), `mail_queue`.
   - Aufbewahrung: Rohwerte (5 min) 7 Tage → Stundenmittel/-max 90 Tage →
     Tageswerte unbegrenzt. Verdichtung täglich 03:30.
   - Erwartete Größe < 100 MB/Jahr.
4. **Regeln** (`rules.js`): reine Funktion `(aktuelle + historische Werte) → Liste aktiver
   Befunde {id, level, titel, wert, seit}`. Schwellen in `config/rules.json`.
5. **Alarmierung** (`alerts.js`): vergleicht Befunde mit gespeichertem Zustand, erzeugt
   Mails (sofort/täglich/wöchentlich), Wiederholungssperre 24 h, „✅ behoben“-Mail beim
   Verschwinden. Zustand in SQLite → Neustart erzeugt keine Doppel-Mails.
6. **Mailer** (`mail.js`): nodemailer, `mail.your-server.de:587` STARTTLS, Login
   `server@webklar.com`. Fehlgeschlagene Mails bleiben in `mail_queue` und werden
   alle 5 min erneut versucht (max. 24 h).
7. **API** (`api.js`): HTTP-Server Port 8091, Basis `/api/serverpuls`. Jede Anfrage
   (außer `/health`) braucht `X-Appwrite-JWT`; der Dienst fragt `/account` bei Appwrite
   ab (Cache 60 s) und verlangt Label `admin`, sonst 401/403.
8. **Scheduler** (`main.js`): 5-min-Takt, nächtliche Größenmessung 03:00, Verdichtung
   03:30, Medium-Digest täglich 07:00, Low-Wochenübersicht Mo 07:00 (Europe/Berlin).

### Messung

- Alle 5 Minuten: Server gesamt (CPU %, Load 1/5/15, RAM verfügbar, Swap belegt,
  Platte `/`, Zombies) und pro Container (CPU %, RAM, Status, Neustarts).
- Täglich 03:00: Größe pro App und „Aufräumbar“-Werte.
- Fällt eine Messung aus, wird **kein** Wert geschrieben (Lücke statt falscher Null).

## Warnregeln

Wichtige Container („kritisch“): Traefik, Appwrite, Kundenportal, Ticketsystem,
ticket-integrations, Gitea, InvoiceNinja, n8n (Liste in `config/rules.json`).

**🔴 Critical – sofortige Mail**
- Platte `/` ≥ 90 %
- RAM verfügbar < 500 MB **und** Swap ≥ 90 %, 10 min lang
- Load (5 min) > 24, 15 min lang
- kritischer Container läuft nicht oder > 3 Neustarts pro Stunde
- Zombies ≥ 100

**🟠 Medium – Sammelmail täglich 07:00**
- Platte `/` ≥ 80 %
- Swap ≥ 75 % oder RAM verfügbar < 1,5 GB, jeweils 1 h lang
- Zombies ≥ 20
- App wächst in 7 Tagen um > 20 % oder > 2 GB
- Load (5 min) > 8, 1 h lang
- nicht-kritischer Container abgestürzt (exited ≠ 0 oder Restart-Schleife)

**🟡 Low – Wochenübersicht Mo 07:00**
- ungenutzte Docker-Images > 10 GB oder Build-Cache > 3 GB
- App wächst in der Woche um > 10 %
- Zombies (≥ 1) halten sich > 24 h
- immer enthalten: Top 5 größte Apps, Top 5 schnellstes Wachstum, Top 5 RAM

**Allgemein**
- Dieselbe Warnung (gleiche `id`) höchstens 1× pro 24 h erneut gemeldet.
- Beim Verschwinden: Mail „✅ behoben“ (in derselben Taktung wie die Stufe; bei
  Critical sofort).
- Alle aktiven Warnungen stehen jederzeit auf der Seite.
- Wird eine Warnung höher eingestuft (Medium → Critical), gilt sofort die höhere Stufe.

## API

Alle Antworten JSON, Zeitstempel ISO/UTC.

| Methode + Pfad | Inhalt |
|---|---|
| `GET /health` | ohne Auth; `{ok, lastSample}` |
| `GET /overview` | aktuelle Serverwerte, 24-h-Minikurven, Trend ggü. gestern, aktive Warnungen, Zeitpunkt der letzten Messung |
| `GET /host?metric=cpu\|ram\|swap\|load\|disk\|zombies&range=24h\|7d\|30d\|90d\|1y` | Zeitreihe; Auflösung abhängig vom Zeitraum |
| `GET /apps` | Tabelle: Name, CPU %, RAM, Speicher, Δ 7 T, Δ 30 T, Speicher-Minikurve (30 T) |
| `GET /apps/:id?range=…` | Zeitreihen Speicher, RAM, CPU für eine App |
| `GET /cleanup` | ungenutzte Images, Build-Cache, gestoppte Container mit Größe |

Nur lesend. Es gibt **keine** Endpunkte zum Löschen, Stoppen oder Ändern.

## WOMS-Seite „Serverpuls“

- Navbar-Eintrag mit Pulssymbol, nur für `isAdmin`; roter/oranger Punkt bei aktiver
  Critical/Medium-Warnung (aus `/overview`, beim Laden der App und alle 5 min).
- Route `/serverpuls`; Nicht-Admins werden umgeleitet.
- Aufbau:
  1. **Kopf mit Ampel**: 🟢 Alles ok / 🟠 n Warnungen / 🔴 Critical, darunter die
     aktiven Warnungen (Stufe, seit wann, Wert). Hinweis „letzte Messung vor X Min.“;
     gelb, wenn älter als 15 min.
  2. **Kacheln**: CPU, Load, RAM, Swap, Platte, Zombies – aktueller Wert, 24-h-Minikurve,
     Trend ggü. gestern.
  3. **Großes Diagramm** (uPlot): Zeitraum 24 h / 7 T / 30 T / 90 T / 1 J, Wert
     wählbar, Tooltip mit exaktem Wert.
  4. **Tabelle „Projekte“**: sortierbar, Suchfeld, Δ-Spalten grün/rot mit Pfeil,
     Minikurve; Klick öffnet Detaildiagramm der App.
  5. **„Aufräumbar“**: reine Anzeige.
- Aktualisiert sich jede Minute, solange sichtbar. Handy: Kacheln untereinander.
- Neue Abhängigkeit: `uplot`. Lockfile wie bisher in einem Wegwerf-`node:20-alpine`
  erzeugen (Deploy-Image).

## Betrieb / Deploy

- Code: `/home/webklar/apps/serverpuls/` (eigenes Git-Repo, nur lokal).
- `docker-compose.yml` (Backup vorher): Dienste `serverpuls` (`node:22-alpine`,
  `mem_limit: 128m`, `cpus: 0.5`, `init: true`; Host-`/proc` wird als `/host/proc:ro` gemountet,
  kein `pid: host`) und `serverpuls-docker-proxy`
  (`tecnativa/docker-socket-proxy`, nur lesend: `CONTAINERS=1`, `IMAGES=1`, `SYSTEM=1`
  für `/system/df`, `POST=0`), beide im `webklar-network`, ohne Traefik-Route.
- Mounts serverpuls: `/proc:/host/proc:ro`, `/home/webklar/apps:/host/apps:ro`,
  `/var/lib/docker/volumes:/host/volumes:ro`, `serverpuls-data:/data`.
- `.env`: `SERVERPULS_SMTP_USER=server@webklar.com`, `SERVERPULS_SMTP_PASS` – vom
  Nutzer über eine Erweiterung von `scripts/mail-zugang.py` gesetzt (Claude sieht das
  Passwort nicht).
- WOMS-nginx: `location /api/serverpuls/` → `http://serverpuls:8091` (wie
  `/api/integrations/`).
- WOMS-Code auf `feature/serverpuls` (Worktree `dev-serverpuls`, Basis `origin/test`).
  Live erst nach Push des Nutzers.

## Fehlerbehandlung

- Collector-Teilfehler (z. B. Proxy nicht erreichbar) → betroffene Werte fehlen, Rest
  wird gespeichert; Fehler im Log.
- Größenmessung hat Zeitlimit (30 min); bricht sie ab, bleiben die Vortageswerte stehen
  und die Seite zeigt deren Datum.
- SMTP-Fehler → `mail_queue`, erneuter Versuch alle 5 min bis 24 h.
- Appwrite nicht erreichbar → API 502, Seite zeigt Fehlerhinweis.

## Tests

- Unit: Regeln (Schwellen, Dauerbedingungen, Hoch-/Herabstufung, Wiederholungssperre,
  behoben), Verdichtung, Wachstumsberechnung, `/proc`-Parser mit Beispieldateien.
- API: gemocktes Appwrite (Admin → 200, ohne Label → 403, ohne JWT → 401).
- UI: bewährtes esbuild-/Playwright-Harness unter RAM-Limit mit API-Fixtures.
- Live-Check: Container-RAM < 128 MB, erste Messwerte, Test-Mail an server@.

## Nicht enthalten

- Keine Aktionen (Löschen, Neustarten) aus der Seite heraus.
- Keine KI-Auswertung.
- Keine automatischen Tickets (Warnungen nur per Mail und auf der Seite).
