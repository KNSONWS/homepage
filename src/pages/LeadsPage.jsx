import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  FaSpinner,
  FaStar,
  FaGear,
  FaPlus,
  FaXmark,
  FaMapLocationDot,
  FaGlobe,
  FaPhone,
  FaEnvelope,
  FaChevronDown,
  FaChevronUp,
  FaGitAlt,
  FaFloppyDisk,
  FaArrowsRotate,
  FaCheck,
  FaCopy,
  FaEye,
  FaHashtag,
  FaTriangleExclamation,
} from 'react-icons/fa6'
import { useLeads, useLeadSettings, useLeadCycle } from '../hooks/useLeads'
import { PageHeader, Card, Button, Badge, EmptyState, Field, Kpi } from '../components/ui'
import CopyableCredential from '../components/CopyableCredential'

// Schritte der Server-Pipeline (processor.py) — Reihenfolge = pipelineStep 1..5
const PIPELINE_STEPS = [
  'Lead erstellt',
  'Kunde & Repo',
  'Daten eingesetzt',
  'Personalisiert',
  'E-Mail erstellt',
]

const pulseStyle = `
@keyframes leadPulse { 0% { opacity: .35 } 50% { opacity: 1 } 100% { opacity: .35 } }
`

function scoreColor(score) {
  if (score >= 85) return '#34d399'
  if (score >= 70) return '#fbbf24'
  return '#f87171'
}

/** Balken ganz oben: laeuft von Minute 0 bis 5 (lastRunAt -> nextRunAt) und
 *  zeigt, wann der Server das naechste Mal nach neuen Leads schaut. Rechts
 *  ein Refresh-Icon, das den Lauf sofort ausloest (leadSettings.runNow). */
function CycleBar() {
  const { cycle, triggering, triggerNow } = useLeadCycle()
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  const last = cycle?.lastRunAt ? new Date(cycle.lastRunAt).getTime() : null
  const next = cycle?.nextRunAt ? new Date(cycle.nextRunAt).getTime() : null
  const active = Boolean(cycle?.workerBusy || cycle?.runNow || triggering)

  let pct = 0
  let label = 'Automatik-Status unbekannt'
  if (active) {
    pct = 100
    label = 'Pipeline läuft — Leads werden verarbeitet…'
  } else if (last && next && next > last) {
    pct = Math.min(100, Math.max(0, ((now - last) / (next - last)) * 100))
    const rest = Math.max(0, next - now)
    const m = Math.floor(rest / 60000)
    const s = Math.floor((rest % 60000) / 1000)
    label = rest > 0
      ? `Nächste Prüfung auf neue Leads in ${m}:${String(s).padStart(2, '0')} Min.`
      : 'Prüfung startet gleich…'
  }

  return (
    <div className="ui-card pad" style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 14 }}>
      <div className="grow" style={{ minWidth: 0 }}>
        <div className="flex" style={{ justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
          <div style={{ fontWeight: 600, fontSize: 13 }}>Lead-Automatik (alle 5 Minuten)</div>
          <div className="muted" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{label}</div>
        </div>
        <div style={{ height: 8, borderRadius: 4, background: 'var(--surface-2)', overflow: 'hidden', marginTop: 6 }}>
          <div
            style={{
              width: `${pct}%`,
              height: '100%',
              background: active ? '#3b82f6' : 'var(--accent, #3b82f6)',
              transition: 'width 1s linear',
              animation: active ? 'leadPulse 1.2s ease-in-out infinite' : 'none',
            }}
          />
        </div>
      </div>
      <Button
        size="sm"
        variant="ghost"
        onClick={triggerNow}
        disabled={active}
        title="Jetzt sofort auf neue Leads prüfen und verarbeiten"
        aria-label="Pipeline jetzt starten"
      >
        <FaArrowsRotate className={active ? 'spinner' : ''} />
      </Button>
    </div>
  )
}

