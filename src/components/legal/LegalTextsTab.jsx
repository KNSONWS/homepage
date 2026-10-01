import { useState } from 'react'
import { Badge, Button, Card } from '../ui'
import { currentVersion, formatDate } from '../../lib/legal'
import VersionForm from './VersionForm'
import { FileLinks } from './legalUi'

const byNewest = (a, b) => (b.validFrom || '').localeCompare(a.validFrom || '')

export default function LegalTextsTab({ documents, versions, fileNames, addVersion, promoteDraft }) {
  const [open, setOpen] = useState(null)
  const [formFor, setFormFor] = useState(null)
  const [actionError, setActionError] = useState(null)

  const promote = async (v) => {
    setActionError(null)
    try {
      await promoteDraft(v)
    } catch (err) {
      setActionError(err.message)
    }
  }

  return (
    <div className="legal-grid">
      {actionError && <div className="legal-error">{actionError}</div>}
      {documents.map((doc) => {
        const own = versions.filter((v) => v.documentKey === doc.key).sort(byNewest)
        const current = currentVersion(own)
        const drafts = own.filter((v) => v.status === 'draft')
        const expanded = open === doc.key
        return (
          <Card
            key={doc.$id}
            className="legal-doc"
            title={doc.title}
            actions={<Button size="sm" onClick={() => setFormFor(doc)}>Neue Version</Button>}
          >
            <div className="legal-doc-summary" onClick={() => setOpen(expanded ? null : doc.key)} role="button">
              {current ? (
                <Badge tone="ok">{current.version} · gilt seit {formatDate(current.validFrom)}</Badge>
              ) : (
                <Badge tone="muted">noch keine gültige Version</Badge>
              )}
              {drafts.map((d) => (
                <Badge key={d.$id} tone="muted">Entwurf {d.version}</Badge>
              ))}
              <span className="faint legal-toggle">{expanded ? 'Verlauf ausblenden' : `Verlauf (${own.length})`}</span>
            </div>
            {doc.liveUrl && (
              <a href={doc.liveUrl} target="_blank" rel="noreferrer" className="legal-live">Live-Seite öffnen</a>
            )}
            {expanded && (
              <ol className="legal-history">
                {own.length === 0 && <li className="faint">Noch keine Versionen eingetragen.</li>}
                {own.map((v) => (
                  <li key={v.$id} className={`legal-version legal-version-${v.status}`}>
                    <div className="legal-version-head">
                      <strong>{v.version}</strong>
                      <span>{formatDate(v.validFrom)} – {v.status === 'current' ? 'heute' : formatDate(v.validTo)}</span>
                      {v.status === 'current' && <Badge tone="ok">gültig</Badge>}
                      {v.status === 'draft' && <Badge tone="muted">Entwurf</Badge>}
                      {v.status === 'draft' && (
                        <Button size="sm" onClick={() => promote(v)}>Als gültig markieren</Button>
                      )}
                    </div>
                    {v.changeNote && <div className="legal-note">{v.changeNote}</div>}
                    <FileLinks fileIds={v.fileIds} fileNames={fileNames} />
                  </li>
                ))}
              </ol>
            )}
          </Card>
        )
      })}
      {formFor && (
        <VersionForm
          title={formFor.title}
          onSave={(input, files) => addVersion(formFor.key, input, files)}
          onClose={() => setFormFor(null)}
        />
      )}
    </div>
  )
}
