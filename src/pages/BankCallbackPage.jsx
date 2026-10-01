import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { PageHeader, Card, Button } from '../components/ui'
import { completeBankAuth } from '../lib/financeApi'
import { dateDe } from '../lib/financeFormat'
import { parseCallback, successResult, failureResult, isResult } from '../lib/bankCallback'

const PATH = '/finanzen/bank-callback'

// Rueckkehrseite der Bankfreigabe: code/state aus der Adresse gehen einmalig ans Portal,
// danach verschwinden sie aus der Adresszeile; angezeigt werden nur Ergebnis und Meldung.
export default function BankCallbackPage() {
  const location = useLocation()
  const navigate = useNavigate()
  // Beim ersten Rendern einlesen: danach ist der Suchteil aus der Adresse entfernt
  const [params] = useState(() => parseCallback(location.search))
  const [result, setResult] = useState(() => (isResult(location.state) ? location.state : null))
  const startedRef = useRef(false)
  const aliveRef = useRef(true)

  useEffect(() => {
    aliveRef.current = true
    // useRef-Schutz: auch bei doppelten Effekten (StrictMode) genau ein Aufruf
    if (params && !result && !startedRef.current) {
      startedRef.current = true
      completeBankAuth(params)
        .then(successResult, failureResult)
        .then((outcome) => {
          if (!aliveRef.current) return
          setResult(outcome)
          navigate(PATH, { replace: true, state: outcome })
        })
    }
    return () => { aliveRef.current = false }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  let body
  if (result) {
    body = (
      <>
        <p role={result.ok ? 'status' : 'alert'} style={{ fontWeight: 600 }}>
          {result.ok
            ? `Bankzugang erneuert, gültig bis ${dateDe(result.validUntil)}`
            : result.message}
        </p>
        <div style={{ marginTop: 16 }}>
          <Button as={Link} variant="primary" to="/finance">Zu den Finanzen</Button>
        </div>
      </>
    )
  } else if (params) {
    body = (
      <div className="text-center" role="status">
        <div className="spinner" />
        <p className="muted">Bankzugang wird eingerichtet …</p>
      </div>
    )
  } else {
    body = (
      <>
        <p className="muted">Zu dieser Seite liegt keine Rückmeldung der Bank vor.</p>
        <div style={{ marginTop: 16 }}>
          <Button as={Link} variant="primary" to="/finance">Zu den Finanzen</Button>
        </div>
      </>
    )
  }

  return (
    <div className="page">
      <PageHeader title="Bankzugang" />
      <Card>{body}</Card>
    </div>
  )
}
