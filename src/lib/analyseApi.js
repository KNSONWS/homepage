import { account } from './appwrite'

const PROJECT_ADMIN_URL =
  import.meta.env.VITE_PROJECT_ADMIN_URL || 'https://project.webklar.com'

// Wie previewFetch in previewApi.js: der Fehler trägt .status und .data
async function analyseFetch(path, options = {}) {
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

const base = (projectId) => `/api/admin/analyse/${encodeURIComponent(projectId)}`

export function fetchAnalyse(projectId) {
  return analyseFetch(base(projectId))
}

export function setAnalyse(projectId, { on, avvConfirmedVerbally = false }) {
  return analyseFetch(base(projectId), { method: 'POST', body: JSON.stringify({ on, avvConfirmedVerbally }) })
}
