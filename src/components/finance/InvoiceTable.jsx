import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { FaPlus, FaSpinner } from 'react-icons/fa6'
import { Badge, Button, Card, EmptyState } from '../ui'
import InvoiceCreateModal from './InvoiceCreateModal'
import Pager from './Pager'
import { deleteInvoice, getInvoices, resendInvoice, sendInvoice, voidInvoice } from '../../lib/financeApi'
import { pageOf } from '../../lib/financeFormat'
import {
  ADDRESS_INCOMPLETE_TEXT,
  DEFAULT_INVOICE_FILTER,
  INVOICES_ANCHOR,
  INVOICE_FILTERS,
  ageGroupCells,
  finalizedFilter,
  invoiceConfirmText,
  invoiceFilterStatuses,
  invoiceSendGate,
  invoiceDoneMessage,
  invoiceFailureMessage,
  invoiceRows,
  isFinalizedNotSent,
  mergeInvoiceLists,
} from '../../lib/financeView'

const PAGE_SIZE = 50
const RUNNING_LABEL = { send: 'Sende …', resend: 'Sende …', void: 'Storniere …', delete: 'Lösche …' }
const CALLS = { send: sendInvoice, resend: resendInvoice, void: voidInvoice, delete: deleteInvoice }

/**
 * Block 6: Rechnungen. Filter Offen / Überfällig / Bezahlt / Entwürfe / Alle (Standard Offen), Altersgruppen der
 * offenen Rechnungen (nur mit `altersgruppen`, also nicht in der Kundenansicht), Tabelle mit 50 Zeilen je Seite
 * und die Aktionen je Status (siehe invoiceActions). Löschen, Stornieren und Erinnerung fragen vorher nach; solange
 * eine Anfrage läuft, sind alle Aktionen gesperrt. „Rechnung schreiben“ öffnet den Dialog.
 *
 * customerId filtert auf einen Kunden; `customer` (Appwrite-Dokument) legt zusätzlich den Kunden im Dialog fest
 * (Kundenansicht). onChanged() meldet jede Änderung (Übersicht neu laden). Schmal (Karte bis 700 px) wird jede
 * Zeile ein Raster: Nummer und Status / Kunde / Datum, Fällig / Betrag, Offen / Aktionen. „Senden“ eines Entwurfs
 * fragt vorher nach. In der Kundenansicht ist „Senden“ gesperrt, solange dem Kunden die Anschrift fehlt und der
 * Entwurf über 250 € liegt (§ 14 Abs. 4 Nr. 1 UStG); `onShowOverview` führt dann im Dialog zur Übersicht.
 *
 * „Offen“ zeigt offene und überfällige Rechnungen (zwei Abrufe, zusammengeführt, neueste zuerst). Ändert sich
 * `refreshToken` (die Seite lädt nach Zuordnen, Bankabruf usw. alles neu), lädt auch die Liste neu.
 */
