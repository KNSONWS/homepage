// Aufbereitung der /api/admin/services-Antwort für die Seite "Services"
const STATUS_LABELS = { in_development: 'In Entwicklung', available: 'Verfügbar' }

export function servicesCards(api) {
  if (!api) return []
  const groups = api.groups || {}
  const featureDefs = api.features || {}
  const cards = (api.kinds || []).map((k) => {
    const projects = groups[k.key] || []
    return {
      key: k.key,
      label: k.label,
      description: k.description || '',
      count: projects.length,
      features: (k.features || []).map((f) => ({
        label: featureDefs[f]?.label || f,
        statusLabel: STATUS_LABELS[featureDefs[f]?.status] || '',
      })),
      projects,
    }
  })
  const missing = groups.missing || []
  if (missing.length) {
    cards.push({
      key: 'missing',
      label: 'Art fehlt',
      description: 'Diese Projekte sind noch keiner Art zugeordnet.',
      count: missing.length,
      features: [],
      projects: missing,
    })
  }
  return cards
}
