# Serverpuls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admin-only WOMS page „Serverpuls“ with server/container/app metrics over time and deterministic Low/Medium/Critical mail alerts from a small monitoring service.

**Architecture:** New service `/home/webklar/apps/serverpuls` (own local git repo, Node 22, `node:sqlite`, nodemailer) collects from host `/proc`, a read-only docker-socket-proxy and read-only mounts, stores downsampled series in SQLite, evaluates rules, mails via server@webklar.com and serves a read-only JWT+admin API. WOMS nginx proxies `/api/serverpuls/`; WOMS gets `ServerpulsPage` with uPlot charts.

**Tech Stack:** Node 22 (container) / Node 24 (host tests, `node --test`), `node:sqlite`, nodemailer, `tecnativa/docker-socket-proxy`, React 18 + Vite 5, uPlot, Playwright headless shell (host cache `chromium_headless_shell-1234`).

**Spec:** `docs/superpowers/specs/2026-09-30-serverpuls-design.md` (WOMS worktree `dev-serverpuls`, branch `feature/serverpuls`).

## Global Constraints

- No AI anywhere in collection, rules or mails.
- serverpuls container: `mem_limit: 128m`, `cpus: 0.5`, `init: true`, port 8091, base path `/api/serverpuls`.
- Every API route except `/health` requires `X-Appwrite-JWT`; `/account` must return `labels` containing `admin` → else 401 (no/invalid JWT) / 403 (no admin). Auth cache 60 s.
- API is read-only: only `GET`. No delete/stop/restart anywhere.
- Mail: `mail.your-server.de:587` STARTTLS, user + from + to = `server@webklar.com`; password only in `/home/webklar/apps/.env` as `SERVERPULS_SMTP_PASS`, set by the user; never printed, never read by Claude.
- Retention: raw 5 min for 7 days → hourly (avg + max) for 90 days → daily forever. Sizes daily forever.
- Schedules (Europe/Berlin, via `Intl`): sample every 5 min; sizes 03:00; downsampling 03:30; Medium digest daily 07:00; Low weekly Monday 07:00. Due-state stored in SQLite `meta` so restarts neither skip nor double-send.
- Missing measurement = no row (gap), never 0.
- Critical containers: `webklar-traefik`, `webklar-appwrite`, `webklar-kundenbereich-server`, `webklar-ticket`, `webklar-ticket-integrations`, `webklar-gitea`, `webklar-invoiceninja`, `webklar-n8n`.
- Mail subjects start with `[Serverpuls]`; texts German.
- WOMS: never push; never `git add -A` (node_modules is tracked); branch `feature/serverpuls`. Live = the user pushes to `test`.
- Heavy work (vite build, Playwright, npm install) runs under `systemd-run --scope -p MemoryMax=…M -p MemorySwapMax=0` (build 700M, browser 700M) — swap is full.
- Before editing `/home/webklar/apps/docker-compose.yml`, `.env`-touching scripts or the WOMS nginx conf: backup `*.bak-2026-09-30-serverpuls`.

## Review Focus

- Small apps flapping in growth rules (1 MB → 2 MB = +100 %): percentage growth rules only apply when the app is ≥ 100 MB at the later point (absolute 2 GB rule always applies). Test in Task 3.
- First days without 7-day history: growth rules silent until a size row ≥ 6 days old exists (no division by missing/zero). Test in Task 3.
- Service restart / downtime around 07:00: digest is sent once, on the first tick after 07:00 the same day; never twice. Test in Task 4.
- Container that is deliberately stopped (e.g. Paperless, exit code 0): no alert; only non-zero exit or restart loop counts for non-critical. Test in Task 3.
- API polled by the page every minute while Appwrite is slow: auth cache prevents one `/account` call per request; Appwrite down → 502 with JSON `{error}`, page shows the error instead of blank charts. Tests in Task 5 and Task 8.

---

## File Structure

Service repo `/home/webklar/apps/serverpuls/`:

