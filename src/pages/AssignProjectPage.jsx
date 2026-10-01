import { useState, useEffect, useMemo, useCallback } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { FaSpinner, FaPlus, FaArrowLeft, FaArrowRight, FaCheck } from 'react-icons/fa6'
import { useCustomers } from '../hooks/useCustomers'
import { useAuth } from '../context/AuthContext'
import { databases, DATABASE_ID, COLLECTIONS, Query } from '../lib/appwrite'
import { fetchServices, completeAssignment, fetchProject } from '../lib/projectKindsApi'
import { nextStep, prevStep, newTicketDefaults, canFinish, openTicketsFor } from '../lib/assignFlow'
import { suggestSubdomain } from '../lib/subdomain'
import { isArchived } from '../lib/leads'
import { PageHeader, Card, Button, Field } from '../components/ui'
import { CreateCustomerForm } from './CustomersPage'

const todayIso = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' })
const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString('de-DE') : '')
const slugify = (v) =>
  String(v || '').toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 63)

const STEP_TITLES = {
  kind: 'Was ist das?',
  'customer?': 'Ist das für einen Kunden?',
  customer: 'Welcher Kunde?',
  ticket: 'Welches Ticket?',
  summary: 'Zusammenfassung',
}

export default function AssignProjectPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { isAdmin } = useAuth()
  const { customers, createCustomer } = useCustomers()

  const [project, setProject] = useState(null)
  const [kinds, setKinds] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [notice, setNotice] = useState(null)
  const [done, setDone] = useState(null) // { warnings, path } nach Erfolg mit Warnungen

  const [state, setState] = useState({
    step: 'kind', kind: '', forCustomer: false, customerId: '', ticketId: '', newTicket: null,
  })
  const [search, setSearch] = useState('')
  const [showNewCustomer, setShowNewCustomer] = useState(false)
  const [tickets, setTickets] = useState([])
  const [ticketsLoading, setTicketsLoading] = useState(false)
  const [ticketsError, setTicketsError] = useState(false)
  const [ticketsReload, setTicketsReload] = useState(0)
  const [previewOn, setPreviewOn] = useState(true)
  const [subdomain, setSubdomain] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const [p, services] = await Promise.all([fetchProject(id), fetchServices()])
      setProject(p)
      setKinds(services.kinds || [])
    } catch (err) {
      setLoadError(err.message || 'Projekt konnte nicht geladen werden.')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => { load() }, [load])

  const repoName = String(project?.repoFullName || project?.projectName || '').split('/').pop()
  const repoUrl = project?.giteaRepoUrl || ''
  const kindObj = kinds.find((k) => k.key === state.kind)
  const customer = (customers || []).find((c) => c.$id === state.customerId)

  // Offene Tickets des Kunden laden, sobald Schritt 4 erreicht ist
  useEffect(() => {
    if (state.step !== 'ticket' || !state.customerId) return
    let cancelled = false
    setTicketsLoading(true)
    setTicketsError(false)
    databases
      .listDocuments(DATABASE_ID, COLLECTIONS.WORKORDERS, [
        Query.equal('customerId', state.customerId),
        Query.notEqual('status', 'Closed'),
        Query.notEqual('status', 'Cancelled'),
        Query.orderDesc('$createdAt'),
        Query.limit(200),
      ])
      .then((r) => { if (!cancelled) setTickets(r.documents || []) })
      .catch(() => { if (!cancelled) { setTickets([]); setTicketsError(true) } })
      .finally(() => { if (!cancelled) setTicketsLoading(false) })
    return () => { cancelled = true }
  }, [state.step, state.customerId, ticketsReload])

  const openTickets = useMemo(() => openTicketsFor(tickets, state.customerId), [tickets, state.customerId])

  const isWebsiteWithCustomer = state.kind === 'website' && state.forCustomer
  useEffect(() => {
    if (state.step === 'summary' && isWebsiteWithCustomer && !subdomain) {
      setSubdomain(suggestSubdomain('', repoName))
    }
  }, [state.step, isWebsiteWithCustomer, subdomain, repoName])

  const patch = (p) => setState((s) => ({ ...s, ...p }))
  const go = (step) => { setError(null); patch({ step }) }

  const startNewTicket = () => {
    patch({
      ticketId: '',
      newTicket: newTicketDefaults({
        kindLabel: kindObj?.label || '',
        ticketType: kindObj?.ticketType || 'Webpage',
        repoName,
        repoUrl,
        customer,
        today: todayIso(),
      }),
    })
  }
  const setNT = (field) => (e) => setState((s) => ({ ...s, newTicket: { ...s.newTicket, [field]: e.target.value } }))

  const stepReady = () => {
    switch (state.step) {
      case 'kind': return !!state.kind
      case 'customer': return !!state.customerId
      case 'ticket': return canFinish(state)
      default: return false
    }
  }

  const finish = async () => {
    setBusy(true)
    setError(null)
    // R9: nie newTicket.type senden, genau eins von ticketId / newTicket
    const body = { kind: state.kind, forCustomer: state.forCustomer }
    if (state.forCustomer) {
      body.customerId = state.customerId
      if (state.ticketId) {
        body.ticketId = state.ticketId
      } else {
        const { topic, requestedBy, startDate, details } = state.newTicket
        body.newTicket = { topic, requestedBy, startDate, details }
      }
      if (isWebsiteWithCustomer && previewOn && subdomain.trim()) {
        body.preview = { subdomain: slugify(subdomain) }
      }
    }
    try {
      const result = await completeAssignment(id, body)
      let path = state.forCustomer ? '/projects' : '/services'
      if (result.ticketId) {
        try {
          const t = await databases.getDocument(DATABASE_ID, COLLECTIONS.WORKORDERS, result.ticketId)
          path = `/tickets?woid=${encodeURIComponent(t.woid)}`
        } catch {
          path = '/tickets'
        }
      }
      if (result.warnings?.length) {
        setDone({ warnings: result.warnings, path })
        setBusy(false)
      } else {
        navigate(path)
      }
    } catch (err) {
      if (err.status === 409) {
        setNotice('Die Art wurde inzwischen von jemand anderem festgelegt.')
        await load()
      } else {
        setError(err.message || 'Abschließen fehlgeschlagen.')
      }
      setBusy(false)
    }
  }

  if (loading) return <div className="page"><div className="empty"><FaSpinner className="spinner" /></div></div>
  if (loadError) {
    return (
      <div className="page">
        <PageHeader title="Projekt zuordnen" />
        <Card><div className="text-red">{loadError}</div></Card>
      </div>
    )
  }

  const header = (
    <Card>
      <div style={{ fontWeight: 700, fontSize: 18 }}>{repoName || project.projectName}</div>
      <div className="muted" style={{ marginTop: 4 }}>
        {repoUrl && <a href={repoUrl} target="_blank" rel="noreferrer">Repository in Gitea öffnen</a>}
        {project.$createdAt && <> · angelegt am {fmtDate(project.$createdAt)}{project.createdByGitea ? ` von ${project.createdByGitea}` : ''}</>}
      </div>
    </Card>
  )

  if (done) {
    return (
      <div className="page">
        <PageHeader title="Projekt zuordnen" />
        {header}
        <Card title="Zugeordnet, mit Hinweisen">
          <ul style={{ marginTop: 0, paddingLeft: 18 }}>
            {done.warnings.map((w, i) => <li key={i}>{w}</li>)}
          </ul>
          <Button variant="primary" onClick={() => navigate(done.path)}>Weiter <FaArrowRight /></Button>
        </Card>
      </div>
    )
  }

  // Art bereits gesetzt: nur Hinweis ("Art ändern" bewusst nicht Teil dieser Aufgabe)
  if (project.kind) {
    return (
      <div className="page">
        <PageHeader title="Projekt zuordnen" />
        {header}
        <Card>
          {notice && <div className="text-red" style={{ marginBottom: 8 }}>{notice}</div>}
          <p style={{ marginTop: 0 }}>
            Bereits erledigt von <strong>{project.kindSetBy || 'unbekannt'}</strong> am {fmtDate(project.kindSetAt)}.
          </p>
          {project.ticketId && (
            <p style={{ marginBottom: 0 }}><TicketLink ticketId={project.ticketId} /></p>
          )}
        </Card>
      </div>
    )
  }

  const filteredCustomers = (customers || [])
    .filter((c) => !isArchived(c))
    .filter((c) => !search || `${c.name} ${c.code || ''} ${c.location || ''}`.toLowerCase().includes(search.toLowerCase()))

  return (
    <div className="page">
      <PageHeader title="Projekt zuordnen" subtitle={STEP_TITLES[state.step]} />
      {header}

      <Card title={STEP_TITLES[state.step]}>
        {state.step === 'kind' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
            {kinds.map((k) => (
              <Button
                key={k.key}
                variant={state.kind === k.key ? 'primary' : 'default'}
                style={{ padding: '18px 12px', fontSize: 16, fontWeight: 700 }}
                onClick={() => patch({ kind: k.key, newTicket: null, ticketId: '' })}
              >
                {k.label}
              </Button>
            ))}
          </div>
        )}

        {state.step === 'customer?' && (
          <div className="flex gap-2 wrap">
            <Button variant="primary" style={{ padding: '14px 28px' }}
              onClick={() => { patch({ forCustomer: true }); go('customer') }}>Ja, für einen Kunden</Button>
            <Button style={{ padding: '14px 28px' }}
              onClick={() => { patch({ forCustomer: false, customerId: '', ticketId: '', newTicket: null }); go('summary') }}>Nein, internes Projekt</Button>
          </div>
        )}

        {state.step === 'customer' && (
          <>
            <div className="flex gap-2 wrap" style={{ marginBottom: 10 }}>
              <input className="form-control search-input" placeholder="Kunde suchen …" value={search}
                onChange={(e) => setSearch(e.target.value)} style={{ maxWidth: 320 }} />
              {isAdmin && (
                <Button onClick={() => setShowNewCustomer((s) => !s)}><FaPlus /> Neuer Kunde</Button>
              )}
            </div>
            {showNewCustomer && isAdmin && (
              <div style={{ marginBottom: 12 }}>
                <CreateCustomerForm
                  onCancel={() => setShowNewCustomer(false)}
                  onCreate={async (data) => {
                    const r = await createCustomer(data)
                    if (r.success) {
                      setShowNewCustomer(false)
                      patch({ customerId: r.data.$id, ticketId: '', newTicket: null })
                    }
                    return r
                  }}
                />
              </div>
            )}
            <div className="list" style={{ maxHeight: 360, overflowY: 'auto' }}>
              {filteredCustomers.slice(0, 100).map((c) => (
                <div key={c.$id} className="list-row" style={{ cursor: 'pointer', background: state.customerId === c.$id ? 'var(--surface-2)' : undefined }}
                  onClick={() => patch({ customerId: c.$id, ticketId: '', newTicket: null })}>
                  <div className="grow">
                    <div style={{ fontWeight: 700 }}>{c.name}{c.code && <span className="faint" style={{ fontWeight: 400 }}> · {c.code}</span>}</div>
                    <div className="muted">{[c.location, c.email].filter(Boolean).join(' · ') || '-'}</div>
                  </div>
                  {state.customerId === c.$id && <FaCheck />}
                </div>
              ))}
              {filteredCustomers.length === 0 && <div className="muted" style={{ padding: 12 }}>Kein Kunde gefunden.</div>}
            </div>
          </>
        )}

        {state.step === 'ticket' && (
          <>
            {ticketsLoading ? <FaSpinner className="spinner" /> : ticketsError ? (
              <div style={{ marginBottom: 12 }}>
                <div className="text-red" style={{ marginBottom: 8 }}>Die Tickets des Kunden konnten nicht geladen werden.</div>
                <Button onClick={() => setTicketsReload((n) => n + 1)}>Erneut versuchen</Button>
              </div>
            ) : (
              <div className="list" style={{ marginBottom: 12 }}>
                {openTickets.map((t) => (
                  <div key={t.$id} className="list-row" style={{ cursor: 'pointer', background: state.ticketId === t.$id ? 'var(--surface-2)' : undefined }}
                    onClick={() => patch({ ticketId: t.$id, newTicket: null })}>
                    <div className="grow">
                      <div style={{ fontWeight: 700 }}>#{t.woid} {t.topic}</div>
                      <div className="muted">{[t.type, t.status].filter(Boolean).join(' · ')}</div>
                    </div>
                    {state.ticketId === t.$id && <FaCheck />}
                  </div>
                ))}
                {openTickets.length === 0 && <div className="muted" style={{ padding: 12 }}>Dieser Kunde hat keine offenen Tickets.</div>}
              </div>
            )}
            {!ticketsError && !ticketsLoading && (
              <Button variant={state.newTicket ? 'primary' : 'default'} onClick={startNewTicket}><FaPlus /> Neues Ticket anlegen</Button>
            )}
            {state.newTicket && (
              <div style={{ marginTop: 12 }}>
                <div className="flex gap-3 wrap">
                  <Field label="Thema"><input className="form-control" value={state.newTicket.topic} onChange={setNT('topic')} /></Field>
                  <Field label="Angefragt von"><input className="form-control" value={state.newTicket.requestedBy} onChange={setNT('requestedBy')} /></Field>
                  <Field label="Start"><input className="form-control" type="date" value={state.newTicket.startDate} onChange={setNT('startDate')} /></Field>
                </div>
                <Field label="Details"><textarea className="form-control" rows={3} value={state.newTicket.details} onChange={setNT('details')} /></Field>
                <div className="muted" style={{ fontSize: 13 }}>Ticket-Art: {kindObj?.ticketType === 'Migration' ? 'Migration' : 'Webpage'} (ergibt sich aus der Art)</div>
              </div>
            )}
          </>
        )}

        {state.step === 'summary' && (
          <>
            <ul style={{ marginTop: 0, paddingLeft: 18 }}>
              <li>Art: <strong>{kindObj?.label}</strong></li>
              <li>{state.forCustomer ? <>Kunde: <strong>{customer?.name}</strong></> : 'Internes Projekt (ohne Kunde)'}</li>
              {state.forCustomer && (
                <li>
                  {state.ticketId
                    ? <>Ticket: <strong>{openTickets.find((t) => t.$id === state.ticketId)?.topic || 'vorhandenes Ticket'}</strong></>
                    : <>Neues Ticket: <strong>{state.newTicket?.topic}</strong></>}
                </li>
              )}
            </ul>
            {isWebsiteWithCustomer && (
              <div style={{ marginBottom: 12 }}>
                <label className="flex gap-2" style={{ alignItems: 'center' }}>
                  <input type="checkbox" checked={previewOn} onChange={(e) => setPreviewOn(e.target.checked)} />
                  Preview einschalten
                </label>
                {previewOn && (
                  <Field label="Subdomain" hint={`Ergebnis: https://${slugify(subdomain) || '<subdomain>'}.project.webklar.com`}>
                    <input className="form-control" value={subdomain} onChange={(e) => setSubdomain(e.target.value)} />
                  </Field>
                )}
              </div>
            )}
            <Button variant="primary" disabled={busy || !canFinish(state) || (isWebsiteWithCustomer && previewOn && !slugify(subdomain))} onClick={finish}>
              {busy ? <FaSpinner className="spinner" /> : <><FaCheck /> Abschließen</>}
            </Button>
          </>
        )}

        {error && <div className="text-red" style={{ marginTop: 10 }}>{error}</div>}

        <div className="flex gap-2" style={{ marginTop: 16 }}>
          {state.step !== 'kind' && (
            <Button variant="ghost" disabled={busy} onClick={() => go(prevStep(state))}><FaArrowLeft /> Zurück</Button>
          )}
          {(state.step === 'kind' || state.step === 'customer' || state.step === 'ticket') && (
            <Button variant="primary" disabled={!stepReady()} onClick={() => go(nextStep(state))}>Weiter <FaArrowRight /></Button>
          )}
        </div>
      </Card>
    </div>
  )
}

function TicketLink({ ticketId }) {
  const [woid, setWoid] = useState(null)
  useEffect(() => {
    databases.getDocument(DATABASE_ID, COLLECTIONS.WORKORDERS, ticketId)
      .then((t) => setWoid(t.woid)).catch(() => setWoid(null))
  }, [ticketId])
  return woid ? <Link to={`/tickets?woid=${encodeURIComponent(woid)}`}>Zum Ticket #{woid}</Link> : null
}
