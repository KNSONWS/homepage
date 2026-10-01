import test from 'node:test'
import assert from 'node:assert/strict'
import { loadModule } from './load.mjs'

const {
  INVOICES_ANCHOR,
  TODO_LIMIT,
  bankStatus,
  stripeStatus,
  statusItems,
  breakdownRows,
  lowPointLines,
  visibleTodos,
  urgencyOf,
  todoKey,
  safeUrl,
  todoButtonLabel,
  fixedCostFromSuggestion,
  planTodoAction,
  forecastRows,
  forecastNotes,
  taxView,
  aboView,
  productLabel,
  aboStatus,
  INVOICE_FILTERS,
  DEFAULT_INVOICE_FILTER,
  invoiceFilterStatuses,
  mergeInvoiceLists,
  INVOICE_LIMITS,
  PENDING_ASSIGN_HINT,
  ageGroupCells,
  invoiceActions,
  invoiceRows,
  invoiceConfirmText,
  invoiceSendConfirmText,
  invoiceDoneMessage,
  isFinalizedNotSent,
  finalizedFilter,
  invoiceFailureMessage,
  parseQuantity,
  parseUnitPrice,
  lineTotalCents,
  invoiceTotalCents,
  validateInvoiceForm,
  customerName,
  customerPickerOptions,
  customerSuggestions,
  resolveCustomerText,
  customerInvoicesGate,
  SMALL_INVOICE_MAX_CENTS,
  ADDRESS_INCOMPLETE_TEXT,
  addressComplete,
  invoiceSendGate,
  TAX_NOTE,
  sortTransactions,
  strongestSuggestion,
  suggestionText,
  assignmentText,
  transactionRows,
  invoiceAssignConfirmText,
  assignModel,
  assignBody,
} = await loadModule('src/lib/financeView.js')

const MINUS = '−'
const NOW = Date.parse('2026-10-01T13:55:21.691Z') // 15:55 Berliner Zeit

const bank = (extra = {}) => ({
  status: 'aktiv',
  ibanMasked: 'DE00 •••• 9313',
  validUntil: '2027-03-29T00:00:00.000Z',
  lastSyncAt: '2026-10-01T10:55:21.691Z',
  lastSyncOk: true,
  lastError: '',
  balanceBookedCents: 10893,
  balanceAvailableCents: 9999,
  balanceDate: '2026-10-01',
  latestBookingDate: '2026-09-29',
  ...extra,
})

// --- Statuszeile ---------------------------------------------------------------------------------------------

test('bankStatus: Stand, jüngste Buchung und Zugang bis (Spec Block 0)', () => {
  assert.deepEqual(bankStatus(bank(), NOW), {
    ok: true,
    text: 'Bank: Stand vor 3 Std. · jüngste Buchung 29.09.2026 · Zugang bis 29.03.2027',
  })
})

test('bankStatus: ohne Verbindung', () => {
  for (const none of [null, undefined, 'x']) {
    assert.deepEqual(bankStatus(none, NOW), { ok: false, text: 'Bank: nicht verbunden' })
  }
})

test('bankStatus: Abruf fehlgeschlagen zeigt den Fehler und weiter den Zugang', () => {
  const r = bankStatus(bank({ lastSyncOk: false, lastError: 'Bank antwortet nicht' }), NOW)
  assert.equal(r.ok, false)
  assert.equal(r.text, 'Bank: Abruf fehlgeschlagen: Bank antwortet nicht · Zugang bis 29.03.2027')
  assert.equal(bankStatus(bank({ lastSyncOk: false, lastError: '' }), NOW).text, 'Bank: Abruf fehlgeschlagen · Zugang bis 29.03.2027')
  assert.equal(bankStatus(bank({ status: 'fehler', lastError: 'x' }), NOW).ok, false)
})

test('bankStatus: abgelaufener Zugang (Status oder Datum)', () => {
  assert.deepEqual(bankStatus(bank({ status: 'abgelaufen' }), NOW), { ok: false, text: 'Bank: Zugang abgelaufen am 29.03.2027' })
  const past = bankStatus(bank({ validUntil: '2026-09-30T00:00:00.000Z' }), NOW)
  assert.deepEqual(past, { ok: false, text: 'Bank: Zugang abgelaufen am 30.09.2026' })
  // am letzten Tag ist der Zugang noch gültig
  assert.equal(bankStatus(bank({ validUntil: '2026-10-01T00:00:00.000Z' }), NOW).ok, true)
})

test('bankStatus: noch kein Abruf, keine Buchung, kein Datum', () => {
  const r = bankStatus(bank({ lastSyncAt: null, latestBookingDate: null, validUntil: null }), NOW)
  assert.deepEqual(r, { ok: true, text: 'Bank: noch kein Abruf' })
})

test('stripeStatus: Stand und Ausfall mit dem Text des Servers', () => {
  assert.deepEqual(stripeStatus({ ok: true, abgerufenUm: '2026-10-01T13:55:00.000Z' }, NOW), { ok: true, text: 'Stripe: Stand gerade eben' })
  assert.deepEqual(stripeStatus({ ok: false, fehler: 'Stripe ist gerade nicht erreichbar.', abgerufenUm: null }, NOW), {
    ok: false,
    text: 'Stripe: Abruf fehlgeschlagen: Stripe ist gerade nicht erreichbar.',
  })
  assert.equal(stripeStatus({ ok: false }, NOW).text, 'Stripe: Abruf fehlgeschlagen: Stripe ist gerade nicht erreichbar.')
  assert.deepEqual(stripeStatus({ ok: true, abgerufenUm: null }, NOW), { ok: true, text: 'Stripe: Stand unbekannt' })
  assert.deepEqual(stripeStatus(null, NOW), { ok: true, text: 'Stripe: Stand unbekannt' })
})

test('statusItems: Bank und Stripe, fehlender Stand ist kein Fehler im Code', () => {
  const items = statusItems({ bank: null, stripe: { ok: true, abgerufenUm: '2026-10-01T13:00:00.000Z' } }, NOW)
  assert.deepEqual(items.map((i) => i.key), ['bank', 'stripe'])
  assert.equal(items[0].text, 'Bank: nicht verbunden')
  assert.equal(items[1].text, 'Stripe: Stand vor 55 Min.')
  assert.equal(statusItems(undefined, NOW).length, 2)
})

// --- Liquiditätskopf -----------------------------------------------------------------------------------------

test('breakdownRows: Kontostand minus Rücklage, Fixkosten und Puffer ergibt Verfügbar', () => {
  const rows = breakdownRows({ kontostandCents: 10893, steuerRuecklageCents: 3268, fixkosten30Cents: 1449, mindestpufferCents: 2000 }, 4176)
  assert.deepEqual(
    rows.map((r) => [r.label, r.text]),
    [
      ['Kontostand (gebucht)', '108,93 €'],
      ['Steuer-Rücklage', `${MINUS}32,68 €`],
      ['Fixkosten der nächsten 30 Tage', `${MINUS}14,49 €`],
      ['Mindestpuffer', `${MINUS}20,00 €`],
      ['Verfügbar nach Rücklagen', '41,76 €'],
    ]
  )
  assert.deepEqual(rows.map((r) => r.total), [false, false, false, false, true])
})

test('breakdownRows: Puffer 0 ohne Vorzeichen, negatives Ergebnis, fehlende Werte', () => {
  const rows = breakdownRows({ kontostandCents: 1000, steuerRuecklageCents: 0, fixkosten30Cents: 5000, mindestpufferCents: 0 }, -4000)
  assert.equal(rows[1].text, '0,00 €')
  assert.equal(rows[4].text, `${MINUS}40,00 €`)
  const none = breakdownRows(null, null)
  assert.deepEqual(none.map((r) => r.text), ['–', '–', '–', '–', '–'])
})

test('lowPointLines: sicher und erwartet mit ganzen Euro und Datum', () => {
  const [sicher, erwartet] = lowPointLines({
    tiefsterSicher: { amountCents: 9444, date: '2026-10-11' },
    tiefsterErwartet: { amountCents: 10893, date: '2026-10-01' },
  })
  assert.deepEqual(sicher, { key: 'sicher', label: 'sicher', amountText: '94 €', dateText: '11.10.2026', negative: false })
  assert.deepEqual(erwartet, { key: 'erwartet', label: 'erwartet', amountText: '109 €', dateText: '01.10.2026', negative: false })
})

test('lowPointLines: negativ mit Minus U+2212, ohne Kontostand null', () => {
  const [sicher] = lowPointLines({ tiefsterSicher: { amountCents: -12000, date: '2026-10-20' }, tiefsterErwartet: null })
  assert.equal(sicher.amountText, `${MINUS}120 €`)
  assert.equal(sicher.negative, true)
  assert.deepEqual(lowPointLines({ tiefsterSicher: null, tiefsterErwartet: null }), [null, null])
  assert.deepEqual(lowPointLines(undefined), [null, null])
})

// --- Zu erledigen --------------------------------------------------------------------------------------------

const todos = (n) => Array.from({ length: n }, (_, i) => ({ art: 'abo-zahlung', dringlichkeit: 'hoch', titel: `T${i}`, text: '', datum: '2026-10-01', aktion: { typ: 'kunde-oeffnen', customerId: `c${i}` } }))

test('visibleTodos: höchstens 7, Rest hinter „Alle N anzeigen“', () => {
  assert.equal(TODO_LIMIT, 7)
  const few = visibleTodos(todos(7))
  assert.equal(few.shown.length, 7)
  assert.equal(few.hidden, 0)
  const many = visibleTodos(todos(12))
  assert.equal(many.shown.length, 7)
  assert.equal(many.total, 12)
  assert.equal(many.hidden, 5)
  assert.deepEqual(many.shown.map((t) => t.titel), ['T0', 'T1', 'T2', 'T3', 'T4', 'T5', 'T6'])
  const all = visibleTodos(todos(12), true)
  assert.equal(all.shown.length, 12)
  assert.equal(all.hidden, 0)
})

test('visibleTodos: leer, ungültig, Nicht-Objekte werden ausgelassen', () => {
  assert.deepEqual(visibleTodos([]), { shown: [], total: 0, hidden: 0 })
  assert.deepEqual(visibleTodos(null), { shown: [], total: 0, hidden: 0 })
  assert.deepEqual(visibleTodos(undefined), { shown: [], total: 0, hidden: 0 })
  assert.equal(visibleTodos([null, 'x', 3, todos(1)[0]]).total, 1)
})

test('urgencyOf: Badge-Text und Ton, unbekannt gilt als Hinweis', () => {
  assert.deepEqual(urgencyOf({ dringlichkeit: 'hoch' }), { label: 'Dringend', tone: 'danger' })
  assert.deepEqual(urgencyOf({ dringlichkeit: 'mittel' }), { label: 'Bald', tone: 'warn' })
  assert.deepEqual(urgencyOf({ dringlichkeit: 'info' }), { label: 'Hinweis', tone: 'muted' })
  assert.deepEqual(urgencyOf({ dringlichkeit: 'x' }), { label: 'Hinweis', tone: 'muted' })
  assert.deepEqual(urgencyOf(null), { label: 'Hinweis', tone: 'muted' })
})