| File | Responsibility |
|---|---|
| `Dockerfile` | `FROM node:22-alpine`, `apk add --no-cache util-linux-misc` (ionice), `npm ci --omit=dev`, `CMD node src/main.js` |
| `package.json` | `"type":"module"`, dep `nodemailer`, script `test: node --test test/` |
| `config/apps.json` | container → app grouping, app → folders |
| `config/rules.json` | thresholds + critical container list |
| `src/collect/host.js` | parse `/proc` + statfs |
| `src/collect/docker.js` | proxy client: list, inspect, stats, system df |
| `src/collect/sizes.js` | nightly `du` per app + previews + cleanup numbers |
| `src/apps.js` | map containers/volumes/folders to apps |
| `src/store.js` | SQLite schema, inserts, queries, downsampling, meta |
| `src/rules.js` | pure rule evaluation |
| `src/alerts.js` | state diff, mail decisions, digests |
| `src/mail.js` | nodemailer + queue |
| `src/api.js` | HTTP API + auth |
| `src/schedule.js` | Berlin-time due checks |
| `src/main.js` | wiring + timers |
| `test/*.test.js`, `test/fixtures/` | unit/API tests |

WOMS worktree `dev-serverpuls`: `src/lib/serverpulsApi.js`, `src/lib/serverpulsFormat.js`, `src/components/serverpuls/{Chart.jsx,Sparkline.jsx,AppsTable.jsx}`, `src/pages/ServerpulsPage.jsx`, `src/styles/serverpuls.css`; modify `src/App.jsx`, `src/components/Navbar.jsx`, `package.json`, `package-lock.json`; test `tests/unit/serverpulsFormat.test.mjs`.

Ops: `/home/webklar/apps/docker-compose.yml`, `/home/webklar/apps/ticket.webklar.com/nginx/ticket.webklar.com.conf`, `/home/webklar/apps/scripts/mail-zugang.py`.

---

### Task 1: Repo, host collector, app mapping

**Files:**
- Create: `Dockerfile`, `package.json`, `.gitignore` (`node_modules`, `data`), `config/apps.json`, `src/collect/host.js`, `src/apps.js`
- Test: `test/host.test.js`, `test/apps.test.js`, fixtures `test/fixtures/proc/{stat,stat2,meminfo,loadavg}` and `test/fixtures/proc/{101,102,103}/stat` (103 in state `Z`)

**Interfaces:**
- Produces: `readHost(procRoot: string, diskPath: string, prevCpu?: {idle,total}) → Promise<{cpuPct: number|null, cpuRaw:{idle,total}, load1, load5, load15, memAvail, memTotal, swapUsed, swapTotal, diskUsed, diskTotal, zombies}>` (bytes; `cpuPct` null when no `prevCpu`).
- Produces: `loadAppsConfig(path) → AppsConfig`; `appForContainer(cfg, {name, service, project}) → string`; `foldersForApp(cfg, app) → string[]` (relative to apps root).

- [ ] **Step 1:** `git init` in `/home/webklar/apps/serverpuls`; package.json, Dockerfile, .gitignore. Install nodemailer + lockfile in a throwaway `docker run --rm -v $PWD:/w -w /w node:22-alpine npm install nodemailer` under MemoryMax 700M.
- [ ] **Step 2: Failing tests** — `host.test.js`: with fixtures `stat`→`stat2` delta, `cpuPct` equals the hand-computed value (write it into the fixture comment); `memAvail` = MemAvailable×1024; `swapUsed` = (SwapTotal−SwapFree)×1024; `zombies === 1`; unreadable `/proc/<pid>/stat` (pid dir without stat) is skipped, not thrown. `apps.test.js`: `webklar-appwrite-worker-mails` → `Appwrite`; `openruntimes-executor` → `Appwrite`; `webklar-nextcloud25-db` → `Nextcloud 25`; `webklar-ticket`, `webklar-ticket-build`, `webklar-ticket-integrations` → `Ticketsystem`; `debian-app-1` (project `debian`) → `debian`; unknown `webklar-foo` → `foo`.
- [ ] **Step 3:** Run `node --test test/` → FAIL.
- [ ] **Step 4:** Implement. `config/apps.json` shape: `{"groups":[{"app":"Appwrite","match":["webklar-appwrite*","openruntimes-executor"],"folders":["appwrite"]}, …]}`, glob `*` only; fallback = container name minus `webklar-` prefix, or compose project for non-`apps` projects. Seed groups for Appwrite, Kundenportal (`webklar-kundenbereich-*`, folder `kundenbereich.webklar.com`), Ticketsystem (`ticket.webklar.com`, `ticket-integrations`), Website (`webklar-webclaw*`, `webklar.com`), Nextcloud, Nextcloud 25, InvoiceNinja (`InvoiceNinja`), Gitea, n8n, Bitwarden, E-Mail-Sorter (`emailsorter*`), eship, Previews-System (`webklar-preview-*`, `previews`), Traefik. Disk via `fs.statfsSync(diskPath)`.
- [ ] **Step 5:** `node --test test/` → PASS. Commit `serverpuls: host collector + app mapping`.

