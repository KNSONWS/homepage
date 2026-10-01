import { useMemo, useState } from 'react'
import { formatBytes, formatDelta, formatPct } from '../../lib/serverpulsFormat'
import Sparkline from './Sparkline'

const COLS = [
  { key: 'name', label: 'Projekt', get: (r) => r.name.toLowerCase() },
  { key: 'sizeBytes', label: 'Größe', get: (r) => r.sizeBytes },
  { key: 'delta7d', label: 'Δ 7 T', get: (r) => r.delta7d },
  { key: 'delta30d', label: 'Δ 30 T', get: (r) => r.delta30d },
  { key: 'cpuPct', label: 'CPU', get: (r) => r.cpuPct },
  { key: 'memBytes', label: 'RAM', get: (r) => r.memBytes },
]

function Delta({ pct }) {
  const d = formatDelta(pct)
  const arrow = d.dir === 'up' ? '▲ ' : d.dir === 'down' ? '▼ ' : ''
  return <span className={`sp-delta sp-delta-${d.dir}`}>{arrow}{d.text}</span>
}

export default function AppsTable({ rows, selectedId, onSelect }) {
  const [q, setQ] = useState('')
  const [sort, setSort] = useState({ key: 'sizeBytes', dir: 'desc' })

  const list = useMemo(() => {
    const col = COLS.find((c) => c.key === sort.key)
    const f = q.trim().toLowerCase()
    const out = rows.filter((r) => !f || r.name.toLowerCase().includes(f) || r.id.includes(f))
    const mul = sort.dir === 'asc' ? 1 : -1
    out.sort((a, b) => {
      const va = col.get(a)
      const vb = col.get(b)
      if (va === null || va === undefined) return vb === null || vb === undefined ? 0 : 1
      if (vb === null || vb === undefined) return -1
      return va < vb ? -mul : va > vb ? mul : 0
    })
    return out
  }, [rows, q, sort])

  const toggle = (key) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: key === 'name' ? 'asc' : 'desc' }))

  return (
    <div className="sp-apps" data-testid="sp-apps">
      <input
        className="sp-search"
        data-testid="sp-apps-search"
        type="search"
        placeholder="Projekt suchen …"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      <div className="sp-table-wrap">
        <table className="sp-table">
          <thead>
            <tr>
              {COLS.map((c) => (
                <th key={c.key} onClick={() => toggle(c.key)} className="sp-sortable" data-sort={c.key}>
                  {c.label}{sort.key === c.key ? (sort.dir === 'asc' ? ' ↑' : ' ↓') : ''}
                </th>
              ))}
              <th>30 Tage</th>
            </tr>
          </thead>
          <tbody>
            {list.map((r) => (
              <tr
                key={r.id}
                data-testid="sp-app-row"
                data-app-id={r.id}
                className={`sp-row ${selectedId === r.id ? 'sp-row-active' : ''}`}
                onClick={() => onSelect(selectedId === r.id ? null : r.id)}
              >
                <td className="sp-name">{r.name}</td>
                <td>{formatBytes(r.sizeBytes)}</td>
                <td><Delta pct={r.delta7d} /></td>
                <td><Delta pct={r.delta30d} /></td>
                <td>{r.cpuPct === null ? '–' : formatPct(r.cpuPct)}</td>
                <td>{formatBytes(r.memBytes)}</td>
                <td><Sparkline points={r.spark30d} width={90} height={24} /></td>
              </tr>
            ))}
            {list.length === 0 && (
              <tr><td colSpan={7} className="sp-empty">Keine Projekte gefunden.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