test('todoKey: unterscheidet Aufgaben auch bei gleichem Titel', () => {
  const [a, b] = todos(2)
  assert.notEqual(todoKey(a, 0), todoKey(b, 1))
  assert.notEqual(todoKey({ ...a }, 0), todoKey({ ...a }, 1))
  assert.equal(typeof todoKey(null), 'string')
})

test('safeUrl: nur http(s)', () => {
  assert.equal(safeUrl('https://invoice.stripe.com/i/acct_1/test_x'), 'https://invoice.stripe.com/i/acct_1/test_x')
  assert.equal(safeUrl('  http://example.test/a '), 'http://example.test/a')
  for (const bad of ['javascript:alert(1)', 'data:text/html,x', 'ftp://x.test', 'invoice.stripe.com/i', '', '  ', null, undefined, 5]) {
    assert.equal(safeUrl(bad), '', String(bad))
  }
})

test('todoButtonLabel: ein Knopf je Aktion', () => {
  const label = (aktion) => todoButtonLabel({ aktion })
  assert.equal(label({ typ: 'bank-verbinden' }), 'Bank verbinden')
  assert.equal(label({ typ: 'bank-aktualisieren' }), 'Aktualisieren')
  assert.equal(label({ typ: 'rechnung-oeffnen', hostedUrl: 'https://x.test/i' }), 'Zahlungsseite öffnen')
  assert.equal(label({ typ: 'rechnung-oeffnen', hostedUrl: null }), 'Zu den Rechnungen')
  assert.equal(label({ typ: 'rechnung-oeffnen', hostedUrl: 'javascript:alert(1)' }), 'Zu den Rechnungen')
  assert.equal(label({ typ: 'zuordnen' }), 'Zuordnen')
  assert.equal(label({ typ: 'kunde-oeffnen' }), 'Kunde öffnen')
  assert.equal(label({ typ: 'fixkosten-uebernehmen' }), 'Übernehmen')
  assert.equal(label({ typ: 'einstellungen' }), 'Einstellungen')
  assert.equal(label({ typ: 'neu' }), '')
  assert.equal(todoButtonLabel({}), '')
  assert.equal(todoButtonLabel(null), '')
})

const suggestion = (extra = {}) => ({ key: 'hetzner', name: 'Hetzner', amountCents: 449, interval: 'monat', lastDate: '2026-09-27', count: 4, ...extra })

test('fixedCostFromSuggestion: Anfrage mit nächstem Termin und Rückfrage-Text', () => {
  assert.deepEqual(fixedCostFromSuggestion(suggestion()), {
    payload: { name: 'Hetzner', amountCents: 449, interval: 'monat', nextDate: '2026-10-27', counterpartyMatch: 'hetzner' },
    confirmText: 'Als Fixkosten übernehmen: Hetzner, 4,49 € monatlich?',
  })
  const q = fixedCostFromSuggestion(suggestion({ interval: 'quartal', lastDate: '2026-11-30', amountCents: 123456 }))
  assert.equal(q.payload.nextDate, '2027-02-28')
  assert.equal(q.confirmText, 'Als Fixkosten übernehmen: Hetzner, 1.234,56 € vierteljährlich?')
  assert.equal(fixedCostFromSuggestion(suggestion({ interval: 'jahr' })).confirmText, 'Als Fixkosten übernehmen: Hetzner, 4,49 € jährlich?')
})

test('fixedCostFromSuggestion: unvollständig ergibt null', () => {
  assert.equal(fixedCostFromSuggestion(null), null)
  assert.equal(fixedCostFromSuggestion({}), null)
  assert.equal(fixedCostFromSuggestion(suggestion({ name: '  ' })), null)
  assert.equal(fixedCostFromSuggestion(suggestion({ amountCents: 0 })), null)
  assert.equal(fixedCostFromSuggestion(suggestion({ amountCents: 4.5 })), null)
  assert.equal(fixedCostFromSuggestion(suggestion({ interval: 'woche' })), null)
  assert.equal(fixedCostFromSuggestion(suggestion({ lastDate: 'Mai' })), null)
  assert.equal(fixedCostFromSuggestion(suggestion({ key: undefined })).payload.counterpartyMatch, '')
})

test('planTodoAction: jede Aktionsart des Portals', () => {
  assert.deepEqual(planTodoAction({ typ: 'bank-verbinden' }), { kind: 'bank-connect' })
  assert.deepEqual(planTodoAction({ typ: 'bank-aktualisieren' }), { kind: 'bank-refresh' })
  assert.deepEqual(planTodoAction({ typ: 'rechnung-oeffnen', invoiceId: 'in_1', hostedUrl: 'https://x.test/i' }), { kind: 'open-url', url: 'https://x.test/i' })
  assert.deepEqual(planTodoAction({ typ: 'rechnung-oeffnen', invoiceId: 'in_1', hostedUrl: null }), { kind: 'scroll', id: 'finanzen-rechnungen' })
  assert.equal(INVOICES_ANCHOR, 'finanzen-rechnungen')
  assert.deepEqual(planTodoAction({ typ: 'rechnung-oeffnen', hostedUrl: 'javascript:alert(1)' }), { kind: 'scroll', id: 'finanzen-rechnungen' })
  assert.deepEqual(planTodoAction({ typ: 'zuordnen', transactionId: 'b1' }), { kind: 'assign', transactionId: 'b1' })
  assert.deepEqual(planTodoAction({ typ: 'kunde-oeffnen', customerId: 'c2' }), { kind: 'navigate', to: '/customers/c2' })
  assert.deepEqual(planTodoAction({ typ: 'kunde-oeffnen', customerId: 'a/b c' }), { kind: 'navigate', to: '/customers/a%2Fb%20c' })
  assert.deepEqual(planTodoAction({ typ: 'einstellungen' }), { kind: 'navigate', to: '/finance/einstellungen' })
  const fixed = planTodoAction({ typ: 'fixkosten-uebernehmen', vorschlag: suggestion() })
  assert.equal(fixed.kind, 'fixed-cost')
  assert.equal(fixed.payload.nextDate, '2026-10-27')
  assert.equal(fixed.confirmText, 'Als Fixkosten übernehmen: Hetzner, 4,49 € monatlich?')
})

test('planTodoAction: fehlende Angaben und unbekannte Aktionen geben eine Meldung', () => {
  for (const aktion of [
    { typ: 'zuordnen' },
    { typ: 'zuordnen', transactionId: '' },
    { typ: 'kunde-oeffnen' },
    { typ: 'kunde-oeffnen', customerId: ' ' },
    { typ: 'fixkosten-uebernehmen' },
    { typ: 'fixkosten-uebernehmen', vorschlag: suggestion({ amountCents: -1 }) },
    { typ: 'unbekannt' },
    null,
    undefined,
  ]) {
    const plan = planTodoAction(aktion)
    assert.equal(plan.kind, 'error', JSON.stringify(aktion))
    assert.ok(plan.message.length > 0)
  }
})

// --- Vorschau 30 Tage (Block 3) -----------------------------------------------------------------------------

const posten = () => [
  { date: '2026-10-03', label: 'Rechnung WK-0005 · Kunde Eins', amountCents: 16879, sicherheit: 'erwartet' },
  { date: '2026-10-06', label: 'Hetzner', amountCents: -1000, sicherheit: 'sicher' },
  { date: '2026-10-10', label: 'Stripe-Auszahlung', amountCents: 2500, sicherheit: 'sicher' },
  { date: '2026-10-11', label: 'Miete', amountCents: -30000, sicherheit: 'sicher' },
]

test('forecastRows: laufende Salden, sicher zählt nur sichere Posten, erwartet alle', () => {
  const { rows, hasBalance } = forecastRows(posten(), 10893)
  assert.equal(hasBalance, true)
  assert.deepEqual(rows.map((r) => r.saldoSicherCents), [10893, 9893, 12393, -17607])
  assert.deepEqual(rows.map((r) => r.saldoErwartetCents), [27772, 26772, 29272, -728])
})

test('forecastRows: Texte (Datum TT.MM.JJJJ, Betrag mit Vorzeichen, Salden mit U+2212)', () => {
  const { rows } = forecastRows(posten(), 10893)
  assert.equal(rows[0].dateText, '03.10.2026')
  assert.equal(rows[0].label, 'Rechnung WK-0005 · Kunde Eins')
  assert.equal(rows[0].sicherheit, 'erwartet')
  assert.equal(rows[0].amountText, '+168,79 €')
  assert.equal(rows[0].saldoSicherText, '108,93 €')
  assert.equal(rows[0].saldoErwartetText, '277,72 €')
  assert.equal(rows[1].sicherheit, 'sicher')
  assert.equal(rows[1].amountText, `${MINUS}10,00 €`)
  assert.equal(rows[3].amountText, `${MINUS}300,00 €`)
  assert.equal(rows[3].saldoSicherText, `${MINUS}176,07 €`)
  assert.equal(rows[3].saldoErwartetText, `${MINUS}7,28 €`)
  assert.equal(rows[3].saldoSicherNegative, true)
  assert.equal(rows[0].saldoSicherNegative, false)
})

test('forecastRows: der tiefste laufende Saldo passt zu minSicher/minErwartet des Servers', () => {
  const { rows } = forecastRows(posten(), 10893)
  assert.equal(Math.min(10893, ...rows.map((r) => r.saldoSicherCents)), -17607)
  assert.equal(Math.min(10893, ...rows.map((r) => r.saldoErwartetCents)), -728)
})

test('forecastRows: ohne Kontostand keine Salden', () => {
  for (const none of [null, undefined, NaN]) {
    const { rows, hasBalance } = forecastRows(posten(), none)
    assert.equal(hasBalance, false)
    assert.equal(rows.length, 4)
    assert.ok(rows.every((r) => r.saldoSicherCents === null && r.saldoErwartetCents === null))
    assert.ok(rows.every((r) => r.saldoSicherText === '–' && r.saldoErwartetText === '–'))
  }
})

test('forecastRows: Kontostand 0 ist ein Kontostand', () => {
  const { rows, hasBalance } = forecastRows(posten().slice(1, 2), 0)
  assert.equal(hasBalance, true)
  assert.deepEqual(rows.map((r) => r.saldoSicherCents), [-1000])
})

test('forecastRows: leer, kaputte Einträge und unbekannte Sicherheit (zählt als erwartet)', () => {
  for (const none of [null, undefined, [], 'x', {}]) assert.deepEqual(forecastRows(none, 100).rows, [])
  const { rows } = forecastRows(
    [
      null,
      { date: '2026-10-03', label: 'ohne Betrag', amountCents: null, sicherheit: 'sicher' },
      { date: '2026-10-04', label: ' ', amountCents: 500, sicherheit: 'irgendwas' },
    ],
    1000
  )
  assert.equal(rows.length, 1)
  assert.equal(rows[0].label, 'Zahlung')
  assert.equal(rows[0].sicherheit, 'erwartet')
  assert.equal(rows[0].saldoSicherCents, 1000)
  assert.equal(rows[0].saldoErwartetCents, 1500)
})

