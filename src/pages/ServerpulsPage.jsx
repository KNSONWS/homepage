import { useCallback, useEffect, useRef, useMemo, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { PageHeader } from '../components/ui'
import { serverpulsApi } from '../lib/serverpulsApi'
import {
  ageLabel, formatBytes, formatNumber, formatPct, formatSince, usedPct,
} from '../lib/serverpulsFormat'
import Chart from '../components/serverpuls/Chart'
import Sparkline from '../components/serverpuls/Sparkline'
import AppsTable from '../components/serverpuls/AppsTable'
import '../styles/serverpuls.css'

const RANGES = [
  { id: '24h', label: '24 h' },
  { id: '7d', label: '7 T' },
  { id: '30d', label: '30 T' },
  { id: '90d', label: '90 T' },
  { id: '1y', label: '1 J' },
]

const METRICS = [
  { id: 'cpu', label: 'CPU', bytes: false, fmt: (v) => formatPct(v) },
  { id: 'load', label: 'Load', bytes: false, fmt: (v) => formatNumber(v, 2) },
  { id: 'ram', label: 'RAM', bytes: true, fmt: formatBytes },
  { id: 'swap', label: 'Swap', bytes: true, fmt: formatBytes },
  { id: 'disk', label: 'Platte', bytes: true, fmt: formatBytes },
  { id: 'zombies', label: 'Zombies', bytes: false, fmt: (v) => formatNumber(v, 0) },
]

const LEVEL_TEXT = { ok: 'Alles ok', medium: 'Warnungen', critical: 'Critical' }
const LEVEL_LABEL = { critical: 'Critical', medium: 'Medium', low: 'Low' }

// Verlaufswerte in Anzeigewerte umrechnen (RAM: frei -> belegt).
function displayPoints(metric, points, total) {
  if (metric !== 'ram') return points
  const tmap = new Map((total || []).map((t) => [t.ts, t.v]))
  return points.map((p) => {
    const t = tmap.get(p.ts)
    if (p.v === null || t === undefined || t === null) return { ts: p.ts, v: null, max: null }
    return { ts: p.ts, v: t - p.v, max: p.max === null || p.max === undefined ? null : t - p.max }
  })
}

function tileModel(key, m) {
  if (!m) return null
  const total = m.total ?? null
  const spark = (m.spark24h || []).map((p) => (key === 'ram' && total && p.v !== null && p.v !== undefined ? total - p.v : p.v))
  if (m.value === null || m.value === undefined) return { main: '–', sub: '', spark, delta: null }
  switch (key) {
    case 'cpu':
      return { main: formatPct(m.value), sub: '', spark, delta: m.deltaYesterday, fmtDelta: (d) => `${formatNumber(Math.abs(d), 1)} %` }
    case 'load':
      return { main: formatNumber(m.value, 2), sub: 'Load (5 Min.)', spark, delta: m.deltaYesterday, fmtDelta: (d) => formatNumber(Math.abs(d), 2) }
    case 'ram': {
      const used = total ? total - m.value : null
      return {
        main: used === null ? '–' : formatPct(usedPct(m.value, total)),
        sub: used === null ? '' : `${formatBytes(used)} von ${formatBytes(total)}`,
        spark,
        delta: m.deltaYesterday === null || m.deltaYesterday === undefined ? null : -m.deltaYesterday,
        fmtDelta: (d) => formatBytes(Math.abs(d)),
      }
    }
    case 'swap':
    case 'disk':
      return {
        main: total ? formatPct((m.value / total) * 100) : formatBytes(m.value),
        sub: total ? `${formatBytes(m.value)} von ${formatBytes(total)}` : '',
        spark,
        delta: m.deltaYesterday,
        fmtDelta: (d) => formatBytes(Math.abs(d)),
      }
    default:
      return { main: formatNumber(m.value, 0), sub: '', spark, delta: m.deltaYesterday, fmtDelta: (d) => formatNumber(Math.abs(d), 0) }
  }
}

function Tile({ id, label, model }) {
  let deltaEl = null
  if (model && model.delta !== null && model.delta !== undefined) {
    const d = model.delta
    const dir = Math.abs(d) < 1e-9 ? 'flat' : d > 0 ? 'up' : 'down'
    const sign = dir === 'up' ? '▲ +' : dir === 'down' ? '▼ −' : ''
    deltaEl = (
      <div className={`sp-tile-delta sp-delta-${dir}`}>
        {sign}{model.fmtDelta(d)} ggü. gestern
      </div>
    )
  }
  return (
    <div className="sp-tile" data-testid={`sp-tile-${id}`}>
      <div className="sp-tile-label">{label}</div>
      <div className="sp-tile-value">{model ? model.main : '–'}</div>
      <div className="sp-tile-sub">{model?.sub || ' '}</div>
      <Sparkline points={model?.spark || []} width={200} height={36} />
      {deltaEl}
    </div>
  )
}

function Pills({ items, value, onChange, testid }) {
  return (
    <div className="sp-pills" data-testid={testid}>
      {items.map((it) => (
        <button
          key={it.id}
          type="button"
          className={`sp-pill ${value === it.id ? 'active' : ''}`}
          onClick={() => onChange(it.id)}
        >
          {it.label}
        </button>
      ))}
    </div>
  )
}

function Cleanup({ data }) {
  if (!data || !data.day) return <div className="sp-muted">Noch keine Messung.</div>
  const stopped = Array.isArray(data.stopped) ? data.stopped : []
  return (
    <div className="sp-cleanup-body">
      <div className="sp-cleanup-grid">
        <div><span className="sp-muted">Ungenutzte Images</span><strong>{formatBytes(data.imagesBytes)}</strong></div>
        <div><span className="sp-muted">Build-Cache</span><strong>{formatBytes(data.buildCacheBytes)}</strong></div>
        <div><span className="sp-muted">Gestoppte Container</span><strong>{formatBytes(data.stoppedBytes)}</strong></div>
      </div>
      {stopped.length > 0 && (
        <ul className="sp-cleanup-list">
          {stopped.map((s) => (
            <li key={s.name}><span>{s.name}</span><span>{formatBytes(s.bytes)}</span></li>
          ))}
        </ul>
      )}
      <div className="sp-muted sp-small">Stand {data.day} · nur Anzeige, hier wird nichts gelöscht.</div>
    </div>
  )
}

export default function ServerpulsPage() {
  const { isAdmin, loading } = useAuth()
  const [overview, setOverview] = useState(null)
  const [appsData, setAppsData] = useState(null)
  const [cleanup, setCleanup] = useState(null)
  const [chart, setChart] = useState(null)
  const [detail, setDetail] = useState(null)
  const [metric, setMetric] = useState('cpu')
  const [range, setRange] = useState('24h')
  const [selected, setSelected] = useState(null)
  const [detailRange, setDetailRange] = useState('30d')
  const [error, setError] = useState('')
  const [now, setNow] = useState(Date.now())
  const [tick, setTick] = useState(0)

  // Uebersicht, Projekte, Aufraeumbar: beim Laden und jede Minute (nur sichtbar)
  const reqId = useRef(0)
  const loadMain = useCallback(async () => {
    reqId.current += 1
    const mine = reqId.current
    try {
      const [o, a, c] = await Promise.all([
        serverpulsApi.overview(), serverpulsApi.apps(), serverpulsApi.cleanup(),
      ])
      if (mine !== reqId.current) return
      setOverview(o)
      setAppsData(a)
      setCleanup(c)
      setError('')
    } catch (e) {
      if (mine !== reqId.current) return
      setError(e.message || 'Serverpuls ist nicht erreichbar.')
    }
    setNow(Date.now())
    setTick((t) => t + 1)
  }, [])

  useEffect(() => {
    if (!isAdmin) return undefined
    loadMain()
    const iv = setInterval(() => {
      if (document.visibilityState === 'visible') loadMain()
    }, 60000)
    const onVis = () => { if (document.visibilityState === 'visible') loadMain() }
    document.addEventListener('visibilitychange', onVis)
    return () => { clearInterval(iv); document.removeEventListener('visibilitychange', onVis) }
  }, [isAdmin, loadMain])

  // grosses Diagramm
  useEffect(() => {
    if (!isAdmin) return undefined
    let dead = false
    serverpulsApi.host(metric, range)
      .then((d) => { if (!dead) { setChart({ ...d, metric, range }); } })
      .catch((e) => { if (!dead) { setChart(null); setError(e.message || 'Diagramm konnte nicht geladen werden.') } })
    return () => { dead = true }
  }, [isAdmin, metric, range, tick])

  // Detaildiagramm der App
  useEffect(() => {
    if (!isAdmin || !selected) { setDetail(null); return undefined }
    let dead = false
    serverpulsApi.app(selected, detailRange)
      .then((d) => { if (!dead) setDetail(d) })
      .catch((e) => { if (!dead) { setDetail(null); setError(e.message || 'Projektdaten konnten nicht geladen werden.') } })
    return () => { dead = true }
  }, [isAdmin, selected, detailRange, tick])

  const changeMetric = (v) => { if (v !== metric) { setChart(null); setMetric(v) } }
  const changeRange = (v) => { if (v !== range) { setChart(null); setRange(v) } }
  const selectApp = (id) => { setDetail(null); setSelected(id) }
  const changeDetailRange = (v) => { if (v !== detailRange) { setDetail(null); setDetailRange(v) } }

  const m = METRICS.find((x) => x.id === metric)

  const chartData = useMemo(() => {
    if (!chart) return null
    const pts = displayPoints(chart.metric, chart.points || [], chart.total)
    const xs = pts.map((p) => Math.round(p.ts / 1000))
    const avg = pts.map((p) => p.v)
    const withMax = chart.res !== 'raw' && ['cpu', 'load', 'zombies'].includes(chart.metric)
    const data = [xs, avg]
    const series = [{ label: m.label, color: '#10b981', fill: 'rgba(16,185,129,0.10)' }]
    if (withMax) {
      data.push(pts.map((p) => p.max ?? null))
      series.push({ label: `${m.label} (Spitze)`, color: '#f59e0b', dash: [4, 4] })
    }
    return { data, series }
  }, [chart, m.label])

  const detailData = useMemo(() => {
    if (!detail) return null
    const days = (detail.size || []).map((s) => Math.round(new Date(`${s.day}T12:00:00Z`).getTime() / 1000))
    return {
      size: { data: [days, (detail.size || []).map((s) => s.bytes)], series: [{ label: 'Größe', color: '#3b82f6', fill: 'rgba(59,130,246,0.10)' }] },
      mem: { data: [(detail.mem || []).map((p) => Math.round(p.ts / 1000)), (detail.mem || []).map((p) => p.v)], series: [{ label: 'RAM', color: '#10b981' }] },
      cpu: { data: [(detail.cpu || []).map((p) => Math.round(p.ts / 1000)), (detail.cpu || []).map((p) => p.v)], series: [{ label: 'CPU', color: '#f59e0b' }] },
    }
  }, [detail])

  if (loading) return null
  if (!isAdmin) return <Navigate to="/tickets" replace />

  const level = overview?.level || 'ok'
  const alerts = overview?.alerts || []
  const age = ageLabel(overview?.lastSample ?? null, now)
  const dot = level === 'critical' ? '🔴' : level === 'medium' ? '🟠' : '🟢'
  const headline = level === 'ok'
    ? 'Alles ok'
    : level === 'critical'
      ? `Critical – ${alerts.length} ${alerts.length === 1 ? 'Warnung' : 'Warnungen'}`
      : `${alerts.length} ${alerts.length === 1 ? 'Warnung' : 'Warnungen'}`

  return (
    <div className="page sp-page" data-testid="sp-page">
      <PageHeader title="Serverpuls" subtitle="Zustand und Verlauf des Servers – nur Anzeige" />

      {error && <div className="sp-error" data-testid="sp-error" role="alert">{error}</div>}

      <section className={`sp-head sp-level-${level}`} data-testid="sp-head">
        <div className="sp-head-top">
          <span className="sp-ampel" data-testid="sp-ampel" data-level={level}>{dot}</span>
          <strong className="sp-headline">{overview ? headline : (error ? 'Keine Daten' : 'Lädt …')}</strong>
          {overview && (
            <span className={`sp-age ${age.stale ? 'sp-age-stale' : ''}`} data-testid="sp-age" data-stale={age.stale ? '1' : '0'}>
              Letzte Messung {age.text}{age.stale ? ' – Daten veraltet' : ''}
            </span>
          )}
        </div>
        {alerts.length > 0 && (
          <ul className="sp-alerts" data-testid="sp-alerts">
            {alerts.map((a) => (
              <li key={a.id} className={`sp-alert sp-alert-${a.level}`} data-testid="sp-alert">
                <span className="sp-alert-level">{LEVEL_LABEL[a.level] || a.level}</span>
                <span className="sp-alert-title">{a.title}</span>
                <span className="sp-alert-value">{a.value}</span>
                <span className="sp-muted sp-small">seit {formatSince(a.since)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="sp-tiles" data-testid="sp-tiles">
        {METRICS.map((x) => (
          <Tile key={x.id} id={x.id} label={x.label} model={tileModel(x.id, overview?.host?.[x.id])} />
        ))}
      </section>

      <section className="sp-panel" data-testid="sp-chart-panel">
        <div className="sp-panel-head">
          <h3>Verlauf</h3>
          <div className="sp-controls">
            <Pills items={METRICS} value={metric} onChange={changeMetric} testid="sp-metric-select" />
            <Pills items={RANGES} value={range} onChange={changeRange} testid="sp-range-select" />
          </div>
        </div>
        {chartData && chartData.data[0].length > 0
          ? <Chart data={chartData.data} series={chartData.series} yFmt={m.fmt} />
          : <div className="sp-muted sp-nodata">{chart ? 'Für diesen Zeitraum liegen keine Messwerte vor.' : 'Lädt …'}</div>}
      </section>

      <section className="sp-panel" data-testid="sp-projects">
        <div className="sp-panel-head">
          <h3>Projekte</h3>
          {appsData?.sizesDay && <span className="sp-muted sp-small">Größen von {appsData.sizesDay}</span>}
        </div>
        <AppsTable rows={appsData?.rows || []} selectedId={selected} onSelect={selectApp} />
        {selected && (
          <div className="sp-detail" data-testid="sp-detail">
            <div className="sp-panel-head">
              <h3>{detail?.name || selected}</h3>
              <Pills items={RANGES} value={detailRange} onChange={changeDetailRange} testid="sp-detail-range" />
            </div>
            {detailData ? (
              <div className="sp-detail-charts">
                <div><div className="sp-chart-title">Größe</div><Chart data={detailData.size.data} series={detailData.size.series} yFmt={formatBytes} height={200} /></div>
                <div><div className="sp-chart-title">RAM</div><Chart data={detailData.mem.data} series={detailData.mem.series} yFmt={formatBytes} height={200} /></div>
                <div><div className="sp-chart-title">CPU</div><Chart data={detailData.cpu.data} series={detailData.cpu.series} yFmt={(v) => formatPct(v)} height={200} /></div>
              </div>
            ) : <div className="sp-muted sp-nodata">Lädt …</div>}
          </div>
        )}
      </section>

      <section className="sp-panel" data-testid="sp-cleanup">
        <div className="sp-panel-head"><h3>Aufräumbar</h3></div>
        <Cleanup data={cleanup} />
      </section>
    </div>
  )
}
