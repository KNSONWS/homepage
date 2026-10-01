import { needsTimeEntry } from '../lib/ticketForm'
import { worksheetMinutes } from '../lib/support'

const formatTime = (minutes) => {
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  return hours > 0 ? `${hours}h ${mins}min` : `${mins}min`
}

// Eine Zeile ueber der Arbeitsblatt-Liste: Arbeitszeit (inkl. Unterstuetzung), Anzahl, offene Git-Zeiten
export default function WorksheetSummary({ worksheets }) {
  if (!worksheets || worksheets.length === 0) return null
  const minutes = worksheets
    .filter((ws) => !ws.isComment)
    .reduce((sum, ws) => sum + worksheetMinutes(ws), 0)
  const open = worksheets.filter(needsTimeEntry).length

  return (
    <div className="worksheet-summary">
      <span>Arbeitszeit gesamt <strong>{formatTime(minutes)}</strong></span>
      <span>{worksheets.length} {worksheets.length === 1 ? 'Arbeitsblatt' : 'Arbeitsblätter'}</span>
      {open > 0 && <span className="open">{open} {open === 1 ? 'Zeit offen' : 'Zeiten offen'}</span>}
    </div>
  )
}
