// Anzeige-Logik für die Zeile "Website-Analyse" (Schalter im WOMS)

const dateFormat = new Intl.DateTimeFormat('de-DE', {
  timeZone: 'Europe/Berlin',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
})

// "TT.MM.JJJJ" in Europe/Berlin
function formatBerlinDate(value) {
  const d = new Date(value)
  if (!value || Number.isNaN(d.getTime())) return ''
  const parts = Object.fromEntries(dateFormat.formatToParts(d).map((p) => [p.type, p.value]))
  return `${parts.day}.${parts.month}.${parts.year}`
}

// Antwort von GET /api/admin/analyse/:projectId => Statustext und erlaubte Aktionen
export function analyseStatus(a) {
  if (!a) return { text: '', color: 'grey', canEnable: false, canDisable: false }
  if (!a.enabled) return { text: 'Noch nicht freigeschaltet', color: 'grey', canEnable: false, canDisable: false }
  if (a.state === 'active') {
    const at = formatBerlinDate(a.activatedAt)
    return { text: at ? `An seit ${at}` : 'An', color: 'green', canEnable: false, canDisable: true }
  }
  if (a.state === 'disabled') return { text: 'Gesperrt', hint: 'Vom Team gesperrt', enableLabel: 'Trotz Sperre einschalten', color: 'red', canEnable: Boolean(a.eligible), canDisable: false }
  if (!a.eligible) {
    return { text: `Nicht verfügbar${a.reasonText ? `: ${a.reasonText}` : ''}`, color: 'grey', canEnable: false, canDisable: false }
  }
  return { text: 'Aus', color: 'grey', canEnable: true, canDisable: false }
}

export const avvLabel = (version) =>
  `Der Kunde hat den Auftragsverarbeitungsvertrag (Fassung ${version}) bestätigt`
