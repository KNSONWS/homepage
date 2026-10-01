// Klick irgendwo ins Datumsfeld oeffnet den Kalender, nicht nur das kleine Symbol
const openCalendar = (e) => {
  try {
    e.currentTarget.showPicker?.()
  } catch {
    // aeltere Browser: Kalender bleibt ueber das Symbol erreichbar
  }
}

/* Datum mit Kalender und Uhrzeit nebeneinander. Werte wie die Browser-Felder:
   Datum "yyyy-mm-dd", Uhrzeit "hh:mm" - umgerechnet wird erst beim Speichern. */
export default function DateTimeInput({ id, date, time, onDateChange, onTimeChange, min, required, timeRequired, timeLabel }) {
  return (
    <div className="datetime-pair">
      <input
        id={id}
        type="date"
        className="form-control"
        min={min || undefined}
        required={required}
        value={date}
        onChange={(e) => onDateChange(e.target.value)}
        onClick={openCalendar}
      />
      <input
        type="time"
        className="form-control"
        aria-label={timeLabel}
        required={timeRequired}
        value={time}
        onChange={(e) => onTimeChange(e.target.value)}
      />
    </div>
  )
}
