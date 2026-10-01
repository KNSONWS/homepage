import { useState } from 'react'
import { FaTimes } from 'react-icons/fa'
import { isoToGermanDate, timeToWoms, germanDateToIso, womsTimeToInput, minutesBetween, isGitWorksheet, needsTimeEntry } from '../lib/ticketForm'
import { DateTimeInput, DurationSelect } from './ui'
import { roundUpToStep, isValidStep } from '../lib/timeSteps'
import { parseSupporters, validateSupporters } from '../lib/support'
import SupportersEditor from './SupportersEditor'

// Gespeichert ist dd.mm.yyyy / hhmm, die Kalender-Felder brauchen yyyy-mm-dd / hh:mm
const formFromWorksheet = (worksheet) => ({
  startDate: germanDateToIso(worksheet.startDate || worksheet.endDate),
  startTime: womsTimeToInput(worksheet.startTime),
  endDate: germanDateToIso(worksheet.endDate || worksheet.startDate),
  endTime: womsTimeToInput(worksheet.endTime)
})

/**
 * Beginn, Ende und Arbeitszeit eines Arbeitsblatts nachtraeglich aendern.
 * Wer das darf, entscheidet canEditWorksheetTimes (lib/ticketForm).
 */
export default function WorksheetTimesModal({ worksheet, currentUserId, onClose, onSave }) {
  const isGit = isGitWorksheet(worksheet)
  const [formData, setFormData] = useState(() => formFromWorksheet(worksheet))
  // null = die Arbeitszeit folgt Beginn und Ende (aufgerundet auf 15 Minuten). Passte sie
  // schon vorher nicht dazu, wurde sie von Hand gewaehlt (z.B. ohne Pause) und bleibt stehen.
  // Alte Zeiten ausserhalb des Rasters (z.B. 70) werden auf den naechsten Schritt aufgerundet.
  const [manualTotal, setManualTotal] = useState(() => {
    const stored = Number(worksheet.totalTime) || 0
    const calculated = minutesBetween(formData.startTime, formData.endTime)
    if (!stored || (calculated !== null && stored === roundUpToStep(calculated))) return null
    return isValidStep(stored) ? stored : roundUpToStep(stored)
  })
  const [supporters, setSupporters] = useState(() => parseSupporters(worksheet.supporters))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const calculatedMinutes = minutesBetween(formData.startTime, formData.endTime)
  const calculatedTotal = calculatedMinutes === null ? null : roundUpToStep(calculatedMinutes)
  const totalTime = manualTotal ?? calculatedTotal ?? 0

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }))
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
    if (!isValidStep(totalTime)) {
      setError('Bitte die Arbeitszeit auswählen.')
      return
    }
    const supportError = validateSupporters(supporters, currentUserId)
    if (supportError) {
      setError(supportError)
      return
    }
    setSaving(true)
    setError('')
    try {
      const result = await onSave(worksheet, {
        startDate: isoToGermanDate(formData.startDate),
        startTime: timeToWoms(formData.startTime),
        endDate: isoToGermanDate(formData.endDate),
        endTime: timeToWoms(formData.endTime),
        totalTime: Number(totalTime),
        supporters,
        supportersBefore: worksheet.supporters
      })
      if (result?.success) {
        onClose()
        return
      }
      setError(result?.error || 'Speichern fehlgeschlagen')
    } catch (err) {
      setError(err.message || 'Speichern fehlgeschlagen')
    }
    setSaving(false)
  }

  return (
    <div className="overlay">
      <span className="overlay-close" onClick={onClose}>
        <FaTimes />
      </span>
      <div className="overlay-content" style={{ maxWidth: 560 }}>
        {/* Kurzer Titel: auf dem Handy laeuft ein langer unter das Schliessen-X */}
        <h2 className="mb-2">{needsTimeEntry(worksheet) ? 'Zeit nachtragen' : 'Zeiten bearbeiten'}</h2>
        <p className="text-grey" style={{ fontSize: '14px', marginBottom: '16px' }}>
          WSID {worksheet.wsid}
          {isGit && <><br />Das Ende ist der Zeitpunkt des Git-Pushs. Trag ein, wann die Arbeit begonnen hat.</>}
        </p>

        {error && (
          <div className="bg-red text-white p-2 mb-2" style={{ borderRadius: '4px' }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label" htmlFor="worksheet-times-start">Beginn</label>
            <DateTimeInput
              id="worksheet-times-start"
              timeLabel="Uhrzeit Beginn"
              required
              timeRequired={isGit}
              date={formData.startDate}
              time={formData.startTime}
              onDateChange={handleStartDateChange}
              onTimeChange={(value) => handleChange('startTime', value)}
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="worksheet-times-end">Ende</label>
            <DateTimeInput
              id="worksheet-times-end"
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
            <label className="form-label" htmlFor="worksheet-times-total">Arbeitszeit</label>
            <DurationSelect
              id="worksheet-times-total"
              value={totalTime}
              onChange={(value) => setManualTotal(value)}
            />
            <small style={{ color: '#a0aec0', fontSize: '12px' }}>
              {manualTotal === null && calculatedTotal !== null
                ? '✓ Aus Beginn und Ende berechnet, aufgerundet auf 15 Minuten'
                : 'Von Hand gewählt'}
            </small>
          </div>

          <SupportersEditor
            value={supporters}
            onChange={setSupporters}
            excludeUserId={currentUserId}
            minutes={totalTime}
          />

          <div className="text-center mt-2">
            <button type="submit" className="btn btn-dark" disabled={saving}>
              {saving ? 'Speichert...' : 'Speichern'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
