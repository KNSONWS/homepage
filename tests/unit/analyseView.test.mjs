import test from 'node:test'
import assert from 'node:assert/strict'
import { loadModule } from './load.mjs'

const { analyseStatus, avvLabel } = await loadModule('src/lib/analyseView.js')

test('analyseStatus: Schalter aus => noch nicht freigeschaltet, kein Button', () => {
  const s = analyseStatus({ enabled: false })
  assert.equal(s.text, 'Noch nicht freigeschaltet')
  assert.equal(s.canEnable, false)
  assert.equal(s.canDisable, false)
})

test('analyseStatus: an seit Datum (Europe/Berlin)', () => {
  const s = analyseStatus({ enabled: true, state: 'active', eligible: true, activatedAt: '2026-10-01T22:30:00Z' })
  assert.equal(s.text, 'An seit 02.10.2026')
  assert.equal(s.canDisable, true)
  assert.equal(s.canEnable, false)
})

test('analyseStatus: an ohne Datum bleibt lesbar', () => {
  assert.equal(analyseStatus({ enabled: true, state: 'active', eligible: true }).text, 'An')
})

test('analyseStatus: aus und berechtigt => Einschalten moeglich', () => {
  const s = analyseStatus({ enabled: true, state: 'off', eligible: true })
  assert.equal(s.text, 'Aus')
  assert.equal(s.canEnable, true)
  assert.equal(analyseStatus({ enabled: true, state: null, eligible: true }).text, 'Aus')
})

test('analyseStatus: gesperrt', () => {
  const s = analyseStatus({ enabled: true, state: 'disabled', eligible: true })
  assert.equal(s.text, 'Gesperrt')
  assert.equal(s.canEnable, true)
  assert.equal(s.enableLabel, 'Trotz Sperre einschalten')
  assert.equal(s.hint, 'Vom Team gesperrt')
  assert.equal(analyseStatus({ enabled: true, state: 'disabled', eligible: false }).canEnable, false)
})

test('analyseStatus: nicht berechtigt => Grund, kein Button', () => {
  const s = analyseStatus({ enabled: true, state: null, eligible: false, reasonText: 'Die Website-Analyse gibt es nur mit einem laufenden Wartungs-Abo.' })
  assert.equal(s.text, 'Nicht verfügbar: Die Website-Analyse gibt es nur mit einem laufenden Wartungs-Abo.')
  assert.equal(s.canEnable, false)
})

test('analyseStatus: robust bei leerer Antwort', () => {
  assert.equal(analyseStatus(null).text, '')
})

test('avvLabel nennt die Fassung', () => {
  assert.equal(avvLabel('2026-10-01'), 'Der Kunde hat den Auftragsverarbeitungsvertrag (Fassung 2026-10-01) bestätigt')
})