export default function LeadsPage() {
  const { leads, pipelines, loading, error } = useLeads()
  const [search, setSearch] = useState('')
  const [showSettings, setShowSettings] = useState(false)

  const filtered = useMemo(() => {
    return (leads || [])
      .filter((l) => {
        if (!search) return true
        const s = search.toLowerCase()
        return `${l.firma} ${l.ort || ''} ${l.email || ''} ${l.branche || ''}`.toLowerCase().includes(s)
      })
  }, [leads, search])

  const kpis = useMemo(() => {
    const all = leads || []
    const avg = all.length
      ? Math.round(all.reduce((sum, l) => sum + (l.leadScore || 0), 0) / all.length)
      : 0
    const orte = new Set(all.map((l) => (l.ort || '').trim().toLowerCase()).filter(Boolean))
    return { total: all.length, avg, orte: orte.size }
  }, [leads])

  return (
    <div className="page">
      <style>{pulseStyle}</style>
      <PageHeader
        title="Leads"
        subtitle="Recherche-Ergebnisse der täglichen 06:00-Routine — hier nur Anzeige & Verfolgung, gearbeitet wird im Akquise-Ticket"
        actions={
          <Button variant={showSettings ? 'primary' : 'default'} onClick={() => setShowSettings((s) => !s)}>
            <FaGear /> Sucheinstellungen
          </Button>
        }
      />

      <CycleBar />

      {showSettings && (
        <div style={{ marginBottom: 16 }}>
          <LeadSettingsCard onClose={() => setShowSettings(false)} />
        </div>
      )}

      <div className="kpi-grid" style={{ marginBottom: 16 }}>
        <Kpi label="Leads gesamt" value={kpis.total} />
        <Kpi label="Ø Lead-Score" value={kpis.avg} accent="#f59e0b" />
        <Kpi label="Orte" value={kpis.orte} accent="#8b5cf6" />
      </div>

      <Card pad={false}>
        <div className="ui-card-head" style={{ gap: 12, flexWrap: 'wrap' }}>
          <input
            className="form-control search-input"
            placeholder="Lead suchen..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ maxWidth: 320 }}
          />
        </div>
        <div className="ui-card-body">
          {loading ? (
            <div className="empty"><FaSpinner className="spinner" /></div>
          ) : error ? (
            <EmptyState title="Fehler beim Laden" hint={error} />
          ) : filtered.length === 0 ? (
            <EmptyState
              title="Keine Leads"
              hint="Die 06:00-Routine liefert neue Leads automatisch hierher."
            />
          ) : (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
                gap: 14,
              }}
            >
              {filtered.map((lead) => (
                <LeadCard key={lead.$id} lead={lead} pipeline={pipelines[lead.leadId]} />
              ))}
            </div>
          )}
        </div>
      </Card>
    </div>
  )
}

/** Verfolgbarer Pipeline-Balken (5 Segmente) — zeigt pro Lead, welcher
 *  Automatik-Schritt erledigt ist, gerade laeuft oder fehlgeschlagen ist. */
function PipelineBar({ lead }) {
  const step = Number.isInteger(lead.pipelineStep) ? lead.pipelineStep : null
  if (step === null) return null
  const status = lead.pipelineStatus || 'idle'

  let label
  if (status === 'done') label = 'Automatisch verarbeitet ✓'
  else if (status === 'running') label = `${PIPELINE_STEPS[step] || 'Verarbeitung'} läuft…`
  else if (status === 'pending') label = 'Wartet auf den nächsten Lauf'
  else if (status === 'failed') label = `Fehler: ${PIPELINE_STEPS[step] || '?'}`
  else if (status === 'waiting_enrichment') label = 'Wartet auf Anreicherung (Bilder & Logo)'
  else label = step > 0 ? `Stand: ${PIPELINE_STEPS[step - 1]} (manuell)` : 'Keine Automatik'

  return (
    <div>
      <div style={{ display: 'flex', gap: 3 }}>
        {PIPELINE_STEPS.map((name, i) => {
          const n = i + 1
          let background = 'var(--surface-2)'
          let animation = 'none'
          if (n <= step) background = '#34d399'
          if (status === 'running' && n === step + 1) {
            background = '#3b82f6'
            animation = 'leadPulse 1.2s ease-in-out infinite'
          }
          if (status === 'failed' && n === step + 1) background = '#f87171'
          if (status === 'waiting_enrichment' && n === step + 1) background = '#fbbf24'
          if (status === 'idle' && n <= step) background = '#9ca3af'
          return (
            <div
              key={name}
              title={`${n}. ${name}`}
              style={{ flex: 1, height: 6, borderRadius: 3, background, animation }}
            />
          )
        })}
      </div>
      <div
        className={status === 'failed' ? 'text-red' : 'faint'}
        title={status === 'failed' ? lead.pipelineError || '' : label}
        style={{ fontSize: 11, marginTop: 3, display: 'flex', alignItems: 'center', gap: 4 }}
      >
        {status === 'failed' && <FaTriangleExclamation />}
        {label} · {Math.min(step, PIPELINE_STEPS.length)}/{PIPELINE_STEPS.length}
      </div>
    </div>
  )
}

