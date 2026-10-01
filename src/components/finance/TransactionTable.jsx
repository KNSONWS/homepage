import { useMemo, useState } from 'react'
import { FaSpinner, FaTriangleExclamation } from 'react-icons/fa6'
import { Badge, Button, Card, EmptyState } from '../ui'
import Pager from './Pager'
import { pageOf } from '../../lib/financeFormat'
import { transactionRows } from '../../lib/financeView'

const PAGE_SIZE = 50
export const TRANSACTIONS_ANCHOR = 'finanzen-buchungen'

/**
 * Block 7: Buchungen. Alle gespeicherten Buchungen, neueste zuerst, 50 je Seite: Datum, Gegenpartei mit
 * Verwendungszweck (zweizeilig), Betrag mit Vorzeichen, Zuordnung (bei offenen Buchungen der stärkste Vorschlag als
 * Text) und der Knopf „Zuordnen“ bzw. „Ändern“. Vorgemerkte Buchungen (PDNG) tragen „vorgemerkt“. Die Daten kommen
 * vom Aufrufer (useFinanceTransactions), damit Seite und Zuordnen-Dialog dieselbe Liste benutzen.
 * onAssign(buchung) öffnet den Dialog. Schmal (Karte bis 640 px) wird jede Zeile ein Raster: Datum und Betrag /
 * Gegenpartei und Verwendungszweck / Zuordnung und Knopf.
 */
export default function TransactionTable({ transactions, stripeFehler = '', loaded = false, loading = false, error = '', onReload, onAssign }) {
  const [page, setPage] = useState(1)
  const rows = useMemo(() => transactionRows(transactions), [transactions])
  const paged = pageOf(rows, page, PAGE_SIZE)

  let body
  if (!loaded && loading) {
    body = (
      <div className="empty" role="status">
        <FaSpinner className="spinner" aria-hidden="true" />
        <p className="muted">Buchungen werden geladen …</p>
      </div>
    )
  } else if (!loaded) {
    body = (
      <div className="fin-load-error">
        <p className="fin-hint fin-hint-warn" role="alert">{error || 'Die Buchungen konnten nicht geladen werden.'}</p>
        <Button size="sm" onClick={onReload}>Erneut versuchen</Button>
      </div>
    )
  } else if (rows.length === 0) {
    body = <EmptyState title="Noch keine Buchungen gespeichert." hint="Sobald die Bank verbunden und abgerufen ist, erscheinen sie hier." />
  } else {
    body = (
      <div className="fin-table-wrap">
        <table className="ui-table fin-tx" role="table">
          <caption className="fin-sr">Buchungen, neueste zuerst</caption>
          <thead role="rowgroup">
            <tr role="row">
              <th role="columnheader" scope="col">Datum</th>
              <th role="columnheader" scope="col">Gegenpartei und Verwendungszweck</th>
              <th role="columnheader" scope="col" className="fin-amount">Betrag</th>
              <th role="columnheader" scope="col">Zuordnung</th>
              <th role="columnheader" scope="col"><span className="fin-sr">Aktion</span></th>
            </tr>
          </thead>
          <tbody role="rowgroup">
            {paged.items.map((row) => (
              <tr key={row.key} role="row">
                <td role="cell" className="fin-tx-date">{row.dateText}</td>
                <td role="cell" className="fin-tx-what">
                  <div className="fin-tx-counterparty">{row.counterparty}</div>
                  {row.remittance && (
                    <div className="fin-tx-remittance muted" title={row.remittance}>{row.remittance}</div>
                  )}
                </td>
                <td role="cell" className={`fin-amount fin-tx-amount${row.incoming ? '' : ' fin-tx-out'}`}>{row.amountText}</td>
                <td role="cell" className="fin-tx-assign">
                  <div className="fin-tx-badges">
                    <Badge tone={row.assigned ? 'ok' : 'warn'}>{row.assignmentText}</Badge>
                    {row.pending && <Badge tone="muted">vorgemerkt</Badge>}
                  </div>
                  {row.suggestionText && <div className="fin-tx-suggestion muted">{row.suggestionText}</div>}
                  {row.note && <div className="fin-tx-note muted">Notiz: {row.note}</div>}
                </td>
                <td role="cell" className="fin-tx-action">
                  {row.action && (
                    <Button
                      size="sm"
                      variant={row.action === 'assign' ? 'default' : 'ghost'}
                      onClick={() => onAssign(row.tx)}
                      aria-label={`${row.actionLabel}: ${row.amountText} ${row.counterparty}`}
                    >
                      {row.actionLabel}
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  return (
    <section id={TRANSACTIONS_ANCHOR} className="fin-block">
      <Card title="Buchungen" className="fin-tx-card" bodyStyle={{ padding: 0 }}>
        {loaded && error && (
          <p className="fin-hint fin-hint-warn fin-notice" role="alert">
            Die Buchungen konnten nicht neu geladen werden: {error}{' '}
            <Button size="sm" variant="ghost" onClick={onReload} disabled={loading}>Erneut versuchen</Button>
          </p>
        )}
        {stripeFehler && (
          <p className="fin-hint fin-hint-warn fin-notice" role="status">
            <FaTriangleExclamation aria-hidden="true" /> {stripeFehler}
          </p>
        )}
        {body}
        <Pager page={paged.page} pages={paged.pages} total={rows.length} noun="Buchungen" onPage={setPage} />
      </Card>
    </section>
  )
}
