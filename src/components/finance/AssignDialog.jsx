import { useEffect, useMemo, useRef, useState } from 'react'
import { FaXmark } from 'react-icons/fa6'
import { Badge, Button } from '../ui'
import { useDialogFocus } from '../../hooks/useDialogFocus'
import { useScrollIntoView } from '../../hooks/useScrollIntoView'
import { assignTransaction, getFixedCosts, unassignTransaction } from '../../lib/financeApi'
import {
  assignBody,
  assignModel,
  invoiceAssignConfirmText,
  transactionRows,
} from '../../lib/financeView'

const NOTE_MAX = 500

/**
 * Dialog „Buchung zuordnen“. Auswahl je nach Buchung (siehe assignModel): Vorschläge, andere offene Rechnung,
 * Stripe-Auszahlung (aus den Vorschlägen), Fixkosten (nur Ausgänge, aus der Fixkostenliste), Kategorie, dazu eine
 * Notiz. Vorgemerkte Buchungen (PDNG) bekommen nur Kategorien und Fixkosten. Eine Rechnung wird in Stripe als
 * bezahlt markiert und das lässt sich nicht rückgängig machen, deshalb zweistufig: erst „Zuordnen“, dann der
 * Bestätigungstext mit „Ja, als bezahlt markieren“; vorher geht keine Anfrage raus. Fehler des Servers (409 Betrag
 * weicht ab, 502 nicht gespeichert …) stehen im Dialog, der offen bleibt. Eine bestehende Zuordnung (außer Rechnung)
 * lässt sich mit „Zuordnung lösen“ aufheben.
 *
 * invoices = offene und überfällige Rechnungen (invoicesLoading / invoicesError für den Ladezustand; invoicesLoaded =
 * frisch und ohne Fehler geladen, dann sind Vorschläge zu nicht mehr offenen Rechnungen gesperrt).
 * onDone(buchung) nach Erfolg (Aufrufer lädt neu und schließt); onClose({ refresh }) bei Abbruch, refresh = ein
 * Fehler trat auf, der Stand kann sich geändert haben.
 */
