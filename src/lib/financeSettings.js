// Reine Helfer fuer die Einstellungsseite der Finanzen (Einstellungen, Fixkosten, Bankzugang); kein React, kein
// Appwrite, unter Node testbar. Betraege sind Cent, in Formularen Euro-Texte (de-DE); Texte deutsch.
import { INTERVAL_LABEL, dateDe, euro, parseEuro, sinceLabel, ymdBerlin } from './financeFormat'

const isNum = (v) => typeof v === 'number' && Number.isFinite(v)
const text = (v) => (typeof v === 'string' ? v.trim() : '')

/** Grenzen der Portal-API (settings.js); die Oberfläche prüft vorab, der Server entscheidet. */
export const SETTINGS_LIMITS = {
  maxPercent: 60,
  maxBufferCents: 100_000_000,
  maxBankDetails: 500,
  maxName: 120,
  maxMatch: 120,
}

/** Beispiel für den Bankverbindungstext (steht im Fuß jeder Rechnung). */
export const BANK_DETAILS_EXAMPLE = 'Bankverbindung: WEBklar GbR · IBAN DE.. · BIC ..'

/** Rückfrage vor dem Löschen einer Fixkosten-Position. */
export const FIXED_COST_DELETE_CONFIRM =
  'Position wirklich löschen? Bereits zugeordnete Buchungen behalten den Verweis. Besser auf inaktiv setzen.'

const AMOUNT_HELP = 'Bitte einen Betrag wie 1.234,56 eingeben.'

// Felder, deren Namen der Server der Fehlermeldung voranstellt („minBufferCents: Der Mindestpuffer …“)
const API_FIELDS = [
  'minBufferCents',
  'taxReservePercent',
  'previousYearRevenueCents',
  'estPrepaymentCents',
  'bankDetailsText',
  'name',
  'amountCents',
  'interval',
  'nextDate',
  'counterpartyMatch',
  'active',
]
const FIELD_PREFIX = new RegExp(`^(?:${API_FIELDS.join('|')}): `)

/** Meldung eines API-Fehlers ohne den technischen Feldnamen am Anfang. */
export function apiErrorMessage(err, fallback = 'Das Speichern ist fehlgeschlagen.') {
  const message = text(err?.message)
  return message ? message.replace(FIELD_PREFIX, '') : fallback
}

/** 123456 -> '1.234,56' (ohne Euro-Zeichen, für Eingabefelder); null/ungültig -> ''. */
export function euroField(cents) {
  return isNum(cents) ? euro(cents).replace(/ €$/, '') : ''
}

/** Text -> Cent oder { error }; leer ist Sache des Aufrufers. */
function amountCents(value) {
  try {
    return { cents: parseEuro(String(value ?? '')) }
  } catch {
    return { error: `Ungültiger Betrag. ${AMOUNT_HELP}` }
  }
}

// --- Einstellungen -------------------------------------------------------------------------------------------

/** Zeichen des Bankverbindungstexts, wie sie gespeichert werden (ohne Leerraum am Rand). */
export function bankDetailsLength(value) {
  return text(value).length
}

/** Antwort des Servers (Cent) -> Formular (Texte). */
export function settingsToForm(settings) {
  const s = settings && typeof settings === 'object' ? settings : {}
  return {
    minBuffer: euroField(s.minBufferCents),
    taxReservePercent: isNum(s.taxReservePercent) ? String(s.taxReservePercent) : '',
    previousYearRevenue: euroField(s.previousYearRevenueCents),
    estPrepayment: euroField(s.estPrepaymentCents),
    bankDetailsText: typeof s.bankDetailsText === 'string' ? s.bankDetailsText : '',
  }
}

/**
 * Formular -> PATCH-Körper. { ok: true, payload } oder { ok: false, errors: { feld: 'Meldung' } } (alle Fehler).
 * Mindestpuffer und ESt-Vorauszahlung: Betrag ab 0 (0 ist erlaubt), Pflicht. Vorjahresumsatz: leer = null.
 * Rücklage: ganze Zahl 0 bis 60. Bankverbindungstext: höchstens 500 Zeichen.
 */
