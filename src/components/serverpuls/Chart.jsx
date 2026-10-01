import { useEffect, useRef } from 'react'
import uPlot from 'uplot'
import { formatAxisTick, formatLegendTime } from '../../lib/serverpulsFormat'
import 'uplot/dist/uPlot.min.css'

/**
 * Duenner uPlot-Wrapper.
 * data: [xs (Sekunden), ys...]; series: [{label, color, fmt}] fuer die y-Reihen.
 */
export default function Chart({ data, series, height = 280, yFmt, yRange }) {
  const host = useRef(null)
  const plot = useRef(null)
  const cfg = useRef({ series, yFmt, yRange })
  cfg.current = { series, yFmt, yRange }

  useEffect(() => {
    const el = host.current
    const { series: s, yFmt: fy, yRange: yr } = cfg.current
    const fmtVal = (v) => (v === null || v === undefined ? '–' : (fy ? fy(v) : String(v)))
    const opts = {
      width: Math.max(el.clientWidth, 200),
      height,
      cursor: { drag: { x: false, y: false } },
      legend: { live: true },
      scales: { y: { range: yr || ((u, min, max) => [Math.min(0, min), max === min ? min + 1 : max + (max - min) * 0.08]) } },
      axes: [
        {
          stroke: '#9aa7b4',
          grid: { stroke: 'rgba(255,255,255,0.06)' },
          ticks: { stroke: 'rgba(255,255,255,0.1)' },
          values: (u, splits, axisIdx, foundSpace, foundIncr) => splits.map((t) => formatAxisTick(t, foundIncr)),
        },
        {
          stroke: '#9aa7b4',
          grid: { stroke: 'rgba(255,255,255,0.06)' },
          ticks: { stroke: 'rgba(255,255,255,0.1)' },
          size: 70,
          values: (u, vals) => vals.map(fmtVal),
        },
      ],
      series: [
        { label: 'Zeit', value: (u, v) => formatLegendTime(v) },
        ...s.map((x) => ({
          label: x.label,
          stroke: x.color || '#10b981',
          width: 2,
          spanGaps: false,
          points: { show: false },
          fill: x.fill,
          dash: x.dash,
          value: (u, v) => fmtVal(v),
        })),
      ],
    }
    plot.current = new uPlot(opts, data, el)
    const ro = new ResizeObserver(() => {
      if (plot.current) plot.current.setSize({ width: Math.max(el.clientWidth, 200), height })
    })
    ro.observe(el)
    return () => {
      ro.disconnect()
      plot.current?.destroy()
      plot.current = null
    }
    // Neu aufbauen nur wenn sich Reihenanzahl/Beschriftung aendert
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [series.map((x) => x.label).join('|'), height])

  useEffect(() => {
    plot.current?.setData(data)
  }, [data])

  return <div className="sp-chart" data-testid="sp-chart" ref={host} />
}
