// Reine Format- und Parser-Helfer fuer die Finanzen-Seiten (kein React, kein Appwrite, unter Node testbar).
// Alle Betraege sind Cent (Integer). Minus ist immer U+2212, nicht der Bindestrich.

const MINUS = '−'
const PLACEHOLDER = '–'

function isNum(v) {
  return typeof v === 'number' && Number.isFinite(v)
}

// 1234567 -> '1.234.567'
function groupThousands(intString) {
  return intString.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
}

// Cent -> { neg, euros, rest } mit auf ganze Cent gerundetem Betrag; neg nur, wenn der Betrag nicht 0 ist.
function splitCents(cents) {
  const abs = Math.round(Math.abs(cents))
  return { neg: cents < 0 && abs !== 0, euros: Math.floor(abs / 100), rest: abs % 100 }
}

/** 123456 -> '1.234,56 €'; null/ungueltig -> '–'; negativ mit U+2212. */
export function euro(cents) {
  if (!isNum(cents)) return PLACEHOLDER
  const { neg, euros, rest } = splitCents(cents)
  return `${neg ? MINUS : ''}${groupThousands(String(euros))},${String(rest).padStart(2, '0')} €`
}

/** 10893 -> '109 €' (auf ganze Euro gerundet, ab 50 Cent auf). */
export function euroWhole(cents) {
  if (!isNum(cents)) return PLACEHOLDER
  const abs = Math.round(Math.abs(cents) / 100)
  const neg = cents < 0 && abs !== 0
  return `${neg ? MINUS : ''}${groupThousands(String(abs))} €`
}

/** 16879 -> '+168,79 €', -449 -> '−4,49 €', 0 -> '0,00 €'. */
export function signedEuro(cents) {
  if (!isNum(cents)) return PLACEHOLDER
  const { neg } = splitCents(cents)
  const text = euro(Math.abs(cents))
  if (neg) return `${MINUS}${text}`
  return cents > 0 && text !== '0,00 €' ? `+${text}` : text
}

/** 30 -> '30', 27.5 -> '27,5', 0.32 (1 Stelle) -> '0,3'; höchstens `maxDigits` Nachkommastellen, ohne überflüssige Nullen; ungültig -> '–'. */
export function percentDe(value, maxDigits = 2) {
  if (!isNum(value)) return PLACEHOLDER
  const rounded = Number(value.toFixed(maxDigits))
  return String(rounded).replace('-', MINUS).replace('.', ',')
}

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/
const berlinDate = new Intl.DateTimeFormat('de-DE', {
  timeZone: 'Europe/Berlin',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
})

/** '2027-03-29' -> '29.03.2027'; ISO-Zeitpunkte in Berliner Zeit; ungueltig -> '–'. */
export function dateDe(value) {
  if (typeof value !== 'string' || !value.trim()) return PLACEHOLDER
  const s = value.trim()
  const m = DATE_ONLY.exec(s)
  if (m) {
    const [, y, mo, d] = m
    const probe = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d)))
    const valid =
      probe.getUTCFullYear() === Number(y) &&
      probe.getUTCMonth() === Number(mo) - 1 &&
      probe.getUTCDate() === Number(d)
    return valid ? `${d}.${mo}.${y}` : PLACEHOLDER
  }
  const t = Date.parse(s)
  return Number.isNaN(t) ? PLACEHOLDER : berlinDate.format(new Date(t))
}

/** ISO-Zeitpunkt -> 'gerade eben' | 'vor 12 Min.' | 'vor 3 Std.' | 'vor 1 Tag' | 'vor 2 Tagen'. */
export function sinceLabel(iso, now = Date.now()) {
  if (typeof iso !== 'string' && !(iso instanceof Date)) return PLACEHOLDER
  const then = iso instanceof Date ? iso.getTime() : Date.parse(iso)
  const nowMs = now instanceof Date ? now.getTime() : Number(now)
  if (Number.isNaN(then) || Number.isNaN(nowMs)) return PLACEHOLDER
  const min = Math.floor(Math.max(0, nowMs - then) / 60000)
  if (min < 1) return 'gerade eben'
  if (min < 60) return `vor ${min} Min.`
  const hours = Math.floor(min / 60)
  if (hours < 24) return `vor ${hours} Std.`
  const days = Math.floor(hours / 24)
  return days === 1 ? 'vor 1 Tag' : `vor ${days} Tagen`
}

/** Berliner Kalendertag ('YYYY-MM-DD') eines ISO-Zeitpunkts, Date oder Millisekundenwerts; ungueltig -> null. */
export function ymdBerlin(value) {
  const t =
    value instanceof Date ? value.getTime() : typeof value === 'number' ? value : typeof value === 'string' ? Date.parse(value) : NaN
  if (!Number.isFinite(t)) return null
  const parts = Object.fromEntries(berlinDate.formatToParts(new Date(t)).map((p) => [p.type, p.value]))
  return `${parts.year}-${parts.month}-${parts.day}`
}

// Ganze Euro mit Tausenderpunkten (1.234.567) oder ohne Punkte, optional ,1-2 Nachkommastellen.
// Eine fuehrende 0 ist nur ohne Tausenderpunkte erlaubt, '12.50' (englisch) ist absichtlich ungueltig.
const AMOUNT = /^([1-9][0-9]{0,2}(?:\.[0-9]{3})+|[0-9]+)(?:,([0-9]{1,2}))?$/

