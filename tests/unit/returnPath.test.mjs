import test from 'node:test'
import assert from 'node:assert/strict'
import { loadModule } from './load.mjs'

const { safeReturnPath } = await loadModule('src/lib/returnPath.js')

test('Pfad und Suchteil bleiben erhalten', () => {
  assert.equal(safeReturnPath({ pathname: '/projects/zuordnen/abc', search: '?x=1' }), '/projects/zuordnen/abc?x=1')
  assert.equal(safeReturnPath({ pathname: '/projects/zuordnen/abc' }), '/projects/zuordnen/abc')
  assert.equal(safeReturnPath('/customers/5'), '/customers/5')
})

test('Fallback bei fehlendem oder unsicherem Ziel', () => {
  for (const bad of [undefined, null, {}, '', 'https://evil.example', '//evil.example', '/\\evil', 'javascript:alert(1)', { pathname: '//evil.example' }, { pathname: 'projects' }, { pathname: '/login' }, 42]) {
    assert.equal(safeReturnPath(bad), '/tickets', JSON.stringify(bad))
  }
})

test('Suchteil ohne ? wird verworfen', () => {
  assert.equal(safeReturnPath({ pathname: '/a', search: 'evil' }), '/a')
})
