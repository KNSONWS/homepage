import { useCallback, useEffect } from 'react'

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * Fokus für ein Dialog-Overlay: beim Öffnen springt der Fokus in den Dialog (`dialogRef`), beim Schließen zurück zum
 * Element, das ihn vorher hatte (falls es noch da ist). Der zurückgegebene onKeyDown gehört an das Overlay: Tab und
 * Umschalt+Tab bleiben im Dialog (sonst landet man hinter dem Overlay in der Seite).
 */
export function useDialogFocus(dialogRef) {
  useEffect(() => {
    const opener = document.activeElement
    dialogRef.current?.focus()
    return () => {
      if (opener && opener.isConnected && typeof opener.focus === 'function') opener.focus()
    }
  }, [dialogRef])

  return useCallback((e) => {
    if (e.key !== 'Tab') return
    const overlay = e.currentTarget
    const items = [...overlay.querySelectorAll(FOCUSABLE)].filter((el) => el.getClientRects().length > 0)
    if (items.length === 0) {
      e.preventDefault()
      return
    }
    const first = items[0]
    const last = items[items.length - 1]
    const active = document.activeElement
    const onDialogBox = active === dialogRef.current // der Dialog selbst hat den Fokus (tabIndex -1)
    if (e.shiftKey && (active === first || onDialogBox || !overlay.contains(active))) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && (active === last || !overlay.contains(active))) {
      e.preventDefault()
      first.focus()
    }
  }, [dialogRef])
}
