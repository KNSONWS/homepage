import { useState, useEffect, useCallback } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { FaSpinner, FaStar, FaArrowLeft, FaFloppyDisk, FaArrowUp, FaKey, FaArrowUpRightFromSquare, FaBoxArchive, FaBoxOpen, FaTrash } from 'react-icons/fa6'
import { databases, DATABASE_ID, COLLECTIONS, Query } from '../lib/appwrite'
import { PageHeader, Card, Button, Badge, Tabs, EmptyState, Field } from '../components/ui'
import { StatusPill, UrgentPill } from '../components/ui/StatusPill'
import CustomerInvoices from '../components/finance/CustomerInvoices'
import AssignedProjectCard from '../components/AssignedProjectCard'
import CopyableCredential, { getCustomerPortalPassword } from '../components/CopyableCredential'
import { updateCustomerWithPortalAccess, deleteCustomerWithPortalAccess } from '../lib/customerAdminApi'
import { useAuth } from '../context/AuthContext'
import { useWebsiteProjects } from '../hooks/useWebsiteProjects'
import { customerTabs, resolveCustomerTab } from '../lib/customerTabs'
import { customerStage, isArchived, isInvoiceReady, setCustomerArchived, upgradeToCustomer } from '../lib/leads'

const PORTAL_URL = 'https://project.webklar.com'

export default function CustomerDetailPage() {
  const { id } = useParams()
  const [customer, setCustomer] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [tab, setTab] = useState('overview')
  const { isAdmin } = useAuth()
  const navigate = useNavigate()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setCustomer(await databases.getDocument(DATABASE_ID, COLLECTIONS.CUSTOMERS, id))
      setError(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => { load() }, [load])

  if (loading) return <div className="page"><div className="empty"><FaSpinner className="spinner" /></div></div>
  if (error || !customer) return <div className="page"><EmptyState title="Kunde nicht gefunden" hint={error} action={<Button as={Link} to="/customers"><FaArrowLeft /> Zurück</Button>} /></div>

  const stage = customerStage(customer)
  // „Rechnungen“ nur für Admins (die Finanzen-API gibt sonst 403); ein nicht erlaubter Reiter fällt auf die Übersicht zurück
  const activeTab = resolveCustomerTab(tab, isAdmin)
  const archived = isArchived(customer)

  const toggleArchived = async () => {
    await setCustomerArchived(customer, !archived)
    await load()
  }

  // Loescht Kunde und Portal-Login ueber die Admin-API des Kundenportals (nur Admins)
  const removeCustomer = async () => {
    if (!window.confirm(`${customer.name || customer.email} und den Portal-Zugang wirklich löschen?`)) return
    try {
      await deleteCustomerWithPortalAccess(customer.$id)
      navigate('/customers')
    } catch (err) {
      window.alert(`Löschen fehlgeschlagen: ${err.message}`)
    }
  }

  return (
    <div className="page">
      <PageHeader
        title={
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
            {customer.importantCustomer && <FaStar style={{ color: 'var(--warn)' }} />}
            {customer.name}
            {stage === 'lead' && <Badge tone="warn" dot>Lead</Badge>}
            {stage === 'customer' && <Badge tone="ok" dot>Fester Kunde</Badge>}
            {stage === 'lost' && <Badge tone="muted">Abgesagt</Badge>}
            {archived && <Badge tone="muted"><FaBoxArchive /> Archiviert</Badge>}
          </span>
        }
        subtitle={[customer.location, customer.email, customer.phone].filter(Boolean).join(' · ')}
        actions={
          <>
            <Button variant="ghost" onClick={toggleArchived}>
              {archived ? <><FaBoxOpen /> Wiederherstellen</> : <><FaBoxArchive /> Archivieren</>}
            </Button>
            {isAdmin && <Button variant="danger" onClick={removeCustomer}><FaTrash /> Kunde löschen</Button>}
            <Button variant="ghost" as={Link} to="/customers"><FaArrowLeft /> Alle Kunden</Button>
          </>
        }
      />

      <Tabs tabs={customerTabs(isAdmin)} active={activeTab} onChange={setTab} />

      {activeTab === 'overview' && <OverviewTab customer={customer} stage={stage} onSaved={load} />}
      {activeTab === 'tickets' && <CustomerTickets customerId={customer.$id} />}
      {activeTab === 'invoices' && <CustomerInvoices customer={customer} onShowOverview={() => setTab('overview')} />}
      {activeTab === 'projects' && <CustomerProjects customerId={customer.$id} />}
    </div>
  )
}

