/* Planboard-Logik: aus Tickets werden Termine.
   Termine sind kein eigener Datensatz - sie haengen an den Tickets selbst
   (startDate/startTime/endTime/assignedTo). Die Rechnungsanalyse im
   Kundenportal schreibt genau diese Felder, deshalb erscheint ein dort
   vereinbarter Termin hier ohne Umweg.
   WOMS speichert Datum als Text "dd.mm.yyyy" (auch einstellig: "2.5.2026")
   und Uhrzeit als "hhmm". Beides wird hier tolerant gelesen. */

export function parseGermanDate(value) {
  const m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(String(value || '').trim())
  if (!m) return null
  const day = Number(m[1])
  const month = Number(m[2])
  const year = Number(m[3])
  const date = new Date(year, month - 1, day)
  // "31.02.2026" wuerde sonst still zum 3. Maerz werden
  if (date.getDate() !== day || date.getMonth() !== month - 1 || date.getFullYear() !== year) return null
  return date
}

export function formatTime(value) {
  const m = /^(\d{1,2}):?(\d{2})$/.exec(String(value || '').trim())
  if (!m) return ''
  const hour = Number(m[1])
  const minute = Number(m[2])
  if (hour > 23 || minute > 59) return ''
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

export function dayKey(date) {
  const pad = (n) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export function toAppointment(workorder, employeeByUserId = {}) {
  const date = parseGermanDate(workorder.startDate)
  if (!date) return null
  const employee = employeeByUserId[workorder.assignedTo]
  return {
    id: workorder.$id,
    woid: workorder.woid || '',
    date,
    key: dayKey(date),
    time: formatTime(workorder.startTime),
    endTime: formatTime(workorder.endTime),
    topic: workorder.topic || workorder.title || 'Ohne Betreff',
    type: workorder.type || '',
    status: workorder.status || '',
    customerName: workorder.customerName || '',
    employeeName: employee?.displayName || workorder.assignedName || '',
    employeeShort: employee?.shortcode || '',
  }
}

/* Termine nach Tag ("yyyy-mm-dd"), innerhalb des Tages nach Uhrzeit.
   Eintraege ohne Uhrzeit landen am Ende des Tages. */
export function groupAppointmentsByDay(workorders = [], employees = []) {
  const employeeByUserId = {}
  for (const e of employees) employeeByUserId[e.userId] = e

  const map = {}
  for (const wo of workorders) {
    const appointment = toAppointment(wo, employeeByUserId)
    if (!appointment) continue
    ;(map[appointment.key] = map[appointment.key] || []).push(appointment)
  }
  for (const key of Object.keys(map)) {
    map[key].sort((a, b) => (a.time || '99:99').localeCompare(b.time || '99:99'))
  }
  return map
}

export function countInRange(byDay, days = []) {
  return days.reduce((sum, d) => sum + (byDay[dayKey(d)]?.length || 0), 0)
}
