// Reine Darstellungs-Helfer fuer die Bloecke der Finanzen-Seite (Status, Liquiditaet, Aufgaben, Vorschau, Steuer, Abos,
// Rechnungen, Buchungen, Zuordnen) (kein React, kein Appwrite, unter Node testbar). Beträge sind Cent, Texte deutsch.
import {
  AGE_GROUP_LABEL,
  CATEGORY_LABEL,
  INTERVAL_LABEL,
  INVOICE_STATUS,
  canInvoice,
  dateDe,
  euro,
  euroWhole,
  nextIntervalDate,
  parseEuro,
  percentDe,
  signedEuro,
  sinceLabel,
  ymdBerlin,
  URGENCY,
} from './financeFormat'

const isNum = (v) => typeof v === 'number' && Number.isFinite(v)
const text = (v) => (typeof v === 'string' ? v.trim() : '')

/** Id des Rechnungsblocks (Task 5): Ziel für „Zu den Rechnungen“. */
export const INVOICES_ANCHOR = 'finanzen-rechnungen'
/** Wie viele Aufgaben ohne „Alle anzeigen“ sichtbar sind. */
export const TODO_LIMIT = 7

// --- Statuszeile (Block 0) ---------------------------------------------------------------------------------

/**
 * Bank-Teil der Statuszeile: { ok, text }. ok=false zeigt eine Warnung (Text steht immer dabei).
 * Normal: „Bank: Stand vor 3 Std. · jüngste Buchung 29.09.2026 · Zugang bis 29.03.2027“.
 */
export function bankStatus(bank, now = Date.now()) {
  if (!bank || typeof bank !== 'object') return { ok: false, text: 'Bank: nicht verbunden' }

  const until = dateDe(bank.validUntil)
  const untilKnown = until !== '–'
  const validDay = ymdBerlin(bank.validUntil)
  const today = ymdBerlin(now)
  const expired = bank.status === 'abgelaufen' || (validDay !== null && today !== null && validDay < today)
  if (expired) return { ok: false, text: `Bank: Zugang abgelaufen${untilKnown ? ` am ${until}` : ''}` }

  const parts = []
  if (bank.lastSyncOk === false || bank.status === 'fehler') {
    const error = text(bank.lastError)
    parts.push(`Abruf fehlgeschlagen${error ? `: ${error}` : ''}`)
    if (untilKnown) parts.push(`Zugang bis ${until}`)
    return { ok: false, text: `Bank: ${parts.join(' · ')}` }
  }

  parts.push(text(bank.lastSyncAt) ? `Stand ${sinceLabel(bank.lastSyncAt, now)}` : 'noch kein Abruf')
  if (text(bank.latestBookingDate)) parts.push(`jüngste Buchung ${dateDe(bank.latestBookingDate)}`)
  if (untilKnown) parts.push(`Zugang bis ${until}`)
  return { ok: true, text: `Bank: ${parts.join(' · ')}` }
}

/** Stripe-Teil der Statuszeile: { ok, text }; bei Ausfall mit dem Text des Servers. */
export function stripeStatus(stripe, now = Date.now()) {
  if (!stripe || typeof stripe !== 'object') return { ok: true, text: 'Stripe: Stand unbekannt' }
  if (stripe.ok === false) {
    return {
      ok: false,
      text: `Stripe: Abruf fehlgeschlagen: ${text(stripe.fehler) || 'Stripe ist gerade nicht erreichbar.'}`,
    }
  }
  const since = text(stripe.abgerufenUm) ? sinceLabel(stripe.abgerufenUm, now) : '–'
  return { ok: true, text: `Stripe: Stand ${since === '–' ? 'unbekannt' : since}` }
}

/** [{ key, ok, text }] für Bank und Stripe. */
export function statusItems(stand, now = Date.now()) {
  const s = stand && typeof stand === 'object' ? stand : {}
  return [
    { key: 'bank', ...bankStatus(s.bank, now) },
    { key: 'stripe', ...stripeStatus(s.stripe, now) },
  ]
}

// --- Liquiditätskopf (Block 1) -----------------------------------------------------------------------------

/**
 * Aufschlüsselung „Verfügbar nach Rücklagen“ als Zeilen { key, label, text, total }:
 * Kontostand − Steuer-Rücklage − Fixkosten 30 Tage − Mindestpuffer = Verfügbar (Beträge auf den Cent genau).
 */
export function breakdownRows(aufschluesselung, verfuegbarCents) {
  const a = aufschluesselung && typeof aufschluesselung === 'object' ? aufschluesselung : {}
  const minus = (cents) => (isNum(cents) ? signedEuro(-cents) : '–')
  return [
    { key: 'kontostand', label: 'Kontostand (gebucht)', text: euro(a.kontostandCents), total: false },
    { key: 'steuer', label: 'Steuer-Rücklage', text: minus(a.steuerRuecklageCents), total: false },
    { key: 'fixkosten', label: 'Fixkosten der nächsten 30 Tage', text: minus(a.fixkosten30Cents), total: false },
    { key: 'puffer', label: 'Mindestpuffer', text: minus(a.mindestpufferCents), total: false },
    { key: 'verfuegbar', label: 'Verfügbar nach Rücklagen', text: euro(verfuegbarCents), total: true },
  ]
}

/**
 * Zwei Zeilen „Tiefster Stand in 30 Tagen“: sicher und erwartet, je { key, label, amountText, dateText, negative };
 * ein Eintrag ist null, wenn der Server keinen Wert liefert (kein Kontostand).
 */
export function lowPointLines(kopf) {
  const k = kopf && typeof kopf === 'object' ? kopf : {}
  const line = (key, label, point) =>
    point && isNum(point.amountCents)
      ? { key, label, amountText: euroWhole(point.amountCents), dateText: dateDe(point.date), negative: point.amountCents < 0 }
      : null
  return [line('sicher', 'sicher', k.tiefsterSicher), line('erwartet', 'erwartet', k.tiefsterErwartet)]
}

// --- Zu erledigen (Block 2) --------------------------------------------------------------------------------

/** Nur Aufgaben (Objekte) in Serverreihenfolge; bei eingeklappter Liste höchstens `max` Stück. */
export function visibleTodos(aufgaben, expanded = false, max = TODO_LIMIT) {
  const items = Array.isArray(aufgaben) ? aufgaben.filter((t) => t && typeof t === 'object') : []
  if (expanded || items.length <= max) return { shown: items, total: items.length, hidden: 0 }
  return { shown: items.slice(0, max), total: items.length, hidden: items.length - max }
}

