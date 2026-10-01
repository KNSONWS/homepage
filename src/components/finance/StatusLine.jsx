import { useEffect, useRef, useState } from 'react'
import { FaRotate, FaTriangleExclamation } from 'react-icons/fa6'
import { Button } from '../ui'
import { statusItems } from '../../lib/financeView'

/**
 * Block 0: Stand von Bank und Stripe in einer Zeile und der Knopf „Aktualisieren“.
 * onRefresh() ruft den Bankabruf und lädt die Übersicht neu; wirft er (z. B. 429 „Bitte in N Minuten erneut
 * versuchen.“), erscheint die Meldung des Servers als Hinweis unter der Zeile.
 */
export default function StatusLine({ stand, onRefresh, refreshing = false }) {
  const [hint, setHint] = useState(null) // { text, limited }
  const aliveRef = useRef(true)
  useEffect(() => {
    aliveRef.current = true
    return () => {
      aliveRef.current = false
    }
  }, [])

  const items = statusItems(stand)

  async function handleRefresh() {
    setHint(null)
    try {
      await onRefresh()
    } catch (err) {
      if (aliveRef.current) {
        setHint({ text: err?.message || 'Der Abruf ist fehlgeschlagen.', limited: err?.status === 429 })
      }
    }
  }

  return (
    <div className="fin-status-wrap">
      <div className="fin-status">
        <div className="fin-status-items">
          {items.map((item) => (
            <span key={item.key} className={`fin-status-item${item.ok ? '' : ' fin-status-warn'}`}>
              {!item.ok && <FaTriangleExclamation aria-hidden="true" />}
              {item.text}
            </span>
          ))}
        </div>
        <Button size="sm" variant="ghost" onClick={handleRefresh} disabled={refreshing}>
          <FaRotate className={refreshing ? 'fin-spin' : undefined} aria-hidden="true" />{' '}
          {refreshing ? 'Aktualisiere …' : 'Aktualisieren'}
        </Button>
      </div>
      {hint && (
        <p className={`fin-hint${hint.limited ? '' : ' fin-hint-warn'}`} role={hint.limited ? 'status' : 'alert'}>
          {hint.text}
        </p>
      )}
    </div>
  )
}
