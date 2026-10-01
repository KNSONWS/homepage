import { useEffect, useRef, useState } from 'react'
import { FaRotate, FaSpinner } from 'react-icons/fa6'
import { Badge, Button, Card } from '../ui'
import { useFinanceResource } from '../../hooks/useFinanceResource'
import { getBank, refreshBank, startBankAuth } from '../../lib/financeApi'
import { bankCardModel, refreshResultMessage } from '../../lib/financeSettings'
import { safeUrl } from '../../lib/financeView'

const LOAD_ERROR = 'Der Bankzugang konnte nicht geladen werden.'

/**
 * Karte „Bankzugang“: Status, IBAN (maskiert), Zugang gültig bis, letzter Abruf und der letzte Fehler.
 * „Jetzt abrufen“ holt die Buchungen sofort (der Server begrenzt die Häufigkeit, die Meldung steht dann hier),
 * „Neu verbinden“ führt zur Freigabe bei der Bank (nur http/https-Adressen). Ohne Zugang gibt es nur „Bank verbinden“.
 */
export default function BankAccessCard() {
  const res = useFinanceResource(getBank, LOAD_ERROR)
  const [busy, setBusy] = useState(null) // 'refresh' | 'connect'
  const [message, setMessage] = useState(null) // { tone: 'ok' | 'info' | 'warn', text }
  const lockRef = useRef(false)
  const aliveRef = useRef(true)

  useEffect(() => {
    aliveRef.current = true
    return () => {
      aliveRef.current = false
    }
  }, [])

  async function refresh() {
    if (lockRef.current) return
    lockRef.current = true
    setBusy('refresh')
    setMessage(null)
    try {
      const result = await refreshBank()
      await res.reload()
      if (aliveRef.current) setMessage(refreshResultMessage(result))
    } catch (err) {
      // 429 „Bitte in N Minuten erneut versuchen.“ ist kein Fehler, nur ein Hinweis
      if (aliveRef.current) setMessage({ tone: err?.status === 429 ? 'info' : 'warn', text: err?.message || 'Der Abruf ist fehlgeschlagen.' })
    } finally {
      lockRef.current = false
      if (aliveRef.current) setBusy(null)
    }
  }

  async function connect() {
    if (lockRef.current) return
    lockRef.current = true
    setBusy('connect')
    setMessage(null)
    try {
      const { url } = await startBankAuth()
      const target = safeUrl(url)
      if (!target) throw new Error('Die Bank hat keine Weiterleitung geliefert.')
      window.location.assign(target)
    } catch (err) {
      if (aliveRef.current) setMessage({ tone: 'warn', text: err?.message || 'Die Verbindung konnte nicht gestartet werden.' })
    } finally {
      lockRef.current = false
      if (aliveRef.current) setBusy(null)
    }
  }

  if (!res.data) {
    return (
      <Card title="Bankzugang">
        {res.loading ? (
          <div className="empty" role="status">
            <FaSpinner className="spinner" aria-hidden="true" />
            <p className="muted">Bankzugang wird geladen …</p>
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

  const model = bankCardModel(res.data.verbindung)
  return (
    <Card title="Bankzugang" actions={<Badge tone={model.tone}>{model.statusLabel}</Badge>}>
      {res.error && (
        <p className="fin-hint fin-hint-warn fin-form-notice" role="alert">
          Der Stand konnte nicht neu geladen werden: {res.error}
        </p>
      )}
      {model.rows.length > 0 && (
        <dl className="fin-bank-facts">
          {model.rows.map((row) => (
            <div key={row.key}>
              <dt>{row.label}</dt>
              <dd>{row.text}</dd>
            </div>
          ))}
        </dl>
      )}
      {model.error && (
        <p className="fin-hint fin-hint-warn fin-form-notice" role="alert">Fehler: {model.error}</p>
      )}
      {model.hint && <p className="fin-hint fin-form-notice">{model.hint}</p>}
      {message && (
        <p className={`fin-hint fin-form-notice${message.tone === 'warn' ? ' fin-hint-warn' : ''}`} role={message.tone === 'warn' ? 'alert' : 'status'}>
          {message.text}
        </p>
      )}
      <div className="fin-form-actions">
        {model.canRefresh && (
          <Button variant="primary" onClick={refresh} disabled={busy !== null}>
            <FaRotate className={busy === 'refresh' ? 'fin-spin' : undefined} aria-hidden="true" /> {busy === 'refresh' ? 'Rufe ab …' : 'Jetzt abrufen'}
          </Button>
        )}
        <Button variant={model.canRefresh ? 'ghost' : 'primary'} onClick={connect} disabled={busy !== null}>
          {busy === 'connect' ? 'Leite weiter …' : model.connectLabel}
        </Button>
      </div>
    </Card>
  )
}
