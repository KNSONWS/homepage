// Hilfen für den Preview-Block (Variablen, Status-Punkt, Dev-Erkennung)

export function isValidEnvName(name) {
  return /^[A-Z_][A-Z0-9_]*$/.test(String(name ?? ''))
}

// Änderungen ⇒ Body für PUT /preview/env; entfernte Namen werden nicht zugleich gesetzt
export function buildEnvPayload(setMap = {}, removeList = []) {
  const remove = [...new Set(removeList)]
  const set = {}
  for (const [k, v] of Object.entries(setMap)) if (!remove.includes(k)) set[k] = v
  return { set, remove }
}

const DOT_COLORS = { online: '#10b981', building: '#f59e0b', sleeping: '#f59e0b', starting: '#f59e0b', failed: '#ef4444' }
export function dotColor(state) {
  return DOT_COLORS[state] || '#a0aec0'
}

export function isDevPreview(p) {
  if (!p) return false
  if (p.mode === 'dev') return true
  return (p.mode || 'auto') === 'auto' && typeof p.detected === 'string' && p.detected.startsWith('dev:')
}

export const MAX_ENV_VARS = 30
export function envValueTooLong(value) {
  return new TextEncoder().encode(String(value ?? '')).length > 4096
}