function OverviewTab({ customer, stage, onSaved }) {
  const [form, setForm] = useState({
    name: customer.name || '',
    companyName: customer.companyName || customer.name || '',
    code: customer.code || '',
    email: customer.email || '',
    phone: customer.phone || '',
    contactName: customer.contactName || '',
    street: customer.street || '',
    postalCode: customer.postalCode || '',
    city: customer.city || '',
    country: customer.country || 'Deutschland',
    vatNumber: customer.vatNumber || '',
    location: customer.location || '',
    notes: customer.notes || '',
    importantCustomer: !!customer.importantCustomer,
  })
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)

  const ready = isInvoiceReady({ ...customer, ...form })

  const save = async () => {
    setBusy(true); setMsg(null)
    try {
      await databases.updateDocument(DATABASE_ID, COLLECTIONS.CUSTOMERS, customer.$id, form)
      setMsg('Gespeichert')
      onSaved()
    } catch (err) {
      setMsg('Fehler: ' + err.message)
    } finally { setBusy(false) }
  }

  const upgrade = async () => {
    if (!ready) { setMsg('Bitte zuerst alle Pflichtfelder (Unternehmen, E-Mail, Strasse, PLZ, Stadt) ausfuellen.'); return }
    setBusy(true); setMsg(null)
    try {
      await upgradeToCustomer(customer, form)
      setMsg('Zum festen Kunden gemacht.')
      onSaved()
    } catch (err) {
      setMsg('Fehler: ' + err.message)
    } finally { setBusy(false) }
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
      <Card title="Stammdaten">
        <div className="flex gap-3 wrap">
          <Field label="Unternehmen / Name"><input className="form-control" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value, companyName: e.target.value })} /></Field>
          <Field label="Code"><input className="form-control" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} /></Field>
        </div>
        <div className="flex gap-3 wrap">
          <Field label="E-Mail"><input className="form-control" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
          <Field label="Telefon"><input className="form-control" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
        </div>
        <Field label="Standort"><input className="form-control" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} /></Field>
        <Field label="Ansprechpartner"><input className="form-control" value={form.contactName} onChange={(e) => setForm({ ...form, contactName: e.target.value })} /></Field>
        <Field label="Notizen"><textarea className="form-control" rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
        <label className="flex items-center gap-2" style={{ marginBottom: 12, cursor: 'pointer' }}>
          <input type="checkbox" checked={form.importantCustomer} onChange={(e) => setForm({ ...form, importantCustomer: e.target.checked })} />
          Wichtiger Kunde
        </label>
        <div className="flex gap-2 items-center wrap">
          <Button variant="primary" onClick={save} disabled={busy}>{busy ? <FaSpinner className="spinner" /> : <><FaFloppyDisk /> Speichern</>}</Button>
          {stage === 'lead' && <Button onClick={upgrade} disabled={busy}><FaArrowUp /> Zum festen Kunden machen</Button>}
          {msg && <span className="muted">{msg}</span>}
        </div>
      </Card>

      <Card title="Rechnungsdaten">
        {!ready && <div className="badge badge-warn" style={{ marginBottom: 12 }}>Adresse unvollständig</div>}
        <Field label="Strasse + Nr."><input className="form-control" value={form.street} onChange={(e) => setForm({ ...form, street: e.target.value })} /></Field>
        <div className="flex gap-3 wrap">
          <Field label="PLZ"><input className="form-control" value={form.postalCode} onChange={(e) => setForm({ ...form, postalCode: e.target.value })} /></Field>
          <Field label="Stadt"><input className="form-control" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} /></Field>
        </div>
        <div className="flex gap-3 wrap">
          <Field label="Land"><input className="form-control" value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} /></Field>
          <Field label="USt-IdNr."><input className="form-control" value={form.vatNumber} onChange={(e) => setForm({ ...form, vatNumber: e.target.value })} /></Field>
        </div>
      </Card>

      <PortalAccessCard customer={customer} onSaved={onSaved} />
    </div>
  )
}

