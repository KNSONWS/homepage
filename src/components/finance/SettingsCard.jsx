import { useEffect, useRef, useState } from 'react'
import { FaFloppyDisk, FaSpinner } from 'react-icons/fa6'
import { Button, Card } from '../ui'
import FormField from './FormField'
import { useFinanceResource } from '../../hooks/useFinanceResource'
import { getSettings, patchSettings } from '../../lib/financeApi'
import {
  BANK_DETAILS_EXAMPLE,
  SETTINGS_FIELD_ORDER,
  SETTINGS_LIMITS,
  apiErrorMessage,
  bankDetailsLength,
  settingsToForm,
  validateSettingsForm,
} from '../../lib/financeSettings'

const LOAD_ERROR = 'Die Einstellungen konnten nicht geladen werden.'
const fieldId = (name) => `fin-set-${name}`

/**
 * Karte „Einstellungen“: Mindestpuffer, Steuer-Rücklage, Vorjahresumsatz, ESt-Vorauszahlung und Bankverbindungstext
 * für den Rechnungsfuß. Beträge werden in Euro eingegeben (z. B. 1.234,56; 0 ist bei Mindestpuffer und ESt erlaubt),
 * ein leerer Vorjahresumsatz heißt „unbekannt“. Fehler stehen am Feld, Fehler des Servers über dem Knopf.
 */
export default function SettingsCard() {
  const res = useFinanceResource(getSettings, LOAD_ERROR)

  if (!res.data) {
    return (
      <Card title="Einstellungen">
        {res.loading ? (
          <div className="empty" role="status">
            <FaSpinner className="spinner" aria-hidden="true" />
            <p className="muted">Einstellungen werden geladen …</p>
          </div>
        ) : (
          <div className="fin-load-error" style={{ padding: 0 }}>
            <p className="fin-hint fin-hint-warn" role="alert">{res.error || LOAD_ERROR}</p>
            <Button size="sm" onClick={res.reload}>Erneut versuchen</Button>
          </div>
        )}
      </Card>
    )
  }
  return <SettingsForm initial={res.data.einstellungen} />
}

function SettingsForm({ initial }) {
  const [form, setForm] = useState(() => settingsToForm(initial))
  const [errors, setErrors] = useState({})
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState(null) // { tone: 'ok' | 'warn', text }
  const lockRef = useRef(false)
  const aliveRef = useRef(true)

  useEffect(() => {
    aliveRef.current = true
    return () => {
      aliveRef.current = false
    }
  }, [])

  const change = (name) => (e) => {
    const value = e.target.value
    setForm((f) => ({ ...f, [name]: value }))
    setErrors((er) => (er[name] ? { ...er, [name]: undefined } : er))
    if (notice) setNotice(null)
  }

  async function submit(e) {
    e.preventDefault()
    if (lockRef.current) return
    const check = validateSettingsForm(form)
    if (!check.ok) {
      setErrors(check.errors)
      setNotice({ tone: 'warn', text: 'Bitte die markierten Felder prüfen. Es wurde nichts gespeichert.' })
      const first = SETTINGS_FIELD_ORDER.find((name) => check.errors[name])
      if (first) document.getElementById(fieldId(first))?.focus()
      return
    }
    lockRef.current = true
    setBusy(true)
    setErrors({})
    setNotice(null)
    try {
      const data = await patchSettings(check.payload)
      if (!aliveRef.current) return
      if (data?.einstellungen) setForm(settingsToForm(data.einstellungen))
      setNotice({ tone: 'ok', text: 'Gespeichert.' })
    } catch (err) {
      if (aliveRef.current) setNotice({ tone: 'warn', text: apiErrorMessage(err) })
    } finally {
      lockRef.current = false
      if (aliveRef.current) setBusy(false)
    }
  }

  const length = bankDetailsLength(form.bankDetailsText)
  const tooLong = length > SETTINGS_LIMITS.maxBankDetails

  return (
    <Card title="Einstellungen">
      <form onSubmit={submit} noValidate>
        {/* Während des Speicherns gesperrt, damit die Antwort keine neuen Eingaben überschreibt */}
        <fieldset className="fin-fieldset" disabled={busy}>
          <div className="fin-form-grid">
            <FormField
              id={fieldId('minBuffer')}
              label="Mindestpuffer (€)"
              hint="Dieser Betrag bleibt bei „Verfügbar“ immer auf dem Konto. 0 ist möglich."
              error={errors.minBuffer}
            >
              <input className="form-control fin-input-amount" inputMode="decimal" autoComplete="off" value={form.minBuffer} onChange={change('minBuffer')} placeholder="z. B. 500,00" />
            </FormField>
            <FormField
              id={fieldId('taxReservePercent')}
              label="Steuer-Rücklage (%)"
              hint={`Anteil des Gewinns, der als Rücklage gilt (0 bis ${SETTINGS_LIMITS.maxPercent}).`}
              error={errors.taxReservePercent}
            >
              <input className="form-control fin-input-amount" inputMode="numeric" autoComplete="off" value={form.taxReservePercent} onChange={change('taxReservePercent')} placeholder="30" />
            </FormField>
            <FormField
              id={fieldId('previousYearRevenue')}
              label="Vorjahresumsatz (€)"
              hint="Für die Kleinunternehmer-Grenze. Leer lassen, wenn unbekannt."
              error={errors.previousYearRevenue}
            >
              <input className="form-control fin-input-amount" inputMode="decimal" autoComplete="off" value={form.previousYearRevenue} onChange={change('previousYearRevenue')} placeholder="leer = unbekannt" />
            </FormField>
            <FormField
              id={fieldId('estPrepayment')}
              label="ESt-Vorauszahlung (€)"
              hint="Betrag je Termin (10.03., 10.06., 10.09., 10.12.). 0 = keine Vorauszahlung."
              error={errors.estPrepayment}
            >
              <input className="form-control fin-input-amount" inputMode="decimal" autoComplete="off" value={form.estPrepayment} onChange={change('estPrepayment')} placeholder="0,00" />
            </FormField>
          </div>

          <FormField
            id={fieldId('bankDetailsText')}
            label="Bankverbindung auf Rechnungen"
            hint={`Steht im Fuß jeder Rechnung, z. B. „${BANK_DETAILS_EXAMPLE}“.`}
            error={errors.bankDetailsText}
          >
            <textarea className="form-control" rows={3} value={form.bankDetailsText} onChange={change('bankDetailsText')} />
          </FormField>
          <div className={`fin-counter${tooLong ? ' fin-counter-over' : ''}`}>
            {length} / {SETTINGS_LIMITS.maxBankDetails} Zeichen
          </div>
        </fieldset>

        {notice && (
          <p className={`fin-hint fin-form-notice${notice.tone === 'warn' ? ' fin-hint-warn' : ''}`} role={notice.tone === 'warn' ? 'alert' : 'status'}>
            {notice.text}
          </p>
        )}
        <div className="fin-form-actions">
          <Button type="submit" variant="primary" disabled={busy}>
            {busy ? <FaSpinner className="spinner" aria-hidden="true" /> : <FaFloppyDisk aria-hidden="true" />} {busy ? 'Speichere …' : 'Speichern'}
          </Button>
        </div>
      </form>
    </Card>
  )
}
