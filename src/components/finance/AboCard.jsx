import { FaTriangleExclamation } from 'react-icons/fa6'
import { Badge, Card, EmptyState } from '../ui'
import { aboView } from '../../lib/financeView'

/**
 * Block 5: „Abos“. Einnahmen pro Monat (aktiv und Zahlung fehlgeschlagen), zahlende Kunden, gefährdete Einnahmen
 * (nur wenn > 0) und die Liste Kunde · Produkt · Status · Betrag · nächste Abbuchung. Konnten die Abos nicht
 * geladen werden, steht stattdessen die Meldung des Servers da (keine Zahlen).
 */
export default function AboCard({ abos }) {
  const v = aboView(abos)

  if (v.error) {
    return (
      <Card title="Abos" className="fin-abo-card">
        <p className="fin-hint fin-hint-warn" role="alert">
          <FaTriangleExclamation aria-hidden="true" /> {v.error}
        </p>
      </Card>
    )
  }

  return (
    <Card title="Abos" className="fin-abo-card" bodyStyle={{ padding: 0 }}>
      <div className="fin-stats">
        <span className="fin-amount fin-stat-value">{v.monthlyText}</span>
        <span className="fin-stat-label">Abo-Einnahmen pro Monat</span>
        <span className="fin-amount fin-stat-value">{v.payingText}</span>
        <span className="fin-stat-label">zahlende Kunden</span>
        {v.atRiskText && (
          <>
            <span className="fin-amount fin-stat-value fin-flag">{v.atRiskText}</span>
            <span className="fin-stat-label fin-flag">
              <FaTriangleExclamation aria-hidden="true" /> gefährdet
            </span>
          </>
        )}
      </div>

      {v.rows.length === 0 ? (
        <EmptyState title="Noch keine Abos." />
      ) : (
        <ul className="fin-abos">
          {v.rows.map((row) => (
            <li key={row.key} className="fin-abo">
              <div className="fin-abo-main">
                <span className="fin-abo-customer">{row.customer}</span>
                <span className="fin-abo-product muted"> · {row.product}</span>
              </div>
              <div className="fin-amount fin-abo-amount">{row.amountText}</div>
              <div className="fin-abo-meta">
                <Badge tone={row.tone}>{row.statusLabel}</Badge>
                <span className="fin-abo-next muted">nächste Abbuchung: {row.nextText}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
