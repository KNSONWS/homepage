import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const source = readFileSync(path.join(root, 'src/components/AdminRoute.jsx'), 'utf8')

// AdminRoute braucht React und den Auth-Kontext (nicht unter Node ladbar): der Ladetext wird am Quelltext geprüft
test('AdminRoute: Ladetext auf Deutsch, kein englisches „Loading...“', () => {
  assert.match(source, /<p>Wird geladen …<\/p>/)
  assert.doesNotMatch(source, /Loading/)
})
