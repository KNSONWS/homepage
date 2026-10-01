import { useState, useEffect } from 'react'
import { FaTimes } from 'react-icons/fa'
import { useAuth } from '../context/AuthContext'
import { SERVICE_TYPES, todayIso, isoToGermanDate, timeToWoms, minutesBetween } from '../lib/ticketForm'
import { TICKET_STATUSES, statusLabel } from '../lib/ticketStatus'
import { DateTimeInput, DurationSelect } from './ui'
import { roundUpToStep, isValidStep } from '../lib/timeSteps'
import { validateSupporters } from '../lib/support'
import SupportersEditor from './SupportersEditor'

// Akquise-Tickets: Ergebnis des Kundenkontakts (statt technischer Status)
const ACQUISITION_STATUS = ['In Kontakt', 'Zugesagt', 'Abgesagt']

// Die sechs Status; ein alter Status (z. B. "Assigned") bleibt als aktuelle Auswahl sichtbar
function statusOptionsFor(current) {
  if (!current || TICKET_STATUSES.some((s) => s.value === current)) return TICKET_STATUSES
  return [{ value: current, label: `${statusLabel(current)} (bisher)` }, ...TICKET_STATUSES]
}

// Datum als "yyyy-mm-dd", Uhrzeit als "hh:mm" (Werte der Kalender-Felder).
// Die Service-Art kommt vom Ticket; das alte "Off Site" zaehlt als Fernwartung.
const initialForm = (workorder, newStatus) => ({
  serviceType: SERVICE_TYPES.some(t => t.value === workorder?.serviceType)
    ? workorder.serviceType
    : SERVICE_TYPES[0].value,
  newStatus,
  totalTime: 0,
  startDate: todayIso(),
  startTime: '',
  endDate: todayIso(),
  endTime: '',
  details: '',
  isComment: false,
  countsToPlan: false,
  supporters: []
})

