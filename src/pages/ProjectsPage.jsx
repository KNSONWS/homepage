import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import PreviewBlock from '../components/PreviewBlock'
import {
  FaFolder,
  FaPlus,
  FaArrowsRotate,
  FaPen,
  FaBoxArchive,
  FaBoxOpen,
  FaGlobe,
  FaLock,
  FaCircleInfo,
  FaClone,
} from 'react-icons/fa6'
import { useWebsiteProjects } from '../hooks/useWebsiteProjects'
import { useCustomers } from '../hooks/useCustomers'
import { useWorkorders } from '../hooks/useWorkorders'
import { useEmployees } from '../hooks/useEmployees'
import { useAuth } from '../context/AuthContext'
import {
  createProjectFromTemplate,
  syncGiteaRepos,
  updateWebsiteProject,
  archiveWebsiteProject,
  unarchiveWebsiteProject,
} from '../lib/projectAdminApi'
import { assignSummary } from '../lib/projectAssign'
import PreviewLinkButton from '../components/PreviewLinkButton'
import GiteaLinkButton from '../components/GiteaLinkButton'

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100)
}

const WORKORDER_FILTERS = { limit: 500 }

// Projekt-Typen (= "Template"/Hosting-Modus)
const TYPES = {
  preview: {
    label: 'Preview (mit Login)',
    short: 'Preview',
    badge: 'badge-info',
    icon: <FaLock />,
    hint: 'Login-geschuetzte Vorschau unter <subdomain>.project.webklar.com',
  },
  website: {
    label: 'Oeffentliche Website',
    short: 'Website',
    badge: 'badge-ok',
    icon: <FaGlobe />,
    hint: 'Oeffentlich erreichbar ohne Login unter <subdomain>.project.webklar.com',
  },
  template: {
    label: 'Vorlage',
    short: 'Vorlage',
    badge: 'badge-warn',
    icon: <FaClone />,
    hint: 'Website-Vorlage (login-geschuetzt) - erscheint nur fuer Admins in der Vorlagen-Ansicht',
    adminOnly: true,
  },
  project: {
    label: 'Internes Projekt (kein Hosting)',
    short: 'Projekt',
    badge: 'badge-muted',
    icon: <FaFolder />,
    hint: 'Nur Gitea-Repository, keine Website/Subdomain',
  },
}

function typeOf(project) {
  if (project.isTemplate) return 'template'
  if (project.isPublic) return 'website'
  if (project.subdomain) return 'preview'
  return 'project'
}

// Typen mit Hosting (Subdomain + Deploy)
const HOSTED_TYPES = new Set(['preview', 'website', 'template'])

// Gleiche Logik wie isPreviewProjectReady im Backend (auth.js):
// nur 'ready'/'deployed' gelten als tatsaechlich gehostet.
function isProjectReady(project) {
  const st = String(project.provisioningStatus || project.status || '').toLowerCase()
  return ['ready', 'deployed'].includes(st)
}

