import { databases, DATABASE_ID, COLLECTIONS, Query, ID } from './appwrite'

/** Pflichtfelder eines festen Kunden: Name, E-Mail und vollständige Anschrift (Voraussetzung für „Zum festen Kunden machen“). */
export function isInvoiceReady(c) {
  return Boolean(c && c.name && c.email && c.street && c.city && c.postalCode)
}

export function customerStage(c) {
  const s = (c?.customerStatus || '').toLowerCase()
  if (s === 'lead') return 'lead'
  if (s === 'lost') return 'lost'
  return 'customer' // Bestandsdaten ohne Status gelten als fester Kunde
}

/** Archiviert = aus der Standardansicht ausgeblendet (orthogonal zur CRM-Stufe). */
export function isArchived(c) {
  return Boolean(c?.archived)
}

/** Kunde archivieren / wiederherstellen. */
export async function setCustomerArchived(customer, archived) {
  return databases.updateDocument(DATABASE_ID, COLLECTIONS.CUSTOMERS, customer.$id, {
    archived: Boolean(archived),
    updatedAt: new Date().toISOString(),
  })
}

async function nextWoid() {
  try {
    const res = await databases.listDocuments(DATABASE_ID, COLLECTIONS.WORKORDERS, [
      Query.orderDesc('$createdAt'),
      Query.limit(200),
    ])
    const nums = res.documents.map((d) => parseInt(d.woid)).filter((n) => !isNaN(n) && n > 0)
    return String((nums.length ? Math.max(...nums) : 9999) + 1)
  } catch {
    return String(10000)
  }
}

/** Auto-Akquise-Ticket fuer einen potenziellen Kunden. */
export async function createAcquisitionTicket(customer, user) {
  const woid = await nextWoid()
  const data = {
    topic: `Akquise: ${customer.name}`,
    status: 'Open',
    priority: 2,
    woid,
    type: 'Akquise',
    systemType: 'n/a',
    serviceType: 'Remote',
    customerId: customer.$id,
    customerName: customer.name,
    customerLocation: customer.location || '',
    requestedBy: customer.email || '',
    assignedTo: user?.$id || '',
    details:
      `Automatisch erstelltes Akquise-Ticket fuer den potenziellen Kunden "${customer.name}".\n` +
      `Kontakt: ${customer.email || '-'}\n\n` +
      `Worksheets dokumentieren den Kontaktverlauf (sichtbar in den WSIDs).\n` +
      `Ergebnis im Worksheet auf "Zugesagt" -> Lead wird automatisch fester Kunde. "Abgesagt" -> Ticket geschlossen.`,
    createdAt: new Date().toISOString(),
  }
  return databases.createDocument(DATABASE_ID, COLLECTIONS.WORKORDERS, ID.unique(), data)
}

/** Legt einen Lead an (nur Unternehmen + E-Mail) und erstellt das Akquise-Ticket. */
export async function createLead({ company, email }, user) {
  const customer = await databases.createDocument(DATABASE_ID, COLLECTIONS.CUSTOMERS, ID.unique(), {
    name: company,
    companyName: company,
    email: email || '',
    customerStatus: 'lead',
    updatedAt: new Date().toISOString(),
  })
  let ticket = null
  try {
    ticket = await createAcquisitionTicket(customer, user)
  } catch {
    /* Ticket ist optional - Lead bleibt bestehen */
  }
  return { customer, ticket }
}

/** Macht aus einem Lead einen festen Kunden (mit vollständigen Daten). Liefert das gespeicherte Kunden-Dokument. */
export async function upgradeToCustomer(customer, fullData) {
  return databases.updateDocument(DATABASE_ID, COLLECTIONS.CUSTOMERS, customer.$id, {
    ...fullData,
    customerStatus: 'customer',
    updatedAt: new Date().toISOString(),
  })
}
