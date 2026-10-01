import test from 'node:test'
import assert from 'node:assert/strict'
import { loadModule } from './load.mjs'

const { servicesCards } = await loadModule('src/lib/servicesView.js')

const kinds = [
  { key: 'website', label: 'Website', description: 'Kundenwebsite', features: ['analyse'] },
  { key: 'app', label: 'App', description: 'Mobile App', features: [] },
]
const features = { analyse: { label: 'Website-Analyse', status: 'in_development' } }

test('servicesCards: Reihenfolge wie Katalog, Zählung, Funktionen', () => {
  const cards = servicesCards({
    kinds, features,
    groups: { app: [{ id: 'a' }, { id: 'b' }], website: [{ id: 'c' }] },
  })
  assert.deepEqual(cards.map((c) => c.key), ['website', 'app'])
  assert.deepEqual(cards.map((c) => c.count), [1, 2])
  assert.equal(cards[0].description, 'Kundenwebsite')
  assert.deepEqual(cards[0].features, [{ label: 'Website-Analyse', statusLabel: 'In Entwicklung' }])
  assert.deepEqual(cards[1].features, [])
  assert.equal(cards[1].projects.length, 2)
})

test('servicesCards: Karte "Art fehlt" zuletzt, nur wenn nicht leer', () => {
  const none = servicesCards({ kinds, features, groups: { missing: [] } })
  assert.equal(none.some((c) => c.key === 'missing'), false)
  const cards = servicesCards({ kinds, features, groups: { missing: [{ id: 'x' }] } })
  const last = cards[cards.length - 1]
  assert.equal(last.key, 'missing')
  assert.equal(last.label, 'Art fehlt')
  assert.equal(last.count, 1)
})

test('servicesCards: robust bei leerer Antwort und unbekannter Funktion', () => {
  assert.deepEqual(servicesCards(null), [])
  const cards = servicesCards({ kinds: [{ key: 'x', label: 'X', features: ['foo'] }] })
  assert.deepEqual(cards[0].features, [{ label: 'foo', statusLabel: '' }])
})

test('servicesCards: Status "available" => "Verfügbar"', () => {
  const cards = servicesCards({ kinds, features: { analyse: { label: 'Website-Analyse', status: 'available' } }, groups: {} })
  assert.deepEqual(cards[0].features, [{ label: 'Website-Analyse', statusLabel: 'Verfügbar' }])
})
