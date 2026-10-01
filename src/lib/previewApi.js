import { account } from './appwrite'

const PROJECT_ADMIN_URL =
  import.meta.env.VITE_PROJECT_ADMIN_URL || 'https://project.webklar.com'

// Wie kindsFetch in projectKindsApi.js: der Fehler trägt .status und .data
// (z. B. 409 { error: 'Preview-Runner ist nicht aktiv' }, 503 bei Überlast).
async function previewFetch(path, options = {}) {
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

const base = (projectId) => `/api/admin/website-projects/${encodeURIComponent(projectId)}/preview`

export function fetchPreview(projectId) {
  return previewFetch(base(projectId))
}

export function setPreviewMode(projectId, mode) {
  return previewFetch(base(projectId), { method: 'PATCH', body: JSON.stringify({ mode }) })
}

export function savePreviewEnv(projectId, { set = {}, remove = [] } = {}) {
  return previewFetch(`${base(projectId)}/env`, { method: 'PUT', body: JSON.stringify({ set, remove }) })
}

export function rebuildPreview(projectId) {
  return previewFetch(`${base(projectId)}/rebuild`, { method: 'POST' })
}

export function startPreviewDev(projectId) {
  return previewFetch(`${base(projectId)}/dev/start`, { method: 'POST' })
}

export function stopPreviewDev(projectId) {
  return previewFetch(`${base(projectId)}/dev/stop`, { method: 'POST' })
}

export function fetchPreviewLog(projectId, runFile) {
  return previewFetch(`${base(projectId)}/logs/${encodeURIComponent(runFile)}`)
}
