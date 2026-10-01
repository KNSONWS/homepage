import test from 'node:test'
import assert from 'node:assert/strict'
import { loadModule } from './load.mjs'

const { isOutsideOrg, needsPreviewButton, assignSummary, assignSequentially } = await loadModule(
  'src/lib/projectAssign.js'
)

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

test('isOutsideOrg', () => {
  assert.equal(isOutsideOrg('JUSN/D-ner-Nation'), true)
  assert.equal(isOutsideOrg('webklar/x'), false)
  assert.equal(isOutsideOrg(''), false)
})

test('needsPreviewButton', () => {
  assert.equal(needsPreviewButton({ previewUrl: 'https://x', status: 'deployed' }), false)
  assert.equal(needsPreviewButton({ previewUrl: '', status: 'synced' }), true)
  assert.equal(needsPreviewButton({ previewUrl: 'https://x', status: 'pending' }), true)
})

test('assignSummary', () => {
  assert.deepEqual(
    assignSummary('Döner Nation', {
      moved: { from: 'JUSN/D-ner-Nation', to: 'WEBklar/D-ner-Nation' },
      backfilled: 1,
      warnings: [],
    }),
    { text: 'Döner Nation: nach WEBklar verschoben · 1 Push nachgetragen', warnings: [] }
  )
  assert.deepEqual(
    assignSummary('X', { moved: null, backfilled: 0, warnings: ['Internes Repo, bleibt wo es ist.'] }),
    { text: 'X: keine neuen Pushes', warnings: ['Internes Repo, bleibt wo es ist.'] }
  )
  assert.equal(assignSummary('X', { moved: null, backfilled: 3, warnings: [] }).text, 'X: 3 Pushes nachgetragen')
  assert.deepEqual(assignSummary('X', { error: 'boom' }), { text: 'X: Zuweisen fehlgeschlagen – boom', warnings: [] })
})

test('nacheinander und weiter nach Fehler', async () => {
  const log = []
  const fn = async (id) => {
    log.push(id + ':start')
    await sleep(10)
    log.push(id + ':end')
    if (id === 'b') throw new Error('boom')
    return { backfilled: 0 }
  }
  const r = await assignSequentially(['a', 'b', 'c'], { ticketId: 't1' }, fn)
  assert.deepEqual(log, ['a:start', 'a:end', 'b:start', 'b:end', 'c:start', 'c:end'])
  assert.deepEqual(
    r.map((x) => [x.projectId, x.ok, x.error]),
    [
      ['a', true, undefined],
      ['b', false, 'boom'],
      ['c', true, undefined],
    ]
  )
})
