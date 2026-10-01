import { account } from './appwrite'
import { createJwtCache, fetchWithRetry } from './serverpulsAuth'

/**
 * Client fuer das Serverpuls-Backend (nur lesend).
 * Same-Origin unter /api/serverpuls, authentifiziert per Appwrite-JWT.
 */
const BASE = '/api/serverpuls'

// JWT 10 Min. gecacht (Appwrite begrenzt das Erzeugen pro Nutzer)
const jwtCache = createJwtCache({ createJWT: () => account.createJWT() })

async function get(path) {
  const res = await fetchWithRetry(jwtCache, (jwt) =>
    fetch(`${BASE}${path}`, { headers: { 'X-Appwrite-JWT': jwt } })
  )
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `Serverpuls-Fehler ${res.status}`)
  return data
}

export const serverpulsApi = {
  overview: () => get('/overview'),
  host: (metric, range = '24h') =>
    get(`/host?metric=${encodeURIComponent(metric)}&range=${encodeURIComponent(range)}`),
  apps: () => get('/apps'),
  app: (id, range = '30d') =>
    get(`/apps/${encodeURIComponent(id)}?range=${encodeURIComponent(range)}`),
  cleanup: () => get('/cleanup'),
}

export const { overview, host, apps, app, cleanup } = serverpulsApi
