export default function EmptyState({ icon, title, hint, action }) {
  return (
    <div className="empty">
      {icon && <div className="empty-icon">{icon}</div>}
      <div style={{ fontWeight: 700, marginBottom: 4 }}>{title}</div>
      {hint && <div className="faint" style={{ fontSize: 13 }}>{hint}</div>}
      {action && <div style={{ marginTop: 16 }}>{action}</div>}
    </div>
  )
}
