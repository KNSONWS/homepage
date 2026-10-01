import { useState } from 'react'
import { FaChevronDown, FaPlay, FaStop, FaPlus } from 'react-icons/fa6'
import { formatDistanceToNow, format } from 'date-fns'
import { de } from 'date-fns/locale'
import StatusDropdown from './StatusDropdown'
import UrgentToggle from './UrgentToggle'
import EditorDropdown from './EditorDropdown'
import CreateWorksheetModal from './CreateWorksheetModal'
import WorksheetList from './WorksheetList'
import WorksheetTimesModal from './WorksheetTimesModal'
import OwnSupportModal from './OwnSupportModal'
import WorksheetSummary from './WorksheetSummary'
import TicketProjects from './TicketProjects'
import ProjectContextPanel from './ProjectContextPanel'
import Tabs from './ui/Tabs'
import Badge from './ui/Badge'
import { StatusPill, UrgentPill } from './ui/StatusPill'
import { useWorksheets } from '../hooks/useWorksheets'
import { useCustomerAbo } from '../hooks/useCustomerAbo'
import { useAuth } from '../context/AuthContext'
import { databases, DATABASE_ID, COLLECTIONS } from '../lib/appwrite'
import { canEditWorksheetTimes } from '../lib/ticketForm'
import { canAddOwnSupport } from '../lib/support'
import { ticketTypeLabel } from '../lib/ticketStatus'

// Projekt / Preview steht mit im Details-Reiter
const TABS = [
  { id: 'details', label: 'Details' },
  { id: 'worksheets', label: 'Arbeitsblätter' },
]

