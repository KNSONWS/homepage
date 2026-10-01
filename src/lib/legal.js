// Reine Logik fuer den Bereich Rechtliches: Kuendigungsfristen der Anbieter-Vertraege
// und die Versionsgeschichte der Rechtstexte. Datumswerte sind immer 'YYYY-MM-DD'.

const DAY = 24 * 60 * 60 * 1000

function toUtc(date) {
  const [y, m, d] = date.split('-').map(Number)
  return Date.UTC(y, m - 1, d)
}

function fromUtc(ms) {
  return new Date(ms).toISOString().slice(0, 10)
}

function addDays(date, n) {
  return fromUtc(toUtc(date) + n * DAY)
}

function daysBetween(from, to) {
  return Math.round((toUtc(to) - toUtc(from)) / DAY)
}

function isSet(value) {
  return value !== null && value !== undefined && value !== ''
}

/** Monate addieren; der Tag wird auf das Monatsende geklemmt (31.01. + 1 = 28./29.02.). */
export function addMonthsClamped(date, n) {
  const [y, m, d] = date.split('-').map(Number)
  const index = y * 12 + (m - 1) + n
  const year = Math.floor(index / 12)
  const month = index - year * 12
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
  return fromUtc(Date.UTC(year, month, Math.min(d, lastDay)))
}

function noticeDate(periodEnd, contract) {
  const value = Number(contract.noticeValue)
  return contract.noticeUnit === 'days'
    ? addDays(periodEnd, -value)
    : addMonthsClamped(periodEnd, -value)
}

/**
 * Naechster Kuendigungstermin eines Anbieter-Vertrags.
 * state: active (noticeBy = spaetester Kuendigungstag), anytime (jederzeit kuendbar),
 * ends (laeuft ohne Verlaengerung aus), ended, cancelled, incomplete (Angaben fehlen).
 */
export function nextCancellationDate(contract, today) {
  if (isSet(contract.cancelledAt)) {
    return { state: 'cancelled', periodEnd: contract.endsAt || null, noticeBy: null }
  }
  // Jederzeit kuendbar braucht keinen Beginn (z. B. Stripe, Cloud-Server)
  if (isSet(contract.termMonths) && Number(contract.termMonths) === 0) {
    return { state: 'anytime', periodEnd: null, noticeBy: null }
  }
  if (!isSet(contract.startDate) || !isSet(contract.termMonths)) {
    return { state: 'incomplete', periodEnd: null, noticeBy: null }
  }
  const term = Number(contract.termMonths)

  const renewal = Number(contract.renewalMonths) || 0
  let periodEnd = addMonthsClamped(contract.startDate, term)
  if (renewal === 0) {
    return { state: periodEnd < today ? 'ended' : 'ends', periodEnd, noticeBy: null }
  }
  if (!isSet(contract.noticeValue) || !isSet(contract.noticeUnit)) {
    return { state: 'incomplete', periodEnd: null, noticeBy: null }
  }
  // Jede Periode vom Beginn aus rechnen: vom schon geklemmten Ende weiterzuzaehlen
  // wuerde nach einem Februar auf dem 28. haengen bleiben.
  for (let k = 1; noticeDate(periodEnd, contract) < today; k++) {
    periodEnd = addMonthsClamped(contract.startDate, term + k * renewal)
  }
  return { state: 'active', periodEnd, noticeBy: noticeDate(periodEnd, contract) }
}

/** Farbe in der Vertragsliste: rot <= 30 Tage, orange <= 90 Tage bis zum Kuendigungstermin. */
export function deadlineTone(result, today) {
  if (result.state === 'cancelled' || result.state === 'ended') return 'grey'
  if (result.state === 'incomplete') return 'missing'
  if (result.state !== 'active' || !result.noticeBy) return 'normal'
  const days = daysBetween(today, result.noticeBy)
  if (days <= 30) return 'red'
  if (days <= 90) return 'orange'
  return 'normal'
}

// Tag vor dem neuen Beginn, aber nie vor dem eigenen Beginn (Abloesung am selben Tag).
function dayBeforeOrSame(nextFrom, ownFrom) {
  const before = addDays(nextFrom, -1)
  return ownFrom && before < ownFrom ? ownFrom : before
}

const newness = (v) => `${v.validFrom || ''}|${v.$createdAt || ''}`

/**
 * Aktuell gueltige Version; bei mehreren (z. B. halb gescheiterte Abloesung) die mit dem
 * juengsten validFrom, bei gleichem Datum die zuletzt angelegte.
 */
export function currentVersion(versions) {
  return versions
    .filter((v) => v.status === 'current')
    .reduce((best, v) => (!best || newness(v) > newness(best) ? v : best), null)
}

/**
 * Was beim Anlegen einer Version zu tun ist: das neue Dokument und die Aenderungen an
 * bestehenden Versionen. Eine juengere gueltige Version loest die aktuelle ab; eine
 * nachgetragene aeltere Fassung wird direkt als abgeloest einsortiert.
 */
export function planNewVersion(versions, input) {
  const siblings = versions.filter(
    (v) => v.documentKey === input.documentKey && v.$id !== input.$id
  )
  if (input.status !== 'current') {
    return { create: { ...input, validTo: null }, updates: [] }
  }
  const current = currentVersion(siblings)
  if (!current || input.validFrom >= current.validFrom) {
    const updates = current
      ? [{ id: current.$id, patch: { status: 'superseded', validTo: dayBeforeOrSame(input.validFrom, current.validFrom) } }]
      : []
    return { create: { ...input, validTo: null }, updates }
  }
  const nextFrom = siblings
    .filter((v) => v.status !== 'draft' && v.validFrom > input.validFrom)
    .map((v) => v.validFrom)
    .sort()[0]
  return {
    create: { ...input, status: 'superseded', validTo: addDays(nextFrom, -1) },
    updates: [],
  }
}

/** 'YYYY-MM-DD' -> 'dd.mm.yyyy' */
export function formatDate(date) {
  if (!date) return '–'
  const [y, m, d] = date.slice(0, 10).split('-')
  return `${d}.${m}.${y}`
}
