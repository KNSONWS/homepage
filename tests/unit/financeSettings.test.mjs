import test from 'node:test'
import assert from 'node:assert/strict'
import { loadModule } from './load.mjs'

const {
  SETTINGS_LIMITS,
  BANK_DETAILS_EXAMPLE,
  FIXED_COST_DELETE_CONFIRM,
  SETTINGS_FIELD_ORDER,
  FIXED_COST_FIELD_ORDER,
  INTERVAL_OPTIONS,
  apiErrorMessage,
  euroField,
  bankDetailsLength,
  settingsToForm,
  validateSettingsForm,
  emptyFixedCostForm,
  fixedCostToForm,
  validateFixedCostForm,
  fixedCostRows,
  dateTimeDe,
  bankCardModel,
  refreshResultMessage,
} = await loadModule('src/lib/financeSettings.js')

const NOW = Date.parse('2026-10-01T13:55:21.691Z') // 15:55 Berliner Zeit

test('Konstanten: Texte und Grenzen wie im Brief', () => {
  assert.equal(FIXED_COST_DELETE_CONFIRM, 'Position wirklich löschen? Bereits zugeordnete Buchungen behalten den Verweis. Besser auf inaktiv setzen.')
  assert.equal(BANK_DETAILS_EXAMPLE, 'Bankverbindung: WEBklar GbR · IBAN DE.. · BIC ..')
  assert.equal(SETTINGS_LIMITS.maxPercent, 60)
  assert.equal(SETTINGS_LIMITS.maxBankDetails, 500)
  assert.deepEqual(INTERVAL_OPTIONS, [
    { value: 'monat', label: 'monatlich' },
    { value: 'quartal', label: 'vierteljährlich' },
    { value: 'jahr', label: 'jährlich' },
  ])
})

test('euroField: Cent -> Eingabetext ohne Euro-Zeichen, rundläufig mit parseEuro', () => {
  assert.equal(euroField(123456), '1.234,56')
  assert.equal(euroField(0), '0,00')
  assert.equal(euroField(2000), '20,00')
  assert.equal(euroField(100000000), '1.000.000,00')
  assert.equal(euroField(null), '')
  assert.equal(euroField(undefined), '')
  assert.equal(euroField('5'), '')
})

test('apiErrorMessage: entfernt den technischen Feldnamen, sonst unverändert', () => {
  assert.equal(
    apiErrorMessage(new Error('minBufferCents: Der Mindestpuffer muss eine ganze Zahl von 0 bis 100.000.000 Cent sein.')),
    'Der Mindestpuffer muss eine ganze Zahl von 0 bis 100.000.000 Cent sein.'
  )
  assert.equal(apiErrorMessage(new Error('counterpartyMatch: Der Suchbegriff muss ein Text sein.')), 'Der Suchbegriff muss ein Text sein.')
  assert.equal(apiErrorMessage(new Error('Fixkosten-Position nicht gefunden.')), 'Fixkosten-Position nicht gefunden.')
  assert.equal(apiErrorMessage(new Error('Bitte in 5 Minuten erneut versuchen.')), 'Bitte in 5 Minuten erneut versuchen.')
  assert.equal(apiErrorMessage(new Error('Das Kundenportal ist gerade nicht erreichbar.')), 'Das Kundenportal ist gerade nicht erreichbar.')
  assert.equal(apiErrorMessage(null), 'Das Speichern ist fehlgeschlagen.')
  assert.equal(apiErrorMessage(new Error('  ')), 'Das Speichern ist fehlgeschlagen.')
  assert.equal(apiErrorMessage({}, 'Anders.'), 'Anders.')
})

test('settingsToForm: Cent -> Euro-Texte, null Vorjahresumsatz -> leer', () => {
  assert.deepEqual(
    settingsToForm({ minBufferCents: 2000, taxReservePercent: 30, previousYearRevenueCents: null, estPrepaymentCents: 0, bankDetailsText: 'IBAN DE00' }),
    { minBuffer: '20,00', taxReservePercent: '30', previousYearRevenue: '', estPrepayment: '0,00', bankDetailsText: 'IBAN DE00' }
  )
  assert.equal(settingsToForm({ previousYearRevenueCents: 1500000 }).previousYearRevenue, '15.000,00')
  assert.deepEqual(settingsToForm(null), { minBuffer: '', taxReservePercent: '', previousYearRevenue: '', estPrepayment: '', bankDetailsText: '' })
})

