import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import LetterGlitch from '../components/LetterGlitch'
import { safeReturnPath } from '../lib/returnPath'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [code, setCode] = useState('')
  const [notice, setNotice] = useState('')

  const { login, mfaPending, sendCode, verifyCode, cancelMfa } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const target = safeReturnPath(location.state?.from)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const result = await login(email, password)
      
      if (result.success) {
        navigate(target, { replace: true })
      } else if (result.mfaRequired) {
        if (result.error) setError(result.error)
      } else {
        // Bessere Fehlermeldungen
        let errorMessage = result.error || 'Login fehlgeschlagen'
        
        if (errorMessage.includes('Invalid credentials') || errorMessage.includes('401')) {
          errorMessage = 'Ungültige Email oder Passwort. Bitte überprüfe deine Eingaben.'
        } else if (errorMessage.includes('Email/Password') || errorMessage.includes('auth')) {
          errorMessage = 'Email/Password Authentifizierung ist möglicherweise nicht aktiviert. Bitte überprüfe deine Appwrite-Konfiguration.'
        }
        
        setError(errorMessage)
      }
    } catch (err) {
      setError('Ein unerwarteter Fehler ist aufgetreten: ' + (err.message || 'Unbekannter Fehler'))
    } finally {
      setLoading(false)
    }
  }

  const handleCode = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    const result = await verifyCode(code)
    setLoading(false)
    if (result.success) {
      navigate(target, { replace: true })
    } else {
      setError(result.error)
      setCode('')
    }
  }

  const handleSend = async () => {
    setError('')
    setNotice('')
    setLoading(true)
    const result = await sendCode()
    setLoading(false)
    if (result.success) setNotice('Neuer Code ist unterwegs.')
    else setError(result.error)
  }

  const handleCancel = async () => {
    await cancelMfa()
    setError('')
    setNotice('')
    setCode('')
    setPassword('')
  }

  const linkButton = {
    background: 'none',
    border: 0,
    padding: 0,
    color: '#e2e8f0',
    textDecoration: 'underline',
    cursor: 'pointer',
    font: 'inherit',
  }

  const codeStep = mfaPending && (
    <form onSubmit={handleCode}>
      {error && (
        <div className="bg-red text-white p-1 mb-2" style={{ borderRadius: '4px' }}>
          {error}
        </div>
      )}
      <p style={{ marginTop: 0 }}>
        {!mfaPending.challengeId
          ? 'Wir schicken dir einen Code an deine E-Mail-Adresse.'
          : `Wir haben dir einen Code an ${mfaPending.email || 'deine E-Mail-Adresse'} geschickt.`}
      </p>
      {notice && <p style={{ marginTop: 0 }}>{notice}</p>}
      {mfaPending.challengeId ? (
        <>
          <div className="form-group">
            <label className="form-label" htmlFor="mfa-code">Code aus der E-Mail</label>
            <input
              id="mfa-code"
              type="text"
              className="form-control"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              required
              autoFocus
              style={{ letterSpacing: '0.3em' }}
            />
          </div>
          <button type="submit" className="btn btn-green" style={{ width: '100%' }} disabled={loading}>
            {loading ? 'Prüfe…' : 'Anmelden'}
          </button>
          <p style={{ textAlign: 'center', marginBottom: 0 }}>
            <button type="button" style={linkButton} onClick={handleSend} disabled={loading}>Code erneut senden</button>
            {' · '}
            <button type="button" style={linkButton} onClick={handleCancel}>Abbrechen</button>
          </p>
        </>
      ) : (
        <>
          <button type="button" className="btn btn-green" style={{ width: '100%' }} onClick={handleSend} disabled={loading}>
            {loading ? 'Sende…' : 'Code senden'}
          </button>
          <p style={{ textAlign: 'center', marginBottom: 0 }}>
            <button type="button" style={linkButton} onClick={handleCancel}>Abbrechen</button>
          </p>
        </>
      )}
    </form>
  )

  return (
    <div style={{ 
      position: 'relative',
      minHeight: '100vh', 
      width: '100%',
      overflow: 'hidden'
    }}>
      {/* LetterGlitch Hintergrund */}
      <div style={{ 
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        zIndex: 0
      }}>
        <LetterGlitch
          glitchSpeed={50}
          centerVignette={true}
          outerVignette={false}
          smooth={true}
        />
      </div>

      {/* Login-Formular */}
      <div style={{ 
        position: 'relative',
        zIndex: 1,
        minHeight: '100vh', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center'
      }}>
        <div style={{ 
          width: '400px', 
          boxShadow: '0 10px 40px rgba(0,0,0,0.5)',
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
          background: 'transparent',
          border: '1px solid rgba(255, 255, 255, 0.2)',
          borderRadius: '8px',
          marginBottom: '16px'
        }}>
          <div style={{ 
            padding: '12px 16px',
            background: 'transparent',
            color: '#fff',
            fontWeight: 'bold',
            borderBottom: '1px solid rgba(255, 255, 255, 0.2)',
            textAlign: 'center'
          }}>
            <h2>Webklar WOMS 2.0</h2>
          </div>
          <div style={{ padding: '16px', color: '#e2e8f0' }}>
            {codeStep || <form onSubmit={handleSubmit}>
              {error && (
                <div className="bg-red text-white p-1 mb-2" style={{ borderRadius: '4px' }}>
                  {error}
                </div>
              )}

              <div className="form-group">
                <label className="form-label">Email</label>
                <input
                  type="email"
                  className="form-control"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  placeholder="deine@email.com"
                />
              </div>

              <div className="form-group">
                <label className="form-label">Password</label>
                <input
                  type="password"
                  className="form-control"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  placeholder="••••••••"
                  minLength={8}
                />
              </div>

              <button 
                type="submit" 
                className="btn btn-green"
                style={{ width: '100%' }}
                disabled={loading}
              >
                {loading ? 'Login läuft...' : 'Login'}
              </button>
            </form>}
          </div>
        </div>
      </div>
    </div>
  )
}
