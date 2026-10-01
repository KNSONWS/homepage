import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import {
  IconTicket,
  IconUsers,
  IconTargetArrow,
  IconReportMoney,
  IconScale,
  IconActivityHeartbeat,
  IconFolders,
  IconLayoutGrid,
  IconCalendar,
  IconSettings,
  IconLogout,
  IconLayoutSidebarLeftCollapse,
  IconLayoutSidebarLeftExpand,
  IconExternalLink,
} from '@tabler/icons-react'
import { openProjectAdmin } from '../lib/employeeAdminApi'
import { serverpulsApi } from '../lib/serverpulsApi'
import { startsCollapsed } from '../lib/sidebar'

export default function Sidebar() {
  const { user, logout, isAdmin } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [collapsed, setCollapsed] = useState(() => startsCollapsed())
  const [switching, setSwitching] = useState(false)
  const [pulseLevel, setPulseLevel] = useState('ok')

  // Serverpuls-Punkt: nur Admins, beim Laden und alle 5 Minuten; Fehler bleiben still
  useEffect(() => {
    if (!isAdmin) { setPulseLevel('ok'); return undefined }
    let dead = false
    const load = () => {
      serverpulsApi.overview()
        .then((o) => { if (!dead) setPulseLevel(o?.level || 'ok') })
        .catch(() => { if (!dead) setPulseLevel('ok') })
    }
    load()
    const iv = setInterval(load, 5 * 60 * 1000)
    return () => { dead = true; clearInterval(iv) }
  }, [isAdmin])

  const handleProjectAdmin = async () => {
    setSwitching(true)
    await openProjectAdmin()
  }

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  // Eine flache Liste: fuer ein kleines Team reichen acht Eintraege ohne Gruppen
  const links = [
    { label: 'Tickets', href: '/tickets', icon: <IconTicket /> },
    { label: 'Planboard', href: '/planboard', icon: <IconCalendar /> },
    { label: 'Projekte', href: '/projects', icon: <IconFolders /> },
    { label: 'Services', href: '/services', icon: <IconLayoutGrid /> },
    { label: 'Kunden', href: '/customers', icon: <IconUsers /> },
    // Leads liegen auf Eis (Lead-Automatik gestoppt 2026-09-30): grau, nicht klickbar
    { label: 'Leads', href: '/leads', icon: <IconTargetArrow />, paused: true },
    ...(isAdmin ? [{ label: 'Finanzen', href: '/finance', also: '/finanzen', icon: <IconReportMoney /> }] : []),
    { label: 'Rechtliches', href: '/rechtliches', icon: <IconScale /> },
    ...(isAdmin ? [{ label: 'Serverpuls', href: '/serverpuls', icon: <IconActivityHeartbeat />, dot: pulseLevel }] : []),
    ...(isAdmin ? [{ label: 'Admin', href: '/admin', icon: <IconSettings /> }] : []),
  ]

  const isActive = (href) =>
    location.pathname === href || location.pathname.startsWith(href + '/')
  // Finanzen bleibt auch auf der Rueckkehrseite der Bankfreigabe (/finanzen/...) markiert
  const isLinkActive = (link) => isActive(link.href) || (link.also ? isActive(link.also) : false)

  return (
    <aside className={`side ${collapsed ? 'collapsed' : ''}`}>
      <div className="side-head">
        <Link to="/" className="side-logo" title="Webklar">W</Link>
        <div className="side-brand">
          Webklar
          <small>Ticket-Plattform</small>
        </div>
      </div>

      <nav className="side-nav">
        <div className="side-group">
          {links.map((link) => link.paused ? (
            <span
              key={link.href}
              className="side-link side-link-paused"
              title={`${link.label} (pausiert)`}
              aria-disabled="true"
            >
              {link.icon}
              <span className="side-link-label">{link.label}</span>
            </span>
          ) : (
            <Link
              key={link.href}
              to={link.href}
              className={`side-link ${isLinkActive(link) ? 'active' : ''}`}
              title={link.label}
            >
              {link.icon}
              <span className="side-link-label">{link.label}</span>
              {link.dot && link.dot !== 'ok' && (
                <span
                  className={`side-dot side-dot-${link.dot}`}
                  data-testid="sp-nav-dot"
                  title={link.dot === 'critical' ? 'Critical-Warnung aktiv' : 'Warnung aktiv'}
                />
              )}
            </Link>
          ))}
          <button
            type="button"
            className="side-link side-link-button"
            onClick={handleProjectAdmin}
            disabled={switching}
            title="Projekt-Admin"
          >
            <IconExternalLink />
            <span className="side-link-label">Projekt-Admin</span>
          </button>
        </div>
      </nav>

      <div className="side-foot">
        {user && (
          <div className="side-link" title={user.name || user.email} style={{ cursor: 'default' }}>
            <div className="side-logo" style={{ width: 28, height: 28, fontSize: 12, background: 'linear-gradient(135deg,#667eea,#764ba2)' }}>
              {(user.name || user.email || '?').charAt(0).toUpperCase()}
            </div>
            <span className="side-link-label text-ellipsis">{user.name || user.email}</span>
          </div>
        )}
        <button className="side-toggle" onClick={handleLogout} title="Logout">
          <IconLogout size={20} />
          <span className="side-link-label">Logout</span>
        </button>
        <button className="side-toggle" onClick={() => setCollapsed((c) => !c)} title="Menue ein-/ausklappen">
          {collapsed ? <IconLayoutSidebarLeftExpand size={20} /> : <IconLayoutSidebarLeftCollapse size={20} />}
          <span className="side-link-label">Einklappen</span>
        </button>
      </div>
    </aside>
  )
}