export default function InvoiceTable({ altersgruppen = null, customerId = null, customer = null, refreshToken = 0, onChanged, onShowOverview = null }) {
  const filterCustomer = customerId || customer?.$id || null
  const [status, setStatus] = useState(DEFAULT_INVOICE_FILTER)
  const [reloadKey, setReloadKey] = useState(0)
  const [result, setResult] = useState({ key: '', list: [] }) // Antwort samt Filter, zu dem sie gehört
  const [error, setError] = useState(null) // { key, message }
  const [page, setPage] = useState(1)
  const [busy, setBusy] = useState(null) // `${id}:${aktion}` der laufenden Anfrage
  const [message, setMessage] = useState(null) // { tone: 'ok' | 'warn', text }
  const [createOpen, setCreateOpen] = useState(false)
  const lockRef = useRef(false)
  const aliveRef = useRef(true)
  const seqRef = useRef(0)
  const onChangedRef = useRef(onChanged)
  onChangedRef.current = onChanged

  useEffect(() => {
    aliveRef.current = true
    return () => {
      aliveRef.current = false
    }
  }, [])

  const key = `${status}|${filterCustomer || ''}`
  useEffect(() => {
    // Nur die jüngste Anfrage zählt (Filterwechsel während des Ladens)
    const mine = ++seqRef.current
    Promise.all(invoiceFilterStatuses(status).map((s) => getInvoices({ status: s, kunde: filterCustomer })))
      .then((results) => {
        if (!aliveRef.current || mine !== seqRef.current) return
        setResult({ key, list: mergeInvoiceLists(results.map((r) => r?.rechnungen)) })
        setError(null)
      })
      .catch((err) => {
        if (!aliveRef.current || mine !== seqRef.current) return
        setError({ key, message: err?.message || 'Die Rechnungen konnten nicht geladen werden.' })
      })
  }, [status, filterCustomer, key, reloadKey, refreshToken])

  // Nur mit bekanntem Kunden (Kundenansicht) lässt sich die Anschrift prüfen
  const sendBlocked = (invoice) => Boolean(customer) && !invoiceSendGate(customer, invoice?.totalCents).sendAllowed

  const reload = () => setReloadKey((k) => k + 1)
  const changed = () => {
    reload()
    if (onChangedRef.current) onChangedRef.current()
  }

  const current = result.key === key
  const invoices = current ? result.list : []
  const rows = useMemo(() => invoiceRows(invoices), [invoices])
  const byId = useMemo(() => Object.fromEntries(invoices.map((inv) => [inv.id, inv])), [invoices])
  const paged = pageOf(rows, page, PAGE_SIZE)
  const loadError = error && error.key === key ? error.message : ''
  const loading = !current && !loadError
  const ages = ageGroupCells(filterCustomer ? null : altersgruppen)

  function pickFilter(next) {
    if (next === status) return
    setStatus(next)
    setPage(1)
    setMessage(null)
  }

  async function run(row, action) {
    if (lockRef.current) return
    const invoice = byId[row.id]
    if (action.key === 'send' && sendBlocked(invoice)) return
    const confirmText = invoiceConfirmText(action.key, invoice)
    if (confirmText && !window.confirm(confirmText)) return
    lockRef.current = true
    setBusy(`${row.id}:${action.key}`)
    setMessage(null)
    try {
      const data = await CALLS[action.key](row.id)
      if (aliveRef.current) setMessage({ tone: 'ok', text: invoiceDoneMessage(action.key, data?.rechnung) })
      if (aliveRef.current) changed()
    } catch (err) {
      if (!aliveRef.current) return
      setMessage({ tone: 'warn', text: invoiceFailureMessage(err) })
      if (isFinalizedNotSent(err)) {
        // Festgeschrieben: die Rechnung ist jetzt offen und steht im Filter „Offen“
        setStatus(finalizedFilter(err))
        setPage(1)
      }
      // Der Stand bei Stripe kann ein anderer sein (schon gesendet, schon bezahlt, gelöscht): neu laden
      changed()
    } finally {
      lockRef.current = false
      if (aliveRef.current) setBusy(null)
    }
  }

  function handleCreated(rechnung, info = {}) {
    if (info.notice) {
      setMessage({ tone: info.tone || 'ok', text: info.notice })
      if (info.finalizedFilter) setStatus(info.finalizedFilter)
    } else {
      setMessage({ tone: 'ok', text: invoiceDoneMessage(info.senden ? 'create-send' : 'create-draft', rechnung) })
      // Der neue Eintrag soll sichtbar sein: Entwurf unter „Entwürfe“, gesendete Rechnung unter „Offen“
      setStatus(rechnung?.status === 'entwurf' ? 'entwurf' : 'offen')
    }
    setPage(1)
    changed()
  }

  return (
    <section id={filterCustomer ? undefined : INVOICES_ANCHOR} className="fin-block">
      <Card
        title="Rechnungen"
        className="fin-invoices-card"
        bodyStyle={{ padding: 0 }}
        actions={
          <Button variant="primary" size="sm" onClick={() => setCreateOpen(true)}>
            <FaPlus aria-hidden="true" /> Rechnung schreiben
          </Button>
        }
      >
        {ages.length > 0 && (
          <ul className="fin-ages" aria-label="Offene Rechnungen nach Alter">
            {ages.map((cell) => (
              <li key={cell.key} className="fin-age">
                <span className="fin-age-label">{cell.label}</span>
                <span className="fin-age-count">{cell.count} {cell.count === 1 ? 'Rechnung' : 'Rechnungen'}</span>
                <span className="fin-amount fin-age-sum">{cell.sumText}</span>
              </li>
            ))}
          </ul>
        )}

        <div className="fin-toolbar">
          <div className="seg" role="group" aria-label="Rechnungen filtern">
            {INVOICE_FILTERS.map((f) => (
              <button
                key={f.key}
                type="button"
                className={status === f.key ? 'active' : ''}
                aria-pressed={status === f.key}
                onClick={() => pickFilter(f.key)}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {message && (
          <p className={`fin-hint fin-notice${message.tone === 'warn' ? ' fin-hint-warn' : ''}`} role={message.tone === 'warn' ? 'alert' : 'status'}>
            {message.text}
          </p>
        )}

        {loading ? (
          <div className="empty" role="status">
            <FaSpinner className="spinner" aria-hidden="true" />
            <p className="muted">Rechnungen werden geladen …</p>
          </div>
        ) : loadError ? (
          <div className="fin-load-error">
            <p className="fin-hint fin-hint-warn" role="alert">{loadError}</p>
            <Button size="sm" onClick={reload}>Erneut versuchen</Button>
          </div>
        ) : rows.length === 0 ? (
          <EmptyState title="Keine Rechnungen in dieser Ansicht." />
        ) : (
          <div className="fin-table-wrap">
            <table className="ui-table fin-invoices" role="table">
              <caption className="fin-sr">Rechnungen, neueste zuerst</caption>
              <thead role="rowgroup">
                <tr role="row">
                  <th role="columnheader" scope="col">Nr.</th>
                  <th role="columnheader" scope="col">Kunde</th>
                  <th role="columnheader" scope="col">Datum</th>
                  <th role="columnheader" scope="col">Fällig</th>
                  <th role="columnheader" scope="col" className="fin-amount">Betrag</th>
                  <th role="columnheader" scope="col" className="fin-amount">Offen</th>
                  <th role="columnheader" scope="col">Status</th>
                  <th role="columnheader" scope="col">Aktionen</th>
                </tr>
              </thead>
              <tbody role="rowgroup">
                {paged.items.map((row) => (
                  <tr key={row.key} role="row">
                    <td role="cell" className="fin-inv-number">
                      {row.numberText}
                      {row.isAbo && <span className="fin-inv-abo muted"> · Abo</span>}
                    </td>
                    <td role="cell" className="fin-inv-customer">{row.customerText}</td>
                    <td role="cell" className="fin-inv-created" data-label="Datum">{row.createdText}</td>
                    <td role="cell" className="fin-inv-due" data-label="Fällig">{row.dueText}</td>
                    <td role="cell" className="fin-amount fin-inv-total" data-label="Betrag">{row.totalText}</td>
                    <td role="cell" className="fin-amount fin-inv-remaining" data-label="Offen">{row.remainingText}</td>
                    <td role="cell" className="fin-inv-status">
                      <div className="fin-inv-statusbox">
                        <Badge tone={row.statusTone}>{row.statusLabel}</Badge>
                        {row.statusNote && <span className="fin-inv-note muted">{row.statusNote}</span>}
                      </div>
                    </td>
                    <td role="cell" className="fin-inv-actions">
                      <div className="fin-actions">
                        {row.actions.map((action) =>
                          action.url ? (
                            <Button
                              key={action.key}
                              as="a"
                              size="sm"
                              variant="ghost"
                              href={action.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              aria-label={`${action.label} öffnen: ${row.numberText}, ${row.customerText}`}
                            >
                              {action.label}
                            </Button>
                          ) : (
                            <Button
                              key={action.key}
                              size="sm"
                              variant={action.key === 'delete' || action.key === 'void' ? 'danger' : 'ghost'}
                              onClick={() => run(row, action)}
                              disabled={busy !== null || (action.key === 'send' && sendBlocked(byId[row.id]))}
                              title={action.key === 'send' && sendBlocked(byId[row.id]) ? ADDRESS_INCOMPLETE_TEXT : undefined}
                              aria-label={`${action.label}: ${row.numberText}, ${row.customerText}`}
                            >
                              {busy === `${row.id}:${action.key}` ? RUNNING_LABEL[action.key] : action.label}
                            </Button>
                          )
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pager page={paged.page} pages={paged.pages} total={rows.length} noun="Rechnungen" onPage={setPage} />
      </Card>

      <InvoiceCreateModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={handleCreated}
        fixedCustomer={customer}
        onShowOverview={onShowOverview}
      />
    </section>
  )
}
