// Winzige Inline-SVG-Minikurve. points: Zahlen oder {v}/{bytes}; null-Werte erzeugen Luecken.
export default function Sparkline({ points = [], width = 120, height = 32, color = 'var(--accent)' }) {
  const vals = points.map((p) =>
    p === null || p === undefined ? null : typeof p === 'number' ? p : (p.v ?? p.bytes ?? null)
  )
  const nums = vals.filter((v) => v !== null)
  if (nums.length < 2) {
    return <svg className="sp-spark" width={width} height={height} aria-hidden="true" />
  }
  const min = Math.min(...nums)
  const max = Math.max(...nums)
  const span = max - min || 1
  const step = width / (vals.length - 1)
  let d = ''
  let pen = false
  vals.forEach((v, i) => {
    if (v === null) {
      pen = false
      return
    }
    const x = (i * step).toFixed(1)
    const y = (height - 2 - ((v - min) / span) * (height - 4)).toFixed(1)
    d += `${pen ? 'L' : 'M'}${x} ${y} `
    pen = true
  })
  return (
    <svg className="sp-spark" width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <path d={d} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}
