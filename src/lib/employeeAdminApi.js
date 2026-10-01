import { account } from './appwrite'

const PROJECT_ADMIN_URL =
  import.meta.env.VITE_PROJECT_ADMIN_URL || 'https://project.webklar.com'

async function adminFetch(path, { method = 'GET', body } = {}) {
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

export function listEmployeesForAdmin() {
  return adminFetch('/api/admin/employees')
}

export function createEmployeeWithLogin(payload) {
  return adminFetch('/api/admin/employees', { method: 'POST', body: payload })
}

export function updateEmployeeWithLogin(employeeId, payload) {
  return adminFetch(`/api/admin/employees/${employeeId}`, {
    method: 'PATCH',
    body: payload,
  })
}

export function deleteEmployeeWithLogin(employeeId) {
  return adminFetch(`/api/admin/employees/${employeeId}`, { method: 'DELETE' })
}

/** Wechsel ins Projekt-Admin ohne zweiten Login: Einmal-Link holen und im selben Tab oeffnen. */
export async function openProjectAdmin() {
  try {
    const { openUrl } = await adminFetch('/api/admin/switch-link', { method: 'POST', body: {} })
    window.location.assign(openUrl)
  } catch {
    window.location.assign('https://project.webklar.com/login.html')
  }
}
