import { TICKET_STATUSES, statusLabel } from '../lib/ticketStatus'

export default function StatusDropdown({ value, onChange }) {
  return (
    <div className="dropdown">
      <button className="btn" style={{ background: 'inherit', color: 'inherit' }}>
        {statusLabel(value)}
      </button>
      <div className="dropdown-content">
        {TICKET_STATUSES.map(status => (
          <span
            key={status.value}
            className="dropdown-item"
            onClick={() => onChange(status.value)}
          >
            {status.label}
          </span>
        ))}
      </div>
    </div>
  )
}
