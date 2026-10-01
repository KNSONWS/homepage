import { Client, Account, Databases, Storage, ID, Query } from 'appwrite'

/** Ticket-System Appwrite-Projekt (Fallback wenn keine .env beim Build) */
const DEFAULT_PROJECT_ID = '6a1058610003c5a13a05'

const endpoint = import.meta.env.VITE_APPWRITE_ENDPOINT || 'https://ticket.webklar.com/v1'
export const projectId = (
  import.meta.env.VITE_APPWRITE_PROJECT_ID || DEFAULT_PROJECT_ID
).trim()

if (import.meta.env.DEV) {
  console.log('🔧 Appwrite Konfiguration:')
  console.log('Endpoint:', endpoint)
  console.log('Project ID:', projectId || 'NICHT GESETZT')
  console.log('Database ID:', import.meta.env.VITE_APPWRITE_DATABASE_ID || 'woms-database')
}

if (!projectId) {
  console.error('❌ FEHLER: VITE_APPWRITE_PROJECT_ID ist nicht gesetzt!')
}

export const client = new Client().setEndpoint(endpoint).setProject(projectId)

export const account = new Account(client)
export const databases = new Databases(client)
export const storage = new Storage(client)

export const DATABASE_ID = import.meta.env.VITE_APPWRITE_DATABASE_ID || 'woms-database'

export const COLLECTIONS = {
  WORKORDERS: 'workorders',
  CUSTOMERS: 'customers',
  EMPLOYEES: 'employees',
  WORKSHEETS: 'worksheets',
  WEBSITE_PROJECTS: 'websiteProjects',
  LEADS: 'leads',
  LEAD_SETTINGS: 'leadSettings',
  LEAD_PIPELINE: 'leadPipeline',
  LEGAL_DOCUMENTS: 'legalDocuments',
  LEGAL_VERSIONS: 'legalVersions',
  PROVIDER_CONTRACTS: 'providerContracts',
}

/** Dateien im Bereich Rechtliches (Versionen und Anbieter-Vertraege) */
export const LEGAL_BUCKET_ID = 'legal-files'

/** Prüft ob vermutlich eine Session existiert (cookieFallback oder Same-Origin-Cookie). */
export function hasAppwriteSession() {
  if (typeof window === 'undefined' || !projectId) return false
  try {
    const apiHost = new URL(endpoint).hostname
    if (apiHost === window.location.hostname) {
      return true
    }
  } catch {
    /* ignore */
  }
  try {
    const raw = window.localStorage.getItem('cookieFallback')
    if (!raw) return false
    const parsed = JSON.parse(raw)
    return Boolean(parsed?.[`a_session_${projectId}`])
  } catch {
    return false
  }
}

export { ID, Query }
