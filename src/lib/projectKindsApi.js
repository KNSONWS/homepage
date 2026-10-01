import { account, databases, DATABASE_ID, COLLECTIONS } from './appwrite'

const PROJECT_ADMIN_URL =
  import.meta.env.VITE_PROJECT_ADMIN_URL || 'https://project.webklar.com'

// Wie adminFetch in projectAdminApi.js, aber der Fehler trägt .status und .data
// (Antwort-Body), damit die Seite z. B. die Details eines 409 anzeigen kann.
async function kindsFetch(path, options = {}) {
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
  if (!response.ok) {
    const error = new Error(data.error || `API-Fehler ${response.status}`)
    error.status = response.status
    error.data = data
    throw error
  }
  return data
}

export function fetchServices() {
  return kindsFetch('/api/admin/services')
}

export function completeAssignment(projectId, body) {
  return kindsFetch(`/api/admin/website-projects/${projectId}/zuordnen`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export function fetchProject(projectId) {
  return databases.getDocument(DATABASE_ID, COLLECTIONS.WEBSITE_PROJECTS, projectId)
}
