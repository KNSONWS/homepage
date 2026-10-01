import test from 'node:test'
import assert from 'node:assert/strict'
import { loadModule } from './load.mjs'

const { previewStatus, detectedLabel, modeHint, MODE_OPTIONS, modeOptionsFor, isDevUnavailableError } = await loadModule('src/lib/previewView.js')

test('previewStatus online: Datum in Europe/Berlin und sha7', () => {
  const s = previewStatus({ state: 'online', builtAt: '2026-09-30T13:05:00Z', builtSha: 'abcdef1234567890' })
  assert.deepEqual(s, { color: 'green', text: 'Online seit 30.09. 15:05 (Build abcdef1)' })
})

test('previewStatus online im Winter (MEZ)', () => {
  const s = previewStatus({ state: 'online', builtAt: '2026-01-05T08:07:00Z', builtSha: 'abcdef1' })
  assert.equal(s.text, 'Online seit 05.01. 09:07 (Build abcdef1)')
})

test('previewStatus online ohne Datum/sha bleibt lesbar', () => {
  assert.deepEqual(previewStatus({ state: 'online' }), { color: 'green', text: 'Online' })
})

test('previewStatus weitere Zustände', () => {
  assert.deepEqual(previewStatus({ state: 'building' }), { color: 'yellow', text: 'Baut gerade …' })
  assert.deepEqual(previewStatus({ state: 'starting' }), { color: 'yellow', text: 'Dev-Server startet …' })
  assert.deepEqual(previewStatus({ state: 'sleeping' }), { color: 'yellow', text: 'Dev-Server schläft, startet beim nächsten Aufruf' })
  assert.deepEqual(previewStatus({ state: 'failed' }), { color: 'red', text: 'Build fehlgeschlagen – letzte funktionierende Version ist online' })
  assert.deepEqual(previewStatus({ state: 'off' }), { color: 'grey', text: 'Keine Preview' })
})

test('previewStatus leer/unbekannt/null ⇒ grau', () => {
  const grey = { color: 'grey', text: 'Keine Preview' }
  assert.deepEqual(previewStatus({ state: '' }), grey)
  assert.deepEqual(previewStatus({}), grey)
  assert.deepEqual(previewStatus(null), grey)
  assert.deepEqual(previewStatus({ state: 'xyz' }), grey)
})

test('detectedLabel', () => {
  assert.equal(detectedLabel('static'), 'Statisch')
  assert.equal(detectedLabel('build:npm'), 'Build (npm)')
  assert.equal(detectedLabel('dev:pnpm'), 'Dev-Server (pnpm)')
  assert.equal(detectedLabel('build:vite:npm'), 'Build (Vite, npm)')
  assert.equal(detectedLabel('dev:npm'), 'Dev-Server (npm)')
  assert.equal(detectedLabel(''), '')
  assert.equal(detectedLabel(null), '')
  assert.equal(detectedLabel('foo:npm'), '')
})

test('modeHint', () => {
  assert.equal(modeHint('auto', 'build:npm'), 'Automatisch → Build (npm)')
  assert.equal(modeHint('auto', 'static'), 'Automatisch → Statisch')
  assert.equal(modeHint('', 'dev:pnpm'), 'Automatisch → Dev-Server (pnpm)')
  assert.equal(modeHint('auto', ''), '')
  assert.equal(modeHint('build', 'build:npm'), '')
})

test('MODE_OPTIONS', () => {
  assert.deepEqual(MODE_OPTIONS, [
    { value: 'auto', label: 'Automatisch' },
    { value: 'build', label: 'Build' },
    { value: 'dev', label: 'Dev-Server' },
    { value: 'off', label: 'Aus' },
  ])
})

test('previewStatus failed + Dev-Modus nicht möglich => gelb, kein roter Build-Fehler', () => {
  const s = previewStatus({ state: 'failed', error: 'Dev-Modus hier nicht möglich – statische Version ist online' })
  assert.deepEqual(s, { color: 'yellow', text: 'Dev-Modus hier nicht möglich – statische Version ist online' })
  assert.equal(previewStatus({ state: 'failed', error: 'Build kaputt' }).color, 'red')
  assert.equal(isDevUnavailableError('Dev-Modus hier nicht möglich – x'), true)
  assert.equal(isDevUnavailableError(''), false)
})

test('modeOptionsFor: dev nur bei devAvailable === false gesperrt', () => {
  for (const a of [true, null, undefined]) {
    assert.ok(modeOptionsFor(a).every((o) => !o.disabled))
    assert.equal(modeOptionsFor(a).find((o) => o.value === 'dev').label, 'Dev-Server')
  }
  const o = modeOptionsFor(false)
  assert.deepEqual(o.find((x) => x.value === 'dev'), { value: 'dev', label: 'Dev-Server (kein dev-Skript)', disabled: true })
  assert.equal(o.filter((x) => x.disabled).length, 1)
})
