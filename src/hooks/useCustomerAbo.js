import { useEffect, useState } from 'react'
import { getCustomerAbo } from '../lib/customerAdminApi'

// Ergebnis je Kunde zwischengespeichert (nur Erfolge), laufende Abfragen werden geteilt
const cache = new Map()
const inflight = new Map()

function load(customerId) {
  if (cache.has(customerId)) return Promise.resolve(cache.get(customerId))
  if (!inflight.has(customerId)) {
    const p = getCustomerAbo(customerId)
      .then((data) => {
        const abo = { productKey: data?.productKey ?? null, active: Boolean(data?.active) }
        cache.set(customerId, abo)
        return abo
      })
      .finally(() => inflight.delete(customerId))
    inflight.set(customerId, p)
  }
  return inflight.get(customerId)
}

// { productKey, active, loading, error, hoursAllowed }
// hoursAllowed: darf der Schalter "Vom Abo-Stundenkonto abziehen" gezeigt werden?
//  - nur bei aktivem Wartungs-Abo (Hosting-Abo hat kein Stundenkonto)
//  - waehrend des Ladens nicht
//  - bei Fehler der Schnittstelle ja (wie bisher), mit Warnung in der Konsole
//  - ohne Kunde am Ticket nicht (es gibt kein Konto, das belastet werden koennte)
// enabled=false: noch nichts laden (die Karten sind meist zugeklappt)
export function useCustomerAbo(customerId, enabled = true) {
  const [state, setState] = useState(() => ({
    key: null, abo: null, error: false,
  }))

  useEffect(() => {
    if (!customerId || !enabled) return undefined
    let cancelled = false
    load(customerId)
      .then((abo) => { if (!cancelled) setState({ key: customerId, abo, error: false }) })
      .catch((err) => {
        console.warn('Abo-Status des Kunden konnte nicht geladen werden:', err?.message || err)
        if (!cancelled) setState({ key: customerId, abo: null, error: true })
      })
    return () => { cancelled = true }
  }, [customerId, enabled])

  const ready = Boolean(customerId) && state.key === customerId
  const cached = customerId ? cache.get(customerId) : null
  const abo = ready && state.abo ? state.abo : cached
  const error = ready && state.error
  const loading = Boolean(customerId) && enabled && !abo && !error
  const productKey = abo?.productKey ?? null
  const active = abo?.active ?? false
  const hoursAllowed = !customerId || loading
    ? false
    : error || (productKey === 'wartung' && active)

  return { productKey, active, loading, error, hoursAllowed }
}
