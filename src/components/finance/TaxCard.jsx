import { Card } from '../ui'
import { taxView } from '../../lib/financeView'

/**
 * Block 4: „Steuer“. Rücklage (Betrag und woraus sie sich ergibt), Kleinunternehmer-Zähler gegen die Grenzen,
 * Vorjahr (nur wenn eingetragen), Gewerbesteuer-Hinweis (nur wenn nötig) und die nächste ESt-Vorauszahlung
 * (nur wenn eingestellt). Ist der Zähler unbekannt (Stripe nicht erreichbar), steht das als Text da, nie eine 0.
 * Am Ende steht immer der Hinweis „Orientierungswert, ersetzt keine Steuerberatung.“
 */
export default function TaxCard({ steuer }) {
  const v = taxView(steuer)
  return (
    <Card title="Steuer" className="fin-tax-card">
      <div className="fin-facts">
        <div className="fin-fact">
          <div className="fin-fact-row">
            <span className="fin-fact-label">Steuer-Rücklage</span>
            <span className="fin-amount fin-fact-big">{v.reserve.amountText}</span>
          </div>
          {v.reserve.basisText && <div className="fin-fact-sub">{v.reserve.basisText}</div>}
        </div>

        <div className="fin-fact">
          <div className="fin-fact-label">Kleinunternehmer (§ 19 UStG)</div>
          <div className={`fin-fact-value${v.small.known ? '' : ' fin-fact-unknown'}`}>{v.small.counterText}</div>
          {v.small.shareText && <div className="fin-fact-sub">{v.small.shareText}</div>}
          <div className="fin-fact-sub">{v.small.limitText}</div>
          <div className="fin-fact-sub">{v.small.hardText}</div>
          {v.small.previousText && <div className="fin-fact-sub">{v.small.previousText}</div>}
        </div>

        {v.gewerbeText && (
          <div className="fin-fact">
            <div className="fin-fact-label">Gewerbesteuer</div>
            <div className="fin-fact-sub fin-fact-sub-strong">{v.gewerbeText}</div>
          </div>
        )}

        {v.prepayment && (
          <div className="fin-fact">
            <div className="fin-fact-row">
              <span className="fin-fact-label">Nächste ESt-Vorauszahlung</span>
              <span className="fin-amount fin-fact-strong">{v.prepayment.amountText}</span>
            </div>
            <div className="fin-fact-sub">am {v.prepayment.dateText}</div>
          </div>
        )}

        <p className="fin-hint fin-tax-note">{v.noteText}</p>
      </div>
    </Card>
  )
}