export function urgencyOf(todo) {
  return URGENCY[todo?.dringlichkeit] || URGENCY.info
}

/** Stabiler Schlüssel einer Aufgabe (für React und den Zustand „läuft gerade“). */
export function todoKey(todo, index = 0) {
  const a = todo?.aktion || {}
  const ref = a.transactionId || a.invoiceId || a.customerId || a.vorschlag?.key || ''
  return [index, todo?.art || '', todo?.datum || '', ref].join('|')
}

/** http(s)-Adresse oder ''; schützt vor `javascript:` und Ähnlichem aus Serverdaten. */
export function safeUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return ''
  try {
    const url = new URL(value.trim())
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : ''
  } catch {
    return ''
  }
}

/** Beschriftung des einen Knopfs einer Aufgabe; '' (kein Knopf) bei unbekannter Aktion. */
export function todoButtonLabel(todo) {
  const a = todo?.aktion
  switch (a?.typ) {
    case 'bank-verbinden':
      return 'Bank verbinden'
    case 'bank-aktualisieren':
      return 'Aktualisieren'
    case 'rechnung-oeffnen':
      return safeUrl(a.hostedUrl) ? 'Zahlungsseite öffnen' : 'Zu den Rechnungen'
    case 'zuordnen':
      return 'Zuordnen'
    case 'kunde-oeffnen':
      return 'Kunde öffnen'
    case 'fixkosten-uebernehmen':
      return 'Übernehmen'
    case 'einstellungen':
      return 'Einstellungen'
    default:
      return ''
  }
}

/**
 * Fixkosten-Vorschlag des Servers ({ key, name, amountCents, interval, lastDate }) -> Anfrage für createFixedCost
 * samt Rückfrage-Text; null, wenn der Vorschlag unvollständig ist. nextDate = lastDate + ein Rhythmus.
 */
export function fixedCostFromSuggestion(vorschlag) {
  const v = vorschlag && typeof vorschlag === 'object' ? vorschlag : {}
  const name = text(v.name)
  const nextDate = nextIntervalDate(v.lastDate, v.interval)
  if (!name || !Number.isSafeInteger(v.amountCents) || v.amountCents <= 0 || !nextDate) return null
  return {
    payload: {
      name,
      amountCents: v.amountCents,
      interval: v.interval,
      nextDate,
      counterpartyMatch: typeof v.key === 'string' ? v.key : '',
    },
    confirmText: `Als Fixkosten übernehmen: ${name}, ${euro(v.amountCents)} ${INTERVAL_LABEL[v.interval]}?`,
  }
}

const planError = (message) => ({ kind: 'error', message })

/**
 * Was ein Klick auf den Aufgaben-Knopf bewirkt (die Seite führt es aus):
 * bank-connect | bank-refresh | open-url {url} | scroll {id} | assign {transactionId} | navigate {to} |
 * fixed-cost {payload, confirmText} | error {message}.
 */
export function planTodoAction(aktion) {
  const a = aktion && typeof aktion === 'object' ? aktion : {}
  switch (a.typ) {
    case 'bank-verbinden':
      return { kind: 'bank-connect' }
    case 'bank-aktualisieren':
      return { kind: 'bank-refresh' }
    case 'rechnung-oeffnen': {
      const url = safeUrl(a.hostedUrl)
      return url ? { kind: 'open-url', url } : { kind: 'scroll', id: INVOICES_ANCHOR }
    }
    case 'zuordnen':
      return text(a.transactionId)
        ? { kind: 'assign', transactionId: a.transactionId }
        : planError('Die Buchung ist nicht bekannt.')
    case 'kunde-oeffnen':
      return text(a.customerId)
        ? { kind: 'navigate', to: `/customers/${encodeURIComponent(a.customerId)}` }
        : planError('Zu diesem Eintrag ist kein Kunde hinterlegt.')
    case 'einstellungen':
      return { kind: 'navigate', to: '/finance/einstellungen' }
    case 'fixkosten-uebernehmen': {
      const suggestion = fixedCostFromSuggestion(a.vorschlag)
      return suggestion
        ? { kind: 'fixed-cost', ...suggestion }
        : planError('Der Vorschlag ist unvollständig und kann nicht übernommen werden.')
    }
    default:
      return planError('Diese Aktion ist nicht bekannt.')
  }
}

// --- Vorschau 30 Tage (Block 3) ----------------------------------------------------------------------------

/**
 * Zeilen der Vorschau mit laufendem Saldo beider Linien, beginnend beim Kontostand: „sicher“ zählt nur die
 * sicheren Posten, „erwartet“ alle (wie buildForecast im Portal, daher passen die Tiefststände). Die Reihenfolge
 * des Servers bleibt. Ohne Kontostand (null) gibt es keine Salden (hasBalance false, Saldo-Felder null / '–').
 * Je Zeile: { key, dateText, label, sicherheit ('sicher'|'erwartet'), amountCents, amountText,
 * saldoSicherCents, saldoSicherText, saldoSicherNegative, saldoErwartetCents, saldoErwartetText, saldoErwartetNegative }.
 */
export function forecastRows(posten, kontostandCents) {
  const items = Array.isArray(posten) ? posten.filter((p) => p && typeof p === 'object' && isNum(p.amountCents)) : []
  const hasBalance = isNum(kontostandCents)
  let sicher = hasBalance ? kontostandCents : null
  let erwartet = hasBalance ? kontostandCents : null
  const rows = items.map((p, index) => {
    const sure = p.sicherheit === 'sicher'
    if (hasBalance) {
      erwartet += p.amountCents
      if (sure) sicher += p.amountCents
    }
    return {
      key: [index, p.date || '', p.label || ''].join('|'),
      dateText: dateDe(p.date),
      label: text(p.label) || 'Zahlung',
      sicherheit: sure ? 'sicher' : 'erwartet',
      amountCents: p.amountCents,
      amountText: signedEuro(p.amountCents),
      saldoSicherCents: sicher,
      saldoSicherText: euro(sicher),
      saldoSicherNegative: hasBalance && sicher < 0,
      saldoErwartetCents: erwartet,
      saldoErwartetText: euro(erwartet),
      saldoErwartetNegative: hasBalance && erwartet < 0,
    }
  })
  return { rows, hasBalance }
}

/**
 * Hinweise unter der Vorschau als [{ key, text }]: kein Kontostand (keine Salden), Stripe nicht erreichbar
 * (Rechnungen und Auszahlungen fehlen), Abos nicht geladen (Verlängerungen fehlen).
 */
