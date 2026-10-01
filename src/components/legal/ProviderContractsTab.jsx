import { Fragment, useState } from 'react'
import { Button, EmptyState } from '../ui'
import { deadlineTone, formatDate, nextCancellationDate } from '../../lib/legal'
import ContractForm from './ContractForm'
import { FileLinks, todayIso } from './legalUi'

const TONE_ORDER = { red: 0, orange: 1, normal: 2, missing: 3, grey: 4 }
const euro = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' })

function costLabel(c) {
  if (c.cost === null || c.cost === undefined) return '–'
  return `${euro.format(c.cost)}/${c.costInterval === 'year' ? 'Jahr' : 'Monat'}`
}

function termLabel(c) {
  if (c.termMonths === null || c.termMonths === undefined) return '–'
  if (c.termMonths === 0) return 'jederzeit kündbar'
  const renew = c.renewalMonths ? `, dann je ${c.renewalMonths} Monate` : ', endet danach'
  return `${c.termMonths} Monate${renew}`
}

function noticeLabel(c) {
  if (c.noticeValue === null || c.noticeValue === undefined) return '–'
  return `${c.noticeValue} ${c.noticeUnit === 'days' ? 'Tage' : 'Monate'}`
}

function deadlineLabel(r) {
  switch (r.state) {
    case 'active': return `kündbar bis ${formatDate(r.noticeBy)} (Periode endet ${formatDate(r.periodEnd)})`
    case 'anytime': return 'jederzeit kündbar'
    case 'ends': return `endet am ${formatDate(r.periodEnd)}`
    case 'ended': return `beendet seit ${formatDate(r.periodEnd)}`
    case 'cancelled': return r.periodEnd ? `gekündigt zum ${formatDate(r.periodEnd)}` : 'gekündigt'
    default: return 'Fristen fehlen'
  }
}

export default function ProviderContractsTab({ contracts, fileNames, saveContract, deleteContract }) {
  const [open, setOpen] = useState(null)
  const [editing, setEditing] = useState(null)
  const [cancelling, setCancelling] = useState(null)
  const [endsAt, setEndsAt] = useState('')
  const [actionError, setActionError] = useState(null)
  const today = todayIso()

  const rows = contracts
    .map((c) => {
      const result = nextCancellationDate(c, today)
      return { c, result, tone: deadlineTone(result, today) }
    })
    .sort((a, b) =>
      TONE_ORDER[a.tone] - TONE_ORDER[b.tone] ||
      (a.result.noticeBy || a.result.periodEnd || '9999').localeCompare(b.result.noticeBy || b.result.periodEnd || '9999')
    )

  const run = async (fn) => {
    setActionError(null)
    try {
      await fn()
    } catch (err) {
      setActionError(err.message)
    }
  }

  const confirmCancel = (c) =>
    run(async () => {
      await saveContract({ cancelledAt: today, endsAt: endsAt || null }, [], c.$id)
      setCancelling(null)
    })

  const remove = (c) => {
    if (window.confirm(`Vertrag „${c.provider}“ wirklich löschen?`)) run(() => deleteContract(c.$id))
  }

  return (
    <div>
      <div className="toolbar">
        <Button variant="primary" onClick={() => setEditing('new')}>Neuer Vertrag</Button>
      </div>
      {actionError && <div className="legal-error">{actionError}</div>}
      {rows.length === 0 ? (
        <EmptyState title="Noch keine Verträge eingetragen" />
      ) : (
        <table className="ui-table legal-contracts">
          <thead>
            <tr>
              <th>Anbieter</th><th>Wofür</th><th>Kosten</th><th>Laufzeit</th><th>Kündigungsfrist</th><th>Nächster Termin</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ c, result, tone }) => (
              <Fragment key={c.$id}>
                <tr className={`legal-tone-${tone}`} onClick={() => setOpen(open === c.$id ? null : c.$id)}>
                  <td><strong>{c.provider}</strong></td>
                  <td>{c.purpose || '–'}</td>
                  <td>{costLabel(c)}</td>
                  <td>{termLabel(c)}</td>
                  <td>{noticeLabel(c)}</td>
                  <td className="legal-deadline">{deadlineLabel(result)}</td>
                </tr>
                {open === c.$id && (
                  <tr className="legal-detail">
                    <td colSpan={6}>
                      {c.startDate && <div>Beginn: {formatDate(c.startDate)}</div>}
                      {c.note && <div className="legal-note">{c.note}</div>}
                      <div><FileLinks fileIds={c.fileIds} fileNames={fileNames} /></div>
                      <div className="flex gap-2 legal-actions">
                        <Button size="sm" onClick={() => setEditing(c)}>Bearbeiten</Button>
                        {!c.cancelledAt && cancelling !== c.$id && (
                          <Button size="sm" onClick={() => { setCancelling(c.$id); setEndsAt(result.periodEnd || '') }}>
                            Als gekündigt markieren
                          </Button>
                        )}
                        {cancelling === c.$id && (
                          <span className="flex gap-2 items-center">
                            <label>Endet am</label>
                            <input type="date" className="form-control" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
                            <Button size="sm" variant="primary" onClick={() => confirmCancel(c)}>Speichern</Button>
                            <Button size="sm" onClick={() => setCancelling(null)}>Abbrechen</Button>
                          </span>
                        )}
                        <Button size="sm" variant="danger" onClick={() => remove(c)}>Löschen</Button>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      )}
      {editing && (
        <ContractForm
          contract={editing === 'new' ? null : editing}
          onSave={(doc, files) => saveContract(doc, files, editing === 'new' ? undefined : editing.$id)}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}
