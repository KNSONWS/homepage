import { createJwtCache, fetchWithRetry } from './serverpulsAuth'

// Anfrage-Kern der Finanzen-API (Portal). Rein (ohne Appwrite-Import, fetch und createJWT werden injiziert), damit die
// Fehlertexte unter Node testbar sind; financeApi.js verdrahtet ihn mit Appwrite.

export const PORTAL_DOWN_TEXT = 'Das Kundenportal ist gerade nicht erreichbar.'
export const SESSION_EXPIRED_TEXT = 'Anmeldung abgelaufen. Bitte neu anmelden.'

const statusError = (message, status) => Object.assign(new Error(message), { status })

/**
 * request(path, { method, body }) -> geparstes JSON oder ein Error mit `status` (und bei 502 nach dem Festschreiben
 * `invoiceId` / `invoiceNumber`). Meldungen:
 *  - fetch wirft (Netz, Portal aus): „Das Kundenportal ist gerade nicht erreichbar.“ (status 0)
 *  - 502/503/504 ohne JSON-Antwort (Proxy-Fehlerseite): dieselbe Meldung (status = HTTP-Status)
 *  - createJWT scheitert (Sitzung abgelaufen): „Anmeldung abgelaufen. Bitte neu anmelden.“ (status 401)
 *  - sonst die Meldung des Portals (`error`), ohne sie „API-Fehler <Status>“
 * Das JWT wird 10 Minuten gecacht; bei 401 einmal mit frischem JWT wiederholt.
 */
export function createFinanceRequest({ baseUrl, createJWT, fetchImpl = (...args) => globalThis.fetch(...args), now }) {
  // JWT 10 Min. gecacht (Appwrite begrenzt das Erzeugen pro Nutzer)
  const jwtCache = createJwtCache({
    createJWT: async () => {
      try {
        return await createJWT()
      } catch {
        throw statusError(SESSION_EXPIRED_TEXT, 401)
      }
    },
    ...(now ? { now } : {}),
  })

  // Netzwerkfehler (fetch wirft) bekommen eine deutsche Meldung mit status 0
  async function portalFetch(url, init) {
    try {
      return await fetchImpl(url, init)
    } catch {
      throw statusError(PORTAL_DOWN_TEXT, 0)
    }
  }

  return async function request(path, { method = 'GET', body } = {}) {
    const res = await fetchWithRetry(jwtCache, (jwt) =>
      portalFetch(`${baseUrl}${path}`, {
        method,
        headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      })
    )
    let data = null
    try {
      data = await res.json()
    } catch {
      data = null // keine JSON-Antwort (Fehlerseite des Proxys, leerer Body)
    }
    if (!res.ok) {
      const gatewayDown = data === null && (res.status === 502 || res.status === 503 || res.status === 504)
      const info = data && typeof data === 'object' ? data : {}
      const err = statusError(gatewayDown ? PORTAL_DOWN_TEXT : info.error || `API-Fehler ${res.status}`, res.status)
      // Nach dem Festschreiben (502) liegt die Rechnung schon als "offen" vor
      if (info.invoiceId) err.invoiceId = info.invoiceId
      if (info.invoiceNumber) err.invoiceNumber = info.invoiceNumber
      throw err
    }
    return data ?? {}
  }
}
