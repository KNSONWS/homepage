import { useCallback, useEffect, useRef, useState } from 'react'
import { getOverview } from '../lib/financeApi'

const FALLBACK_ERROR = 'Die Übersicht konnte nicht geladen werden.'

/**
 * Lädt die Finanzübersicht (GET /uebersicht).
 * data bleibt beim erneuten Laden stehen, damit die Seite nicht aufblitzt; error ist die Meldung des letzten
 * fehlgeschlagenen Versuchs (leer, solange alles in Ordnung ist). reload() liefert ein Promise, das nie wirft.
 */
export function useFinanceOverview() {
  const [data, setData] = useState(null)
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
      const next = await getOverview()
      if (current()) setData(next && typeof next === 'object' ? next : {})
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

  return { data, loading, error, reload }
}
