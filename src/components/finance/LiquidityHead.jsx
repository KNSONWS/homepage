import { useId, useState } from 'react'
import { FaChevronDown, FaChevronUp } from 'react-icons/fa6'
import { Kpi } from '../ui'
import { euroWhole } from '../../lib/financeFormat'
import { breakdownRows, lowPointLines } from '../../lib/financeView'

const isNum = (v) => typeof v === 'number' && Number.isFinite(v)

/** Block 1: Kontostand, „Verfügbar nach Rücklagen“ (mit Aufschlüsselung) und „Tiefster Stand in 30 Tagen“. */
export default function LiquidityHead({ kopf }) {
  const k = kopf && typeof kopf === 'object' ? kopf : {}
  const [open, setOpen] = useState(false)
  const listId = useId()

  const hasBalance = isNum(k.kontostandCents)
  const shortfall = isNum(k.verfuegbarCents) && k.verfuegbarCents < 0
  const lows = lowPointLines(k)
  const anyLowNegative = lows.some((l) => l && l.negative)

  return (
    <div className="kpi-grid fin-head">
      <Kpi
        label="Kontostand"
        value={euroWhole(k.kontostandCents)}
        sub={hasBalance ? 'gebucht' : 'Noch kein Kontostand abgerufen'}
      />

      <Kpi
        label="Verfügbar nach Rücklagen"
        value={euroWhole(k.verfuegbarCents)}
        accent={shortfall ? 'var(--danger)' : 'var(--accent)'}
        sub={
          <>
            {shortfall && <div className="fin-flag">Rücklagen nicht gedeckt</div>}
            {isNum(k.verfuegbarCents) && (
              <>
                <button
                  type="button"
                  className="fin-link"
                  aria-expanded={open}
                  aria-controls={listId}
                  onClick={() => setOpen((v) => !v)}
                >
                  Aufschlüsselung {open ? <FaChevronUp aria-hidden="true" /> : <FaChevronDown aria-hidden="true" />}
                </button>
                {open && (
                  <ul id={listId} className="fin-breakdown">
                    {breakdownRows(k.aufschluesselung, k.verfuegbarCents).map((row) => (
                      <li key={row.key} className={row.total ? 'fin-breakdown-total' : undefined}>
                        <span>{row.label}</span>
                        <span className="fin-amount">{row.text}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
            {!isNum(k.verfuegbarCents) && <div>Ohne Kontostand nicht berechenbar</div>}
          </>
        }
      />

      <Kpi
        label="Tiefster Stand in 30 Tagen"
        accent={anyLowNegative ? 'var(--danger)' : 'var(--info)'}
        value={
          lows.some(Boolean) ? (
            <div className="fin-lows">
              {lows.map(
                (low) =>
                  low && (
                    <div key={low.key} className="fin-low">
                      <span className="fin-low-label">{low.label}:</span>
                      <span className="fin-amount">{low.amountText}</span>
                      <span className="fin-low-when">
                        am {low.dateText}
                        {low.negative && <span className="fin-flag"> · im Minus</span>}
                      </span>
                    </div>
                  )
              )}
            </div>
          ) : (
            '–'
          )
        }
        sub={lows.some(Boolean) ? '„erwartet“ zählt offene Rechnungen und Abos dazu' : 'Ohne Kontostand nicht berechenbar'}
      />
    </div>
  )
}
