// Reiter der Kundenansicht (rein, ohne React; unter Node testbar). „Rechnungen“ ruft die Finanzen-API des Portals auf,
// die nur Admins freigibt: für alle anderen gibt es den Reiter nicht.

const BASE_TABS = [
  { id: 'overview', label: 'Uebersicht' },
  { id: 'tickets', label: 'Tickets' },
  { id: 'invoices', label: 'Rechnungen', adminOnly: true },
  { id: 'projects', label: 'Projekte' },
]

/** Reiter für Tabs: [{ id, label }]; „Rechnungen“ nur für Admins. */
export function customerTabs(isAdmin) {
  return BASE_TABS.filter((t) => !t.adminOnly || isAdmin === true).map(({ id, label }) => ({ id, label }))
}

/** Der Reiter, der tatsächlich gezeigt wird: ein nicht (mehr) erlaubter oder unbekannter Reiter fällt auf „Übersicht“ zurück. */
export function resolveCustomerTab(tab, isAdmin) {
  return customerTabs(isAdmin).some((t) => t.id === tab) ? tab : 'overview'
}
