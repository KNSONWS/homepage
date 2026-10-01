import { useCallback, useEffect, useState } from 'react'
import {
  COLLECTIONS,
  DATABASE_ID,
  Query,
  databases,
} from '../lib/appwrite'
import {
  createEmployeeWithLogin,
  deleteEmployeeWithLogin,
  listEmployeesForAdmin,
  updateEmployeeWithLogin,
} from '../lib/employeeAdminApi'

export function useEmployees() {
  const [employees, setEmployees] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchEmployees = useCallback(async () => {
    setLoading(true)
    try {
      try {
        const result = await listEmployeesForAdmin()
        setEmployees(result.employees || [])
      } catch {
        const result = await databases.listDocuments(
          DATABASE_ID,
          COLLECTIONS.EMPLOYEES,
          [Query.orderAsc('displayName')]
        )
        setEmployees(result.documents || [])
      }
      setError(null)
    } catch (err) {
      setEmployees([])
      setError(err.message || 'Mitarbeiter konnten nicht geladen werden')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchEmployees()
  }, [fetchEmployees])

  const createEmployee = async (data) => {
    try {
      const result = await createEmployeeWithLogin(data)
      setEmployees((current) => [...current, result.employee])
      return { success: true, data: result.employee }
    } catch (err) {
      return { success: false, error: err.message }
    }
  }

  const updateEmployee = async (id, data) => {
    try {
      const result = await updateEmployeeWithLogin(id, data)
      setEmployees((current) =>
        current.map((employee) => employee.$id === id ? result.employee : employee)
      )
      return { success: true, data: result.employee }
    } catch (err) {
      return { success: false, error: err.message }
    }
  }

  const deleteEmployee = async (id) => {
    try {
      await deleteEmployeeWithLogin(id)
      setEmployees((current) => current.filter((employee) => employee.$id !== id))
      return { success: true }
    } catch (err) {
      return { success: false, error: err.message }
    }
  }

  return {
    employees,
    loading,
    error,
    refresh: fetchEmployees,
    createEmployee,
    updateEmployee,
    deleteEmployee,
  }
}