export function validateSettingsForm(form) {
  const f = form && typeof form === 'object' ? form : {}
  const errors = {}
  const payload = {}

  const buffer = text(f.minBuffer)
  if (!buffer) {
    errors.minBuffer = 'Bitte einen Betrag eingeben (0 ist möglich).'
  } else {
    const r = amountCents(buffer)
    if (r.error) errors.minBuffer = r.error
    else if (r.cents > SETTINGS_LIMITS.maxBufferCents) errors.minBuffer = `Der Mindestpuffer darf höchstens ${euro(SETTINGS_LIMITS.maxBufferCents)} betragen.`
    else payload.minBufferCents = r.cents
  }

  const percent = text(f.taxReservePercent).replace(/\s*%$/, '')
  if (/^[0-9]{1,3}$/.test(percent) && Number(percent) <= SETTINGS_LIMITS.maxPercent) {
    payload.taxReservePercent = Number(percent)
  } else {
    errors.taxReservePercent = `Die Rücklage muss eine ganze Zahl von 0 bis ${SETTINGS_LIMITS.maxPercent} sein.`
  }

  const revenue = text(f.previousYearRevenue)
  if (!revenue) {
    payload.previousYearRevenueCents = null
  } else {
    const r = amountCents(revenue)
    if (r.error) errors.previousYearRevenue = r.error
    else payload.previousYearRevenueCents = r.cents
  }

  const prepayment = text(f.estPrepayment)
  if (!prepayment) {
    errors.estPrepayment = 'Bitte einen Betrag eingeben (0 ist möglich).'
  } else {
    const r = amountCents(prepayment)
    if (r.error) errors.estPrepayment = r.error
    else payload.estPrepaymentCents = r.cents
  }

  const bank = text(f.bankDetailsText)
  if (bank.length > SETTINGS_LIMITS.maxBankDetails) {
    errors.bankDetailsText = `Der Text darf höchstens ${SETTINGS_LIMITS.maxBankDetails} Zeichen lang sein (aktuell ${bank.length}).`
  } else {
    payload.bankDetailsText = bank
  }

  return Object.keys(errors).length > 0 ? { ok: false, errors } : { ok: true, payload }
}

/** Reihenfolge der Felder im Formular (für den Fokus auf das erste fehlerhafte). */
export const SETTINGS_FIELD_ORDER = ['minBuffer', 'taxReservePercent', 'previousYearRevenue', 'estPrepayment', 'bankDetailsText']

// --- Fixkosten -----------------------------------------------------------------------------------------------

/** Auswahl für den Rhythmus: [{ value: 'monat', label: 'monatlich' }, …]. */
export const INTERVAL_OPTIONS = Object.entries(INTERVAL_LABEL).map(([value, label]) => ({ value, label }))

export function emptyFixedCostForm() {
  return { name: '', amount: '', interval: 'monat', nextDate: '', counterpartyMatch: '' }
}

/** Position des Servers -> Formular (Texte). */
export function fixedCostToForm(position) {
  const p = position && typeof position === 'object' ? position : {}
  return {
    name: typeof p.name === 'string' ? p.name : '',
    amount: euroField(p.amountCents),
    interval: Object.prototype.hasOwnProperty.call(INTERVAL_LABEL, p.interval) ? p.interval : 'monat',
    nextDate: typeof p.nextDate === 'string' ? p.nextDate : '',
    counterpartyMatch: typeof p.counterpartyMatch === 'string' ? p.counterpartyMatch : '',
  }
}

function isRealDay(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && dateDe(value) !== '–'
}

/**
 * Formular -> Körper für POST/PATCH /fixkosten: { ok: true, payload: { name, amountCents, interval, nextDate,
 * counterpartyMatch } } oder { ok: false, errors: { feld: 'Meldung' } }. Betrag größer als 0.
 */
export function validateFixedCostForm(form) {
  const f = form && typeof form === 'object' ? form : {}
  const errors = {}

  const name = text(f.name)
  if (name.length < 1 || name.length > SETTINGS_LIMITS.maxName) {
    errors.name = `Bitte einen Namen eingeben (höchstens ${SETTINGS_LIMITS.maxName} Zeichen).`
  }

  let cents = 0
  if (!text(f.amount)) {
    errors.amount = 'Bitte einen Betrag eingeben.'
  } else {
    const r = amountCents(f.amount)
    if (r.error) errors.amount = r.error
    else if (r.cents < 1) errors.amount = 'Der Betrag muss größer als 0 sein (z. B. 49,90).'
    else cents = r.cents
  }

  if (!Object.prototype.hasOwnProperty.call(INTERVAL_LABEL, f.interval)) errors.interval = 'Bitte einen Rhythmus wählen.'

  const nextDate = text(f.nextDate)
  if (!isRealDay(nextDate)) errors.nextDate = 'Bitte ein gültiges Datum wählen.'

  const match = text(f.counterpartyMatch)
  if (match.length > SETTINGS_LIMITS.maxMatch) {
    errors.counterpartyMatch = `Der Suchbegriff darf höchstens ${SETTINGS_LIMITS.maxMatch} Zeichen lang sein.`
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors }
  return { ok: true, payload: { name, amountCents: cents, interval: f.interval, nextDate, counterpartyMatch: match } }
}

/** Reihenfolge der Felder im Fixkosten-Formular. */
export const FIXED_COST_FIELD_ORDER = ['name', 'amount', 'interval', 'nextDate', 'counterpartyMatch']

/**
 * Zeilen der Fixkostenliste: aktive zuerst, dann inaktive (Reihenfolge des Servers bleibt je Gruppe).
 * Je Zeile: { key, id, name, amountText, intervalText, nextDateText, matchText, metaText, active, statusLabel,
 * toggleLabel }; metaText = „monatlich · nächster Termin 01.11.2026 · Suchbegriff „hetzner““.
 */
