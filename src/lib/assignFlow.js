// Ablauf-Logik des Zuordnen-Assistenten (reine Funktionen, ohne UI).
// state: { step, kind, forCustomer, customerId, ticketId, newTicket }

export function nextStep(state) {
  switch (state.step) {
    case 'kind':
      return 'customer?'
    case 'customer?':
      return state.forCustomer ? 'customer' : 'summary'
    case 'customer':
      return 'ticket'
    default:
      return 'summary'
  }
}

export function prevStep(state) {
  switch (state.step) {
    case 'customer?':
      return 'kind'
    case 'customer':
      return 'customer?'
    case 'ticket':
      return 'customer'
    case 'summary':
      return state.forCustomer ? 'ticket' : 'customer?'
    default:
      return 'kind'
  }
}

export function newTicketDefaults({ kindLabel, ticketType, repoName, repoUrl, customer, today }) {
  return {
    topic: `${kindLabel} – ${repoName}`,
    type: ticketType,
    requestedBy: customer?.contactName || customer?.name || '',
    startDate: today,
    details: `Repository: ${repoUrl}`,
  }
}

const filled = (v) => typeof v === 'string' && v.trim() !== ''

export function canFinish(state) {
  if (!state.kind) return false
  if (!state.forCustomer) return true
  if (!state.customerId) return false
  if (state.ticketId) return true
  const t = state.newTicket
  return !!t && filled(t.topic) && filled(t.requestedBy) && filled(t.startDate)
}

export function openTicketsFor(tickets, customerId) {
  return (tickets || []).filter(
    (t) => t.customerId === customerId && t.status !== 'Closed' && t.status !== 'Cancelled'
  )
}

// Art-Label fuer die Anzeige; leere Art = "Art fehlt"
export function kindLabelFor(kinds, key) {
  if (!key) return 'Art fehlt'
  return (kinds || []).find((k) => k.key === key)?.label || key
}
