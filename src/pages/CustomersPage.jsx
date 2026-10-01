import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { FaSpinner, FaPlus, FaStar } from 'react-icons/fa6'
import { useCustomers } from '../hooks/useCustomers'
import { useAuth } from '../context/AuthContext'
import { createLead, customerStage, isArchived } from '../lib/leads'
import { PageHeader, Card, Button, Badge, EmptyState, Field } from '../components/ui'

export default function CustomersPage() {
  const { customers, loading, refresh, createCustomer } = useCustomers()
  const { user, isAdmin } = useAuth()
  const [search, setSearch] = useState('')
  // 105 von 110 Eintraegen sind Leads der Lead-Automatik, deshalb startet die Liste bei den festen Kunden
  const [stage, setStage] = useState('customer') // customer | lead | all | archived
  const [showCreate, setShowCreate] = useState(null) // null | 'lead' | 'customer'

  const filtered = useMemo(() => {
    return (customers || [])
      .filter((c) => {
        const archived = isArchived(c)
        // Archivierte nur im Archiviert-Tab, sonst nie
        if (stage === 'archived') return archived
        if (archived) return false
        const st = customerStage(c)
        if (st === 'lost') return stage === 'all'
        if (stage === 'all') return true
        return st === stage
      })
      .filter((c) => {
        if (!search) return true
        const s = search.toLowerCase()
        return `${c.name} ${c.code || ''} ${c.location || ''} ${c.email || ''}`.toLowerCase().includes(s)
      })
  }, [customers, search, stage])

  return (
    <div className="page">
      <PageHeader
        title="Kunden"
        subtitle="Potenzielle Kunden (Leads) und feste Kunden – eine Pflege"
        actions={
          <>
            {isAdmin && (
              <Button onClick={() => setShowCreate((s) => (s === 'customer' ? null : 'customer'))}><FaPlus /> Neuer Kunde</Button>
            )}
            <Button variant="primary" onClick={() => setShowCreate((s) => (s === 'lead' ? null : 'lead'))}><FaPlus /> Neuer Lead</Button>
          </>
        }
      />

      {showCreate === 'lead' && (
        <div style={{ marginBottom: 16 }}>
          <CreateLeadForm
            onCancel={() => setShowCreate(null)}
            onDone={async (data) => {
              const r = await createLead(data, user)
              setShowCreate(null)
              refresh()
              return r
            }}
          />
        </div>
      )}

      {showCreate === 'customer' && isAdmin && (
        <div style={{ marginBottom: 16 }}>
          <CreateCustomerForm
            onCancel={() => setShowCreate(null)}
            onCreate={async (data) => {
              const r = await createCustomer(data)
              if (r.success) {
                setShowCreate(null)
                setStage('customer')
                refresh()
              }
              return r
            }}
          />
        </div>
      )}

      <Card pad={false}>
        <div className="ui-card-head" style={{ gap: 12, flexWrap: 'wrap' }}>
          <div className="seg">
            <button className={stage === 'customer' ? 'active' : ''} onClick={() => setStage('customer')}>Feste Kunden</button>
            <button className={stage === 'lead' ? 'active' : ''} onClick={() => setStage('lead')}>Leads</button>
            <button className={stage === 'all' ? 'active' : ''} onClick={() => setStage('all')}>Alle</button>
            <button className={stage === 'archived' ? 'active' : ''} onClick={() => setStage('archived')}>Archiviert</button>
          </div>
          <input className="form-control search-input" placeholder="Kunde suchen …" value={search} onChange={(e) => setSearch(e.target.value)} style={{ maxWidth: 320 }} />
        </div>
        <div className="ui-card-body" style={{ padding: 0 }}>
          {loading ? (
            <div className="empty"><FaSpinner className="spinner" /></div>
          ) : filtered.length === 0 ? (
            <EmptyState title="Keine Einträge" hint="Keine Kunden in dieser Ansicht." />
          ) : (
            <div className="list">
              {filtered.map((c) => {
                const st = customerStage(c)
                return (
                  <Link key={c.$id} to={`/customers/${c.$id}`} className="list-row">
                    <div className="side-logo" style={{ width: 34, height: 34, fontSize: 13 }}>
                      {(c.name || '?').charAt(0).toUpperCase()}
                    </div>
                    <div className="grow">
                      <div style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
                        {c.importantCustomer && <FaStar style={{ color: 'var(--warn)' }} title="Wichtiger Kunde" />}
                        {c.name}
                        {c.code && <span className="faint" style={{ fontWeight: 400 }}>· {c.code}</span>}
                      </div>
                      <div className="muted">{[c.location, c.email].filter(Boolean).join(' · ') || '-'}</div>
                    </div>
                    <div className="flex gap-2 wrap" style={{ justifyContent: 'flex-end' }}>
                      {isArchived(c) && <Badge tone="muted">Archiviert</Badge>}
                      {st === 'lead' && <Badge tone="warn" dot>Lead</Badge>}
                      {st === 'customer' && <Badge tone="ok" dot>Fester Kunde</Badge>}
                      {st === 'lost' && <Badge tone="muted">Abgesagt</Badge>}
                    </div>
                  </Link>
                )
              })}
            </div>
          )}
        </div>
      </Card>
    </div>
  )
}