export function forecastNotes({ kontostandCents, stripeDown = false, abosFehler = false, hasRows = false } = {}) {
  const notes = []
  if (hasRows && !isNum(kontostandCents)) {
    notes.push({
      key: 'kontostand',
      text: 'Ohne Kontostand zeigt die Vorschau keine Salden. Sobald die Bank verbunden und abgerufen ist, erscheinen sie hier.',
    })
  }
  if (stripeDown) {
    notes.push({
      key: 'stripe',
      text: 'Stripe war nicht erreichbar: Offene Rechnungen und Stripe-Auszahlungen fehlen in dieser Vorschau.',
    })
  }
  if (abosFehler) {
    notes.push({ key: 'abos', text: 'Abo-Verlängerungen fehlen, weil die Abos nicht geladen werden konnten.' })
  }
  return notes
}

// --- Steuer (Block 4) --------------------------------------------------------------------------------------

// Gesetzliche Werte (§ 19 UStG, § 11 GewStG) als Rückfall, falls der Server eine Grenze nicht mitschickt
const KLEIN_LIMIT_CENTS = 2_500_000
const KLEIN_HARD_LIMIT_CENTS = 10_000_000
const GEWERBE_ALLOWANCE_CENTS = 2_450_000

/** Dauerhafter Hinweis unter den Steuerwerten: die Zahlen sind Näherungen. */
export const TAX_NOTE = 'Orientierungswert, ersetzt keine Steuerberatung.'

/**
 * Texte der Steuerkarte aus `steuer`:
 * { reserve: { amountText, basisText }, small: { known, counterText, shareText, limitText, hardText, previousText },
 *   gewerbeText, prepayment: { dateText, amountText } | null, noteText }.
 * Ist der Kleinunternehmer-Zähler null (Stripe nicht erreichbar), steht „unbekannt“ statt einer Zahl.
 */
export function taxView(steuer) {
  const s = steuer && typeof steuer === 'object' ? steuer : {}
  const k = s.kleinunternehmer && typeof s.kleinunternehmer === 'object' ? s.kleinunternehmer : {}
  const year = isNum(s.jahr) ? s.jahr : null
  const limit = isNum(k.grenzeFolgejahrCents) ? k.grenzeFolgejahrCents : KLEIN_LIMIT_CENTS
  const hard = isNum(k.grenzeHartCents) ? k.grenzeHartCents : KLEIN_HARD_LIMIT_CENTS
  const known = isNum(k.jahrCents)

  const basisKnown = isNum(s.prozent) && isNum(s.gewinnCents)
  const reserve = {
    amountText: euro(s.ruecklageCents),
    basisText: basisKnown ? `${percentDe(s.prozent)} % von ${euro(s.gewinnCents)} Gewinn${year !== null ? ` ${year}` : ''}` : '',
  }

  const previous = isNum(k.vorjahrCents)
    ? `Vorjahr: ${euro(k.vorjahrCents)}${
        k.vorjahrCents > limit ? ` (über ${euroWhole(limit)}: im laufenden Jahr keine Kleinunternehmerregelung)` : ''
      }`
    : null

  const prepay = s.naechsteVorauszahlung
  const prepayment =
    prepay && typeof prepay === 'object' && isNum(prepay.amountCents)
      ? { dateText: dateDe(prepay.date), amountText: euro(prepay.amountCents) }
      : null

  return {
    reserve,
    small: {
      known,
      counterText: known ? `${euro(k.jahrCents)} von ${euroWhole(limit)}${year !== null ? ` (${year})` : ''}` : 'unbekannt (Stripe nicht erreichbar)',
      shareText:
        known && isNum(k.anteilFolgejahr)
          ? `${percentDe(k.anteilFolgejahr * 100, 1)} % der Grenze von ${euroWhole(limit)}`
          : null,
      limitText: `Über ${euroWhole(limit)} im Jahr${year !== null ? ` ${year}` : ''}: ab ${
        year !== null ? year + 1 : 'dem Folgejahr'
      } keine Kleinunternehmerregelung.`,
      hardText: `Grenze ${euroWhole(hard)}: Ab dem Umsatz, der diese Grenze übersteigt, gilt schon im laufenden Jahr die Regelbesteuerung (Umsatzsteuer).`,
      previousText: previous,
    },
    gewerbeText:
      s.gewerbesteuerHinweis === true
        ? `Der Gewinn${year !== null ? ` ${year}` : ''} liegt über dem Gewerbesteuer-Freibetrag von ${euroWhole(GEWERBE_ALLOWANCE_CENTS)} (natürliche Personen und Personengesellschaften, § 11 GewStG). Auf den übersteigenden Gewerbeertrag kann Gewerbesteuer anfallen.`
        : null,
    prepayment,
    noteText: TAX_NOTE,
  }
}

// --- Abos (Block 5) ----------------------------------------------------------------------------------------

const PRODUCT_LABEL = { hosting: 'Hosting-Abo', wartung: 'Wartungs-Abo' }
const ABO_STATUS = {
  active: { label: 'aktiv', tone: 'ok' },
  trialing: { label: 'Testphase', tone: 'info' },
  past_due: { label: 'Zahlung fehlgeschlagen', tone: 'danger' },
  unpaid: { label: 'unbezahlt', tone: 'danger' },
}
const ABOS_FAILED = 'Abos konnten nicht geladen werden.'
const has = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key)

/** Katalogname eines Abo-Schlüssels (hosting -> „Hosting-Abo“); ohne Schlüssel „Abo“, unbekannter Schlüssel bleibt stehen. */
export function productLabel(key) {
  const k = text(key)
  if (!k) return 'Abo'
  return has(PRODUCT_LABEL, k) ? PRODUCT_LABEL[k] : k
}

/** Stripe-Status eines Abos -> { label, tone }; der Text steht immer dabei, nicht nur die Farbe. */
export function aboStatus(status) {
  const s = text(status)
  if (has(ABO_STATUS, s)) return ABO_STATUS[s]
  return { label: s || 'unbekannt', tone: 'muted' }
}

/**
 * Texte der Abo-Karte: { error, monthlyText, payingText, atRiskText (null bis auf > 0), rows }.
 * `fehler` (Abos nicht ladbar) gibt den Text des Servers und keine Zahlen. rows: { key, customer, product,
 * statusLabel, tone, amountText, nextText } in Serverreihenfolge (Zahlungsprobleme zuerst).
 */
