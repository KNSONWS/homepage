import { useState } from 'react'
import { FaTimes } from 'react-icons/fa'
import { Button } from '../ui'
import { todayIso } from './legalUi'

export default function VersionForm({ title, onSave, onClose }) {
  const [form, setForm] = useState({ version: '', status: 'current', validFrom: todayIso(), changeNote: '' })
  const [files, setFiles] = useState([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  const submit = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      await onSave({ ...form, version: form.version.trim() }, files)
      onClose()
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }

  return (
    <div className="overlay">
      <span className="overlay-close" onClick={onClose}><FaTimes /></span>
      <div className="overlay-content">
        <h2 className="mb-2">Neue Version: {title}</h2>
        {error && <div className="legal-error">{error}</div>}
        <form onSubmit={submit}>
          <div className="form-group">
            <label className="form-label">Version</label>
            <input className="form-control" name="version" value={form.version} onChange={set('version')} placeholder="z. B. v6" required />
          </div>
          <div className="form-group">
            <label className="form-label">Status</label>
            <select className="form-control" name="status" value={form.status} onChange={set('status')}>
              <option value="current">Gültig</option>
              <option value="draft">Entwurf (noch nicht live)</option>
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Gültig ab</label>
            <input className="form-control" type="date" name="validFrom" value={form.validFrom} onChange={set('validFrom')} required />
          </div>
          <div className="form-group">
            <label className="form-label">Was hat sich geändert?</label>
            <textarea className="form-control" name="changeNote" rows={4} value={form.changeNote} onChange={set('changeNote')} />
          </div>
          <div className="form-group">
            <label className="form-label">Dateien (PDF, HTML, Bild, Word)</label>
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
