import { useState } from 'react'
import {
  FaFloppyDisk,
  FaPlus,
  FaSpinner,
  FaTrash,
  FaXmark,
} from 'react-icons/fa6'
import { FaEdit } from 'react-icons/fa'
import CopyableCredential from '../components/CopyableCredential'
import { useAuth } from '../context/AuthContext'
import { useEmployees } from '../hooks/useEmployees'
import './AdminPage.css'

const EMPTY_EMPLOYEE = {
  displayName: '',
  email: '',
  password: '',
  shortcode: '',
  isAdmin: false,
}

function Notice({ notice }) {
  if (!notice?.text) return null
  return <div className={`admin-notice ${notice.type}`}>{notice.text}</div>
}

export default function AdminPage() {
  const { user, isAdmin } = useAuth()
  const {
    employees,
    loading: employeesLoading,
    error: employeesError,
    createEmployee,
    updateEmployee,
    deleteEmployee,
  } = useEmployees()

  // Kunden werden unter "Kunden" gepflegt (Anlegen und Loeschen fuer Admins dort)
  const [activeSection, setActiveSection] = useState('employees')
  const [employeeForm, setEmployeeForm] = useState(EMPTY_EMPLOYEE)
  const [editingEmployee, setEditingEmployee] = useState(null)
  const [employeeBusy, setEmployeeBusy] = useState(false)
  const [createdCredential, setCreatedCredential] = useState(null)
  const [notice, setNotice] = useState(null)

  const showNotice = (type, text) => {
    setNotice({ type, text })
    window.setTimeout(() => setNotice(null), 4500)
  }

  if (!isAdmin) {
    return (
      <main className="page admin-page">
        <section className="admin-access-denied">
          <span>403</span>
          <h1>Zugriff verweigert</h1>
          <p>Für diesen Bereich ist ein Admin-Account erforderlich.</p>
        </section>
      </main>
    )
  }

  const resetEmployeeForm = () => {
    setEmployeeForm(EMPTY_EMPLOYEE)
    setEditingEmployee(null)
  }

  const submitEmployee = async (event) => {
    event.preventDefault()
    if (!employeeForm.displayName.trim() || !employeeForm.email.trim()) {
      showNotice('error', 'Name und E-Mail sind erforderlich.')
      return
    }
    if (!editingEmployee && employeeForm.password.length < 8) {
      showNotice('error', 'Das Passwort muss mindestens 8 Zeichen haben.')
      return
    }
    if (editingEmployee && employeeForm.password && employeeForm.password.length < 8) {
      showNotice('error', 'Ein neues Passwort muss mindestens 8 Zeichen haben.')
      return
    }

    setEmployeeBusy(true)
    const result = editingEmployee
      ? await updateEmployee(editingEmployee, employeeForm)
      : await createEmployee(employeeForm)
    setEmployeeBusy(false)
    if (!result.success) {
      showNotice('error', result.error || 'Mitarbeiter konnte nicht gespeichert werden.')
      return
    }
    if (!editingEmployee) {
      setCreatedCredential({
        email: employeeForm.email.trim(),
        password: employeeForm.password,
      })
    }
    showNotice('success', editingEmployee ? 'Mitarbeiter aktualisiert.' : 'Mitarbeiter angelegt. Der Login ist sofort aktiv.')
    resetEmployeeForm()
  }

  const editEmployee = (employee) => {
    setEditingEmployee(employee.$id)
    setEmployeeForm({
      displayName: employee.displayName || '',
      email: employee.email || '',
      password: '',
      shortcode: employee.shortcode || '',
      isAdmin: Boolean(employee.isAdmin),
    })
  }

  const removeEmployee = async (employee) => {
    if (!window.confirm(`${employee.displayName || employee.email} und dessen Login wirklich löschen?`)) return
    const result = await deleteEmployee(employee.$id)
    showNotice(
      result.success ? 'success' : 'error',
      result.success ? 'Mitarbeiter und Login gelöscht.' : result.error
    )
  }

  return (
    <main className="page admin-page">
      <header className="admin-header">
        <div>
          <span className="admin-eyebrow">Systemverwaltung</span>
          <h1>Admin</h1>
          <p>Mitarbeiter und ihre Zugänge verwalten. Kunden pflegst du unter „Kunden“.</p>
        </div>
        <div className="admin-current-user">
          <span>Angemeldet als</span>
          <strong>{user?.name || user?.email}</strong>
        </div>
      </header>

      <Notice notice={notice} />

      <nav className="admin-tabs" aria-label="Admin-Bereiche">
        {[
          ['employees', `Mitarbeiter (${employees.length})`],
        ].map(([id, label]) => (
          <button
            type="button"
            key={id}
            className={activeSection === id ? 'active' : ''}
            onClick={() => setActiveSection(id)}
          >
            {label}
          </button>
        ))}
      </nav>

      {activeSection === 'employees' && (
        <section>
          {createdCredential && (
            <div className="admin-credential-result">
              <div><strong>Login wurde angelegt</strong><span>Diese Zugangsdaten jetzt sicher weitergeben.</span></div>
              <CopyableCredential value={createdCredential.email} label="E-Mail" />
              <CopyableCredential value={createdCredential.password} secret label="Passwort" />
              <button type="button" className="admin-icon-button" onClick={() => setCreatedCredential(null)} aria-label="Hinweis schließen"><FaXmark /></button>
            </div>
          )}
          <div className="admin-split-layout">
            <form className="admin-form-card" onSubmit={submitEmployee}>
              <div className="admin-section-head">
                <div>
                  <h2>{editingEmployee ? 'Mitarbeiter bearbeiten' : 'Mitarbeiter anlegen'}</h2>
                  <span>Die User-ID wird automatisch vergeben.</span>
                </div>
                {editingEmployee && <button type="button" className="admin-icon-button" onClick={resetEmployeeForm} aria-label="Bearbeitung schließen"><FaXmark /></button>}
              </div>
              <label className="admin-field"><span>Name</span><input className="form-control" required value={employeeForm.displayName} onChange={(event) => setEmployeeForm({ ...employeeForm, displayName: event.target.value })} /></label>
              <label className="admin-field"><span>E-Mail</span><input type="email" className="form-control" required value={employeeForm.email} onChange={(event) => setEmployeeForm({ ...employeeForm, email: event.target.value })} /></label>
              <label className="admin-field"><span>{editingEmployee ? 'Neues Passwort (optional)' : 'Passwort'}</span><input type="password" className="form-control" autoComplete="new-password" required={!editingEmployee} value={employeeForm.password} onChange={(event) => setEmployeeForm({ ...employeeForm, password: event.target.value })} placeholder="Mindestens 8 Zeichen" /></label>
              <label className="admin-field"><span>Kürzel</span><input className="form-control" maxLength={10} value={employeeForm.shortcode} onChange={(event) => setEmployeeForm({ ...employeeForm, shortcode: event.target.value.toUpperCase() })} placeholder="z. B. KNSO" /></label>
              <label className={`admin-checkbox ${editingEmployee && employees.find((item) => item.$id === editingEmployee)?.userId === user?.$id ? 'disabled' : ''}`}>
                <input
                  type="checkbox"
                  checked={employeeForm.isAdmin}
                  disabled={editingEmployee && employees.find((item) => item.$id === editingEmployee)?.userId === user?.$id}
                  onChange={(event) => setEmployeeForm({ ...employeeForm, isAdmin: event.target.checked })}
                />
                <span><strong>Admin-Account</strong><small>Darf Systemkonfiguration und Benutzer verwalten.</small></span>
              </label>
              <button className="admin-primary-button" disabled={employeeBusy}>
                {employeeBusy ? <FaSpinner className="spin" /> : editingEmployee ? <FaFloppyDisk /> : <FaPlus />}
                {editingEmployee ? 'Änderungen speichern' : 'Mitarbeiter anlegen'}
              </button>
            </form>

            <section className="admin-list-card">
              <div className="admin-section-head"><div><h2>Mitarbeiterkonten</h2><span>Aktive Logins für das Ticketsystem</span></div></div>
              {employeesError && <Notice notice={{ type: 'error', text: employeesError }} />}
              {employeesLoading ? (
                <div className="admin-loading"><FaSpinner className="spinner" /> Mitarbeiter werden geladen …</div>
              ) : employees.length === 0 ? (
                <div className="admin-empty-state"><h3>Noch keine Mitarbeiter</h3><p>Lege links den ersten Login an.</p></div>
              ) : (
                <div className="admin-table-wrap">
                  <table className="admin-table">
                    <thead><tr><th>Mitarbeiter</th><th>E-Mail</th><th>Kürzel</th><th>Rolle</th><th>User-ID</th><th><span className="sr-only">Aktionen</span></th></tr></thead>
                    <tbody>
                      {employees.map((employee) => (
                        <tr key={employee.$id}>
                          <td><strong>{employee.displayName || '–'}</strong></td>
                          <td><CopyableCredential value={employee.email} label="E-Mail" /></td>
                          <td><span className="admin-shortcode">{employee.shortcode || '–'}</span></td>
                          <td><span className={`admin-role ${employee.isAdmin ? 'admin' : ''}`}>{employee.isAdmin ? 'Admin' : 'Mitarbeiter'}</span></td>
                          <td><CopyableCredential value={employee.userId} label="User-ID" /></td>
                          <td className="admin-row-actions">
                            <button type="button" className="admin-icon-button" onClick={() => editEmployee(employee)} aria-label={`${employee.displayName} bearbeiten`}><FaEdit /></button>
                            {employee.userId !== user?.$id && <button type="button" className="admin-icon-button danger" onClick={() => removeEmployee(employee)} aria-label={`${employee.displayName} löschen`}><FaTrash /></button>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>
        </section>
      )}
    </main>
  )
}
