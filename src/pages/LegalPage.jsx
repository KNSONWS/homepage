import { useState } from 'react'
import { EmptyState, PageHeader, Tabs } from '../components/ui'
import { useLegalDocuments, useProviderContracts } from '../hooks/useLegal'
import LegalTextsTab from '../components/legal/LegalTextsTab'
import ProviderContractsTab from '../components/legal/ProviderContractsTab'

const TABS = [
  { id: 'texte', label: 'Unsere Rechtstexte' },
  { id: 'anbieter', label: 'Verträge mit Anbietern' },
]

export default function LegalPage() {
  const [tab, setTab] = useState('texte')
  const texts = useLegalDocuments()
  const contracts = useProviderContracts()
  const active = tab === 'texte' ? texts : contracts

  let body
  if (active.loading) body = <div className="faint">Lädt …</div>
  else if (active.missingSetup) {
    body = (
      <EmptyState
        title="Rechtliches ist noch nicht eingerichtet"
        hint="Die Appwrite-Sammlungen fehlen noch (Setup-Skript scripts/setup-legal.mjs)."
      />
    )
  } else if (tab === 'texte') body = <LegalTextsTab {...texts} />
  else body = <ProviderContractsTab {...contracts} />

  return (
    <div className="page">
      <PageHeader title="Rechtliches" subtitle="Rechtstexte mit Versionsgeschichte und Verträge mit Anbietern" />
      <Tabs tabs={TABS} active={tab} onChange={setTab} />
      {active.error && <div className="legal-error">{active.error}</div>}
      {body}
    </div>
  )
}
