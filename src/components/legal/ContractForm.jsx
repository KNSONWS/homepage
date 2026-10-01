import { useState } from 'react'
import { FaTimes } from 'react-icons/fa'
import { Button } from '../ui'

const FIELDS = ['provider', 'purpose', 'cost', 'costInterval', 'startDate', 'termMonths', 'renewalMonths', 'noticeValue', 'noticeUnit', 'note']
const NUMBERS = ['termMonths', 'renewalMonths', 'noticeValue']

function toForm(contract) {
  const form = { costInterval: 'month', noticeUnit: 'months' }
  for (const key of FIELDS) {
    if (contract?.[key] !== null && contract?.[key] !== undefined) form[key] = String(contract[key])
  }
  return form
}

/** Leere Felder werden null, damit die Fristenlogik "Fristen fehlen" erkennt. */
function toDoc(form) {
  const doc = {}
  for (const key of FIELDS) {
    const raw = (form[key] ?? '').trim()
    if (raw === '') doc[key] = null
    else if (NUMBERS.includes(key)) doc[key] = parseInt(raw, 10)
    else if (key === 'cost') doc[key] = parseFloat(raw.replace(',', '.'))
    else doc[key] = raw
  }
  return doc
}

export default function ContractForm({ contract, onSave, onClose }) {
  const [form, setForm] = useState(() => toForm(contract))
  const [files, setFiles] = useState([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  const submit = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      await onSave(toDoc(form), files)
      onClose()
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }

  const input = (key, label, props = {}) => (
    <div className="form-group">
      <label className="form-label">{label}</label>
      <input className="form-control" name={key} value={form[key] || ''} onChange={set(key)} {...props} />
    </div>
  )

  return (
    <div className="overlay">
      <span className="overlay-close" onClick={onClose}><FaTimes /></span>
      <div className="overlay-content">
        <h2 className="mb-2">{contract ? 'Vertrag bearbeiten' : 'Neuer Vertrag'}</h2>
        {error && <div className="legal-error">{error}</div>}
        <form onSubmit={submit}>
          {input('provider', 'Anbieter', { required: true })}
          {input('purpose', 'Wofür')}
          <div className="legal-form-row">
            {input('cost', 'Kosten (€)', { inputMode: 'decimal' })}
            <div className="form-group">
              <label className="form-label">pro</label>
              <select className="form-control" name="costInterval" value={form.costInterval} onChange={set('costInterval')}>
                <option value="month">Monat</option>
                <option value="year">Jahr</option>
              </select>
            </div>
          </div>
          {input('startDate', 'Vertragsbeginn', { type: 'date' })}
          <div className="legal-form-row">
            {input('termMonths', 'Laufzeit (Monate, 0 = jederzeit kündbar)', { type: 'number', min: 0 })}
            {input('renewalMonths', 'Verlängert sich um (Monate, 0 = endet)', { type: 'number', min: 0 })}
          </div>
          <div className="legal-form-row">
            {input('noticeValue', 'Kündigungsfrist', { type: 'number', min: 0 })}
            <div className="form-group">
              <label className="form-label">Einheit</label>
              <select className="form-control" name="noticeUnit" value={form.noticeUnit} onChange={set('noticeUnit')}>
                <option value="months">Monate</option>
                <option value="days">Tage</option>
              </select>
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Notiz</label>
            <textarea className="form-control" name="note" rows={3} value={form.note || ''} onChange={set('note')} />
          </div>
          <div className="form-group">
            <label className="form-label">Dateien hinzufügen</label>
            <input type="file" multiple accept=".pdf,.html,.htm,.png,.jpg,.jpeg,.webp,.doc,.docx" onChange={(e) => setFiles([...e.target.files])} />
          </div>
          <div className="flex gap-2">
            <Button variant="primary" type="submit" disabled={saving}>{saving ? 'Speichert …' : 'Speichern'}</Button>
            <Button type="button" onClick={onClose}>Abbrechen</Button>
          </div>
        </form>
      </div>
    </div>
  )
}
