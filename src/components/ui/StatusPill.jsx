import { statusLabel, statusClass, isUrgent } from '../../lib/ticketStatus'

const pillBase = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '3px 10px',
  borderRadius: 999,
  fontSize: 12,
  fontWeight: 700,
}

export function StatusPill({ status }) {
  return <span className={statusClass(status)} style={pillBase}>{statusLabel(status)}</span>
}

// Nur dringende Tickets bekommen ein Abzeichen
export function UrgentPill({ priority }) {
  if (!isUrgent(priority)) return null
  return <span className="priority-critical" style={pillBase}>Dringend</span>
}
