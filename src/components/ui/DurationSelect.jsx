import { stepOptions } from '../../lib/timeSteps'

/* Arbeitszeit nur in 15-Minuten-Schritten (15 min bis 12 h), siehe lib/timeSteps */
export default function DurationSelect({ id, value, onChange, disabled }) {
  return (
    <select
      id={id}
      className="form-control"
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(Number(e.target.value))}
    >
      {/* Kommentar ohne Arbeitszeit */}
      {!value && <option value={0}>–</option>}
      {stepOptions(value).map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  )
}
