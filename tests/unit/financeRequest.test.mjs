import test from 'node:test'
import assert from 'node:assert/strict'
import { loadModule } from './load.mjs'

const { createFinanceRequest, PORTAL_DOWN_TEXT, SESSION_EXPIRED_TEXT } = await loadModule('src/lib/financeRequest.js')

const BASE = 'https://portal.example.invalid/api/admin/finanzen'

/** Antwort wie fetch: { ok, status, json() }; body === undefined -> kein JSON (json() wirft). */
const reply = (status, body) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => {
    if (body === undefined) throw new SyntaxError('Unexpected token < in JSON')
    return body
  },
})

function client({ responses = [], createJWT, fetchImpl } = {}) {
  const calls = []
  const queue = [...responses]
  const api = createFinanceRequest({
    baseUrl: BASE,
    createJWT: createJWT || (async () => ({ jwt: 'jwt-1' })),
    fetchImpl:
      fetchImpl ||
      (async (url, init) => {
        calls.push({ url, init })
        return queue.shift() || reply(200, {})
      }),
  })
  return { api, calls }
}

const fails = async (promise) => promise.then(() => assert.fail('hätte scheitern müssen'), (err) => err)

test('Erfolg: JSON zurück, Bearer-JWT, JSON-Body nur wenn gesetzt', async () => {
  const { api, calls } = client({ responses: [reply(200, { ok: 1 }), reply(200, { id: 'x' })] })
  assert.deepEqual(await api('/uebersicht'), { ok: 1 })
  assert.equal(calls[0].url, `${BASE}/uebersicht`)
  assert.equal(calls[0].init.method, 'GET')
  assert.equal(calls[0].init.headers.Authorization, 'Bearer jwt-1')
  assert.equal(calls[0].init.body, undefined)
  assert.deepEqual(await api('/rechnungen', { method: 'POST', body: { a: 1 } }), { id: 'x' })
  assert.equal(calls[1].init.body, '{"a":1}')
})

test('Netzwerkfehler (fetch wirft): „Das Kundenportal ist gerade nicht erreichbar.“ mit status 0', async () => {
  const { api } = client({ fetchImpl: async () => { throw new TypeError('Failed to fetch') } })
  const err = await fails(api('/uebersicht'))
  assert.equal(PORTAL_DOWN_TEXT, 'Das Kundenportal ist gerade nicht erreichbar.')
  assert.equal(err.message, PORTAL_DOWN_TEXT)
  assert.equal(err.status, 0)
})

test('502/503/504 ohne JSON (Proxy-Fehlerseite): dieselbe Meldung, Status bleibt', async () => {
  for (const status of [502, 503, 504]) {
    const { api } = client({ responses: [reply(status, undefined)] })
    const err = await fails(api('/uebersicht'))
    assert.equal(err.message, PORTAL_DOWN_TEXT, String(status))
    assert.equal(err.status, status)
  }
})

test('502/503/504 mit JSON-Fehler des Portals: die Meldung des Portals und die Rechnungsdaten bleiben erhalten', async () => {
  const { api } = client({
    responses: [reply(502, { error: 'Stripe ist gerade nicht erreichbar.', invoiceId: 'in_9', invoiceNumber: 'WK-0009' })],
  })
  const err = await fails(api('/rechnungen/in_9/senden', { method: 'POST' }))
  assert.equal(err.message, 'Stripe ist gerade nicht erreichbar.')
  assert.equal(err.status, 502)
  assert.equal(err.invoiceId, 'in_9')
  assert.equal(err.invoiceNumber, 'WK-0009')
  // JSON ohne error-Feld: Statusmeldung, nicht die Portal-Meldung
  const { api: api2 } = client({ responses: [reply(503, {})] })
  assert.equal((await fails(api2('/x'))).message, 'API-Fehler 503')
})

test('andere Fehler ohne JSON bleiben „API-Fehler <Status>“; mit JSON die Meldung des Portals', async () => {
  const { api } = client({ responses: [reply(500, undefined), reply(403, { error: 'Admin-Berechtigung erforderlich' }), reply(409, null)] })
  const e500 = await fails(api('/x'))
  assert.equal(e500.message, 'API-Fehler 500')
  assert.equal(e500.status, 500)
  const e403 = await fails(api('/x'))
  assert.equal(e403.message, 'Admin-Berechtigung erforderlich')
  assert.equal(e403.status, 403)
  // JSON-null: keine Ausnahme beim Lesen des Fehlers
  assert.equal((await fails(api('/x'))).message, 'API-Fehler 409')
})

test('Erfolg ohne lesbaren Body liefert ein leeres Objekt', async () => {
  const { api } = client({ responses: [reply(200, undefined)] })
  assert.deepEqual(await api('/x'), {})
})

test('createJWT scheitert: „Anmeldung abgelaufen. Bitte neu anmelden.“ (status 401), kein Aufruf am Portal', async () => {
  const { api, calls } = client({ createJWT: async () => { throw new Error('User (role: guests) missing scope (account)') } })
  const err = await fails(api('/uebersicht'))
  assert.equal(SESSION_EXPIRED_TEXT, 'Anmeldung abgelaufen. Bitte neu anmelden.')
  assert.equal(err.message, SESSION_EXPIRED_TEXT)
  assert.equal(err.status, 401)
  assert.equal(calls.length, 0)
})

test('401 des Portals: einmal mit frischem JWT wiederholen; scheitert dann createJWT, kommt die Anmeldemeldung', async () => {
  let n = 0
  const { api, calls } = client({
    createJWT: async () => {
      n += 1
      if (n === 1) return { jwt: 'old' }
      throw new Error('Session expired')
    },
    responses: [reply(401, { error: 'abgelaufen' })],
  })
  const err = await fails(api('/uebersicht'))
  assert.equal(calls.length, 1)
  assert.equal(calls[0].init.headers.Authorization, 'Bearer old')
  assert.equal(err.message, SESSION_EXPIRED_TEXT)

  let m = 0
  const retry = client({
    createJWT: async () => ({ jwt: `jwt-${++m}` }),
    responses: [reply(401, { error: 'abgelaufen' }), reply(200, { ok: true })],
  })
  assert.deepEqual(await retry.api('/uebersicht'), { ok: true })
  assert.deepEqual(retry.calls.map((c) => c.init.headers.Authorization), ['Bearer jwt-1', 'Bearer jwt-2'])
})
