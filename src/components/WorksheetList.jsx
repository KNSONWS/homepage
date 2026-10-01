import { useState } from 'react'
import { FaClock, FaUser, FaExchangeAlt, FaComment, FaChevronDown, FaChevronUp, FaPen, FaCheck, FaHandsHelping } from 'react-icons/fa'
import { serviceTypeLabel, needsTimeEntry, worksheetTone } from '../lib/ticketForm'
import { statusLabel } from '../lib/ticketStatus'
import { parseSupporters, supportMinutes, firstName } from '../lib/support'

// Kopffarbe je Zustand (worksheetTone): orange = Git-Zeit fehlt, gruen = Git-Zeit eingetragen
const TONES = {
  'git-open': { border: '#f97316', base: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)', hover: 'linear-gradient(135deg, #ea580c 0%, #c2410c 100%)' },
  'git-done': { border: '#10b981', base: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', hover: 'linear-gradient(135deg, #059669 0%, #047857 100%)' },
  comment: { border: '#3b82f6', base: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)', hover: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)' },
  work: { border: '#4a5568', base: 'linear-gradient(135deg, #4a5568 0%, #2d3748 100%)', hover: 'linear-gradient(135deg, #2d3748 0%, #1a202c 100%)' },
}

// Hinweise im farbigen Kopf: mit der grauen Badge-Schrift waeren sie kaum lesbar
const headerBadgeStyle = { background: 'rgba(255,255,255,0.3)', color: 'white', marginLeft: '8px' }

const headerButtonStyle = {
  background: 'rgba(255,255,255,0.25)',
  color: 'white',
  border: '1px solid rgba(255,255,255,0.4)',
  borderRadius: '6px',
  padding: '2px 10px',
  fontSize: '0.8rem',
  marginRight: '8px',
}

export default function WorksheetList({ worksheets, totalTime, loading, onTogglePlan, aboHoursAllowed = true, canEditTimes, onEditTimes, canAddSupport, onOwnSupport, currentUserId }) {
  const [expandedWorksheets, setExpandedWorksheets] = useState({})
  if (loading) {
    return (
      <div className="text-center p-4">
        <div className="spinner-border" role="status">
          <span className="visually-hidden">Lädt …</span>
        </div>
      </div>
    )
  }

  if (!worksheets || worksheets.length === 0) {
    return (
      <div className="alert alert-info" role="alert">
        <FaComment className="me-2" />
        Noch keine Arbeitsblätter. Leg das erste mit „Arbeitsblatt hinzufügen“ an.
      </div>
    )
  }

  const formatTime = (minutes) => {
    if (!minutes || minutes === 0) return '-'
    const hours = Math.floor(minutes / 60)
    const mins = minutes % 60
    return hours > 0 ? `${hours}h ${mins}min` : `${mins}min`
  }

  const formatDateTime = (date, time) => {
    if (!time) return date
    const hours = time.substring(0, 2)
    const mins = time.substring(2, 4)
    return `${date} ${hours}:${mins}`
  }

  const toggleWorksheet = (wsid) => {
    setExpandedWorksheets(prev => ({
      ...prev,
      [wsid]: !prev[wsid]
    }))
  }

  return (
    <div className="worksheet-list">
      {/* Worksheet-Einträge */}
      <div className="timeline">
        {worksheets.map((ws, index) => {
          const isExpanded = expandedWorksheets[ws.wsid] || false
          const isGit = ws.serviceType === 'GIT'
          const tone = worksheetTone(ws)
          const colors = TONES[tone]
          const supporters = ws.isComment ? [] : parseSupporters(ws.supporters)
          
          return (
            <div key={ws.$id} className="timeline-item mb-4" style={{
              animation: `fadeIn 0.5s ease-in-out ${index * 0.1}s backwards`
            }}>
              <div className="card border-0 shadow-sm overflow-hidden" style={{
                borderLeft: `4px solid ${colors.border}`,
                borderRadius: '8px',
                transition: 'transform 0.2s ease, box-shadow 0.2s ease'
              }} onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-2px)'
                e.currentTarget.style.boxShadow = '0 8px 16px rgba(0,0,0,0.1)'
              }} onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)'
                e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)'
              }}>
                {/* Header - Immer sichtbar, klickbar */}
                <div 
                  className="card-header d-flex justify-content-between align-items-center py-3"
                  onClick={() => toggleWorksheet(ws.wsid)}
                  style={{
                    background: colors.base,
                    color: 'white',
                    border: 'none',
                    cursor: 'pointer',
                    userSelect: 'none',
                    transition: 'background 0.2s ease'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = colors.hover
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = colors.base
                  }}
                >
                  <div className="d-flex align-items-center gap-3">
                    {isExpanded ? (
                      <FaChevronUp style={{ fontSize: '0.9rem', opacity: 0.8 }} />
                    ) : (
                      <FaChevronDown style={{ fontSize: '0.9rem', opacity: 0.8 }} />
                    )}
                    <div>
                      <strong className="fs-6">WSID {ws.wsid}</strong>
                      {ws.isComment && !isGit && (
                        <span className="badge ms-2" style={headerBadgeStyle}>
                          <FaComment className="me-1" /> Kommentar
                        </span>
                      )}
                      {tone === 'git-open' && (
                        <span className="badge ms-2" style={headerBadgeStyle}>
                          <FaClock className="me-1" /> Zeit offen
                        </span>
                      )}
                      {tone === 'git-done' && (
                        <span className="badge ms-2" style={headerBadgeStyle}>
                          <FaCheck className="me-1" /> Zeit eingetragen
                        </span>
                      )}
                      {supporters.length > 0 && (
                        <span className="badge ms-2" title="Weitere Personen haben unterstützt" style={headerBadgeStyle}>
                          +{supporters.length} Unterstützung
                        </span>
                      )}
                      {ws.countsToPlan && !ws.isComment && (
                        <span className="badge ms-2" title="Wird vom Stundenguthaben des Wartungs-Abos abgezogen" style={{ ...headerBadgeStyle, background: '#9d3dfe' }}>
                          Abo-Stunden
                        </span>
                      )}
                    </div>
                    {/* Collapsed: Mitarbeiter & Zeit im Header */}
                    {!isExpanded && (
                      <div className="d-flex align-items-center gap-3 ms-3">
                        <div className="d-flex align-items-center">
                          <FaUser style={{ fontSize: '0.9rem', marginRight: '0.5rem' }} />
                          <span style={{ fontSize: '0.9rem' }}>{ws.employeeName}</span>
                        </div>
                        {!ws.isComment && (
                          <div className="d-flex align-items-center">
                            <FaClock style={{ fontSize: '0.9rem', marginRight: '0.5rem' }} />
                            <span style={{ fontSize: '0.9rem' }}>{formatTime(ws.totalTime)}</span>
                          </div>
                        )}
                        <span className="badge" style={{
                          background: 'rgba(255,255,255,0.2)',
                          color: 'white',
                          fontSize: '0.8rem'
                        }}>{serviceTypeLabel(ws.serviceType)}</span>
                      </div>
                    )}
                  </div>
                  <div className="d-flex align-items-center gap-2">
                    {onEditTimes && canEditTimes?.(ws) && (
                      <button
                        type="button"
                        className="btn btn-sm"
                        title="Beginn, Ende und Arbeitszeit ändern"
                        style={headerButtonStyle}
                        onClick={(e) => {
                          e.stopPropagation()
                          onEditTimes(ws)
                        }}
                      >
                        {needsTimeEntry(ws)
                          ? <><FaClock className="me-1" /> Zeit nachtragen</>
                          : <><FaPen className="me-1" /> Zeiten bearbeiten</>}
                      </button>
                    )}
                    {onOwnSupport && canAddSupport?.(ws) && (
                      <button
                        type="button"
                        className="btn btn-sm"
                        title="Eintragen, dass du bei dieser Arbeit unterstützt hast"
                        style={headerButtonStyle}
                        onClick={(e) => {
                          e.stopPropagation()
                          onOwnSupport(ws)
                        }}
                      >
                        <FaHandsHelping className="me-1" />{' '}
                        {parseSupporters(ws.supporters).some((s) => s.employeeId === currentUserId)
                          ? 'Meine Unterstützung bearbeiten'
                          : 'Ich habe unterstützt'}
                      </button>
                    )}
                    {onTogglePlan && !ws.isComment && Number(ws.totalTime) > 0 && (aboHoursAllowed || ws.countsToPlan) && (
                      <button
                        type="button"
                        className="btn btn-sm"
                        title={ws.countsToPlan ? 'Nicht mehr vom Abo-Stundenkonto abziehen' : 'Vom Abo-Stundenkonto des Kunden abziehen'}
                        style={{
                          background: ws.countsToPlan ? '#9d3dfe' : 'rgba(255,255,255,0.15)',
                          color: 'white',
                          border: '1px solid rgba(255,255,255,0.4)',
                          borderRadius: '6px',
                          padding: '2px 10px',
                          fontSize: '0.8rem',
                          marginRight: '8px',
                        }}
                        onClick={(e) => {
                          e.stopPropagation()
                          onTogglePlan(ws)
                        }}
                      >
                        {ws.countsToPlan ? '✓ Abo' : '+ Abo'}
                      </button>
                    )}
                    <small style={{ opacity: 0.9 }}>
                      {formatDateTime(ws.startDate, ws.startTime) || formatDateTime(ws.endDate, ws.endTime)}
                    </small>
                  </div>
                </div>
                
                {/* Body - Nur wenn expanded */}
                {isExpanded && (
                  <div 
                    className="card-body p-4"
                    style={{
                      animation: 'slideDown 0.3s ease-out'
                    }}
                  >
                    {/* Mitarbeiter & Zeit */}
                    <div className="row mb-3">
                      <div className="col-md-6">
                        <div className="d-flex align-items-center">
                          <FaUser className="me-2" style={{ color: '#10b981' }} />
                          <strong>{ws.employeeName}</strong>
                          {ws.employeeShort && (
                            <span className="badge ms-2" style={{ 
                              background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                              color: 'white'
                            }}>{ws.employeeShort}</span>
                          )}
                        </div>
                      </div>
                      <div className="col-md-6 text-md-end">
                        {!ws.isComment && (
                          <div className="d-flex align-items-center justify-content-md-end">
                            <FaClock className="me-2" style={{ color: '#10b981' }} />
                            <strong className="fs-5" style={{ color: '#10b981' }}>{formatTime(ws.totalTime)}</strong>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Unterstuetzung: je Person die Haelfte der Arbeitszeit, aufgerundet auf 15 Minuten */}
                    {supporters.length > 0 && (
                      <div className="mb-3 worksheet-supporters">
                        {supporters.map((sup) => (
                          <div key={sup.employeeId} style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                            ↳ Unterstützung {firstName(sup.name)} · {sup.task} · {formatTime(supportMinutes(ws.totalTime))}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Service Type */}
                    <div className="mb-3">
                      <span className="badge px-3 py-2" style={{ 
                        background: 'linear-gradient(135deg, #4a5568 0%, #2d3748 100%)',
                        color: 'white',
                        fontSize: '0.85rem'
                      }}>{serviceTypeLabel(ws.serviceType)}</span>
                    </div>

                    {/* Status-Änderung */}
                    {ws.oldStatus !== ws.newStatus && (
                      <div className="mb-3 p-3 rounded-3" style={{ 
                        background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.1) 0%, rgba(5, 150, 105, 0.1) 100%)'
                      }}>
                        <FaExchangeAlt className="me-2" style={{ color: '#10b981' }} />
                        <span className="text-muted">Status:</span>{' '}
                        <span className="badge" style={{ background: '#6b7280', color: 'white' }}>{statusLabel(ws.oldStatus)}</span>
                        <span className="mx-2" style={{ color: '#10b981' }}>→</span>
                        <span className="badge" style={{ background: '#10b981', color: 'white' }}>{statusLabel(ws.newStatus)}</span>
                      </div>
                    )}

                    {/* Details */}
                    <div className="mt-3 p-3 rounded-3" style={{ 
                      background: 'rgba(16, 185, 129, 0.05)',
                      border: '1px solid rgba(16, 185, 129, 0.1)'
                    }}>
                      <small className="text-dark" style={{ whiteSpace: 'pre-wrap', lineHeight: '1.6' }}>
                        {ws.details}
                      </small>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
      
      <style>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        @keyframes slideDown {
          from {
            opacity: 0;
            max-height: 0;
            transform: translateY(-10px);
          }
          to {
            opacity: 1;
            max-height: 1000px;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  )
}