export default function ProjectsPage() {
  const navigate = useNavigate()
  const { projects, loading, error, fetchAllProjects, assignProjects, unassignProject } = useWebsiteProjects()
  const { customers } = useCustomers()
  const { workorders } = useWorkorders(WORKORDER_FILTERS)
  const { employees } = useEmployees()
  const { isAdmin } = useAuth()
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [customerFilter, setCustomerFilter] = useState('')
  const [employeeFilter, setEmployeeFilter] = useState('')
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [createForm, setCreateForm] = useState({
    displayName: '',
    subdomain: '',
    repoName: '',
    customerId: '',
  })
  const [createLoading, setCreateLoading] = useState(false)
  const [createError, setCreateError] = useState('')
  const [syncLoading, setSyncLoading] = useState(false)
  const [notice, setNotice] = useState('')
  const [assignBusyId, setAssignBusyId] = useState('')
  const [hostBusyId, setHostBusyId] = useState('')
  const [refreshBusyId, setRefreshBusyId] = useState('')

  // Bearbeiten-Modal
  const [editProject, setEditProject] = useState(null)
  const [editForm, setEditForm] = useState({ projectName: '', subdomain: '', projectType: 'preview' })
  const [editLoading, setEditLoading] = useState(false)
  const [editError, setEditError] = useState('')
  const [archiveBusy, setArchiveBusy] = useState(false)

  useEffect(() => {
    fetchAllProjects()
  }, [fetchAllProjects])

  const customerMap = useMemo(() => {
    const map = {}
    for (const c of customers) {
      map[c.$id] = c.name || c.code || c.$id
    }
    return map
  }, [customers])

  const ticketMap = useMemo(() => {
    const map = {}
    for (const wo of workorders) {
      map[wo.$id] = wo.woid || wo.$id
    }
    return map
  }, [workorders])

  // Ticket-Dokument-ID -> Workorder (fuer Mitarbeiter-Zuordnung ueber assignedTo)
  const workorderById = useMemo(() => {
    const map = {}
    for (const wo of workorders) map[wo.$id] = wo
    return map
  }, [workorders])

  const sortedCustomers = useMemo(
    () => [...customers].sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''))),
    [customers]
  )
  const sortedEmployees = useMemo(
    () => [...employees].sort((a, b) => String(a.displayName || '').localeCompare(String(b.displayName || ''))),
    [employees]
  )

  const counts = useMemo(() => {
    // Vorlagen sind aus den normalen Ansichten ausgeblendet (eigene Ansicht, nur Admin)
    const active = projects.filter((p) => !p.archived && !p.isTemplate)
    return {
      all: active.length,
      unassigned: active.filter((p) => !p.customerId).length,
      assigned: active.filter((p) => Boolean(p.customerId)).length,
      archived: projects.filter((p) => p.archived).length,
      templates: projects.filter((p) => p.isTemplate && !p.archived).length,
    }
  }, [projects])

  const filteredProjects = useMemo(() => {
    // 1) Kategorie (Dropdown)
    let base
    if (filter === 'templates') base = projects.filter((p) => p.isTemplate && !p.archived)
    else if (filter === 'archived') base = projects.filter((p) => p.archived)
    else {
      const active = projects.filter((p) => !p.archived && !p.isTemplate)
      if (filter === 'unassigned') base = active.filter((p) => !p.customerId)
      else if (filter === 'assigned') base = active.filter((p) => Boolean(p.customerId))
      else base = active
    }

    // 2) Textsuche (Titel/Subdomain/Repo)
    const q = search.trim().toLowerCase()
    if (q) {
      base = base.filter((p) =>
        [p.projectName, p.subdomain, p.repoFullName, p.giteaRepoName].some((v) =>
          String(v || '').toLowerCase().includes(q)
        )
      )
    }

    // 3) Kunde
    if (customerFilter) base = base.filter((p) => p.customerId === customerFilter)

    // 4) Mitarbeiter (ueber das zugeordnete Ticket -> assignedTo)
    if (employeeFilter) {
      base = base.filter((p) => {
        const wo = p.ticketId ? workorderById[p.ticketId] : null
        return wo && wo.assignedTo === employeeFilter
      })
    }

    return base
  }, [projects, filter, search, customerFilter, employeeFilter, workorderById])

  const handleCreate = async (e) => {
    e.preventDefault()
    setCreateLoading(true)
    setCreateError('')
    try {
      const result = await createProjectFromTemplate({
        repoName: createForm.repoName || slugify(createForm.subdomain) || slugify(createForm.displayName),
        displayName: createForm.displayName,
        subdomain: slugify(createForm.subdomain),
        customerId: createForm.customerId || '',
        ticketId: '',
      })
      setShowCreateModal(false)
      setCreateForm({ displayName: '', subdomain: '', repoName: '', customerId: '' })
      setNotice(
        result.previewUrl
          ? `Projekt angelegt - Website: ${result.previewUrl}`
          : 'Projekt (ohne Website) angelegt.'
      )
      await fetchAllProjects()
      // Direkt zur Art-/Kunden-Zuordnung des neuen Repos
      if (result.projectId) navigate(`/projects/zuordnen/${result.projectId}`)
    } catch (err) {
      setCreateError(err.message || 'Projekt konnte nicht angelegt werden')
    } finally {
      setCreateLoading(false)
    }
  }

  const handleSyncRepos = async () => {
    setSyncLoading(true)
    setNotice('')
    try {
      const r = await syncGiteaRepos()
      setNotice(`Gitea-Sync: ${r.synced ?? '?'} Repos (${r.created ?? 0} neu, ${r.updated ?? 0} aktualisiert)`)
      await fetchAllProjects()
    } catch (err) {
      setNotice('Gitea-Sync fehlgeschlagen: ' + (err.message || 'unbekannt'))
    } finally {
      setSyncLoading(false)
    }
  }

  const handleAssignCustomer = async (project, customerId) => {
    setAssignBusyId(project.$id)
    setNotice('')
    if (customerId) {
      const r = await assignProjects([project.$id], { customerId, ticketId: project.ticketId || '' })
      const one = r.results[0]
      const summary = assignSummary(project.projectName, one.ok ? one.result : { error: one.error })
      setNotice(summary.warnings.length ? `${summary.text} – ${summary.warnings.join(' – ')}` : summary.text)
    } else {
      const r = await unassignProject(project.$id)
      if (!r.success) setNotice('Zuordnung fehlgeschlagen: ' + (r.error || 'unbekannt'))
    }
    await fetchAllProjects()
    setAssignBusyId('')
  }

  const handleHostNow = async (project) => {
    setHostBusyId(project.$id)
    setNotice('')
    try {
      // Deploy ueber die vorhandene PATCH-Route anstossen (Typ bleibt gleich)
      const r = await updateWebsiteProject(project.$id, { projectType: typeOf(project) })
      setNotice(
        r.deploy?.deployed
          ? `"${project.projectName}" wird jetzt gehostet${r.previewUrl ? ': ' + r.previewUrl : ''}`
          : `Deploy angestossen, aber nicht bestaetigt: ${r.deploy?.error || 'siehe Server-Logs'}`
      )
      await fetchAllProjects()
    } catch (err) {
      setNotice('Hosten fehlgeschlagen: ' + (err.message || 'unbekannt'))
    } finally {
      setHostBusyId('')
    }
  }

  // Bereits gehostetes Projekt erneut deployen (nach Website-Ueberarbeitung neu laden)
  const handleRefresh = async (project) => {
    setRefreshBusyId(project.$id)
    setNotice('')
    try {
      const r = await updateWebsiteProject(project.$id, { projectType: typeOf(project) })
      setNotice(
        r.deploy?.deployed
          ? `"${project.projectName}" wurde aktualisiert${r.previewUrl ? ': ' + r.previewUrl : ''}`
          : `Aktualisierung angestossen, aber nicht bestaetigt: ${r.deploy?.error || 'siehe Server-Logs'}`
      )
      await fetchAllProjects()
    } catch (err) {
      setNotice('Aktualisieren fehlgeschlagen: ' + (err.message || 'unbekannt'))
    } finally {
      setRefreshBusyId('')
    }
  }

  const openEdit = (project) => {
    setEditError('')
    setEditProject(project)
    setEditForm({
      projectName: project.projectName || '',
      subdomain: project.subdomain || '',
      projectType: typeOf(project),
    })
  }

  const handleEditSave = async (e) => {
    e.preventDefault()
    if (!editProject) return
    setEditLoading(true)
    setEditError('')
    try {
      const payload = {
        projectName: editForm.projectName,
        projectType: editForm.projectType,
      }
      if (editForm.projectType !== 'project') {
        payload.subdomain = slugify(editForm.subdomain)
      }
      const result = await updateWebsiteProject(editProject.$id, payload)
      setEditProject(null)
      setNotice(
        result.previewUrl
          ? `Projekt aktualisiert - ${result.isPublic ? 'oeffentlich' : 'Preview'}: ${result.previewUrl}`
          : 'Projekt aktualisiert.'
      )
      await fetchAllProjects()
    } catch (err) {
      setEditError(err.message || 'Projekt konnte nicht aktualisiert werden')
    } finally {
      setEditLoading(false)
    }
  }

  const handleArchiveToggle = async (project) => {
    const isArchived = Boolean(project.archived)
    if (!isArchived && !window.confirm(`Repository "${project.projectName}" wirklich archivieren? Die Preview-Website wird entfernt.`)) {
      return
    }
    setArchiveBusy(true)
    setEditError('')
    try {
      if (isArchived) {
        await unarchiveWebsiteProject(project.$id)
        setNotice(`"${project.projectName}" reaktiviert.`)
      } else {
        await archiveWebsiteProject(project.$id)
        setNotice(`"${project.projectName}" archiviert.`)
      }
      setEditProject(null)
      await fetchAllProjects()
    } catch (err) {
      setEditError(err.message || 'Archivieren fehlgeschlagen')
    } finally {
      setArchiveBusy(false)
    }
  }

  const FILTER_OPTIONS = [
    { value: 'all', label: `Alle Projekte (${counts.all})` },
    { value: 'unassigned', label: `Unzugeordnet (${counts.unassigned})` },
    { value: 'assigned', label: `Zugeordnet (${counts.assigned})` },
    // Vorlagen-Ansicht nur fuer Admins
    ...(isAdmin ? [{ value: 'templates', label: `Vorlagen (${counts.templates})` }] : []),
    { value: 'archived', label: `Archiviert (${counts.archived})` },
  ]

  // Typ-Optionen im Bearbeiten-Modal: adminOnly-Typen (Vorlage) nur fuer Admins
  const typeOptions = Object.entries(TYPES).filter(([, meta]) => isAdmin || !meta.adminOnly)

  return (
    <div className="main-content">
      <header className="text-center mb-2">
        <h2>Website-Projekte</h2>
      </header>

      <div className="mb-2" style={{ display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          type="search"
          className="form-control"
          placeholder="Nach Titel suchen…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ flex: '1 1 220px', minWidth: '180px', maxWidth: '320px' }}
        />
        <select
          className="form-control"
          style={{ width: 'auto', minWidth: '170px' }}
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          {FILTER_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <select
          className="form-control"
          style={{ width: 'auto', minWidth: '150px' }}
          value={customerFilter}
          onChange={(e) => setCustomerFilter(e.target.value)}
          title="Nach Kunde filtern"
        >
          <option value="">Alle Kunden</option>
          {sortedCustomers.map((c) => (
            <option key={c.$id} value={c.$id}>
              {c.name}{c.code ? ` (${c.code})` : ''}
            </option>
          ))}
        </select>
        <select
          className="form-control"
          style={{ width: 'auto', minWidth: '150px' }}
          value={employeeFilter}
          onChange={(e) => setEmployeeFilter(e.target.value)}
          title="Nach Mitarbeiter filtern"
        >
          <option value="">Alle Mitarbeiter</option>
          {sortedEmployees.map((emp) => (
            <option key={emp.$id} value={emp.userId}>
              {emp.displayName || emp.userId}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="btn btn-teal"
          style={{ padding: '8px 12px' }}
          onClick={() => setShowCreateModal(true)}
          title="Neues Projekt"
          aria-label="Neues Projekt"
        >
          <FaPlus />
        </button>
        <button
          type="button"
          className="btn btn-dark"
          style={{ padding: '8px 12px' }}
          onClick={handleSyncRepos}
          disabled={syncLoading}
          title="Gitea-Repos synchronisieren"
          aria-label="Gitea-Repos synchronisieren"
        >
          <FaArrowsRotate style={syncLoading ? { animation: 'spin 1s linear infinite' } : undefined} />
        </button>
      </div>

      {notice && (
        <div className="text-center mb-2">
          <span className="text-grey">{notice}</span>
        </div>
      )}

      {error && (
        <div className="bg-red text-white p-2 mb-2" style={{ borderRadius: '4px' }}>
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-center text-grey">Projekte werden geladen...</p>
      ) : filteredProjects.length === 0 ? (
        <div className="text-center p-4">
          <FaFolder size={64} className="text-grey" />
          <p className="text-grey mt-2">
            {filter === 'archived' ? 'Keine archivierten Projekte.' : 'Keine Projekte gefunden.'}
          </p>
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(330px, 1fr))',
            gap: '16px',
            alignItems: 'start',
          }}
        >
          {filteredProjects.map((project) => {
            const type = typeOf(project)
            const t = TYPES[type]
            const hosted = HOSTED_TYPES.has(type)
            const ready = isProjectReady(project)
            const needsHosting = hosted && !ready && !project.archived
            return (
              <div
                key={project.$id}
                className="card"
                style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px', opacity: project.archived ? 0.72 : 1 }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: '15px', wordBreak: 'break-word' }}>
                      {project.projectName || project.giteaRepoName || '(ohne Name)'}
                    </div>
                    {project.repoFullName && (
                      <div className="text-grey" style={{ fontSize: '12px', marginTop: '2px' }}>
                        {project.repoFullName}
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-end', flexShrink: 0 }}>
                    <span className={`badge ${t.badge}`} style={{ whiteSpace: 'nowrap' }}>
                      {t.icon} {t.short}
                    </span>
                    {hosted && !project.archived && (
                      <span className={`badge ${ready ? 'badge-ok' : 'badge-warn'}`} style={{ whiteSpace: 'nowrap' }}>
                        {ready ? 'gehostet' : 'nicht deployt'}
                      </span>
                    )}
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '13px' }}>
                  <Row label="Subdomain">
                    {project.subdomain
                      ? <code>{project.subdomain}</code>
                      : <span className="text-grey">ohne Website</span>}
                  </Row>
                  <Row label="Ticket">
                    {project.ticketId ? (ticketMap[project.ticketId] || project.ticketId) : <span className="text-grey">-</span>}
                  </Row>
                  <Row label="Status">
                    <span className="text-grey">{project.archived ? 'archiviert' : (project.status || '-')}</span>
                  </Row>
                </div>

                <div>
                  <label className="form-label" style={{ fontSize: '12px' }}>Kunde</label>
                  <select
                    className="form-control"
                    style={{ fontSize: '13px' }}
                    value={project.customerId || ''}
                    disabled={assignBusyId === project.$id || project.archived}
                    onChange={(e) => handleAssignCustomer(project, e.target.value)}
                  >
                    <option value="">Kein Kunde</option>
                    {customers.map((c) => (
                      <option key={c.$id} value={c.$id}>
                        ({c.code || ''}) {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', marginTop: 'auto' }}>
                  <button
                    type="button"
                    className="btn btn-dark"
                    style={{ padding: '8px 12px' }}
                    onClick={() => openEdit(project)}
                    title="Bearbeiten"
                    aria-label="Bearbeiten"
                  >
                    <FaPen />
                  </button>
                  {needsHosting ? (
                    <button
                      type="button"
                      className="btn btn-teal"
                      style={{ padding: '8px 12px' }}
                      onClick={() => handleHostNow(project)}
                      disabled={hostBusyId === project.$id}
                      title="Projekt jetzt deployen/hosten"
                      aria-label="Projekt jetzt deployen/hosten"
                    >
                      <FaGlobe style={hostBusyId === project.$id ? { animation: 'spin 1s linear infinite' } : undefined} />
                    </button>
                  ) : (
                    <PreviewLinkButton href={project.previewUrl} />
                  )}
                  {hosted && ready && !project.archived && (
                    <button
                      type="button"
                      className="btn btn-dark"
                      style={{ padding: '8px 12px' }}
                      onClick={() => handleRefresh(project)}
                      disabled={refreshBusyId === project.$id}
                      title="Aktualisieren – Website neu deployen"
                      aria-label="Aktualisieren – Website neu deployen"
                    >
                      <FaArrowsRotate
                        style={refreshBusyId === project.$id ? { animation: 'spin 1s linear infinite' } : undefined}
                      />
                    </button>
                  )}
                  <GiteaLinkButton href={project.giteaRepoUrl} />
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* --- Neues Projekt --- */}
      {showCreateModal && (
        <div className="overlay">
          <span className="overlay-close" onClick={() => setShowCreateModal(false)}>×</span>
          <div className="overlay-content">
            <h2 className="mb-2">Neues Website-Projekt</h2>
            {createError && (
              <div className="bg-red text-white p-2 mb-2" style={{ borderRadius: '4px' }}>
                {createError}
              </div>
            )}
            <form onSubmit={handleCreate}>
              <div className="form-group">
                <label className="form-label">Anzeigename</label>
                <input
                  type="text"
                  className="form-control"
                  value={createForm.displayName}
                  onChange={(e) => setCreateForm((p) => ({ ...p, displayName: e.target.value }))}
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label">Subdomain (optional)</label>
                <input
                  type="text"
                  className="form-control"
                  value={createForm.subdomain}
                  onChange={(e) =>
                    setCreateForm((p) => ({
                      ...p,
                      subdomain: e.target.value,
                      repoName: p.repoName || slugify(e.target.value),
                    }))
                  }
                  placeholder="leer lassen = Projekt ohne Website"
                />
                <small className="text-grey">
                  Mit Subdomain wird die Website automatisch unter https://&lt;subdomain&gt;.project.webklar.com deployt.
                  Ohne Subdomain wird nur das Gitea-Repo als normales Projekt angelegt.
                </small>
              </div>
              <div className="form-group">
                <label className="form-label">Repo-Name (optional)</label>
                <input
                  type="text"
                  className="form-control"
                  value={createForm.repoName}
                  onChange={(e) => setCreateForm((p) => ({ ...p, repoName: e.target.value }))}
                  placeholder="leer = aus Anzeigename/Subdomain abgeleitet"
                />
              </div>
              <div className="form-group">
                <label className="form-label">Kunde (optional)</label>
                <select
                  className="form-control"
                  value={createForm.customerId}
                  onChange={(e) => setCreateForm((p) => ({ ...p, customerId: e.target.value }))}
                >
                  <option value="">Kein Kunde</option>
                  {customers.map((c) => (
                    <option key={c.$id} value={c.$id}>
                      ({c.code || ''}) {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="text-center mt-2">
                <button type="submit" className="btn btn-dark" disabled={createLoading}>
                  {createLoading ? 'Wird angelegt...' : 'Projekt anlegen'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- Projekt bearbeiten --- */}
      {editProject && (
        <div className="overlay">
          <span className="overlay-close" onClick={() => setEditProject(null)}>×</span>
          <div className="overlay-content">
            <h2 className="mb-2">Projekt bearbeiten</h2>
            <p className="text-grey mb-2" style={{ fontSize: '13px' }}>
              {editProject.repoFullName}
            </p>
            {editError && (
              <div className="bg-red text-white p-2 mb-2" style={{ borderRadius: '4px' }}>
                {editError}
              </div>
            )}
            <form onSubmit={handleEditSave}>
              <div className="form-group">
                <label className="form-label">Name</label>
                <input
                  type="text"
                  className="form-control"
                  value={editForm.projectName}
                  onChange={(e) => setEditForm((p) => ({ ...p, projectName: e.target.value }))}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Typ / Template</label>
                <select
                  className="form-control"
                  value={editForm.projectType}
                  onChange={(e) => setEditForm((p) => ({ ...p, projectType: e.target.value }))}
                >
                  {typeOptions.map(([key, meta]) => (
                    <option key={key} value={key}>{meta.label}</option>
                  ))}
                </select>
                <small className="text-grey">
                  <FaCircleInfo /> {TYPES[editForm.projectType].hint}
                </small>
              </div>

              {editForm.projectType !== 'project' && (
                <div className="form-group">
                  <label className="form-label">Subdomain</label>
                  <input
                    type="text"
                    className="form-control"
                    value={editForm.subdomain}
                    onChange={(e) => setEditForm((p) => ({ ...p, subdomain: e.target.value }))}
                    placeholder="z.B. musterfirma"
                  />
                  <small className="text-grey">
                    Ergebnis: https://{slugify(editForm.subdomain) || '<subdomain>'}.project.webklar.com
                    {' - '}Aenderung wird neu deployt (alte Subdomain wird abgebaut).
                  </small>
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', marginTop: '16px', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="btn"
                  style={{ background: editProject.archived ? 'var(--accent)' : 'var(--danger)', color: '#fff' }}
                  onClick={() => handleArchiveToggle(editProject)}
                  disabled={archiveBusy || editLoading}
                >
                  {editProject.archived
                    ? <><FaBoxOpen /> Reaktivieren</>
                    : <><FaBoxArchive /> Repository archivieren</>}
                </button>
                <button type="submit" className="btn btn-dark" disabled={editLoading || archiveBusy}>
                  {editLoading ? 'Speichert...' : 'Speichern & synchronisieren'}
                </button>
              </div>
            </form>
            {editForm.projectType !== 'project' && (
              <div className="form-group" style={{ marginTop: 16 }}>
                <label className="form-label">Preview</label>
                <PreviewBlock key={editProject.$id} projectId={editProject.$id} />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function Row({ label, children }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
      <span className="text-grey">{label}</span>
      <span style={{ textAlign: 'right', wordBreak: 'break-word' }}>{children}</span>
    </div>
  )
}
