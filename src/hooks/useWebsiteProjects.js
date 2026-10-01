import { useState, useCallback } from 'react'
import { databases, DATABASE_ID, COLLECTIONS, Query } from '../lib/appwrite'
import { assignWebsiteProject } from '../lib/projectAdminApi'
import { assignSequentially } from '../lib/projectAssign'

export function useWebsiteProjects() {
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const fetchAllProjects = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await databases.listDocuments(
        DATABASE_ID, COLLECTIONS.WEBSITE_PROJECTS,
        [Query.orderDesc('$createdAt'), Query.limit(500)]
      )
      setProjects(response.documents)
      return response.documents
    } catch (err) {
      setError(err.message)
      return []
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchByTicketId = useCallback(async (ticketId) => {
    if (!ticketId) return []
    try {
      const response = await databases.listDocuments(
        DATABASE_ID, COLLECTIONS.WEBSITE_PROJECTS,
        [Query.equal('ticketId', ticketId), Query.limit(100)]
      )
      return response.documents
    } catch {
      return []
    }
  }, [])

  const assignProjects = async (projectIds, ctx) => {
    const results = await assignSequentially(projectIds, ctx, assignWebsiteProject)
    const success = results.every((r) => r.ok)
    const firstError = results.find((r) => !r.ok)
    return { success, error: firstError?.error, results }
  }

  // Nur vom Ticket loesen: customerId bleibt, sonst verliert der Kunde die Vorschau im Portal
  const unassignProject = async (projectId) => {
    try {
      await databases.updateDocument(
        DATABASE_ID, COLLECTIONS.WEBSITE_PROJECTS, projectId,
        { ticketId: '', updatedAt: new Date().toISOString() }
      )
      return { success: true }
    } catch (err) {
      return { success: false, error: err.message }
    }
  }

  return { projects, loading, error, fetchAllProjects, fetchByTicketId, assignProjects, unassignProject }
}
