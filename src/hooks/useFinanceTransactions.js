import { useCallback, useEffect, useRef, useState } from 'react'
import { getTransactions } from '../lib/financeApi'

const FALLBACK_ERROR = 'Die Buchungen konnten nicht geladen werden.'

/**
 * Lädt die gespeicherten Buchungen samt Zuordnungsvorschlägen (GET /buchungen, höchstens 1000, neueste zuerst).
 * `transactions` bleibt beim erneuten Laden stehen; `loaded` ist true, sobald einmal geladen wurde (auch leer);
 * `stripeFehler` ist der Hinweis des Servers, wenn Stripe die Vorschläge nicht liefern konnte. reload() wirft nie.
 */
export function useFinanceTransactions() {
  const [state, setState] = useState({ transactions: [], stripeFehler: '', loaded: false })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const aliveRef = useRef(true)
  const seqRef = useRef(0)

  const reload = useCallback(async () => {
    // Nur die jüngste Anfrage zählt: eine langsame ältere darf neuere Daten nicht überschreiben
    const mine = ++seqRef.current
    const current = () => aliveRef.current && mine === seqRef.current
    setLoading(true)
    setError('')
    try {
      const data = await getTransactions()
      if (current()) {
        setState({
          transactions: Array.isArray(data?.buchungen) ? data.buchungen : [],
          stripeFehler: typeof data?.stripeFehler === 'string' ? data.stripeFehler : '',
          loaded: true,
        })
      }
    } catch (err) {
      if (current()) setError(err?.message || FALLBACK_ERROR)
    } finally {
      if (current()) setLoading(false)
    }
  }, [])

  useEffect(() => {
    aliveRef.current = true
    reload()
    return () => {
      aliveRef.current = false
    }
  }, [reload])

  return { ...state, loading, error, reload }
}