### Task 2: Store and downsampling

**Files:** Create `src/store.js`; Test `test/store.test.js`

**Interfaces:**
- Produces: `openStore(file: string) → Store` with
  `insertHost(ts, host)`, `insertApps(ts, [{app, cpuPct, memBytes}])`, `insertContainers(ts, [{name, app, status, health, exitCode, restartCount}])`, `insertSizes(day 'YYYY-MM-DD', [{app, bytes}])`, `insertCleanup(day, {imagesBytes, buildCacheBytes, stoppedBytes, stopped:[{name,bytes}]})`,
  `hostSeries(metric, sinceTs, res: 'raw'|'hour'|'day') → [{ts, v, max}]`, `appSeries(app, field: 'cpu'|'mem', sinceTs, res)`, `sizeSeries(app|null, sinceDay) → [{day, app, bytes}]`, `containerHistory(name, sinceTs)`, `latestHost()`, `latestContainers()`, `latestCleanup()`,
  `downsample(nowTs)`, `getMeta(key)`, `setMeta(key, value)`, `alertState() → Map`, `saveAlertState(Map)`, `queueMail(msg)`, `pendingMails()`, `markMailSent(id)`, `dropMailsOlderThan(ts)`.
- Metrics names: `cpu, load1, load5, load15, memAvail, memTotal, swapUsed, swapTotal, diskUsed, diskTotal, zombies`.

- [ ] **Step 1: Failing tests** (`:memory:` DB): insert 24 raw rows 5 min apart at 10 days ago → `downsample(now)` leaves 0 raw, 2 hour rows with correct avg and max; hour rows older than 90 days become day rows; raw from 1 day ago untouched; `containerHistory` rows older than 7 days deleted; `setMeta/getMeta` round-trip; alert state round-trip survives reopen of a temp file DB.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement (tables per spec; `host_samples(ts, res, metric…, *_max)` one row per ts; indexes on `(res, ts)`; `app_samples(ts,res,app,cpu,cpu_max,mem,mem_max)`). **Step 4:** Run → PASS. **Step 5:** Commit `serverpuls: sqlite store + downsampling`.

### Task 3: Rules

**Files:** Create `config/rules.json`, `src/rules.js`; Test `test/rules.test.js`

**Interfaces:**
- Consumes: Store queries (Task 2) via an input object built in `main.js`.
- Produces: `evaluate(input, rules) → Finding[]` where
  `input = {now, hostRaw:[{ts, …metrics}] (last 2 h), containers:[{name, app, status, health, exitCode, restartCount}], restarts1h: {name: n}, sizes:[{day, app, bytes}] (last 8 days), cleanup, zombieSince: ts|null, critical: string[]}` and
  `Finding = {id: string, level: 'low'|'medium'|'critical', title: string, value: string}`.
- Ids: `disk`, `mem`, `load`, `zombies`, `zombies-persist`, `container:<name>`, `growth:<app>`, `cleanup`.

- [ ] **Step 1: Failing tests** — one per spec rule and both sides of each threshold: disk 89.9 % → medium, 90 % → critical; mem critical needs every sample in last 10 min to have memAvail < 500 MB **and** swap ≥ 90 % (and ≥ 2 samples); one good sample inside window → not critical; swap ≥ 75 % for 1 h → medium; load5 > 24 for 15 min → critical, > 8 for 1 h → medium; zombies 100 → critical, 20 → medium, ≥ 1 for > 24 h → low `zombies-persist`; critical container `exited` → critical; any container restartCount +4 in 1 h → critical if in list else medium; non-critical exited with exitCode 0 → none, exitCode 1 → medium; growth 7 d +21 % on 500 MB app → medium; +21 % on 50 MB app → none; +2.1 GB on 50 GB app → medium; +11 % week on 500 MB → low; only 3 days of sizes → no growth finding; images 11 GB → low `cleanup`. Each finding has non-empty German `title` and `value`.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement with values from `config/rules.json` (copy the spec numbers verbatim; `minGrowthPctBaseBytes: 104857600`). One finding per id, highest level wins. **Step 4:** Run → PASS. **Step 5:** Commit `serverpuls: warning rules`.

