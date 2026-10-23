import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { fmt_money } from '../lib/format'
import type { ForecastResult } from '../lib/forecast'

const SURFACE = '#0f172a'
const GRID = '#1e293b'
const AXIS_TEXT = '#64748b'
const PRINCIPAL = '#94a3b8'
const PAD = { top: 12, right: 12, bottom: 24, left: 56 }
// Room for the end-of-horizon probability labels in the fan chart
const LABEL_W = 92
const LABEL_GAP = 13
const compact = new Intl.NumberFormat('zh-TW', { notation: 'compact', maximumFractionDigits: 1 })

export interface ChartSeries {
  key: string
  label: string
  color: string
  result: ForecastResult
}

function nice_ticks(min: number, max: number, count = 4): number[] {
  const raw = (max - min) / count || 1
  const mag = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw
  const ticks: number[] = []
  for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) ticks.push(v)
  return ticks
}

/**
 * One series: fan chart (median, 25–75% and 10–90% bands, cumulative principal) with
 * end-of-horizon probability labels. Several series: median line + 25–75% band each.
 */
export function ForecastChart({ series, hide }: { series: ChartSeries[]; hide: boolean }) {
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

  const single = series.length === 1 ? series[0] : null
  const height = width < 480 ? 240 : 300
  const n = series[0]?.result.p50.length ?? 0
  const pad_right = single ? LABEL_W : PAD.right
  const plot_w = Math.max(0, width - PAD.left - pad_right)
  const plot_h = height - PAD.top - PAD.bottom
  // Scale to what is drawn: the outer band for one series, the inner bands for several
  const peak = single
    ? Math.max(...single.result.p90, ...single.result.contributed)
    : Math.max(0, ...series.map((s) => Math.max(...s.result.p75)))
  const y_max = (peak || 1) * 1.05
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
  const year_step = years <= 10 ? (years <= 5 ? 1 : 2) : years <= 20 ? 5 : 10
  const year_ticks = Array.from({ length: Math.floor(years / year_step) + 1 }, (_, k) => k * year_step * 12)

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

  const start_month = series[0]?.result.start_month
  const label_of = (i: number) => {
    const d = new Date(start_month!.getFullYear(), start_month!.getMonth() + i, 1)
    return `${d.getFullYear()}/${d.getMonth() + 1}（第 ${(i / 12).toFixed(1)} 年）`
  }

  const idx = active != null ? Math.min(active, n - 1) : null

  return (
    <div ref={wrap_ref} className="relative w-full select-none" style={{ height }}>
      {series.length === 0 && (
        <p className="flex h-full items-center justify-center text-sm text-slate-500">點選上方標籤以顯示試算線</p>
      )}
      {width > 0 && n > 1 && (
        <svg
          width={width}
          height={height}
          role="img"
          aria-label="未來資產試算圖，使用左右方向鍵逐年檢視"
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
              <line x1={PAD.left} x2={width - pad_right} y1={y(t)} y2={y(t)} stroke={GRID} strokeWidth={1} />
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
              {start_month!.getFullYear() + i / 12}
            </text>
          ))}

          {single ? (
            <>
              <path d={band(single.result.p10, single.result.p90)} fill={single.color} opacity={0.14} />
              <path d={band(single.result.p25, single.result.p75)} fill={single.color} opacity={0.28} />
              <path d={line(single.result.contributed)} fill="none" stroke={PRINCIPAL} strokeWidth={2} strokeDasharray="5 4" />
              <path d={line(single.result.p50)} fill="none" stroke={single.color} strokeWidth={2} strokeLinejoin="round" />
            </>
          ) : (
            <>
              {series.map((s) => (
                <path key={`band-${s.key}`} d={band(s.result.p25, s.result.p75)} fill={s.color} opacity={0.14} />
              ))}
              {series.map((s) => (
                <path key={s.key} d={line(s.result.p50)} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" />
              ))}
            </>
          )}
          {single && <EndLabels result={single.result} x={x(n - 1) + 6} y={y} top={PAD.top} bottom={PAD.top + plot_h} hide={hide} />}

          {idx != null && (
            <g pointerEvents="none">
              <line x1={x(idx)} x2={x(idx)} y1={PAD.top} y2={PAD.top + plot_h} stroke={AXIS_TEXT} strokeWidth={1} />
              {series.map((s) => (
                <circle key={s.key} cx={x(idx)} cy={y(s.result.p50[idx])} r={4} fill={s.color} stroke={SURFACE} strokeWidth={2} />
              ))}
            </g>
          )}
        </svg>
      )}

      {idx != null && series.length > 0 && (
        <div
          className="pointer-events-none absolute top-2 min-w-44 rounded-lg bg-slate-800/95 px-3 py-2 text-xs shadow-lg ring-1 ring-white/10"
          style={x(idx) > width / 2 ? { right: width - x(idx) + 8 } : { left: x(idx) + 8 }}
        >
          <p className="mb-1 text-slate-400">{label_of(idx)}</p>
          {single ? (
            <>
              <Row label="樂觀（90%）" value={fmt_money(single.result.p90[idx], 'TWD', hide)} />
              <Row label="偏多（75%）" value={fmt_money(single.result.p75[idx], 'TWD', hide)} />
              <Row color={single.color} label="中位數（50%）" value={fmt_money(single.result.p50[idx], 'TWD', hide)} />
              <Row label="偏空（25%）" value={fmt_money(single.result.p25[idx], 'TWD', hide)} />
              <Row label="悲觀（10%）" value={fmt_money(single.result.p10[idx], 'TWD', hide)} />
              <Row color={PRINCIPAL} label="累計投入本金" value={fmt_money(single.result.contributed[idx], 'TWD', hide)} />
            </>
          ) : (
            <>
              <p className="mb-0.5 text-slate-500">中位數（25%～75%）</p>
              {series.map((s) => (
                <Row
                  key={s.key}
                  color={s.color}
                  label={`${s.label}（${hide ? '••' : compact.format(s.result.p25[idx])}～${hide ? '••' : compact.format(s.result.p75[idx])}）`}
                  value={fmt_money(s.result.p50[idx], 'TWD', hide)}
                />
              ))}
            </>
          )}
        </div>
      )}
    </div>
  )
}

