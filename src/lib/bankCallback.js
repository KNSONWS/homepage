// Rueckkehr von der Bankfreigabe (Finom): Adresse auswerten und Ergebnis fuer die Seite aufbereiten.

const FALLBACK_ERROR = 'Die Bankfreigabe konnte nicht abgeschlossen werden.'

/**
 * '?state=a&code=b' -> { code, state, error }; null, wenn weder code noch error vorhanden sind.
 * error_description wird an error angehaengt ('access_denied: abgebrochen').
 */
export function parseCallback(search) {
  if (typeof search !== 'string') return null
  const params = new URLSearchParams(search)
  const code = params.get('code') || ''
  const state = params.get('state') || ''
  let error = params.get('error') || ''
  const description = params.get('error_description') || ''
  if (!code && !error) return null
  if (error && description) error = `${error}: ${description}`
  return { code, state, error }
}

/** Antwort von completeBankAuth -> { ok: true, validUntil } (alles andere gilt als Fehler). */
export function successResult(response) {
  if (response && response.ok === true) {
    return { ok: true, validUntil: typeof response.validUntil === 'string' ? response.validUntil : '' }
  }
  return { ok: false, message: FALLBACK_ERROR }
}

/** Fehler von completeBankAuth -> { ok: false, message } mit der deutschen Meldung des Servers. */
export function failureResult(err) {
  const message = typeof err?.message === 'string' && err.message.trim() ? err.message : FALLBACK_ERROR
  return { ok: false, message }
}

/** Prueft ein Ergebnis, das aus dem Verlaufszustand des Browsers gelesen wurde. */
export function isResult(value) {
  return Boolean(value) && typeof value === 'object' && typeof value.ok === 'boolean'
}
