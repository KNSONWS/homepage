import { account } from './appwrite'

const PROJECT_ADMIN_URL =
  import.meta.env.VITE_PROJECT_ADMIN_URL || 'https://project.webklar.com'

async function adminFetch(path, { method = 'POST', body } = {}) {
  const jwt = await account.createJWT()
  const response = await fetch(`${PROJECT_ADMIN_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${jwt.jwt}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(data.error || `API-Fehler ${response.status}`)
  }
  return data
}

export async function createCustomerWithPortalAccess(payload) {
  return adminFetch('/api/admin/customers', { method: 'POST', body: payload })
}

export async function updateCustomerWithPortalAccess(customerId, payload) {
  return adminFetch(`/api/admin/customers/${customerId}`, {
    method: 'PATCH',
    body: payload,
  })
}

export async function deleteCustomerWithPortalAccess(customerId) {
  return adminFetch(`/api/admin/customers/${customerId}`, { method: 'DELETE' })
}

// Wartungs-/Hosting-Abo des Kunden: { productKey: 'wartung' | 'hosting' | null, active }
export async function getCustomerAbo(customerId) {
  return adminFetch(`/api/admin/customers/${encodeURIComponent(customerId)}/abo`, { method: 'GET' })
}
