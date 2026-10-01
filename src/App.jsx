import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import Sidebar from './components/Navbar'
import Footer from './components/Footer'
import LoginPage from './pages/LoginPage'
import TicketsPage from './pages/TicketsPage'
import PlanboardPage from './pages/PlanboardPage'
import ProjectsPage from './pages/ProjectsPage'
import AdminPage from './pages/AdminPage'
import CustomersPage from './pages/CustomersPage'
import CustomerDetailPage from './pages/CustomerDetailPage'
import FinancePage from './pages/FinancePage'
import FinanceSettingsPage from './pages/FinanceSettingsPage'
import LegalPage from './pages/LegalPage'
import AssignProjectPage from './pages/AssignProjectPage'
import ServicesPage from './pages/ServicesPage'
import ServerpulsPage from './pages/ServerpulsPage'
import BankCallbackPage from './pages/BankCallbackPage'
import AdminRoute from './components/AdminRoute'
import { safeReturnPath } from './lib/returnPath'

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="text-center p-4" style={{ marginTop: 80 }}>
        <div className="spinner"></div>
        <p>Loading...</p>
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  return children
}

function AppRoutes() {
  const { user } = useAuth()
  const location = useLocation()

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to={safeReturnPath(location.state?.from)} replace /> : <LoginPage />} />
      <Route path="/" element={<Navigate to="/tickets" replace />} />
      <Route path="/tickets" element={<ProtectedRoute><TicketsPage /></ProtectedRoute>} />
      <Route path="/customers" element={<ProtectedRoute><CustomersPage /></ProtectedRoute>} />
      <Route path="/customers/:id" element={<ProtectedRoute><CustomerDetailPage /></ProtectedRoute>} />
      <Route path="/leads" element={<Navigate to="/tickets" replace />} />
      {/* Finanzen: nur Admins, alle anderen gehen zu /tickets */}
      <Route path="/finance" element={<ProtectedRoute><AdminRoute><FinancePage /></AdminRoute></ProtectedRoute>} />
      <Route path="/finance/einstellungen" element={<ProtectedRoute><AdminRoute><FinanceSettingsPage /></AdminRoute></ProtectedRoute>} />
      <Route path="/finanzen/bank-callback" element={<ProtectedRoute><AdminRoute><BankCallbackPage /></AdminRoute></ProtectedRoute>} />
      <Route path="/rechtliches" element={<ProtectedRoute><LegalPage /></ProtectedRoute>} />
      <Route path="/serverpuls" element={<ProtectedRoute><ServerpulsPage /></ProtectedRoute>} />
      <Route path="/planboard" element={<ProtectedRoute><PlanboardPage /></ProtectedRoute>} />
      <Route path="/projects" element={<ProtectedRoute><ProjectsPage /></ProtectedRoute>} />
      <Route path="/services" element={<ProtectedRoute><ServicesPage /></ProtectedRoute>} />
      <Route path="/projects/zuordnen/:id" element={<ProtectedRoute><AssignProjectPage /></ProtectedRoute>} />
      <Route path="/admin" element={<ProtectedRoute><AdminPage /></ProtectedRoute>} />
      {/* Alte Links (z. B. die entfernten Seiten Assets, Reports, Docs, Roadmaps) landen bei den Tickets */}
      <Route path="*" element={<Navigate to="/tickets" replace />} />
    </Routes>
  )
}

function AppContent() {
  const { user } = useAuth()

  if (!user) {
    return <AppRoutes />
  }

  return (
    <div className="app-shell">
      <Sidebar />
      <div className="app-main">
        <div className="app-scroll">
          <AppRoutes />
        </div>
        <Footer />
      </div>
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </BrowserRouter>
  )
}
