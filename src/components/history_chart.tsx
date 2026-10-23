import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { fmt_money, fmt_signed_money } from '../lib/format'
import type { HistoryPoint } from '../lib/history'
import { SERIES_COLORS } from './section_meta'

const SURFACE = '#0f172a'
const GRID = '#1e293b'
const AXIS_TEXT = '#64748b'

const PAD = { top: 12, right: 12, bottom: 24, left: 56 }
const compact = new Intl.NumberFormat('zh-TW', { notation: 'compact', maximumFractionDigits: 1 })

export type ChartMode = 'total' | 'stacked'

interface Props {
  points: HistoryPoint[]
  mode: ChartMode
  groups: string[]
  hide: boolean
}

function nice_ticks(min: number, max: number, count = 4): number[] {
  if (max === min) return [min]
  const raw = (max - min) / count
  const mag = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw
  const ticks: number[] = []
  for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) ticks.push(v)
  return ticks
}

function short_date(key: string): string {
  return `${Number(key.slice(5, 7))}/${Number(key.slice(8, 10))}`
}

export function HistoryChart({ points, mode, groups, hide }: Props) {
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

  const height = width < 480 ? 220 : 280
  const n = points.length
  const plot_w = Math.max(0, width - PAD.left - PAD.right)
  const plot_h = height - PAD.top - PAD.bottom

  // Stacked bands: cumulative sums in group order (bottom = first group)
  const stacks = points.map((p) => {
    let acc = 0
    return groups.map((g) => {
      const lo = acc
      acc += p.groups[g] ?? 0
      return [lo, acc] as const
    })
  })

  const values =
    mode === 'total' ? points.flatMap((p) => [p.total, p.net_invested]) : stacks.map((s) => s[s.length - 1]?.[1] ?? 0)
  let y_min = mode === 'stacked' ? 0 : Math.min(...values)
  let y_max = Math.max(...values)
  const span = y_max - y_min || Math.abs(y_max) * 0.02 || 1
  if (mode === 'total') y_min -= span * 0.1
  y_max += span * 0.1
  const ticks = nice_ticks(y_min, y_max)

  const x = (i: number) => PAD.left + (n <= 1 ? plot_w / 2 : (i / (n - 1)) * plot_w)
  const y = (v: number) => PAD.top + plot_h - ((v - y_min) / (y_max - y_min)) * plot_h
  const line = (vals: number[]) => vals.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('')

  const x_ticks = n <= 1 ? [0] : [...new Set([0, Math.round((n - 1) / 3), Math.round((2 * (n - 1)) / 3), n - 1])]

  const index_at = (client_x: number) => {
    const rect = wrap_ref.current!.getBoundingClientRect()
    const rel = (client_x - rect.left - PAD.left) / (plot_w || 1)
    return Math.max(0, Math.min(n - 1, Math.round(rel * (n - 1))))
  }
  const on_move = (e: PointerEvent) => set_active(index_at(e.clientX))
  const on_key = (e: KeyboardEvent) => {
    if (e.key === 'ArrowLeft') set_active((i) => Math.max(0, (i ?? n - 1) - 1))
    else if (e.key === 'ArrowRight') set_active((i) => Math.min(n - 1, (i ?? 0) + 1))
    else return
    e.preventDefault()
  }

  const ap = active != null ? points[active] : null
  const tip_left = active != null && x(active) > width / 2

  const gap = mode === 'total' ? gap_paths(points, x, y) : { gain: '', loss: '' }

  return (
    <div ref={wrap_ref} className="relative w-full select-none" style={{ height }}>
      {width > 0 && n > 0 && (
        <svg
          width={width}
          height={height}
          role="img"
          aria-label="資產走勢圖，使用左右方向鍵檢視每日數值"
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
          {x_ticks.map((i) => (
            <text
              key={i}
              x={x(i)}
              y={height - 6}
              textAnchor={n <= 1 ? 'middle' : i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}
              fontSize={11}
              fill={AXIS_TEXT}
            >
              {short_date(points[i].key)}
            </text>
          ))}

          {mode === 'total' ? (
            <>
              {/* Gap between the two lines = cumulative investment P&L, colored by sign */}
              <path d={gap.gain} style={{ fill: 'var(--gain)' }} opacity={0.3} />
              <path d={gap.loss} style={{ fill: 'var(--loss)' }} opacity={0.3} />
              <path d={line(points.map((p) => p.net_invested))} fill="none" stroke={SERIES_COLORS[1]} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
              <path d={line(points.map((p) => p.total))} fill="none" stroke={SERIES_COLORS[0]} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            </>
          ) : (
            groups.map((g, k) => {
              const top = stacks.map((s) => s[k][1])
              const bottom = stacks.map((s) => s[k][0])
              const d = `${line(top)}${bottom
                .map((v, i) => [i, v] as const)
                .reverse()
                .map(([i, v]) => `L${x(i).toFixed(1)},${y(v).toFixed(1)}`)
                .join('')}Z`
              // Surface-colored top edge = the 2px gap between stacked bands
              return (
                <g key={g}>
                  <path d={d} fill={SERIES_COLORS[k % SERIES_COLORS.length]} opacity={0.85} />
                  <path d={line(top)} fill="none" stroke={SURFACE} strokeWidth={2} />
                </g>
              )
            })
          )}

          {n === 1 && mode === 'total' && (
            <circle cx={x(0)} cy={y(points[0].total)} r={4} fill={SERIES_COLORS[0]} stroke={SURFACE} strokeWidth={2} />
          )}

          {ap && active != null && (
            <g pointerEvents="none">
              <line x1={x(active)} x2={x(active)} y1={PAD.top} y2={PAD.top + plot_h} stroke={AXIS_TEXT} strokeWidth={1} />
              {mode === 'total' && (
                <>
                  <circle cx={x(active)} cy={y(ap.net_invested)} r={4} fill={SERIES_COLORS[1]} stroke={SURFACE} strokeWidth={2} />
                  <circle cx={x(active)} cy={y(ap.total)} r={4} fill={SERIES_COLORS[0]} stroke={SURFACE} strokeWidth={2} />
                </>
              )}
            </g>
          )}
        </svg>
      )}

      {ap && active != null && (
        <div
          className="pointer-events-none absolute top-2 min-w-40 rounded-lg bg-slate-800/95 px-3 py-2 text-xs shadow-lg ring-1 ring-white/10"
          style={tip_left ? { right: width - x(active) + 8 } : { left: x(active) + 8 }}
        >
          <p className="mb-1 text-slate-400">{ap.key}</p>
          {mode === 'total' ? (
            <>
              <TipRow color={SERIES_COLORS[0]} label="投資總值" value={fmt_money(ap.total, 'TWD', hide)} />
              <TipRow color={SERIES_COLORS[1]} label="淨投入" value={fmt_money(ap.net_invested, 'TWD', hide)} />
              <TipRow label="累計投資損益" value={fmt_signed_money(ap.total - ap.net_invested, 'TWD', hide)} />
              {ap.flow !== 0 && <TipRow label="當日轉入" value={fmt_signed_money(ap.flow, 'TWD', hide)} />}
            </>
          ) : (
            <>
              {[...groups].reverse().map((g) => (
                <TipRow
                  key={g}
                  color={SERIES_COLORS[groups.indexOf(g) % SERIES_COLORS.length]}
                  label={g}
                  value={fmt_money(ap.groups[g] ?? 0, 'TWD', hide)}
                />
              ))}
              <TipRow label="合計" value={fmt_money(ap.total, 'TWD', hide)} />
            </>
          )}
        </div>
      )}
    </div>
  )
}

