import { useEffect, useState } from 'react'
import { getInvoices } from '../lib/financeApi'
import { invoiceFilterStatuses, mergeInvoiceLists } from '../lib/financeView'

const FALLBACK_ERROR = 'Die offenen Rechnungen konnten nicht geladen werden.'

/**
 * Offene und überfällige Rechnungen für den Zuordnen-Dialog. Lädt jedes Mal frisch, wenn `active` true wird
 * (damit der Dialog nie auf einem alten Stand arbeitet), und leert die Liste, wenn es wieder false ist.
 * `loaded` ist true, sobald die Liste dieser Öffnung frisch und ohne Fehler da ist (erst dann darf der Dialog eine
 * Rechnung als „nicht mehr offen“ erkennen). Scheitert Stripe, bleibt `invoices` leer und `error` nennt den Grund
 * (Kategorien lassen sich trotzdem wählen).
 */
export function useOpenInvoices(active) {
  const [state, setState] = useState({ invoices: [], loading: false, error: '', loaded: false })

  useEffect(() => {
    if (!active) {
      setState({ invoices: [], loading: false, error: '', loaded: false })
      return undefined
    }
    let cancelled = false
    setState({ invoices: [], loading: true, error: '', loaded: false })
    Promise.all(invoiceFilterStatuses('offen').map((status) => getInvoices({ status })))
      .then((results) => {
        if (cancelled) return
        setState({ invoices: mergeInvoiceLists(results.map((r) => r?.rechnungen)), loading: false, error: '', loaded: true })
      })
      .catch((err) => {
        if (!cancelled) setState({ invoices: [], loading: false, error: err?.message || FALLBACK_ERROR, loaded: false })
      })
    return () => {
      cancelled = true
    }
  }, [active])

  return state
}
