/* Hilfen fuer die Formulare "Neues Ticket" und "Arbeitsblatt" und die Anzeige.
   WOMS speichert Datum als Text "dd.mm.yyyy" und Uhrzeit als "hhmm"
   (siehe planboard.js). Die Kalender-Felder des Browsers liefern dagegen
   "yyyy-mm-dd" bzw. "hh:mm" - umgerechnet wird erst beim Speichern. */

import { parseGermanDate, formatTime, dayKey } from './planboard'

// Service Type: gespeichert werden die bisherigen Werte, angezeigt wird Deutsch
export const SERVICE_TYPES = [
  { value: 'Remote', label: 'Fernwartung (remote)' },
  { value: 'On Site', label: 'Vor Ort beim Kunden' },
]

// Kurzform fuer Badges und Listen. Das alte "Off Site" meinte ebenfalls Arbeit aus der Ferne.
const SERVICE_TYPE_SHORT = {
  remote: 'Fernwartung',
  'off site': 'Fernwartung',
  'on site': 'Vor Ort',
  comment: 'Kommentar',
}

export function serviceTypeLabel(value) {
  return SERVICE_TYPE_SHORT[String(value || '').trim().toLowerCase()] || value
}

// Git-Pushes legt das Kundenportal als Arbeitsblatt an (employeeId "gitea"): Ende = Push,
// der Beginn wird im Ticketsystem nachgetragen
export function isGitWorksheet(worksheet) {
  return worksheet?.serviceType === 'GIT'
}

export function needsTimeEntry(worksheet) {
  return isGitWorksheet(worksheet) && (!worksheet.startTime || !Number(worksheet.totalTime))
}

// Farbe in der Arbeitsblatt-Liste: Git-Pushes sind orange, bis ihre Zeit nachgetragen
// ist, danach gruen. Kommentare blau, normale Arbeitszeit grau.
export function worksheetTone(worksheet) {
  if (isGitWorksheet(worksheet)) return needsTimeEntry(worksheet) ? 'git-open' : 'git-done'
  return worksheet?.isComment ? 'comment' : 'work'
}

const sameName = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase()

/* Wer hat das Arbeitsblatt erstellt? Normale Eintraege tragen die Appwrite-ID des
   Mitarbeiters. Bei Git-Pushes steht in employeeName der Gitea-Name des Pushers
   (Benutzername wie "knso" oder voller Name); er gehoert dem Mitarbeiter mit diesem
   Kuerzel oder Namen. employee ist der eigene Eintrag aus "employees". */
export function isWorksheetCreator(worksheet, user, employee) {
  if (!user?.$id || !worksheet) return false
  if (!isGitWorksheet(worksheet)) return worksheet.employeeId === user.$id
  const pusher = String(worksheet.employeeName || '').trim()
  return Boolean(pusher) && [employee?.shortcode, employee?.displayName, user.name].some((name) => sameName(name, pusher))
}

// Zeiten darf nur aendern, wer das Arbeitsblatt erstellt hat. Reine Kommentare haben
// keine Arbeitszeit; Git-Pushes sind Kommentare, bis ihre Zeit nachgetragen ist.
export function canEditWorksheetTimes(worksheet, user, employee) {
  return isWorksheetCreator(worksheet, user, employee) && (isGitWorksheet(worksheet) || !worksheet.isComment)
}

const pad = (n) => String(n).padStart(2, '0')

// Heutiges Datum in Ortszeit als "yyyy-mm-dd" (Wert fuer <input type="date">)
export function todayIso(now = new Date()) {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

// "2026-09-26" -> "26.09.2026"
export function isoToGermanDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''))
  return m ? `${m[3]}.${m[2]}.${m[1]}` : ''
}

// "09:30" -> "0930"
export function timeToWoms(value) {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(value || ''))
  return m ? `${m[1].padStart(2, '0')}${m[2]}` : ''
}