test('validateSettingsForm: gültiges Formular -> PATCH-Körper in Cent', () => {
  const r = validateSettingsForm({ minBuffer: '1.234,56', taxReservePercent: '30', previousYearRevenue: '', estPrepayment: '0', bankDetailsText: '  Bankverbindung: X  ' })
  assert.deepEqual(r, {
    ok: true,
    payload: { minBufferCents: 123456, taxReservePercent: 30, previousYearRevenueCents: null, estPrepaymentCents: 0, bankDetailsText: 'Bankverbindung: X' },
  })
  // Vorjahresumsatz gesetzt; 0 für Mindestpuffer; Rücklage 0 und 60 sind erlaubt; "30 %" ebenfalls
  const edge = validateSettingsForm({ minBuffer: '0', taxReservePercent: '60', previousYearRevenue: '15.000,00 €', estPrepayment: '1.250,50', bankDetailsText: '' })
  assert.deepEqual(edge.payload, { minBufferCents: 0, taxReservePercent: 60, previousYearRevenueCents: 1500000, estPrepaymentCents: 125050, bankDetailsText: '' })
  assert.equal(validateSettingsForm({ minBuffer: '0', taxReservePercent: '0', previousYearRevenue: '0', estPrepayment: '0', bankDetailsText: '' }).payload.taxReservePercent, 0)
  assert.equal(validateSettingsForm({ minBuffer: '0', taxReservePercent: '30 %', previousYearRevenue: '', estPrepayment: '0', bankDetailsText: '' }).payload.taxReservePercent, 30)
  // Vorjahresumsatz 0 ist ein Wert, nicht „leer“
  assert.equal(validateSettingsForm({ minBuffer: '0', taxReservePercent: '30', previousYearRevenue: '0,00', estPrepayment: '0', bankDetailsText: '' }).payload.previousYearRevenueCents, 0)
})

test('validateSettingsForm: Fehler je Feld, alle auf einmal, nichts wird gesendet', () => {
  const r = validateSettingsForm({ minBuffer: '', taxReservePercent: '61', previousYearRevenue: '12.50', estPrepayment: 'abc', bankDetailsText: 'x'.repeat(501) })
  assert.equal(r.ok, false)
  assert.equal(r.payload, undefined)
  assert.equal(r.errors.minBuffer, 'Bitte einen Betrag eingeben (0 ist möglich).')
  assert.equal(r.errors.taxReservePercent, 'Die Rücklage muss eine ganze Zahl von 0 bis 60 sein.')
  assert.equal(r.errors.previousYearRevenue, 'Ungültiger Betrag. Bitte einen Betrag wie 1.234,56 eingeben.')
  assert.equal(r.errors.estPrepayment, 'Ungültiger Betrag. Bitte einen Betrag wie 1.234,56 eingeben.')
  assert.equal(r.errors.bankDetailsText, 'Der Text darf höchstens 500 Zeichen lang sein (aktuell 501).')
  assert.deepEqual(Object.keys(r.errors).sort(), [...SETTINGS_FIELD_ORDER].sort())
})

test('validateSettingsForm: Prozent nur ganze Zahlen 0 bis 60; Grenzen für Mindestpuffer und Text', () => {
  const base = { minBuffer: '0', previousYearRevenue: '', estPrepayment: '0', bankDetailsText: '' }
  for (const bad of ['', ' ', '-1', '30,5', '30.5', '6a', '061x', '1000', 'dreißig']) {
    assert.equal(validateSettingsForm({ ...base, taxReservePercent: bad }).ok, false, `Prozent „${bad}“`)
  }
  for (const good of ['0', '1', '59', '60', '030']) {
    assert.equal(validateSettingsForm({ ...base, taxReservePercent: good }).ok, true, `Prozent „${good}“`)
  }
  assert.equal(validateSettingsForm({ ...base, taxReservePercent: '30', minBuffer: '1.000.000,00' }).ok, true)
  const over = validateSettingsForm({ ...base, taxReservePercent: '30', minBuffer: '1.000.000,01' })
  assert.equal(over.errors.minBuffer, 'Der Mindestpuffer darf höchstens 1.000.000,00 € betragen.')
  assert.equal(validateSettingsForm({ ...base, taxReservePercent: '30', minBuffer: '-5' }).ok, false)
  // Text: genau 500 gespeicherte Zeichen sind erlaubt, Leerraum am Rand zählt nicht
  assert.equal(validateSettingsForm({ ...base, taxReservePercent: '30', bankDetailsText: `  ${'x'.repeat(500)}  ` }).ok, true)
  assert.equal(validateSettingsForm({ ...base, taxReservePercent: '30', bankDetailsText: 'x'.repeat(501) }).ok, false)
  assert.equal(validateSettingsForm(null).ok, false)
})

