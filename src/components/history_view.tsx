import { useMemo, useState } from 'react'
import { fmt_money, fmt_pct, fmt_signed_money, pnl_color } from '../lib/format'
import { build_history, chart_groups, day_key } from '../lib/history'
import type { DailySeries } from '../lib/api'
import type { Portfolio, SheetData } from '../types'
import { HistoryChart, type ChartMode } from './history_chart'
import { Segmented } from './form_fields'
import { SERIES_COLORS } from './section_meta'

type Range = '1M' | '3M' | '6M' | '1Y' | 'ALL'

const RANGES: { value: Range; label: string; months: number | null }[] = [
  { value: '1M', label: '1 個月', months: 1 },
  { value: '3M', label: '3 個月', months: 3 },
  { value: '6M', label: '6 個月', months: 6 },
  { value: '1Y', label: '1 年', months: 12 },
  { value: 'ALL', label: '全部', months: null },
]

interface Props {
  sheet: SheetData
  portfolio: Portfolio
  series: Record<string, DailySeries> | null
  loading: boolean
  error: string | null
  hide: boolean
}

export function HistoryView({ sheet, portfolio, series, loading, error, hide }: Props) {
  const [range, set_range] = useState<Range>('ALL')
  const [mode, set_mode] = useState<ChartMode>('total')
  const [show_table, set_show_table] = useState(false)

  const all_points = useMemo(
    () => (series ? build_history(sheet, series, portfolio) : []),
    [sheet, series, portfolio],
  )

  const months = RANGES.find((r) => r.value === range)!.months
  const points = useMemo(() => {
    const last_key = all_points[all_points.length - 1]?.key
    if (months == null || !last_key) return all_points
    // Range ends at the latest point (today), counted back in calendar months
    const from = new Date(`${last_key}T00:00:00`)
    from.setMonth(from.getMonth() - months)
    const from_key = day_key(from)
    return all_points.filter((p) => p.key >= from_key)
  }, [all_points, months])

  // Stack order (bottom first) also fixes each group's color, so colors follow the entity
  const groups = useMemo(() => chart_groups(sheet, portfolio), [sheet, portfolio])
  const color_of = (g: string) => SERIES_COLORS[groups.indexOf(g) % SERIES_COLORS.length]
  const table_groups = [...groups].reverse()

  if (error) return <p className="rounded-xl bg-rose-950/60 px-4 py-3 text-sm text-rose-300">讀取歷史價格失敗：{error}</p>
  if (!series) return <p className="py-20 text-center text-slate-500">{loading ? '載入歷史價格中…' : '尚無資料'}</p>

  const first = points[0]
  const last = points[points.length - 1]
  const change = first && last ? last.total - first.total : 0
  const flows = points.slice(1).reduce((s, p) => s + p.flow, 0)
  const market = change - flows

  return (
    <div className="space-y-4">
      <div className="max-w-md">
        <Segmented options={RANGES} value={range} on_change={set_range} />
      </div>

      <section className="grid grid-cols-2 gap-3 rounded-2xl bg-slate-900 p-4 sm:grid-cols-4 sm:p-5">
        <Stat label="總資產" value={fmt_money(last?.total ?? 0, 'TWD', hide)} />
        <Stat
          label="期間變化"
          value={fmt_signed_money(change, 'TWD', hide)}
          sub={first?.total ? fmt_pct(change / first.total) : undefined}
          tone={change}
        />
        <Stat label="市場損益" value={fmt_signed_money(market, 'TWD', hide)} tone={market} />
        <Stat label="收入 − 支出" value={fmt_signed_money(flows, 'TWD', hide)} />
      </section>

      <section className="rounded-2xl bg-slate-900 p-4 sm:p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <Legend
            items={
              mode === 'total'
                ? [
                    { label: '總資產', color: SERIES_COLORS[0] },
                    { label: '淨投入（期初 + 收入 − 支出）', color: SERIES_COLORS[1] },
                  ]
                : table_groups.map((g) => ({ label: g, color: color_of(g), box: true }))
            }
          />
          <div className="w-44">
            <Segmented
              options={[
                { value: 'total', label: '總額' },
                { value: 'stacked', label: '明細' },
              ]}
              value={mode}
              on_change={set_mode}
            />
          </div>
        </div>

        <HistoryChart points={points} mode={mode} groups={groups} hide={hide} />

        {all_points.length < 3 && (
          <p className="mt-3 text-xs text-slate-500">走勢從起始日（{all_points[0]?.key}）開始，每天會多一個資料點。</p>
        )}
      </section>

      {first && last && (
        <section className="rounded-2xl bg-slate-900 py-2">
          <div className="grid grid-cols-[1.4fr_1fr_1fr_0.8fr] gap-x-3 px-5 py-2 text-right text-xs text-slate-500">
            <span className="text-left">帳戶</span>
            <span>{first.key.slice(5)}</span>
            <span>{last.key.slice(5)}</span>
            <span>變化</span>
          </div>
          <ul className="divide-y divide-slate-800/80 text-sm">
            {table_groups.map((g) => {
              const a = first.groups[g] ?? 0
              const b = last.groups[g] ?? 0
              return (
                <li key={g} className="grid grid-cols-[1.4fr_1fr_1fr_0.8fr] items-center gap-x-3 px-5 py-2 text-right tabular-nums">
                  <span className="flex min-w-0 items-center gap-2 text-left">
                    <span className="size-2 shrink-0 rounded-sm" style={{ background: color_of(g) }} />
                    <span className="truncate">{g}</span>
                  </span>
                  <span className="text-slate-400">{fmt_money(a, 'TWD', hide)}</span>
                  <span>{fmt_money(b, 'TWD', hide)}</span>
                  <span className={pnl_color(b - a)}>{a ? fmt_pct((b - a) / a) : '—'}</span>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      <section className="rounded-2xl bg-slate-900">
        <button
          type="button"
          onClick={() => set_show_table(!show_table)}
          className="w-full px-5 py-3 text-left text-sm text-slate-400 hover:text-slate-200"
        >
          {show_table ? '隱藏每日數據' : '顯示每日數據'}
        </button>
        {show_table && (
          <div className="max-h-96 overflow-y-auto pb-2">
            <div className="grid grid-cols-4 gap-x-3 px-5 py-1 text-right text-xs text-slate-500">
              <span className="text-left">日期</span>
              <span>總資產</span>
              <span>累計市場損益</span>
              <span>當日收支</span>
            </div>
            <ul className="divide-y divide-slate-800/80 text-sm tabular-nums">
              {[...points].reverse().map((p) => (
                <li key={p.key} className="grid grid-cols-4 gap-x-3 px-5 py-1.5 text-right">
                  <span className="text-left text-slate-400">{p.key}</span>
                  <span>{fmt_money(p.total, 'TWD', hide)}</span>
                  <span className={pnl_color(p.total - p.net_invested)}>
                    {fmt_signed_money(p.total - p.net_invested, 'TWD', hide)}
                  </span>
                  <span className="text-slate-400">{p.flow ? fmt_signed_money(p.flow, 'TWD', hide) : '—'}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {loading && <p className="text-center text-xs text-slate-500">更新歷史價格中…</p>}
    </div>
  )
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: number }) {
  return (
    <div>
      <p className="text-xs text-slate-400">{label}</p>
      <p className={`mt-0.5 text-lg font-semibold ${tone != null ? pnl_color(tone) : ''}`}>{value}</p>
      {sub && <p className={`text-xs ${tone != null ? pnl_color(tone) : 'text-slate-500'}`}>{sub}</p>}
    </div>
  )
}

function Legend({ items }: { items: { label: string; color: string; box?: boolean }[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-300">
      {items.map((it) => (
        <li key={it.label} className="flex items-center gap-1.5">
          <span
            className={it.box ? 'size-2.5 rounded-sm' : 'inline-block h-0.5 w-3.5 rounded'}
            style={{ background: it.color }}
          />
          {it.label}
        </li>
      ))}
    </ul>
  )
}
