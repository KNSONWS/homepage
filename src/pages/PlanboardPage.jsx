import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { format, addDays, startOfWeek, isSameDay } from 'date-fns'
import { de } from 'date-fns/locale'
import { FaChevronLeft, FaChevronRight } from 'react-icons/fa6'
import { PageHeader, Card, Button } from '../components/ui'
import { useWorkorders } from '../hooks/useWorkorders'
import { useEmployees } from '../hooks/useEmployees'
import { groupAppointmentsByDay, countInRange, dayKey } from '../lib/planboard'

/* Termine haengen an den Tickets (startDate/startTime/endTime/assignedTo);
   die Aufbereitung steckt in src/lib/planboard.js. */

const TYPE_COLORS = {
  akquise: { bg: 'rgba(198,113,57,0.16)', fg: '#c67139' },
  webpage: { bg: 'rgba(122,138,94,0.18)', fg: '#7a8a5e' },
  project: { bg: 'rgba(122,138,94,0.18)', fg: '#7a8a5e' },
}

export default function PlanboardPage() {
  const navigate = useNavigate()
  const [currentWeek, setCurrentWeek] = useState(startOfWeek(new Date(), { weekStartsOn: 1 }))
  const { workorders, loading } = useWorkorders({ limit: 500 })
  const { employees } = useEmployees()

  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(currentWeek, i))
  const navigateWeek = (dir) => setCurrentWeek((prev) => addDays(prev, dir * 7))
  const goToday = () => setCurrentWeek(startOfWeek(new Date(), { weekStartsOn: 1 }))

  const byDay = useMemo(() => groupAppointmentsByDay(workorders || [], employees || []), [workorders, employees])
  const weekCount = countInRange(byDay, weekDays)

  return (
    <div className="page">
      <PageHeader
        title="Planboard"
        subtitle={loading ? 'Wochenplanung – lädt…' : `Wochenplanung – ${weekCount} ${weekCount === 1 ? 'Termin' : 'Termine'} diese Woche`}
        actions={
          <div className="flex gap-2 items-center">
            <Button variant="ghost" onClick={() => navigateWeek(-1)}><FaChevronLeft /></Button>
            <span className="muted" style={{ minWidth: 200, textAlign: 'center' }}>
              {format(currentWeek, 'dd.MM.yyyy')} - {format(addDays(currentWeek, 6), 'dd.MM.yyyy')}
            </span>
            <Button variant="ghost" onClick={() => navigateWeek(1)}><FaChevronRight /></Button>
            <Button variant="ghost" onClick={goToday}>Heute</Button>
          </div>
        }
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 12 }}>
        {weekDays.map((day) => {
          const entries = byDay[dayKey(day)] || []
          const today = isSameDay(day, new Date())
          return (
            <Card key={day.toISOString()} pad={false}>
              <div style={{
                padding: '10px 12px',
                borderBottom: '1px solid var(--border)',
                display: 'flex',
                flexDirection: 'column',
                background: today ? 'rgba(198,113,57,0.10)' : undefined,
              }}>
                <strong style={{ fontSize: 13 }}>{format(day, 'EEEE', { locale: de })}</strong>
                <span className="faint" style={{ fontSize: 12 }}>{format(day, 'dd.MM')}</span>
              </div>

              <div style={{ padding: 8, minHeight: 120, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {entries.length === 0 && (
                  <p className="faint" style={{ fontSize: 12, padding: '4px 4px 0' }}>Keine Termine</p>
                )}

                {entries.map((entry) => {
                  const color = TYPE_COLORS[String(entry.type).toLowerCase()]
                    || { bg: 'rgba(127,127,127,0.10)', fg: 'var(--border)' }
                  return (
                    <button
                      key={entry.id}
                      type="button"
                      title={`Ticket #${entry.woid} öffnen`}
                      onClick={() => navigate(`/tickets?woid=${encodeURIComponent(entry.woid)}`)}
                      style={{
                        textAlign: 'left',
                        border: '1px solid var(--border)',
                        borderLeft: `3px solid ${color.fg}`,
                        borderRadius: 8,
                        background: color.bg,
                        color: 'inherit',
                        padding: '8px 10px',
                        cursor: 'pointer',
                        font: 'inherit',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 2,
                      }}
                    >
                      <span style={{ fontSize: 12, fontWeight: 700 }}>
                        {entry.time ? `${entry.time}${entry.endTime ? `–${entry.endTime}` : ''}` : 'ohne Uhrzeit'}
                      </span>
                      <span style={{ fontSize: 12.5, fontWeight: 600, lineHeight: 1.25 }}>
                        {entry.customerName || entry.topic}
                      </span>
                      {entry.customerName && (
                        <span className="faint" style={{ fontSize: 11.5, lineHeight: 1.25 }}>{entry.topic}</span>
                      )}
                      <span className="faint" style={{ fontSize: 11 }}>
                        #{entry.woid}
                        {entry.employeeName ? ` · ${entry.employeeShort || entry.employeeName}` : ' · niemand zugewiesen'}
                      </span>
                    </button>
                  )
                })}
              </div>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