test('forecastRows: Serverreihenfolge bleibt, Schlüssel sind eindeutig', () => {
  const same = { date: '2026-10-03', label: 'Hetzner', amountCents: -100, sicherheit: 'sicher' }
  const { rows } = forecastRows([same, same], 500)
  assert.deepEqual(rows.map((r) => r.saldoSicherCents), [400, 300])
  assert.notEqual(rows[0].key, rows[1].key)
})

test('forecastRows: gleicher Tag, Abfluss zuerst wie vom Server geliefert, der Tiefpunkt bleibt sichtbar', () => {
  // Server: am selben Tag Abflüsse zuerst (forecast.js), dann die Zuflüsse in Eingangsreihenfolge
  const sameDay = [
    { date: '2026-10-05', label: 'Miete Büro', amountCents: -1500, sicherheit: 'sicher' },
    { date: '2026-10-05', label: 'Rechnung WK-0007 · Kunde Drei', amountCents: 1000, sicherheit: 'erwartet' },
    { date: '2026-10-05', label: 'Stripe-Auszahlung', amountCents: 300, sicherheit: 'sicher' },
    { date: '2026-10-06', label: 'Hetzner', amountCents: -100, sicherheit: 'sicher' },
  ]
  const { rows } = forecastRows(sameDay, 1000)
  // sicher: 1000 -1500 = -500, unverändert -500 (erwartet zählt nicht), +300 = -200, -100 = -300
  assert.deepEqual(rows.map((r) => r.saldoSicherCents), [-500, -500, -200, -300])
  // erwartet: 1000 -1500 = -500, +1000 = 500, +300 = 800, -100 = 700
  assert.deepEqual(rows.map((r) => r.saldoErwartetCents), [-500, 500, 800, 700])
  assert.deepEqual(rows.map((r) => r.saldoSicherNegative), [true, true, true, true])
  assert.deepEqual(rows.map((r) => r.saldoErwartetNegative), [true, false, false, false])
  assert.deepEqual(rows.map((r) => r.saldoSicherText), [`${MINUS}5,00 €`, `${MINUS}5,00 €`, `${MINUS}2,00 €`, `${MINUS}3,00 €`])
  assert.deepEqual(rows.map((r) => r.saldoErwartetText), [`${MINUS}5,00 €`, '5,00 €', '8,00 €', '7,00 €'])
  // der Tiefpunkt der Linie steht in der ersten Zeile des Tages (wie minSicher/minErwartet im Server: -500 am 05.10.)
  assert.equal(Math.min(...rows.map((r) => r.saldoSicherCents)), -500)
  assert.equal(rows.findIndex((r) => r.saldoSicherCents === -500), 0)
  assert.equal(Math.min(...rows.map((r) => r.saldoErwartetCents)), -500)
  // Zuflüsse zuerst würden den Tiefpunkt verstecken: 1000 +300 = 1300, -1500 = -200 statt -500
  const inflowFirst = forecastRows([sameDay[2], sameDay[0]], 1000).rows
  assert.equal(Math.min(...inflowFirst.map((r) => r.saldoSicherCents)), -200)
})

test('forecastNotes: Hinweise zu Kontostand, Stripe und Abos', () => {
  assert.deepEqual(forecastNotes({ kontostandCents: 100, stripeDown: false, abosFehler: false, hasRows: true }), [])
  const all = forecastNotes({ kontostandCents: null, stripeDown: true, abosFehler: true, hasRows: true })
  assert.deepEqual(all.map((n) => n.key), ['kontostand', 'stripe', 'abos'])
  assert.equal(all[2].text, 'Abo-Verlängerungen fehlen, weil die Abos nicht geladen werden konnten.')
  assert.match(all[0].text, /Ohne Kontostand/)
  assert.match(all[1].text, /Stripe/)
  // ohne Zeilen gibt es nichts zu saldieren
  assert.deepEqual(forecastNotes({ kontostandCents: null, stripeDown: false, abosFehler: false, hasRows: false }), [])
  assert.deepEqual(forecastNotes({ kontostandCents: null, stripeDown: false, abosFehler: true, hasRows: false }).map((n) => n.key), ['abos'])
  assert.deepEqual(forecastNotes({}).map((n) => n.key), [])
})

// --- Steuer (Block 4) ---------------------------------------------------------------------------------------

const steuer = (extra = {}, klein = {}) => ({
  jahr: 2026,
  einnahmenCents: 16879,
  ausgabenCents: 5986,
  gewinnCents: 10893,
  ruecklageCents: 3268,
  prozent: 30,
  gewerbesteuerHinweis: false,
  kleinunternehmer: {
    jahrCents: 8000,
    vorjahrCents: null,
    grenzeFolgejahrCents: 2500000,
    grenzeHartCents: 10000000,
    anteilFolgejahr: 0.0032,
    ...klein,
  },
  naechsteVorauszahlung: null,
  ...extra,
})

test('taxView: Rücklage mit Prozentsatz, Gewinn und Jahr aus den echten Werten', () => {
  const v = taxView(steuer())
  assert.equal(v.reserve.amountText, '32,68 €')
  assert.equal(v.reserve.basisText, '30 % von 108,93 € Gewinn 2026')
  const other = taxView(steuer({ jahr: 2027, prozent: 27.5, gewinnCents: 123456789, ruecklageCents: 100 }))
  assert.equal(other.reserve.basisText, '27,5 % von 1.234.567,89 € Gewinn 2027')
})

test('taxView: Verlust zeigt den negativen Gewinn mit U+2212', () => {
  const v = taxView(steuer({ gewinnCents: -5000, ruecklageCents: 0 }))
  assert.equal(v.reserve.amountText, '0,00 €')
  assert.equal(v.reserve.basisText, `30 % von ${MINUS}50,00 € Gewinn 2026`)
})

test('taxView: Kleinunternehmer-Zähler „<Betrag> von 25.000 € (2026)“ und harte Grenze', () => {
  const v = taxView(steuer())
  assert.equal(v.small.known, true)
  assert.equal(v.small.counterText, '80,00 € von 25.000 € (2026)')
  assert.equal(v.small.shareText, '0,3 % der Grenze von 25.000 €')
  assert.equal(v.small.limitText, 'Über 25.000 € im Jahr 2026: ab 2027 keine Kleinunternehmerregelung.')
  assert.equal(
    v.small.hardText,
    'Grenze 100.000 €: Ab dem Umsatz, der diese Grenze übersteigt, gilt schon im laufenden Jahr die Regelbesteuerung (Umsatzsteuer).'
  )
  assert.equal(v.small.previousText, null)
  assert.equal(taxView(steuer({}, { anteilFolgejahr: 0.704 })).small.shareText, '70,4 % der Grenze von 25.000 €')
  assert.equal(taxView(steuer({}, { jahrCents: 0, anteilFolgejahr: 0 })).small.counterText, '0,00 € von 25.000 € (2026)')
})

test('taxView: Orientierungshinweis steht immer dabei, Anteil ohne „-€-Grenze“', () => {
  assert.equal(TAX_NOTE, 'Orientierungswert, ersetzt keine Steuerberatung.')
  assert.equal(taxView(steuer()).noteText, TAX_NOTE)
  assert.equal(taxView(null).noteText, TAX_NOTE)
  assert.equal(taxView(steuer({}, { jahrCents: null, anteilFolgejahr: null })).noteText, TAX_NOTE)
  for (const t of [taxView(steuer()), taxView(steuer({}, { anteilFolgejahr: 1.2 }))]) assert.doesNotMatch(t.small.shareText, /-€-Grenze/)
})

test('taxView: Stripe nicht erreichbar -> unbekannt statt 0', () => {
  const v = taxView(steuer({}, { jahrCents: null, anteilFolgejahr: null }))
  assert.equal(v.small.known, false)
  assert.equal(v.small.counterText, 'unbekannt (Stripe nicht erreichbar)')
  assert.equal(v.small.shareText, null)
  // die Erläuterungen zu den Grenzen bleiben auch ohne Zähler
  assert.equal(v.small.limitText, 'Über 25.000 € im Jahr 2026: ab 2027 keine Kleinunternehmerregelung.')
  assert.equal(
    v.small.hardText,
    'Grenze 100.000 €: Ab dem Umsatz, der diese Grenze übersteigt, gilt schon im laufenden Jahr die Regelbesteuerung (Umsatzsteuer).'
  )
  // nur der Zähler ist unbekannt, der Rest der Karte bleibt
  assert.equal(v.reserve.amountText, '32,68 €')
})

test('taxView: Vorjahr nur wenn gesetzt, über der Grenze mit Hinweis', () => {
  assert.equal(taxView(steuer({}, { vorjahrCents: 1200000 })).small.previousText, 'Vorjahr: 12.000,00 €')
  assert.equal(taxView(steuer({}, { vorjahrCents: 0 })).small.previousText, 'Vorjahr: 0,00 €')
  assert.equal(taxView(steuer({}, { vorjahrCents: 2500000 })).small.previousText, 'Vorjahr: 25.000,00 €')
  assert.equal(
    taxView(steuer({}, { vorjahrCents: 2500001 })).small.previousText,
    'Vorjahr: 25.000,01 € (über 25.000 €: im laufenden Jahr keine Kleinunternehmerregelung)'
  )
})

test('taxView: Grenzen kommen aus dem Server (Rückfall nur ohne Wert), Jahr fehlt -> Folgejahr', () => {
  const custom = taxView(steuer({ jahr: 2030 }, { grenzeFolgejahrCents: 3000000, grenzeHartCents: 12000000, anteilFolgejahr: 0.5, vorjahrCents: 3000001 }))
  assert.equal(custom.small.counterText, '80,00 € von 30.000 € (2030)')
  assert.equal(custom.small.shareText, '50 % der Grenze von 30.000 €')
  assert.equal(custom.small.limitText, 'Über 30.000 € im Jahr 2030: ab 2031 keine Kleinunternehmerregelung.')
  assert.match(custom.small.hardText, /^Grenze 120\.000 €: Ab dem Umsatz, der diese Grenze übersteigt, gilt schon im laufenden Jahr die Regelbesteuerung \(Umsatzsteuer\)\.$/)
  assert.equal(custom.small.previousText, 'Vorjahr: 30.000,01 € (über 30.000 €: im laufenden Jahr keine Kleinunternehmerregelung)')
  const noYear = taxView({ kleinunternehmer: { jahrCents: 100 } })
  assert.equal(noYear.small.counterText, '1,00 € von 25.000 €')
  assert.equal(noYear.small.limitText, 'Über 25.000 € im Jahr: ab dem Folgejahr keine Kleinunternehmerregelung.')
})

