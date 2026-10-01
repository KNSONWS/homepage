import { useState, useEffect, useCallback, useMemo } from 'react'
import { COLLECTIONS, DATABASE_ID, Query, databases } from '../lib/appwrite'

const PAGE = 100

async function listAll(collection, queries = []) {
  const out = []
  let offset = 0
  for (;;) {
    const res = await databases.listDocuments(DATABASE_ID, collection, [
      ...queries,
      Query.limit(PAGE),
      Query.offset(offset),
    ])
    out.push(...(res.documents || []))
    if ((res.documents || []).length < PAGE) break
    offset += PAGE
  }
  return out
}

/** Haengt an jeden Lead Verweise, die nicht am Lead selbst gespeichert sind,
 *  sondern ueber den Kunden verknuepft werden — via Lead -> Kunde (per E-Mail):
 *    - woid:       WOID des Akquise-Tickets (workorders type=Akquise)
 *    - previewUrl: URL der erstellten, deployten Website (websiteProjects)
 *  Best effort; Fehler brechen die Lead-Liste nicht. */
async function attachLeadLinks(leads) {
  const norm = (l) => (l.email || l.portalLogin || '').trim().toLowerCase()
  const emails = [...new Set(leads.map(norm).filter(Boolean))]
  if (!emails.length) return leads

  // 1) Kunden per E-Mail -> customerId
  const emailToCustomer = {}
  const customerIds = []
  for (let i = 0; i < emails.length; i += 90) {
    const docs = await listAll(COLLECTIONS.CUSTOMERS, [Query.equal('email', emails.slice(i, i + 90))])
    for (const c of docs) {
      const e = (c.email || '').trim().toLowerCase()
      if (e && !emailToCustomer[e]) {
        emailToCustomer[e] = c.$id
        customerIds.push(c.$id)
      }
    }
  }
  if (!customerIds.length) return leads

  // 2) Akquise-Tickets per customerId -> kleinste (urspruengliche) WOID je Kunde
  const customerToWoid = {}
  for (let i = 0; i < customerIds.length; i += 90) {
    const docs = await listAll(COLLECTIONS.WORKORDERS, [
      Query.equal('customerId', customerIds.slice(i, i + 90)),
      Query.equal('type', ['Akquise']),
    ])
    for (const w of docs) {
      const n = parseInt(w.woid, 10)
      if (!w.customerId || isNaN(n)) continue
      const cur = customerToWoid[w.customerId]
      if (!cur || n < cur.n) customerToWoid[w.customerId] = { n, woid: w.woid, ticketId: w.$id }
    }
  }

  // 3) deployte Preview je Kunde -> URL der erstellten Website.
  //    Die websiteProjects-Collection ist klein -> komplett laden + lokal zuordnen
  //    (die Preview haengt am selben Kunden, aber an einem anderen Repo als lead.repoUrl).
  const customerToPreview = {}
  const idSet = new Set(customerIds)
  for (const p of await listAll(COLLECTIONS.WEBSITE_PROJECTS)) {
    if (!idSet.has(p.customerId) || customerToPreview[p.customerId]) continue
    const ready = p.status === 'deployed' || p.status === 'ready' || p.provisioningStatus === 'ready'
    const url = p.previewUrl || (p.subdomain ? `https://${p.subdomain}.project.webklar.com` : '')
    if (ready && url) customerToPreview[p.customerId] = url
  }

  // 4) an die Leads haengen
  return leads.map((l) => {
    const cid = emailToCustomer[norm(l)]
    const t = customerToWoid[cid]
    const previewUrl = customerToPreview[cid]
    if (!t && !previewUrl) return l
    return {
      ...l,
      ...(t ? { woid: t.woid, ticketId: t.ticketId } : {}),
      ...(previewUrl ? { previewUrl } : {}),
    }
  })
}

/** Recherche-Leads aus der taeglichen 06:00-Routine (Appwrite `leads`).
 *  Pollt automatisch nach — schneller, solange die 5-Minuten-Pipeline
 *  (processor.py auf dem Server) gerade Leads verarbeitet. */
