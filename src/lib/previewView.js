// Anzeige-Logik für den Block "Preview" (Status, Erkennung, Modi)

export const MODE_OPTIONS = [
  { value: 'auto', label: 'Automatisch' },
  { value: 'build', label: 'Build' },
  { value: 'dev', label: 'Dev-Server' },
  { value: 'off', label: 'Aus' },
]

export const NO_DEV_HINT = 'Reines HTML braucht keinen Dev-Server – Änderungen erscheinen nach jedem Push automatisch.'
const DEV_UNAVAILABLE = 'Dev-Modus hier nicht möglich'

// Modus-Optionen; "Dev-Server" nur wählbar, wenn das Projekt ein dev-Skript hat (devAvailable !== false)
export function modeOptionsFor(devAvailable) {
  return MODE_OPTIONS.map((o) => (o.value === 'dev' && devAvailable === false
    ? { ...o, label: 'Dev-Server (kein dev-Skript)', disabled: true }
    : { ...o, disabled: false }))
}

export const isDevUnavailableError = (error) => typeof error === 'string' && error.startsWith(DEV_UNAVAILABLE)

const dateFormat = new Intl.DateTimeFormat('de-DE', {
  timeZone: 'Europe/Berlin',
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

// "TT.MM. HH:MM" in Europe/Berlin
function formatBerlin(value) {
  const d = new Date(value)
  if (!value || Number.isNaN(d.getTime())) return ''
  const parts = Object.fromEntries(dateFormat.formatToParts(d).map((p) => [p.type, p.value]))
  return `${parts.day}.${parts.month}. ${parts.hour}:${parts.minute}`
}

export function previewStatus(p) {
  const state = p?.state || 'off'
  switch (state) {
    case 'online': {
      const at = formatBerlin(p.builtAt)
      const sha = p.builtSha ? String(p.builtSha).slice(0, 7) : ''
      if (!at) return { color: 'green', text: 'Online' }
      return { color: 'green', text: `Online seit ${at}${sha ? ` (Build ${sha})` : ''}` }
    }
    case 'building':
      return { color: 'yellow', text: 'Baut gerade …' }
    case 'starting':
      return { color: 'yellow', text: 'Dev-Server startet …' }
    case 'sleeping':
      return { color: 'yellow', text: 'Dev-Server schläft, startet beim nächsten Aufruf' }
    case 'failed':
      if (isDevUnavailableError(p.error)) return { color: 'yellow', text: 'Dev-Modus hier nicht möglich – statische Version ist online' }
      return { color: 'red', text: 'Build fehlgeschlagen – letzte funktionierende Version ist online' }
    default:
      return { color: 'grey', text: 'Keine Preview' }
  }
}

// 'static' | 'build:<pm>' | 'dev:<pm>' | 'build:<framework>:<pm>' ⇒ Anzeigetext
export function detectedLabel(detected) {
  if (!detected || typeof detected !== 'string') return ''
  if (detected === 'static') return 'Statisch'
  const [kind, ...rest] = detected.split(':')
  const base = kind === 'build' ? 'Build' : kind === 'dev' ? 'Dev-Server' : ''
  if (!base || !rest.length || rest.some((x) => !x)) return ''
  const pm = rest[rest.length - 1]
  const fw = rest.length > 1 ? rest[0] : ''
  const fwLabel = fw ? fw.charAt(0).toUpperCase() + fw.slice(1) : ''
  return `${base} (${fwLabel ? `${fwLabel}, ` : ''}${pm})`
}

export function modeHint(mode, detected) {
  if ((mode || 'auto') !== 'auto') return ''
  const label = detectedLabel(detected)
  return label ? `Automatisch → ${label}` : ''
}