test('taxView: Gewerbesteuer-Hinweis nur mit gewerbesteuerHinweis', () => {
  assert.equal(taxView(steuer()).gewerbeText, null)
  assert.equal(taxView(steuer({ gewerbesteuerHinweis: false })).gewerbeText, null)
  assert.equal(
    taxView(steuer({ gewerbesteuerHinweis: true })).gewerbeText,
    'Der Gewinn 2026 liegt über dem Gewerbesteuer-Freibetrag von 24.500 € (natürliche Personen und Personengesellschaften, § 11 GewStG). Auf den übersteigenden Gewerbeertrag kann Gewerbesteuer anfallen.'
  )
  // ohne Jahr entfällt die Jahreszahl
  assert.equal(
    taxView({ gewerbesteuerHinweis: true }).gewerbeText,
    'Der Gewinn liegt über dem Gewerbesteuer-Freibetrag von 24.500 € (natürliche Personen und Personengesellschaften, § 11 GewStG). Auf den übersteigenden Gewerbeertrag kann Gewerbesteuer anfallen.'
  )
})

test('taxView: nächste ESt-Vorauszahlung nur wenn gesetzt', () => {
  assert.equal(taxView(steuer()).prepayment, null)
  assert.deepEqual(taxView(steuer({ naechsteVorauszahlung: { date: '2026-12-10', amountCents: 100000 } })).prepayment, {
    dateText: '10.12.2026',
    amountText: '1.000,00 €',
  })
})

test('taxView: fehlende Teile werden nicht zu Müll', () => {
  const v = taxView(null)
  assert.equal(v.reserve.amountText, '–')
  assert.equal(v.reserve.basisText, '')
  assert.equal(v.small.known, false)
  assert.equal(v.gewerbeText, null)
  assert.equal(v.prepayment, null)
  // ohne Grenzen aus dem Server gelten die gesetzlichen Werte
  const bare = taxView({ jahr: 2026, kleinunternehmer: { jahrCents: 100 } })
  assert.equal(bare.small.counterText, '1,00 € von 25.000 € (2026)')
  assert.equal(
    bare.small.hardText,
    'Grenze 100.000 €: Ab dem Umsatz, der diese Grenze übersteigt, gilt schon im laufenden Jahr die Regelbesteuerung (Umsatzsteuer).'
  )
})

// --- Abos (Block 5) -----------------------------------------------------------------------------------------

const abos = (extra = {}) => ({
  monatlichCents: 7000,
  zahlendeKunden: 1,
  gefaehrdetCents: 5000,
  liste: [
    { customerId: 'c2', kunde: 'Zwei GmbH', produkt: 'wartung', status: 'past_due', betragCents: 5000, naechsteAbbuchung: null },
    { customerId: 'c1', kunde: 'Kunde Eins', produkt: 'hosting', status: 'active', betragCents: 2000, naechsteAbbuchung: '2026-10-21' },
  ],
  ...extra,
})

test('aboView: Kennzahlen und Liste', () => {
  const v = aboView(abos())
  assert.equal(v.error, '')
  assert.equal(v.monthlyText, '70,00 €')
  assert.equal(v.payingText, '1')
  assert.equal(v.atRiskText, '50,00 €')
  assert.equal(v.rows.length, 2)
  assert.deepEqual(
    { ...v.rows[0], key: undefined },
    {
      key: undefined,
      customer: 'Zwei GmbH',
      product: 'Wartungs-Abo',
      statusLabel: 'Zahlung fehlgeschlagen',
      tone: 'danger',
      amountText: '50,00 €',
      nextText: '–',
    }
  )
  assert.deepEqual(
    { ...v.rows[1], key: undefined },
    { key: undefined, customer: 'Kunde Eins', product: 'Hosting-Abo', statusLabel: 'aktiv', tone: 'ok', amountText: '20,00 €', nextText: '21.10.2026' }
  )
  assert.notEqual(v.rows[0].key, v.rows[1].key)
})

test('aboView: „gefährdet“ nur über 0', () => {
  assert.equal(aboView(abos({ gefaehrdetCents: 0 })).atRiskText, null)
  assert.equal(aboView(abos({ gefaehrdetCents: null })).atRiskText, null)
  assert.equal(aboView(abos({ gefaehrdetCents: 1 })).atRiskText, '0,01 €')
})

test('aboView: Ladefehler zeigt den Text des Servers, keine Zahlen', () => {
  const v = aboView({ monatlichCents: null, zahlendeKunden: null, gefaehrdetCents: null, liste: [], fehler: 'Abos konnten nicht geladen werden.' })
  assert.equal(v.error, 'Abos konnten nicht geladen werden.')
  assert.equal(v.monthlyText, '–')
  assert.equal(v.payingText, '–')
  assert.equal(v.atRiskText, null)
  assert.deepEqual(v.rows, [])
  // leerer Text -> Standardtext
  assert.equal(aboView({ fehler: true, liste: [] }).error, 'Abos konnten nicht geladen werden.')
})

test('aboView: leer oder fehlend', () => {
  for (const none of [null, undefined, {}, { liste: [] }, { liste: 'x' }]) {
    const v = aboView(none)
    assert.deepEqual(v.rows, [])
    assert.equal(v.error, '')
  }
  assert.equal(aboView({ monatlichCents: 0, zahlendeKunden: 0, gefaehrdetCents: 0, liste: [] }).monthlyText, '0,00 €')
})

test('aboView: unbekannter Kunde, unbekanntes Produkt und unbekannter Status', () => {
  const v = aboView({
    liste: [
      { customerId: '', kunde: '', produkt: '', status: 'trialing', betragCents: 100, naechsteAbbuchung: '2026-11-01' },
      { customerId: 'c3', kunde: ' Drei ', produkt: 'sonst', status: 'unpaid', betragCents: null, naechsteAbbuchung: 'kaputt' },
      { customerId: 'c4', kunde: 'Vier', produkt: 'hosting', status: 'paused', betragCents: 0, naechsteAbbuchung: null },
      null,
    ],
  })
  assert.equal(v.rows.length, 3)
  assert.equal(v.rows[0].customer, 'Unbekannter Kunde')
  assert.equal(v.rows[0].product, 'Abo')
  assert.equal(v.rows[0].statusLabel, 'Testphase')
  assert.equal(v.rows[0].tone, 'info')
  assert.equal(v.rows[1].customer, 'Drei')
  assert.equal(v.rows[1].product, 'sonst')
  assert.equal(v.rows[1].statusLabel, 'unbezahlt')
  assert.equal(v.rows[1].tone, 'danger')
  assert.equal(v.rows[1].amountText, '–')
  assert.equal(v.rows[1].nextText, '–')
  assert.equal(v.rows[2].statusLabel, 'paused')
  assert.equal(v.rows[2].tone, 'muted')
})

test('productLabel und aboStatus', () => {
  assert.equal(productLabel('hosting'), 'Hosting-Abo')
  assert.equal(productLabel('wartung'), 'Wartungs-Abo')
  assert.equal(productLabel(''), 'Abo')
  assert.equal(productLabel(undefined), 'Abo')
  assert.equal(productLabel('x_y'), 'x_y')
  assert.deepEqual(aboStatus('active'), { label: 'aktiv', tone: 'ok' })
  assert.deepEqual(aboStatus('past_due'), { label: 'Zahlung fehlgeschlagen', tone: 'danger' })
  assert.deepEqual(aboStatus('weird'), { label: 'weird', tone: 'muted' })
  assert.deepEqual(aboStatus(''), { label: 'unbekannt', tone: 'muted' })
})

// --- Rechnungen (Block 6) ----------------------------------------------------------------------------------

const INV = (over = {}) => ({
  id: 'in_1', number: 'WK-0006', status: 'ueberfaellig', customerName: 'Kunde Zwei', customerEmail: 'k@example.invalid',
  webklarCustomerId: 'c2', createdDate: '2026-09-01', dueDate: '2026-09-21', totalCents: 5000, remainingCents: 5000,
  paidCents: 0, paidDate: null, overdueDays: 10, source: 'projekt', hostedUrl: 'https://pay.stripe.test/i/1',
  pdfUrl: 'https://pay.stripe.test/i/1/pdf', outOfBand: false, bankTransactionId: '', ...over,
})

test('INVOICE_FILTERS: Reihenfolge Offen, Überfällig, Bezahlt, Entwürfe, Alle; Standard Offen', () => {
  assert.deepEqual(INVOICE_FILTERS.map((f) => f.label), ['Offen', 'Überfällig', 'Bezahlt', 'Entwürfe', 'Alle'])
  assert.deepEqual(INVOICE_FILTERS.map((f) => f.key), ['offen', 'ueberfaellig', 'bezahlt', 'entwurf', 'alle'])
  assert.equal(DEFAULT_INVOICE_FILTER, 'offen')
})

test('invoiceFilterStatuses: „Offen“ ruft offen UND überfällig ab, die anderen genau ihren Status', () => {
  assert.deepEqual(invoiceFilterStatuses('offen'), ['offen', 'ueberfaellig'])
  assert.deepEqual(invoiceFilterStatuses('ueberfaellig'), ['ueberfaellig'])
  assert.deepEqual(invoiceFilterStatuses('bezahlt'), ['bezahlt'])
  assert.deepEqual(invoiceFilterStatuses('entwurf'), ['entwurf'])
  assert.deepEqual(invoiceFilterStatuses('alle'), ['alle'])
  assert.deepEqual(invoiceFilterStatuses('gibtsnicht'), ['alle'])
  assert.deepEqual(invoiceFilterStatuses(undefined), ['alle'])
  // die Liste des Filters lässt sich nicht von außen verändern
  invoiceFilterStatuses('offen').push('x')
  assert.deepEqual(invoiceFilterStatuses('offen'), ['offen', 'ueberfaellig'])
  for (const f of INVOICE_FILTERS) assert.deepEqual(invoiceFilterStatuses(f.key), f.statuses)
})

test('mergeInvoiceLists: neueste zuerst, gleiche Tage in Listenreihenfolge, keine Doppelten', () => {
  const open = [
    { id: 'a', createdDate: '2026-07-28', status: 'offen' },
    { id: 'b', createdDate: '2026-09-15', status: 'offen' },
  ]
  const overdue = [
    { id: 'c', createdDate: '2026-09-01', status: 'ueberfaellig' },
    { id: 'd', createdDate: '2026-09-15', status: 'ueberfaellig' },
    { id: 'a', createdDate: '2026-07-28', status: 'offen' },
  ]
  assert.deepEqual(mergeInvoiceLists([open, overdue]).map((i) => i.id), ['b', 'd', 'c', 'a'])
  assert.deepEqual(mergeInvoiceLists([overdue, open]).map((i) => i.id), ['d', 'b', 'c', 'a'])
  assert.deepEqual(mergeInvoiceLists([open]).map((i) => i.id), ['b', 'a'])
  assert.deepEqual(mergeInvoiceLists([undefined, null, [null, 5, { id: 'x', createdDate: '2026-01-01' }]]).map((i) => i.id), ['x'])
  assert.deepEqual(mergeInvoiceLists(undefined), [])
  const input = [open, overdue]
  mergeInvoiceLists(input)
  assert.deepEqual(open.map((i) => i.id), ['a', 'b'], 'Eingabelisten bleiben unverändert')
})