test('bankDetailsLength: zählt ohne Leerraum am Rand', () => {
  assert.equal(bankDetailsLength('  abc '), 3)
  assert.equal(bankDetailsLength(''), 0)
  assert.equal(bankDetailsLength(null), 0)
  assert.equal(bankDetailsLength('a\nb'), 3)
})

test('emptyFixedCostForm und fixedCostToForm', () => {
  assert.deepEqual(emptyFixedCostForm(), { name: '', amount: '', interval: 'monat', nextDate: '', counterpartyMatch: '' })
  assert.deepEqual(
    fixedCostToForm({ $id: 'f1', name: 'Hetzner', amountCents: 1000, interval: 'quartal', nextDate: '2026-11-01', counterpartyMatch: 'hetzner', active: true }),
    { name: 'Hetzner', amount: '10,00', interval: 'quartal', nextDate: '2026-11-01', counterpartyMatch: 'hetzner' }
  )
  // unbekannter Rhythmus fällt auf monatlich
  assert.equal(fixedCostToForm({ interval: 'woche' }).interval, 'monat')
  assert.deepEqual(fixedCostToForm(null), emptyFixedCostForm())
})

test('validateFixedCostForm: gültig -> Körper in Cent, Suchbegriff getrimmt', () => {
  const r = validateFixedCostForm({ name: ' Hetzner ', amount: '49,90', interval: 'monat', nextDate: '2026-11-01', counterpartyMatch: ' Hetzner ' })
  assert.deepEqual(r, { ok: true, payload: { name: 'Hetzner', amountCents: 4990, interval: 'monat', nextDate: '2026-11-01', counterpartyMatch: 'Hetzner' } })
  assert.equal(validateFixedCostForm({ name: 'X', amount: '1.200', interval: 'jahr', nextDate: '2028-02-29', counterpartyMatch: '' }).payload.amountCents, 120000)
  assert.equal(validateFixedCostForm({ name: 'X', amount: '0,01', interval: 'jahr', nextDate: '2028-02-29', counterpartyMatch: '' }).ok, true)
})

test('validateFixedCostForm: Fehler je Feld', () => {
  const r = validateFixedCostForm({ name: ' ', amount: '0', interval: 'woche', nextDate: '2026-02-30', counterpartyMatch: 'x'.repeat(121) })
  assert.equal(r.ok, false)
  assert.equal(r.errors.name, 'Bitte einen Namen eingeben (höchstens 120 Zeichen).')
  assert.equal(r.errors.amount, 'Der Betrag muss größer als 0 sein (z. B. 49,90).')
  assert.equal(r.errors.interval, 'Bitte einen Rhythmus wählen.')
  assert.equal(r.errors.nextDate, 'Bitte ein gültiges Datum wählen.')
  assert.equal(r.errors.counterpartyMatch, 'Der Suchbegriff darf höchstens 120 Zeichen lang sein.')
  assert.deepEqual(Object.keys(r.errors).sort(), [...FIXED_COST_FIELD_ORDER].sort())

  const empty = validateFixedCostForm(emptyFixedCostForm())
  assert.equal(empty.errors.amount, 'Bitte einen Betrag eingeben.')
  assert.equal(empty.errors.nextDate, 'Bitte ein gültiges Datum wählen.')
  assert.equal(validateFixedCostForm({ name: 'X', amount: '12.50', interval: 'monat', nextDate: '2026-11-01', counterpartyMatch: '' }).errors.amount, 'Ungültiger Betrag. Bitte einen Betrag wie 1.234,56 eingeben.')
  assert.equal(validateFixedCostForm({ name: 'X'.repeat(121), amount: '1', interval: 'monat', nextDate: '2026-11-01', counterpartyMatch: '' }).ok, false)
  // ein Datum mit Uhrzeit oder anderem Format ist kein Termin
  for (const bad of ['01.11.2026', '2026-11-01T00:00:00Z', '2026-1-1', '']) {
    assert.equal(validateFixedCostForm({ name: 'X', amount: '1', interval: 'monat', nextDate: bad, counterpartyMatch: '' }).ok, false, bad)
  }
  assert.equal(validateFixedCostForm(null).ok, false)
})

