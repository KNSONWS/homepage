import { useEffect } from 'react'

/**
 * Holt das Element in `ref` in den sichtbaren Bereich, sobald sich `trigger` ändert und nicht leer ist (zum Beispiel eine
 * Fehlermeldung ganz oben in einem langen Dialog, die sonst außerhalb des Fensters stehen würde). `block: 'nearest'`
 * bewegt nur so weit wie nötig, ein schon sichtbares Element bleibt ruhig.
 */
export function useScrollIntoView(ref, trigger) {
  useEffect(() => {
    if (!trigger) return
    const el = ref.current
    if (el && typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'nearest' })
  }, [ref, trigger])
}
