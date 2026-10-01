import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { IconFolders } from '@tabler/icons-react'
import { StatusPill } from './ui/StatusPill'
import { databases, DATABASE_ID, COLLECTIONS, Query } from '../lib/appwrite'
import { useWebsiteProjects } from '../hooks/useWebsiteProjects'

/**
 * Projekt-Kontextbox im Ticket: zeigt automatisch das zugewiesene Projekt
 * und alle anderen Tickets desselben Kunden (klickbar).
 * Rendert nichts, wenn dem Ticket kein Projekt zugewiesen ist.
 */
export default function ProjectContextPanel({ ticket }) {
  const { fetchByTicketId } = useWebsiteProjects()
  const [context, setContext] = useState(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const assignedProjects = await fetchByTicketId(ticket.$id)
        if (!assignedProjects.length) {
          if (!cancelled) setContext(null)
          return
        }
        const projectName = assignedProjects[0].projectName || ''

        let otherTickets = []
        if (ticket.customerId) {
          const res = await databases.listDocuments(DATABASE_ID, COLLECTIONS.WORKORDERS, [
            Query.equal('customerId', ticket.customerId),
            Query.orderDesc('$createdAt'),
            Query.limit(50),
          ])
          otherTickets = res.documents.filter((t) => t.$id !== ticket.$id)
        }
        if (!cancelled) setContext({ projectName, otherTickets })
      } catch {
        if (!cancelled) setContext(null)
      }
    }
    load()
    return () => { cancelled = true }
  }, [ticket.$id, ticket.customerId, fetchByTicketId])

  if (!context) return null
  const { projectName, otherTickets } = context

  return (
    <div className="ui-card pad" style={{ marginTop: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
        <h5 style={{ fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
          <IconFolders size={18} /> Projekt: {projectName || '-'}
        </h5>
      </div>

      {!ticket.customerId ? (
        <p className="faint" style={{ fontSize: 13, margin: 0 }}>
          Kein Kunde zugeordnet — andere Tickets koennen nicht automatisch verknuepft werden.
        </p>
      ) : !otherTickets.length ? (
        <p className="faint" style={{ fontSize: 13, margin: 0 }}>
          Keine weiteren Tickets zu diesem Kunden/Projekt.
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {otherTickets.map((t) => (
            <Link
              key={t.$id}
              to={`/tickets?woid=${t.woid}`}
              style={{
                display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: 'var(--text)', textDecoration: 'none',
                padding: '6px 8px', borderRadius: 8, border: '1px solid var(--border)',
              }}
            >
              <span className="muted" style={{ minWidth: 48, fontWeight: 700 }}>{t.woid}</span>
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {t.topic || t.title || '-'}
              </span>
              <StatusPill status={t.status} />
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