test('ageGroupCells: vier Gruppen in fester Reihenfolge, fehlende zählen 0', () => {
  const cells = ageGroupCells([
    { key: '1-30', anzahl: 2, summeCents: 12345 },
    { key: 'nicht-faellig', anzahl: 1, summeCents: 16879 },
  ])
  assert.deepEqual(cells.map((c) => c.key), ['nicht-faellig', '1-30', '31-60', 'ueber-60'])
  assert.deepEqual(cells.map((c) => c.label), ['Nicht fällig', '1–30 Tage', '31–60 Tage', 'Über 60 Tage'])
  assert.deepEqual(cells.map((c) => c.count), [1, 2, 0, 0])
  assert.deepEqual(cells.map((c) => c.sumText), ['168,79 €', '123,45 €', '0,00 €', '0,00 €'])
  assert.deepEqual(ageGroupCells(null), [])
  assert.deepEqual(ageGroupCells(undefined), [])
  assert.equal(ageGroupCells([]).length, 4)
})

test('invoiceActions: Entwurf bekommt Senden und Löschen, keine Adressen', () => {
  const a = invoiceActions(INV({ status: 'entwurf', number: '', hostedUrl: null, pdfUrl: null }))
  assert.deepEqual(a.map((x) => x.key), ['send', 'delete'])
  assert.deepEqual(a.map((x) => x.label), ['Senden', 'Löschen'])
})

test('invoiceActions: offen und überfällig (Projekt): Zahlungsseite, PDF, Erinnerung senden, Stornieren', () => {
  for (const status of ['offen', 'ueberfaellig']) {
    const a = invoiceActions(INV({ status }))
    assert.deepEqual(a.map((x) => x.label), ['Zahlungsseite', 'PDF', 'Erinnerung senden', 'Stornieren'])
    assert.equal(a[0].url, 'https://pay.stripe.test/i/1')
    assert.equal(a[1].url, 'https://pay.stripe.test/i/1/pdf')
  }
})

test('invoiceActions: Abo-Rechnungen nur Zahlungsseite und PDF, nie Senden/Stornieren/Löschen', () => {
  assert.deepEqual(invoiceActions(INV({ source: 'abo', status: 'offen' })).map((x) => x.key), ['hosted', 'pdf'])
  assert.deepEqual(invoiceActions(INV({ source: 'abo', status: 'ueberfaellig' })).map((x) => x.key), ['hosted', 'pdf'])
  assert.deepEqual(invoiceActions(INV({ source: 'abo', status: 'entwurf' })), [])
  assert.deepEqual(invoiceActions(INV({ source: 'abo', status: 'bezahlt' })).map((x) => x.key), ['pdf'])
})

test('invoiceActions: bezahlt nur PDF; unsichere Adressen fallen weg', () => {
  assert.deepEqual(invoiceActions(INV({ status: 'bezahlt' })).map((x) => x.key), ['pdf'])
  assert.deepEqual(invoiceActions(INV({ status: 'storniert' })).map((x) => x.key), ['pdf'])
  const unsafe = invoiceActions(INV({ status: 'offen', hostedUrl: 'javascript:alert(1)', pdfUrl: '' }))
  assert.deepEqual(unsafe.map((x) => x.key), ['resend', 'void'])
  assert.deepEqual(invoiceActions(null), [])
})

test('invoiceRows: Spalten und Texte', () => {
  const [r] = invoiceRows([INV()])
  assert.equal(r.numberText, 'WK-0006')
  assert.equal(r.customerText, 'Kunde Zwei')
  assert.equal(r.createdText, '01.09.2026')
  assert.equal(r.dueText, '21.09.2026')
  assert.equal(r.totalText, '50,00 €')
  assert.equal(r.remainingText, '50,00 €')
  assert.equal(r.statusLabel, 'Überfällig')
  assert.equal(r.statusTone, 'warn')
  assert.equal(r.statusNote, '10 Tage überfällig')
  assert.equal(r.isAbo, false)
})

test('invoiceRows: Entwurf ohne Nummer, Bezahlt per Überweisung, Offen nur bei offen/überfällig', () => {
  const [draft, paid, paidStripe, open, one] = invoiceRows([
    INV({ status: 'entwurf', number: '', dueDate: null, hostedUrl: null, pdfUrl: null, overdueDays: 0, remainingCents: 3000, totalCents: 3000 }),
    INV({ status: 'bezahlt', paidDate: '2026-08-05', outOfBand: true, remainingCents: 0, totalCents: 16879 }),
    INV({ status: 'bezahlt', paidDate: '2026-08-06', outOfBand: false, remainingCents: 0 }),
    INV({ status: 'offen', overdueDays: 0, remainingCents: 1234 }),
    INV({ overdueDays: 1 }),
  ])
  assert.equal(draft.numberText, 'ohne Nr.')
  assert.equal(draft.dueText, '–')
  assert.equal(draft.remainingText, '–')
  assert.equal(draft.statusLabel, 'Entwurf')
  assert.equal(paid.statusNote, 'am 05.08.2026 · per Überweisung')
  assert.equal(paid.remainingText, '–')
  assert.equal(paidStripe.statusNote, 'am 06.08.2026')
  assert.equal(open.statusNote, '')
  assert.equal(open.remainingText, '12,34 €')
  assert.equal(one.statusNote, '1 Tag überfällig')
})

test('invoiceRows: fehlende Namen, Abo-Kennzeichen, kaputte Einträge', () => {
  const rows = invoiceRows([INV({ customerName: '', customerEmail: 'a@b.invalid', source: 'abo' }), INV({ customerName: '', customerEmail: '' }), null, 5])
  assert.equal(rows.length, 2)
  assert.equal(rows[0].customerText, 'a@b.invalid')
  assert.equal(rows[0].isAbo, true)
  assert.equal(rows[1].customerText, 'Unbekannter Kunde')
  assert.deepEqual(invoiceRows(undefined), [])
})

test('invoiceConfirmText: Löschen, Stornieren, Erinnerung; sonst leer', () => {
  const inv = INV({ status: 'offen' })
  assert.equal(invoiceConfirmText('delete', inv), 'Den Entwurf für Kunde Zwei über 50,00 € wirklich löschen? Das lässt sich nicht rückgängig machen.')
  assert.equal(invoiceConfirmText('void', inv), 'Die Rechnung WK-0006 an Kunde Zwei über 50,00 € wirklich stornieren? Das lässt sich nicht rückgängig machen.')
  assert.equal(invoiceConfirmText('resend', inv), 'Die Rechnung WK-0006 jetzt noch einmal an k@example.invalid senden (Erinnerung)?')
  // „send“ gibt es nur für Entwürfe; bei jeder anderen Rechnung keine Rückfrage
  assert.equal(invoiceConfirmText('send', inv), '')
  assert.equal(invoiceConfirmText('pdf', inv), '')
})

test('invoiceConfirmText: Senden eines Entwurfs fragt vorher, mit Kunde, Betrag und E-Mail', () => {
  const draft = INV({ status: 'entwurf', number: '', totalCents: 120050 })
  assert.equal(
    invoiceConfirmText('send', draft),
    'Rechnung für Kunde Zwei über 1.200,50 € jetzt festschreiben und an k@example.invalid senden? Danach lässt sie sich nur noch stornieren.'
  )
  // ohne Namen steht die E-Mail als Kunde, ohne beides „den Kunden“
  assert.equal(
    invoiceConfirmText('send', INV({ status: 'entwurf', customerName: '', customerEmail: 'a@example.invalid' })),
    'Rechnung für a@example.invalid über 50,00 € jetzt festschreiben und an a@example.invalid senden? Danach lässt sie sich nur noch stornieren.'
  )
  assert.equal(
    invoiceConfirmText('send', INV({ status: 'entwurf', customerName: '', customerEmail: '' })),
    'Rechnung für den Kunden über 50,00 € jetzt festschreiben und an den Kunden senden? Danach lässt sie sich nur noch stornieren.'
  )
  for (const status of ['offen', 'ueberfaellig', 'bezahlt']) assert.equal(invoiceConfirmText('send', INV({ status })), '')
})

test('invoiceSendConfirmText: Text für den Dialog „Senden“ (Kunde, Summe, E-Mail des gewählten Kunden)', () => {
  assert.equal(
    invoiceSendConfirmText({ name: 'Müller Sanitär', email: 'm@example.invalid', totalCents: 15050 }),
    'Rechnung für Müller Sanitär über 150,50 € jetzt festschreiben und an m@example.invalid senden? Danach lässt sie sich nur noch stornieren.'
  )
  assert.equal(
    invoiceSendConfirmText({ name: '  ', email: ' m@example.invalid ', totalCents: 100 }),
    'Rechnung für m@example.invalid über 1,00 € jetzt festschreiben und an m@example.invalid senden? Danach lässt sie sich nur noch stornieren.'
  )
  assert.match(invoiceSendConfirmText(), /^Rechnung für den Kunden über /)
})

test('invoiceDoneMessage', () => {
  const r = { number: 'WK-0007', customerEmail: 'k@example.invalid' }
  assert.equal(invoiceDoneMessage('send', r), 'Rechnung WK-0007 wurde an k@example.invalid gesendet.')
  assert.equal(invoiceDoneMessage('create-send', r), 'Rechnung WK-0007 wurde an k@example.invalid gesendet.')
  assert.equal(invoiceDoneMessage('resend', r), 'Die Erinnerung zu Rechnung WK-0007 wurde an k@example.invalid gesendet.')
  assert.equal(invoiceDoneMessage('void', r), 'Rechnung WK-0007 wurde storniert.')
  assert.equal(invoiceDoneMessage('delete'), 'Der Entwurf wurde gelöscht.')
  assert.equal(invoiceDoneMessage('create-draft', { number: '' }), 'Der Entwurf wurde gespeichert.')
  assert.equal(invoiceDoneMessage('send', {}), 'Die Rechnung wurde gesendet.')
  assert.equal(invoiceDoneMessage('xyz', r), '')
})

test('invoiceFailureMessage: 502 mit invoiceId nennt die Nummer, sonst die Meldung des Servers', () => {
  const e502 = Object.assign(new Error('Stripe ist gerade nicht erreichbar.'), { status: 502, invoiceId: 'in_9', invoiceNumber: 'WK-0009' })
  assert.equal(isFinalizedNotSent(e502), true)
  assert.equal(invoiceFailureMessage(e502), 'Rechnung WK-0009 wurde festgeschrieben, aber nicht versendet. Bitte in der Liste erneut senden.')
  const noNumber = Object.assign(new Error('x'), { status: 502, invoiceId: 'in_9' })
  assert.equal(invoiceFailureMessage(noNumber), 'Die Rechnung wurde festgeschrieben, aber nicht versendet. Bitte in der Liste erneut senden.')
  const plain502 = Object.assign(new Error('Stripe ist gerade nicht erreichbar.'), { status: 502 })
  assert.equal(isFinalizedNotSent(plain502), false)
  assert.equal(invoiceFailureMessage(plain502), 'Stripe ist gerade nicht erreichbar.')
  assert.equal(invoiceFailureMessage(Object.assign(new Error('Diese Rechnung wird gerade schon erstellt.'), { status: 409 })), 'Diese Rechnung wird gerade schon erstellt.')
  assert.equal(invoiceFailureMessage(null), 'Die Aktion ist fehlgeschlagen.')
  assert.equal(isFinalizedNotSent(null), false)
})

