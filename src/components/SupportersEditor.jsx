import { useState } from 'react'
import { FaTimes } from 'react-icons/fa'
import { useEmployees } from '../hooks/useEmployees'
import { supportMinutes } from '../lib/support'
import { stepLabel } from '../lib/timeSteps'

/* Haken "Unterstuetzung" mit Zeilen Mitarbeiter + "Wobei?". Nur fuer die Person, die das
   Arbeitsblatt angelegt hat (sie selbst steht nicht in der Auswahl). Die Mitarbeiterliste
   laedt erst hier, damit nicht jede Ticket-Karte sie abruft. */
export default function SupportersEditor({ value, onChange, excludeUserId, minutes }) {
  const { employees, loading, error } = useEmployees()
  const [enabled, setEnabled] = useState(value.length > 0)
  const perPerson = stepLabel(supportMinutes(minutes))
  const choices = employees.filter((e) => e.userId && e.userId !== excludeUserId)

  const toggle = (checked) => {
    setEnabled(checked)
    onChange(checked ? [{ employeeId: '', name: '', task: '' }] : [])
  }
  const update = (index, patch) => onChange(value.map((row, i) => (i === index ? { ...row, ...patch } : row)))
  const pick = (index, userId) => {
    const employee = choices.find((e) => e.userId === userId)
    update(index, { employeeId: userId, name: employee?.displayName || '' })
  }
  const remove = (index) => {
    const next = value.filter((_, i) => i !== index)
    onChange(next)
    if (!next.length) setEnabled(false)
  }

  return (
    <div className="form-group supporters-editor">
      <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <input type="checkbox" checked={enabled} onChange={(e) => toggle(e.target.checked)} />
        Unterstützung
      </label>
      {enabled && (
        <div style={{ marginTop: 8 }}>
          {!loading && (error || !choices.length) && (
            <p className="text-grey" style={{ fontSize: 13 }}>Mitarbeiterliste konnte nicht geladen werden.</p>
          )}
          {value.map((row, index) => (
            <div key={index} className="flex gap-2" style={{ marginBottom: 8, alignItems: 'center' }}>
              <select
                className="form-control"
                aria-label="Mitarbeiter"
                value={row.employeeId}
                onChange={(e) => pick(index, e.target.value)}
              >
                <option value="">Person wählen …</option>
                {choices
                  .filter((e) => e.userId === row.employeeId || !value.some((r) => r.employeeId === e.userId))
                  .map((e) => <option key={e.userId} value={e.userId}>{e.displayName}</option>)}
              </select>
              <input
                className="form-control"
                aria-label="Wobei?"
                placeholder="Wobei?"
                maxLength={200}
                value={row.task}
                onChange={(e) => update(index, { task: e.target.value })}
              />
              <span className="text-grey" style={{ whiteSpace: 'nowrap', fontSize: 13 }}>= {perPerson}</span>
              <button type="button" className="btn btn-sm" aria-label="Zeile entfernen" onClick={() => remove(index)}>
                <FaTimes />
              </button>
            </div>
          ))}
          <button type="button" className="btn btn-sm" onClick={() => onChange([...value, { employeeId: '', name: '', task: '' }])}>
            + weitere Person
          </button>
        </div>
      )}
    </div>
  )
}
