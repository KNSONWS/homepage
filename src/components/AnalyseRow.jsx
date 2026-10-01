import { useState, useEffect } from 'react'
import { fetchAnalyse, setAnalyse } from '../lib/analyseApi'
import { analyseStatus, avvLabel } from '../lib/analyseView'

const COLORS = { green: '#10b981', red: '#ef4444', grey: '#a0aec0' }

// Kompakte Zeile "Website-Analyse" je Projekt (lädt beim Einbinden; mit key=Projekt-ID verwenden)
export default function AnalyseRow({ projectId }) {
  const [data, setData] = useState(null)
  const [loadError, setLoadError] = useState('')
  const [mode, setMode] = useState(null) // null | 'on' | 'off'
  const [confirmed, setConfirmed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    fetchAnalyse(projectId)
      .then((r) => { if (!cancelled) setData(r) })
      .catch((err) => { if (!cancelled) setLoadError(err.message) })
    return () => { cancelled = true }
  }, [projectId])

  const apply = async (on) => {
    setBusy(true)
    setError('')
    try {
      await setAnalyse(projectId, { on, avvConfirmedVerbally: on })
      setData(await fetchAnalyse(projectId))
      setMode(null)
      setConfirmed(false)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const cancel = () => { setMode(null); setConfirmed(false); setError('') }
  const status = analyseStatus(data)

  return (
    <div style={{ marginTop: 10, fontSize: 13 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <span className="text-grey">Website-Analyse:</span>
        {loadError ? (
          <span style={{ color: COLORS.red }}>{loadError}</span>
        ) : data ? (
          <span style={{ color: COLORS[status.color] }}>{status.text}</span>
        ) : (
          <span className="text-grey">Lädt …</span>
        )}
        {status.hint && <span className="text-grey">({status.hint})</span>}
        {status.canEnable && !mode && (
          <button type="button" className="btn btn-sm" onClick={() => setMode('on')}>{status.enableLabel || 'Einschalten'}</button>
        )}
        {status.canDisable && !mode && (
          <button type="button" className="btn btn-sm" onClick={() => setMode('off')}>Ausschalten</button>
        )}
      </div>

      {mode === 'on' && data && (
        <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
            <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
            {avvLabel(data.avvVersion)}
          </label>
          <button type="button" className="btn btn-sm" disabled={!confirmed || busy} onClick={() => apply(true)}>Einschalten</button>
          <button type="button" className="btn btn-sm" disabled={busy} onClick={cancel}>Abbrechen</button>
        </div>
      )}

      {mode === 'off' && (
        <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <span>Website-Analyse wirklich ausschalten?</span>
          <button type="button" className="btn btn-sm" disabled={busy} onClick={() => apply(false)}>Ja, ausschalten</button>
          <button type="button" className="btn btn-sm" disabled={busy} onClick={cancel}>Abbrechen</button>
        </div>
      )}

      {error && <div style={{ marginTop: 6, color: COLORS.red }}>{error}</div>}
    </div>
  )
}
