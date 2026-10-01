import test from 'node:test'
import assert from 'node:assert/strict'
import { loadModule } from './load.mjs'

const { suggestSubdomain } = await loadModule('src/lib/subdomain.js')

test('Kundenname vor Projektname', () => {
  assert.equal(suggestSubdomain('Döner Nation', 'D-ner-Nation'), 'doener-nation')
})

test('Apostroph', () => {
  assert.equal(suggestSubdomain("Emma's Schatzkiste", ''), 'emmas-schatzkiste')
})

test('Sonderzeichen', () => {
  assert.equal(suggestSubdomain('', 'Café Müller & Söhne + Straße'), 'cafe-mueller-soehne-strasse')
})

test('leer', () => {
  assert.equal(suggestSubdomain('', ''), '')
})

test('63 Zeichen ohne Bindestrich am Ende', () => {
  assert.equal(suggestSubdomain('a'.repeat(62) + ' b', ''), 'a'.repeat(62))
})