function PortalAccessCard({ customer, onSaved }) {
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)

  const hasAccess = Boolean(customer.portalAccessEnabled && customer.appwriteUserId)
  const currentPassword = getCustomerPortalPassword(customer)

  const savePassword = async () => {
    if (!customer.email) {
      setMsg('Bitte zuerst eine E-Mail-Adresse in den Stammdaten speichern.')
      return
    }
    if (!password || password.length < 8) {
      setMsg('Das Passwort muss mindestens 8 Zeichen haben.')
      return
    }
    setBusy(true); setMsg(null)
    try {
      await updateCustomerWithPortalAccess(customer.$id, { password })
      setPassword('')
      setMsg(hasAccess ? 'Passwort aktualisiert.' : 'Portal-Zugang angelegt.')
      onSaved()
    } catch (err) {
      setMsg('Fehler: ' + err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card title="Portal-Zugang">
      <div className="flex items-center justify-between" style={{ marginBottom: 12 }}>
        <span className="muted">Kundenportal</span>
        {hasAccess
          ? <Badge tone="ok" dot>freigeschaltet</Badge>
          : <Badge tone="muted">kein Zugang</Badge>}
      </div>

      <Field label="Login (E-Mail)">
        <CopyableCredential value={customer.email} label="Login" />
      </Field>
      <Field label="Passwort">
        <CopyableCredential value={currentPassword} secret label="Passwort" />
      </Field>

      <Field label={hasAccess ? 'Neues Passwort setzen' : 'Passwort festlegen (min. 8 Zeichen)'}>
        <input
          className="form-control"
          type="text"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="min. 8 Zeichen"
          autoComplete="off"
        />
      </Field>

      <div className="flex gap-2 items-center wrap">
        <Button variant="primary" onClick={savePassword} disabled={busy}>
          {busy ? <FaSpinner className="spinner" /> : <><FaKey /> {hasAccess ? 'Passwort ändern' : 'Zugang anlegen'}</>}
        </Button>
        <Button as="a" href={PORTAL_URL} target="_blank" rel="noreferrer" variant="ghost">
          <FaArrowUpRightFromSquare /> Portal öffnen
        </Button>
        {msg && <span className="muted">{msg}</span>}
      </div>
      <p className="muted" style={{ marginTop: 8, fontSize: 13 }}>
        Der Kunde meldet sich mit dieser E-Mail und dem Passwort unter {PORTAL_URL} an
        und sieht dort seine Projekte/Previews.
      </p>
    </Card>
  )
}

function CustomerTickets({ customerId }) {
  const [tickets, setTickets] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    ;(async () => {
      setLoading(true)
      try {
        const res = await databases.listDocuments(DATABASE_ID, COLLECTIONS.WORKORDERS, [
          Query.equal('customerId', customerId),
          Query.orderDesc('$createdAt'),
          Query.limit(100),
        ])
        if (active) setTickets(res.documents)
      } catch {
        if (active) setTickets([])
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => { active = false }
  }, [customerId])

  if (loading) return <Card><FaSpinner className="spinner" /></Card>
  if (tickets.length === 0) return <Card><EmptyState title="Keine Tickets" hint="Fuer diesen Kunden gibt es noch keine Tickets." /></Card>

  return (
    <Card pad={false}>
      <div className="list">
        {tickets.map((t) => (
          <div key={t.$id} className="list-row">
            <span className="mono" style={{ color: 'var(--accent)', minWidth: 60 }}>{t.woid || t.$id.slice(-5)}</span>
            <div className="grow">
              <div style={{ fontWeight: 600 }}>{t.topic || t.title || '-'}</div>
              <div className="muted">{t.type}</div>
            </div>
            <UrgentPill priority={t.priority} />
            <StatusPill status={t.status} />
          </div>
        ))}
      </div>
    </Card>
  )
}

function CustomerProjects({ customerId }) {
  const { fetchAllProjects } = useWebsiteProjects()
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    ;(async () => {
      setLoading(true)
      const all = await fetchAllProjects()
      if (active) setProjects((all || []).filter((p) => p.customerId === customerId))
      if (active) setLoading(false)
    })()
    return () => { active = false }
  }, [customerId, fetchAllProjects])

  if (loading) return <Card><FaSpinner className="spinner" /></Card>
  if (projects.length === 0) return <Card><EmptyState title="Keine Projekte" hint="Diesem Kunden sind keine Projekte/Previews zugeordnet." /></Card>

  return (
    <Card title={`Projekte (${projects.length})`}>
      {projects.map((p) => <AssignedProjectCard key={p.$id} project={p} />)}
    </Card>
  )
}
