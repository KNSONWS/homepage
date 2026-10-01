// Reine Format-Helfer fuer die Serverpuls-Seite (kein React, unter Node testbar).
const nf = (digits) =>
  new Intl.NumberFormat('de-DE', { minimumFractionDigits: 0, maximumFractionDigits: digits })

const UNITS = ['B', 'KB', 'MB', 'GB', 'TB', 'PB']

export function formatBytes(n) {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return '–'
  let v = Math.abs(Number(n))
  if (v < 1) return '0 B'
  let i = 0
  while (v >= 1024 && i < UNITS.length - 1) {
    v /= 1024
    i += 1
  }
  const sign = n < 0 ? '−' : ''
  return `${sign}${nf(i === 0 ? 0 : 1).format(v)} ${UNITS[i]}`
}

export function formatDelta(pct) {
  if (pct === null || pct === undefined || Number.isNaN(Number(pct))) {
    return { text: '–', dir: 'flat' }
  }
  const rounded = Math.round(Number(pct) * 10) / 10
  if (rounded === 0) return { text: '0 %', dir: 'flat' }
  const sign = rounded > 0 ? '+' : '−'
  return { text: `${sign}${nf(1).format(Math.abs(rounded))} %`, dir: rounded > 0 ? 'up' : 'down' }
}

export const STALE_MS = 15 * 60 * 1000

export function ageLabel(ts, now = Date.now()) {
  if (ts === null || ts === undefined) return { text: 'keine Messung', stale: true }
  const diff = Math.max(0, now - ts)
  const min = Math.floor(diff / 60000)
  let text
  if (min < 1) text = 'gerade eben'
  else if (min < 60) text = `vor ${min} Min.`
  else if (min < 1440) text = `vor ${Math.floor(min / 60)} Std.`
  else text = `vor ${Math.floor(min / 1440)} T.`
  return { text, stale: diff > STALE_MS }
}

// RAM: value ist FREIER Speicher, belegt = 1 - frei/gesamt (in Prozent).
export function usedPct(free, total) {
  if (free === null || free === undefined || !total) return null
  return Math.round((1 - free / total) * 1000) / 10
}

export function formatPct(v, digits = 1) {
  if (v === null || v === undefined) return '–'
  return `${nf(digits).format(v)} %`
}

export function formatNumber(v, digits = 2) {
  if (v === null || v === undefined) return '–'
  return nf(digits).format(v)
}

// --- Zeitachsen (Europe/Berlin, de-DE) ---
const TZ = 'Europe/Berlin'
const dtf = (opts) => new Intl.DateTimeFormat('de-DE', { timeZone: TZ, ...opts })
const F = {
  time: dtf({ hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }),
  day: dtf({ day: '2-digit', month: '2-digit' }),
  month: dtf({ month: 'short', year: 'numeric' }),
  year: dtf({ year: 'numeric' }),
  legend: dtf({ day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }),
}

// Welches Format passt zu einem Tick-Abstand (Sekunden)?
export function axisTimeKind(incrSec) {
  if (incrSec < 86400) return 'time'
  if (incrSec < 86400 * 28) return 'day'
  if (incrSec < 86400 * 360) return 'month'
  return 'year'
}

// Tick (Sekunden) -> Text. Bei Tagesgrenzen innerhalb von Sub-Tages-Achsen das Datum zeigen.
export function formatAxisTick(sec, incrSec) {
  const kind = axisTimeKind(incrSec)
  const d = new Date(sec * 1000)
  if (kind === 'time' && F.time.format(d) === '00:00') return F.day.format(d)
  return F[kind].format(d)
}

// Legende: "30.09.2026, 11:20"
export function formatLegendTime(sec) {
  if (sec === null || sec === undefined) return '–'
  return F.legend.format(new Date(sec * 1000))
}

// "seit"-Zeitpunkt in Warnungen, immer Berliner Zeit.
export function formatSince(ts) {
  if (!ts) return ''
  return new Date(ts).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Berlin' })
}
