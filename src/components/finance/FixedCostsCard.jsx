import { useEffect, useMemo, useRef, useState } from 'react'
import { FaPlus, FaSpinner } from 'react-icons/fa6'
import { Badge, Button, Card, EmptyState } from '../ui'
import FormField from './FormField'
import { useFinanceResource } from '../../hooks/useFinanceResource'
import { createFixedCost, deleteFixedCost, getFixedCosts, updateFixedCost } from '../../lib/financeApi'
import {
  FIXED_COST_DELETE_CONFIRM,
  FIXED_COST_FIELD_ORDER,
  INTERVAL_OPTIONS,
  SETTINGS_LIMITS,
  apiErrorMessage,
  emptyFixedCostForm,
  fixedCostRows,
  fixedCostToForm,
  validateFixedCostForm,
} from '../../lib/financeSettings'

const LOAD_ERROR = 'Die Fixkosten konnten nicht geladen werden.'
const fieldId = (name) => `fin-fix-${name}`

/**
 * Karte „Fixkosten“: regelmäßige Ausgaben (Name, Betrag in Euro, Rhythmus, nächster Termin, Suchbegriff). Anlegen und
 * Bearbeiten im Formular über der Liste, „Auf inaktiv setzen“ / „Aktivieren“ je Zeile, Löschen mit Rückfrage
 * (Besser inaktiv: bereits zugeordnete Buchungen behalten den Verweis). Es läuft immer nur eine Anfrage; danach wird
 * die Liste neu geladen.
 */