function CreateLeadForm({ onCancel, onDone }) {
  const [company, setCompany] = useState('')
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const submit = async (e) => {
    e.preventDefault()
    if (!company.trim()) { setError('Unternehmen erforderlich'); return }
    setBusy(true); setError(null)
    try {
      await onDone({ company: company.trim(), email: email.trim() })
    } catch (err) {
      setError(err.message || 'Fehler')
      setBusy(false)
    }
  }

  return (
    <Card title="Neuer Lead (potenzieller Kunde)">
      <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
        Fuer einen Lead reichen Unternehmen und E-Mail. Es wird automatisch ein Akquise-Ticket erstellt.
      </p>
      <form onSubmit={submit}>
        <div className="flex gap-3 wrap">
          <Field label="Unternehmen"><input className="form-control" value={company} onChange={(e) => setCompany(e.target.value)} required /></Field>
          <Field label="E-Mail"><input className="form-control" type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
        </div>
        {error && <div className="text-red" style={{ marginBottom: 8 }}>{error}</div>}
        <div className="flex gap-2">
          <Button variant="primary" type="submit" disabled={busy}>{busy ? <FaSpinner className="spinner" /> : 'Lead anlegen + Akquise-Ticket'}</Button>
          <Button variant="ghost" type="button" onClick={onCancel}>Abbrechen</Button>
        </div>
      </form>
    </Card>
  )
}

// Fester Kunde mit Zugang zum Kundenportal (nur Admins; legt den Login im Portal an)
export function CreateCustomerForm({ onCancel, onCreate }) {
  const [form, setForm] = useState({ name: '', email: '', code: '', phone: '', location: '', password: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }))

  const submit = async (e) => {
    e.preventDefault()
    if (form.password.length < 8) { setError('Das Portal-Passwort muss mindestens 8 Zeichen haben.'); return }
    setBusy(true); setError(null)
    const r = await onCreate({ ...form, name: form.name.trim(), email: form.email.trim() })
    if (!r.success) {
      setError(r.error || 'Kunde konnte nicht angelegt werden.')
      setBusy(false)
    }
  }

  return (
    <Card title="Neuer Kunde mit Portal-Zugang">
      <form onSubmit={submit}>
        <div className="flex gap-3 wrap">
          <Field label="Unternehmen / Name"><input className="form-control" name="name" value={form.name} onChange={set('name')} required /></Field>
          <Field label="E-Mail (Portal-Login)"><input className="form-control" type="email" name="email" value={form.email} onChange={set('email')} required /></Field>
          <Field label="Kundennummer"><input className="form-control" name="code" value={form.code} onChange={set('code')} /></Field>
        </div>
        <div className="flex gap-3 wrap">
          <Field label="Telefon"><input className="form-control" name="phone" value={form.phone} onChange={set('phone')} /></Field>
          <Field label="Standort"><input className="form-control" name="location" value={form.location} onChange={set('location')} /></Field>
          <Field label="Portal-Passwort (mind. 8 Zeichen)"><input className="form-control" type="password" autoComplete="new-password" name="password" value={form.password} onChange={set('password')} required /></Field>
        </div>
        {error && <div className="text-red" style={{ marginBottom: 8 }}>{error}</div>}
        <div className="flex gap-2">
          <Button variant="primary" type="submit" disabled={busy}>{busy ? <FaSpinner className="spinner" /> : 'Kunde anlegen'}</Button>
          <Button variant="ghost" type="button" onClick={onCancel}>Abbrechen</Button>
        </div>
      </form>
    </Card>
  )
}
