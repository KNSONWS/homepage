import { useEffect, useMemo, useRef, useState } from 'react'
import { FaPlus, FaTrashCan, FaXmark } from 'react-icons/fa6'
import { AutocompleteInput, Button } from '../ui'
import AddressWarning from './AddressWarning'
import { useCustomers } from '../../hooks/useCustomers'
import { useDialogFocus } from '../../hooks/useDialogFocus'
import { useScrollIntoView } from '../../hooks/useScrollIntoView'
import { createInvoice } from '../../lib/financeApi'
import { canInvoice, euro } from '../../lib/financeFormat'
import {
  ADDRESS_INCOMPLETE_TEXT,
  INVOICE_LIMITS,
  customerName,
  customerPickerOptions,
  customerSuggestions,
  finalizedFilter,
  invoiceFailureMessage,
  invoiceSendConfirmText,
  invoiceSendGate,
  invoiceTotalCents,
  isFinalizedNotSent,
  lineTotalCents,
  resolveCustomerText,
  validateInvoiceForm,
} from '../../lib/financeView'

let itemCounter = 0
const newItem = () => ({ uid: ++itemCounter, description: '', quantity: '1', price: '' })

/**
 * Dialog „Rechnung schreiben“. Kunde (nur feste Kunden mit E-Mail wählbar; mit `fixedCustomer` steht er fest),
 * Positionen (Beschreibung, Menge, Einzelpreis in Euro), Zahlungsziel (Standard 14 Tage), Notiz, Summe und der
 * Hinweis nach § 19 UStG. „Als Entwurf speichern“ und „Senden“ sperren sich gegenseitig, solange die Anfrage läuft;
 * Fehler des Servers stehen im Dialog (und werden in den sichtbaren Bereich geholt). „Senden“ fragt vorher nach
 * (die Rechnung wird festgeschrieben und per Mail an den Kunden geschickt). Fehlt dem Kunden die Anschrift (Straße,
 * PLZ, Ort), steht eine Warnung mit Weg zur Übersicht da, und „Senden“ ist über 250 € gesperrt (§ 14 Abs. 4 Nr. 1
 * UStG; Entwürfe bleiben möglich). `onShowOverview` (Reiter am Kunden) wechselt zur Übersicht, sonst führt ein Link
 * zur Kundenseite.
 *
 * onCreated(rechnung, { senden }) nach Erfolg; wurde die Rechnung festgeschrieben, aber nicht versendet (502 mit
 * invoiceId), kommt onCreated(null, { senden: true, notice, tone: 'warn', finalizedFilter }) und der Dialog schließt
 * (die Rechnung steht dann „offen“ in der Liste und lässt sich dort erneut senden). Danach ruft der Dialog onClose().
 */
export default function InvoiceCreateModal({ open, onClose, onCreated, fixedCustomer = null, onShowOverview = null }) {
  if (!open) return null
  // Die Kundenliste (Appwrite, bis 5000 Dokumente) wird nur geholt, wenn der Kunde nicht feststeht
  return fixedCustomer ? (
    <InvoiceForm onClose={onClose} onCreated={onCreated} fixedCustomer={fixedCustomer} source={null} onShowOverview={onShowOverview} />
  ) : (
    <PickerForm onClose={onClose} onCreated={onCreated} />
  )
}

function PickerForm({ onClose, onCreated }) {
  const { customers, loading, error } = useCustomers()
  return <InvoiceForm onClose={onClose} onCreated={onCreated} fixedCustomer={null} source={{ customers, loading, error }} onShowOverview={null} />
}