export function fixedCostRows(list) {
  const items = (Array.isArray(list) ? list : []).filter((p) => p && typeof p === 'object')
  const rows = items.map((p, index) => {
    const active = p.active !== false
    const name = text(p.name) || 'Ohne Namen'
    const intervalText = INTERVAL_LABEL[p.interval] || '–'
    const nextDateText = dateDe(p.nextDate)
    const matchText = text(p.counterpartyMatch)
    return {
      key: text(p.$id) || `fixed-${index}`,
      id: text(p.$id),
      name,
      amountText: euro(p.amountCents),
      intervalText,
      nextDateText,
      matchText,
      metaText: [intervalText, `nächster Termin ${nextDateText}`, matchText && `Suchbegriff „${matchText}“`].filter(Boolean).join(' · '),
      active,
      statusLabel: active ? 'Aktiv' : 'Inaktiv',
      toggleLabel: active ? 'Auf inaktiv setzen' : 'Aktivieren',
    }
  })
  return [...rows.filter((r) => r.active), ...rows.filter((r) => !r.active)]
}

// --- Bankzugang ----------------------------------------------------------------------------------------------

const berlinTime = new Intl.DateTimeFormat('de-DE', {
  timeZone: 'Europe/Berlin',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

/** ISO-Zeitpunkt -> '01.10.2026, 12:55 Uhr' (Berliner Zeit); ungültig -> '–'. */
export function dateTimeDe(value) {
  const t = typeof value === 'string' && value.trim() ? Date.parse(value) : NaN
  if (Number.isNaN(t)) return '–'
  const p = Object.fromEntries(berlinTime.formatToParts(new Date(t)).map((x) => [x.type, x.value]))
  return `${p.day}.${p.month}.${p.year}, ${p.hour}:${p.minute} Uhr`
}

/**
 * Karte „Bankzugang“: { connected, statusLabel, tone, rows: [{ key, label, text }], error, canRefresh, connectLabel,
 * hint }. Ohne Verbindung (null) nur „Bank verbinden“. Abgelaufener Zugang (Status oder Datum): kein Abruf, nur
 * „Neu verbinden“. error ist der Text des letzten Fehlers (auch wenn der Server keinen nennt, der Abruf aber scheiterte).
 */
export function bankCardModel(verbindung, now = Date.now()) {
  if (!verbindung || typeof verbindung !== 'object') {
    return {
      connected: false,
      statusLabel: 'Nicht verbunden',
      tone: 'muted',
      rows: [],
      error: '',
      canRefresh: false,
      connectLabel: 'Bank verbinden',
      hint: 'Ohne Bankzugang fehlen Kontostand und Buchungen.',
    }
  }

  const validDay = ymdBerlin(verbindung.validUntil)
  const today = ymdBerlin(now)
  const expired = verbindung.status === 'abgelaufen' || (validDay !== null && today !== null && validDay < today)
  const failed = verbindung.lastSyncOk === false || verbindung.status === 'fehler'

  let statusLabel = 'Unbekannt'
  let tone = 'muted'
  if (expired) {
    statusLabel = 'Zugang abgelaufen'
    tone = 'danger'
  } else if (failed) {
    statusLabel = 'Abruf fehlgeschlagen'
    tone = 'warn'
  } else if (verbindung.status === 'aktiv') {
    statusLabel = 'Verbunden'
    tone = 'ok'
  } else if (text(verbindung.status)) {
    statusLabel = text(verbindung.status)
  }

  const synced = text(verbindung.lastSyncAt)
  const lastError = text(verbindung.lastError)
  return {
    connected: true,
    statusLabel,
    tone,
    rows: [
      { key: 'iban', label: 'IBAN', text: text(verbindung.ibanMasked) || '–' },
      { key: 'valid', label: 'Zugang gültig bis', text: dateDe(verbindung.validUntil) },
      {
        key: 'sync',
        label: 'Letzter Abruf',
        text: synced ? `${dateTimeDe(synced)} · ${sinceLabel(synced, now)}` : 'noch kein Abruf',
      },
    ],
    error: lastError || (failed ? 'Der letzte Abruf ist fehlgeschlagen.' : ''),
    canRefresh: !expired,
    connectLabel: 'Neu verbinden',
    hint: expired ? 'Der Zugang ist abgelaufen. Bitte neu verbinden.' : '',
  }
}

/** Ergebnis von POST /bank/aktualisieren ({ ok, neu, aktualisiert, geloescht, error? }) -> { tone, text }. */
export function refreshResultMessage(result) {
  const r = result && typeof result === 'object' ? result : {}
  if (r.ok === false) {
    const error = text(r.error)
    return { tone: 'warn', text: error ? `Abruf fehlgeschlagen: ${error}` : 'Abruf fehlgeschlagen.' }
  }
  const parts = []
  if (r.neu > 0) parts.push(`${r.neu} neu`)
  if (r.aktualisiert > 0) parts.push(`${r.aktualisiert} aktualisiert`)
  if (r.geloescht > 0) parts.push(`${r.geloescht} entfernt`)
  return { tone: 'ok', text: parts.length > 0 ? `Abruf abgeschlossen: ${parts.join(', ')}.` : 'Abruf abgeschlossen, keine neuen Buchungen.' }
}
