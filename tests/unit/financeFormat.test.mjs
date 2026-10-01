import test from 'node:test'
import assert from 'node:assert/strict'
import { loadModule } from './load.mjs'

const {
  euro,
  euroWhole,
  signedEuro,
  dateDe,
  sinceLabel,
  parseEuro,
  INVOICE_STATUS,
  CATEGORY_LABEL,
  URGENCY,
  AGE_GROUP_LABEL,
  pageOf,
  canInvoice,
  nextIntervalDate,
  ymdBerlin,
  INTERVAL_LABEL,
  percentDe,
} = await loadModule('src/lib/financeFormat.js')

const MINUS = '−'

test('euro: de-DE mit Tausenderpunkt und Komma, Leerzeichen vor dem Euro-Zeichen', () => {
  assert.equal(euro(123456), '1.234,56 €')
  assert.equal(euro(10893), '108,93 €')
  assert.equal(euro(0), '0,00 €')
  assert.equal(euro(5), '0,05 €')
  assert.equal(euro(100), '1,00 €')
  assert.equal(euro(100000000), '1.000.000,00 €')
})

test('euro: Platzhalter für fehlende Werte', () => {
  assert.equal(euro(null), '–')
  assert.equal(euro(undefined), '–')
  assert.equal(euro(NaN), '–')
  assert.equal(euro('abc'), '–')
})

test('euro: negative Beträge mit Minuszeichen U+2212', () => {
  assert.equal(euro(-449), `${MINUS}4,49 €`)
  assert.equal(euro(-123456), `${MINUS}1.234,56 €`)
  assert.equal(euro(-5), `${MINUS}0,05 €`)
  assert.equal(euro(-0), '0,00 €')
})

test('euroWhole: auf ganze Euro gerundet', () => {
  assert.equal(euroWhole(10893), '109 €')
  assert.equal(euroWhole(10849), '108 €')
  assert.equal(euroWhole(10850), '109 €')
  assert.equal(euroWhole(0), '0 €')
  assert.equal(euroWhole(123456), '1.235 €')
  assert.equal(euroWhole(null), '–')
  assert.equal(euroWhole(undefined), '–')
})

test('euroWhole: negative Werte, keine „−0 €“', () => {
  assert.equal(euroWhole(-10893), `${MINUS}109 €`)
  assert.equal(euroWhole(-49), '0 €')
  assert.equal(euroWhole(-50), `${MINUS}1 €`)
})

test('signedEuro: immer mit Vorzeichen, Minus ist U+2212', () => {
  assert.equal(signedEuro(16879), '+168,79 €')
  assert.equal(signedEuro(-449), `${MINUS}4,49 €`)
  assert.equal(signedEuro(-449).charAt(0), '−')
  assert.equal(signedEuro(123456), '+1.234,56 €')
  assert.equal(signedEuro(-123456), `${MINUS}1.234,56 €`)
  assert.equal(signedEuro(0), '0,00 €')
  assert.equal(signedEuro(null), '–')
  assert.equal(signedEuro(undefined), '–')
})

test('dateDe: ISO-Datum zu TT.MM.JJJJ', () => {
  assert.equal(dateDe('2027-03-29'), '29.03.2027')
  assert.equal(dateDe('2026-01-05'), '05.01.2026')
})

test('dateDe: ISO-Zeitpunkt in Berliner Zeit, Platzhalter für Ungültiges', () => {
  assert.equal(dateDe('2099-03-29T00:00:00.000Z'), '29.03.2099')
  // 23:30 UTC im Sommer = 01:30 am Folgetag in Berlin
  assert.equal(dateDe('2026-07-01T23:30:00.000Z'), '02.07.2026')
  assert.equal(dateDe(''), '–')
  assert.equal(dateDe(null), '–')
  assert.equal(dateDe(undefined), '–')
  assert.equal(dateDe('kein Datum'), '–')
})

test('sinceLabel: gerade eben / Minuten / Stunden / Tage', () => {
  const now = Date.parse('2026-10-01T12:00:00.000Z')
  const ago = (ms) => new Date(now - ms).toISOString()
  assert.equal(sinceLabel(ago(0), now), 'gerade eben')
  assert.equal(sinceLabel(ago(59 * 1000), now), 'gerade eben')
  assert.equal(sinceLabel(ago(60 * 1000), now), 'vor 1 Min.')
  assert.equal(sinceLabel(ago(12 * 60000), now), 'vor 12 Min.')
  assert.equal(sinceLabel(ago(59 * 60000), now), 'vor 59 Min.')
  assert.equal(sinceLabel(ago(60 * 60000), now), 'vor 1 Std.')
  assert.equal(sinceLabel(ago(3 * 3600000), now), 'vor 3 Std.')
  assert.equal(sinceLabel(ago(23 * 3600000), now), 'vor 23 Std.')
  assert.equal(sinceLabel(ago(24 * 3600000), now), 'vor 1 Tag')
  assert.equal(sinceLabel(ago(2 * 86400000), now), 'vor 2 Tagen')
  assert.equal(sinceLabel(ago(40 * 86400000), now), 'vor 40 Tagen')
})

