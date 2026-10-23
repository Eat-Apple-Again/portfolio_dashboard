import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { fmt_money } from '../lib/format'
import type { ForecastResult } from '../lib/forecast'
import { SERIES_COLORS } from './section_meta'

const SURFACE = '#0f172a'
const GRID = '#1e293b'
const AXIS_TEXT = '#64748b'
const PAD = { top: 12, right: 12, bottom: 24, left: 56 }
const compact = new Intl.NumberFormat('zh-TW', { notation: 'compact', maximumFractionDigits: 1 })

function nice_ticks(min: number, max: number, count = 4): number[] {
  const raw = (max - min) / count || 1
  const mag = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw
  const ticks: number[] = []
  for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) ticks.push(v)
  return ticks
}

/** Fan chart: median line, 25–75% (darker) and 10–90% (lighter) bands, plus cumulative principal */
export function ForecastChart({ result, hide }: { result: ForecastResult; hide: boolean }) {
  const wrap_ref = useRef<HTMLDivElement>(null)
  const [width, set_width] = useState(0)
  const [active, set_active] = useState<number | null>(null)

  useEffect(() => {
    const el = wrap_ref.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => set_width(entry.contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const height = width < 480 ? 240 : 300
  const n = result.p50.length
  const plot_w = Math.max(0, width - PAD.left - PAD.right)
  const plot_h = height - PAD.top - PAD.bottom
  const y_max = Math.max(...result.p90, ...result.contributed) * 1.05
  const ticks = nice_ticks(0, y_max)
  const x = (i: number) => PAD.left + (n <= 1 ? 0 : (i / (n - 1)) * plot_w)
  const y = (v: number) => PAD.top + plot_h - (v / y_max) * plot_h
  const line = (vals: number[]) => vals.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('')
  const band = (lo: number[], hi: number[]) =>
    `${line(hi)}${lo
      .map((v, i) => [i, v] as const)
      .reverse()
      .map(([i, v]) => `L${x(i).toFixed(1)},${y(v).toFixed(1)}`)
      .join('')}Z`

  const years = (n - 1) / 12
  const year_step = years <= 10 ? (years <= 5 ? 1 : 2) : 5
  const year_ticks = Array.from({ length: Math.floor(years / year_step) + 1 }, (_, k) => k * year_step * 12)
  const start_year = result.start_month.getFullYear()

  const index_at = (client_x: number) => {
    const rect = wrap_ref.current!.getBoundingClientRect()
    return Math.max(0, Math.min(n - 1, Math.round(((client_x - rect.left - PAD.left) / (plot_w || 1)) * (n - 1))))
  }
  const on_move = (e: PointerEvent) => set_active(index_at(e.clientX))
  const on_key = (e: KeyboardEvent) => {
    const step = e.shiftKey ? 1 : 12
    if (e.key === 'ArrowLeft') set_active((i) => Math.max(0, (i ?? n - 1) - step))
    else if (e.key === 'ArrowRight') set_active((i) => Math.min(n - 1, (i ?? 0) + step))
    else return
    e.preventDefault()
  }

  const label_of = (i: number) => {
    const d = new Date(result.start_month.getFullYear(), result.start_month.getMonth() + i, 1)
    return `${d.getFullYear()}/${d.getMonth() + 1}（第 ${(i / 12).toFixed(1)} 年）`
  }

  return (
    <div ref={wrap_ref} className="relative w-full select-none" style={{ height }}>
      {width > 0 && n > 1 && (
        <svg
          width={width}
          height={height}
          role="img"
          aria-label="未來資產試算扇形圖，使用左右方向鍵逐年檢視"
          tabIndex={0}
          className="touch-none outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
          onPointerMove={on_move}
          onPointerDown={on_move}
          onPointerLeave={() => set_active(null)}
          onKeyDown={on_key}
          onFocus={() => set_active((i) => i ?? n - 1)}
          onBlur={() => set_active(null)}
        >
          {ticks.map((t) => (
            <g key={t}>
              <line x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} stroke={GRID} strokeWidth={1} />
              <text x={PAD.left - 8} y={y(t)} dy="0.32em" textAnchor="end" fontSize={11} fill={AXIS_TEXT}>
                {hide ? '••' : compact.format(t)}
              </text>
            </g>
          ))}
          {year_ticks.map((i) => (
            <text
              key={i}
              x={x(i)}
              y={height - 6}
              textAnchor={i === 0 ? 'start' : i >= n - 1 ? 'end' : 'middle'}
              fontSize={11}
              fill={AXIS_TEXT}
            >
              {start_year + i / 12}
            </text>
          ))}

          <path d={band(result.p10, result.p90)} fill={SERIES_COLORS[0]} opacity={0.14} />
          <path d={band(result.p25, result.p75)} fill={SERIES_COLORS[0]} opacity={0.28} />
          <path d={line(result.contributed)} fill="none" stroke={SERIES_COLORS[1]} strokeWidth={2} strokeLinejoin="round" />
          <path d={line(result.p50)} fill="none" stroke={SERIES_COLORS[0]} strokeWidth={2} strokeLinejoin="round" />

          {active != null && (
            <g pointerEvents="none">
              <line x1={x(active)} x2={x(active)} y1={PAD.top} y2={PAD.top + plot_h} stroke={AXIS_TEXT} strokeWidth={1} />
              <circle cx={x(active)} cy={y(result.p50[active])} r={4} fill={SERIES_COLORS[0]} stroke={SURFACE} strokeWidth={2} />
            </g>
          )}
        </svg>
      )}

      {active != null && (
        <div
          className="pointer-events-none absolute top-2 min-w-44 rounded-lg bg-slate-800/95 px-3 py-2 text-xs shadow-lg ring-1 ring-white/10"
          style={x(active) > width / 2 ? { right: width - x(active) + 8 } : { left: x(active) + 8 }}
        >
          <p className="mb-1 text-slate-400">{label_of(active)}</p>
          <Row label="樂觀（90%）" value={fmt_money(result.p90[active], 'TWD', hide)} />
          <Row label="偏多（75%）" value={fmt_money(result.p75[active], 'TWD', hide)} />
          <Row color={SERIES_COLORS[0]} label="中位數（50%）" value={fmt_money(result.p50[active], 'TWD', hide)} />
          <Row label="偏空（25%）" value={fmt_money(result.p25[active], 'TWD', hide)} />
          <Row label="悲觀（10%）" value={fmt_money(result.p10[active], 'TWD', hide)} />
          <Row color={SERIES_COLORS[1]} label="累計投入本金" value={fmt_money(result.contributed[active], 'TWD', hide)} />
        </div>
      )}
    </div>
  )
}

function Row({ color, label, value }: { color?: string; label: string; value: string }) {
  return (
    <p className="flex items-center gap-2 py-0.5">
      <span className="inline-block h-0.5 w-3 rounded" style={{ background: color ?? 'transparent' }} />
      <span className="font-semibold tabular-nums text-slate-100">{value}</span>
      <span className="text-slate-400">{label}</span>
    </p>
  )
}