test('fixedCostRows: aktive zuerst, Texte de-DE, Schalter-Beschriftung', () => {
  const rows = fixedCostRows([
    { $id: 'f2', name: 'Altlast', amountCents: 500, interval: 'jahr', nextDate: '2027-01-01', counterpartyMatch: 'x', active: false },
    { $id: 'f1', name: 'Hetzner', amountCents: 123456, interval: 'monat', nextDate: '2026-11-01', counterpartyMatch: '', active: true },
    { $id: 'f3', name: 'Domain', amountCents: 1200, interval: 'quartal', nextDate: '2026-12-15', active: true },
    null,
  ])
  assert.deepEqual(rows.map((r) => r.id), ['f1', 'f3', 'f2'])
  assert.deepEqual(rows[0], {
    key: 'f1',
    id: 'f1',
    name: 'Hetzner',
    amountText: '1.234,56 €',
    intervalText: 'monatlich',
    nextDateText: '01.11.2026',
    matchText: '',
    metaText: 'monatlich · nächster Termin 01.11.2026',
    active: true,
    statusLabel: 'Aktiv',
    toggleLabel: 'Auf inaktiv setzen',
  })
  assert.equal(rows[1].intervalText, 'vierteljährlich')
  assert.equal(rows[2].statusLabel, 'Inaktiv')
  assert.equal(rows[2].toggleLabel, 'Aktivieren')
  assert.equal(rows[2].matchText, 'x')
  assert.equal(rows[2].metaText, 'jährlich · nächster Termin 01.01.2027 · Suchbegriff „x“')
  assert.equal(rows[1].metaText, 'vierteljährlich · nächster Termin 15.12.2026')
  assert.deepEqual(fixedCostRows(null), [])
  assert.deepEqual(fixedCostRows('x'), [])
  // kaputte Werte werden zu Platzhaltern, nicht zu Fehlern
  const odd = fixedCostRows([{ $id: 'f9' }])[0]
  assert.equal(odd.name, 'Ohne Namen')
  assert.equal(odd.amountText, '–')
  assert.equal(odd.intervalText, '–')
  assert.equal(odd.nextDateText, '–')
  assert.equal(odd.metaText, '– · nächster Termin –')
})

test('dateTimeDe: Berliner Zeit, 24 Stunden', () => {
  assert.equal(dateTimeDe('2026-10-01T10:55:21.691Z'), '01.10.2026, 12:55 Uhr')
  assert.equal(dateTimeDe('2026-01-15T23:30:00.000Z'), '16.01.2026, 00:30 Uhr')
  assert.equal(dateTimeDe(''), '–')
  assert.equal(dateTimeDe('kaputt'), '–')
  assert.equal(dateTimeDe(null), '–')
})

const BANK = (over = {}) => ({
  status: 'aktiv',
  ibanMasked: 'DE00 •••• 9313',
  validUntil: '2099-03-29T00:00:00.000Z',
  lastSyncAt: '2026-10-01T10:55:21.691Z',
  lastSyncOk: true,
  lastError: '',
  ...over,
})

test('bankCardModel: ohne Verbindung nur „Bank verbinden“', () => {
  for (const none of [null, undefined, 'x']) {
    const m = bankCardModel(none, NOW)
    assert.equal(m.connected, false)
    assert.equal(m.statusLabel, 'Nicht verbunden')
    assert.equal(m.canRefresh, false)
    assert.equal(m.connectLabel, 'Bank verbinden')
    assert.deepEqual(m.rows, [])
    assert.equal(m.error, '')
  }
})