function Row({ color, label, value }: { color?: string; label: string; value: string }) {
  return (
    <p className="flex items-center gap-2 py-0.5">
      <span className="inline-block h-0.5 w-3 shrink-0 rounded" style={{ background: color ?? 'transparent' }} />
      <span className="font-semibold tabular-nums text-slate-100">{value}</span>
      <span className="truncate text-slate-400">{label}</span>
    </p>
  )
}

/**
 * "N% ≥ value" at the right edge of the fan: p10 means a 90% chance to end at or above it.
 * Labels are nudged apart so close bands never overlap.
 */
function EndLabels({
  result,
  x,
  y,
  top,
  bottom,
  hide,
}: {
  result: ForecastResult
  x: number
  y: (v: number) => number
  top: number
  bottom: number
  hide: boolean
}) {
  const end = result.p50.length - 1
  const items = (
    [
      ['p90', 10],
      ['p75', 25],
      ['p50', 50],
      ['p25', 75],
      ['p10', 90],
    ] as const
  ).map(([q, chance]) => ({ chance, value: result[q][end], pos: y(result[q][end]) }))
  // Top to bottom: push down to keep a minimum gap, then back up if the last one overflows
  for (let i = 1; i < items.length; i++) items[i].pos = Math.max(items[i].pos, items[i - 1].pos + LABEL_GAP)
  const overflow = items[items.length - 1].pos - bottom
  if (overflow > 0) items.forEach((it) => (it.pos = Math.max(top, it.pos - overflow)))
  return (
    <g fontSize={11}>
      {items.map((it) => (
        <text key={it.chance} x={x} y={it.pos} dy="0.32em" fill={it.chance === 50 ? '#e2e8f0' : AXIS_TEXT}>
          {it.chance}% ≥ {hide ? '••' : compact.format(it.value)}
        </text>
      ))}
    </g>
  )
}
