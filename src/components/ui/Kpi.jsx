export default function Kpi({ label, value, sub, icon, accent = 'var(--accent)' }) {
  return (
    <div className="kpi">
      <span className="kpi-accent" style={{ background: accent }} />
      <div className="kpi-label">{icon}{label}</div>
      <div className="kpi-value">{value}</div>
      {sub && <div className="kpi-sub">{sub}</div>}
    </div>
  )
}