/** Value first (strong), label secondary, short line key for identity */
function TipRow({ color, label, value }: { color?: string; label: string; value: string }) {
  return (
    <p className="flex items-center gap-2 py-0.5">
      <span className="inline-block h-0.5 w-3 rounded" style={{ background: color ?? 'transparent' }} />
      <span className="font-semibold tabular-nums text-slate-100">{value}</span>
      <span className="text-slate-400">{label}</span>
    </p>
  )
}

/**
 * Areas where total is above (gain) or below (loss) net invested. Crossing points are interpolated
 * so each area closes exactly where the lines meet.
 */
function gap_paths(points: HistoryPoint[], x: (i: number) => number, y: (v: number) => number) {
  const pts: { i: number; total: number; net: number }[] = []
  points.forEach((p, i) => {
    if (i > 0) {
      const a = points[i - 1].total - points[i - 1].net_invested
      const b = p.total - p.net_invested
      if (a * b < 0) {
        const t = a / (a - b)
        const net = points[i - 1].net_invested + t * (p.net_invested - points[i - 1].net_invested)
        pts.push({ i: i - 1 + t, total: net, net })
      }
    }
    pts.push({ i, total: p.total, net: p.net_invested })
  })
  const area = (upper: (q: (typeof pts)[number]) => number) =>
    pts.length < 2
      ? ''
      : pts.map((q, k) => `${k ? 'L' : 'M'}${x(q.i).toFixed(1)},${y(upper(q)).toFixed(1)}`).join('') +
        [...pts]
          .reverse()
          .map((q) => `L${x(q.i).toFixed(1)},${y(q.net).toFixed(1)}`)
          .join('') +
        'Z'
  return {
    gain: area((q) => Math.max(q.total, q.net)),
    loss: area((q) => Math.min(q.total, q.net)),
  }
}
