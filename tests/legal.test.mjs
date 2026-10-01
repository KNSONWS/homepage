import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  addMonthsClamped,
  nextCancellationDate,
  deadlineTone,
  currentVersion,
  planNewVersion,
  formatDate,
} from '../src/lib/legal.js'

const yearly = {
  startDate: '2025-03-12',
  termMonths: 12,
  renewalMonths: 12,
  noticeValue: 1,
  noticeUnit: 'months',
}

test('addMonthsClamped klemmt auf Monatsende', () => {
  assert.equal(addMonthsClamped('2026-01-31', 1), '2026-02-28')
  assert.equal(addMonthsClamped('2028-01-31', 1), '2028-02-29')
  assert.equal(addMonthsClamped('2026-03-15', 12), '2027-03-15')
  assert.equal(addMonthsClamped('2026-03-31', -1), '2026-02-28')
})

test('laufender Jahresvertrag', () => {
  assert.deepEqual(nextCancellationDate(yearly, '2026-09-30'), {
    state: 'active',
    periodEnd: '2027-03-12',
    noticeBy: '2027-02-12',
  })
})

test('Kündigungstermin heute zählt noch, danach nächste Periode', () => {
  assert.equal(nextCancellationDate(yearly, '2027-02-12').noticeBy, '2027-02-12')
  const next = nextCancellationDate(yearly, '2027-02-13')
  assert.equal(next.periodEnd, '2028-03-12')
  assert.equal(next.noticeBy, '2028-02-12')
})

test('Kündigungsfrist in Tagen', () => {
  const r = nextCancellationDate({ ...yearly, noticeValue: 30, noticeUnit: 'days' }, '2026-09-30')
  assert.equal(r.periodEnd, '2027-03-12')
  assert.equal(r.noticeBy, '2027-02-10')
})

test('Start am 31. läuft nicht in den Folgemonat über', () => {
  const r = nextCancellationDate(
    { startDate: '2026-01-31', termMonths: 1, renewalMonths: 1, noticeValue: 0, noticeUnit: 'days' },
    '2026-02-01'
  )
  assert.equal(r.periodEnd, '2026-02-28')
})

test('jederzeit kündbar', () => {
  const r = nextCancellationDate({ startDate: '2025-01-01', termMonths: 0 }, '2026-09-30')
  assert.equal(r.state, 'anytime')
  assert.equal(r.noticeBy, null)
})

test('ohne Verlängerung: endet, danach beendet', () => {
  const c = { startDate: '2026-01-01', termMonths: 12, renewalMonths: 0 }
  assert.deepEqual(nextCancellationDate(c, '2026-09-30'), { state: 'ends', periodEnd: '2027-01-01', noticeBy: null })
  assert.equal(nextCancellationDate(c, '2027-01-02').state, 'ended')
})

test('gekündigt', () => {
  const r = nextCancellationDate({ ...yearly, cancelledAt: '2026-09-01', endsAt: '2027-03-12' }, '2026-09-30')
  assert.deepEqual(r, { state: 'cancelled', periodEnd: '2027-03-12', noticeBy: null })
})

test('unvollständige Angaben', () => {
  assert.equal(nextCancellationDate({ ...yearly, startDate: '' }, '2026-09-30').state, 'incomplete')
  assert.equal(nextCancellationDate({ ...yearly, noticeValue: null }, '2026-09-30').state, 'incomplete')
  assert.equal(nextCancellationDate({ startDate: '2026-01-01' }, '2026-09-30').state, 'incomplete')
})

test('deadlineTone', () => {
  const today = '2026-09-30'
  const at = (noticeBy) => deadlineTone({ state: 'active', noticeBy, periodEnd: null }, today)
  assert.equal(at('2026-10-30'), 'red')
  assert.equal(at('2026-10-31'), 'orange')
  assert.equal(at('2026-12-29'), 'orange')
  assert.equal(at('2026-12-30'), 'normal')
  assert.equal(deadlineTone({ state: 'cancelled' }, today), 'grey')
  assert.equal(deadlineTone({ state: 'ended' }, today), 'grey')
  assert.equal(deadlineTone({ state: 'incomplete' }, today), 'missing')
  assert.equal(deadlineTone({ state: 'anytime' }, today), 'normal')
  assert.equal(deadlineTone({ state: 'ends' }, today), 'normal')
})

const v5 = { $id: 'v5', documentKey: 'agb', version: 'v5', status: 'current', validFrom: '2026-05-01', validTo: null }
const v4 = { $id: 'v4', documentKey: 'agb', version: 'v4', status: 'superseded', validFrom: '2026-01-10', validTo: '2026-04-30' }

test('neue gültige Version löst die aktuelle ab', () => {
  const r = planNewVersion([v4, v5], { documentKey: 'agb', version: 'v6', status: 'current', validFrom: '2026-09-01' })
  assert.deepEqual(r.updates, [{ id: 'v5', patch: { status: 'superseded', validTo: '2026-08-31' } }])
  assert.equal(r.create.validTo, null)
  assert.equal(r.create.status, 'current')
})

test('Entwurf löst nichts ab', () => {
  const r = planNewVersion([v4, v5], { documentKey: 'agb', version: 'v6', status: 'draft', validFrom: '2026-12-01' })
  assert.deepEqual(r.updates, [])
  assert.equal(r.create.status, 'draft')
})

test('Nachtrag einer alten Fassung löst die aktuelle nicht ab', () => {
  const r = planNewVersion([v4, v5], { documentKey: 'agb', version: 'v4b', status: 'current', validFrom: '2026-02-01' })
  assert.deepEqual(r.updates, [])
  assert.equal(r.create.status, 'superseded')
  assert.equal(r.create.validTo, '2026-04-30')
})

test('currentVersion nimmt bei zwei gültigen die jüngere', () => {
  const twin = { ...v5, $id: 'v6', version: 'v6', validFrom: '2026-09-01' }
  assert.equal(currentVersion([v4, v5, twin]).$id, 'v6')
  assert.equal(currentVersion([v4]), null)
})

test('formatDate', () => {
  assert.equal(formatDate('2026-09-30'), '30.09.2026')
  assert.equal(formatDate(''), '–')
  assert.equal(formatDate(null), '–')
})

test('currentVersion: bei gleichem validFrom gewinnt die zuletzt angelegte', () => {
  const a = { ...v5, $id: 'a', validFrom: '2026-09-30', $createdAt: '2026-09-30T10:00:00.000Z' }
  const b = { ...v5, $id: 'b', validFrom: '2026-09-30', $createdAt: '2026-09-30T11:00:00.000Z' }
  assert.equal(currentVersion([a, b]).$id, 'b')
  assert.equal(currentVersion([b, a]).$id, 'b')
})

test('Abloesung am selben Tag: validTo nie vor validFrom', () => {
  const r = planNewVersion([v5], { documentKey: 'agb', version: 'v6', status: 'current', validFrom: '2026-05-01' })
  assert.deepEqual(r.updates, [{ id: 'v5', patch: { status: 'superseded', validTo: '2026-05-01' } }])
})

test('Verlaengerungen ab dem 31. driften nicht auf den 28.', () => {
  const r = nextCancellationDate(
    { startDate: '2025-01-31', termMonths: 1, renewalMonths: 1, noticeValue: 1, noticeUnit: 'days' },
    '2025-04-05'
  )
  assert.equal(r.periodEnd, '2025-04-30')
  assert.equal(r.noticeBy, '2025-04-29')
})

test('jederzeit kuendbar braucht kein Beginn-Datum', () => {
  assert.equal(nextCancellationDate({ termMonths: 0 }, '2026-09-30').state, 'anytime')
})