test('invoiceFailureMessage: scheiterte nur das Nachlesen, gilt die Meldung des Servers (die Rechnung ist raus)', () => {
  const sentButUnreadable = Object.assign(
    new Error('Rechnung WK-0010 wurde gesendet, konnte aber nicht gelesen werden. Bitte die Rechnungsliste prüfen.'),
    { status: 502, invoiceId: 'in_10', invoiceNumber: 'WK-0010' }
  )
  assert.equal(invoiceFailureMessage(sentButUnreadable), 'Rechnung WK-0010 wurde gesendet, konnte aber nicht gelesen werden. Bitte die Rechnungsliste prüfen.')
  const draftUnreadable = Object.assign(new Error('Der Entwurf wurde angelegt, konnte aber nicht gelesen werden. Bitte die Rechnungsliste prüfen.'), { status: 502, invoiceId: 'in_11', invoiceNumber: '' })
  assert.match(invoiceFailureMessage(draftUnreadable), /^Der Entwurf wurde angelegt/)
  const notSent = Object.assign(new Error('Rechnung WK-0010 wurde festgeschrieben, aber nicht versendet. Bitte erneut senden.'), { status: 502, invoiceId: 'in_10', invoiceNumber: 'WK-0010' })
  assert.equal(invoiceFailureMessage(notSent), 'Rechnung WK-0010 wurde festgeschrieben, aber nicht versendet. Bitte in der Liste erneut senden.')
})

test('finalizedFilter: mit Nummer Offen, ohne (Entwurf) Entwürfe', () => {
  assert.equal(finalizedFilter({ invoiceNumber: 'WK-0010' }), 'offen')
  assert.equal(finalizedFilter({ invoiceNumber: '' }), 'entwurf')
  assert.equal(finalizedFilter({}), 'entwurf')
  assert.equal(finalizedFilter(null), 'entwurf')
})

// --- Rechnung schreiben (Dialog) ---------------------------------------------------------------------------

const CUST = { $id: 'c1', name: 'Kunde Eins', email: 'eins@example.invalid', customerStatus: 'customer' }
const FORM = (over = {}) => ({
  customer: CUST,
  items: [{ description: 'Webdesign', quantity: '2', price: '1.234,50' }],
  days: '14',
  memo: '',
  ...over,
})

test('parseQuantity: ganze Zahlen 1 bis 999', () => {
  assert.equal(parseQuantity('1'), 1)
  assert.equal(parseQuantity(' 12 '), 12)
  assert.equal(parseQuantity('999'), 999)
  assert.equal(parseQuantity('007'), 7)
  assert.equal(parseQuantity(3), 3)
  for (const bad of ['0', '1000', '', '1,5', '-1', 'a', null, undefined, '1.0']) assert.equal(parseQuantity(bad), null, String(bad))
})

test('parseUnitPrice: Betrag in Euro, 0,01 € bis 100.000,00 €', () => {
  assert.equal(parseUnitPrice('1.234,50'), 123450)
  assert.equal(parseUnitPrice('120'), 12000)
  assert.equal(parseUnitPrice('0,01'), 1)
  assert.equal(parseUnitPrice('100.000,00'), INVOICE_LIMITS.maxUnitCents)
  for (const bad of ['0', '0,00', '100.000,01', '-5', 'abc', '', '12.50', null, undefined]) assert.equal(parseUnitPrice(bad), null, String(bad))
})

test('lineTotalCents und invoiceTotalCents: ungültige Positionen zählen 0', () => {
  assert.equal(lineTotalCents({ quantity: '2', price: '1.234,50' }), 246900)
  assert.equal(lineTotalCents({ quantity: '0', price: '5' }), null)
  assert.equal(lineTotalCents({ quantity: '1', price: '' }), null)
  assert.equal(lineTotalCents(null), null)
  assert.equal(invoiceTotalCents([{ quantity: '2', price: '10' }, { quantity: 'x', price: '10' }, { quantity: '1', price: '0,50' }]), 2050)
  assert.equal(invoiceTotalCents(undefined), 0)
})

test('validateInvoiceForm: gültiges Formular -> Anfrage in Cent (ohne leere Notiz)', () => {
  const r = validateInvoiceForm(FORM())
  assert.equal(r.ok, true)
  assert.deepEqual(r.payload, {
    customerId: 'c1',
    items: [{ description: 'Webdesign', quantity: 2, unitAmountCents: 123450 }],
    daysUntilDue: 14,
  })
  assert.equal(r.totalCents, 246900)
  const withMemo = validateInvoiceForm(FORM({ memo: '  Danke!  ', days: '0', items: [{ description: ' A ', quantity: '1', price: '0,01' }] }))
  assert.equal(withMemo.ok, true)
  assert.equal(withMemo.payload.memo, 'Danke!')
  assert.equal(withMemo.payload.daysUntilDue, 0)
  assert.equal(withMemo.payload.items[0].description, 'A')
})

test('validateInvoiceForm: Kunde fehlt, Lead, ohne E-Mail', () => {
  assert.deepEqual(validateInvoiceForm(FORM({ customer: null })), { ok: false, error: 'Bitte einen Kunden wählen.' })
  const lead = validateInvoiceForm(FORM({ customer: { ...CUST, customerStatus: 'lead' } }))
  assert.equal(lead.ok, false)
  assert.equal(lead.error, 'Für Kunde Eins kann keine Rechnung geschrieben werden: Noch kein fester Kunde.')
  const noMail = validateInvoiceForm(FORM({ customer: { ...CUST, email: '' } }))
  assert.equal(noMail.error, 'Für Kunde Eins kann keine Rechnung geschrieben werden: E-Mail fehlt.')
})

test('validateInvoiceForm: Positionen werden mit Nummer gemeldet', () => {
  const good = { description: 'A', quantity: '1', price: '5' }
  assert.equal(validateInvoiceForm(FORM({ items: [] })).error, 'Eine Rechnung braucht 1 bis 20 Positionen.')
  assert.equal(validateInvoiceForm(FORM({ items: Array(21).fill(good) })).error, 'Eine Rechnung braucht 1 bis 20 Positionen.')
  assert.equal(validateInvoiceForm(FORM({ items: [good, { ...good, description: '  ' }] })).error, 'Position 2: Bitte eine Beschreibung eingeben.')
  assert.equal(validateInvoiceForm(FORM({ items: [{ ...good, description: 'x'.repeat(201) }] })).error, 'Position 1: Die Beschreibung darf höchstens 200 Zeichen lang sein.')
  assert.equal(validateInvoiceForm(FORM({ items: [{ ...good, quantity: '0' }] })).error, 'Position 1: Die Menge muss eine ganze Zahl von 1 bis 999 sein.')
  assert.equal(validateInvoiceForm(FORM({ items: [{ ...good, price: '0' }] })).error, 'Position 1: Der Einzelpreis muss ein Betrag zwischen 0,01 € und 100.000,00 € sein (z. B. 120,00).')
  assert.equal(validateInvoiceForm(FORM({ items: [{ ...good, price: 'abc' }] })).error, 'Position 1: Der Einzelpreis muss ein Betrag zwischen 0,01 € und 100.000,00 € sein (z. B. 120,00).')
  assert.equal(validateInvoiceForm(FORM({ items: Array(20).fill(good) })).ok, true)
})

test('validateInvoiceForm: Summe, Zahlungsziel und Notiz', () => {
  const big = { description: 'A', quantity: '999', price: '100.000,00' }
  assert.equal(validateInvoiceForm(FORM({ items: [big] })).error, 'Die Rechnungssumme ist zu hoch (höchstens 999.999,99 €).')
  for (const days of ['', '-1', '61', '1,5', 'x']) {
    assert.equal(validateInvoiceForm(FORM({ days })).error, 'Das Zahlungsziel muss eine ganze Zahl von 0 bis 60 Tagen sein.', days)
  }
  assert.equal(validateInvoiceForm(FORM({ days: '60' })).ok, true)
  assert.equal(validateInvoiceForm(FORM({ memo: 'x'.repeat(1001) })).error, 'Die Notiz darf höchstens 1000 Zeichen lang sein.')
  assert.equal(validateInvoiceForm(FORM({ memo: 'x'.repeat(1000) })).ok, true)
  assert.equal(validateInvoiceForm(undefined).ok, false)
})

const CUSTOMERS = [
  { $id: 'c3', name: 'Zeta GmbH', email: 'zeta@example.invalid', customerStatus: 'customer' },
  { $id: 'c1', name: 'Alpha AG', email: 'alpha@example.invalid' }, // ohne Status = Kunde
  { $id: 'c2', name: 'Beta Lead', email: 'beta@example.invalid', customerStatus: 'lead' },
  { $id: 'c4', name: 'Gamma', email: '', customerStatus: 'customer' },
  { $id: 'c5', companyName: 'Delta Firma', email: 'delta@example.invalid', customerStatus: 'customer' },
  { $id: 'c6', name: 'Alpha AG', email: 'alpha2@example.invalid', customerStatus: 'customer' },
  { $id: 'c7', name: '', email: 'x@example.invalid' },
  null,
]

test('customerName: name, sonst companyName', () => {
  assert.equal(customerName({ name: ' A ', companyName: 'B' }), 'A')
  assert.equal(customerName({ companyName: 'B' }), 'B')
  assert.equal(customerName({}), '')
  assert.equal(customerName(null), '')
})

test('customerPickerOptions: nach Namen sortiert, Grund bei gesperrten, gleiche Namen mit E-Mail unterscheidbar', () => {
  const o = customerPickerOptions(CUSTOMERS)
  assert.deepEqual(o.map((x) => x.label), [
    'Alpha AG (alpha@example.invalid)',
    'Alpha AG (alpha2@example.invalid)',
    'Beta Lead',
    'Delta Firma',
    'Gamma',
    'Zeta GmbH',
  ])
  const byId = Object.fromEntries(o.map((x) => [x.id, x]))
  assert.equal(byId.c1.ok, true)
  assert.equal(byId.c2.ok, false)
  assert.equal(byId.c2.reason, 'Noch kein fester Kunde')
  assert.equal(byId.c4.ok, false)
  assert.equal(byId.c4.reason, 'E-Mail fehlt')
  assert.equal(byId.c5.name, 'Delta Firma')
  assert.equal(new Set(o.map((x) => x.label.toLowerCase())).size, o.length)
  assert.deepEqual(customerPickerOptions(undefined), [])
})

test('customerSuggestions: nur Kunden, für die eine Rechnung möglich ist; Namensanfang zuerst; Teiltreffer auch per E-Mail', () => {
  const o = customerPickerOptions(CUSTOMERS)
  const all = customerSuggestions(o, '')
  assert.deepEqual(all.map((s) => s.value), ['Alpha AG (alpha@example.invalid)', 'Alpha AG (alpha2@example.invalid)', 'Delta Firma', 'Zeta GmbH'])
  assert.equal(all[2].hint, 'delta@example.invalid')
  assert.ok(!all.some((s) => s.value.includes('Beta') || s.value === 'Gamma'), 'Lead und Kunde ohne E-Mail fehlen')
  assert.deepEqual(customerSuggestions(o, 'ta').map((s) => s.value), ['Delta Firma', 'Zeta GmbH'])
  assert.deepEqual(customerSuggestions(o, 'zeta@').map((s) => s.value), ['Zeta GmbH'])
  assert.deepEqual(customerSuggestions(o, 'gamma'), [])
  assert.equal(customerSuggestions(o, '', 2).length, 2)
})