export default function CreateWorksheetModal({ isOpen, onClose, workorder, onCreate, aboHoursAllowed = true }) {
  const { user } = useAuth()

  const isAcquisition = workorder?.type === 'Akquise'
  const statusOptions = isAcquisition
    ? ACQUISITION_STATUS.map((s) => ({ value: s, label: s }))
    : statusOptionsFor(workorder?.status)
  const defaultStatus = isAcquisition
    ? (ACQUISITION_STATUS.includes(workorder?.status) ? workorder.status : 'In Kontakt')
    : (workorder?.status || 'Open')

  const [formData, setFormData] = useState(() => initialForm(workorder, defaultStatus))

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [autoCalculate, setAutoCalculate] = useState(true)

  // Reset form wenn Modal geöffnet wird
  useEffect(() => {
    if (isOpen && workorder) {
      setFormData(initialForm(workorder, defaultStatus))
      setError('')
      setAutoCalculate(true)
    }
  }, [isOpen, workorder, defaultStatus])

  // Automatische Zeitberechnung, aufgerundet auf 15 Minuten
  useEffect(() => {
    if (!autoCalculate || formData.isComment) return
    const minutes = minutesBetween(formData.startTime, formData.endTime)
    if (minutes !== null) {
      setFormData(prev => ({ ...prev, totalTime: roundUpToStep(minutes) }))
    }
  }, [formData.startTime, formData.endTime, formData.isComment, autoCalculate])

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }))

    // Wenn totalTime manuell geändert wird, deaktiviere Auto-Berechnung
    if (field === 'totalTime') {
      setAutoCalculate(false)
    }
  }

  // Das Ende darf nicht vor dem Start liegen, deshalb rueckt es mit
  const handleStartDateChange = (value) => {
    setFormData(prev => ({
      ...prev,
      startDate: value,
      endDate: value && prev.endDate && prev.endDate < value ? value : prev.endDate
    }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      if (!formData.details.trim()) {
        setError('Bitte Details eingeben')
        setLoading(false)
        return
      }
      if (!formData.isComment && !isValidStep(formData.totalTime)) {
        setError('Bitte die Arbeitszeit auswählen.')
        setLoading(false)
        return
      }
      const supporters = formData.isComment ? [] : formData.supporters
      const supportError = validateSupporters(supporters, user?.$id)
      if (supportError) {
        setError(supportError)
        setLoading(false)
        return
      }

      const worksheetData = {
        woid: workorder.woid,
        workorderId: workorder.$id,
        serviceType: formData.serviceType,
        oldStatus: workorder.status,
        newStatus: formData.newStatus,
        totalTime: formData.isComment ? 0 : Number(formData.totalTime),
        startDate: isoToGermanDate(formData.startDate),
        startTime: timeToWoms(formData.startTime),
        endDate: isoToGermanDate(formData.endDate),
        endTime: timeToWoms(formData.endTime),
        details: formData.details,
        isComment: formData.isComment,
        countsToPlan: aboHoursAllowed && !formData.isComment && formData.countsToPlan,
        employeeShort: user?.prefs?.shortCode || '', // Aus User-Preferences
        supporters
      }

      const result = await onCreate(worksheetData, user)

      if (result.success) {
        onClose()
      } else {
        setError(result.error || 'Fehler beim Speichern des Arbeitsblatts')
      }
    } catch (err) {
      console.error('Error creating worksheet:', err)
      setError(err.message || 'Ein unerwarteter Fehler ist aufgetreten')
    } finally {
      setLoading(false)
    }
  }

  if (!isOpen || !workorder) return null

  return (
    <div className="overlay">
      <span className="overlay-close" onClick={onClose}>
        <FaTimes />
      </span>
      <div className="overlay-content">
        <h2 className="mb-2">Neues Arbeitsblatt – Ticket {workorder.woid}</h2>

        {error && (
          <div className="bg-red text-white p-2 mb-2" style={{ borderRadius: '4px' }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="row">
            <div className="col col-6">
              <div className="form-group">
                <label className="form-label">Art</label>
                <select
                  className="form-control"
                  value={formData.serviceType}
                  onChange={(e) => handleChange('serviceType', e.target.value)}
                  required
                >
                  {SERVICE_TYPES.map(type => (
                    <option key={type.value} value={type.value}>{type.label}</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">{isAcquisition ? 'Akquise-Ergebnis' : 'Neuer Status'}</label>
                <select
                  className="form-control"
                  value={formData.newStatus}
                  onChange={(e) => handleChange('newStatus', e.target.value)}
                  required
                >
                  {statusOptions.map(status => (
                    <option key={status.value} value={status.value}>{status.label}</option>
                  ))}
                </select>
                {isAcquisition && (
                  <small style={{ color: '#a0aec0', fontSize: '12px' }}>
                    "Zugesagt" macht den Lead automatisch zum festen Kunden.
                  </small>
                )}
              </div>

              <div className="form-group">
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input
                    type="checkbox"
                    checked={formData.isComment}
                    onChange={(e) => handleChange('isComment', e.target.checked)}
                  />
                  Nur Kommentar (keine Arbeitszeit)
                </label>
              </div>

              {aboHoursAllowed && (
                <div className="form-group">
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }} title="Zeit wird vom Stundenguthaben des Wartungs-Abos abgezogen und im Kundenportal angezeigt">
                    <input
                      type="checkbox"
                      checked={formData.countsToPlan && !formData.isComment}
                      disabled={formData.isComment}
                      onChange={(e) => handleChange('countsToPlan', e.target.checked)}
                    />
                    Vom Abo-Stundenkonto abziehen
                  </label>
                </div>
              )}
            </div>

            <div className="col col-6">
              <div className="form-group">
                <label className="form-label" htmlFor="worksheet-start-date">Beginn</label>
                <DateTimeInput
                  id="worksheet-start-date"
                  timeLabel="Uhrzeit Beginn"
                  required
                  date={formData.startDate}
                  time={formData.startTime}
                  onDateChange={handleStartDateChange}
                  onTimeChange={(value) => handleChange('startTime', value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="worksheet-end-date">Ende</label>
                <DateTimeInput
                  id="worksheet-end-date"
                  timeLabel="Uhrzeit Ende"
                  required
                  min={formData.startDate}
                  date={formData.endDate}
                  time={formData.endTime}
                  onDateChange={(value) => handleChange('endDate', value)}
                  onTimeChange={(value) => handleChange('endTime', value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="worksheet-total">Arbeitszeit</label>
                <DurationSelect
                  id="worksheet-total"
                  value={formData.isComment ? 0 : formData.totalTime}
                  onChange={(value) => handleChange('totalTime', value)}
                  disabled={formData.isComment}
                />
                <small style={{ color: '#a0aec0', fontSize: '12px' }}>
                  {autoCalculate && formData.startTime && formData.endTime
                    ? '✓ Aus Beginn und Ende berechnet, aufgerundet auf 15 Minuten'
                    : autoCalculate ? 'Beginn und Ende eintragen oder Zeit wählen' : 'Von Hand gewählt'}
                </small>
              </div>
            </div>
          </div>

          {!formData.isComment && (
            <SupportersEditor
              value={formData.supporters}
              onChange={(list) => handleChange('supporters', list)}
              excludeUserId={user?.$id}
              minutes={formData.totalTime}
            />
          )}

          <div className="form-group">
            <label className="form-label">Was wurde gemacht?</label>
            <textarea
              className="form-control"
              rows={5}
              placeholder="Beschreibe die durchgeführten Arbeiten..."
              value={formData.details}
              onChange={(e) => handleChange('details', e.target.value)}
              required
            />
          </div>

          <div className="text-center mt-2">
            <button
              type="submit"
              className="btn btn-dark"
              disabled={loading}
            >
              {loading ? 'Speichert …' : 'Speichern'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