/**
 * '1.234,56' -> 123456 (Cent). Erlaubt Tausenderpunkte, Dezimalkomma und ein
 * einzelnes Euro-Zeichen davor oder dahinter. Keine negativen Werte, kein Dezimalpunkt.
 * Wirft Error('Ungültiger Betrag').
 */
export function parseEuro(text) {
  const invalid = () => new Error('Ungültiger Betrag')
  if (typeof text !== 'string') throw invalid()
  let s = text.trim()
  if (s.startsWith('€')) s = s.slice(1).trim()
  else if (s.endsWith('€')) s = s.slice(0, -1).trim()
  const m = AMOUNT.exec(s)
  if (!m) throw invalid()
  const euros = Number(m[1].replace(/\./g, ''))
  const cents = Number((m[2] || '').padEnd(2, '0'))
  const total = euros * 100 + cents
  if (!Number.isSafeInteger(total)) throw invalid()
  return total
}

export const INVOICE_STATUS = {
  entwurf: { label: 'Entwurf', tone: 'muted' },
  offen: { label: 'Offen', tone: 'info' },
  ueberfaellig: { label: 'Überfällig', tone: 'warn' },
  bezahlt: { label: 'Bezahlt', tone: 'ok' },
  storniert: { label: 'Storniert', tone: 'muted' },
  uneinbringlich: { label: 'Uneinbringlich', tone: 'danger' },
}

export const CATEGORY_LABEL = {
  rechnung: 'Rechnung',
  'rechnung-extern': 'Einnahme ohne Stripe-Rechnung',
  'stripe-auszahlung': 'Stripe-Auszahlung',
  fixkosten: 'Fixkosten',
  privat: 'Privat/Umbuchung',
  sonstiges: 'Sonstiges',
  '': 'Offen',
}

export const URGENCY = {
  hoch: { label: 'Dringend', tone: 'danger' },
  mittel: { label: 'Bald', tone: 'warn' },
  info: { label: 'Hinweis', tone: 'muted' },
}

export const AGE_GROUP_LABEL = {
  'nicht-faellig': 'Nicht fällig',
  '1-30': '1–30 Tage',
  '31-60': '31–60 Tage',
  'ueber-60': 'Über 60 Tage',
}

export const INTERVAL_LABEL = {
  monat: 'monatlich',
  quartal: 'vierteljährlich',
  jahr: 'jährlich',
}

const INTERVAL_MONTHS = { monat: 1, quartal: 3, jahr: 12 }

function daysInMonth(year, month) {
  if (month === 2) return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28
  return [4, 6, 9, 11].includes(month) ? 30 : 31
}

/**
 * Naechster Termin einer Folge: '2026-01-31' + 'monat' -> '2026-02-28' (Monatsende wird begrenzt, nie in den
 * Folgemonat uebergelaufen). Rhythmen: monat, quartal, jahr. Ungueltiges Datum oder unbekannter Rhythmus -> null.
 */
export function nextIntervalDate(ymd, interval) {
  const months = Object.prototype.hasOwnProperty.call(INTERVAL_MONTHS, interval) ? INTERVAL_MONTHS[interval] : 0
  const m = typeof ymd === 'string' ? DATE_ONLY.exec(ymd.trim()) : null
  if (!months || !m) return null
  const year = Number(m[1])
  const month = Number(m[2])
  const day = Number(m[3])
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return null
  const total = year * 12 + (month - 1) + months
  const nextYear = Math.floor(total / 12)
  const nextMonth = (total % 12) + 1
  const nextDay = Math.min(day, daysInMonth(nextYear, nextMonth))
  return `${String(nextYear).padStart(4, '0')}-${String(nextMonth).padStart(2, '0')}-${String(nextDay).padStart(2, '0')}`
}

/** Seite einer Liste (1-basiert); die Seitenzahl wird auf 1..pages begrenzt. */
export function pageOf(list, page, size = 50) {
  const items = Array.isArray(list) ? list : []
  const perPage = Number.isInteger(size) && size > 0 ? size : 50
  const pages = Math.max(1, Math.ceil(items.length / perPage))
  const wanted = Math.floor(Number(page))
  const current = Number.isNaN(wanted) ? 1 : Math.min(Math.max(wanted, 1), pages)
  return { items: items.slice((current - 1) * perPage, current * perPage), page: current, pages }
}

/**
 * Darf fuer diesen Kunden eine Rechnung erstellt werden?
 * Leads und Abgesagte sind keine festen Kunden; Bestandsdaten ohne Status zaehlen als Kunde (wie customerStage).
 */
export function canInvoice(customer) {
  if (!customer) return { ok: false, reason: 'Kein Kunde ausgewählt' }
  const status = String(customer.customerStatus || '').trim().toLowerCase()
  if (status === 'lead' || status === 'lost') return { ok: false, reason: 'Noch kein fester Kunde' }
  const email = typeof customer.email === 'string' ? customer.email.trim() : ''
  if (!email) return { ok: false, reason: 'E-Mail fehlt' }
  return { ok: true }
}
