import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

// Nur fuer Admins; wird innerhalb von ProtectedRoute verwendet. Alle anderen landen bei den Tickets.
export default function AdminRoute({ children }) {
  const { loading, isAdmin } = useAuth()

  if (loading) {
    return (
      <div className="text-center p-4" style={{ marginTop: 80 }}>
        <div className="spinner"></div>
        <p>Wird geladen …</p>
      </div>
    )
  }

  if (!isAdmin) return <Navigate to="/tickets" replace />

  return children
}