test('sinceLabel: Zukunft, Date als now, fehlende Werte', () => {
  const now = Date.parse('2026-10-01T12:00:00.000Z')
  assert.equal(sinceLabel(new Date(now + 5 * 60000).toISOString(), now), 'gerade eben')
  assert.equal(sinceLabel('2026-10-01T11:48:00.000Z', new Date(now)), 'vor 12 Min.')
  assert.equal(sinceLabel(null, now), '–')
  assert.equal(sinceLabel('Quatsch', now), '–')
})

test('parseEuro: Tausenderpunkte und Dezimalkomma', () => {
  assert.equal(parseEuro('1.234,56'), 123456)
  assert.equal(parseEuro('12,50'), 1250)
  assert.equal(parseEuro('12,5'), 1250)
  assert.equal(parseEuro('1234'), 123400)
  assert.equal(parseEuro('1234,5'), 123450)
  assert.equal(parseEuro('0,05'), 5)
  assert.equal(parseEuro('0'), 0)
  assert.equal(parseEuro('0,00'), 0)
  assert.equal(parseEuro('1.234'), 123400)
  assert.equal(parseEuro('1.234.567,89'), 123456789)
  assert.equal(parseEuro('19,99'), 1999)
})

test('parseEuro: Leerraum und Euro-Zeichen werden toleriert', () => {
  assert.equal(parseEuro('  12,50  '), 1250)
  assert.equal(parseEuro('12,50 €'), 1250)
  assert.equal(parseEuro('12,50€'), 1250)
  assert.equal(parseEuro('€ 12,50'), 1250)
})

test('parseEuro: ergibt exakte Cent (keine Gleitkomma-Fehler)', () => {
  assert.equal(parseEuro('19,99'), 1999)
  assert.equal(parseEuro('0,29'), 29)
  assert.equal(parseEuro('1,15'), 115)
  assert.equal(parseEuro('4,35'), 435)
  assert.ok(Number.isInteger(parseEuro('1.234,56')))
})

test('parseEuro: ungültige Eingaben werfen „Ungültiger Betrag“', () => {
  const bad = [
    '', '   ', 'abc', '12abc', '1,2,3', '12,345', '1,234', '12.50', '1.23', '1.2345',
    '1..234', '1.234,5,6', ',5', '.5', '12,', '1.', '-5', '-0', '+5', '−5', '1e3',
    '12 34', '1 234,56', '0.500', '€', '12,50 € 3', '١٢', '１２',
  ]
  for (const text of bad) {
    assert.throws(() => parseEuro(text), { message: 'Ungültiger Betrag' }, `sollte werfen: ${JSON.stringify(text)}`)
  }
})

test('parseEuro: Nicht-Strings und zu große Werte werfen', () => {
  for (const v of [null, undefined, 12.5, {}, [], true]) {
    assert.throws(() => parseEuro(v), { message: 'Ungültiger Betrag' })
  }
  assert.throws(() => parseEuro('99999999999999999999'), { message: 'Ungültiger Betrag' })
})

test('Status- und Beschriftungstabellen (verbatim)', () => {
  assert.deepEqual(INVOICE_STATUS, {
    entwurf: { label: 'Entwurf', tone: 'muted' },
    offen: { label: 'Offen', tone: 'info' },
    ueberfaellig: { label: 'Überfällig', tone: 'warn' },
    bezahlt: { label: 'Bezahlt', tone: 'ok' },
    storniert: { label: 'Storniert', tone: 'muted' },
    uneinbringlich: { label: 'Uneinbringlich', tone: 'danger' },
  })
  assert.deepEqual(CATEGORY_LABEL, {
    rechnung: 'Rechnung',
    'rechnung-extern': 'Einnahme ohne Stripe-Rechnung',
    'stripe-auszahlung': 'Stripe-Auszahlung',
    fixkosten: 'Fixkosten',
    privat: 'Privat/Umbuchung',
    sonstiges: 'Sonstiges',
    '': 'Offen',
  })
  assert.deepEqual(URGENCY, {
    hoch: { label: 'Dringend', tone: 'danger' },
    mittel: { label: 'Bald', tone: 'warn' },
    info: { label: 'Hinweis', tone: 'muted' },
  })
  assert.deepEqual(AGE_GROUP_LABEL, {
    'nicht-faellig': 'Nicht fällig',
    '1-30': '1–30 Tage',
    '31-60': '31–60 Tage',
    'ueber-60': 'Über 60 Tage',
  })
})

