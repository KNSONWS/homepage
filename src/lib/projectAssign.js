export const GITEA_ORG = 'WEBklar'

export function isOutsideOrg(repoFullName) {
  if (!repoFullName) return false
  const org = repoFullName.split('/')[0] || ''
  return org.toLowerCase() !== GITEA_ORG.toLowerCase()
}

export function needsPreviewButton(project) {
  return !project.previewUrl || project.status !== 'deployed'
}

export function assignSummary(projectName, result) {
  if (result && result.error) {
    return { text: `${projectName}: Zuweisen fehlgeschlagen – ${result.error}`, warnings: [] }
  }

  const { moved, backfilled, warnings = [] } = result
  const parts = []
  if (moved) {
    parts.push('nach WEBklar verschoben')
  }
  if (backfilled === 1) {
    parts.push('1 Push nachgetragen')
  } else if (backfilled > 1) {
    parts.push(`${backfilled} Pushes nachgetragen`)
  } else {
    parts.push('keine neuen Pushes')
  }

  return { text: `${projectName}: ${parts.join(' · ')}`, warnings }
}

export async function assignSequentially(projectIds, ctx, assignFn) {
  const results = []
  for (const projectId of projectIds) {
    try {
      const result = await assignFn(projectId, ctx)
      results.push({ projectId, ok: true, result })
    } catch (err) {
      results.push({ projectId, ok: false, error: err.message })
    }
  }
  return results
}
