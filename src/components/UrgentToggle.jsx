import { isUrgent, priorityFor } from '../lib/ticketStatus'

// Ein Klick markiert ein Ticket als dringend oder wieder als normal
export default function UrgentToggle({ value, onChange }) {
  const urgent = isUrgent(value)
  return (
    <button
      type="button"
      className={`urgent-toggle${urgent ? ' on' : ''}`}
      aria-pressed={urgent}
      title={urgent ? 'Nicht mehr dringend' : 'Als dringend markieren'}
      onClick={() => onChange(priorityFor(!urgent))}
    >
      Dringend
    </button>
  )
}
