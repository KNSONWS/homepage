import { useState, useEffect, useCallback, useMemo } from 'react'
import { databases, DATABASE_ID, COLLECTIONS, Query, ID } from '../lib/appwrite'
import { ticketMatches, NORMAL_PRIORITY } from '../lib/ticketStatus'

function buildFiltersKey(filters = {}) {
  return JSON.stringify({
    limit: filters.limit ?? null,
    customerId: filters.customerId ?? null,
    assignedTo: filters.assignedTo ?? null,
    status: filters.status ?? null,
    type: filters.type ?? null,
    priority: filters.priority ?? null,
    woid: filters.woid ?? null,
    excludeType: filters.excludeType ?? null,
    search: filters.search ?? null,
  })
}

export function useWorkorders(filters = {}) {
  const [workorders, setWorkorders] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const filtersKey = useMemo(() => buildFiltersKey(filters), [
    filters.limit,
    filters.customerId,
    filters.assignedTo,
    filters.status,
    filters.type,
    filters.priority,
    filters.woid,
    filters.excludeType,
    filters.search,
  ])

  const fetchWorkorders = useCallback(async () => {
    const activeFilters = JSON.parse(filtersKey)
    setLoading(true)

    try {
      const queries = [Query.orderDesc('$createdAt')]

      // Die Suche laeuft hier im Browser ueber alle Tickets, die zu den Filtern passen
      if (activeFilters.search) {
        queries.push(Query.limit(5000))
      } else if (activeFilters.limit) {
        queries.push(Query.limit(activeFilters.limit))
      }
      
      // Appwrite Query.equal mit Array = OR-Match. Serverseitig filtern, damit
      // das Limit erst NACH dem Statusfilter greift (sonst wuerden archivierte
      // Tickets die neuesten Slots belegen und aktive verdraengen).
      if (activeFilters.status && activeFilters.status.length > 0) {
        queries.push(Query.equal('status', activeFilters.status))
      }

      if (activeFilters.type && activeFilters.type.length > 0) {
        queries.push(Query.equal('type', activeFilters.type))
      }

      // Standardansicht "Auftraege": alles ausser Akquise-Tickets
      if (activeFilters.excludeType) {
        queries.push(Query.notEqual('type', activeFilters.excludeType))
      }

      if (activeFilters.priority && activeFilters.priority.length > 0) {
        queries.push(Query.equal('priority', activeFilters.priority))
      }
      
      if (activeFilters.customerId) {
        queries.push(Query.equal('customerId', activeFilters.customerId))
      }
      
      if (activeFilters.assignedTo) {
        queries.push(Query.equal('assignedTo', activeFilters.assignedTo))
      }

      // WOID-Direktsuche (z. B. Deep-Link aus den Leads: /tickets?woid=123)
      if (activeFilters.woid) {
        queries.push(Query.equal('woid', [String(activeFilters.woid)]))
      }

      // Debug: Zeige Collection ID
      if (import.meta.env.DEV) {
        console.log('📋 Fetching workorders:')
        console.log('  Database ID:', DATABASE_ID)
        console.log('  Collection ID:', COLLECTIONS.WORKORDERS)
        console.log('  Queries:', queries.length)
      }

      const response = await databases.listDocuments(
        DATABASE_ID,
        COLLECTIONS.WORKORDERS,
        queries
      )

      setWorkorders(
        activeFilters.search
          ? response.documents.filter((ticket) => ticketMatches(ticket, activeFilters.search))
          : response.documents
      )
      setError(null)
    } catch (err) {
      let errorMessage = err.message || 'Fehler beim Laden der Tickets'
      
      // Bessere Fehlermeldungen
      if (err.code === 401 || errorMessage.includes('not authorized') || errorMessage.includes('Unauthorized')) {
        errorMessage = 'Berechtigung fehlt: Bitte überprüfe die Read-Berechtigungen der Collection in Appwrite. Die Collection muss "Users" oder "Any" als Read-Berechtigung haben.'
      } else if (errorMessage.includes('Collection') && errorMessage.includes('not found')) {
        errorMessage = 'Collection nicht gefunden: Bitte überprüfe die Collection ID in der Konfiguration.'
      }
      
      setError(errorMessage)
      console.error('Error fetching workorders:', err)
    } finally {
      setLoading(false)
    }
  }, [filtersKey])

  useEffect(() => {
    fetchWorkorders()
  }, [fetchWorkorders])

  const resolveAutomaticTicketFields = async (requestedAssignee = '') => {
    const [allTicketsResponse, employeesResponse] = await Promise.all([
      databases.listDocuments(
        DATABASE_ID,
        COLLECTIONS.WORKORDERS,
        [Query.limit(5000)]
      ),
      databases.listDocuments(
        DATABASE_ID,
        COLLECTIONS.EMPLOYEES,
        [Query.orderAsc('displayName'), Query.limit(500)]
      ),
    ])

    const allTickets = allTicketsResponse.documents || []
    const employees = employeesResponse.documents || []
    const maxWoid = allTickets.reduce((highest, ticket) => {
      const numericId = Number.parseInt(ticket.woid, 10)
      return Number.isFinite(numericId) ? Math.max(highest, numericId) : highest
    }, 9999)

    let assignee = requestedAssignee
      ? employees.find((employee) => employee.userId === requestedAssignee)
      : null

    if (!assignee && employees.length > 0) {
      const finishedStatuses = new Set(['Closed', 'Completed', 'Cancelled', 'Done'])
      const activeCounts = new Map(employees.map((employee) => [employee.userId, 0]))
      for (const ticket of allTickets) {
        if (!ticket.assignedTo || finishedStatuses.has(ticket.status)) continue
        if (activeCounts.has(ticket.assignedTo)) {
          activeCounts.set(ticket.assignedTo, activeCounts.get(ticket.assignedTo) + 1)
        }
      }
      assignee = [...employees].sort((left, right) => {
        const loadDifference = activeCounts.get(left.userId) - activeCounts.get(right.userId)
        if (loadDifference !== 0) return loadDifference
        return (left.displayName || '').localeCompare(right.displayName || '', 'de')
      })[0]
    }

    return {
      woid: String(maxWoid + 1),
      assignedTo: assignee?.userId || '',
      assignedName: assignee?.displayName || '',
    }
  }

  const createWorkorder = async (data) => {
    try {
      // Validierung: Prüfe required fields
      if (!data.topic || data.topic.trim() === '') {
        return { success: false, error: 'Bitte einen Betreff eingeben.' }
      }

      const automatic = await resolveAutomaticTicketFields(data.assignedTo)

      // Bereite Daten für Appwrite vor. Neue Tickets starten "Offen", auch wenn sie
      // gleich jemandem zugewiesen werden - wer zustaendig ist, zeigt das Kuerzel.
      const workorderData = {
        // Required fields
        topic: data.topic.trim(),
        status: 'Open',
        priority: typeof data.priority === 'number' ? data.priority : parseInt(data.priority) || NORMAL_PRIORITY,
        woid: automatic.woid,
        
        // Optional fields - nur senden wenn vorhanden
        type: data.type || '',
        systemType: data.systemType || '',
        responseLevel: data.responseLevel || '',
        serviceType: data.serviceType || 'Remote',
        customerId: data.customerId || '',
        customerName: data.customerName || '',
        customerLocation: data.customerLocation || '',
        assignedTo: automatic.assignedTo,
        assignedName: automatic.assignedName,
        requestedBy: data.requestedBy || '',
        requestedFor: data.requestedFor || '',
        startDate: data.startDate || '',
        startTime: data.startTime || '',
        deadline: data.deadline || '',
        endTime: data.endTime || '',
        estimate: data.estimate || '',
        mailCopyTo: data.mailCopyTo || '',
        sendNotification: data.sendNotification || false,
        details: data.details || '',
        
        // Datetime field
        createdAt: new Date().toISOString()
      }

      // Entferne leere Strings (außer für required fields)
      Object.keys(workorderData).forEach(key => {
        if (workorderData[key] === '' && key !== 'topic' && key !== 'status') {
          delete workorderData[key]
        }
      })

      console.log('Creating workorder with data:', workorderData)

      const response = await databases.createDocument(
        DATABASE_ID,
        COLLECTIONS.WORKORDERS,
        ID.unique(),
        workorderData
      )
      setWorkorders(prev => [response, ...prev])
      return { success: true, data: response }
    } catch (err) {
      console.error('Error creating workorder:', err)
      let errorMessage = err.message || 'Fehler beim Erstellen des Tickets'
      
      // Bessere Fehlermeldungen
      if (err.code === 400 || errorMessage.includes('Bad Request')) {
        errorMessage = 'Ungültige Daten: Bitte überprüfe, ob alle Pflichtfelder ausgefüllt sind und die Daten korrekt sind. Details: ' + (err.message || 'Unbekannter Fehler')
      } else if (errorMessage.includes('required') || errorMessage.includes('missing')) {
        errorMessage = 'Pflichtfelder fehlen: Bitte fülle alle erforderlichen Felder aus.'
      }
      
      return { success: false, error: errorMessage }
    }
  }

  const updateWorkorder = async (id, data) => {
    try {
      // Zuweisen aendert den Status nicht (frueher sprang er auf "Assigned")
      const response = await databases.updateDocument(
        DATABASE_ID,
        COLLECTIONS.WORKORDERS,
        id,
        data
      )
      setWorkorders(prev => 
        prev.map(wo => wo.$id === id ? response : wo)
      )
      return { success: true, data: response }
    } catch (err) {
      return { success: false, error: err.message }
    }
  }

  const deleteWorkorder = async (id) => {
    try {
      await databases.deleteDocument(
        DATABASE_ID,
        COLLECTIONS.WORKORDERS,
        id
      )
      setWorkorders(prev => prev.filter(wo => wo.$id !== id))
      return { success: true }
    } catch (err) {
      return { success: false, error: err.message }
    }
  }

  return {
    workorders,
    loading,
    error,
    refresh: fetchWorkorders,
    createWorkorder,
    updateWorkorder,
    deleteWorkorder
  }
}