test('resolveCustomerText: ok, gesperrt mit Grund, unbekannt, leer', () => {
  const o = customerPickerOptions(CUSTOMERS)
  assert.equal(resolveCustomerText(o, '').state, 'empty')
  assert.equal(resolveCustomerText(o, '  ').state, 'empty')
  const ok = resolveCustomerText(o, 'zeta gmbh')
  assert.equal(ok.state, 'ok')
  assert.equal(ok.option.id, 'c3')
  const blocked = resolveCustomerText(o, 'Beta Lead')
  assert.equal(blocked.state, 'blocked')
  assert.equal(blocked.option.reason, 'Noch kein fester Kunde')
  assert.equal(resolveCustomerText(o, 'Gamma').option.reason, 'E-Mail fehlt')
  assert.equal(resolveCustomerText(o, 'Zeta').state, 'unknown', 'nur der ganze Name zählt, ein Teil nicht')
  assert.equal(resolveCustomerText(o, 'Nie gehört').state, 'unknown')
  assert.equal(resolveCustomerText(o, 'Alpha AG').state, 'unknown', 'mehrdeutiger Name braucht die E-Mail im Feld')
})

// --- Buchungen (Block 7) -----------------------------------------------------------------------------------

const TX = (over = {}) => ({
  $id: 'b1', status: 'BOOK', bookingDate: '2026-01-05', valueDate: '2026-01-05', amountCents: 16879, currency: 'EUR',
  counterpartyName: 'KUNDE EINS GMBH', counterpartyIban: 'DE00', remittance: 'Rechnung WK-0005 vom 28.07.2026', mcc: '',
  category: '', matchedInvoiceId: '', matchedInvoiceNumber: '', matchedPayoutId: '', fixedCostId: '', note: '',
  vorschlaege: [], ...over,
})

test('sortTransactions: neueste zuerst, gleiche Tage behalten die Serverreihenfolge, Vormerkung nach Wertstellung', () => {
  const list = [
    TX({ $id: 'a', bookingDate: '2026-01-05' }),
    TX({ $id: 'b', bookingDate: '2026-03-01' }),
    TX({ $id: 'c', bookingDate: '2026-01-05' }),
    TX({ $id: 'd', bookingDate: '', valueDate: '2026-02-10', status: 'PDNG' }),
    null,
  ]
  assert.deepEqual(sortTransactions(list).map((t) => t.$id), ['b', 'd', 'a', 'c'])
  assert.deepEqual(sortTransactions(undefined), [])
  const before = list.map((t) => t && t.$id)
  sortTransactions(list)
  assert.deepEqual(list.map((t) => t && t.$id), before, 'Eingabe bleibt unverändert')
})

test('strongestSuggestion und suggestionText', () => {
  const low = { kind: 'invoice', id: 'in_l', number: 'WK-0001', confidence: 'niedrig', reason: '', amountDiffers: false }
  const mid = { kind: 'invoice', id: 'in_m', number: 'WK-0002', confidence: 'mittel', reason: '', amountDiffers: true }
  const hi = { kind: 'payout', id: 'po_h', number: '', confidence: 'hoch', reason: '', amountDiffers: false }
  const hi2 = { kind: 'invoice', id: 'in_h2', number: 'WK-0003', confidence: 'hoch', reason: '', amountDiffers: false }
  assert.equal(strongestSuggestion([low, mid, hi, hi2]), hi)
  assert.equal(strongestSuggestion([low, mid]), mid)
  assert.equal(strongestSuggestion([]), null)
  assert.equal(strongestSuggestion(undefined), null)
  assert.equal(suggestionText(hi2), 'Vorschlag: Rechnung WK-0003 (hoch)')
  assert.equal(suggestionText(hi), 'Vorschlag: Stripe-Auszahlung (hoch)')
  assert.equal(suggestionText(mid), 'Vorschlag: Rechnung WK-0002 (mittel) · Betrag weicht ab')
  assert.equal(suggestionText({ kind: 'invoice', id: 'in_x', number: '' }), 'Vorschlag: Rechnung in_x')
  assert.equal(suggestionText(null), '')
})

test('assignmentText: Rechnung mit Nummer, Kategorien, Offen', () => {
  assert.equal(assignmentText(TX({ category: 'rechnung', matchedInvoiceNumber: 'WK-0005' })), 'Rechnung WK-0005')
  assert.equal(assignmentText(TX({ category: 'rechnung', matchedInvoiceNumber: '', matchedInvoiceId: 'in_1' })), 'Rechnung in_1')
  assert.equal(assignmentText(TX({ category: 'stripe-auszahlung' })), 'Stripe-Auszahlung')
  assert.equal(assignmentText(TX({ category: 'fixkosten' })), 'Fixkosten')
  assert.equal(assignmentText(TX({ category: 'rechnung-extern' })), 'Einnahme ohne Stripe-Rechnung')
  assert.equal(assignmentText(TX({ category: 'privat' })), 'Privat/Umbuchung')
  assert.equal(assignmentText(TX({ category: 'sonstiges' })), 'Sonstiges')
  assert.equal(assignmentText(TX({ category: '' })), 'Offen')
  assert.equal(assignmentText(TX({ category: 'neu' })), 'neu')
})

test('transactionRows: Texte, Vorzeichen, Vorschlag, Aktionen', () => {
  const rows = transactionRows([
    TX({ $id: 'in', vorschlaege: [{ kind: 'invoice', id: 'in_5', number: 'WK-0005', confidence: 'hoch', reason: 'x', amountDiffers: false }] }),
    TX({ $id: 'out', bookingDate: '2026-01-04', amountCents: -1000, counterpartyName: 'Hetzner', remittance: 'Server' }),
    TX({ $id: 'rg', bookingDate: '2026-01-03', category: 'rechnung', matchedInvoiceNumber: 'WK-0004', note: 'bar' }),
    TX({ $id: 'pv', bookingDate: '2026-01-02', category: 'privat' }),
    TX({ $id: 'pd', bookingDate: '', valueDate: '2026-01-01', status: 'PDNG', counterpartyName: '', counterpartyIban: 'DE99', vorschlaege: [{ kind: 'invoice', id: 'in_5', number: 'WK-0005', confidence: 'hoch', reason: 'x', amountDiffers: false }] }),
  ])
  assert.deepEqual(rows.map((r) => r.id), ['in', 'out', 'rg', 'pv', 'pd'])
  const [inn, out, rg, pv, pd] = rows
  assert.equal(inn.dateText, '05.01.2026')
  assert.equal(inn.counterparty, 'KUNDE EINS GMBH')
  assert.equal(inn.remittance, 'Rechnung WK-0005 vom 28.07.2026')
  assert.equal(inn.amountText, '+168,79 €')
  assert.equal(inn.incoming, true)
  assert.equal(inn.assignmentText, 'Offen')
  assert.equal(inn.suggestionText, 'Vorschlag: Rechnung WK-0005 (hoch)')
  assert.equal(inn.action, 'assign')
  assert.equal(inn.actionLabel, 'Zuordnen')
  assert.equal(out.amountText, `${MINUS}10,00 €`)
  assert.equal(out.incoming, false)
  assert.equal(out.action, 'assign')
  assert.equal(out.suggestionText, '')
  assert.equal(rg.assignmentText, 'Rechnung WK-0004')
  assert.equal(rg.action, null, 'eine zugeordnete Rechnung lässt sich nicht lösen')
  assert.equal(rg.actionLabel, '')
  assert.equal(rg.note, 'bar')
  assert.equal(pv.action, 'change')
  assert.equal(pv.actionLabel, 'Ändern')
  assert.equal(pd.pending, true)
  assert.equal(pd.suggestionText, '', 'vorgemerkt: kein Rechnungsvorschlag')
  assert.equal(pd.dateText, '01.01.2026')
  assert.equal(pd.counterparty, 'DE99')
  assert.equal(transactionRows(null).length, 0)
})

// --- Zuordnen (Dialog) -------------------------------------------------------------------------------------

const OPEN = (over = {}) => INV({ status: 'offen', overdueDays: 0, ...over })
const SUG_INV = (over = {}) => ({ kind: 'invoice', id: 'in_1', number: 'WK-0006', confidence: 'hoch', reason: 'Rechnungsnummer im Verwendungszweck', amountDiffers: false, ...over })

test('assignModel: Eingang mit Vorschlägen, anderen offenen Rechnungen und Kategorien', () => {
  const tx = TX({ amountCents: 5000, vorschlaege: [SUG_INV(), { kind: 'payout', id: 'po_1', number: '', confidence: 'hoch', reason: 'Stripe-Auszahlung gleicher Betrag', amountDiffers: false }] })
  const m = assignModel(tx, {
    invoices: [OPEN(), OPEN({ id: 'in_2', number: 'WK-0007', remainingCents: 5000 }), OPEN({ id: 'in_3', number: 'WK-0008', remainingCents: 999 }), INV({ id: 'in_4', status: 'bezahlt' }), INV({ id: 'in_5', status: 'entwurf' })],
    fixedCosts: [{ $id: 'f1', name: 'Hetzner', amountCents: 1000, interval: 'monat', active: true }],
  })
  assert.equal(m.incoming, true)
  assert.equal(m.pending, false)
  assert.equal(m.assigned, false)
  assert.equal(m.hint, '')
  assert.deepEqual(m.suggestions.map((s) => s.key), ['invoice:in_1', 'payout:po_1'])
  assert.equal(m.suggestions[0].number, 'WK-0006')
  assert.deepEqual(m.suggestions[0].body, { invoiceId: 'in_1' })
  assert.deepEqual(m.suggestions[1].body, { payoutId: 'po_1' })
  assert.deepEqual(m.invoices.map((o) => o.key), ['invoice:in_2', 'invoice:in_3'], 'Vorschlag nicht doppelt, nur offene/überfällige')
  assert.equal(m.invoices[0].disabled, false)
  assert.equal(m.invoices[1].disabled, true)
  assert.equal(m.invoices[1].disabledReason, 'Betrag weicht ab (offen: 9,99 €)')
  assert.deepEqual(m.fixedCosts, [], 'keine Fixkosten für Eingänge')
  assert.deepEqual(m.categories.map((c) => c.label), ['Einnahme ohne Stripe-Rechnung', 'Privat/Umbuchung', 'Sonstiges'])
  assert.deepEqual(m.categories.map((c) => c.body), [{ category: 'rechnung-extern' }, { category: 'privat' }, { category: 'sonstiges' }])
  assert.ok(m.byKey['invoice:in_2'] && m.byKey['category:privat'] && m.byKey['payout:po_1'])
})

