import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Lädt eine Ressource der Finanzen-API (z. B. getSettings) und hält sie.
 * data bleibt beim erneuten Laden stehen; error ist die Meldung des letzten fehlgeschlagenen Versuchs (leer, solange
 * alles in Ordnung ist). reload() liefert ein Promise, das nie wirft; nur der jüngste Aufruf zählt.
 */
export function useFinanceResource(load, fallbackError) {
  const [state, setState] = useState({ data: null, loading: true, error: '' })
  const aliveRef = useRef(true)
  const seqRef = useRef(0)
  const loadRef = useRef(load)
  loadRef.current = load

  const reload = useCallback(async () => {
    const mine = ++seqRef.current
    const current = () => aliveRef.current && mine === seqRef.current
    setState((s) => ({ ...s, loading: true, error: '' }))
    try {
      const data = await loadRef.current()
      if (current()) setState({ data: data && typeof data === 'object' ? data : {}, loading: false, error: '' })
    } catch (err) {
      if (current()) setState((s) => ({ ...s, loading: false, error: err?.message || fallbackError }))
    }
  }, [fallbackError])

  useEffect(() => {
    aliveRef.current = true
    reload()
    return () => {
      aliveRef.current = false
    }
  }, [reload])

  return { ...state, reload }
}