### Task 4: Alerts, schedule, mail

**Files:** Create `src/schedule.js`, `src/alerts.js`, `src/mail.js`; Test `test/alerts.test.js`, `test/schedule.test.js`

**Interfaces:**
- Produces: `berlinParts(ts) → {day:'YYYY-MM-DD', hour, minute, weekday: 1..7}`; `isDue(kind: 'sizes'|'downsample'|'daily'|'weekly', ts, lastRunDay) → boolean` (03:00 / 03:30 / 07:00 / Monday 07:00; due once per day/week after the time).
- Produces: `processFindings(findings, state: Map, now) → {state, immediate: Mail[], resolvedForDigest: {medium:[], low:[]}}` — state entry `{id, level, since, lastMailed}`; critical new or re-mail after 24 h or escalation → immediate; critical resolved → immediate „✅ behoben“; medium/low resolved → collected for next digest.
- Produces: `dailyDigest(state, resolved, now) → Mail|null` (null if nothing active or resolved), `weeklyDigest(state, resolved, tops, now) → Mail` (always, contains the three Top-5 lists); `Mail = {subject, text, html}`.
- Produces: `createMailer(env) → {send(mail) → Promise}`; `flushQueue(store, mailer, now)` retries every 5 min, drops after 24 h; empty `SERVERPULS_SMTP_PASS` → mails stay queued, one log line, no crash.

- [ ] **Step 1: Failing tests** — new critical → 1 immediate, subject `[Serverpuls] 🔴 Critical: <title>`; same finding again 1 h later → 0; 24 h later → 1; medium → critical escalation → 1 immediate; critical disappears → `[Serverpuls] ✅ behoben: <title>`; medium only appears in `dailyDigest` subject `[Serverpuls] 🟠 Tagesbericht: n Warnungen`; weekly subject `[Serverpuls] 🟡 Wochenübersicht KW <n>`; `isDue('daily')` at 06:59 Berlin false, 07:00 true, again same day with lastRunDay=today false, service down 06:00–09:00 then tick 09:05 → true once; DST switch day (2026-10-25) still exactly once. `flushQueue` with a failing mailer keeps the mail; with success marks it sent; mailer without password never calls SMTP and keeps the mail.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement; nodemailer `{host, port:587, secure:false, requireTLS:true, auth}` from `SERVERPULS_SMTP_*`; mails text + simple HTML table, link `https://ticket.webklar.com/serverpuls`. **Step 4:** Run → PASS. **Step 5:** Commit `serverpuls: alerts, digests, mail queue`.

### Task 5: API

**Files:** Create `src/api.js`; Test `test/api.test.js`

**Interfaces:**
- Consumes: Store (Task 2), active alert state.
- Produces: `createApi({store, getAlerts: () => Finding-state[], appwrite: {endpoint, projectId}, fetchImpl}) → http.Server` with routes from the spec table. Range → resolution: `24h`,`7d` raw; `30d`,`90d` hour; `1y` day. `/overview` returns `{lastSample, host: {metric: {value, spark24h:[…], deltaYesterday}}, alerts:[…], level: 'ok'|'medium'|'critical'}`; `/apps` → `{sizesDay, rows}` (sizesDay = date of the latest size measurement, shown on the page), rows `{id, name, cpuPct, memBytes, sizeBytes, delta7d, delta30d, spark30d}` (deltas null without history); `/apps/:id` `{size, mem, cpu}` series; `/cleanup` = latest cleanup row.

- [ ] **Step 1: Failing tests** (seeded `:memory:` store, fake `fetchImpl` for `/account`): no JWT → 401; JWT with `labels:[]` → 403; admin → 200 on every route; `/host?metric=bogus` → 400; `/host?range=30d` returns hour rows; `/apps/unknown` → 404; POST → 405; `/account` throws → 502 `{error}`; two requests with same JWT within 60 s → one `/account` call; `/health` without JWT → 200.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement (plain `node:http`, pattern of `ticket-integrations/server.js`). **Step 4:** Run → PASS. **Step 5:** Commit `serverpuls: read-only admin API`.

