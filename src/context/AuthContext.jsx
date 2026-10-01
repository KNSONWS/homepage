import { createContext, useContext, useState, useEffect } from 'react'
import {
  account,
  databases,
  DATABASE_ID,
  COLLECTIONS,
  ID,
  Query,
  hasAppwriteSession,
  projectId as PROJECT_ID,
  client,
} from '../lib/appwrite'
import { createMfaApi, isMoreFactorsError, maskEmail, mfaErrorMessage } from '../lib/mfa'

const AuthContext = createContext()
const mfa = createMfaApi(client)

function clearStaleAppwriteSessions() {
  if (typeof window === 'undefined' || !window.localStorage) return
  try {
    const raw = window.localStorage.getItem('cookieFallback')
    if (!raw) return
    const parsed = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return
    for (const key of Object.keys(parsed)) {
      if (key.startsWith('a_session_') && key !== `a_session_${PROJECT_ID}`) {
        delete parsed[key]
      }
    }
    window.localStorage.setItem('cookieFallback', JSON.stringify(parsed))
  } catch {
    window.localStorage.removeItem('cookieFallback')
  }
}

function clearAllLocalAppwriteSessions() {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem('cookieFallback')
  } catch { /* ignore */ }
}

async function createSessionWithCleanup(email, password) {
  try {
    await account.deleteSessions()
  } catch { /* alte Sitzung ggf. nur serverseitig */ }
  clearAllLocalAppwriteSessions()
  if (account.createEmailPasswordSession) {
    await account.createEmailPasswordSession(email, password)
  } else {
    await account.createEmailSession(email, password)
  }
}

// Hilfsfunktion: Fügt User automatisch zur employees Collection hinzu und liefert
// den Mitarbeiter-Eintrag (Kürzel = Gitea-Name, siehe isWorksheetCreator) oder null
async function ensureEmployeeExists(user) {
  if (!user) return null

  try {
    const response = await databases.listDocuments(
      DATABASE_ID,
      COLLECTIONS.EMPLOYEES,
      [Query.equal('userId', user.$id)]
    )

    if (response.documents.length === 0) {
      const employee = await databases.createDocument(
        DATABASE_ID,
        COLLECTIONS.EMPLOYEES,
        ID.unique(),
        {
          userId: user.$id,
          displayName: user.name || user.email,
          email: user.email,
          shortcode: ''
        }
      )
      console.log('✅ User automatisch zur Mitarbeiter-Liste hinzugefügt')
      return employee
    }
    return response.documents[0]
  } catch (error) {
    if (error.code !== 404) {
      console.warn('Could not add user to employees collection:', error.message)
    }
    return null
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [employee, setEmployee] = useState(null)
  const [loading, setLoading] = useState(true)
  // 2FA: Passwort stimmt, Sitzung braucht noch den Code aus der E-Mail.
  // challengeId null = noch keine Mail verschickt (z. B. nach dem Neuladen)
  const [mfaPending, setMfaPending] = useState(null)

  useEffect(() => {
    checkUser()
  }, [])

  async function checkUser() {
    if (!hasAppwriteSession()) {
      setUser(null)
      setLoading(false)
      return
    }

    try {
      const session = await account.get()
      setUser(session)
      setEmployee(await ensureEmployeeExists(session))
    } catch (error) {
      if (isMoreFactorsError(error)) {
        // Halbe Sitzung: Code-Schritt zeigen, aber keine Mail von selbst (jedes Neuladen wuerde sonst eine ausloesen)
        setMfaPending({ challengeId: null, email: '' })
        setUser(null)
        return
      }
      if (error.code !== 401 && error.code !== 404) {
        console.error('Unexpected error checking user:', error)
      }
      if (error.code === 401) {
        clearAllLocalAppwriteSessions()
      }
      setUser(null)
    } finally {
      setLoading(false)
    }
  }

  async function login(email, password) {
    try {
      const normalizedEmail = email.trim()
      const normalizedPassword = password.trim()
      clearStaleAppwriteSessions()

      await createSessionWithCleanup(normalizedEmail, normalizedPassword)

      let session
      try {
        session = await account.get()
      } catch (error) {
        if (!isMoreFactorsError(error)) throw error
        setMfaPending({ challengeId: null, email: maskEmail(normalizedEmail) })
        const sent = await sendCode()
        return { success: false, mfaRequired: true, error: sent.error }
      }
      setUser(session)
      setEmployee(await ensureEmployeeExists(session))

      return { success: true }
    } catch (error) {
      console.error('Login error:', error)
      let errorMessage = error.message || 'Login fehlgeschlagen'

      if (error.code === 429 || errorMessage.includes('Rate limit')) {
        errorMessage = 'Zu viele Login-Versuche. Bitte 15–30 Minuten warten und es erneut versuchen.'
      } else if (errorMessage.includes('missing scopes') && errorMessage.includes('account')) {
        errorMessage = 'Session konnte nicht gespeichert werden. Bitte Seite neu laden und erneut versuchen.'
      } else if (
        error?.type === 'user_session_already_exists' ||
        errorMessage.includes('session is active')
      ) {
        errorMessage = 'Es gibt noch eine alte Sitzung. Bitte Seite neu laden und erneut anmelden.'
      } else if (error.code === 401 || errorMessage.includes('Invalid credentials')) {
        errorMessage = 'Ungültige Email oder Passwort'
      } else if (errorMessage.includes('User not found')) {
        errorMessage = 'Benutzer nicht gefunden. Bitte registriere dich zuerst.'
      } else if (errorMessage.includes('Email/Password')) {
        errorMessage = 'Email/Password Authentifizierung ist nicht aktiviert. Bitte aktiviere sie in deinem Appwrite Dashboard unter Auth → Providers.'
      }

      return { success: false, error: errorMessage }
    }
  }

  async function sendCode() {
    try {
      const challengeId = await mfa.createEmailChallenge()
      setMfaPending((pending) => ({ email: '', ...pending, challengeId }))
      return { success: true }
    } catch (error) {
      return { success: false, error: mfaErrorMessage(error) }
    }
  }

  async function verifyCode(otp) {
    if (!mfaPending?.challengeId) return { success: false, error: 'Bitte zuerst einen Code anfordern.' }
    try {
      await mfa.completeChallenge(mfaPending.challengeId, String(otp || '').trim())
      const session = await account.get()
      setUser(session)
      setEmployee(await ensureEmployeeExists(session))
      setMfaPending(null)
      return { success: true }
    } catch (error) {
      return { success: false, error: mfaErrorMessage(error) }
    }
  }

  async function cancelMfa() {
    try {
      await account.deleteSession('current')
    } catch { /* Sitzung ggf. schon weg */ }
    clearAllLocalAppwriteSessions()
    setMfaPending(null)
  }

  async function logout() {
    try {
      await account.deleteSessions()
    } catch (error) {
      console.error('Logout error:', error)
    } finally {
      clearAllLocalAppwriteSessions()
      setUser(null)
      setEmployee(null)
      setMfaPending(null)
    }
  }

  const isAdmin = Boolean(user?.labels?.includes('admin'))

  const value = {
    user,
    employee,
    loading,
    login,
    logout,
    isAdmin,
    mfaPending,
    sendCode,
    verifyCode,
    cancelMfa,
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
