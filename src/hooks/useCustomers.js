import { useState, useEffect, useCallback } from 'react'
import {
  COLLECTIONS,
  DATABASE_ID,
  Query,
  databases,
} from '../lib/appwrite'
import {
  createCustomerWithPortalAccess,
  deleteCustomerWithPortalAccess,
  updateCustomerWithPortalAccess,
} from '../lib/customerAdminApi'

export function useCustomers() {
  const [customers, setCustomers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchCustomers = useCallback(async () => {
    try {
      // Direkt aus Appwrite: die Admin-API des Portals liefert gekuerzte Daten
      // (zum Beispiel ohne Stern)
      const response = await databases.listDocuments(
        DATABASE_ID,
        COLLECTIONS.CUSTOMERS,
        // Ohne Limit liefert Appwrite nur 25 Dokumente.
        [Query.orderAsc('name'), Query.limit(5000)]
      )
      setCustomers(response.documents || [])
      setError(null)
    } catch (err) {
      console.error('Error fetching customers:', err)
      // Wenn Collection nicht existiert, setze leeres Array (kein Fehler)
      if (err.code === 404 || err.message?.includes('not found')) {
        setCustomers([])
        setError(null) // Kein Fehler, Collection existiert einfach noch nicht
      } else {
        setError(err.message)
        setCustomers([])
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchCustomers()
  }, [fetchCustomers])

  const createCustomer = async (data) => {
    try {
      const { password, ...fields } = data
      const result = await createCustomerWithPortalAccess({ ...fields, password })
      const customer = {
        ...result.customer,
        portalPassword: result.customer?.portalPassword || password || '',
      }
      setCustomers(prev => [...prev, customer])
      return { success: true, data: customer }
    } catch (err) {
      return { success: false, error: err.message }
    }
  }

  const updateCustomer = async (id, data) => {
    try {
      const { password, ...fields } = data
      const payload = { ...fields }
      if (password) payload.password = password

      const result = await updateCustomerWithPortalAccess(id, payload)
      const customer = {
        ...result.customer,
        portalPassword:
          result.customer?.portalPassword ||
          password ||
          undefined,
      }
      setCustomers(prev =>
        prev.map(c => {
          if (c.$id !== id) return c
          return {
            ...customer,
            portalPassword: customer.portalPassword ?? c.portalPassword,
          }
        })
      )
      return { success: true, data: customer }
    } catch (err) {
      return { success: false, error: err.message }
    }
  }

  const deleteCustomer = async (id) => {
    try {
      await deleteCustomerWithPortalAccess(id)
      setCustomers(prev => prev.filter(c => c.$id !== id))
      return { success: true }
    } catch (err) {
      return { success: false, error: err.message }
    }
  }

  return {
    customers,
    loading,
    error,
    refresh: fetchCustomers,
    createCustomer,
    updateCustomer,
    deleteCustomer
  }
}
