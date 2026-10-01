import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { FaGear, FaSpinner } from 'react-icons/fa6'
import { PageHeader, Card, Button } from '../components/ui'
import StatusLine from '../components/finance/StatusLine'
import LiquidityHead from '../components/finance/LiquidityHead'
import TodoList from '../components/finance/TodoList'
import ForecastTable from '../components/finance/ForecastTable'
import TaxCard from '../components/finance/TaxCard'
import AboCard from '../components/finance/AboCard'
import InvoiceTable from '../components/finance/InvoiceTable'
import TransactionTable from '../components/finance/TransactionTable'
import AssignDialog from '../components/finance/AssignDialog'
import { useFinanceOverview } from '../hooks/useFinanceOverview'
import { useFinanceTransactions } from '../hooks/useFinanceTransactions'
import { useOpenInvoices } from '../hooks/useOpenInvoices'
import { createFixedCost, refreshBank, startBankAuth } from '../lib/financeApi'
import { planTodoAction, safeUrl } from '../lib/financeView'

export default function FinancePage() {
  const navigate = useNavigate()
  const { data, loading, error, reload } = useFinanceOverview()
  const txs = useFinanceTransactions()
  const reloadTransactions = txs.reload
  const [refreshing, setRefreshing] = useState(false)
  // Buchung, die gerade zugeordnet werden soll (Knopf in Block 7 oder Aufgabe „Zahlungseingang zuordnen“)
  const [assignTxId, setAssignTxId] = useState(null)
  const [assignNotice, setAssignNotice] = useState('')
  // Zähler, der die Rechnungsliste (Block 6) zum Neuladen bringt: sie hält ihre Liste selbst
  const [invoicesRefresh, setInvoicesRefresh] = useState(0)
  const refreshLock = useRef(false)
  const retriedRef = useRef(null)

  const assignTx = assignTxId ? txs.transactions.find((t) => t.$id === assignTxId) || null : null
  // Offene Rechnungen braucht nur ein gebuchter, noch nicht zugeordneter Eingang
  const needsInvoices = Boolean(assignTx && !assignTx.category && assignTx.status !== 'PDNG' && assignTx.amountCents > 0)
  const openInvoices = useOpenInvoices(needsInvoices)

  // Übersicht, Buchungen und Rechnungsliste zusammen neu laden (nach Zuordnen, Rechnungsänderungen und Bankabruf):
  // eine eben bezahlte Rechnung soll sofort aus „Offen“ verschwinden
  const reloadAll = useCallback(() => {
    setInvoicesRefresh((n) => n + 1)
    return Promise.all([reload(), reloadTransactions()])
  }, [reload, reloadTransactions])

  // Eine Aufgabe kann eine Buchung nennen, die in der geladenen Liste fehlt (neu abgerufen): einmal nachladen,
  // dann melden statt still nichts zu tun
  useEffect(() => {
    if (!assignTxId || assignTx || txs.loading) return
    if (retriedRef.current !== assignTxId) {
      retriedRef.current = assignTxId
      reloadTransactions()
      return
    }
    setAssignNotice(
      txs.error
        ? `Die Buchungen konnten nicht geladen werden: ${txs.error}`
        : 'Die Buchung wurde nicht gefunden. Möglicherweise ist sie schon zugeordnet.'
    )
    setAssignTxId(null)
  }, [assignTxId, assignTx, txs.loading, txs.error, reloadTransactions])

  const openAssign = useCallback((id) => {
    setAssignNotice('')
    retriedRef.current = null
    setAssignTxId(id)
  }, [])

  const handleAssignDone = useCallback(() => {
    setAssignTxId(null)
    return reloadAll()
  }, [reloadAll])

  const handleAssignClose = useCallback(
    (info) => {
      setAssignTxId(null)
      // Nach einem Fehler kann sich der Stand geändert haben (z. B. „Bereits zugeordnet“)
      if (info?.refresh) reloadAll()
    },
    [reloadAll]
  )

  // Bankabruf anstoßen, danach die Übersicht neu laden. Fehler (z. B. 429) gehen an den Aufrufer.
  // Ein Abruf, der bei der Bank scheitert, antwortet mit ok:false; das steht danach in der Statuszeile.
  const refresh = useCallback(async () => {
    if (refreshLock.current) return
    refreshLock.current = true
    setRefreshing(true)
    try {
      await refreshBank()
      await reloadAll()
    } finally {
      refreshLock.current = false
      setRefreshing(false)
    }
  }, [reloadAll])

  const handleAction = useCallback(
    async (aktion) => {
      const plan = planTodoAction(aktion)
      switch (plan.kind) {
        case 'bank-connect': {
          const { url } = await startBankAuth()
          const target = safeUrl(url)
          if (!target) throw new Error('Die Bank hat keine Weiterleitung geliefert.')
          window.location.assign(target)
          return
        }
        case 'bank-refresh':
          return refresh()
        case 'open-url':
          window.open(plan.url, '_blank', 'noopener,noreferrer')
          return
        case 'scroll':
          // Der Rechnungsblock (Task 5) trägt diese Id; ohne ihn passiert nichts. Erst nach dem Neuzeichnen
          // starten: ein Scroll mitten im Klick wird sonst vom Neuzeichnen der Aufgabenzeile abgebrochen.
          requestAnimationFrame(() => {
            document.getElementById(plan.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
          })
          return
        case 'assign':
          openAssign(plan.transactionId)
          return
        case 'navigate':
          navigate(plan.to)
          return
        case 'fixed-cost':
          if (!window.confirm(plan.confirmText)) return
          await createFixedCost(plan.payload)
          await reload()
          return
        default:
          throw new Error(plan.message)
      }
    },
    [navigate, openAssign, refresh, reload]
  )

  let body
  if (!data && loading) {
    body = (
      <div className="empty" role="status">
        <FaSpinner className="spinner" aria-hidden="true" />
        <p className="muted">Finanzen werden geladen …</p>
      </div>
    )
  } else if (!data) {
    body = (
      <Card>
        <p role="alert" style={{ fontWeight: 600, marginTop: 0 }}>{error || 'Die Übersicht konnte nicht geladen werden.'}</p>
        <Button variant="primary" onClick={reload}>Erneut versuchen</Button>
      </Card>
    )
  } else {
    body = (
      <div className="fin-stack">
        {error && (
          <p className="fin-hint fin-hint-warn" role="alert">
            Die Übersicht konnte nicht neu geladen werden: {error}{' '}
            <Button size="sm" variant="ghost" onClick={reload} disabled={loading}>Erneut versuchen</Button>
          </p>
        )}
        <StatusLine stand={data.stand} onRefresh={refresh} refreshing={refreshing} />
        <LiquidityHead kopf={data.kopf} />
        <TodoList aufgaben={data.aufgaben} onAction={handleAction} />
        <div className="fin-cols">
          <ForecastTable
            vorschau={data.vorschau}
            kontostandCents={data.kopf?.kontostandCents}
            stripeDown={data.stand?.stripe?.ok === false}
            abosFehler={Boolean(data.abos?.fehler)}
          />
          <TaxCard steuer={data.steuer} />
        </div>
        <div className="fin-cols fin-cols-half">
          <AboCard abos={data.abos} />
        </div>
        <InvoiceTable altersgruppen={data.rechnungen?.altersgruppen} refreshToken={invoicesRefresh} onChanged={reloadAll} />
        <TransactionTable
          transactions={txs.transactions}
          stripeFehler={txs.stripeFehler}
          loaded={txs.loaded}
          loading={txs.loading}
          error={txs.error}
          onReload={reloadTransactions}
          onAssign={(tx) => openAssign(tx.$id)}
        />
      </div>
    )
  }

  return (
    <div className="page">
      <PageHeader
        title="Finanzen"
        subtitle="Kontostand, Aufgaben und Zahlungen im Blick"
        actions={
          <Button as={Link} variant="ghost" to="/finance/einstellungen">
            <FaGear aria-hidden="true" /> Einstellungen
          </Button>
        }
      />
      {assignNotice && (
        <p className="fin-hint fin-hint-warn fin-page-notice" role="alert">
          {assignNotice}{' '}
          <Button size="sm" variant="ghost" onClick={() => setAssignNotice('')}>Schließen</Button>
        </p>
      )}
      {body}
      {assignTx && (
        <AssignDialog
          key={assignTx.$id}
          transaction={assignTx}
          invoices={openInvoices.invoices}
          invoicesLoading={openInvoices.loading}
          invoicesError={openInvoices.error}
          invoicesLoaded={openInvoices.loaded}
          onClose={handleAssignClose}
          onDone={handleAssignDone}
        />
      )}
    </div>
  )
}