export function aboView(abos) {
  const a = abos && typeof abos === 'object' ? abos : {}
  if (a.fehler) {
    return { error: text(a.fehler) || ABOS_FAILED, monthlyText: '–', payingText: '–', atRiskText: null, rows: [] }
  }
  const list = Array.isArray(a.liste) ? a.liste.filter((x) => x && typeof x === 'object') : []
  return {
    error: '',
    monthlyText: euro(a.monatlichCents),
    payingText: isNum(a.zahlendeKunden) ? String(a.zahlendeKunden) : '–',
    atRiskText: isNum(a.gefaehrdetCents) && a.gefaehrdetCents > 0 ? euro(a.gefaehrdetCents) : null,
    rows: list.map((abo, index) => {
      const status = aboStatus(abo.status)
      return {
        key: [index, abo.customerId || '', abo.produkt || ''].join('|'),
        customer: text(abo.kunde) || 'Unbekannter Kunde',
        product: productLabel(abo.produkt),
        statusLabel: status.label,
        tone: status.tone,
        amountText: euro(abo.betragCents),
        nextText: dateDe(abo.naechsteAbbuchung),
      }
    }),
  }
}

// --- Rechnungen (Block 6) ----------------------------------------------------------------------------------

/**
 * Filter über der Rechnungsliste. `statuses` sind die API-Status, die der Filter abruft: „Offen“ zeigt offene UND
 * überfällige Rechnungen (zwei Abrufe, zusammengeführt), alle anderen genau ihren Status. Standard ist „Offen“.
 */
export const INVOICE_FILTERS = [
  { key: 'offen', label: 'Offen', statuses: ['offen', 'ueberfaellig'] },
  { key: 'ueberfaellig', label: 'Überfällig', statuses: ['ueberfaellig'] },
  { key: 'bezahlt', label: 'Bezahlt', statuses: ['bezahlt'] },
  { key: 'entwurf', label: 'Entwürfe', statuses: ['entwurf'] },
  { key: 'alle', label: 'Alle', statuses: ['alle'] },
]
export const DEFAULT_INVOICE_FILTER = 'offen'

/** API-Status, die ein Filter abruft (unbekannter Filter = alle). */
export function invoiceFilterStatuses(filterKey) {
  const filter = INVOICE_FILTERS.find((f) => f.key === filterKey)
  return filter ? [...filter.statuses] : ['alle']
}

/**
 * Mehrere Antwortlisten (je Status eine) zu einer Liste: neueste zuerst nach Rechnungsdatum, gleiche Tage behalten
 * die Reihenfolge der Listen; eine Rechnung, die in mehreren vorkommt, nur einmal.
 */
export function mergeInvoiceLists(lists) {
  const seen = new Set()
  const all = []
  for (const list of Array.isArray(lists) ? lists : []) {
    for (const inv of Array.isArray(list) ? list : []) {
      if (!inv || typeof inv !== 'object') continue
      if (inv.id) {
        if (seen.has(inv.id)) continue
        seen.add(inv.id)
      }
      all.push(inv)
    }
  }
  return all
    .map((inv, index) => ({ inv, index }))
    .sort((a, b) => {
      const da = text(a.inv.createdDate)
      const db = text(b.inv.createdDate)
      if (da === db) return a.index - b.index
      return da < db ? 1 : -1
    })
    .map((x) => x.inv)
}

const obj = (v) => (v && typeof v === 'object' ? v : {})
const objects = (list) => (Array.isArray(list) ? list.filter((x) => x && typeof x === 'object') : [])
const OPEN_INVOICE = new Set(['offen', 'ueberfaellig'])

/**
 * Altersgruppen der offenen Rechnungen als [{ key, label, count, sumText }] in der Reihenfolge nicht fällig, 1–30,
 * 31–60, über 60 Tage (fehlende Gruppen zählen 0). Ohne Liste (kein Array) gibt es nichts anzuzeigen: [].
 */
export function ageGroupCells(altersgruppen) {
  if (!Array.isArray(altersgruppen)) return []
  return Object.keys(AGE_GROUP_LABEL).map((key) => {
    const group = obj(altersgruppen.find((g) => g && g.key === key))
    return {
      key,
      label: AGE_GROUP_LABEL[key],
      count: isNum(group.anzahl) ? group.anzahl : 0,
      sumText: euro(isNum(group.summeCents) ? group.summeCents : 0),
    }
  })
}

/**
 * Aktionen einer Rechnung als [{ key, label, url? }] (key: hosted | pdf | send | resend | void | delete):
 * Entwurf: Senden, Löschen; offen/überfällig: Zahlungsseite, PDF, Erinnerung senden, Stornieren; bezahlt: PDF.
 * Abo-Rechnungen (source 'abo') verwaltet Stripe: höchstens Zahlungsseite und PDF. Adressen nur, wenn sie
 * http(s) sind.
 */
export function invoiceActions(invoice) {
  const inv = obj(invoice)
  const abo = inv.source === 'abo'
  const hosted = safeUrl(inv.hostedUrl)
  const pdf = safeUrl(inv.pdfUrl)
  const pdfAction = pdf ? [{ key: 'pdf', label: 'PDF', url: pdf }] : []
  switch (inv.status) {
    case 'entwurf':
      return abo ? [] : [{ key: 'send', label: 'Senden' }, { key: 'delete', label: 'Löschen' }]
    case 'offen':
    case 'ueberfaellig':
      return [
        ...(hosted ? [{ key: 'hosted', label: 'Zahlungsseite', url: hosted }] : []),
        ...pdfAction,
        ...(abo ? [] : [{ key: 'resend', label: 'Erinnerung senden' }, { key: 'void', label: 'Stornieren' }]),
      ]
    default:
      return pdfAction
  }
}

/**
 * Zeilen der Rechnungstabelle (Serverreihenfolge, neueste zuerst):
 * { key, id, numberText, customerText, isAbo, createdText, dueText, totalText, remainingText, statusLabel,
 *   statusTone, statusNote, actions }. „Offen“ nur bei offen/überfällig; statusNote: „12 Tage überfällig“ bzw.
 * „am 05.08.2026 · per Überweisung“ (außerhalb von Stripe bezahlt).
 */
