export default function Tabs({ tabs, active, onChange }) {
  return (
    <div className="ticket-tabs">
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          className={`ticket-tab ${active === t.id ? 'ticket-tab-active' : ''}`}
          onClick={() => onChange(t.id)}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}
