export default function Field({ label, children, hint }) {
  return (
    <div className="field">
      {label && <label>{label}</label>}
      {children}
      {hint && <div className="faint" style={{ fontSize: 12 }}>{hint}</div>}
    </div>
  )
}