export function invoiceRows(invoices) {
  return objects(invoices).map((inv, index) => {
    const status = has(INVOICE_STATUS, inv.status)
      ? INVOICE_STATUS[inv.status]
      : { label: text(inv.status) || 'unbekannt', tone: 'muted' }
    let note = ''
    if (inv.status === 'ueberfaellig' && isNum(inv.overdueDays) && inv.overdueDays > 0) {
      note = `${inv.overdueDays} ${inv.overdueDays === 1 ? 'Tag' : 'Tage'} überfällig`
    } else if (inv.status === 'bezahlt') {
      note = [text(inv.paidDate) ? `am ${dateDe(inv.paidDate)}` : '', inv.outOfBand ? 'per Überweisung' : '']
        .filter(Boolean)
        .join(' · ')
    }
    return {
      key: text(inv.id) || `row-${index}`,
      id: text(inv.id),
      numberText: text(inv.number) || 'ohne Nr.',
      customerText: text(inv.customerName) || text(inv.customerEmail) || 'Unbekannter Kunde',
      isAbo: inv.source === 'abo',
      createdText: dateDe(inv.createdDate),
      dueText: dateDe(inv.dueDate),
      totalText: euro(inv.totalCents),
      remainingText: OPEN_INVOICE.has(inv.status) ? euro(inv.remainingCents) : '–',
      statusLabel: status.label,
      statusTone: status.tone,
      statusNote: note,
      actions: invoiceActions(inv),
    }
  })
}

/**
 * Rückfrage vor dem Festschreiben und Senden einer Rechnung (Dialog „Senden“ und Entwurf in der Tabelle):
 * „Rechnung für <Kunde> über <Betrag> jetzt festschreiben und an <E-Mail> senden? Danach lässt sie sich nur noch
 * stornieren.“ Fehlen Name oder E-Mail, steht dort „den Kunden“.
 */
export function invoiceSendConfirmText({ name, email, totalCents } = {}) {
  const mail = text(email)
  const who = text(name) || mail || 'den Kunden'
  return `Rechnung für ${who} über ${euro(totalCents)} jetzt festschreiben und an ${mail || 'den Kunden'} senden? Danach lässt sie sich nur noch stornieren.`
}

/**
 * Rückfrage vor dem Senden eines Entwurfs, dem Löschen eines Entwurfs, dem Stornieren und der Erinnerung; '' für
 * Aktionen ohne Rückfrage (auch „send“ bei einer Rechnung, die kein Entwurf mehr ist).
 */
export function invoiceConfirmText(actionKey, invoice) {
  const inv = obj(invoice)
  const who = text(inv.customerName) || text(inv.customerEmail) || 'den Kunden'
  const total = euro(inv.totalCents)
  const number = text(inv.number) || 'ohne Nummer'
  switch (actionKey) {
    case 'send':
      return inv.status === 'entwurf'
        ? invoiceSendConfirmText({ name: inv.customerName, email: inv.customerEmail, totalCents: inv.totalCents })
        : ''
    case 'delete':
      return `Den Entwurf für ${who} über ${total} wirklich löschen? Das lässt sich nicht rückgängig machen.`
    case 'void':
      return `Die Rechnung ${number} an ${who} über ${total} wirklich stornieren? Das lässt sich nicht rückgängig machen.`
    case 'resend':
      return `Die Rechnung ${number} jetzt noch einmal an ${text(inv.customerEmail) || who} senden (Erinnerung)?`
    default:
      return ''
  }
}

/** Erfolgsmeldung nach einer Rechnungsaktion (send | resend | void | delete | create-draft | create-send). */
export function invoiceDoneMessage(actionKey, rechnung) {
  const inv = obj(rechnung)
  const number = text(inv.number)
  const mail = text(inv.customerEmail)
  const subject = number ? `Rechnung ${number}` : 'Die Rechnung'
  const to = mail ? ` an ${mail}` : ''
  switch (actionKey) {
    case 'send':
    case 'create-send':
      return `${subject} wurde${to} gesendet.`
    case 'resend':
      return `Die Erinnerung zu ${number ? `Rechnung ${number}` : 'der Rechnung'} wurde${to} gesendet.`
    case 'void':
      return `${subject} wurde storniert.`
    case 'delete':
      return 'Der Entwurf wurde gelöscht.'
    case 'create-draft':
      return 'Der Entwurf wurde gespeichert.'
    default:
      return ''
  }
}

/** Die Rechnung besteht schon bei Stripe, der Aufruf scheiterte danach (502 mit invoiceId). */
export function isFinalizedNotSent(err) {
  return Boolean(err) && err.status === 502 && Boolean(err.invoiceId)
}

// Der Server meldet auch „gesendet, konnte aber nicht gelesen werden“ (Rechnung ist raus, nur das Nachlesen scheiterte)
const UNREADABLE = /nicht gelesen/i

/**
 * Meldung zu einem Fehler bei einer Rechnungsaktion. Bei 502 mit invoiceId (festgeschrieben, nicht versendet) der
 * feststehende Text mit der Nummer; scheiterte nur das Nachlesen, gilt die genauere Meldung des Servers.
 */
export function invoiceFailureMessage(err) {
  const message = text(err?.message) || 'Die Aktion ist fehlgeschlagen.'
  if (isFinalizedNotSent(err) && !UNREADABLE.test(message)) {
    const number = text(err.invoiceNumber)
    return `${number ? `Rechnung ${number}` : 'Die Rechnung'} wurde festgeschrieben, aber nicht versendet. Bitte in der Liste erneut senden.`
  }
  return message
}

/** Welcher Filter die bei Stripe entstandene Rechnung zeigt: mit Nummer „Offen“, sonst (Entwurf) „Entwürfe“. */
export function finalizedFilter(err) {
  return text(err?.invoiceNumber) ? 'offen' : 'entwurf'
}

// --- Rechnung schreiben (Dialog) ---------------------------------------------------------------------------

/** Grenzen der Rechnungs-API (Portal, stripeFinance.js); die Oberfläche prüft vorab, der Server entscheidet. */
export const INVOICE_LIMITS = {
  maxItems: 20,
  maxDescription: 200,
  maxQuantity: 999,
  maxUnitCents: 10_000_000,
  maxTotalCents: 99_999_999,
  maxDays: 60,
  defaultDays: 14,
  maxMemo: 1000,
}

/** Menge als Text -> ganze Zahl 1..999, sonst null. */
export function parseQuantity(value) {
  const s = text(typeof value === 'number' ? String(value) : value)
  if (!/^[0-9]{1,4}$/.test(s)) return null
  const n = Number(s)
  return n >= 1 && n <= INVOICE_LIMITS.maxQuantity ? n : null
}

/** Einzelpreis als Text („1.234,50“) -> Cent (1..100.000,00 €), sonst null. */
export function parseUnitPrice(value) {
  try {
    const cents = parseEuro(typeof value === 'string' ? value : '')
    return cents >= 1 && cents <= INVOICE_LIMITS.maxUnitCents ? cents : null
  } catch {
    return null
  }
}

/** Zeilensumme einer Position { quantity, price } (Texte) in Cent; null, wenn Menge oder Preis nicht gültig sind. */
export function lineTotalCents(item) {
  const quantity = parseQuantity(item?.quantity)
  const unit = parseUnitPrice(item?.price)
  return quantity === null || unit === null ? null : quantity * unit
}

