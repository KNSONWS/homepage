import { test } from 'node:test'
import assert from 'node:assert/strict'
import { COLLECTIONS, waitForAttributes } from '../scripts/setup-legal.mjs'

const indexOn = (id, attr) =>
  COLLECTIONS.find((c) => c.id === id).indexes?.some((i) => i.attributes.includes(attr))

test('Indizes fuer alle Abfragen (equal/orderAsc)', () => {
  assert.ok(indexOn('legalVersions', 'documentKey'))
  assert.ok(indexOn('legalVersions', 'source'))
  assert.ok(indexOn('legalDocuments', 'sort'))
  assert.ok(indexOn('providerContracts', 'provider'))
})

test('waitForAttributes wartet, bis alle Attribute verfuegbar sind', async () => {
  let calls = 0
  const db = {
    listAttributes: async () => {
      calls++
      return { attributes: [{ key: 'a', status: 'available' }, { key: 'b', status: calls < 3 ? 'processing' : 'available' }] }
    },
  }
  await waitForAttributes(db, 'x', { intervalMs: 1, timeoutMs: 1000 })
  assert.equal(calls, 3)
})

test('waitForAttributes bricht bei fehlgeschlagenem Attribut ab', async () => {
  const db = { listAttributes: async () => ({ attributes: [{ key: 'b', status: 'failed', error: 'kaputt' }] }) }
  await assert.rejects(waitForAttributes(db, 'x', { intervalMs: 1, timeoutMs: 1000 }), /b/)
})
