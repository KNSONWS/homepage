import test from 'node:test'
import assert from 'node:assert/strict'
import { loadModule } from './load.mjs'

const { createJwtCache, fetchWithRetry } = await loadModule('src/lib/serverpulsAuth.js')

function setup() {
  let n = 0
  let t = 0
  const calls = { create: 0 }
  const createJWT = async () => { calls.create += 1; n += 1; await Promise.resolve(); return { jwt: `jwt${n}` } }
  const cache = createJwtCache({ createJWT, now: () => t })
  return { cache, calls, advance: (ms) => { t += ms } }
}

test('3 parallele Aufrufe -> 1 createJWT', async () => {
  const { cache, calls } = setup()
  const r = await Promise.all([cache.get(), cache.get(), cache.get()])
  assert.deepEqual(r, ['jwt1', 'jwt1', 'jwt1'])
  assert.equal(calls.create, 1)
})

test('nach 10 Min. neues JWT, davor gecacht', async () => {
  const { cache, calls, advance } = setup()
  await cache.get()
  advance(9 * 60000)
  assert.equal(await cache.get(), 'jwt1')
  advance(61000)
  assert.equal(await cache.get(), 'jwt2')
  assert.equal(calls.create, 2)
})

test('createJWT-Fehler wird nicht gecacht', async () => {
  let fail = true
  const cache = createJwtCache({ createJWT: async () => { if (fail) throw new Error('x'); return { jwt: 'ok' } }, now: () => 0 })
  await assert.rejects(cache.get())
  fail = false
  assert.equal(await cache.get(), 'ok')
})

test('401 -> genau ein Retry mit frischem JWT', async () => {
  const { cache, calls } = setup()
  const used = []
  const res = await fetchWithRetry(cache, async (jwt) => { used.push(jwt); return { status: used.length === 1 ? 401 : 200 } })
  assert.equal(res.status, 200)
  assert.deepEqual(used, ['jwt1', 'jwt2'])
  assert.equal(calls.create, 2)
})

test('zweites 401 wird durchgereicht, kein dritter Versuch', async () => {
  const { cache } = setup()
  let n = 0
  const res = await fetchWithRetry(cache, async () => { n += 1; return { status: 401 } })
  assert.equal(res.status, 401)
  assert.equal(n, 2)
})
