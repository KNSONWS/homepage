import { useState, useEffect, useCallback } from 'react'
import { databases, DATABASE_ID, COLLECTIONS, Query, ID } from '../lib/appwrite'
import { canEditWorksheetTimes, isGitWorksheet } from '../lib/ticketForm'
import { roundUpToStep, isValidStep } from '../lib/timeSteps'
import { parseSupporters, serializeSupporters, canAddOwnSupport, upsertSupporter, removeSupporter, worksheetMinutes } from '../lib/support'

const STEP_ERROR = 'Die Arbeitszeit muss in 15-Minuten-Schritten angegeben werden.'

export function useWorksheets(woid = null) {
  const [worksheets, setWorksheets] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchWorksheets = useCallback(async () => {
    // Zugeklappte Tickets uebergeben keine WOID - dann gibt es nichts zu laden
    if (!woid) {
      setWorksheets([])
      setLoading(false)
      return
    }
    setLoading(true)

    try {
      // Ohne limit liefert Appwrite nur 25 Eintraege, ein Ticket sammelt aber viele Git-Pushes
      const queries = [Query.orderDesc('$createdAt'), Query.equal('woid', woid), Query.limit(5000)]

      if (import.meta.env.DEV) {
        console.log('📋 Fetching worksheets:')
        console.log('  Database ID:', DATABASE_ID)
        console.log('  Collection ID:', COLLECTIONS.WORKSHEETS)
        console.log('  WOID Filter:', woid || 'none')
      }

      const response = await databases.listDocuments(
        DATABASE_ID,
        COLLECTIONS.WORKSHEETS,
        queries
      )
      
      setWorksheets(response.documents)
      setError(null)
    } catch (err) {
      let errorMessage = err.message || 'Fehler beim Laden der Worksheets'
      
      if (err.code === 401 || errorMessage.includes('not authorized')) {
        errorMessage = 'Berechtigung fehlt: Bitte überprüfe die Read-Berechtigungen der Worksheets Collection.'
      } else if (errorMessage.includes('Collection') && errorMessage.includes('not found')) {
        errorMessage = 'Worksheets Collection nicht gefunden. Bitte die Collection in Appwrite prüfen (Datenmodell siehe README.md).'
      }
      
      setError(errorMessage)
      console.error('Error fetching worksheets:', err)
    } finally {
      setLoading(false)
    }
  }, [woid])

  useEffect(() => {
    fetchWorksheets()
  }, [fetchWorksheets])

  /**
   * Generiert eine eindeutige 6-stellige WSID
   * Startet bei 100000 und zählt sequentiell hoch
   */
  const generateWSID = useCallback(async () => {
    try {
      // Hole ALLE Worksheets (nicht gefiltert) um höchste WSID zu finden
      const response = await databases.listDocuments(
        DATABASE_ID,
        COLLECTIONS.WORKSHEETS,
        [Query.orderDesc('wsid'), Query.limit(1)]
      )
      
      if (response.documents.length === 0) {
        return '100000' // Erste WSID
      }
      
      const highestWsid = parseInt(response.documents[0].wsid)
      
      if (isNaN(highestWsid)) {
        console.warn('Ungültige WSID gefunden, starte bei 100000')
        return '100000'
      }
      
      return (highestWsid + 1).toString()
    } catch (err) {
      console.error('Error generating WSID:', err)
      // Fallback: Verwende lokale Worksheets
      const maxWsid = worksheets.length > 0 
        ? Math.max(...worksheets.map(ws => parseInt(ws.wsid)).filter(w => !isNaN(w)))
        : 99999
      return (maxWsid + 1).toString()
    }
  }, [worksheets])

  /**
   * Berechnet Arbeitszeit aus Start- und Endzeit
   * Format: "1000" = 10:00, "1430" = 14:30
   * @returns Minuten oder null wenn ungültig
   */
  const calculateTime = (startTime, endTime) => {
    if (!startTime || !endTime) return null
    
    try {
      const startHour = parseInt(startTime.substring(0, 2))
      const startMin = parseInt(startTime.substring(2, 4))
      const endHour = parseInt(endTime.substring(0, 2))
      const endMin = parseInt(endTime.substring(2, 4))
      
      if (isNaN(startHour) || isNaN(startMin) || isNaN(endHour) || isNaN(endMin)) {
        return null
      }
      
      const startTotal = startHour * 60 + startMin
      const endTotal = endHour * 60 + endMin
      
      let diff = endTotal - startTotal
      
      // Handle overnight (z.B. 23:00 - 01:00)
      if (diff < 0) {
        diff += 24 * 60
      }
      
      return diff
    } catch (err) {
      return null
    }
  }

  /**
   * Erstellt ein neues Worksheet
   */
  const createWorksheet = async (data, currentUser) => {
    try {
      // Validierung
      if (!data.woid || data.woid.trim() === '') {
        return { success: false, error: 'WOID ist erforderlich' }
      }
      if (!data.workorderId || data.workorderId.trim() === '') {
        return { success: false, error: 'Work Order ID ist erforderlich' }
      }
      if (!data.details || data.details.trim() === '') {
        return { success: false, error: 'Details sind erforderlich' }
      }

      // WSID generieren
      const wsid = await generateWSID()
      
      // Automatische Zeitberechnung (wenn nicht manuell angegeben), aufgerundet auf 15 Minuten
      let totalTime = data.isComment ? 0 : Number(data.totalTime) || 0
      if (!data.isComment && data.startTime && data.endTime && !totalTime) {
        const calculatedTime = calculateTime(data.startTime, data.endTime)
        if (calculatedTime !== null) {
          totalTime = roundUpToStep(calculatedTime)
        }
      }
      if (!data.isComment && !isValidStep(totalTime)) {
        return { success: false, error: STEP_ERROR }
      }

      // Worksheet-Daten vorbereiten
      const worksheetData = {
        wsid,
        woid: data.woid.trim(),
        workorderId: data.workorderId.trim(),
        employeeId: currentUser.$id,
        employeeName: currentUser.name || currentUser.email,
        employeeShort: data.employeeShort || '',
        serviceType: data.serviceType || 'Remote',
        oldStatus: data.oldStatus || '',
        newStatus: data.newStatus || data.oldStatus || '',
        oldResponseLevel: data.oldResponseLevel || '',
        newResponseLevel: data.newResponseLevel || data.oldResponseLevel || '',
        totalTime,
        startDate: data.startDate || '',
        startTime: data.startTime || '',
        endDate: data.endDate || data.startDate || '',
        endTime: data.endTime || '',
        details: data.details.trim(),
        isComment: data.isComment || false,
        countsToPlan: !data.isComment && Boolean(data.countsToPlan),
        createdAt: new Date().toISOString()
      }
      // Nur mitschicken, wenn es Unterstuetzung gibt
      if (!data.isComment && data.supporters?.length) {
        worksheetData.supporters = serializeSupporters(data.supporters)
      }

      console.log('Creating worksheet with data:', worksheetData)

      const response = await databases.createDocument(
        DATABASE_ID,
        COLLECTIONS.WORKSHEETS,
        ID.unique(),
        worksheetData
      )

      setWorksheets(prev => [response, ...prev])
      return { success: true, data: response }
    } catch (err) {
      console.error('Error creating worksheet:', err)
      return { 
        success: false, 
        error: err.message || 'Fehler beim Erstellen des Worksheets' 
      }
    }
  }

  /**
   * Aktualisiert ein Worksheet
   */
  const updateWorksheet = async (id, data) => {
    try {
      const response = await databases.updateDocument(
        DATABASE_ID,
        COLLECTIONS.WORKSHEETS,
        id,
        data
      )
      setWorksheets(prev => prev.map(ws => ws.$id === id ? response : ws))
      return { success: true, data: response }
    } catch (err) {
      console.error('Error updating worksheet:', err)
      return { success: false, error: err.message }
    }
  }

  /**
   * Aendert nachtraeglich Beginn, Ende und Arbeitszeit - nur fuer den Ersteller
   * (employee = eigener Eintrag aus "employees", fuer Git-Pushes)
   */
  const updateWorksheetTimes = async (worksheet, times, currentUser, employee) => {
    if (!canEditWorksheetTimes(worksheet, currentUser, employee)) {
      return { success: false, error: 'Nur wer das Arbeitsblatt erstellt hat, kann die Zeiten ändern.' }
    }
    const { startDate, startTime, endDate, endTime, totalTime } = times
    if (!isValidStep(totalTime)) return { success: false, error: STEP_ERROR }
    const data = { startDate, startTime, endDate, endTime, totalTime }
    // Unterstuetzung nur schreiben, wenn sie sich geaendert hat. Hat inzwischen jemand anderes
    // (z. B. ueber "Ich habe unterstuetzt") etwas geaendert, nicht still ueberschreiben.
    if (times.supporters) {
      const next = serializeSupporters(times.supporters)
      if (next !== serializeSupporters(parseSupporters(times.supportersBefore))) {
        try {
          const fresh = await databases.getDocument(DATABASE_ID, COLLECTIONS.WORKSHEETS, worksheet.$id)
          if ((fresh.supporters ?? '') !== (times.supportersBefore ?? '')) {
            return { success: false, error: 'Inzwischen hat jemand die Unterstützung geändert. Bitte das Formular schließen und neu öffnen.' }
          }
        } catch (err) {
          return { success: false, error: err.message }
        }
        data.supporters = next
      }
    }
    // Mit nachgetragener Zeit zaehlt ein Git-Push als Arbeitszeit, nicht mehr als Kommentar
    if (isGitWorksheet(worksheet)) data.isComment = false
    return updateWorksheet(worksheet.$id, data)
  }

  /**
   * "Ich habe unterstuetzt": eigenen Eintrag setzen (task) oder entfernen (task = null).
   * Liest das Blatt frisch, damit gleichzeitige Eintraege anderer erhalten bleiben.
   */
  const saveOwnSupport = async (worksheet, task, currentUser, employee) => {
    if (!canAddOwnSupport(worksheet, currentUser, employee)) {
      return { success: false, error: 'Hier kannst du keine Unterstützung eintragen.' }
    }
    try {
      const fresh = await databases.getDocument(DATABASE_ID, COLLECTIONS.WORKSHEETS, worksheet.$id)
      const current = parseSupporters(fresh.supporters)
      const next = task === null
        ? removeSupporter(current, currentUser.$id)
        : upsertSupporter(current, {
          employeeId: currentUser.$id,
          name: employee?.displayName || currentUser.name || '',
          task: String(task).trim().slice(0, 200)
        })
      return updateWorksheet(worksheet.$id, { supporters: serializeSupporters(next) })
    } catch (err) {
      return { success: false, error: err.message }
    }
  }

  /**
   * Löscht ein Worksheet (sollte normalerweise nicht erlaubt sein - Audit Trail!)
   */
  const deleteWorksheet = async (id) => {
    try {
      await databases.deleteDocument(
        DATABASE_ID,
        COLLECTIONS.WORKSHEETS,
        id
      )
      setWorksheets(prev => prev.filter(ws => ws.$id !== id))
      return { success: true }
    } catch (err) {
      console.error('Error deleting worksheet:', err)
      return { success: false, error: err.message }
    }
  }

  /**
   * Berechnet die Gesamtarbeitszeit für alle Worksheets
   * @returns Minuten
   */
  const getTotalTime = useCallback(() => {
    return worksheets
      .filter(ws => !ws.isComment)
      .reduce((sum, ws) => sum + worksheetMinutes(ws), 0)
  }, [worksheets])

  return {
    worksheets,
    loading,
    error,
    createWorksheet,
    updateWorksheet,
    updateWorksheetTimes,
    saveOwnSupport,
    deleteWorksheet,
    refresh: fetchWorksheets,
    getTotalTime,
    calculateTime
  }
}