/** Schritt-Log aus leadPipeline.steps (JSON) — im aufgeklappten Bereich. */
function PipelineLog({ pipeline }) {
  const steps = useMemo(() => {
    try {
      const parsed = JSON.parse(pipeline?.steps || '[]')
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }, [pipeline])
  if (steps.length === 0) return null
  return (
    <div>
      <strong>Pipeline-Verlauf:</strong>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginTop: 4 }}>
        {steps.map((s) => (
          <div key={s.n} className="flex gap-2" style={{ alignItems: 'baseline', fontSize: 12 }}>
            <span style={{ color: s.ok ? '#34d399' : '#f87171', flexShrink: 0 }}>
              {s.ok ? <FaCheck /> : <FaXmark />}
            </span>
            <span style={{ flexShrink: 0 }}>{s.n}. {s.name}</span>
            <span className="faint" style={{ flexShrink: 0 }}>
              {s.at ? new Date(s.at).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''}
            </span>
            {s.hint && <span className="muted">— {s.hint}</span>}
          </div>
        ))}
      </div>
    </div>
  )
}

/** Der von der Pipeline geschriebene E-Mail-Entwurf, mit Kopieren-Button. */
function EmailDraft({ pipeline }) {
  const [copied, setCopied] = useState(false)
  if (!pipeline?.emailText) return null
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(
        `Betreff: ${pipeline.emailBetreff || ''}\n\n${pipeline.emailText}`
      )
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch { /* Clipboard nicht verfuegbar */ }
  }
  return (
    <div>
      <div className="flex gap-2" style={{ alignItems: 'center' }}>
        <strong>E-Mail-Entwurf:</strong>
        <Button size="sm" variant="ghost" onClick={copy} title="E-Mail in die Zwischenablage kopieren">
          {copied ? <FaCheck /> : <FaCopy />}
        </Button>
      </div>
      {pipeline.emailBetreff && (
        <div style={{ fontWeight: 600, fontSize: 12, marginTop: 4 }}>{pipeline.emailBetreff}</div>
      )}
      <div
        className="muted"
        style={{ whiteSpace: 'pre-wrap', fontSize: 12, marginTop: 4, maxHeight: 220, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 6, padding: 8 }}
      >
        {pipeline.emailText}
      </div>
    </div>
  )
}

/** Reine Info-Anzeige — Status/Notizen werden NICHT hier gepflegt,
 *  sondern im Akquise-Ticket des Leads (WOID-Chip). */
