import { useState, useEffect, useMemo } from 'react'
import { FaTimes } from 'react-icons/fa'
import { useEmployees } from '../hooks/useEmployees'
import { databases, DATABASE_ID, COLLECTIONS, Query } from '../lib/appwrite'
import {
  SERVICE_TYPES,
  todayIso,
  isoToGermanDate,
  timeToWoms,
  buildRequesterSuggestions,
  rankSuggestions,
} from '../lib/ticketForm'
import { priorityFor } from '../lib/ticketStatus'
import { AutocompleteInput, DateTimeInput } from './ui'

// Neue Tickets gibt es aktuell nur fuer diese Arten; alte Tickets behalten ihre Art.
// Migration = ein Kunde, den wir von einem anderen Anbieter uebernehmen.
const TICKET_TYPES = [
  { value: 'Webpage', label: 'Webpage' },
  { value: 'Migration', label: 'Migration (Übernahme von anderem Anbieter)' },
]

// Datum als "yyyy-mm-dd", Uhrzeit als "hh:mm" (Werte der Kalender-Felder).
// Die Service-Art fragt das Formular nicht mehr ab: gespeichert wird Fernwartung.
const emptyForm = () => ({
  customerId: '',
  type: TICKET_TYPES[0].value,
  serviceType: SERVICE_TYPES[0].value,
  urgent: false,
  topic: '',
  requestedBy: '',
  startDate: todayIso(),
  startTime: '',
  deadline: todayIso(),
  endTime: '',
  details: ''
})

export default function CreateTicketModal({ isOpen, onClose, onCreate, customers = [] }) {
  const { employees } = useEmployees()

  const [formData, setFormData] = useState(emptyForm)
  const [recentTickets, setRecentTickets] = useState([])

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Reset error when modal opens
  useEffect(() => {
    if (isOpen) setError('')
  }, [isOpen])

  // Namen aus den letzten Tickets fuer die Autovervollstaendigung
  useEffect(() => {
    if (!isOpen) return
    let cancelled = false
    databases
      .listDocuments(DATABASE_ID, COLLECTIONS.WORKORDERS, [Query.orderDesc('$createdAt'), Query.limit(200)])
      .then((response) => {
        if (!cancelled) setRecentTickets(response.documents || [])
      })
      .catch((err) => console.warn('Vorschläge aus früheren Tickets nicht geladen:', err))
    return () => {
      cancelled = true
    }
  }, [isOpen])

  const suggestions = useMemo(
    () => buildRequesterSuggestions({ customers, employees, tickets: recentTickets }),
    [customers, employees, recentTickets]
  )
  const getSuggestions = (text) => rankSuggestions(suggestions, text, { customerId: formData.customerId })

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }))
    // Clear error when user makes changes
    if (error) setError('')
  }

  // Das Ende darf nicht vor dem Start liegen, deshalb rueckt es mit
  const handleStartDateChange = (value) => {
    setFormData(prev => ({
      ...prev,
      startDate: value,
      deadline: value && prev.deadline && prev.deadline < value ? value : prev.deadline
    }))
    if (error) setError('')
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    const customer = customers.find(c => c.$id === formData.customerId)
    const { urgent, ...fields } = formData
    try {
      const result = await onCreate({
        ...fields,
        priority: priorityFor(urgent),
        customerName: customer?.name || '',
        customerLocation: customer?.location || '',
        startDate: isoToGermanDate(formData.startDate),
        startTime: timeToWoms(formData.startTime),
        deadline: isoToGermanDate(formData.deadline),
        endTime: timeToWoms(formData.endTime)
      })
      if (result.success) {
        onClose()
        setFormData(emptyForm())
      } else {
        setError(result.error || 'Fehler beim Erstellen des Tickets')
      }
    } catch (error) {
      console.error('Error creating ticket:', error)
      setError(error.message || 'Ein unerwarteter Fehler ist aufgetreten')
    } finally {
      setLoading(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="overlay">
      <span className="overlay-close" onClick={onClose}>
        <FaTimes />
      </span>
      <div className="overlay-content">
        <h2 className="mb-2">Neues Ticket</h2>

        {error && (
          <div className="bg-red text-white p-2 mb-2" style={{ borderRadius: '4px' }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="row">
            <div className="col col-6">
              <div className="form-group">
                <label className="form-label">Kunde</label>
                <select
                  className="form-control"
                  value={formData.customerId}
                  onChange={(e) => handleChange('customerId', e.target.value)}
                  required
                >
                  <option value="">Kunde wählen</option>
                  {customers.map(c => (
                    <option key={c.$id} value={c.$id}>({c.code || ''}) {c.name || 'Unnamed'}</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Art</label>
                <select
                  className="form-control"
                  value={formData.type}
                  onChange={(e) => handleChange('type', e.target.value)}
                >
                  {TICKET_TYPES.map(type => (
                    <option key={type.value} value={type.value}>{type.label}</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={formData.urgent}
                    onChange={(e) => handleChange('urgent', e.target.checked)}
                  />
                  Dringend
                </label>
              </div>

              <div className="form-group automatic-assignment-note">
                <label className="form-label">Zuweisung</label>
                <p>
                  {employees.length > 0
                    ? `Automatisch an den Mitarbeiter mit der geringsten Anzahl offener Tickets (${employees.length} verfügbar).`
                    : 'Es ist noch kein Mitarbeiter verfügbar. Das Ticket bleibt zunächst offen.'}
                </p>
              </div>
            </div>

            <div className="col col-6">
              <div className="form-group">
                <label className="form-label">Betreff</label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="Worum geht es?"
                  value={formData.topic}
                  onChange={(e) => handleChange('topic', e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="ticket-requested-by">Angefragt von</label>
                <AutocompleteInput
                  id="ticket-requested-by"
                  placeholder="Name"
                  value={formData.requestedBy}
                  onChange={(value) => handleChange('requestedBy', value)}
                  getSuggestions={getSuggestions}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="ticket-start-date">Beginn</label>
                <DateTimeInput
                  id="ticket-start-date"
                  timeLabel="Uhrzeit Beginn"
                  date={formData.startDate}
                  time={formData.startTime}
                  onDateChange={handleStartDateChange}
                  onTimeChange={(value) => handleChange('startTime', value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="ticket-end-date">Deadline</label>
                <DateTimeInput
                  id="ticket-end-date"
                  timeLabel="Uhrzeit Deadline"
                  min={formData.startDate}
                  date={formData.deadline}
                  time={formData.endTime}
                  onDateChange={(value) => handleChange('deadline', value)}
                  onTimeChange={(value) => handleChange('endTime', value)}
                />
              </div>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Beschreibung</label>
            <textarea
              className="form-control"
              rows={5}
              placeholder="Was soll gemacht werden?"
              value={formData.details}
              onChange={(e) => handleChange('details', e.target.value)}
            />
          </div>

          <div className="text-center mt-2">
            <button
              type="submit"
              className="btn btn-dark"
              disabled={loading}
            >
              {loading ? 'Wird angelegt …' : 'Ticket anlegen'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