export function useLeads() {
  const [leads, setLeads] = useState([])
  const [pipelines, setPipelines] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchLeads = useCallback(async () => {
    try {
      const out = await listAll(COLLECTIONS.LEADS, [Query.orderDesc('leadScore')])
      let enriched = out
      try { enriched = await attachLeadLinks(out) } catch { /* Live-Join best effort */ }
      setLeads(enriched)
      setError(null)
    } catch (err) {
      if (err.code === 404 || err.message?.includes('not found')) {
        setLeads([])
        setError(null)
      } else {
        setError(err.message)
        setLeads([])
      }
    } finally {
      setLoading(false)
    }
    // Schritt-Log + E-Mail-Entwurf pro Lead (Zusatz-Collection, best effort)
    try {
      const docs = await listAll(COLLECTIONS.LEAD_PIPELINE)
      const map = {}
      for (const d of docs) if (d.leadId) map[d.leadId] = d
      setPipelines(map)
    } catch {
      setPipelines({})
    }
  }, [])

  useEffect(() => {
    fetchLeads()
  }, [fetchLeads])

  // Live-Polling: 5s waehrend die Pipeline arbeitet, sonst alle 20s
  const pipelineActive = useMemo(
    () => leads.some((l) => l.pipelineStatus === 'running' || l.pipelineStatus === 'pending'),
    [leads]
  )
  useEffect(() => {
    const t = setInterval(fetchLeads, pipelineActive ? 5000 : 20000)
    return () => clearInterval(t)
  }, [fetchLeads, pipelineActive])

  const updateLead = async (id, data) => {
    try {
      const doc = await databases.updateDocument(DATABASE_ID, COLLECTIONS.LEADS, id, {
        ...data,
        updatedAt: new Date().toISOString(),
      })
      setLeads((prev) => prev.map((l) => (l.$id === id ? doc : l)))
      return { success: true, data: doc }
    } catch (err) {
      return { success: false, error: err.message }
    }
  }

  const deleteLead = async (id) => {
    try {
      await databases.deleteDocument(DATABASE_ID, COLLECTIONS.LEADS, id)
      setLeads((prev) => prev.filter((l) => l.$id !== id))
      return { success: true }
    } catch (err) {
      return { success: false, error: err.message }
    }
  }

  return { leads, pipelines, loading, error, refresh: fetchLeads, updateLead, deleteLead }
}

/** 5-Minuten-Zyklus des Server-Processors (leadSettings: lastRunAt/nextRunAt/
 *  workerBusy) + manueller Sofort-Trigger (runNow=true, der Processor pollt
 *  das Flag alle 5 Sekunden). */
export function useLeadCycle() {
  const [cycle, setCycle] = useState(null)
  const [triggering, setTriggering] = useState(false)

  const fetchCycle = useCallback(async () => {
    try {
      const doc = await databases.getDocument(DATABASE_ID, COLLECTIONS.LEAD_SETTINGS, 'main')
      setCycle({
        lastRunAt: doc.lastRunAt || null,
        nextRunAt: doc.nextRunAt || null,
        runNow: Boolean(doc.runNow),
        workerBusy: Boolean(doc.workerBusy),
      })
    } catch {
      setCycle(null)
    }
  }, [])

  useEffect(() => {
    fetchCycle()
    const t = setInterval(fetchCycle, 10000)
    return () => clearInterval(t)
  }, [fetchCycle])

  const triggerNow = async () => {
    setTriggering(true)
    try {
      await databases.updateDocument(DATABASE_ID, COLLECTIONS.LEAD_SETTINGS, 'main', {
        runNow: true,
        updatedAt: new Date().toISOString(),
      })
      await fetchCycle()
      return { success: true }
    } catch (err) {
      return { success: false, error: err.message }
    } finally {
      setTriggering(false)
    }
  }

  return { cycle, triggering, triggerNow, refresh: fetchCycle }
}

export const DEFAULT_LEAD_SETTINGS = {
  branche: 'Autolackiererei',
  staedte: [],
  ganzDeutschland: false,
  maxLeadsProStadt: 5,
  minBewertung: 4.0,
  emailPflicht: true,
  nurSchlechteWebsite: true,
  zusatzHinweise: '',
}

/** Sucheinstellungen der Routine (Appwrite `leadSettings`, Dokument `main`).
 *  Die Cloud-Routine liest sie vor jedem Lauf ueber den Server-Hook (/config). */
export function useLeadSettings() {
  const [settings, setSettings] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchSettings = useCallback(async () => {
    try {
      const doc = await databases.getDocument(DATABASE_ID, COLLECTIONS.LEAD_SETTINGS, 'main')
      setSettings(doc)
      setError(null)
    } catch (err) {
      if (err.code === 404 || err.message?.includes('not found')) {
        setSettings({ ...DEFAULT_LEAD_SETTINGS })
        setError(null)
      } else {
        setError(err.message)
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchSettings()
  }, [fetchSettings])

  const saveSettings = async (data) => {
    const payload = {
      branche: data.branche || '',
      staedte: data.staedte || [],
      ganzDeutschland: Boolean(data.ganzDeutschland),
      maxLeadsProStadt: Number(data.maxLeadsProStadt) || 5,
      minBewertung: Number(data.minBewertung) || 0,
      emailPflicht: Boolean(data.emailPflicht),
      nurSchlechteWebsite: Boolean(data.nurSchlechteWebsite),
      zusatzHinweise: data.zusatzHinweise || '',
      updatedAt: new Date().toISOString(),
    }
    try {
      let doc
      try {
        doc = await databases.updateDocument(DATABASE_ID, COLLECTIONS.LEAD_SETTINGS, 'main', payload)
      } catch (err) {
        if (err.code === 404) {
          doc = await databases.createDocument(DATABASE_ID, COLLECTIONS.LEAD_SETTINGS, 'main', payload)
        } else {
          throw err
        }
      }
      setSettings(doc)
      return { success: true, data: doc }
    } catch (err) {
      return { success: false, error: err.message }
    }
  }

  return { settings, loading, error, refresh: fetchSettings, saveSettings }
}