/** Summe aller gültigen Positionen in Cent (ungültige zählen 0). */
export function invoiceTotalCents(items) {
  return objects(items).reduce((sum, item) => sum + (lineTotalCents(item) ?? 0), 0)
}

/**
 * Formular -> Anfrage. form = { customer, items: [{ description, quantity, price }], days, memo } (Texte).
 * { ok: true, payload: { customerId, items: [{ description, quantity, unitAmountCents }], daysUntilDue, memo? },
 *   totalCents } oder { ok: false, error } mit der ersten Meldung. `senden` setzt der Aufrufer.
 */
export function validateInvoiceForm(form) {
  const f = obj(form)
  const fail = (error) => ({ ok: false, error })

  if (!f.customer) return fail('Bitte einen Kunden wählen.')
  const check = canInvoice(f.customer)
  if (!check.ok) return fail(`Für ${customerName(f.customer) || 'diesen Kunden'} kann keine Rechnung geschrieben werden: ${check.reason}.`)

  const items = objects(f.items)
  if (items.length < 1 || items.length > INVOICE_LIMITS.maxItems) {
    return fail(`Eine Rechnung braucht 1 bis ${INVOICE_LIMITS.maxItems} Positionen.`)
  }
  const lines = []
  for (let i = 0; i < items.length; i += 1) {
    const label = `Position ${i + 1}`
    const description = text(items[i].description)
    if (!description) return fail(`${label}: Bitte eine Beschreibung eingeben.`)
    if (description.length > INVOICE_LIMITS.maxDescription) {
      return fail(`${label}: Die Beschreibung darf höchstens ${INVOICE_LIMITS.maxDescription} Zeichen lang sein.`)
    }
    const quantity = parseQuantity(items[i].quantity)
    if (quantity === null) return fail(`${label}: Die Menge muss eine ganze Zahl von 1 bis ${INVOICE_LIMITS.maxQuantity} sein.`)
    const unit = parseUnitPrice(items[i].price)
    if (unit === null) return fail(`${label}: Der Einzelpreis muss ein Betrag zwischen 0,01 € und 100.000,00 € sein (z. B. 120,00).`)
    lines.push({ description, quantity, unitAmountCents: unit })
  }
  const totalCents = lines.reduce((sum, line) => sum + line.quantity * line.unitAmountCents, 0)
  if (totalCents > INVOICE_LIMITS.maxTotalCents) return fail('Die Rechnungssumme ist zu hoch (höchstens 999.999,99 €).')

  const daysText = text(typeof f.days === 'number' ? String(f.days) : f.days)
  const days = /^[0-9]{1,3}$/.test(daysText) ? Number(daysText) : null
  if (days === null || days > INVOICE_LIMITS.maxDays) {
    return fail(`Das Zahlungsziel muss eine ganze Zahl von 0 bis ${INVOICE_LIMITS.maxDays} Tagen sein.`)
  }
  const memo = text(f.memo)
  if (memo.length > INVOICE_LIMITS.maxMemo) return fail(`Die Notiz darf höchstens ${INVOICE_LIMITS.maxMemo} Zeichen lang sein.`)

  const payload = { customerId: f.customer.$id, items: lines, daysUntilDue: days }
  if (memo) payload.memo = memo
  return { ok: true, payload, totalCents }
}

/** Anzeigename eines Kunden (Appwrite-Dokument): name, sonst companyName. */
export function customerName(customer) {
  return text(customer?.name) || text(customer?.companyName)
}

/**
 * Kundenauswahl: alle Kunden mit Namen als [{ id, name, label, email, ok, reason }] nach Namen sortiert (de).
 * ok/reason nach canInvoice. label ist der Text im Feld und eindeutig (bei gleichem Namen mit E-Mail ergänzt).
 */
export function customerPickerOptions(customers) {
  const named = objects(customers)
    .map((c) => ({ c, name: customerName(c) }))
    .filter((x) => x.name && text(x.c.$id))
    .sort((a, b) => a.name.localeCompare(b.name, 'de', { sensitivity: 'base' }))
  const count = new Map()
  for (const { name } of named) count.set(name.toLowerCase(), (count.get(name.toLowerCase()) || 0) + 1)
  const used = new Set()
  return named.map(({ c, name }) => {
    const email = text(c.email)
    let label = count.get(name.toLowerCase()) > 1 ? `${name} (${email || c.$id})` : name
    if (used.has(label.toLowerCase())) label = `${label} · ${String(c.$id).slice(-4)}`
    used.add(label.toLowerCase())
    const check = canInvoice(c)
    return { id: c.$id, customer: c, name, label, email, ok: check.ok, reason: check.ok ? '' : check.reason }
  })
}

/** Vorschläge für das Kundenfeld: nur Kunden mit ok, die den Text enthalten (Namensanfang zuerst), höchstens `max`. */
export function customerSuggestions(options, input, max = 12) {
  const needle = text(input).toLowerCase()
  const list = objects(options).filter((o) => o.ok)
  const hit = (o) => !needle || o.label.toLowerCase().includes(needle) || o.email.toLowerCase().includes(needle)
  const starts = list.filter((o) => hit(o) && o.label.toLowerCase().startsWith(needle))
  const rest = list.filter((o) => hit(o) && !o.label.toLowerCase().startsWith(needle))
  return [...starts, ...rest].slice(0, max).map((o) => ({ value: o.label, hint: o.email }))
}

/**
 * Was im Kundenfeld steht: { state: 'empty' | 'ok' | 'blocked' | 'unknown', option }. blocked = Kunde gefunden, aber
 * ohne Rechnung möglich (option.reason nennt den Grund); unknown = Text passt zu keinem Kunden.
 */
export function resolveCustomerText(options, input) {
  const value = text(input).toLowerCase()
  if (!value) return { state: 'empty', option: null }
  const option = objects(options).find((o) => o.label.toLowerCase() === value) || null
  if (!option) return { state: 'unknown', option: null }
  return { state: option.ok ? 'ok' : 'blocked', option }
}

/**
 * Reiter „Rechnungen“ am Kunden: { ok: true } oder { ok: false, title, hint } (Grund nach canInvoice plus ein Satz,
 * was zu tun ist). Der Reiter ist für Admins bei jedem Kunden sichtbar; ohne ok zeigt er statt der Liste diesen Hinweis.
 */
