import { useState } from 'react'
import { FaCodeBranch } from 'react-icons/fa'
import { FaLinkSlash } from 'react-icons/fa6'
import PreviewBlock from './PreviewBlock'
import AnalyseRow from './AnalyseRow'
import GiteaLinkButton from './GiteaLinkButton'
import PreviewLinkButton from './PreviewLinkButton'
import { suggestSubdomain } from '../lib/subdomain'
import { needsPreviewButton, assignSummary } from '../lib/projectAssign'
import { updateWebsiteProject, backfillProjectPushes } from '../lib/projectAdminApi'

const STATUS_COLORS = {
  ready: '#10b981',
  live: '#10b981',
  online: '#10b981',
  provisioning: '#f59e0b',
  pending: '#f59e0b',
  building: '#3b82f6',
  error: '#ef4444',
  failed: '#ef4444',
}

function StatusBadge({ label, value }) {
  if (!value) return null
  const color = STATUS_COLORS[String(value).toLowerCase()] || '#a0aec0'
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#cbd5e0', marginRight: 12 }}>
      {label}:
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, display: 'inline-block' }} />
        {value}
      </span>
    </span>
  )
}

export default function AssignedProjectCard({ project, onUnassign, showActions = false, customerName = '', onChanged = () => {} }) {
  const [showPreviewInput, setShowPreviewInput] = useState(false)
  const [subdomain, setSubdomain] = useState('')
  const [previewBusy, setPreviewBusy] = useState(false)
  const [previewMessage, setPreviewMessage] = useState('')
  const [pushBusy, setPushBusy] = useState(false)
  const [pushMessage, setPushMessage] = useState('')
  const [showPreviewBlock, setShowPreviewBlock] = useState(false)

  const openPreviewInput = () => {
    setSubdomain(suggestSubdomain(customerName, project.projectName))
    setPreviewMessage('')
    setShowPreviewInput(true)
  }

  const handleEnablePreview = async () => {
    setPreviewBusy(true)
    setPreviewMessage('')
    try {
      const r = await updateWebsiteProject(project.$id, { projectType: 'preview', subdomain })
      setPreviewMessage(`Preview läuft: ${r.previewUrl}`)
      setShowPreviewInput(false)
      onChanged()
    } catch (err) {
      setPreviewMessage(err.message)
    } finally {
      setPreviewBusy(false)
    }
  }

  const handleBackfill = async () => {
    setPushBusy(true)
    setPushMessage('')
    try {
      const r = await backfillProjectPushes(project.$id)
      setPushMessage(assignSummary(project.projectName, r).text)
      onChanged()
    } catch (err) {
      setPushMessage(err.message)
    } finally {
      setPushBusy(false)
    }
  }

  return (
    <div style={{ background: 'rgba(30,41,59,0.5)', border: '1px solid rgba(59,130,246,0.25)', borderRadius: 10, padding: '12px 14px', marginBottom: 12 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div style={{ minWidth: 0 }}>
          <strong>{project.projectName}</strong>
          {project.subdomain && <span className="text-grey" style={{ marginLeft: 8, fontSize: 13 }}>({project.subdomain})</span>}
          {project.repoFullName && (
            <div className="text-grey" style={{ fontSize: 12, marginTop: 4 }}>
              <FaCodeBranch style={{ marginRight: 4 }} />{project.repoFullName}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
          <PreviewLinkButton href={project.previewUrl} />
          <GiteaLinkButton href={project.giteaRepoUrl} />
          {showActions && onUnassign && (
            <button
              type="button"
              title="Vom Ticket lösen"
              aria-label="Vom Ticket lösen"
              onClick={() => onUnassign(project.$id)}
              style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, borderRadius: 6, background: 'rgba(239, 68, 68, 0.12)', border: '1px solid rgba(239, 68, 68, 0.35)', color: '#f87171', cursor: 'pointer' }}
            >
              <FaLinkSlash size={16} />
            </button>
          )}
        </div>
      </div>

      {/* Status- und Provisioning-Zeile */}
      <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', alignItems: 'center' }}>
        <StatusBadge label="Status" value={project.status} />
        <StatusBadge label="Provisioning" value={project.provisioningStatus} />
      </div>

      {project.subdomain && <AnalyseRow key={project.$id} projectId={project.$id} />}

      {showActions && project.subdomain && (
        <div style={{ marginTop: 10 }}>
          <button
            type="button"
            className="btn btn-sm"
            aria-expanded={showPreviewBlock}
            onClick={() => setShowPreviewBlock((v) => !v)}
          >
            Preview {showPreviewBlock ? '▴' : '▾'}
          </button>
          {showPreviewBlock && (
            <div style={{ marginTop: 8 }}>
              <PreviewBlock key={project.$id} projectId={project.$id} />
            </div>
          )}
        </div>
      )}

      {showActions && (
        <div style={{ marginTop: 10 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            {needsPreviewButton(project) && !showPreviewInput && (
              <button type="button" className="btn btn-sm" onClick={openPreviewInput}>
                Preview einschalten
              </button>
            )}
            {showPreviewInput && (
              <>
                <input
                  type="text"
                  className="form-control"
                  style={{ maxWidth: 200 }}
                  value={subdomain}
                  onChange={(e) => setSubdomain(e.target.value)}
                />
                <button
                  type="button"
                  className="btn btn-sm"
                  disabled={!subdomain || previewBusy}
                  onClick={handleEnablePreview}
                >
                  Einschalten
                </button>
              </>
            )}
            <button type="button" className="btn btn-sm" disabled={pushBusy} onClick={handleBackfill}>
              Pushes nachtragen
            </button>
          </div>
          {(previewMessage || pushMessage) && (
            <div className="text-grey" style={{ marginTop: 6, fontSize: 12 }}>
              {previewMessage && <div>{previewMessage}</div>}
              {pushMessage && <div>{pushMessage}</div>}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
