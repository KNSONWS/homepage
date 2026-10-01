/* Unterstuetzung bei Arbeitsblaettern.
   Im Arbeitsblatt steht im Feld "supporters" eine JSON-Liste
   [{ employeeId, name, task }]. Die Minuten werden nie gespeichert: jede
   unterstuetzende Person bekommt die Haelfte der Arbeitszeit, aufgerundet auf
   15 Minuten. Das Kundenportal rechnet mit derselben Regel
   (server/services/worksheetMinutes.js). */

import { TIME_STEP } from './timeSteps'
import { isWorksheetCreator } from './ticketForm'

const MAX_TASK = 200

export function supportMinutes(totalTime) {
  const total = Number(totalTime) || 0
  if (total <= 0) return 0
  return Math.ceil(total / 2 / TIME_STEP) * TIME_STEP
}

// Nie eine Exception: kaputte Werte ergeben eine leere Liste, kaputte Eintraege fallen weg
export function parseSupporters(raw) {
  let list = raw
  if (typeof raw === 'string') {
    if (!raw.trim()) return []
    try {
      list = JSON.parse(raw)
    } catch {
      return []
    }
  }
  if (!Array.isArray(list)) return []
  const seen = new Set()
  const result = []
  for (const entry of list) {
    if (!entry || typeof entry !== 'object') continue
    const employeeId = String(entry.employeeId || '').trim()
    const task = String(entry.task || '').trim().slice(0, MAX_TASK)
    if (!employeeId || !task || seen.has(employeeId)) continue
    seen.add(employeeId)
    result.push({ employeeId, name: String(entry.name || '').trim(), task })
  }
  return result
}

export function serializeSupporters(list) {
  return JSON.stringify((list || []).map(({ employeeId, name, task }) => ({ employeeId, name, task })))
}

// Arbeitszeit des Blatts plus die Unterstuetzung aller Personen
export function worksheetMinutes(worksheet) {
  const base = Number(worksheet?.totalTime) || 0
  return base + parseSupporters(worksheet?.supporters).length * supportMinutes(base)
}

export function firstName(name) {
  return String(name || '').trim().split(/\s+/)[0] || ''
}

// "Ich habe unterstuetzt": fremde Blaetter mit Arbeitszeit (Git-Pushes erst nach "Zeit nachtragen")
export function canAddOwnSupport(worksheet, user, employee) {
  if (!user?.$id || !worksheet) return false
  if (worksheet.isComment || !(Number(worksheet.totalTime) > 0)) return false
  return !isWorksheetCreator(worksheet, user, employee)
}

export function upsertSupporter(list, entry) {
  const current = list || []
  return current.some((s) => s.employeeId === entry.employeeId)
    ? current.map((s) => (s.employeeId === entry.employeeId ? { ...s, ...entry } : s))
    : [...current, entry]
}

export function removeSupporter(list, employeeId) {
  return (list || []).filter((s) => s.employeeId !== employeeId)
}

// Pruefung im Formular des Erstellers; null = in Ordnung
export function validateSupporters(list, creatorUserId) {
  const rows = list || []
  if (rows.some((s) => !String(s.employeeId || '').trim())) return 'Bitte in jeder Zeile eine Person auswählen.'
  if (rows.some((s) => !String(s.task || '').trim())) return 'Bitte bei jeder Person angeben, wobei sie unterstützt hat.'
  const ids = rows.map((s) => s.employeeId)
  if (new Set(ids).size !== ids.length) return 'Jede Person nur einmal eintragen.'
  if (creatorUserId && ids.includes(creatorUserId)) return 'Du kannst dich nicht selbst als Unterstützung eintragen.'
  return null
}
