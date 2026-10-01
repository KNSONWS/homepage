import test from 'node:test'
import assert from 'node:assert/strict'
import { loadModule } from './load.mjs'

const { startsCollapsed, AUTO_COLLAPSE_MAX_WIDTH } = await loadModule('src/lib/sidebar.js')

// Fenster mit matchMedia, das "(max-width: Npx)" gegen eine feste Breite prueft
const windowOf = (width) => ({
  matchMedia: (query) => ({ matches: width <= Number(/max-width:\s*(\d+)px/.exec(query)?.[1]) }),
})

test('startsCollapsed: Handy (390 px) und Grenze (720 px) starten eingeklappt', () => {
  assert.equal(AUTO_COLLAPSE_MAX_WIDTH, 720)
  assert.equal(startsCollapsed(windowOf(390)), true)
  assert.equal(startsCollapsed(windowOf(720)), true)
})

test('startsCollapsed: breitere Fenster starten ausgeklappt', () => {
  assert.equal(startsCollapsed(windowOf(721)), false)
  assert.equal(startsCollapsed(windowOf(1280)), false)
})

test('startsCollapsed: ohne window oder matchMedia (oder bei Fehler) ausgeklappt', () => {
  assert.equal(startsCollapsed(null), false)
  assert.equal(startsCollapsed({}), false)
  assert.equal(startsCollapsed({ matchMedia: () => { throw new Error('kaputt') } }), false)
})