function LeadCard({ lead, pipeline }) {
  const [open, setOpen] = useState(false)
  const score = lead.leadScore || 0

  const websiteUrl = /^https?:\/\//.test(lead.website || '') ? lead.website : null

  return (
    <div className="ui-card pad" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <div className="grow" style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {lead.firma}
            {lead.kategorie && <Badge tone={lead.kategorie === 'A' ? 'ok' : 'muted'}>Kat. {lead.kategorie}</Badge>}
          </div>
          <div className="muted">
            {[lead.ort, lead.branche].filter(Boolean).join(' · ')}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontWeight: 800, fontSize: 20, color: scoreColor(score) }}>{score}</div>
          <div className="faint" style={{ fontSize: 11 }}>Score</div>
        </div>
      </div>

      <div style={{ height: 6, borderRadius: 3, background: 'var(--surface-2)', overflow: 'hidden' }}>
        <div style={{ width: `${Math.min(100, score)}%`, height: '100%', background: scoreColor(score) }} />
      </div>

      <PipelineBar lead={lead} />

      <div className="flex gap-2 wrap" style={{ alignItems: 'center' }}>
        {lead.googleNote && (
          <Badge tone="warn">
            <FaStar /> {lead.googleNote} ({lead.anzahlBewertungen || 0})
          </Badge>
        )}
        {lead.processed && <Badge tone="ok">Kunde angelegt</Badge>}
      </div>

      {lead.websiteStatus && (
        <div className="muted" style={{ fontSize: 13 }}>
          <strong>Website:</strong> {lead.websiteStatus.length > 120 && !open
            ? lead.websiteStatus.slice(0, 120) + '…'
            : lead.websiteStatus}
        </div>
      )}

      <div className="flex gap-2 wrap" style={{ fontSize: 13 }}>
        {lead.email && (
          <a href={`mailto:${lead.email}`} className="muted" style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <FaEnvelope /> {lead.email}
          </a>
        )}
        {lead.telefon && (
          <a href={`tel:${lead.telefon.replace(/\s/g, '')}`} className="muted" style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <FaPhone /> {lead.telefon}
          </a>
        )}
      </div>

      <div className="flex gap-2 wrap" style={{ alignItems: 'center' }}>
        {lead.googleMapsLink && (
          <Button size="sm" as="a" href={lead.googleMapsLink} target="_blank" rel="noreferrer" title="Google Maps" aria-label="Google Maps">
            <FaMapLocationDot />
          </Button>
        )}
        {websiteUrl && (
          <Button size="sm" as="a" href={websiteUrl} target="_blank" rel="noreferrer" title="Bestehende Website" aria-label="Bestehende Website">
            <FaGlobe />
          </Button>
        )}
        {lead.repoUrl && (
          <Button size="sm" as="a" href={lead.repoUrl} target="_blank" rel="noreferrer" title="Preview-Repo (Gitea)" aria-label="Preview-Repo">
            <FaGitAlt />
          </Button>
        )}
        {lead.previewUrl && (
          <Button size="sm" variant="primary" as="a" href={lead.previewUrl} target="_blank" rel="noreferrer" title="Erstellte Vorschau-Website öffnen (Login-geschützt)" aria-label="Vorschau öffnen">
            <FaEye />
          </Button>
        )}
        {lead.woid && (
          <Button
            size="sm"
            variant="ghost"
            as={Link}
            to={`/tickets?woid=${lead.woid}`}
            title={`Akquise-Ticket WOID ${lead.woid} öffnen`}
            aria-label={`Ticket WOID ${lead.woid}`}
          >
            <FaHashtag />{lead.woid}
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={() => setOpen((o) => !o)} title={open ? 'Weniger' : 'Details'} style={{ marginLeft: 'auto' }}>
          {open ? <FaChevronUp /> : <FaChevronDown />}
        </Button>
      </div>

      {open && (
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13 }}>
          {lead.ansprechpartner && <div><strong>Ansprechpartner:</strong> {lead.ansprechpartner}</div>}
          {lead.adresse && <div><strong>Adresse:</strong> {lead.adresse}</div>}
          {lead.kernleistungen && <div><strong>Leistungen:</strong> {lead.kernleistungen}</div>}
          {lead.hauptmaengel && <div><strong>Hauptmängel:</strong> {lead.hauptmaengel}</div>}
          {lead.sympathie && <div><strong>Eindruck:</strong> {lead.sympathie}</div>}
          {(lead.portalLogin || lead.portalPasswort) && (
            <div className="flex gap-3 wrap">
              {lead.portalLogin && <CopyableCredential label="Portal-Login" value={lead.portalLogin} />}
              {lead.portalPasswort && <CopyableCredential label="Portal-Passwort" value={lead.portalPasswort} secret />}
            </div>
          )}
          <PipelineLog pipeline={pipeline} />
          {lead.pipelineStatus === 'failed' && lead.pipelineError && (
            <div className="text-red" style={{ fontSize: 12 }}>
              <FaTriangleExclamation /> {lead.pipelineError}
            </div>
          )}
          <EmailDraft pipeline={pipeline} />
          {lead.notiz && <div><strong>Notiz (Alt-Bestand):</strong> {lead.notiz}</div>}
          <div className="faint" style={{ fontSize: 11 }}>
            Aufgenommen: {lead.addedAt ? new Date(lead.addedAt).toLocaleDateString('de-DE') : '-'}
            {lead.leadId ? ` · ${lead.leadId}` : ''}
          </div>
        </div>
      )}
    </div>
  )
}

