/* Arbeitszeit wird nur in 15-Minuten-Schritten erfasst (15 min bis 12 h).
   Aus Beginn und Ende berechnete Zeiten werden auf den naechsten Schritt aufgerundet.
   12 h ist auch das Maximum der Push-Zeitmail im Kundenportal. */

export const TIME_STEP = 15
export const MAX_STEP_MINUTES = 720

// 50 -> 60, 61 -> 75; keine oder negative Dauer -> 15 (kleinster Schritt)
export function roundUpToStep(minutes) {
  const value = Number(minutes)
  if (!Number.isFinite(value) || value <= 0) return TIME_STEP
  return Math.ceil(value / TIME_STEP) * TIME_STEP
}

export function isValidStep(minutes) {
  if (typeof minutes !== 'number' && typeof minutes !== 'string') return false
  const value = Number(minutes)
  return Number.isInteger(value) && value > 0 && value % TIME_STEP === 0 && value <= MAX_STEP_MINUTES
}

// 15 -> "15 min", 60 -> "1 h", 75 -> "1 h 15 min"
export function stepLabel(minutes) {
  const value = Math.max(0, Number(minutes) || 0)
  const hours = Math.floor(value / 60)
  const mins = value % 60
  if (!hours) return `${mins} min`
  return mins ? `${hours} h ${mins} min` : `${hours} h`
}

// Auswahl 15 min … 12 h. Ein alter, laengerer Wert im Raster bleibt waehlbar.
export function stepOptions(current) {
  const options = []
  for (let m = TIME_STEP; m <= MAX_STEP_MINUTES; m += TIME_STEP) options.push({ value: m, label: stepLabel(m) })
  const value = Number(current)
  if (Number.isInteger(value) && value > MAX_STEP_MINUTES && value % TIME_STEP === 0) {
    options.push({ value, label: stepLabel(value) })
  }
  return options
}