export default function TicketCard({ ticket, onUpdate }) {
  const { user, employee } = useAuth()
  const [expanded, setExpanded] = useState(false)
  const [activeTab, setActiveTab] = useState('details')
  const [showCreateWorksheet, setShowCreateWorksheet] = useState(false)
  const [editTimesWorksheet, setEditTimesWorksheet] = useState(null)
  const [ownSupportWorksheet, setOwnSupportWorksheet] = useState(null)
  // Abo-Stundenkonto gibt es nur bei Wartungs-Abo; erst laden, wenn Arbeitsblaetter gebraucht werden
  const { hoursAllowed: aboHoursAllowed } = useCustomerAbo(
    ticket.customerId,
    (expanded && activeTab === 'worksheets') || showCreateWorksheet
  )

  const { worksheets, loading: worksheetsLoading, createWorksheet, updateWorksheet, updateWorksheetTimes, saveOwnSupport, getTotalTime } = useWorksheets(
    expanded ? ticket.woid : null
  )

  const createdAt = new Date(ticket.$createdAt || ticket.createdAt)
  const elapsed = formatDistanceToNow(createdAt, { locale: de, addSuffix: true })

  const stop = (e) => e.stopPropagation()

  // Abo-Stunden: Arbeitszeit vom Stundenguthaben des Wartungs-Abos abziehen oder nicht
  const handleTogglePlan = (ws) => updateWorksheet(ws.$id, { countsToPlan: !ws.countsToPlan })

  const handleCreateWorksheet = async (worksheetData, currentUser) => {
    const result = await createWorksheet(worksheetData, currentUser)
    if (result.success && worksheetData.newStatus !== ticket.status) {
      await onUpdate(ticket.$id, { status: worksheetData.newStatus })
    }
    // Akquise-Automatik: Ergebnis im Worksheet steuert den Kundenstatus
    if (result.success && ticket.type === 'Akquise' && ticket.customerId) {
      const outcome = worksheetData.newStatus
      const next = outcome === 'Zugesagt' ? 'customer' : outcome === 'Abgesagt' ? 'lost' : null
      if (next) {
        try {
          await databases.updateDocument(DATABASE_ID, COLLECTIONS.CUSTOMERS, ticket.customerId, {
            customerStatus: next,
            updatedAt: new Date().toISOString(),
          })
        } catch { /* nicht kritisch */ }
      }
    }
    return result
  }

  return (
    <div className={`tcard ${expanded ? 'open' : ''}`}>
      <div className="tcard-main" onClick={() => setExpanded((e) => !e)}>
        <div className="tcard-woid">
          <span className="id">{ticket.woid || ticket.$id?.slice(-5)}</span>
          <span className="age">{elapsed}</span>
        </div>

        <div className="tcard-body">
          <div className="tcard-row1">
            <span className="tcard-customer">{ticket.customerName || 'Unbekannt'}</span>
            {ticket.customerLocation && <span className="tcard-loc">· {ticket.customerLocation}</span>}
          </div>
          <div className="tcard-topic">{ticket.topic || ticket.title || 'Kein Betreff'}</div>
          <div className="tcard-badges">
            <StatusPill status={ticket.status} />
            <UrgentPill priority={ticket.priority} />
            {ticket.type && <Badge tone="muted">{ticketTypeLabel(ticket.type)}</Badge>}
          </div>
        </div>

        <div className="tcard-side" onClick={stop}>
          <div style={{ minWidth: 120 }}>
            <StatusDropdown value={ticket.status} onChange={(v) => onUpdate(ticket.$id, { status: v })} />
          </div>
          <UrgentToggle value={ticket.priority} onChange={(v) => onUpdate(ticket.$id, { priority: v })} />
          <FaChevronDown className={`chevron ${expanded ? 'up' : ''}`} onClick={() => setExpanded((e) => !e)} style={{ cursor: 'pointer' }} />
        </div>
      </div>

      {expanded && (
        <div className="tcard-detail">
          <div className="flex gap-3 wrap" style={{ marginBottom: 16, fontSize: 13 }}>
            <span className="muted"><FaPlay style={{ color: 'var(--ok)' }} /> {ticket.startDate || format(createdAt, 'dd.MM.yyyy')}</span>
            <span className="muted"><FaStop style={{ color: 'var(--danger)' }} /> {ticket.deadline || '-'}</span>
            {ticket.requestedBy && <span className="muted">Angefragt von: {ticket.requestedBy}</span>}
            <span className="grow" />
            <div style={{ minWidth: 150 }}><EditorDropdown value={ticket.assignedTo} onChange={(v) => onUpdate(ticket.$id, { assignedTo: v })} /></div>
          </div>

          <Tabs tabs={TABS} active={activeTab} onChange={setActiveTab} />

          <div className="ticket-tab-content">
            {activeTab === 'details' && (
              <div>
                <div className="ui-card pad" style={{ marginBottom: 16 }}>
                  <h5 style={{ fontWeight: 700, marginBottom: 12 }}>Ticket-Beschreibung</h5>
                  <p style={{ whiteSpace: 'pre-wrap', color: 'var(--text-muted)', lineHeight: 1.7, margin: 0 }}>
                    {ticket.details || 'Keine Details vorhanden.'}
                  </p>
                </div>
                <ProjectContextPanel ticket={ticket} />
                <TicketProjects ticket={ticket} />
              </div>
            )}

            {activeTab === 'worksheets' && (
              <div>
                <div className="flex gap-2" style={{ marginBottom: 16 }}>
                  <button className="ui-btn ui-btn-primary grow" onClick={() => setShowCreateWorksheet(true)}>
                    <FaPlus /> Arbeitsblatt hinzufügen
                  </button>
                </div>
                <WorksheetSummary worksheets={worksheets} />
                <WorksheetList
                  worksheets={worksheets}
                  totalTime={getTotalTime()}
                  loading={worksheetsLoading}
                  canEditTimes={(ws) => canEditWorksheetTimes(ws, user, employee)}
                  onEditTimes={setEditTimesWorksheet}
                  canAddSupport={(ws) => canAddOwnSupport(ws, user, employee)}
                  onOwnSupport={setOwnSupportWorksheet}
                  currentUserId={user?.$id}
                  onTogglePlan={handleTogglePlan}
                  aboHoursAllowed={aboHoursAllowed}
                />
              </div>
            )}
          </div>
        </div>
      )}

      <CreateWorksheetModal isOpen={showCreateWorksheet} onClose={() => setShowCreateWorksheet(false)} workorder={ticket} onCreate={handleCreateWorksheet} aboHoursAllowed={aboHoursAllowed} />
      {ownSupportWorksheet && (
        <OwnSupportModal
          worksheet={ownSupportWorksheet}
          currentUserId={user?.$id}
          onClose={() => setOwnSupportWorksheet(null)}
          onSave={(ws, task) => saveOwnSupport(ws, task, user, employee)}
        />
      )}
      {editTimesWorksheet && (
        <WorksheetTimesModal
          worksheet={editTimesWorksheet}
          currentUserId={user?.$id}
          onClose={() => setEditTimesWorksheet(null)}
          onSave={(ws, times) => updateWorksheetTimes(ws, times, user, employee)}
        />
      )}
    </div>
  )
}
