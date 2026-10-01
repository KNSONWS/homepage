import { useState, useEffect, useCallback, useRef } from 'react'
import { modeOptionsFor, previewStatus, modeHint, isDevUnavailableError, NO_DEV_HINT } from '../lib/previewView'
import { isValidEnvName, buildEnvPayload, isDevPreview, dotColor, envValueTooLong, MAX_ENV_VARS } from '../lib/previewEnv'
import {
  fetchPreview,
  setPreviewMode,
  savePreviewEnv,
  rebuildPreview,
  startPreviewDev,
  stopPreviewDev,
  fetchPreviewLog,
} from '../lib/previewApi'

const STATE_OF_COLOR = { green: 'online', yellow: 'building', red: 'failed', grey: 'off' }
const NOT_ACTIVE = 'Preview-Runner ist nicht aktiv'

const logDate = (at) => {
  const d = new Date(at)
  if (!at || Number.isNaN(d.getTime())) return String(at || '')
  return d.toLocaleString('de-DE', { timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export default function PreviewBlock({ projectId }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [inactive, setInactive] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [logText, setLogText] = useState('')
  const [logFile, setLogFile] = useState('')
  const [showLogs, setShowLogs] = useState(false)
  // Variablen: Änderungen werden gesammelt und mit "Variablen speichern" übertragen
  const [pendingSet, setPendingSet] = useState({})
  const [pendingRemove, setPendingRemove] = useState([])
  const [newName, setNewName] = useState('')
  const [newValue, setNewValue] = useState('')
  const [editName, setEditName] = useState('')
  const [editValue, setEditValue] = useState('')
  const [envError, setEnvError] = useState('')
  const alive = useRef(true)

  useEffect(() => {
    alive.current = true
    return () => { alive.current = false }
  }, [])

  const handleError = useCallback((err) => {
    if (!alive.current) return
    if (err?.status === 409 && err.message === NOT_ACTIVE) {
      setInactive(true)
      return
    }
    setError(err?.message || 'Unbekannter Fehler')
  }, [])

  const load = useCallback(async () => {
    try {
      const r = await fetchPreview(projectId)
      if (!alive.current) return
      setData(r)
      setInactive(false)
      setError('')
    } catch (err) {
      handleError(err)
    } finally {
      if (alive.current) setLoading(false)
    }
  }, [projectId, handleError])

  useEffect(() => { load() }, [load])

  // Solange gebaut/gestartet wird: alle 5 s nachladen
  const state = data?.state
  useEffect(() => {
    if (state !== 'building' && state !== 'starting') return undefined
    const t = setInterval(load, 5000)
    return () => clearInterval(t)
  }, [state, load])

  const run = async (fn) => {
    setBusy(true)
    setError('')
    try {
      await fn()
      await load()
    } catch (err) {
      handleError(err)
    } finally {
      if (alive.current) setBusy(false)
    }
  }

  const openLog = (runFile) => {
    setLogFile(runFile)
    setLogText('')
    if (!runFile) return
    setBusy(true)
    setError('')
    fetchPreviewLog(projectId, runFile)
      .then((r) => {
        if (alive.current) setLogText(Array.isArray(r.lines) ? r.lines.join('\n') : String(r.log ?? r.text ?? ''))
      })
      .catch((err) => {
        handleError(err)
        if (alive.current) setLogText(`Fehler: ${err?.message || 'Protokoll konnte nicht geladen werden'}`)
      })
      .finally(() => { if (alive.current) setBusy(false) })
  }

  const addPending = (name, value) => {
    setPendingSet((p) => ({ ...p, [name]: value }))
    setPendingRemove((r) => r.filter((x) => x !== name))
  }

  const handleAdd = () => {
    if (!isValidEnvName(newName)) {
      setEnvError('Name nur mit A–Z, 0–9 und _ (nicht mit einer Ziffer beginnen).')
      return
    }
    if (!newValue) {
      setEnvError('Bitte einen Wert eingeben.')
      return
    }
    if (envValueTooLong(newValue)) {
      setEnvError('Der Wert ist zu lang (max. 4096 Byte).')
      return
    }
    if (!names.includes(newName) && names.length >= MAX_ENV_VARS) {
      setEnvError(`Maximal ${MAX_ENV_VARS} Variablen möglich.`)
      return
    }
    setEnvError('')
    addPending(newName, newValue)
    setNewName('')
    setNewValue('')
  }

  const handleRemove = (name) => {
    setPendingSet((p) => {
      const { [name]: _drop, ...rest } = p
      return rest
    })
    if ((data?.envNames || []).includes(name)) setPendingRemove((r) => [...new Set([...r, name])])
  }

  const handleChange = () => {
    if (!editValue) {
      setEnvError('Bitte einen neuen Wert eingeben.')
      return
    }
    if (envValueTooLong(editValue)) {
      setEnvError('Der Wert ist zu lang (max. 4096 Byte).')
      return
    }
    setEnvError('')
    addPending(editName, editValue)
    setEditName('')
    setEditValue('')
  }

  const handleSaveEnv = () => run(async () => {
    await savePreviewEnv(projectId, buildEnvPayload(pendingSet, pendingRemove))
    setPendingSet({})
    setPendingRemove([])
  })

  const enter = (fn) => (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      fn()
    }
  }

  if (loading) return <div className="text-grey" style={{ fontSize: 12 }}>Lädt …</div>

  const view = data ? { ...data } : { state: 'off' }
  const status = previewStatus(view)
  const mode = data?.mode || 'auto'
  const hint = modeHint(mode, data?.detected)
  const names = [...new Set([...(data?.envNames || []), ...Object.keys(pendingSet)])].filter((n) => !pendingRemove.includes(n))
  const dirty = Object.keys(pendingSet).length > 0 || pendingRemove.length > 0
  const dev = isDevPreview(data)
  const logs = [...(data?.logs || [])].sort((a, b) => new Date(b.at) - new Date(a.at)).slice(0, 5)

  const small = { fontSize: 12 }

  return (
    <div style={{ fontSize: 13 }}>
      {data && (
        <>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
            <label className="text-grey" htmlFor={`pv-mode-${projectId}`} style={small}>Modus</label>
            <select
              id={`pv-mode-${projectId}`}
              className="form-control"
              style={{ maxWidth: 200 }}
              value={mode}
              disabled={busy || inactive}
              onChange={(e) => run(() => setPreviewMode(projectId, e.target.value))}
            >
              {modeOptionsFor(data.devAvailable).map((o) => <option key={o.value} value={o.value} disabled={o.disabled}>{o.label}</option>)}
            </select>
          </div>
          {data.devAvailable === false && <div className="text-grey" style={{ ...small, marginTop: 4 }}>{NO_DEV_HINT}</div>}
          {hint && <div className="text-grey" style={{ ...small, marginTop: 4 }}>{hint}</div>}
          <div style={{ marginTop: 8, display: 'flex', gap: 6, alignItems: 'flex-start' }}>
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: dotColor(STATE_OF_COLOR[status.color]), display: 'inline-block', flexShrink: 0, marginTop: 4 }} />
            <span style={{ overflowWrap: 'anywhere' }}>{status.text}</span>
          </div>
          {data.state === 'failed' && data.error && !isDevUnavailableError(data.error) && (
            <div style={{ color: '#f87171', ...small, marginTop: 4, overflowWrap: 'anywhere' }}>{data.error}</div>
          )}
        </>
      )}

      {inactive && <div className="text-grey" style={{ ...small, marginTop: 8 }}>{NOT_ACTIVE}.</div>}
      {error && <div style={{ color: '#f87171', ...small, marginTop: 8, overflowWrap: 'anywhere' }}>{error}</div>}

      {data && !inactive && (
        <>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
            <button type="button" className="btn btn-sm" disabled={busy || state === 'building'} onClick={() => run(() => rebuildPreview(projectId))}>
              Neu bauen
            </button>
            <button type="button" className="btn btn-sm" disabled={busy || logs.length === 0} onClick={() => setShowLogs((v) => !v)}>
              Protokoll ansehen
            </button>
            {dev && (
              <>
                <button type="button" className="btn btn-sm" disabled={busy} onClick={() => run(() => startPreviewDev(projectId))}>
                  Jetzt starten
                </button>
                <button type="button" className="btn btn-sm" disabled={busy} onClick={() => run(() => stopPreviewDev(projectId))}>
                  Stoppen
                </button>
              </>
            )}
          </div>

          {showLogs && (
            <div style={{ marginTop: 8 }}>
              <select
                className="form-control"
                style={{ maxWidth: '100%' }}
                aria-label="Lauf wählen"
                value={logFile}
                disabled={busy}
                onChange={(e) => openLog(e.target.value)}
              >
                <option value="">Lauf wählen …</option>
                {logs.map((l) => <option key={l.runFile} value={l.runFile}>{logDate(l.at)}</option>)}
              </select>
              {logFile && (
                <pre style={{ marginTop: 6, maxHeight: 260, overflow: 'auto', background: 'rgba(0,0,0,0.35)', padding: 8, borderRadius: 6, fontFamily: 'monospace', fontSize: 11, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                  {logText || '…'}
                </pre>
              )}
            </div>
          )}

          <div style={{ marginTop: 14 }}>
            <strong style={small}>Variablen</strong>
            <div style={{ marginTop: 6 }}>
              {names.length === 0 && <div className="text-grey" style={small}>Keine Variablen.</div>}
              {names.map((n) => (
                <div key={n} style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', padding: '4px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                  <code style={{ flex: '1 1 140px', overflowWrap: 'anywhere' }}>{n}</code>
                  <span className="text-grey">•••</span>
                  {editName === n ? (
                    <>
                      <input className="form-control" style={{ flex: '1 1 120px', minWidth: 0 }} type="password" autoComplete="off" placeholder="Neuer Wert" value={editValue} onKeyDown={enter(handleChange)} onChange={(e) => setEditValue(e.target.value)} />
                      <button type="button" className="btn btn-sm" onClick={handleChange}>Übernehmen</button>
                    </>
                  ) : (
                    <button type="button" className="btn btn-sm" disabled={busy} onClick={() => { setEditName(n); setEditValue(''); setEnvError('') }}>Ändern</button>
                  )}
                  <button type="button" className="btn btn-sm" disabled={busy} onClick={() => handleRemove(n)}>Entfernen</button>
                </div>
              ))}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginTop: 8 }}>
                <input type="text" className="form-control" style={{ flex: '1 1 140px', minWidth: 0 }} placeholder="NAME" onKeyDown={enter(handleAdd)} value={newName} onChange={(e) => setNewName(e.target.value)} />
                <input type="password" autoComplete="off" className="form-control" style={{ flex: '1 1 140px', minWidth: 0 }} placeholder="Wert" onKeyDown={enter(handleAdd)} value={newValue} onChange={(e) => setNewValue(e.target.value)} />
                <button type="button" className="btn btn-sm" disabled={busy} onClick={handleAdd}>Hinzufügen</button>
              </div>
              {envError && <div style={{ color: '#f87171', ...small, marginTop: 4 }}>{envError}</div>}
              {dirty && (
                <div style={{ marginTop: 8 }}>
                  <button type="button" className="btn btn-sm" disabled={busy} onClick={handleSaveEnv}>Variablen speichern</button>
                </div>
              )}
              <div className="text-grey" style={{ ...small, marginTop: 6 }}>Alles mit VITE_ / NEXT_PUBLIC_ ist später im Browser sichtbar.</div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