### Task 6: Docker + sizes collectors, main wiring

**Files:** Create `src/collect/docker.js`, `src/collect/sizes.js`, `src/main.js`; Test `test/docker.test.js`, `test/sizes.test.js`

**Interfaces:**
- Produces: `dockerClient(baseUrl) → {list(), inspect(id), stats(id), systemDf()}`; `containerCpuPct(stats) → number|null` (standard `cpu_delta/system_delta*online_cpus*100`); `memBytes(stats)` = usage − inactive_file (fallback cache).
- Produces: `measureSizes({appsRoot, volumesRoot, previewsRoot, apps: [{app, folders, volumes}], timeoutMs: 1800000}) → Promise<[{app, bytes}]>` using `ionice -c3 nice -n 19 du -sk` (fallback `nice` only if ionice missing); each preview folder → app `Preview: <name>`.
- `main.js`: env `DB_FILE=/data/serverpuls.db`, `PROC_ROOT=/host/proc`, `DISK_PATH=/host/apps`, `APPS_ROOT=/host/apps`, `VOLUMES_ROOT=/host/volumes`, `PREVIEWS_ROOT=/host/previews`, `DOCKER_URL=http://serverpuls-docker-proxy:2375`; 60 s tick: sample if ≥ 5 min since last; due jobs; rules → alerts → queue → flush. Every collector failure is caught and logged; others still stored.

- [ ] **Step 1: Failing tests** — `containerCpuPct` on a fixture stats JSON equals hand value; missing `precpu_stats` → null; `measureSizes` on a temp tree (folder A 3 files, volume dir, previews/x) returns the three apps with sizes ≥ file bytes; a `du` that exceeds `timeoutMs` (set 1) rejects/returns partial without throwing out of `measureSizes`.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** Run all `node --test test/` → PASS. **Step 5:** Commit `serverpuls: docker/sizes collectors + main loop`.

### Task 7: Deploy service (ops, with user gate for mail)

**Files:** Modify `/home/webklar/apps/docker-compose.yml` (backup first), `/home/webklar/apps/scripts/mail-zugang.py` (backup first), `/home/webklar/apps/ticket.webklar.com/nginx/ticket.webklar.com.conf` (backup first).

- [ ] **Step 1:** Compose: add `serverpuls-docker-proxy` (`tecnativa/docker-socket-proxy`, `CONTAINERS=1 IMAGES=1 SYSTEM=1 POST=0`, socket `:ro`, `mem_limit: 32m`, `webklar-network`, no Traefik labels) and `serverpuls` (`build: ./serverpuls`, `container_name: webklar-serverpuls`, limits from Global Constraints, mounts `/proc:/host/proc:ro`, `./:/host/apps:ro`, `/var/lib/docker/volumes:/host/volumes:ro`, `/var/www/previews:/host/previews:ro`, `serverpuls-data:/data`, env `SERVERPULS_SMTP_USER=server@webklar.com`, `SERVERPULS_SMTP_PASS=${SERVERPULS_SMTP_PASS:-}`, `TZ=Europe/Berlin`). `docker compose config -q` → exit 0. Note: mount `/host/previews` is an addition to the spec's mount list (needed for preview apps).
- [ ] **Step 2:** `docker compose up -d --build serverpuls-docker-proxy serverpuls` (build under MemoryMax 700M). Check: `docker stats --no-stream webklar-serverpuls` < 128 MiB; after 6 min `wget -qO- http://webklar-serverpuls:8091/api/serverpuls/health` from `webklar-ticket-integrations` shows `lastSample`; proxy rejects `POST /containers/x/stop` with 403.
- [ ] **Step 3:** nginx: add `location /api/serverpuls/` block mirroring `/api/integrations/` (`set $serverpuls_upstream webklar-serverpuls; proxy_pass http://$serverpuls_upstream:8091;`, no `client_max_body_size`). `docker exec webklar-ticket nginx -t && docker exec webklar-ticket nginx -s reload`. `curl -s -o /dev/null -w '%{http_code}' https://ticket.webklar.com/api/serverpuls/overview` → 401.
- [ ] **Step 4:** `mail-zugang.py --serverpuls`: prompt password for server@webklar.com (getpass), test login, backup + write `SERVERPULS_SMTP_PASS` into `.env`, `docker compose up -d serverpuls`, send test mail `[Serverpuls] Testmail` from inside the container. Dry-run with `WEBKLAR_ROOT` copy + fake SMTP. **User gate:** the user runs it; Claude only checks for the `250` result line.
- [ ] **Step 5:** Commit service repo; record compose/nginx/script changes in the memory file.

