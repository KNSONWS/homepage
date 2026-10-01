import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { FaAngleDown, FaSpinner, FaPlus, FaSliders } from 'react-icons/fa6'
import { useWorkorders } from '../hooks/useWorkorders'
import { useCustomers } from '../hooks/useCustomers'
import TicketCard from '../components/TicketCard'
import CreateTicketModal from '../components/CreateTicketModal'
import { PageHeader, Card, Button, EmptyState } from '../components/ui'
import { STATUS_GROUPS, DEFAULT_STATUS_GROUPS, statusValuesFor, TYPE_FILTERS } from '../lib/ticketStatus'

const ALL_GROUPS = STATUS_GROUPS.map((group) => group.id)
const linkButton = { fontSize: 12, background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', padding: 0 }

// Aus Suchtext, Art, Status-Gruppen und "Nur dringende" die Abfrage fuer useWorkorders bauen.
// Sind alle oder keine Status-Gruppen gewaehlt, wird nicht nach Status gefiltert.
function toFilters({ search, typeId, groups, urgentOnly }) {
  const typeFilter = TYPE_FILTERS.find((filter) => filter.id === typeId) || TYPE_FILTERS[0]
  const allGroups = groups.length === 0 || groups.length === ALL_GROUPS.length
  return {
    status: allGroups ? [] : statusValuesFor(groups),
    type: typeFilter.types || [],
    excludeType: typeFilter.excludeType,
    priority: urgentOnly ? [3, 4] : [],
    search: search.trim() || undefined,
    woid: undefined,
  }
}

const DEFAULT_SELECTION = { search: '', typeId: 'orders', groups: DEFAULT_STATUS_GROUPS, urgentOnly: false }

export default function TicketsPage() {
  const [limit, setLimit] = useState(10)
  const [filters, setFilters] = useState({ ...toFilters(DEFAULT_SELECTION), limit: 10 })
  const [searchText, setSearchText] = useState('')
  const [typeId, setTypeId] = useState(DEFAULT_SELECTION.typeId)
  const [groups, setGroups] = useState(DEFAULT_SELECTION.groups)
  const [urgentOnly, setUrgentOnly] = useState(false)

  const toggleGroup = (id) => {
    setGroups((prev) => (prev.includes(id) ? prev.filter((g) => g !== id) : [...prev, id]))
  }

  const { workorders, loading, error, updateWorkorder, createWorkorder } = useWorkorders(filters)
  const { customers } = useCustomers()

  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [searchParams] = useSearchParams()

  // Deep-Link aus den Leads: /tickets?woid=123 zeigt genau dieses Ticket,
  // egal welche Art (auch Akquise) und welcher Status
  useEffect(() => {
    const w = searchParams.get('woid')
    if (!w) return
    setSearchText(w)
    setTypeId('all')
    setGroups(ALL_GROUPS)
    setFilters((prev) => ({ ...prev, status: [], type: [], excludeType: undefined, priority: [], search: undefined, woid: w }))
  }, [searchParams])

  const applyFilters = (e) => {
    e?.preventDefault()
    setFilters((prev) => ({ ...prev, ...toFilters({ search: searchText, typeId, groups, urgentOnly }), limit }))
  }

  const handleUpdate = async (id, data) => { await updateWorkorder(id, data) }
  const handleCreate = async (data) => {
    const result = await createWorkorder(data)
    if (result.success) setShowCreateModal(false)
    return result
  }
  const loadMore = () => {
    const next = limit + 10
    setLimit(next)
    setFilters((prev) => ({ ...prev, limit: next }))
  }

  return (
    <div className="page">
      <PageHeader
        title="Tickets"
        subtitle="Alle Arbeitsaufträge auf einen Blick"
        actions={
          <>
            <Button variant="ghost" onClick={() => setShowAdvanced((s) => !s)}><FaSliders /> Filter</Button>
            <Button variant="primary" onClick={() => setShowCreateModal(true)}><FaPlus /> Neues Ticket</Button>
          </>
        }
      />

      <Card pad className="mb-2" style={{ marginBottom: 16 }}>
        <form className="toolbar" onSubmit={applyFilters} style={{ marginBottom: showAdvanced ? 16 : 0 }}>
          <input
            type="search"
            className="form-control search-input"
            placeholder="Suchen: Kunde, Betreff, Angefragt von oder WOID"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
          />
          <Button variant="primary" type="submit">Anwenden</Button>
        </form>

        {showAdvanced && (
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 16 }}>
            <div className="flex gap-3 wrap" style={{ alignItems: 'center' }}>
              <select aria-label="Typ" className="form-control" style={{ maxWidth: 220 }} value={typeId} onChange={(e) => setTypeId(e.target.value)}>
                {TYPE_FILTERS.map((filter) => (
                  <option key={filter.id} value={filter.id}>{filter.label}</option>
                ))}
              </select>
              <label className="flex items-center gap-2" style={{ cursor: 'pointer', fontSize: 14 }}>
                <input type="checkbox" checked={urgentOnly} onChange={(e) => setUrgentOnly(e.target.checked)} />
                Nur dringende
              </label>
            </div>
            <div style={{ marginTop: 16 }}>
              <div className="flex gap-2 wrap status-filter-actions" style={{ alignItems: 'center', marginBottom: 8 }}>
                <span className="muted" style={{ fontSize: 13, fontWeight: 600 }}>Status</span>
                <button type="button" onClick={() => setGroups(DEFAULT_STATUS_GROUPS)} style={linkButton}>Standard</button>
                <button type="button" onClick={() => setGroups(ALL_GROUPS)} style={linkButton}>Alle</button>
              </div>
              <div className="flex gap-3 wrap status-filter">
                {STATUS_GROUPS.map((group) => (
                  <label key={group.id} className="flex items-center gap-2" style={{ cursor: 'pointer', fontSize: 14 }}>
                    <input type="checkbox" checked={groups.includes(group.id)} onChange={() => toggleGroup(group.id)} />
                    {group.label}
                  </label>
                ))}
              </div>
            </div>
          </div>
        )}
      </Card>

      {loading ? (
        <div className="empty"><FaSpinner className="spinner" /></div>
      ) : error ? (
        <Card><div className="text-red">Fehler: {error}</div></Card>
      ) : workorders.length === 0 ? (
        <Card>
          <EmptyState
            title="Keine Tickets"
            hint="Keine Tickets passen zu Suche und Filter. Erledigte, stornierte und Akquise-Tickets sind in der Standardansicht ausgeblendet."
            action={<Button variant="primary" onClick={() => setShowCreateModal(true)}><FaPlus /> Neues Ticket</Button>}
          />
        </Card>
      ) : (
        <div className="tickets-list">
          {workorders.map((ticket) => (
            <TicketCard key={ticket.$id} ticket={ticket} onUpdate={handleUpdate} />
          ))}
        </div>
      )}

      {/* Bei einer Suche kommen alle Treffer auf einmal */}
      {!filters.search && workorders.length > 0 && workorders.length >= limit && (
        <div style={{ textAlign: 'center', marginTop: 24 }}>
          <Button variant="ghost" onClick={loadMore}>Mehr laden <FaAngleDown /></Button>
        </div>
      )}

      <CreateTicketModal isOpen={showCreateModal} onClose={() => setShowCreateModal(false)} onCreate={handleCreate} customers={customers} />
    </div>
  )
}
