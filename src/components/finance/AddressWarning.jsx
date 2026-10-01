import { Link } from 'react-router-dom'
import { ADDRESS_INCOMPLETE_TEXT, addressComplete } from '../../lib/financeView'

/**
 * Hinweis „Adresse des Kunden unvollständig (Straße, PLZ, Ort). Für den Versand bitte zuerst ergänzen.“ mit Weg zur
 * Übersicht des Kunden (dort stehen die Stammdaten). Rendert nichts, wenn die Anschrift vollständig ist. Mit
 * `onShowOverview` (Reiter am Kunden) wechselt ein Knopf zum Reiter Übersicht, sonst führt ein Link zur Kundenseite.
 * `variant`: 'dialog' (im Rechnungsdialog) oder 'page' (über der Rechnungsliste des Kunden).
 */
export default function AddressWarning({ customer, onShowOverview, variant = 'page' }) {
  if (!customer || addressComplete(customer)) return null
  return (
    <div className={`fin-address-warn fin-address-warn-${variant}`} role="alert">
      <span>{ADDRESS_INCOMPLETE_TEXT}</span>
      {onShowOverview ? (
        <button type="button" className="fin-link" onClick={onShowOverview}>
          Zur Übersicht
        </button>
      ) : customer.$id ? (
        <Link className="fin-link" to={`/customers/${customer.$id}`}>
          Zur Übersicht
        </Link>
      ) : null}
    </div>
  )
}
