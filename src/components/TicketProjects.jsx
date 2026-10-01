import { useState, useEffect, useCallback } from 'react'
import { FaPlus, FaLink } from 'react-icons/fa6'
import { useWebsiteProjects } from '../hooks/useWebsiteProjects'
import { createProjectFromTemplate, importNewRepos } from '../lib/projectAdminApi'
import { isOutsideOrg, assignSummary } from '../lib/projectAssign'
import AssignedProjectCard from './AssignedProjectCard'
import { fetchServices, completeAssignment } from '../lib/projectKindsApi'
import { kindLabelFor } from '../lib/assignFlow'

function slugify(v) {
  return String(v || '').toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 100)
}

// Zuordnen lassen sich echte Repos des gleichen Kunden oder ohne Kunden, die nicht
// archiviert, keine Vorlage und noch nicht an diesem Ticket sind
function assignableProjects(all, ticket, assignedIds) {
  return (all || []).filter((p) =>
    p.repoFullName &&
    !assignedIds.has(p.$id) &&
    p.status !== 'archived' &&
    !p.isTemplate &&
    (!p.customerId || p.customerId === ticket.customerId)
  )
}

// Projekte am Ticket: Liste, Zuweisen, Loesen und neues Projekt an einer Stelle.
// Loesen nimmt das Projekt nur vom Ticket; die Kundenzuordnung (Sichtbarkeit im Portal) bleibt.
export default function TicketProjects({ ticket }) {
  const { fetchAllProjects, fetchByTicketId, assignProjects, unassignProject } = useWebsiteProjects()
  const [assigned, setAssigned] = useState([])
  const [available, setAvailable] = useState([])
  const [selected, setSelected] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [createForm, setCreateForm] = useState({ displayName: '', subdomain: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [importing, setImporting] = useState(false)
  const [importHint, setImportHint] = useState('')
  const [assignResult, setAssignResult] = useState(null)
  const [kinds, setKinds] = useState([])
  const [kindDialog, setKindDialog] = useState(false)

  useEffect(() => {
    fetchServices().then((s) => setKinds(s.kinds || [])).catch(() => {})
  }, [])

  const load = useCallback(async () => {
    if (!ticket?.$id) return
    const [all, mine] = await Promise.all([fetchAllProjects(), fetchByTicketId(ticket.$id)])
    setAssigned(mine)
    setAvailable(assignableProjects(all, ticket, new Set(mine.map((p) => p.$id))))
  }, [ticket, fetchAllProjects, fetchByTicketId])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setImporting(true)
      setImportHint('')
      try {
        await importNewRepos()
      } catch (err) {
        if (!cancelled) setImportHint(`Neue Repos konnten nicht geladen werden (${err.message}).`)
      } finally {
        if (!cancelled) setImporting(false)
      }
      if (!cancelled) await load()
    })()
    return () => { cancelled = true }
  }, [load])

  const run = async (action) => {
    setBusy(true)
    setError('')
    try {
      await action()
      await load()
    } catch (err) {
      setError(err.message || 'Aktion fehlgeschlagen')
    } finally {
      setBusy(false)
    }
  }

  const assign = () => {
    const project = available.find((p) => p.$id === selected)
    // Ohne Art erst "Was ist das?" fragen
    if (project && !project.kind) {
      setKindDialog(true)
      return
    }
    assignPlain()
  }

  const assignPlain = async () => {
    setBusy(true)
    setError('')
    setAssignResult(null)
    try {
      const projectName = available.find((p) => p.$id === selected)?.projectName || ''
      const r = await assignProjects([selected], { customerId: ticket.customerId || '', ticketId: ticket.$id })
      const one = r.results[0]
      setAssignResult(assignSummary(projectName, one.ok ? one.result : { error: one.error }))
      if (r.success) setSelected('')
      await load()
    } catch (err) {
      setError(err.message || 'Aktion fehlgeschlagen')
    } finally {
      setBusy(false)
    }
  }

  // Art gewaehlt: completeAssignment weist serverseitig (wie assignProject) zu,
  // daher kein zusaetzliches assignProjects.
  // Bei 409 (bereits zugeordnet) bewusst NICHT auf assignProjects zurueckfallen:
  // das wuerde das Projekt ohne Art zuweisen. Stattdessen Meldung zeigen und neu laden.
  const assignWithKind = async (kind) => {
    setKindDialog(false)
    setError('')
    setAssignResult(null)
    if (!ticket.customerId) {
      setError('Dieses Ticket hat keinen Kunden. Bitte zuerst einen Kunden am Ticket eintragen.')
      return
    }
    setBusy(true)
    try {
      const projectName = available.find((p) => p.$id === selected)?.projectName || ''
      const r = await completeAssignment(selected, {
        kind,
        forCustomer: true,
        customerId: ticket.customerId,
        ticketId: ticket.$id,
      })
      setAssignResult({ text: `${projectName || 'Projekt'} wurde zugewiesen.`, warnings: r.warnings || [] })
      setSelected('')
    } catch (err) {
      setError(err.status === 409
        ? `${err.message} Die Liste wurde neu geladen.`
        : err.message || 'Aktion fehlgeschlagen')
    } finally {
      try { await load() } catch { /* Anzeige bleibt wie sie ist */ }
      setBusy(false)
    }
  }

  const unassign = (projectId) => run(async () => {
    const r = await unassignProject(projectId)
    if (!r.success) throw new Error(r.error)
  })

  const create = (e) => {
    e.preventDefault()
    run(async () => {
      const subdomain = slugify(createForm.subdomain)
      await createProjectFromTemplate({
        repoName: subdomain,
        displayName: createForm.displayName,
        subdomain,
        customerId: ticket.customerId || '',
        ticketId: ticket.$id,
      })
      setCreateForm({ displayName: '', subdomain: '' })
      setShowCreate(false)
    })
  }

  return (
    <div className="ui-card pad ticket-projects">
      <h5 style={{ fontWeight: 700, marginBottom: 12 }}>Projekte ({assigned.length})</h5>
      {importing && <p className="muted" style={{ marginTop: 0 }}>Suche neue Repos …</p>}
      {importHint && <div className="text-red" style={{ marginBottom: 8 }}>{importHint}</div>}
      {error && <div className="text-red" style={{ marginBottom: 8 }}>{error}</div>}
      {assigned.length === 0
        ? <p className="muted" style={{ marginTop: 0 }}>Noch kein Projekt an diesem Ticket.</p>
        : assigned.map((p) => (
          <div key={p.$id}>
            <span className="muted" style={{ fontSize: 12 }} data-testid="project-kind">{kindLabelFor(kinds, p.kind)}</span>
            <AssignedProjectCard
              project={p}
              showActions
              onUnassign={unassign}
              customerName={ticket.customerName || ''}
              onChanged={load}
            />
          </div>
        ))}

      <div className="ticket-projects-assign">
        <select className="form-control" aria-label="Projekt zuweisen" value={selected} onChange={(e) => setSelected(e.target.value)}>
          <option value="">Projekt wählen …</option>
          {available.map((p) => (
            <option key={p.$id} value={p.$id}>
              {p.projectName} ({p.subdomain || p.repoFullName})
              {isOutsideOrg(p.repoFullName) ? ' – wird beim Zuweisen nach WEBklar verschoben' : ''}
            </option>
          ))}
        </select>
        <button type="button" className="ui-btn" disabled={!selected || busy} onClick={assign}><FaLink /> Zuweisen</button>
        <button type="button" className="ui-btn ui-btn-ghost" onClick={() => setShowCreate((s) => !s)}><FaPlus /> Neues Projekt</button>
      </div>

      {assignResult && (
        <div style={{ marginTop: 8, fontSize: 13 }}>
          <div>{assignResult.text}</div>
          {assignResult.warnings.map((w, i) => (
            <div key={i} className="muted" style={{ marginLeft: 12 }}>{w}</div>
          ))}
        </div>
      )}

      {showCreate && (
        <form className="ticket-projects-assign" onSubmit={create} style={{ marginTop: 8 }}>
          <input className="form-control" placeholder="Anzeigename" value={createForm.displayName} onChange={(e) => setCreateForm((f) => ({ ...f, displayName: e.target.value }))} required />
          <input className="form-control" placeholder="Subdomain" value={createForm.subdomain} onChange={(e) => setCreateForm((f) => ({ ...f, subdomain: e.target.value }))} required />
          <button type="submit" className="ui-btn ui-btn-primary" disabled={busy}>{busy ? 'Wird angelegt …' : 'Anlegen & zuweisen'}</button>
        </form>
      )}

      {kindDialog && (
        <div className="overlay">
          <span className="overlay-close" onClick={() => setKindDialog(false)}>×</span>
          <div className="overlay-content">
            <h2 className="mb-2">Was ist das?</h2>
            <p className="muted">Bitte wähle die Art des Projekts, bevor es zugewiesen wird.</p>
            {kinds.length === 0 && (
              <div className="text-red" style={{ marginBottom: 8 }}>Arten konnten nicht geladen werden – bitte neu laden.</div>
            )}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {kinds.map((k) => (
                <button key={k.key} type="button" className="ui-btn" onClick={() => assignWithKind(k.key)}>{k.label}</button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
