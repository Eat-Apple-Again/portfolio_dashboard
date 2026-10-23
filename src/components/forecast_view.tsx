import { useDeferredValue, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { DailySeries } from '../lib/api'
import {
  allocation,
  bucket_value,
  build_forecast_data,
  expected_return,
  simulate,
  weighted_return,
  weighted_vol,
  type Bucket,
  type ForecastResult,
  type ForecastSettings,
  type Selection,
} from '../lib/forecast'
import { fmt_money, fmt_pct, parse_num } from '../lib/format'
import { load_forecast_settings, save_forecast_settings } from '../lib/storage'
import type { Portfolio, SheetData } from '../types'
import { ForecastChart, type ChartSeries } from './forecast_chart'
import { Field, NumberInput, Segmented, Select } from './form_fields'
import { ForecastBucketsInfo, ForecastChartInfo } from './info_content'
import { SERIES_COLORS } from './section_meta'

interface BonusForm {
  amount: string
  month: number
  bucket: string
}

/** Form values kept as strings so partial input ("8.") stays editable; persisted on this device */
interface FormState {
  horizon: number
  lookback: number
  real: boolean
  inflation: string
  contributions: Record<string, string>
  /** Monthly TWD per holding key; when any is set, the bucket's contribution is their sum */
  holding_amounts: Record<string, string>
  overrides: Record<string, string>
  bonuses: BonusForm[]
}

const DEFAULTS: FormState = {
  horizon: 10,
  lookback: 10,
  real: false,
  inflation: '2',
  contributions: {},
  holding_amounts: {},
  overrides: {},
  bonuses: [],
}

const MAX_HORIZON = 40
const HORIZON_PRESETS = [5, 10, 20, 30]
const HIGH_RETURN = 0.15

/** Holding keys are `${bucket}|${symbol}` */
const bucket_of_key = (key: string) => key.slice(0, key.lastIndexOf('|'))

interface LegacyForm {
  bonus_amount?: string
  bonus_month?: number
  bonus_bucket?: string
  allocations?: Record<string, string>
}

/** Saved settings, upgrading older fields (single bonus, percentage allocations) */
function load_form(): FormState {
  const saved = load_forecast_settings<FormState & LegacyForm>() ?? {}
  const { bonus_amount, bonus_month, bonus_bucket, allocations, ...rest } = saved
  const bonuses = rest.bonuses ?? (bonus_amount ? [{ amount: bonus_amount, month: bonus_month ?? 2, bucket: bonus_bucket ?? '' }] : [])
  let holding_amounts = rest.holding_amounts
  if (!holding_amounts && allocations) {
    // Old weights → amounts of the bucket's monthly contribution
    const weights = num_map(allocations)
    const sums: Record<string, number> = {}
    for (const [k, w] of Object.entries(weights)) sums[bucket_of_key(k)] = (sums[bucket_of_key(k)] ?? 0) + w
    holding_amounts = {}
    for (const [k, w] of Object.entries(weights)) {
      const total = parse_num(rest.contributions?.[bucket_of_key(k)] ?? '') ?? 0
      const sum = sums[bucket_of_key(k)]
      if (total > 0 && sum > 0) holding_amounts[k] = String(Math.round((total * w) / sum))
    }
  }
  return { ...DEFAULTS, ...rest, bonuses, holding_amounts: holding_amounts ?? {} }
}

const num_map = (m: Record<string, string>, scale = 1) =>
  Object.fromEntries(
    Object.entries(m)
      .map(([k, v]) => [k, parse_num(v)] as const)
      .filter(([, v]) => v != null && !Number.isNaN(v) && v >= 0)
      .map(([k, v]) => [k, v! * scale]),
  )

const compact_fmt = new Intl.NumberFormat('zh-TW', { notation: 'compact', maximumFractionDigits: 1 })
const compact_money = (v: number, hide: boolean) => (hide ? '••••' : compact_fmt.format(v))

/** A shown line; its color slot stays fixed while selected so other lines never repaint */
interface Picked {
  key: Selection
  slot: number
}

interface Props {
  sheet: SheetData
  portfolio: Portfolio
  series: Record<string, DailySeries> | null
  loading: boolean
  error: string | null
  hide: boolean
}

export function ForecastView({ sheet, portfolio, series, loading, error, hide }: Props) {
  const [form, set_form] = useState<FormState>(load_form)
  const [picked, set_picked] = useState<Picked[]>([{ key: 'all', slot: 0 }])
  const [expanded, set_expanded] = useState<string | null>(null)
  const [advanced, set_advanced] = useState(false)
  useEffect(() => save_forecast_settings(form), [form])
  const update = (patch: Partial<FormState>) => set_form((f) => ({ ...f, ...patch }))

  const toggle = (key: Selection) =>
    set_picked((cur) => {
      if (cur.some((p) => p.key === key)) return cur.filter((p) => p.key !== key)
      if (cur.length >= SERIES_COLORS.length) return cur
      const used = new Set(cur.map((p) => p.slot))
      let slot = 0
      while (used.has(slot)) slot++
      return [...cur, { key, slot }]
    })

  const data = useMemo(
    () => (series ? build_forecast_data(portfolio, series, form.lookback) : null),
    [portfolio, series, form.lookback],
  )

  const default_bucket = data?.buckets.find((b) => b.kind === 'reserve')?.name || data?.buckets[0]?.name || ''
  const bucket_names = useMemo(() => new Set(data?.buckets.map((b) => b.name)), [data])

  const settings: ForecastSettings = useMemo(() => {
    const amounts = num_map(form.holding_amounts)
    // A bucket with per-holding amounts contributes their sum
    const split_totals: Record<string, number> = {}
    for (const [k, v] of Object.entries(amounts)) split_totals[bucket_of_key(k)] = (split_totals[bucket_of_key(k)] ?? 0) + v
    return {
      horizon_years: form.horizon,
      real: form.real,
      inflation: (parse_num(form.inflation) ?? 2) / 100,
      contributions: {
        ...num_map(form.contributions),
        ...Object.fromEntries(Object.entries(split_totals).filter(([, v]) => v > 0)),
      },
      allocations: amounts,
      overrides: num_map(form.overrides, 0.01),
      bonuses: form.bonuses
        .map((b) => ({
          amount: parse_num(b.amount) || 0,
          month: b.month,
          bucket: bucket_names.has(b.bucket) ? b.bucket : default_bucket,
        }))
        .filter((b) => b.amount > 0),
    }
  }, [form, bucket_names, default_bucket])

  // Simulation is the heavy part: keep typing responsive
  const deferred_settings = useDeferredValue(settings)
  const deferred_picked = useDeferredValue(picked)
  const results = useMemo(() => {
    if (!data) return null
    // Anchor the timeline to the data timestamp so rendering stays deterministic
    const now = new Date(sheet.updated_at)
    const keys = new Set<Selection>(['all', ...deferred_picked.map((p) => p.key)])
    return new Map<Selection, ForecastResult>([...keys].map((k) => [k, simulate(data, deferred_settings, k, now)]))
  }, [data, deferred_settings, deferred_picked, sheet.updated_at])

  if (error) return <p className="rounded-xl bg-rose-950/60 px-4 py-3 text-sm text-rose-300">讀取歷史價格失敗：{error}</p>
  if (!data || !results) return <p className="py-20 text-center text-slate-500">{loading ? '載入歷史價格中…' : '尚無資料'}</p>

  const all_holdings = data.buckets.flatMap((b) => b.holdings)
  const total_cash = data.buckets.reduce((a, b) => a + b.cash_twd, 0)
  const total_now = data.buckets.reduce((a, b) => a + bucket_value(b), 0)
  const overall = results.get('all')!
  const end = overall.p50.length - 1
  const monthly_total = data.buckets.reduce((a, b) => a + (settings.contributions[b.name] ?? 0), 0)
  const bonus_total = settings.bonuses.reduce((a, b) => a + b.amount, 0)

  const slot_of = new Map(picked.map((p) => [p.key, p.slot]))
  const label_of = (key: Selection) => {
    if (key === 'all') return '全部投資'
    if (key.startsWith('b:')) return key.slice(2)
    const h = all_holdings.find((x) => `h:${x.key}` === key)
    return h ? `${h.symbol}・${h.bucket}` : ''
  }
  const chart_series: ChartSeries[] = picked
    .filter((p) => results.has(p.key) && label_of(p.key))
    .map((p) => ({ key: p.key, label: label_of(p.key), color: SERIES_COLORS[p.slot], result: results.get(p.key)! }))
  // Holding chips for buckets that are shown or have a shown holding
  const holding_rows = data.buckets.filter(
    (b) => b.holdings.length > 0 && (slot_of.has(`b:${b.name}`) || b.holdings.some((h) => slot_of.has(`h:${h.key}`))),
  )
  const end_year = new Date(overall.start_month).getFullYear() + form.horizon

  const set_bonus = (i: number, patch: Partial<BonusForm>) =>
    update({ bonuses: form.bonuses.map((b, k) => (k === i ? { ...b, ...patch } : b)) })

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
        <div>
          <p className="mb-1 text-xs text-slate-400">
            試算年數<span className="ml-2 text-slate-300">到 {end_year} 年</span>
          </p>
          <div className="flex items-center gap-2">
            <div className="w-56">
              <Segmented
                options={HORIZON_PRESETS.map((y) => ({ value: String(y), label: `${y} 年` }))}
                value={String(form.horizon)}
                on_change={(v) => update({ horizon: Number(v) })}
              />
            </div>
            <HorizonInput key={form.horizon} value={form.horizon} on_commit={(horizon) => update({ horizon })} />
          </div>
        </div>
        <button
          type="button"
          onClick={() => set_advanced(!advanced)}
          aria-expanded={advanced}
          className="pb-2 text-sm text-slate-400 hover:text-slate-200"
        >
          進階設定{form.real && <span className="text-slate-500">・已扣通膨</span>} {advanced ? '▴' : '▾'}
        </button>
      </div>
      {advanced && (
        <div className="flex flex-wrap items-end gap-x-6 gap-y-3 rounded-xl bg-slate-900/60 px-4 py-3">
          <div className="w-44">
            <p className="mb-1 text-xs text-slate-400">波動參考期間</p>
            <Segmented
              options={[5, 10].map((y) => ({ value: String(y), label: `近 ${y} 年` }))}
              value={String(form.lookback)}
              on_change={(v) => update({ lookback: Number(v) })}
            />
          </div>
          <label className="flex items-center gap-2 pb-2 text-sm text-slate-300">
            <input type="checkbox" checked={form.real} onChange={(e) => update({ real: e.target.checked })} />
            扣除通膨
          </label>
          <div className="w-28">
            <Field label="通膨率 %">
              <NumberInput value={form.inflation} placeholder="2" onChange={(e) => update({ inflation: e.target.value })} />
            </Field>
          </div>
        </div>
      )}

      <section className="grid grid-cols-2 gap-3 rounded-2xl bg-slate-900 p-4 sm:grid-cols-4 sm:p-5">
        <Stat
          label="預期年化 (持股加權)"
          value={fmt_pct(weighted_return(all_holdings, 0, settings), false)}
          sub={`連同現金 (以 0% 計)${fmt_pct(weighted_return(all_holdings, total_cash, settings), false)}`}
        />
        <Stat
          label="歷史波動度"
          value={fmt_pct(weighted_vol(all_holdings, data.months.length), false)}
          sub={`投資總值 ${compact_money(total_now, hide)}`}
        />
        <Stat
          label={`${form.horizon} 年後中位數 (全部)`}
          value={compact_money(overall.p50[end], hide)}
          sub={`10%～90%：${compact_money(overall.p10[end], hide)}～${compact_money(overall.p90[end], hide)}`}
        />
        <Stat
          label="累計投入本金"
          value={compact_money(overall.contributed[end], hide)}
          sub={`每月 ${fmt_money(monthly_total, 'TWD', hide)}${bonus_total ? `・每年額外 ${compact_money(bonus_total, hide)}` : ''}`}
        />
      </section>

      <section className="rounded-2xl bg-slate-900 p-4 sm:p-5">
        <div className="mb-3 flex items-start gap-2">
          <div className="flex flex-1 flex-wrap gap-1.5">
            {['all', ...data.buckets.map((b) => `b:${b.name}`)].map((key) => (
              <Chip key={key} slot={slot_of.get(key)} on_click={() => toggle(key)}>
                {label_of(key)}
              </Chip>
            ))}
          </div>
          <ForecastChartInfo />
        </div>
        {holding_rows.map((b) => (
          <div key={b.name} className="-mt-1 mb-3 flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-slate-500">{b.name}</span>
            {b.holdings.map((h) => (
              <Chip key={h.key} small slot={slot_of.get(`h:${h.key}`)} on_click={() => toggle(`h:${h.key}`)}>
                {h.symbol}
              </Chip>
            ))}
          </div>
        ))}

        {chart_series.length === 1 ? (
          <ul className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-300">
            <li className="font-medium text-slate-100">{chart_series[0].label}</li>
            <li className="flex items-center gap-1.5">
              <span className="inline-block h-0.5 w-3.5 rounded" style={{ background: chart_series[0].color }} />
              中位數
            </li>
            <li className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-sm opacity-60" style={{ background: chart_series[0].color }} />
              25%～75%／10%～90%
            </li>
            <li className="flex items-center gap-1.5">
              <span className="inline-block w-3.5 border-t-2 border-dashed border-slate-400" />
              累計投入本金
            </li>
          </ul>
        ) : (
          chart_series.length > 1 && (
            <ul className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-300">
              <li className="text-slate-500">中位數・色帶 25%～75%</li>
              {chart_series.map((s) => (
                <li key={s.key} className="flex items-center gap-1.5">
                  <span className="inline-block h-0.5 w-3.5 rounded" style={{ background: s.color }} />
                  {s.label}
                </li>
              ))}
            </ul>
          )
        )}
        <ForecastChart series={chart_series} hide={hide} />
        {chart_series.length > 0 && <OutcomeTable series={chart_series} year={end_year} hide={hide} />}
      </section>

      <section className="rounded-2xl bg-slate-900 py-2">
        <div className="grid grid-cols-[1.5fr_0.9fr_1fr] gap-x-3 px-5 py-2 text-right text-xs text-slate-500 sm:grid-cols-[1.5fr_1fr_0.9fr_1fr]">
          <span className="flex items-center gap-2 text-left">
            部位
            <ForecastBucketsInfo />
          </span>
          <span className="hidden sm:block">目前市值</span>
          <span>預期年化</span>
          <span>每月投入</span>
        </div>
        <ul className="divide-y divide-slate-800/80 text-sm">
          {data.buckets.map((b) => (
            <BucketRows
              key={b.name}
              bucket={b}
              open={expanded === b.name}
              on_toggle={() => set_expanded(expanded === b.name ? null : b.name)}
              form={form}
              settings={settings}
              update={update}
              hide={hide}
            />
          ))}
        </ul>

        <div className="border-t border-slate-800/80 px-5 pt-3 pb-2">
          <p className="mb-2 text-xs text-slate-400">每年額外投入</p>
          {form.bonuses.map((b, i) => (
            <div key={i} className="mb-2 grid grid-cols-[1fr_0.8fr_1.2fr_auto] items-end gap-2">
              <Field label="金額">
                <NumberInput value={b.amount} placeholder="0" onChange={(e) => set_bonus(i, { amount: e.target.value })} />
              </Field>
              <Field label="月份">
                <Select value={b.month} onChange={(e) => set_bonus(i, { month: Number(e.target.value) })}>
                  {Array.from({ length: 12 }, (_, m) => (
                    <option key={m + 1} value={m + 1}>
                      {m + 1} 月
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="放入">
                <Select
                  value={bucket_names.has(b.bucket) ? b.bucket : default_bucket}
                  onChange={(e) => set_bonus(i, { bucket: e.target.value })}
                >
                  {data.buckets.map((x) => (
                    <option key={x.name}>{x.name}</option>
                  ))}
                </Select>
              </Field>
              <button
                type="button"
                aria-label="刪除這筆額外投入"
                onClick={() => update({ bonuses: form.bonuses.filter((_, k) => k !== i) })}
                className="mb-1 rounded-lg px-2 py-1.5 text-slate-400 hover:bg-slate-800 hover:text-rose-300"
              >
                ✕
              </button>
            </div>
          ))}
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => update({ bonuses: [...form.bonuses, { amount: '', month: 2, bucket: default_bucket }] })}
              className="rounded-lg bg-slate-800 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-700"
            >
              ＋ 新增一筆
            </button>
            <button
              type="button"
              onClick={() =>
                window.confirm('清除所有每月投入、預期 % 與每年額外投入？') &&
                update({ contributions: {}, holding_amounts: {}, overrides: {}, bonuses: [] })
              }
              className="rounded-lg px-3 py-1.5 text-sm text-slate-400 hover:bg-slate-800 hover:text-slate-200"
            >
              重設
            </button>
          </div>
        </div>
      </section>

      {loading && <p className="text-center text-xs text-slate-500">更新歷史價格中…</p>}
    </div>
  )
}

interface BucketRowsProps {
  bucket: Bucket
  open: boolean
  on_toggle: () => void
  form: FormState
  settings: ForecastSettings
  update: (patch: Partial<FormState>) => void
  hide: boolean
}

function BucketRows({ bucket: b, open, on_toggle, form, settings, update, hide }: BucketRowsProps) {
  const apy = weighted_return(b.holdings, 0, settings)
  const split = allocation(b, settings)
  const monthly = settings.contributions[b.name] ?? 0
  const by_holding = b.holdings.some((h) => (settings.allocations[h.key] ?? 0) > 0)
  const high = b.holdings.some((h) => expected_return(h, settings) > HIGH_RETURN)

  return (
    <>
      <li className="grid grid-cols-[1.5fr_0.9fr_1fr] items-center gap-x-3 px-5 py-2 text-right sm:grid-cols-[1.5fr_1fr_0.9fr_1fr]">
        <button type="button" onClick={on_toggle} disabled={b.holdings.length === 0} className="min-w-0 text-left">
          <span className="flex items-center gap-1.5">
            {b.holdings.length > 0 && (
              <span className={`text-xs text-slate-500 transition-transform ${open ? 'rotate-90' : ''}`}>▶</span>
            )}
            <span className="truncate">{b.name}</span>
          </span>
          <span className="block text-xs text-slate-500">
            {b.kind === 'reserve' ? '儲備 (不計利息)' : `${b.holdings.length} 檔`}
            {b.cash_twd > 0 && b.kind === 'holding' && `・待投入 ${compact_money(b.cash_twd, hide)}`}
            {high && <span className="text-amber-400">・含 &gt;15%</span>}
          </span>
        </button>
        <span className="hidden tabular-nums text-slate-400 sm:block">{fmt_money(bucket_value(b), 'TWD', hide)}</span>
        <span className="tabular-nums">{apy != null ? fmt_pct(apy, false) : '—'}</span>
        <NumberInput
          value={by_holding ? String(monthly) : (form.contributions[b.name] ?? '')}
          placeholder="0"
          disabled={by_holding}
          title={by_holding ? '由各標的金額加總' : undefined}
          onChange={(e) => update({ contributions: { ...form.contributions, [b.name]: e.target.value } })}
        />
      </li>

      {open && (
        <li className="bg-slate-950/40 px-5 py-2">
          <div className="grid grid-cols-[1.5fr_0.9fr_1fr] gap-x-3 pb-1 text-right text-xs text-slate-500">
            <span className="text-left">標的 (歷史年化 ± 波動)</span>
            <span>預期 %</span>
            <span>每月投入</span>
          </div>
          {b.holdings.map((h, k) => (
            <div key={h.key} className="grid grid-cols-[1.5fr_0.9fr_1fr] items-center gap-x-3 py-1.5 text-right">
              <span className="min-w-0 text-left">
                <span className="block truncate">
                  {h.name}
                  {h.name !== h.symbol && <span className="text-slate-500"> {h.symbol}</span>}
                </span>
                <span className="block text-xs text-slate-500">
                  {compact_money(h.value_twd, hide)}・
                  {h.hist_return != null
                    ? `${fmt_pct(h.hist_return, false)} ± ${fmt_pct(h.hist_vol, false)}`
                    : `歷史不足 (${h.months} 個月)`}
                </span>
              </span>
              <NumberInput
                value={form.overrides[h.key] ?? ''}
                placeholder={((h.sheet_return ?? h.fallback.ret) * 100).toFixed(1)}
                onChange={(e) => update({ overrides: { ...form.overrides, [h.key]: e.target.value } })}
              />
              <NumberInput
                value={form.holding_amounts[h.key] ?? ''}
                placeholder={String(Math.round(monthly * split[k]))}
                onChange={(e) => update({ holding_amounts: { ...form.holding_amounts, [h.key]: e.target.value } })}
              />
            </div>
          ))}
        </li>
      )}
    </>
  )
}

/** Custom horizon; commits on blur / Enter so the simulation runs once per change */
function HorizonInput({ value, on_commit }: { value: number; on_commit: (years: number) => void }) {
  const [text, set_text] = useState(String(value))
  const commit = () => {
    const n = Math.round(Number(text))
    if (n >= 1 && n <= MAX_HORIZON) on_commit(n)
    else set_text(String(value))
  }
  return (
    <label className="flex items-center gap-1.5 text-sm text-slate-400">
      <span className="w-16">
        <NumberInput
          value={text}
          aria-label={`自訂試算年數 (1–${MAX_HORIZON})`}
          onChange={(e) => set_text(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        />
      </span>
      年
    </label>
  )
}

/** End-of-horizon outcomes per shown line: the five scenarios, principal and chance of ending below it */
function OutcomeTable({ series, year, hide }: { series: ChartSeries[]; year: number; hide: boolean }) {
  const cols = 'grid-cols-[1.3fr_repeat(4,1fr)] sm:grid-cols-[1.4fr_repeat(7,1fr)]'
  return (
    <div className="mt-4">
      <p className="mb-1 text-xs text-slate-400">{year} 年的可能結果</p>
      <div className={`grid ${cols} gap-x-2 border-b border-slate-800 py-1.5 text-right text-xs text-slate-500`}>
        <span className="text-left">項目</span>
        <span>悲觀 10%</span>
        <span className="hidden sm:block">偏空 25%</span>
        <span>中位數</span>
        <span className="hidden sm:block">偏多 75%</span>
        <span>樂觀 90%</span>
        <span className="hidden sm:block">投入本金</span>
        <span className="hidden sm:block">低於本金</span>
      </div>
      {series.map(({ key, label, color, result: r }) => {
        const end = r.p50.length - 1
        return (
          <div key={key} className={`grid ${cols} gap-x-2 py-1.5 text-right text-sm tabular-nums`}>
            <span className="flex min-w-0 items-center gap-1.5 text-left">
              <span className="size-2 shrink-0 rounded-full" style={{ background: color }} />
              <span className="truncate">{label}</span>
            </span>
            <span className="text-slate-400">{compact_money(r.p10[end], hide)}</span>
            <span className="hidden text-slate-400 sm:block">{compact_money(r.p25[end], hide)}</span>
            <span className="font-medium">{compact_money(r.p50[end], hide)}</span>
            <span className="hidden text-slate-400 sm:block">{compact_money(r.p75[end], hide)}</span>
            <span className="text-slate-400">{compact_money(r.p90[end], hide)}</span>
            <span className="hidden text-slate-400 sm:block">{compact_money(r.contributed[end], hide)}</span>
            <span className="hidden text-slate-400 sm:block">{fmt_pct(r.below_principal, false)}</span>
          </div>
        )
      })}
    </div>
  )
}

function Chip({
  slot,
  small,
  on_click,
  children,
}: {
  /** Color slot when shown, undefined when hidden */
  slot?: number
  small?: boolean
  on_click: () => void
  children: ReactNode
}) {
  const active = slot != null
  return (
    <button
      type="button"
      onClick={on_click}
      aria-pressed={active}
      className={`flex items-center gap-1.5 rounded-full ${small ? 'px-2 py-0.5 text-xs' : 'px-3 py-1 text-sm'} ${
        active ? 'bg-slate-700 text-white ring-1 ring-slate-500' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
      }`}
    >
      {active && <span className="size-2 rounded-full" style={{ background: SERIES_COLORS[slot] }} />}
      {children}
    </button>
  )
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-slate-400">{label}</p>
      <p className="mt-0.5 truncate text-lg font-semibold">{value}</p>
      {sub && <p className="truncate text-xs text-slate-500">{sub}</p>}
    </div>
  )
}
