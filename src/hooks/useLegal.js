import { useState, useEffect, useCallback } from 'react'
import {
  COLLECTIONS,
  DATABASE_ID,
  LEGAL_BUCKET_ID,
  ID,
  Query,
  databases,
  storage,
} from '../lib/appwrite'
import { planNewVersion } from '../lib/legal'

const isMissing = (err) => err?.code === 404 || /not found/i.test(err?.message || '')

async function listAll(collectionId, queries = []) {
  const res = await databases.listDocuments(DATABASE_ID, collectionId, [...queries, Query.limit(5000)])
  return res.documents || []
}

/** Laedt die Dateinamen des Buckets, damit Listen Namen statt IDs zeigen. */
async function listFileNames() {
  try {
    const res = await storage.listFiles(LEGAL_BUCKET_ID, [Query.limit(5000)])
    return Object.fromEntries((res.files || []).map((f) => [f.$id, f.name]))
  } catch {
    return {}
  }
}

async function uploadFiles(files = []) {
  const ids = []
  for (const file of files) {
    const created = await storage.createFile(LEGAL_BUCKET_ID, ID.unique(), file)
    ids.push(created.$id)
  }
  return ids
}

export function fileUrl(fileId) {
  return storage.getFileView(LEGAL_BUCKET_ID, fileId).toString()
}

export function fileDownloadUrl(fileId) {
  return storage.getFileDownload(LEGAL_BUCKET_ID, fileId).toString()
}

function useLoader(load) {
  const [state, setState] = useState({ loading: true, error: null, missingSetup: false })
  const [data, setData] = useState(null)

  const refresh = useCallback(async () => {
    try {
      setData(await load())
      setState({ loading: false, error: null, missingSetup: false })
    } catch (err) {
      console.error('Rechtliches laden:', err)
      setData(null)
      setState({ loading: false, error: isMissing(err) ? null : err.message, missingSetup: isMissing(err) })
    }
  }, [load])

  useEffect(() => {
    refresh()
  }, [refresh])

  return { data, ...state, setError: (error) => setState((s) => ({ ...s, error })), refresh }
}

const loadTexts = async () => {
  const [documents, versions, fileNames] = await Promise.all([
    listAll(COLLECTIONS.LEGAL_DOCUMENTS, [Query.orderAsc('sort')]),
    listAll(COLLECTIONS.LEGAL_VERSIONS),
    listFileNames(),
  ])
  return { documents, versions, fileNames }
}

export function useLegalDocuments() {
  const { data, loading, error, missingSetup, setError, refresh } = useLoader(loadTexts)
  const versions = data?.versions || []

  // Neue Version anlegen; eine juengere gueltige Version loest die bisherige ab.
  const addVersion = async (documentKey, input, files) => {
    const fileIds = await uploadFiles(files)
    const plan = planNewVersion(versions, { ...input, documentKey })
    await databases.createDocument(DATABASE_ID, COLLECTIONS.LEGAL_VERSIONS, ID.unique(), {
      ...plan.create,
      fileIds,
    })
    await applyUpdates(plan.updates, 'Neue Version gespeichert')
  }

  // Entwurf gueltig machen: dieselbe Abloese-Regel wie beim Anlegen.
  const promoteDraft = async (version) => {
    const plan = planNewVersion(versions, { ...version, status: 'current' })
    const { status, validTo } = plan.create
    await databases.updateDocument(DATABASE_ID, COLLECTIONS.LEGAL_VERSIONS, version.$id, { status, validTo })
    await applyUpdates(plan.updates, 'Version ist gültig')
  }

  const applyUpdates = async (updates, done) => {
    try {
      for (const u of updates) {
        await databases.updateDocument(DATABASE_ID, COLLECTIONS.LEGAL_VERSIONS, u.id, u.patch)
      }
      await refresh()
    } catch (err) {
      await refresh()
      setError(`${done}, alte Version konnte nicht abgelöst werden: ${err.message}`)
    }
  }

  const updateVersion = async (id, patch) => {
    await databases.updateDocument(DATABASE_ID, COLLECTIONS.LEGAL_VERSIONS, id, patch)
    await refresh()
  }

  return {
    documents: data?.documents || [],
    versions,
    fileNames: data?.fileNames || {},
    loading,
    error,
    missingSetup,
    addVersion,
    promoteDraft,
    updateVersion,
    refresh,
  }
}

const loadContracts = async () => {
  const [contracts, fileNames] = await Promise.all([
    listAll(COLLECTIONS.PROVIDER_CONTRACTS, [Query.orderAsc('provider')]),
    listFileNames(),
  ])
  return { contracts, fileNames }
}

export function useProviderContracts() {
  const { data, loading, error, missingSetup, refresh } = useLoader(loadContracts)

  const saveContract = async (values, files, id) => {
    const newIds = await uploadFiles(files)
    const existing = id ? data?.contracts.find((c) => c.$id === id)?.fileIds || [] : []
    const doc = { ...values, fileIds: [...existing, ...newIds] }
    if (id) await databases.updateDocument(DATABASE_ID, COLLECTIONS.PROVIDER_CONTRACTS, id, doc)
    else await databases.createDocument(DATABASE_ID, COLLECTIONS.PROVIDER_CONTRACTS, ID.unique(), doc)
    await refresh()
  }

  const deleteContract = async (id) => {
    await databases.deleteDocument(DATABASE_ID, COLLECTIONS.PROVIDER_CONTRACTS, id)
    await refresh()
  }

  return {
    contracts: data?.contracts || [],
    fileNames: data?.fileNames || {},
    loading,
    error,
    missingSetup,
    saveContract,
    deleteContract,
    refresh,
  }
}
