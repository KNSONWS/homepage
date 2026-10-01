import { account } from './appwrite'
import { createFinanceRequest } from './financeRequest'

/**
 * Client fuer die Finanzen-API des Kundenportals (/api/admin/finanzen).
 * Authentifiziert per Appwrite-JWT (Bearer); alle Betraege in Cent. Anfrage-Kern und Fehlertexte: financeRequest.js.
 */
const PROJECT_ADMIN_URL =
  import.meta.env.VITE_PROJECT_ADMIN_URL || 'https://project.webklar.com'
const BASE = `${PROJECT_ADMIN_URL}/api/admin/finanzen`

const request = createFinanceRequest({ baseUrl: BASE, createJWT: () => account.createJWT() })

const enc = encodeURIComponent

// --- Uebersicht ---
export const getOverview = () => request('/uebersicht')

// --- Rechnungen ---
export function getInvoices({ status, kunde } = {}) {
  const params = new URLSearchParams()
  if (status) params.set('status', status)
  if (kunde) params.set('kunde', kunde)
  const qs = params.toString()
  return request(`/rechnungen${qs ? `?${qs}` : ''}`)
}

// Jeder Aufruf bekommt einen neuen Schluessel, damit ein Doppelklick keine zweite Rechnung erzeugt.
export const createInvoice = (body) =>
  request('/rechnungen', { method: 'POST', body: { ...body, idempotencyKey: crypto.randomUUID() } })
export const sendInvoice = (id) => request(`/rechnungen/${enc(id)}/senden`, { method: 'POST' })
// "Erinnerung senden": das Portal versendet eine offene/ueberfaellige Rechnung erneut
export const resendInvoice = sendInvoice
export const voidInvoice = (id) => request(`/rechnungen/${enc(id)}/stornieren`, { method: 'POST' })
export const deleteInvoice = (id) => request(`/rechnungen/${enc(id)}`, { method: 'DELETE' })

// --- Buchungen ---
export const getTransactions = () => request('/buchungen')
// target: genau eins von { invoiceId } | { payoutId } | { fixedCostId } | { category }, optional note
export const assignTransaction = (id, target) =>
  request(`/buchungen/${enc(id)}/zuordnen`, { method: 'POST', body: target })
export const unassignTransaction = (id) => request(`/buchungen/${enc(id)}/zuordnung`, { method: 'DELETE' })

// --- Bank ---
export const getBank = () => request('/bank')
export const refreshBank = () => request('/bank/aktualisieren', { method: 'POST' })
export const startBankAuth = () => request('/bank/verbinden', { method: 'POST' })
export const completeBankAuth = ({ code, state, error } = {}) =>
  request('/bank/rueckkehr', { method: 'POST', body: { code, state, error } })

// --- Einstellungen ---
export const getSettings = () => request('/einstellungen')
export const patchSettings = (patch) => request('/einstellungen', { method: 'PATCH', body: patch })

// --- Fixkosten ---
export const getFixedCosts = () => request('/fixkosten')
export const createFixedCost = (body) => request('/fixkosten', { method: 'POST', body })
export const updateFixedCost = (id, patch) => request(`/fixkosten/${enc(id)}`, { method: 'PATCH', body: patch })
export const deleteFixedCost = (id) => request(`/fixkosten/${enc(id)}`, { method: 'DELETE' })