test('pageOf: 1-basiert, 50 pro Seite, Standardgröße', () => {
  const list = Array.from({ length: 120 }, (_, i) => i + 1)
  const p1 = pageOf(list, 1)
  assert.equal(p1.items.length, 50)
  assert.equal(p1.items[0], 1)
  assert.equal(p1.page, 1)
  assert.equal(p1.pages, 3)
  const p3 = pageOf(list, 3)
  assert.deepEqual(p3.items, list.slice(100))
  assert.equal(p3.items.length, 20)
  assert.equal(p3.page, 3)
  assert.equal(p3.pages, 3)
})

test('pageOf: Seitenzahl wird begrenzt, eigene Größe, leere Liste', () => {
  const list = [1, 2, 3, 4, 5]
  assert.deepEqual(pageOf(list, 99, 2), { items: [5], page: 3, pages: 3 })
  assert.deepEqual(pageOf(list, 0, 2), { items: [1, 2], page: 1, pages: 3 })
  assert.deepEqual(pageOf(list, -4, 2), { items: [1, 2], page: 1, pages: 3 })
  assert.deepEqual(pageOf(list, 'x', 2), { items: [1, 2], page: 1, pages: 3 })
  assert.deepEqual(pageOf(list, 2.7, 2), { items: [3, 4], page: 2, pages: 3 })
  assert.deepEqual(pageOf([], 1), { items: [], page: 1, pages: 1 })
  assert.deepEqual(pageOf(null, 3), { items: [], page: 1, pages: 1 })
  assert.deepEqual(pageOf(undefined), { items: [], page: 1, pages: 1 })
  assert.equal(pageOf(Array.from({ length: 50 }, (_, i) => i), 1).pages, 1)
  assert.equal(pageOf(Array.from({ length: 51 }, (_, i) => i), 1).pages, 2)
})

test('canInvoice: fester Kunde mit E-Mail ist ok', () => {
  assert.deepEqual(canInvoice({ customerStatus: 'customer', email: 'k@example.invalid' }), { ok: true })
  // Bestandsdaten ohne Status gelten als fester Kunde (wie customerStage)
  assert.deepEqual(canInvoice({ email: 'k@example.invalid' }), { ok: true })
  assert.deepEqual(canInvoice({ customerStatus: '', email: 'k@example.invalid' }), { ok: true })
})

test('canInvoice: Lead und Abgesagt sind noch keine festen Kunden', () => {
  const reason = 'Noch kein fester Kunde'
  assert.deepEqual(canInvoice({ customerStatus: 'lead', email: 'k@example.invalid' }), { ok: false, reason })
  assert.deepEqual(canInvoice({ customerStatus: 'lost', email: 'k@example.invalid' }), { ok: false, reason })
  assert.deepEqual(canInvoice({ customerStatus: 'Lead', email: 'k@example.invalid' }), { ok: false, reason })
  assert.deepEqual(canInvoice({ customerStatus: ' LOST ', email: 'k@example.invalid' }), { ok: false, reason })
  // Status hat Vorrang vor fehlender E-Mail
  assert.deepEqual(canInvoice({ customerStatus: 'lead', email: '' }), { ok: false, reason })
})

test('canInvoice: ohne E-Mail nicht möglich', () => {
  const reason = 'E-Mail fehlt'
  assert.deepEqual(canInvoice({ customerStatus: 'customer' }), { ok: false, reason })
  assert.deepEqual(canInvoice({ customerStatus: 'customer', email: '' }), { ok: false, reason })
  assert.deepEqual(canInvoice({ customerStatus: 'customer', email: '   ' }), { ok: false, reason })
  assert.deepEqual(canInvoice({ customerStatus: 'customer', email: null }), { ok: false, reason })
  assert.deepEqual(canInvoice({}), { ok: false, reason })
})

test('canInvoice: kein Kunde', () => {
  assert.equal(canInvoice(null).ok, false)
  assert.equal(canInvoice(undefined).ok, false)
  assert.equal(typeof canInvoice(null).reason, 'string')
})

