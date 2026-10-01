import { Link } from 'react-router-dom'
import { FaArrowLeft } from 'react-icons/fa6'
import { PageHeader, Button } from '../components/ui'
import SettingsCard from '../components/finance/SettingsCard'
import BankAccessCard from '../components/finance/BankAccessCard'
import FixedCostsCard from '../components/finance/FixedCostsCard'

/**
 * Finanzen / Einstellungen (/finance/einstellungen, nur Admins): Rücklagen und Bankverbindungstext, Bankzugang
 * (Status, Abruf, neu verbinden) und die Fixkostenliste. Jede Karte lädt und speichert für sich.
 */
export default function FinanceSettingsPage() {
  return (
    <div className="page">
      <PageHeader
        title="Finanzen: Einstellungen"
        subtitle="Rücklagen, Bankzugang und Fixkosten"
        actions={
          <Button as={Link} variant="ghost" to="/finance">
            <FaArrowLeft aria-hidden="true" /> Zurück zu den Finanzen
          </Button>
        }
      />
      <div className="fin-stack">
        <SettingsCard />
        <BankAccessCard />
        <FixedCostsCard />
      </div>
    </div>
  )
}
