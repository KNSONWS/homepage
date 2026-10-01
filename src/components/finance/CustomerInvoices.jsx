import { Button, Card, EmptyState } from '../ui'
import AddressWarning from './AddressWarning'
import InvoiceTable from './InvoiceTable'
import { customerInvoicesGate } from '../../lib/financeView'

/**
 * Reiter „Rechnungen“ am Kunden. Kann für den Kunden keine Rechnung geschrieben werden (noch Lead, abgesagt, keine
 * E-Mail), steht der Grund da, mit „Daten erfassen“ (onShowOverview wechselt zum Reiter Übersicht). Sonst die
 * Rechnungen dieses Kunden mit „Rechnung schreiben“ (der Kunde steht im Dialog fest). Fehlt dem Kunden die Anschrift
 * (Straße, PLZ, Ort), steht darüber eine Warnung mit Knopf zur Übersicht; „Senden“ ist dann über 250 € gesperrt.
 */
export default function CustomerInvoices({ customer, onShowOverview }) {
  const gate = customerInvoicesGate(customer)
  if (!gate.ok) {
    return (
      <Card>
        <EmptyState
          title={gate.title}
          hint={gate.hint}
          action={onShowOverview ? <Button variant="primary" onClick={onShowOverview}>Daten erfassen</Button> : null}
        />
      </Card>
    )
  }
  return (
    <>
      <AddressWarning customer={customer} onShowOverview={onShowOverview} variant="page" />
      <InvoiceTable customer={customer} onShowOverview={onShowOverview} />
    </>
  )
}
