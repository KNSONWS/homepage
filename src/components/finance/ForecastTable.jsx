import { FaTriangleExclamation } from 'react-icons/fa6'
import { Badge, Card, EmptyState } from '../ui'
import { forecastNotes, forecastRows } from '../../lib/financeView'

/**
 * Block 3: „Vorschau 30 Tage“. Je Posten Datum, Bezeichnung, „sicher“/„erwartet“ (als Text), Betrag mit Vorzeichen
 * und der laufende Saldo beider Linien ab dem Kontostand. Ohne Kontostand entfallen die Saldo-Spalten (mit Hinweis).
 * Darunter die Annahme des Servers und Hinweise, wenn Stripe oder die Abos fehlen. Schmal (Karte bis 560 px)
 * wird jede Zeile dreizeilig: Datum, Sicherheit und Betrag / Posten / beide Salden; ohne Salden sind es zwei Zeilen.
 */
export default function ForecastTable({ vorschau, kontostandCents, stripeDown = false, abosFehler = false }) {
  const v = vorschau && typeof vorschau === 'object' ? vorschau : {}
  const { rows, hasBalance } = forecastRows(v.posten, kontostandCents)
  const notes = forecastNotes({ kontostandCents, stripeDown, abosFehler, hasRows: rows.length > 0 })
  const assumption = typeof v.annahme === 'string' ? v.annahme.trim() : ''

  return (
    <Card title="Vorschau 30 Tage" className="fin-forecast-card" bodyStyle={{ padding: 0 }}>
      {rows.length === 0 ? (
        <EmptyState title="Keine Zahlungen in den nächsten 30 Tagen bekannt." />
      ) : (
        <div className="fin-table-wrap">
          <table className={`ui-table fin-forecast${hasBalance ? '' : ' fin-forecast-nobal'}`} role="table">
            <caption className="fin-sr">Erwartete Zahlungen der nächsten 30 Tage</caption>
            <thead role="rowgroup">
              <tr role="row">
                <th role="columnheader" scope="col">Datum</th>
                <th role="columnheader" scope="col">Posten</th>
                <th role="columnheader" scope="col">Sicherheit</th>
                <th role="columnheader" scope="col" className="fin-amount">Betrag</th>
                {hasBalance && (
                  <>
                    <th role="columnheader" scope="col" className="fin-amount">Saldo sicher</th>
                    <th role="columnheader" scope="col" className="fin-amount">Saldo erwartet</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody role="rowgroup">
              {rows.map((row) => (
                <tr key={row.key} role="row">
                  <td role="cell" className="fin-forecast-date">{row.dateText}</td>
                  <td role="cell" className="fin-forecast-label">{row.label}</td>
                  <td role="cell" className="fin-forecast-kind">
                    <Badge tone={row.sicherheit === 'sicher' ? 'ok' : 'info'}>{row.sicherheit}</Badge>
                  </td>
                  <td role="cell" className="fin-amount fin-forecast-amount">{row.amountText}</td>
                  {hasBalance && (
                    <>
                      <td
                        role="cell"
                        data-label="Saldo sicher"
                        className={`fin-amount fin-forecast-sicher${row.saldoSicherNegative ? ' fin-neg' : ''}`}
                      >
                        <span className="fin-saldo">{row.saldoSicherText}</span>
                      </td>
                      <td
                        role="cell"
                        data-label="Saldo erwartet"
                        className={`fin-amount fin-forecast-erwartet${row.saldoErwartetNegative ? ' fin-neg' : ''}`}
                      >
                        <span className="fin-saldo">{row.saldoErwartetText}</span>
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {(notes.length > 0 || assumption) && (
        <div className="fin-forecast-foot">
          {notes.map((note) => (
            <p key={note.key} className="fin-hint fin-hint-warn" role="status">
              <FaTriangleExclamation aria-hidden="true" /> {note.text}
            </p>
          ))}
          {assumption && <p className="fin-hint">{assumption}</p>}
        </div>
      )}
    </Card>
  )
}