export function customerInvoicesGate(customer) {
  const check = canInvoice(customer)
  if (check.ok) return { ok: true }
  const status = text(customer?.customerStatus).toLowerCase()
  if (status === 'lead') {
    return {
      ok: false,
      title: 'Noch ein Lead',
      hint: 'Erst zum festen Kunden machen (vollständige Daten nötig), dann sind Rechnungen möglich.',
    }
  }
  if (status === 'lost') {
    return { ok: false, title: check.reason, hint: 'Rechnungen gibt es nur für feste Kunden.' }
  }
  if (customer && !text(customer.email)) {
    return {
      ok: false,
      title: check.reason,
      hint: 'Rechnungen gehen per E-Mail an den Kunden. Bitte zuerst die E-Mail-Adresse in den Stammdaten eintragen.',
    }
  }
  return { ok: false, title: check.reason, hint: '' }
}

// --- Anschrift des Rechnungsempfängers (§ 14 Abs. 4 Nr. 1 UStG) --------------------------------------------

/** Kleinbetragsrechnung (§ 33 UStDV): bis 250 € brauchen Rechnungen keine Anschrift des Empfängers. */
export const SMALL_INVOICE_MAX_CENTS = 25_000
export const ADDRESS_INCOMPLETE_TEXT =
  'Adresse des Kunden unvollständig (Straße, PLZ, Ort). Für den Versand bitte zuerst ergänzen.'

/** Hat der Kunde (Appwrite-Dokument) Straße, PLZ und Ort? Leere und nur aus Leerzeichen bestehende Felder zählen nicht. */
export function addressComplete(customer) {
  const c = obj(customer)
  return Boolean(text(c.street) && text(c.postalCode) && text(c.city))
}

/**
 * Darf diese Rechnung gesendet werden? { warn, sendAllowed, text }. warn: die Anschrift des Kunden ist unvollständig
 * (Hinweis mit `text` zeigen). sendAllowed ist nur dann false, wenn zugleich die Anschrift fehlt und die Summe über
 * 250 € liegt (genau 250,00 € ist noch eine Kleinbetragsrechnung); Entwürfe sind nie betroffen (sie haben keinen
 * Versand). Ohne Kunden gibt es keine Warnung, die Formularprüfung meldet das fehlende Feld.
 */
export function invoiceSendGate(customer, totalCents) {
  if (!customer || typeof customer !== 'object') return { warn: false, sendAllowed: true, text: '' }
  const complete = addressComplete(customer)
  const small = isNum(totalCents) && totalCents <= SMALL_INVOICE_MAX_CENTS // unbekannte Summe gilt nicht als klein
  return { warn: !complete, sendAllowed: complete || small, text: complete ? '' : ADDRESS_INCOMPLETE_TEXT }
}

// --- Buchungen (Block 7) -----------------------------------------------------------------------------------

const RANK = { hoch: 0, mittel: 1, niedrig: 2 }
const dayOf = (tx) => text(tx.bookingDate) || text(tx.valueDate)

/** Buchungen neueste zuerst (Buchungsdatum, sonst Wertstellung); gleiche Tage behalten die Reihenfolge des Servers. */
export function sortTransactions(list) {
  return objects(list)
    .map((tx, index) => ({ tx, index }))
    .sort((a, b) => {
      const da = dayOf(a.tx)
      const db = dayOf(b.tx)
      if (da === db) return a.index - b.index
      return da < db ? 1 : -1
    })
    .map((x) => x.tx)
}

/** Stärkster Vorschlag (hoch vor mittel vor niedrig, sonst Serverreihenfolge) oder null. */
export function strongestSuggestion(vorschlaege) {
  const list = objects(vorschlaege)
  let best = null
  for (const s of list) {
    if (!best || (RANK[s.confidence] ?? 9) < (RANK[best.confidence] ?? 9)) best = s
  }
  return best
}

/** „Vorschlag: Rechnung WK-0005 (hoch)“ / „Vorschlag: Stripe-Auszahlung (hoch) · Betrag weicht ab“; '' ohne Vorschlag. */
export function suggestionText(suggestion) {
  if (!suggestion || typeof suggestion !== 'object') return ''
  const what = suggestion.kind === 'payout' ? 'Stripe-Auszahlung' : `Rechnung ${text(suggestion.number) || text(suggestion.id)}`
  const level = has(RANK, suggestion.confidence) ? ` (${suggestion.confidence})` : ''
  return `Vorschlag: ${what}${level}${suggestion.amountDiffers ? ' · Betrag weicht ab' : ''}`
}

/** Text der Zuordnung: „Offen“, „Rechnung WK-0005“, „Stripe-Auszahlung“, „Fixkosten“, „Einnahme ohne Stripe-Rechnung“ … */
export function assignmentText(tx) {
  const t = obj(tx)
  const category = text(t.category)
  if (category === 'rechnung') return `Rechnung ${text(t.matchedInvoiceNumber) || text(t.matchedInvoiceId) || ''}`.trim()
  if (has(CATEGORY_LABEL, category)) return CATEGORY_LABEL[category]
  return category || CATEGORY_LABEL['']
}

/**
 * Zeilen der Buchungstabelle in der Reihenfolge von sortTransactions:
 * { key, id, tx, dateText, counterparty, remittance, amountText, incoming, pending, assignmentText, assigned, note,
 *   suggestionText (leer bei zugeordneten und vorgemerkten Buchungen), action: 'assign' | 'change' | null, actionLabel }.
 * Zuordnen für jede offene Buchung, „Ändern“ für zugeordnete außer Rechnungen (sie lassen sich nicht lösen).
 */
export function transactionRows(buchungen) {
  return sortTransactions(buchungen).map((tx, index) => {
    const category = text(tx.category)
    const assigned = Boolean(category)
    let action = null
    if (!assigned) action = 'assign'
    else if (category !== 'rechnung') action = 'change'
    return {
      key: text(tx.$id) || `tx-${index}`,
      id: text(tx.$id),
      tx,
      dateText: dateDe(dayOf(tx)),
      counterparty: text(tx.counterpartyName) || text(tx.counterpartyIban) || 'Unbekannt',
      remittance: text(tx.remittance),
      amountText: signedEuro(tx.amountCents),
      incoming: isNum(tx.amountCents) && tx.amountCents > 0,
      pending: tx.status === 'PDNG',
      assignmentText: assignmentText(tx),
      assigned,
      note: text(tx.note),
      // Vorgemerkte Buchungen lassen sich keiner Rechnung zuordnen: kein Vorschlag
      suggestionText: assigned || tx.status === 'PDNG' ? '' : suggestionText(strongestSuggestion(tx.vorschlaege)),
      action,
      actionLabel: action === 'assign' ? 'Zuordnen' : action === 'change' ? 'Ändern' : '',
    }
  })
}