function LeadSettingsCard({ onClose }) {
  const { settings, loading, saveSettings } = useLeadSettings()
  const [form, setForm] = useState(null)
  const [newStadt, setNewStadt] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)

  // Formular einmalig aus den geladenen Settings befuellen
  if (!form && !loading && settings) {
    setForm({
      branche: settings.branche || '',
      staedte: settings.staedte || [],
      ganzDeutschland: Boolean(settings.ganzDeutschland),
      maxLeadsProStadt: settings.maxLeadsProStadt ?? 5,
      minBewertung: settings.minBewertung ?? 4.0,
      emailPflicht: settings.emailPflicht !== false,
      nurSchlechteWebsite: settings.nurSchlechteWebsite !== false,
      zusatzHinweise: settings.zusatzHinweise || '',
    })
  }

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }))

  const addStadt = () => {
    const s = newStadt.trim()
    if (!s) return
    if (!form.staedte.some((x) => x.toLowerCase() === s.toLowerCase())) {
      set('staedte', [...form.staedte, s])
    }
    setNewStadt('')
  }

  const save = async () => {
    setBusy(true)
    setMsg(null)
    const r = await saveSettings(form)
    setBusy(false)
    setMsg(r.success ? 'Gespeichert — gilt ab dem nächsten 06:00-Lauf.' : `Fehler: ${r.error}`)
  }

  return (
    <Card
      title="Sucheinstellungen der 06:00-Routine"
      actions={<Button variant="ghost" size="sm" onClick={onClose}><FaXmark /></Button>}
    >
      {loading || !form ? (
        <div className="empty"><FaSpinner className="spinner" /></div>
      ) : (
        <>
          <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
            Diese Einstellungen liest die tägliche Recherche-Routine vor jedem Lauf.
            Bereits vorhandene Leads und Kunden werden automatisch übersprungen.
          </p>
          <div className="flex gap-3 wrap">
            <Field label="Branche" hint="z. B. Autolackiererei, Kfz-Werkstatt, Dachdecker">
              <input
                className="form-control"
                value={form.branche}
                onChange={(e) => set('branche', e.target.value)}
              />
            </Field>
            <Field label="Max. neue Leads pro Stadt">
              <input
                className="form-control"
                type="number"
                min={1}
                max={20}
                value={form.maxLeadsProStadt}
                onChange={(e) => set('maxLeadsProStadt', e.target.value)}
                style={{ width: 120 }}
              />
            </Field>
            <Field label="Min. Google-Bewertung">
              <input
                className="form-control"
                type="number"
                step={0.1}
                min={0}
                max={5}
                value={form.minBewertung}
                onChange={(e) => set('minBewertung', e.target.value)}
                style={{ width: 120 }}
              />
            </Field>
          </div>

          <Field
            label="Städte / Regionen"
            hint={form.ganzDeutschland ? 'Ganz Deutschland aktiv — die Routine wählt selbst passende Regionen.' : 'Die Routine recherchiert in diesen Regionen.'}
          >
            <div className="flex gap-2 wrap" style={{ alignItems: 'center' }}>
              {form.staedte.map((s) => (
                <Badge key={s} tone={form.ganzDeutschland ? 'muted' : 'info'}>
                  {s}
                  <button
                    type="button"
                    onClick={() => set('staedte', form.staedte.filter((x) => x !== s))}
                    style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: '0 0 0 4px', display: 'inline-flex' }}
                    title={`${s} entfernen`}
                  >
                    <FaXmark />
                  </button>
                </Badge>
              ))}
              <input
                className="form-control"
                placeholder="Stadt hinzufügen..."
                value={newStadt}
                onChange={(e) => setNewStadt(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addStadt() } }}
                disabled={form.ganzDeutschland}
                style={{ width: 200 }}
              />
              <Button size="sm" type="button" onClick={addStadt} disabled={form.ganzDeutschland}>
                <FaPlus />
              </Button>
            </div>
          </Field>

          <div className="flex gap-3 wrap" style={{ margin: '10px 0' }}>
            <label className="flex gap-2" style={{ alignItems: 'center', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={form.ganzDeutschland}
                onChange={(e) => set('ganzDeutschland', e.target.checked)}
              />
              Komplett Deutschland
            </label>
            <label className="flex gap-2" style={{ alignItems: 'center', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={form.emailPflicht}
                onChange={(e) => set('emailPflicht', e.target.checked)}
              />
              Nur Leads mit auffindbarer E-Mail
            </label>
            <label className="flex gap-2" style={{ alignItems: 'center', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={form.nurSchlechteWebsite}
                onChange={(e) => set('nurSchlechteWebsite', e.target.checked)}
              />
              Nur ohne / mit veralteter Website
            </label>
          </div>

          <Field label="Zusätzliche Hinweise für die Recherche" hint="Freitext, wird der Routine wörtlich mitgegeben.">
            <textarea
              className="form-control"
              rows={3}
              value={form.zusatzHinweise}
              onChange={(e) => set('zusatzHinweise', e.target.value)}
              placeholder="z. B. Familienbetriebe bevorzugen, keine Franchise-Ketten..."
            />
          </Field>

          {msg && <div className={msg.startsWith('Fehler') ? 'text-red' : 'muted'} style={{ marginBottom: 8, fontSize: 13 }}>{msg}</div>}
          <div className="flex gap-2">
            <Button variant="primary" onClick={save} disabled={busy}>
              {busy ? <FaSpinner className="spinner" /> : <><FaFloppyDisk /> Speichern</>}
            </Button>
          </div>
        </>
      )}
    </Card>
  )
}