test('bankCardModel: verbunden zeigt IBAN, Gültigkeit und letzten Abruf', () => {
  const m = bankCardModel(BANK(), NOW)
  assert.equal(m.connected, true)
  assert.equal(m.statusLabel, 'Verbunden')
  assert.equal(m.tone, 'ok')
  assert.deepEqual(m.rows, [
    { key: 'iban', label: 'IBAN', text: 'DE00 •••• 9313' },
    { key: 'valid', label: 'Zugang gültig bis', text: '29.03.2099' },
    { key: 'sync', label: 'Letzter Abruf', text: '01.10.2026, 12:55 Uhr · vor 3 Std.' },
  ])
  assert.equal(m.error, '')
  assert.equal(m.canRefresh, true)
  assert.equal(m.connectLabel, 'Neu verbinden')
  assert.equal(m.hint, '')
})

test('bankCardModel: Fehler, abgelaufen, noch kein Abruf', () => {
  const failed = bankCardModel(BANK({ lastSyncOk: false, lastError: 'Bank antwortet nicht' }), NOW)
  assert.equal(failed.statusLabel, 'Abruf fehlgeschlagen')
  assert.equal(failed.tone, 'warn')
  assert.equal(failed.error, 'Bank antwortet nicht')
  assert.equal(failed.canRefresh, true)
  // Abruf gescheitert, aber der Server nennt keinen Text
  assert.equal(bankCardModel(BANK({ lastSyncOk: false, lastError: '' }), NOW).error, 'Der letzte Abruf ist fehlgeschlagen.')
  assert.equal(bankCardModel(BANK({ status: 'fehler', lastSyncOk: true }), NOW).statusLabel, 'Abruf fehlgeschlagen')

  // abgelaufen (Datum oder Status): Abruf gesperrt, nur neu verbinden
  const expired = bankCardModel(BANK({ validUntil: '2026-09-30T00:00:00.000Z' }), NOW)
  assert.equal(expired.statusLabel, 'Zugang abgelaufen')
  assert.equal(expired.tone, 'danger')
  assert.equal(expired.canRefresh, false)
  assert.equal(expired.hint, 'Der Zugang ist abgelaufen. Bitte neu verbinden.')
  assert.equal(bankCardModel(BANK({ status: 'abgelaufen' }), NOW).canRefresh, false)
  // am letzten Gültigkeitstag selbst noch nutzbar
  assert.equal(bankCardModel(BANK({ validUntil: '2026-10-01T00:00:00.000Z' }), NOW).statusLabel, 'Verbunden')
  // abgelaufen hat Vorrang vor Fehler
  assert.equal(bankCardModel(BANK({ validUntil: '2026-01-01T00:00:00.000Z', lastSyncOk: false }), NOW).statusLabel, 'Zugang abgelaufen')

  const fresh = bankCardModel(BANK({ lastSyncAt: '' }), NOW)
  assert.equal(fresh.rows[2].text, 'noch kein Abruf')
  const sparse = bankCardModel({ status: 'wartet' }, NOW)
  assert.equal(sparse.statusLabel, 'wartet')
  assert.equal(sparse.rows[0].text, '–')
  assert.equal(sparse.rows[1].text, '–')
})

test('refreshResultMessage: Ergebnis des Abrufs', () => {
  assert.deepEqual(refreshResultMessage({ ok: true, neu: 3, aktualisiert: 1, geloescht: 0 }), { tone: 'ok', text: 'Abruf abgeschlossen: 3 neu, 1 aktualisiert.' })
  assert.deepEqual(refreshResultMessage({ ok: true, neu: 0, aktualisiert: 0, geloescht: 2 }), { tone: 'ok', text: 'Abruf abgeschlossen: 2 entfernt.' })
  assert.deepEqual(refreshResultMessage({ ok: true, neu: 0, aktualisiert: 0, geloescht: 0 }), { tone: 'ok', text: 'Abruf abgeschlossen, keine neuen Buchungen.' })
  assert.deepEqual(refreshResultMessage({ ok: false, error: 'Bank antwortet nicht' }), { tone: 'warn', text: 'Abruf fehlgeschlagen: Bank antwortet nicht' })
  assert.deepEqual(refreshResultMessage({ ok: false }), { tone: 'warn', text: 'Abruf fehlgeschlagen.' })
  assert.equal(refreshResultMessage(null).tone, 'ok')
})