// --- Zuordnen (Dialog) -------------------------------------------------------------------------------------

const NOT_OPEN_ANYMORE = 'Diese Rechnung ist nicht mehr offen.'
export const PENDING_ASSIGN_HINT = 'Vorgemerkte Buchungen können erst nach der Buchung einer Rechnung zugeordnet werden.'

/** Bestätigungstext vor dem Bezahlt-Markieren (nicht umkehrbar). */
export function invoiceAssignConfirmText(number) {
  return `Die Rechnung ${number} wird in Stripe als bezahlt markiert. Das lässt sich nicht rückgängig machen.`
}

const fixedCostLabel = (f) => `${text(f.name) || 'Fixkosten'} · ${euro(f.amountCents)} ${INTERVAL_LABEL[f.interval] || ''}`.trim()

/**
 * Auswahl im Zuordnen-Dialog zu einer Buchung:
 * { incoming, outgoing, pending, assigned, currentText, canUnassign, hint, suggestions, invoices, fixedCosts,
 *   categories, byKey }. Jede Option: { key, type ('invoice'|'payout'|'fixedCost'|'category'), label, detail,
 *   disabled, disabledReason, number, body } mit body = Anfrage an die API (ohne Notiz).
 *  - zugeordnete Buchung: keine Optionen, nur currentText (und canUnassign außer bei Rechnungen)
 *  - vorgemerkt (PDNG): nur Fixkosten (Ausgang) und Kategorien, mit Hinweis
 *  - Eingang: Vorschläge des Servers, andere offene Rechnungen, Kategorien (auch „Einnahme ohne Stripe-Rechnung“)
 *  - Ausgang: Fixkosten (aktive), Privat/Umbuchung, Sonstiges
 * Rechnungen, deren offener Betrag vom Betrag der Buchung abweicht, sind nicht wählbar (Teilzahlungen in Stripe).
 * invoicesLoaded = die offenen Rechnungen wurden frisch und ohne Fehler geladen: ein Vorschlag, dessen Rechnung nicht
 * (mehr) darin steht, ist dann nicht wählbar („Diese Rechnung ist nicht mehr offen.“).
 */
export function assignModel(tx, { invoices = [], fixedCosts = [], invoicesLoaded = false } = {}) {
  const t = obj(tx)
  const amount = t.amountCents
  const incoming = isNum(amount) && amount > 0
  const outgoing = isNum(amount) && amount < 0
  const pending = t.status === 'PDNG'
  const category = text(t.category)
  const assigned = Boolean(category)
  const model = {
    incoming,
    outgoing,
    pending,
    assigned,
    currentText: assigned ? assignmentText(t) : '',
    canUnassign: assigned && category !== 'rechnung',
    hint: pending && !assigned ? PENDING_ASSIGN_HINT : '',
    suggestions: [],
    invoices: [],
    fixedCosts: [],
    categories: [],
    byKey: {},
  }
  if (assigned) return model

  const open = objects(invoices).filter((inv) => OPEN_INVOICE.has(inv.status) && text(inv.id))
  const invoiceOption = (inv, extra = {}) => {
    const differs = isNum(amount) && inv.remainingCents !== amount
    return {
      key: `invoice:${inv.id}`,
      type: 'invoice',
      label: `${text(inv.number) || inv.id} · ${text(inv.customerName) || text(inv.customerEmail) || 'Unbekannter Kunde'} · ${euro(inv.remainingCents)} offen · fällig ${dateDe(inv.dueDate)}`,
      detail: '',
      disabled: differs,
      disabledReason: differs ? `Betrag weicht ab (offen: ${euro(inv.remainingCents)})` : '',
      number: text(inv.number),
      body: { invoiceId: inv.id },
      ...extra,
    }
  }

  if (incoming && !pending) {
    const seen = new Set()
    for (const s of objects(t.vorschlaege)) {
      if (s.kind === 'payout' && text(s.id)) {
        model.suggestions.push({
          key: `payout:${s.id}`,
          type: 'payout',
          label: 'Stripe-Auszahlung',
          detail: text(s.reason),
          confidence: s.confidence,
          disabled: false,
          disabledReason: '',
          number: '',
          body: { payoutId: s.id },
        })
      } else if (s.kind === 'invoice' && text(s.id) && !seen.has(s.id)) {
        seen.add(s.id)
        const known = open.find((inv) => inv.id === s.id)
        const gone = invoicesLoaded && !known
        const differs = s.amountDiffers === true || (known ? known.remainingCents !== amount : false)
        const number = text(s.number) || text(known?.number)
        model.suggestions.push({
          key: `invoice:${s.id}`,
          type: 'invoice',
          label: `Rechnung ${number || s.id}${known ? ` · ${text(known.customerName) || text(known.customerEmail)}` : ''}`,
          detail: [text(s.reason), known ? `${euro(known.remainingCents)} offen` : ''].filter(Boolean).join(' · '),
          confidence: s.confidence,
          disabled: gone || differs,
          disabledReason: gone
            ? NOT_OPEN_ANYMORE
            : differs
              ? 'Betrag weicht ab, Teilzahlungen bitte direkt in Stripe erfassen'
              : '',
          number,
          body: { invoiceId: s.id },
        })
      }
    }
    model.invoices = open.filter((inv) => !seen.has(inv.id)).map((inv) => invoiceOption(inv))
  }

  if (outgoing) {
    model.fixedCosts = objects(fixedCosts)
      .filter((f) => f.active !== false && text(f.$id))
      .map((f) => ({
        key: `fixedCost:${f.$id}`,
        type: 'fixedCost',
        label: fixedCostLabel(f),
        detail: '',
        disabled: false,
        disabledReason: '',
        number: '',
        body: { fixedCostId: f.$id },
      }))
  }

  const categories = [...(incoming ? ['rechnung-extern'] : []), 'privat', 'sonstiges']
  model.categories = categories.map((value) => ({
    key: `category:${value}`,
    type: 'category',
    label: CATEGORY_LABEL[value],
    detail: '',
    disabled: false,
    disabledReason: '',
    number: '',
    body: { category: value },
  }))

  for (const option of [...model.suggestions, ...model.invoices, ...model.fixedCosts, ...model.categories]) {
    model.byKey[option.key] = option
  }
  return model
}

/** Anfrage-Body für assignTransaction: Ziel der Option plus Notiz (nur wenn nicht leer; höchstens 500 Zeichen). */
export function assignBody(option, note) {
  const body = { ...obj(option).body }
  const n = text(note)
  if (n) body.note = n
  return body
}
