/* Ticket-Status, "Dringend" und Namen der Ticket-Arten fuer die Oberflaeche.
   Gespeichert werden weiter die englischen Werte: das Kundenportal leitet daraus
   die Fortschrittsleiste der Kunden ab (Open = Eingegangen, Occupied = In Arbeit,
   Awaiting = Wartet auf deine Rueckmeldung, In Test = Wird geprueft, Closed = Erledigt,
   Cancelled = Storniert). */

// Diese sechs Status lassen sich waehlen
export const TICKET_STATUSES = [
  { value: 'Open', label: 'Offen' },
  { value: 'Occupied', label: 'In Arbeit' },
  { value: 'Awaiting', label: 'Wartet auf Kunde' },
  { value: 'In Test', label: 'Prüfung' },
  { value: 'Closed', label: 'Erledigt' },
  { value: 'Cancelled', label: 'Storniert' },
]

// Alte Werte (nicht mehr waehlbar) und die Ergebnisse der Akquise-Tickets bleiben lesbar
const OTHER_LABELS = {
  Assigned: 'Eingeplant',
  'Added Info': 'In Arbeit',
  Halted: 'Pausiert',
  Aborted: 'Abgebrochen',
  'In Kontakt': 'In Kontakt',
  Zugesagt: 'Zugesagt',
  Abgesagt: 'Abgesagt',
}

const LABELS = { ...Object.fromEntries(TICKET_STATUSES.map((s) => [s.value, s.label])), ...OTHER_LABELS }

export function statusLabel(status) {
  if (!status) return 'Offen'
  return LABELS[status] || status
}

// Filter: jede Gruppe fasst die gespeicherten Werte zusammen, auch die alten
export const STATUS_GROUPS = [
  { id: 'open', label: 'Offen', values: ['Open'] },
  { id: 'working', label: 'In Arbeit', values: ['Occupied', 'Assigned', 'Added Info', 'In Kontakt'] },
  { id: 'waiting', label: 'Wartet auf Kunde', values: ['Awaiting', 'Halted'] },
  { id: 'review', label: 'Prüfung', values: ['In Test'] },
  { id: 'done', label: 'Erledigt', values: ['Closed', 'Zugesagt'] },
  { id: 'cancelled', label: 'Storniert', values: ['Cancelled', 'Aborted', 'Abgesagt'] },
]

// Standardansicht: alles, was noch nicht erledigt oder storniert ist
export const DEFAULT_STATUS_GROUPS = ['open', 'working', 'waiting', 'review']

export function statusGroup(status) {
  return STATUS_GROUPS.find((group) => group.values.includes(status))?.id || null
}

export function statusValuesFor(groupIds) {
  return STATUS_GROUPS.filter((group) => groupIds.includes(group.id)).flatMap((group) => group.values)
}

const GROUP_CLASS = {
  open: 'status-open',
  working: 'status-working',
  waiting: 'status-awaiting',
  review: 'status-assigned',
  done: 'status-closed',
  cancelled: 'status-closed',
}

// CSS-Klasse fuer das Status-Abzeichen
export function statusClass(status) {
  return GROUP_CLASS[statusGroup(status || 'Open')] || 'status-open'
}

// Statt fuenf Prioritaeten gibt es nur noch "dringend" oder nicht.
// Frueher gespeicherte Stufen: Hoch (3) und Kritisch (4) gelten als dringend.
export const NORMAL_PRIORITY = 2
export const URGENT_PRIORITY = 4

export function isUrgent(priority) {
  return Number(priority) >= 3
}

export function priorityFor(urgent) {
  return urgent ? URGENT_PRIORITY : NORMAL_PRIORITY
}

const TYPE_LABELS = { Project: 'Projekt' }

export function ticketTypeLabel(type) {
  return TYPE_LABELS[type] || type
}

// Filter nach Art: "Auftraege" = alles ausser Akquise
export const TYPE_FILTERS = [
  { id: 'orders', label: 'Aufträge', excludeType: 'Akquise' },
  { id: 'Webpage', label: 'Webpage', types: ['Webpage'] },
  { id: 'Migration', label: 'Migration', types: ['Migration'] },
  { id: 'Project', label: 'Projekt', types: ['Project'] },
  { id: 'Akquise', label: 'Akquise', types: ['Akquise'] },
  { id: 'all', label: 'Alle' },
]

// Suche in Kunde, Betreff, "Angefragt von" und WOID, ohne Gross-/Kleinschreibung
export function ticketMatches(ticket, query) {
  const q = String(query || '').trim().toLowerCase()
  if (!q) return true
  return [ticket.customerName, ticket.topic, ticket.title, ticket.requestedBy, ticket.woid]
    .some((value) => String(value || '').toLowerCase().includes(q))
}
