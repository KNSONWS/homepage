import test from 'node:test'
import assert from 'node:assert/strict'
import { loadModule } from './load.mjs'

const { parseCallback, successResult, failureResult, isResult } = await loadModule('src/lib/bankCallback.js')

test('parseCallback: code und state', () => {
  assert.deepEqual(parseCallback('?state=a&code=b'), { code: 'b', state: 'a', error: '' })
})

test('parseCallback: Abbruch bei der Bank, error_description wird angehaengt', () => {
  assert.deepEqual(
    parseCallback('?state=a&error=access_denied&error_description=abgebrochen'),
    { code: '', state: 'a', error: 'access_denied: abgebrochen' },
  )
  assert.equal(parseCallback('?error=access_denied').error, 'access_denied')
})

test('parseCallback: ohne code und error -> null', () => {
  assert.equal(parseCallback(''), null)
  assert.equal(parseCallback('?'), null)
  assert.equal(parseCallback('?state=a'), null)
  assert.equal(parseCallback('?error_description=nur-text'), null)
  assert.equal(parseCallback(undefined), null)
  assert.equal(parseCallback(null), null)
  assert.equal(parseCallback(42), null)
})

test('parseCallback: URL-Kodierung, erster Wert gewinnt, Suchteil auch ohne ?', () => {
  assert.deepEqual(parseCallback('?code=a%2Bb%3D&state=x%20y'), { code: 'a+b=', state: 'x y', error: '' })
  assert.equal(parseCallback('?code=erst&code=zweit').code, 'erst')
  assert.deepEqual(parseCallback('code=b&state=a'), { code: 'b', state: 'a', error: '' })
})

test('successResult: gueltig bis uebernehmen', () => {
  assert.deepEqual(successResult({ ok: true, validUntil: '2099-03-29T00:00:00.000Z' }), { ok: true, validUntil: '2099-03-29T00:00:00.000Z' })
  assert.deepEqual(successResult({ ok: true }), { ok: true, validUntil: '' })
})

test('successResult: Antwort ohne ok -> Fehlerergebnis mit deutschem Text', () => {
  const r = successResult({ ok: false })
  assert.equal(r.ok, false)
  assert.match(r.message, /Bankfreigabe/)
  assert.equal(successResult(null).ok, false)
})

test('failureResult: Meldung des Servers, sonst Standardtext', () => {
  assert.deepEqual(failureResult({ message: 'Die Freigabe ist abgelaufen.' }), { ok: false, message: 'Die Freigabe ist abgelaufen.' })
  assert.match(failureResult(new Error('')).message, /Bankfreigabe/)
  assert.match(failureResult(undefined).message, /Bankfreigabe/)
})

test('isResult: nur gueltige Ergebnisse aus dem Verlaufszustand', () => {
  assert.equal(isResult({ ok: true, validUntil: 'x' }), true)
  assert.equal(isResult({ ok: false, message: 'm' }), true)
  assert.equal(isResult(null), false)
  assert.equal(isResult({}), false)
  assert.equal(isResult({ ok: 'ja' }), false)
})