test('nextIntervalDate: ein Rhythmus nach dem Datum', () => {
  assert.equal(nextIntervalDate('2026-09-27', 'monat'), '2026-10-27')
  assert.equal(nextIntervalDate('2026-09-27', 'quartal'), '2026-12-27')
  assert.equal(nextIntervalDate('2026-09-27', 'jahr'), '2027-09-27')
  assert.equal(nextIntervalDate('2026-12-15', 'monat'), '2027-01-15')
  assert.equal(nextIntervalDate('2026-11-15', 'quartal'), '2027-02-15')
})

test('nextIntervalDate: Monatsende wird begrenzt, nicht in den Folgemonat übergelaufen', () => {
  assert.equal(nextIntervalDate('2026-01-31', 'monat'), '2026-02-28')
  assert.equal(nextIntervalDate('2024-01-31', 'monat'), '2024-02-29')
  assert.equal(nextIntervalDate('2026-03-31', 'monat'), '2026-04-30')
  assert.equal(nextIntervalDate('2026-11-30', 'quartal'), '2027-02-28')
  assert.equal(nextIntervalDate('2026-08-31', 'quartal'), '2026-11-30')
  assert.equal(nextIntervalDate('2024-02-29', 'jahr'), '2025-02-28')
  assert.equal(nextIntervalDate('2023-02-28', 'jahr'), '2024-02-28')
  assert.equal(nextIntervalDate('1900-01-31', 'monat'), '1900-02-28') // 1900 ist kein Schaltjahr
  assert.equal(nextIntervalDate('2000-01-31', 'monat'), '2000-02-29')
})

test('nextIntervalDate: ungültige Eingaben ergeben null', () => {
  assert.equal(nextIntervalDate('2026-02-30', 'monat'), null)
  assert.equal(nextIntervalDate('2026-13-01', 'monat'), null)
  assert.equal(nextIntervalDate('2026-00-10', 'monat'), null)
  assert.equal(nextIntervalDate('2026-04-31', 'monat'), null)
  assert.equal(nextIntervalDate('27.09.2026', 'monat'), null)
  assert.equal(nextIntervalDate('', 'monat'), null)
  assert.equal(nextIntervalDate(null, 'monat'), null)
  assert.equal(nextIntervalDate(undefined, 'monat'), null)
  assert.equal(nextIntervalDate('2026-09-27', 'woche'), null)
  assert.equal(nextIntervalDate('2026-09-27', undefined), null)
  assert.equal(nextIntervalDate('2026-09-27', 'constructor'), null)
})

test('INTERVAL_LABEL: deutsche Rhythmus-Wörter wie im Portal', () => {
  assert.deepEqual(INTERVAL_LABEL, { monat: 'monatlich', quartal: 'vierteljährlich', jahr: 'jährlich' })
})

test('ymdBerlin: Berliner Kalendertag eines Zeitpunkts', () => {
  assert.equal(ymdBerlin('2026-10-01T10:55:21.691Z'), '2026-10-01')
  assert.equal(ymdBerlin('2026-07-01T23:30:00.000Z'), '2026-07-02') // Sommerzeit: schon der nächste Tag
  assert.equal(ymdBerlin('2099-03-29T00:00:00.000Z'), '2099-03-29')
  assert.equal(ymdBerlin(new Date('2026-12-31T23:30:00Z')), '2027-01-01')
  assert.equal(ymdBerlin(Date.UTC(2026, 9, 1, 12)), '2026-10-01')
  assert.equal(ymdBerlin(''), null)
  assert.equal(ymdBerlin('kein Datum'), null)
  assert.equal(ymdBerlin(null), null)
  assert.equal(ymdBerlin(NaN), null)
})

test('percentDe: Dezimalkomma, überflüssige Nullen entfallen', () => {
  assert.equal(percentDe(30), '30')
  assert.equal(percentDe(27.5), '27,5')
  assert.equal(percentDe(30.25), '30,25')
  assert.equal(percentDe(0), '0')
  assert.equal(percentDe(100), '100')
  assert.equal(percentDe(0.32, 1), '0,3')
  assert.equal(percentDe(70.4, 1), '70,4')
  assert.equal(percentDe(30.256), '30,26')
  assert.equal(percentDe(-12.5), `${MINUS}12,5`)
  assert.equal(percentDe(-0.001), '0')
})

test('percentDe: Platzhalter für fehlende Werte', () => {
  for (const v of [null, undefined, NaN, Infinity, 'x']) assert.equal(percentDe(v), '–')
})
