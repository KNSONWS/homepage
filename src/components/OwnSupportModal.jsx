import { useState } from 'react'
import { FaTimes } from 'react-icons/fa'
import { parseSupporters, supportMinutes } from '../lib/support'
import { stepLabel } from '../lib/timeSteps'

/* "Ich habe unterstuetzt": die eigene Unterstuetzung bei einem fremden Arbeitsblatt
   eintragen, aendern oder entfernen. Andere Eintraege und die Zeiten bleiben unberuehrt. */
export default function OwnSupportModal({ worksheet, currentUserId, onClose, onSave }) {
  const existing = parseSupporters(worksheet.supporters).find((s) => s.employeeId === currentUserId)
  const [task, setTask] = useState(existing?.task || '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const save = async (value) => {
    setSaving(true)
    setError('')
    const result = await onSave(worksheet, value)
    if (result?.success) {
      onClose()
      return
    }
    setError(result?.error || 'Speichern fehlgeschlagen')
    setSaving(false)
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!task.trim()) {
      setError('Bitte angeben, wobei du unterstützt hast.')
      return
    }
    save(task.trim())
  }

  return (
    <div className="overlay">
      <span className="overlay-close" onClick={onClose}>
        <FaTimes />
      </span>
      <div className="overlay-content" style={{ maxWidth: 480 }}>
        <h2 className="mb-2">Unterstützung eintragen</h2>
        <p className="text-grey" style={{ fontSize: '14px', marginBottom: '16px' }}>
          WSID {worksheet.wsid} · {worksheet.employeeName}
          <br />Dir werden {stepLabel(supportMinutes(worksheet.totalTime))} angerechnet.
        </p>

        {error && (
          <div className="bg-red text-white p-2 mb-2" style={{ borderRadius: '4px' }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label" htmlFor="own-support-task">Wobei?</label>
            <input
              id="own-support-task"
              className="form-control"
              maxLength={200}
              required
              value={task}
              onChange={(e) => setTask(e.target.value)}
              autoFocus
            />
          </div>
          <div className="text-center mt-2 flex gap-2" style={{ justifyContent: 'center' }}>
            <button type="submit" className="btn btn-dark" disabled={saving}>
              {saving ? 'Speichert...' : 'Speichern'}
            </button>
            {existing && (
              <button type="button" className="btn" disabled={saving} onClick={() => save(null)}>
                Eintrag entfernen
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  )
}