export default function AssignDialog({ transaction, invoices = [], invoicesLoading = false, invoicesError = '', invoicesLoaded = false, onClose, onDone }) {
  const tx = transaction || {}
  const row = useMemo(() => transactionRows([tx])[0], [tx])
  const [fixed, setFixed] = useState({ list: [], loading: false, error: '' })
  const [selected, setSelected] = useState('')
  const [note, setNote] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(null) // 'assign' | 'unassign'
  const [error, setError] = useState('')
  const lockRef = useRef(false)
  const aliveRef = useRef(true)
  const dirtyRef = useRef(false)
  const dialogRef = useRef(null)
  const confirmRef = useRef(null)
  const errorRef = useRef(null)

  const outgoing = Number.isFinite(tx.amountCents) && tx.amountCents < 0
  const unassigned = !tx.category

  const onOverlayKeyDown = useDialogFocus(dialogRef)
  // Der Dialog kann höher sein als das Fenster: eine Fehlermeldung oben soll nicht außerhalb des Bildes stehen
  useScrollIntoView(errorRef, error)

  useEffect(() => {
    aliveRef.current = true
    return () => {
      aliveRef.current = false
    }
  }, [])

  // Fixkosten nur für Ausgänge ohne Zuordnung
  useEffect(() => {
    if (!outgoing || !unassigned) return undefined
    let cancelled = false
    setFixed({ list: [], loading: true, error: '' })
    getFixedCosts()
      .then((data) => {
        if (!cancelled) setFixed({ list: Array.isArray(data?.fixkosten) ? data.fixkosten : [], loading: false, error: '' })
      })
      .catch((err) => {
        if (!cancelled) setFixed({ list: [], loading: false, error: err?.message || 'Die Fixkosten konnten nicht geladen werden.' })
      })
    return () => {
      cancelled = true
    }
  }, [outgoing, unassigned])

  const model = useMemo(() => assignModel(tx, { invoices, fixedCosts: fixed.list, invoicesLoaded }), [tx, invoices, fixed.list, invoicesLoaded])
  const option = model.byKey[selected] || null

  function close() {
    if (lockRef.current) return
    onClose({ refresh: dirtyRef.current })
  }

  useEffect(() => {
    const onKey = (e) => {
      // Escape schließt zuerst nur die offene Auswahl (z. B. ein Aufklappmenü): dann nicht den Dialog
      if (e.key === 'Escape' && !e.defaultPrevented) close()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  })

  function choose(key) {
    setSelected(key)
    setConfirming(false)
    if (error) setError('')
  }

  useEffect(() => {
    if (confirming) confirmRef.current?.focus()
  }, [confirming])

  async function doAssign() {
    if (lockRef.current || !option || option.disabled) return
    lockRef.current = true
    setBusy('assign')
    setError('')
    try {
      const data = await assignTransaction(tx.$id, assignBody(option, note))
      onDone(data?.buchung || null)
    } catch (err) {
      dirtyRef.current = true
      if (aliveRef.current) {
        setError(err?.message || 'Die Zuordnung ist fehlgeschlagen.')
        setConfirming(false)
      }
    } finally {
      lockRef.current = false
      if (aliveRef.current) setBusy(null)
    }
  }

  // Erster Schritt: bei einer Rechnung nur den Bestätigungstext zeigen, noch keine Anfrage
  function primary() {
    if (!option || option.disabled || lockRef.current) return
    if (option.type === 'invoice' && !confirming) {
      setConfirming(true)
      return
    }
    doAssign()
  }

  async function doUnassign() {
    if (lockRef.current) return
    lockRef.current = true
    setBusy('unassign')
    setError('')
    try {
      const data = await unassignTransaction(tx.$id)
      onDone(data?.buchung || null)
    } catch (err) {
      dirtyRef.current = true
      if (aliveRef.current) setError(err?.message || 'Die Zuordnung konnte nicht gelöst werden.')
    } finally {
      lockRef.current = false
      if (aliveRef.current) setBusy(null)
    }
  }

  const disabled = busy !== null
  const showInvoiceState = model.incoming && !model.pending && !model.assigned
  const invoiceSelectValue = model.invoices.some((o) => o.key === selected) ? selected : ''
  const fixedSelectValue = model.fixedCosts.some((o) => o.key === selected) ? selected : ''

  const radio = (o) => (
    <label key={o.key} className={`fin-choice${o.disabled ? ' fin-choice-off' : ''}`}>
      <input
        type="radio"
        name="fin-assign-target"
        value={o.key}
        checked={selected === o.key}
        disabled={o.disabled || disabled}
        onChange={() => choose(o.key)}
      />
      <span className="fin-choice-text">
        <span className="fin-choice-label">{o.label}</span>
        {(o.confidence || o.detail) && (
          <span className="fin-choice-detail muted">
            {o.confidence ? `Übereinstimmung: ${o.confidence}` : ''}
            {o.confidence && o.detail ? ' · ' : ''}
            {o.detail}
          </span>
        )}
        {o.disabled && o.disabledReason && <span className="fin-choice-detail fin-hint-warn">{o.disabledReason}</span>}
      </span>
    </label>
  )

  return (
    <div className="overlay fin-overlay" onKeyDown={onOverlayKeyDown}>
      <button type="button" className="overlay-close fin-close" onClick={close} disabled={disabled} aria-label="Schließen">
        <FaXmark aria-hidden="true" />
      </button>
      <div
        className="overlay-content fin-dialog fin-assign"
        role="dialog"
        aria-modal="true"
        aria-labelledby="fin-assign-title"
        tabIndex={-1}
        ref={dialogRef}
      >
        <h2 id="fin-assign-title" className="mb-2">Buchung zuordnen</h2>

        <dl className="fin-tx-facts">
          <div><dt>Datum</dt><dd>{row?.dateText}{row?.pending && <> <Badge tone="muted">vorgemerkt</Badge></>}</dd></div>
          <div><dt>Gegenpartei</dt><dd>{row?.counterparty}</dd></div>
          {row?.remittance && <div><dt>Verwendungszweck</dt><dd className="fin-wrap">{row.remittance}</dd></div>}
          <div><dt>Betrag</dt><dd className="fin-amount fin-tx-facts-amount">{row?.amountText}</dd></div>
        </dl>

        {error && (
          <div className="fin-dialog-error" role="alert" ref={errorRef}>
            {error}
          </div>
        )}

        {model.assigned ? (
          <>
            <p className="fin-assigned">
              Zugeordnet: <strong>{model.currentText}</strong>
            </p>
            {!model.canUnassign && (
              <p className="fin-dialog-sub">Die Rechnung ist in Stripe als bezahlt markiert. Das lässt sich nicht rückgängig machen.</p>
            )}
            <div className="fin-dialog-actions">
              <Button type="button" variant="ghost" onClick={close} disabled={disabled}>Schließen</Button>
              {model.canUnassign && (
                <Button type="button" onClick={doUnassign} disabled={disabled}>
                  {busy === 'unassign' ? 'Löse …' : 'Zuordnung lösen'}
                </Button>
              )}
            </div>
          </>
        ) : (
          <>
            {model.hint && <p className="fin-dialog-sub" role="note">{model.hint}</p>}

            {showInvoiceState && invoicesLoading && <p className="fin-dialog-sub" role="status">Offene Rechnungen werden geladen …</p>}
            {showInvoiceState && invoicesError && (
              <p className="fin-dialog-warn" role="alert">Die offenen Rechnungen konnten nicht geladen werden: {invoicesError}</p>
            )}
            {outgoing && fixed.loading && <p className="fin-dialog-sub" role="status">Fixkosten werden geladen …</p>}
            {outgoing && fixed.error && <p className="fin-dialog-warn" role="alert">Die Fixkosten konnten nicht geladen werden: {fixed.error}</p>}

            {model.suggestions.length > 0 && (
              <fieldset className="fin-choices">
                <legend className="form-label">Vorschläge</legend>
                {model.suggestions.map(radio)}
              </fieldset>
            )}

            {model.invoices.length > 0 && (
              <div className="form-group">
                <label className="form-label" htmlFor="fin-assign-invoice">Andere offene Rechnung</label>
                <select
                  id="fin-assign-invoice"
                  className="form-control"
                  value={invoiceSelectValue}
                  disabled={disabled}
                  onChange={(e) => choose(e.target.value)}
                >
                  <option value="">Rechnung wählen …</option>
                  {model.invoices.map((o) => (
                    <option key={o.key} value={o.key} disabled={o.disabled}>
                      {o.label}{o.disabled ? ` (${o.disabledReason})` : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {model.fixedCosts.length > 0 && (
              <div className="form-group">
                <label className="form-label" htmlFor="fin-assign-fixed">Fixkosten</label>
                <select
                  id="fin-assign-fixed"
                  className="form-control"
                  value={fixedSelectValue}
                  disabled={disabled}
                  onChange={(e) => choose(e.target.value)}
                >
                  <option value="">Fixkosten wählen …</option>
                  {model.fixedCosts.map((o) => (
                    <option key={o.key} value={o.key}>{o.label}</option>
                  ))}
                </select>
              </div>
            )}

            <fieldset className="fin-choices">
              <legend className="form-label">Kategorie</legend>
              {model.categories.map(radio)}
            </fieldset>

            <div className="form-group">
              <label className="form-label" htmlFor="fin-assign-note">Notiz (optional)</label>
              <textarea
                id="fin-assign-note"
                className="form-control"
                rows={2}
                maxLength={NOTE_MAX}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>

            {confirming && option ? (
              <div className="fin-confirm" role="group" aria-label="Bestätigung" tabIndex={-1} ref={confirmRef}>
                <p>{invoiceAssignConfirmText(option.number || option.label)}</p>
                <div className="fin-dialog-actions">
                  <Button type="button" variant="ghost" onClick={() => setConfirming(false)} disabled={disabled}>Zurück</Button>
                  <Button type="button" variant="primary" onClick={doAssign} disabled={disabled}>
                    {busy === 'assign' ? 'Markiere …' : 'Ja, als bezahlt markieren'}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="fin-dialog-actions">
                <Button type="button" variant="ghost" onClick={close} disabled={disabled}>Abbrechen</Button>
                <Button type="button" variant="primary" onClick={primary} disabled={disabled || !option || option.disabled}>
                  {busy === 'assign' ? 'Ordne zu …' : 'Zuordnen'}
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