export default function FixedCostsCard() {
  const res = useFinanceResource(getFixedCosts, LOAD_ERROR)
  // null = Formular zu; { id: null } = neue Position; { id } = Position bearbeiten
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(emptyFixedCostForm)
  const [errors, setErrors] = useState({})
  const [busy, setBusy] = useState(null) // 'save' | `${id}:toggle` | `${id}:delete`
  const [message, setMessage] = useState(null) // { tone: 'ok' | 'warn', text }
  const lockRef = useRef(false)
  const aliveRef = useRef(true)

  useEffect(() => {
    aliveRef.current = true
    return () => {
      aliveRef.current = false
    }
  }, [])

  const list = res.data?.fixkosten
  const rows = useMemo(() => fixedCostRows(list), [list])
  const byId = useMemo(() => Object.fromEntries((Array.isArray(list) ? list : []).map((p) => [p.$id, p])), [list])

  // Der Fokus geht beim Öffnen des Formulars ins erste Feld
  const formKey = editing ? editing.id || 'new' : ''
  useEffect(() => {
    if (formKey) document.getElementById(fieldId('name'))?.focus()
  }, [formKey])

  function openNew() {
    if (lockRef.current) return
    setEditing({ id: null })
    setForm(emptyFixedCostForm())
    setErrors({})
    setMessage(null)
  }

  function openEdit(row) {
    if (lockRef.current) return
    setEditing({ id: row.id })
    setForm(fixedCostToForm(byId[row.id]))
    setErrors({})
    setMessage(null)
  }

  function closeForm() {
    if (lockRef.current) return
    setEditing(null)
    setErrors({})
  }

  const change = (name) => (e) => {
    const value = e.target.value
    setForm((f) => ({ ...f, [name]: value }))
    setErrors((er) => (er[name] ? { ...er, [name]: undefined } : er))
  }

  // Eine Anfrage nach der anderen; danach die Liste neu laden (der Server ist die Wahrheit)
  async function run(key, call, okText, { onOk } = {}) {
    if (lockRef.current) return
    lockRef.current = true
    setBusy(key)
    setMessage(null)
    try {
      await call()
      // Erst die neue Liste, dann die Meldung: sie soll nie einen Stand beschreiben, den die Liste noch nicht zeigt
      await res.reload()
      if (aliveRef.current) {
        setMessage({ tone: 'ok', text: okText })
        if (onOk) onOk()
      }
    } catch (err) {
      if (aliveRef.current) {
        setMessage({ tone: 'warn', text: apiErrorMessage(err, 'Die Anfrage ist fehlgeschlagen.') })
      }
      // Der Stand kann ein anderer sein (Position schon gelöscht): neu laden
      await res.reload()
    } finally {
      lockRef.current = false
      if (aliveRef.current) setBusy(null)
    }
  }

  function submit(e) {
    e.preventDefault()
    if (lockRef.current || !editing) return
    const check = validateFixedCostForm(form)
    if (!check.ok) {
      setErrors(check.errors)
      setMessage({ tone: 'warn', text: 'Bitte die markierten Felder prüfen. Es wurde nichts gespeichert.' })
      const first = FIXED_COST_FIELD_ORDER.find((name) => check.errors[name])
      if (first) document.getElementById(fieldId(first))?.focus()
      return
    }
    const id = editing.id
    run(
      'save',
      () => (id ? updateFixedCost(id, check.payload) : createFixedCost(check.payload)),
      id ? 'Position gespeichert.' : 'Position angelegt.',
      { onOk: () => { setEditing(null); setErrors({}) } }
    )
  }

  function toggle(row) {
    run(
      `${row.id}:toggle`,
      () => updateFixedCost(row.id, { active: !row.active }),
      row.active ? `„${row.name}“ ist jetzt inaktiv.` : `„${row.name}“ ist wieder aktiv.`
    )
  }

  function remove(row) {
    if (lockRef.current) return
    if (!window.confirm(FIXED_COST_DELETE_CONFIRM)) return
    run(`${row.id}:delete`, () => deleteFixedCost(row.id), `„${row.name}“ wurde gelöscht.`, {
      onOk: () => { if (editing?.id === row.id) setEditing(null) },
    })
  }

  let body
  if (!res.data) {
    body = res.loading ? (
      <div className="empty" role="status">
        <FaSpinner className="spinner" aria-hidden="true" />
        <p className="muted">Fixkosten werden geladen …</p>
      </div>
    ) : (
      <div className="fin-load-error" style={{ padding: 0 }}>
        <p className="fin-hint fin-hint-warn" role="alert">{res.error || LOAD_ERROR}</p>
        <Button size="sm" onClick={res.reload}>Erneut versuchen</Button>
      </div>
    )
  } else {
    body = (
      <>
        {res.error && (
          <p className="fin-hint fin-hint-warn" role="alert">
            Die Liste konnte nicht neu geladen werden: {res.error}{' '}
            <Button size="sm" variant="ghost" onClick={res.reload} disabled={res.loading}>Erneut versuchen</Button>
          </p>
        )}
        {editing && (
          <form className="fin-fixed-form" onSubmit={submit} noValidate aria-labelledby="fin-fix-form-title">
            <h4 id="fin-fix-form-title" className="fin-fixed-form-title">{editing.id ? 'Position bearbeiten' : 'Neue Position'}</h4>
            <fieldset className="fin-fieldset" disabled={busy === 'save'}>
              <div className="fin-form-grid">
                <FormField id={fieldId('name')} label="Name" error={errors.name}>
                  <input className="form-control" autoComplete="off" value={form.name} onChange={change('name')} placeholder="z. B. Hetzner" />
                </FormField>
                <FormField id={fieldId('amount')} label="Betrag (€)" error={errors.amount}>
                  <input className="form-control fin-input-amount" inputMode="decimal" autoComplete="off" value={form.amount} onChange={change('amount')} placeholder="z. B. 49,90" />
                </FormField>
                <FormField id={fieldId('interval')} label="Rhythmus" error={errors.interval}>
                  <select className="form-control" value={form.interval} onChange={change('interval')}>
                    {INTERVAL_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </FormField>
                <FormField id={fieldId('nextDate')} label="Nächster Termin" error={errors.nextDate}>
                  <input className="form-control" type="date" value={form.nextDate} onChange={change('nextDate')} />
                </FormField>
              </div>
              <FormField
                id={fieldId('counterpartyMatch')}
                label="Suchbegriff in der Buchung (optional)"
                hint={`Teil des Namens der Gegenpartei in der Bankbuchung, z. B. hetzner (höchstens ${SETTINGS_LIMITS.maxMatch} Zeichen). Damit schlägt die Seite diese Abbuchung nicht noch einmal als neue Fixkosten vor.`}
                error={errors.counterpartyMatch}
              >
                <input className="form-control" autoComplete="off" value={form.counterpartyMatch} onChange={change('counterpartyMatch')} />
              </FormField>
            </fieldset>
            <div className="fin-form-actions">
              <Button type="submit" variant="primary" disabled={busy !== null}>
                {busy === 'save' ? 'Speichere …' : 'Speichern'}
              </Button>
              <Button type="button" variant="ghost" onClick={closeForm} disabled={busy !== null}>Abbrechen</Button>
            </div>
          </form>
        )}
        {message && (
          <p className={`fin-hint fin-form-notice${message.tone === 'warn' ? ' fin-hint-warn' : ''}`} role={message.tone === 'warn' ? 'alert' : 'status'}>
            {message.text}
          </p>
        )}
        {rows.length === 0 ? (
          <EmptyState title="Noch keine Fixkosten." hint="Lege regelmäßige Ausgaben an, damit Vorschau und „Verfügbar“ sie berücksichtigen." />
        ) : (
          <ul className="fin-fixed-list" aria-label="Fixkosten">
            {rows.map((row) => (
              <li key={row.key} className={`fin-fixed${row.active ? '' : ' fin-fixed-off'}`}>
                <div className="fin-fixed-main">
                  <span className="fin-fixed-name">{row.name}</span>
                  <Badge tone={row.active ? 'ok' : 'muted'}>{row.statusLabel}</Badge>
                </div>
                <div className="fin-amount fin-fixed-amount">{row.amountText}</div>
                <div className="fin-fixed-meta muted">{row.metaText}</div>
                <div className="fin-actions fin-fixed-actions">
                  <Button size="sm" variant="ghost" onClick={() => openEdit(row)} disabled={busy !== null} aria-label={`Bearbeiten: ${row.name}`}>
                    Bearbeiten
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => toggle(row)} disabled={busy !== null} aria-label={`${row.toggleLabel}: ${row.name}`}>
                    {busy === `${row.id}:toggle` ? 'Speichere …' : row.toggleLabel}
                  </Button>
                  <Button size="sm" variant="danger" onClick={() => remove(row)} disabled={busy !== null} aria-label={`Löschen: ${row.name}`}>
                    {busy === `${row.id}:delete` ? 'Lösche …' : 'Löschen'}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </>
    )
  }

  return (
    <Card
      title="Fixkosten"
      actions={
        res.data && (
          <Button size="sm" variant="primary" onClick={openNew} disabled={busy !== null || editing?.id === null}>
            <FaPlus aria-hidden="true" /> Neue Position
          </Button>
        )
      }
    >
      {body}
    </Card>
  )
}