// Rueckweg fuers Bearbeiten: "26.09.2026" (auch "2.5.2026") -> "2026-09-26", sonst ""
export function germanDateToIso(value) {
  const date = parseGermanDate(value)
  return date ? dayKey(date) : ''
}

// "0930" -> "09:30", sonst ""
export function womsTimeToInput(value) {
  return formatTime(value)
}

// Minuten von "hh:mm" bis "hh:mm"; liegt das Ende davor, geht es ueber Mitternacht
export function minutesBetween(start, end) {
  const a = /^(\d{1,2}):(\d{2})/.exec(String(start || ''))
  const b = /^(\d{1,2}):(\d{2})/.exec(String(end || ''))
  if (!a || !b) return null
  const diff = Number(b[1]) * 60 + Number(b[2]) - (Number(a[1]) * 60 + Number(a[2]))
  return diff < 0 ? diff + 24 * 60 : diff
}

/* Vorschlaege fuer "Requested by" / "Requested for": Kunden, Mitarbeiter
   und Namen aus frueheren Tickets. Pro Name (ohne Gross-/Kleinschreibung)
   ein Eintrag; customerIds merkt sich, zu welchen Kunden er gehoert. */
export function buildRequesterSuggestions({ customers = [], employees = [], tickets = [] }) {
  const byKey = new Map()
  const add = (value, { hint = '', search = '', customerId = '', used = false } = {}) => {
    const text = String(value || '').trim()
    if (!text) return
    const key = text.toLowerCase()
    let entry = byKey.get(key)
    if (!entry) {
      entry = { value: text, hint: '', search: key, customerIds: new Set(), uses: 0 }
      byKey.set(key, entry)
    }
    if (hint && !entry.hint) entry.hint = hint
    if (search) entry.search += ` ${search.toLowerCase()}`
    if (customerId) entry.customerIds.add(customerId)
    if (used) entry.uses += 1
  }

  for (const customer of customers) {
    add(customer.name || customer.companyName, {
      hint: customer.email ? `Kunde · ${customer.email}` : 'Kunde',
      search: customer.email || '',
      customerId: customer.$id,
    })
  }
  for (const employee of employees) {
    add(employee.displayName, { hint: 'Mitarbeiter', search: employee.email || '' })
  }
  for (const ticket of tickets) {
    add(ticket.requestedBy, { customerId: ticket.customerId, used: true })
    add(ticket.requestedFor, { customerId: ticket.customerId, used: true })
  }
  for (const entry of byKey.values()) {
    if (!entry.hint) entry.hint = 'aus früheren Tickets'
  }
  return [...byKey.values()]
}

/* Passende Vorschlaege zur Eingabe, beste zuerst. Namen des gewaehlten
   Kunden stehen oben; ohne Eingabe gibt es nur diese und schon benutzte
   Namen, damit die Liste nicht einfach alle Kunden aufzaehlt. */
export function rankSuggestions(entries, query, { customerId = '', limit = 8 } = {}) {
  const q = String(query || '').trim().toLowerCase()
  const ranked = []
  for (const entry of entries) {
    const value = entry.value.toLowerCase()
    if (q && value === q) continue
    const forCustomer = Boolean(customerId) && entry.customerIds.has(customerId)
    let score
    if (!q) {
      if (!forCustomer && !entry.uses) continue
      score = 0
    } else if (value.startsWith(q)) {
      score = 3
    } else if (value.split(/[\s.@-]+/).some((word) => word.startsWith(q))) {
      score = 2
    } else if (entry.search.includes(q)) {
      score = 1
    } else {
      continue
    }
    if (forCustomer) score += 2
    score += Math.min(entry.uses, 10) / 10
    ranked.push({ entry, score })
  }
  ranked.sort((a, b) => b.score - a.score || a.entry.value.localeCompare(b.entry.value, 'de'))
  return ranked.slice(0, limit).map(({ entry }) => entry)
}