test('assignModel: Vorschlag mit abweichendem Betrag ist nicht wählbar', () => {
  const tx = TX({ amountCents: 5000, vorschlaege: [SUG_INV({ amountDiffers: true, confidence: 'mittel' })] })
  const m = assignModel(tx, { invoices: [] })
  assert.equal(m.suggestions[0].disabled, true)
  assert.match(m.suggestions[0].disabledReason, /Betrag weicht ab/)
  const known = assignModel(TX({ amountCents: 5000, vorschlaege: [SUG_INV()] }), { invoices: [OPEN({ remainingCents: 4000 })] })
  assert.equal(known.suggestions[0].disabled, true, 'auch wenn die Liste den Unterschied zeigt')
})

test('assignModel: Vorschlag zu einer Rechnung, die in der frisch geladenen Liste fehlt, ist nicht wählbar', () => {
  const tx = TX({ amountCents: 5000, vorschlaege: [SUG_INV(), SUG_INV({ id: 'in_9', number: 'WK-0009' })] })
  const listed = [OPEN()] // in_1 steht darin, in_9 nicht mehr
  const loaded = assignModel(tx, { invoices: listed, invoicesLoaded: true })
  assert.equal(loaded.suggestions[0].disabled, false)
  assert.equal(loaded.suggestions[1].disabled, true)
  assert.equal(loaded.suggestions[1].disabledReason, 'Diese Rechnung ist nicht mehr offen.')
  assert.equal(loaded.suggestions[1].number, 'WK-0009')
  // Liste leer, aber frisch geladen: alle Rechnungsvorschläge sind weg
  const none = assignModel(tx, { invoices: [], invoicesLoaded: true })
  assert.deepEqual(none.suggestions.map((s) => s.disabled), [true, true])
  assert.ok(none.suggestions.every((s) => s.disabledReason === 'Diese Rechnung ist nicht mehr offen.'))
  // nicht (oder fehlerhaft) geladen: nichts sperren, der Server entscheidet
  for (const opts of [{ invoices: [] }, { invoices: [], invoicesLoaded: false }]) {
    assert.deepEqual(assignModel(tx, opts).suggestions.map((s) => s.disabled), [false, false])
  }
  // Auszahlungen hängen nicht an der Rechnungsliste
  const withPayout = TX({ amountCents: 5000, vorschlaege: [{ kind: 'payout', id: 'po_1', number: '', confidence: 'hoch', reason: 'x', amountDiffers: false }] })
  assert.equal(assignModel(withPayout, { invoices: [], invoicesLoaded: true }).suggestions[0].disabled, false)
  // eine Rechnung, die in der Liste steht, aber einen anderen Betrag hat, nennt weiter den Betrag
  const differs = assignModel(TX({ amountCents: 5000, vorschlaege: [SUG_INV()] }), { invoices: [OPEN({ remainingCents: 4000 })], invoicesLoaded: true })
  assert.match(differs.suggestions[0].disabledReason, /Betrag weicht ab/)
})

test('assignModel: Ausgang bekommt Fixkosten (nur aktive) und Privat/Sonstiges, keine Rechnungen', () => {
  const tx = TX({ amountCents: -1000, vorschlaege: [SUG_INV()] })
  const m = assignModel(tx, {
    invoices: [OPEN()],
    fixedCosts: [
      { $id: 'f1', name: 'Hetzner', amountCents: 1000, interval: 'monat', active: true },
      { $id: 'f2', name: 'Alt', amountCents: 500, interval: 'jahr', active: false },
      { $id: 'f3', name: 'Domain', amountCents: 1999, interval: 'jahr' },
    ],
  })
  assert.equal(m.outgoing, true)
  assert.deepEqual(m.suggestions, [])
  assert.deepEqual(m.invoices, [])
  assert.deepEqual(m.fixedCosts.map((f) => f.key), ['fixedCost:f1', 'fixedCost:f3'])
  assert.equal(m.fixedCosts[0].label, 'Hetzner · 10,00 € monatlich')
  assert.deepEqual(m.fixedCosts[0].body, { fixedCostId: 'f1' })
  assert.deepEqual(m.categories.map((c) => c.body.category), ['privat', 'sonstiges'])
})

test('assignModel: Vorgemerkt (PDNG) nur Kategorien und Fixkosten, mit Hinweis', () => {
  assert.equal(PENDING_ASSIGN_HINT, 'Vorgemerkte Buchungen können erst nach der Buchung einer Rechnung zugeordnet werden.')
  const incoming = assignModel(TX({ status: 'PDNG', amountCents: 5000, vorschlaege: [SUG_INV()] }), { invoices: [OPEN()] })
  assert.equal(incoming.pending, true)
  assert.equal(incoming.hint, PENDING_ASSIGN_HINT)
  assert.deepEqual(incoming.suggestions, [])
  assert.deepEqual(incoming.invoices, [])
  assert.ok(incoming.categories.length > 0)
  assert.ok(!Object.keys(incoming.byKey).some((k) => k.startsWith('invoice:') || k.startsWith('payout:')))
  const outgoing = assignModel(TX({ status: 'PDNG', amountCents: -300 }), { fixedCosts: [{ $id: 'f1', name: 'X', amountCents: 300, interval: 'monat' }] })
  assert.deepEqual(outgoing.fixedCosts.map((f) => f.key), ['fixedCost:f1'])
})

test('assignModel: zugeordnete Buchung zeigt nur die Zuordnung; Rechnung nicht lösbar', () => {
  const privat = assignModel(TX({ category: 'privat' }), { invoices: [OPEN()] })
  assert.equal(privat.assigned, true)
  assert.equal(privat.currentText, 'Privat/Umbuchung')
  assert.equal(privat.canUnassign, true)
  assert.deepEqual(privat.byKey, {})
  assert.equal(privat.categories.length, 0)
  const rg = assignModel(TX({ category: 'rechnung', matchedInvoiceNumber: 'WK-0005' }))
  assert.equal(rg.currentText, 'Rechnung WK-0005')
  assert.equal(rg.canUnassign, false)
  const none = assignModel(null)
  assert.equal(none.assigned, false)
})

test('assignBody und invoiceAssignConfirmText', () => {
  assert.deepEqual(assignBody({ body: { invoiceId: 'in_1' } }, ''), { invoiceId: 'in_1' })
  assert.deepEqual(assignBody({ body: { category: 'privat' } }, '  Miete privat  '), { category: 'privat', note: 'Miete privat' })
  assert.deepEqual(assignBody(null, 'x'), { note: 'x' })
  assert.equal(invoiceAssignConfirmText('WK-0005'), 'Die Rechnung WK-0005 wird in Stripe als bezahlt markiert. Das lässt sich nicht rückgängig machen.')
})

test('customerInvoicesGate: fester Kunde mit E-Mail darf, alle anderen bekommen Grund und Hinweis', () => {
  assert.deepEqual(customerInvoicesGate({ $id: 'c1', name: 'A', email: 'a@example.invalid', customerStatus: 'customer' }), { ok: true })
  // Bestandsdaten ohne Status zählen als fester Kunde
  assert.deepEqual(customerInvoicesGate({ $id: 'c1', name: 'A', email: 'a@example.invalid' }), { ok: true })

  const lead = customerInvoicesGate({ name: 'A', email: 'a@example.invalid', customerStatus: 'lead' })
  assert.equal(lead.ok, false)
  assert.equal(lead.title, 'Noch ein Lead')
  assert.equal(lead.hint, 'Erst zum festen Kunden machen (vollständige Daten nötig), dann sind Rechnungen möglich.')
  // Lead ohne E-Mail: der Lead-Hinweis hat Vorrang
  assert.equal(customerInvoicesGate({ name: 'A', email: '', customerStatus: 'LEAD' }).title, 'Noch ein Lead')

  const lost = customerInvoicesGate({ name: 'A', email: 'a@example.invalid', customerStatus: 'lost' })
  assert.deepEqual(lost, { ok: false, title: 'Noch kein fester Kunde', hint: 'Rechnungen gibt es nur für feste Kunden.' })

  const noMail = customerInvoicesGate({ name: 'A', email: '  ', customerStatus: 'customer' })
  assert.equal(noMail.ok, false)
  assert.equal(noMail.title, 'E-Mail fehlt')
  assert.match(noMail.hint, /E-Mail-Adresse in den Stammdaten/)

  const none = customerInvoicesGate(null)
  assert.equal(none.ok, false)
  assert.equal(none.title, 'Kein Kunde ausgewählt')
  assert.equal(none.hint, '')
})

test('addressComplete: Straße, PLZ und Ort müssen alle gefüllt sein', () => {
  const full = { street: 'Hauptstr. 1', postalCode: '10115', city: 'Berlin' }
  assert.equal(addressComplete(full), true)
  assert.equal(addressComplete({ ...full, street: '' }), false)
  assert.equal(addressComplete({ ...full, postalCode: '   ' }), false)
  assert.equal(addressComplete({ ...full, city: undefined }), false)
  assert.equal(addressComplete({ ...full, city: null }), false)
  assert.equal(addressComplete({}), false)
  assert.equal(addressComplete(null), false)
  // Land allein macht keine Anschrift
  assert.equal(addressComplete({ country: 'Deutschland' }), false)
})

test('invoiceSendGate: Senden nur gesperrt bei fehlender Anschrift UND Summe über 250 €', () => {
  assert.equal(SMALL_INVOICE_MAX_CENTS, 25000)
  assert.equal(ADDRESS_INCOMPLETE_TEXT, 'Adresse des Kunden unvollständig (Straße, PLZ, Ort). Für den Versand bitte zuerst ergänzen.')
  const open = { street: '', postalCode: '10115', city: 'Berlin' }
  const full = { street: 'Hauptstr. 1', postalCode: '10115', city: 'Berlin' }

  // unvollständig + über 250 €: Warnung, Senden gesperrt
  assert.deepEqual(invoiceSendGate(open, 25001), { warn: true, sendAllowed: false, text: ADDRESS_INCOMPLETE_TEXT })
  assert.deepEqual(invoiceSendGate(open, 120050), { warn: true, sendAllowed: false, text: ADDRESS_INCOMPLETE_TEXT })
  // genau 250,00 € und darunter: Kleinbetragsrechnung, Warnung ja, Senden erlaubt
  assert.deepEqual(invoiceSendGate(open, 25000), { warn: true, sendAllowed: true, text: ADDRESS_INCOMPLETE_TEXT })
  assert.deepEqual(invoiceSendGate(open, 0), { warn: true, sendAllowed: true, text: ADDRESS_INCOMPLETE_TEXT })
  // vollständige Anschrift: nie eine Sperre
  assert.deepEqual(invoiceSendGate(full, 99999999), { warn: false, sendAllowed: true, text: '' })
  // unbekannte Summe gilt nicht als klein
  assert.equal(invoiceSendGate(open, null).sendAllowed, false)
  assert.equal(invoiceSendGate(open, undefined).sendAllowed, false)
  // noch kein Kunde gewählt: weder Warnung noch Sperre (die Formularprüfung meldet das)
  assert.deepEqual(invoiceSendGate(null, 99999), { warn: false, sendAllowed: true, text: '' })
})
