import { account } from './appwrite'

const PROJECT_ADMIN_URL =
  import.meta.env.VITE_PROJECT_ADMIN_URL || 'https://project.webklar.com'

async function adminFetch(path, options = {}) {
  const jwt = await account.createJWT()
  const response = await fetch(`${PROJECT_ADMIN_URL}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${jwt.jwt}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error || `API-Fehler ${response.status}`)
  return data
}

export async function createProjectFromTemplate(payload) {
  return adminFetch('/api/admin/website-projects/create-from-template', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function syncGiteaRepos() {
  return adminFetch('/api/admin/gitea/sync-repos', { method: 'POST' })
}

export async function importNewRepos() {
  return adminFetch('/api/admin/gitea/import-repos', { method: 'POST' })
}

export async function assignWebsiteProject(id, { customerId, ticketId }) {
  return adminFetch(`/api/admin/website-projects/${id}/assign`, {
    method: 'POST',
    body: JSON.stringify({ customerId, ticketId }),
  })
}

export async function backfillProjectPushes(id) {
  return adminFetch(`/api/admin/website-projects/${id}/pushes`, { method: 'POST' })
}

export async function updateWebsiteProject(id, payload) {
  return adminFetch(`/api/admin/website-projects/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
}

export async function archiveWebsiteProject(id) {
  return adminFetch(`/api/admin/website-projects/${id}/archive`, { method: 'POST' })
}

export async function unarchiveWebsiteProject(id) {
  return adminFetch(`/api/admin/website-projects/${id}/unarchive`, { method: 'POST' })
}
