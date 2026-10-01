import { useState, useEffect, useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { FaSpinner } from 'react-icons/fa6'
import { dotColor } from '../lib/previewEnv'
import { fetchServices } from '../lib/projectKindsApi'
import { servicesCards } from '../lib/servicesView'
import { PageHeader, Card, Button, Badge } from '../components/ui'

export default function ServicesPage() {
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      setData(await fetchServices())
    } catch (err) {
      setError(err.message || 'Services konnten nicht geladen werden.')
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { load() }, [])

  const cards = useMemo(() => servicesCards(data), [data])

  if (loading) return <div className="page"><div className="empty"><FaSpinner className="spinner" /></div></div>

  return (
    <div className="page">
      <PageHeader title="Services" subtitle="Unsere Projekte nach Art" />
      {error && (
        <Card>
          <div className="text-red" style={{ marginBottom: 8 }}>{error}</div>
          <Button onClick={load}>Erneut versuchen</Button>
        </Card>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))', gap: 12 }}>
        {cards.map((c) => (
          <Card key={c.key} title={`${c.label} (${c.count})`}>
            {c.description && <div className="muted" style={{ marginBottom: 8 }}>{c.description}</div>}
            {c.features.length > 0 && (
              <div className="flex gap-2 wrap" style={{ marginBottom: 8 }}>
                {c.features.map((f) => (
                  <Badge key={f.label}>{f.label}{f.statusLabel ? ` · ${f.statusLabel}` : ''}</Badge>
                ))}
              </div>
            )}
            <div className="list">
              {c.projects.map((p) => (
                <div key={p.id} className="list-row" style={{ flexWrap: 'wrap' }}>
                  <div className="grow" style={{ minWidth: 0, overflowWrap: 'anywhere' }}>
                    <div style={{ fontWeight: 700 }}>
                      {p.previewState && (
                        <span
                          title={`Preview: ${p.previewState}`}
                          style={{ display: 'inline-block', width: 9, height: 9, borderRadius: '50%', background: dotColor(p.previewState), marginRight: 6 }}
                        >
                          <span style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' }}>{`Preview: ${p.previewState}`}</span>
                        </span>
                      )}
                      {p.projectName || p.repoFullName}
                      {p.features?.analyse === 'active' && <Badge>Analyse an</Badge>}
                    </div>
                    <div className="muted">
                      {[p.customerName, p.previewUrl && 'Preview'].filter(Boolean).join(' · ') || 'Intern'}
                    </div>
                  </div>
                  {p.woid && <Link to={`/tickets?woid=${encodeURIComponent(p.woid)}`}>Ticket #{p.woid}</Link>}
                  {c.key === 'missing' && (
                    <Button variant="primary" onClick={() => navigate(`/projects/zuordnen/${p.id}`)}>Zuordnen</Button>
                  )}
                </div>
              ))}
              {c.projects.length === 0 && <div className="muted" style={{ padding: 12 }}>Noch keine Projekte.</div>}
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}
