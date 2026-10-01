import test from 'node:test'
import assert from 'node:assert/strict'
import { loadModule } from './load.mjs'

const { formatBytes, formatDelta, ageLabel, usedPct, axisTimeKind, formatAxisTick, formatLegendTime } = await loadModule('src/lib/serverpulsFormat.js')

test('formatBytes: de-DE, Basis 1024', () => {
  assert.equal(formatBytes(1288490189), '1,2 GB')
  assert.equal(formatBytes(0), '0 B')
  assert.equal(formatBytes(512), '512 B')
  assert.equal(formatBytes(1536), '1,5 KB')
  assert.equal(formatBytes(null), '–')
})

test('formatDelta', () => {
  assert.equal(formatDelta(null).text, '–')
  assert.equal(formatDelta(null).dir, 'flat')
  assert.deepEqual(formatDelta(-3.21), { text: '−3,2 %', dir: 'down' })
  assert.deepEqual(formatDelta(12.34), { text: '+12,3 %', dir: 'up' })
  assert.equal(formatDelta(0).dir, 'flat')
})

test('ageLabel: stale ab > 15 Min.', () => {
  const now = 1_000_000_000_000
  const a16 = ageLabel(now - 16 * 60000, now)
  assert.equal(a16.stale, true)
  assert.equal(a16.text, 'vor 16 Min.')
  assert.equal(ageLabel(now - 14 * 60000, now).stale, false)
  assert.equal(ageLabel(now - 20000, now).text, 'gerade eben')
  assert.equal(ageLabel(null, now).stale, true)
})

test('usedPct: RAM value ist frei', () => {
  assert.equal(usedPct(250, 1000), 75)
  assert.equal(usedPct(null, 1000), null)
})

test('Zeitachse: Format nach Tick-Abstand', () => {
  assert.equal(axisTimeKind(3600), 'time')
  assert.equal(axisTimeKind(86400), 'day')
  assert.equal(axisTimeKind(86400 * 30), 'month')
  assert.equal(axisTimeKind(86400 * 365), 'year')
})

test('Zeitachse: deutsche Ausgabe in Europe/Berlin', () => {
  const t = Date.UTC(2026, 8, 30, 9, 20) / 1000 // 11:20 Berlin (MESZ)
  assert.equal(formatAxisTick(t, 3600), '11:20')
  assert.equal(formatAxisTick(t, 86400 * 2), '30.09.')
  assert.equal(formatAxisTick(Date.UTC(2026, 8, 29, 22, 0) / 1000, 3600 * 6), '30.09.') // Mitternacht Berlin
  assert.match(formatAxisTick(t, 86400 * 30), /2026/)
  assert.equal(formatAxisTick(t, 86400 * 365), '2026')
  assert.equal(formatLegendTime(t), '30.09.2026, 11:20')
  assert.equal(formatLegendTime(null), '–')
})

test('formatSince: Europe/Berlin, unabhängig von der Prozess-Zeitzone', async () => {
  const { formatSince } = await loadModule('src/lib/serverpulsFormat.js')
  assert.equal(formatSince(Date.UTC(2026, 6, 1, 10, 0, 0)), '01.07.26, 12:00')
  assert.equal(formatSince(Date.UTC(2026, 0, 1, 10, 0, 0)), '01.01.26, 11:00')
  assert.equal(formatSince(0), '')
})