function InvoiceForm({ onClose, onCreated, fixedCustomer, source, onShowOverview }) {
  const [customerText, setCustomerText] = useState('')
  const [items, setItems] = useState(() => [newItem()])
  const [days, setDays] = useState(String(INVOICE_LIMITS.defaultDays))
  const [memo, setMemo] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(null) // 'draft' | 'send'
  const lockRef = useRef(false)
  const aliveRef = useRef(true)
  const dialogRef = useRef(null)
  const errorRef = useRef(null)

  const onOverlayKeyDown = useDialogFocus(dialogRef)
  // Der Dialog kann höher sein als das Fenster: eine Fehlermeldung oben soll nicht außerhalb des Bildes stehen
  useScrollIntoView(errorRef, error)

  useEffect(() => {
    aliveRef.current = true
    return () => {
      aliveRef.current = false
    }
  }, [])

  useEffect(() => {
    const onKey = (e) => {
      // Escape schließt auch die Kundenliste (Autovervollständigung): dann nicht den ganzen Dialog
      if (e.key === 'Escape' && !e.defaultPrevented && !lockRef.current) onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const options = useMemo(() => customerPickerOptions(source?.customers), [source?.customers])
  const resolved = fixedCustomer
    ? { state: canInvoice(fixedCustomer).ok ? 'ok' : 'blocked', option: null }
    : resolveCustomerText(options, customerText)
  const customer = fixedCustomer || resolved.option?.customer || null
  const customerBlocked = fixedCustomer ? canInvoice(fixedCustomer) : resolved.option ? { ok: resolved.option.ok, reason: resolved.option.reason } : { ok: true }
  const total = invoiceTotalCents(items)
  // Anschrift des Empfängers (§ 14 Abs. 4 Nr. 1 UStG): ohne sie ist „Senden“ nur bis 250 € möglich
  const gate = invoiceSendGate(customerBlocked.ok ? customer : null, total)

  const updateItem = (uid, field, value) => {
    setItems((list) => list.map((it) => (it.uid === uid ? { ...it, [field]: value } : it)))
    if (error) setError('')
  }

  async function submit(senden) {
    if (lockRef.current) return
    const check = validateInvoiceForm({ customer, items, days, memo })
    if (!check.ok) {
      setError(check.error)
      return
    }
    if (senden) {
      if (!invoiceSendGate(customer, check.totalCents).sendAllowed) {
        setError(ADDRESS_INCOMPLETE_TEXT)
        return
      }
      // Senden schreibt die Rechnung fest und schickt sie an den Kunden: erst nach Rückfrage
      const sure = window.confirm(
        invoiceSendConfirmText({ name: customerName(customer), email: customer.email, totalCents: check.totalCents })
      )
      if (!sure) return
    }
    lockRef.current = true
    setBusy(senden ? 'send' : 'draft')
    setError('')
    try {
      const data = await createInvoice({ ...check.payload, senden })
      if (onCreated) onCreated(data?.rechnung || null, { senden })
      onClose()
    } catch (err) {
      if (isFinalizedNotSent(err)) {
        // Die Rechnung steht bei Stripe: keine zweite anlegen, die Liste zeigt sie
        if (onCreated) onCreated(null, { senden: true, notice: invoiceFailureMessage(err), tone: 'warn', finalizedFilter: finalizedFilter(err) })
        onClose()
        return
      }
      if (aliveRef.current) setError(invoiceFailureMessage(err))
    } finally {
      lockRef.current = false
      if (aliveRef.current) setBusy(null)
    }
  }

  const disabled = busy !== null

  return (
    <div className="overlay fin-overlay" onKeyDown={onOverlayKeyDown}>
      <button type="button" className="overlay-close fin-close" onClick={onClose} disabled={disabled} aria-label="Schließen">
        <FaXmark aria-hidden="true" />
      </button>
      <div
        className="overlay-content fin-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="fin-invoice-title"
        tabIndex={-1}
        ref={dialogRef}
      >
        <h2 id="fin-invoice-title" className="mb-2">Rechnung schreiben</h2>

        {error && (
          <div className="fin-dialog-error" role="alert" ref={errorRef}>
            {error}
          </div>
        )}

        {/* Enter sendet nie (das wäre eine Mail an den Kunden): nur die beiden Knöpfe unten lösen aus */}
        <form onSubmit={(e) => e.preventDefault()}>
          <div className="form-group">
            <label className="form-label" htmlFor="fin-invoice-customer">Kunde</label>
            {fixedCustomer ? (
              <p className="fin-fixed-customer">
                <strong>{customerName(fixedCustomer) || 'Kunde'}</strong>
                {fixedCustomer.email ? <span className="fin-dialog-sub"> · {fixedCustomer.email}</span> : null}
              </p>
            ) : source?.loading ? (
              <p className="fin-dialog-sub" role="status">Kunden werden geladen …</p>
            ) : source?.error ? (
              <p className="fin-dialog-warn" role="alert">Die Kunden konnten nicht geladen werden: {source.error}</p>
            ) : (
              <AutocompleteInput
                id="fin-invoice-customer"
                value={customerText}
                onChange={(v) => {
                  setCustomerText(v)
                  if (error) setError('')
                }}
                getSuggestions={(t) => customerSuggestions(options, t)}
                placeholder="Kunde suchen …"
              />
            )}
            {!customerBlocked.ok && (
              <p className="fin-dialog-warn" role="alert">
                {customerName(customer)}: {customerBlocked.reason}. Für diesen Kunden kann keine Rechnung geschrieben werden.
              </p>
            )}
            {!fixedCustomer && resolved.state === 'unknown' && (
              <p className="fin-dialog-sub">Bitte einen Kunden aus der Liste wählen. Nur feste Kunden mit E-Mail-Adresse erscheinen dort.</p>
            )}
            {customer && customerBlocked.ok && customer.email && !fixedCustomer && (
              <p className="fin-dialog-sub">Die Rechnung geht an {customer.email}.</p>
            )}
            {gate.warn && (
              <AddressWarning
                customer={customer}
                variant="dialog"
                onShowOverview={
                  onShowOverview
                    ? () => {
                        if (lockRef.current) return
                        onClose()
                        onShowOverview()
                      }
                    : undefined
                }
              />
            )}
          </div>

          <fieldset className="fin-items">
            <legend className="form-label">Positionen</legend>
            {items.map((item, index) => {
              const line = lineTotalCents(item)
              const n = index + 1
              return (
                <div key={item.uid} className="fin-item">
                  <div className="fin-item-field fin-item-desc">
                    <label className="fin-item-label" htmlFor={`fin-item-desc-${item.uid}`}>Beschreibung</label>
                    <input
                      id={`fin-item-desc-${item.uid}`}
                      className="form-control"
                      maxLength={INVOICE_LIMITS.maxDescription}
                      value={item.description}
                      onChange={(e) => updateItem(item.uid, 'description', e.target.value)}
                      aria-label={`Position ${n}: Beschreibung`}
                      placeholder="z. B. Webdesign Startseite"
                    />
                  </div>
                  <div className="fin-item-field fin-item-qty">
                    <label className="fin-item-label" htmlFor={`fin-item-qty-${item.uid}`}>Menge</label>
                    <input
                      id={`fin-item-qty-${item.uid}`}
                      className="form-control fin-amount"
                      inputMode="numeric"
                      value={item.quantity}
                      onChange={(e) => updateItem(item.uid, 'quantity', e.target.value)}
                      aria-label={`Position ${n}: Menge`}
                    />
                  </div>
                  <div className="fin-item-field fin-item-price">
                    <label className="fin-item-label" htmlFor={`fin-item-price-${item.uid}`}>Einzelpreis in €</label>
                    <input
                      id={`fin-item-price-${item.uid}`}
                      className="form-control fin-amount"
                      inputMode="decimal"
                      value={item.price}
                      onChange={(e) => updateItem(item.uid, 'price', e.target.value)}
                      aria-label={`Position ${n}: Einzelpreis in Euro`}
                      placeholder="0,00"
                    />
                  </div>
                  <div className="fin-item-field fin-item-sum">
                    <span className="fin-item-label">Summe</span>
                    <span className="fin-amount fin-item-total">{line === null ? '–' : euro(line)}</span>
                  </div>
                  <div className="fin-item-field fin-item-remove">
                    <button
                      type="button"
                      className="fin-icon-btn"
                      onClick={() => setItems((list) => (list.length > 1 ? list.filter((it) => it.uid !== item.uid) : list))}
                      disabled={items.length <= 1}
                      aria-label={`Position ${n} entfernen`}
                      title="Position entfernen"
                    >
                      <FaTrashCan aria-hidden="true" />
                    </button>
                  </div>
                </div>
              )
            })}
            <div className="fin-items-foot">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setItems((list) => (list.length < INVOICE_LIMITS.maxItems ? [...list, newItem()] : list))}
                disabled={items.length >= INVOICE_LIMITS.maxItems}
              >
                <FaPlus aria-hidden="true" /> Position
              </Button>
              <div className="fin-total" aria-live="polite">
                <span>Summe</span>
                <span className="fin-amount fin-total-value">{euro(total)}</span>
              </div>
            </div>
            <p className="fin-dialog-sub">Gemäß § 19 UStG ohne Umsatzsteuer.</p>
          </fieldset>

          <div className="fin-dialog-row">
            <div className="form-group fin-days">
              <label className="form-label" htmlFor="fin-invoice-days">Zahlungsziel in Tagen</label>
              <input
                id="fin-invoice-days"
                className="form-control fin-amount"
                inputMode="numeric"
                value={days}
                onChange={(e) => {
                  setDays(e.target.value)
                  if (error) setError('')
                }}
              />
            </div>
            <div className="form-group fin-memo">
              <label className="form-label" htmlFor="fin-invoice-memo">Notiz (erscheint auf der Rechnung)</label>
              <textarea
                id="fin-invoice-memo"
                className="form-control"
                rows={2}
                maxLength={INVOICE_LIMITS.maxMemo}
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
              />
            </div>
          </div>

          <div className="fin-dialog-actions">
            <Button type="button" variant="ghost" onClick={onClose} disabled={disabled}>Abbrechen</Button>
            <Button type="button" onClick={() => submit(false)} disabled={disabled}>
              {busy === 'draft' ? 'Speichere …' : 'Als Entwurf speichern'}
            </Button>
            <Button
              type="button"
              variant="primary"
              onClick={() => submit(true)}
              disabled={disabled || !gate.sendAllowed}
              title={gate.sendAllowed ? undefined : ADDRESS_INCOMPLETE_TEXT}
            >
              {busy === 'send' ? 'Sende …' : 'Senden'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