### Task 8: WOMS page

**Files:** Create `src/lib/serverpulsApi.js`, `src/lib/serverpulsFormat.js`, `src/components/serverpuls/{Chart.jsx,Sparkline.jsx,AppsTable.jsx}`, `src/pages/ServerpulsPage.jsx`, `src/styles/serverpuls.css`; Modify `src/App.jsx` (route `/serverpuls`), `src/components/Navbar.jsx` (entry after „Rechtliches“, before „Admin“, only `isAdmin`, pulse icon, dot from `overview.level`, fetched on app load and every 5 min, admins only), `package.json`/`package-lock.json` (`uplot`); Test `tests/unit/serverpulsFormat.test.mjs`.

**Interfaces:**
- Consumes: API from Task 5.
- Produces: `serverpulsApi.{overview(), host(metric, range), apps(), app(id, range), cleanup()}` (JWT pattern of `integrationsApi.js`, base `/api/serverpuls`); `formatBytes(n) → '1,2 GB'` (de-DE, base 1024), `formatDelta(pct|null) → {text:'+12,3 %'|'–', dir:'up'|'down'|'flat'}`, `ageLabel(ts, now) → {text:'vor 4 Min.', stale: boolean}` (stale > 15 min).

- [ ] **Step 1: Failing test** `serverpulsFormat.test.mjs`: `formatBytes(1288490189)` → `'1,2 GB'`; `formatBytes(0)` → `'0 B'`; `formatDelta(null).text` → `'–'`; `formatDelta(-3.21)` → `{text:'−3,2 %', dir:'down'}`; `ageLabel` at 16 min → stale true, 14 min → false.
- [ ] **Step 2:** `npm test` → FAIL. **Step 3:** Implement format helpers → PASS.
- [ ] **Step 4:** `uplot` into package.json + lockfile via throwaway `docker run node:20-alpine` (never touch tracked node_modules). Implement page per spec „WOMS-Seite“ (ampel, 6 tiles, big chart with range + metric selector, sortable/searchable apps table with row → detail chart, „Aufräumbar“, 60 s refresh while `document.visibilityState==='visible'`, error box on API error, non-admin → `<Navigate to="/tickets">`). Mobile: tiles stack < 700 px.
- [ ] **Step 5:** Deploy-like build: `git archive HEAD` + `docker run --rm node:20-alpine sh -c 'npm install && npm run build'` under MemoryMax 700M → exit 0. Commit `Serverpuls: Admin-Seite mit Verlauf und Warnungen` (only the listed files).

### Task 9: UI test

**Files:** Create (scratchpad, not in repo) `serverpuls-e2e.mjs`.

- [ ] **Step 1:** Vite build with `DIST=…` (MemoryMax 700M); serve via Playwright `page.route` under `https://ticket.test`, mock Appwrite (`/v1/account` with/without `labels:['admin']`) and `/api/serverpuls/*` fixtures (one medium alert, 3 apps, one with `delta7d:null`).
- [ ] **Step 2:** Assertions: admin sees nav entry „Serverpuls“ with orange dot; non-admin sees no entry and `/serverpuls` redirects to `/tickets`; ampel text contains „1 Warnung“; 6 tiles; switching range to „30 T“ requests `range=30d`; clicking column „Δ 7 T“ sorts; null delta shows „–“; row click opens detail chart; `/overview` 502 → error box visible, no crash; `lastSample` 20 min old → stale hint; width 390 px → no horizontal scroll.
- [ ] **Step 3:** Run under MemoryMax 700M → all pass; screenshot desktop + mobile for the user.

### Task 10: Finish

- [ ] **Step 1:** Service: `node --test test/` all pass; live container RAM < 128 MiB after 1 h; first rows in `/overview`.
- [ ] **Step 2:** WOMS: `npm test` all pass; final whole-branch review.
- [ ] **Step 3:** Report to the user: what is live (service + nginx), what waits (WOMS push `git -C dev-serverpuls push origin feature/serverpuls:test`), password step status. Update memory.
