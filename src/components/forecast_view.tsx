import { useEffect, useMemo, useState } from 'react'
import type { DailySeries } from '../lib/api'
import {
  build_forecast_data,
  CASH_BUCKET,
  expected_return,
  simulate,
  type ForecastSettings,
} from '../lib/forecast'
import { fmt_money, fmt_pct, parse_num } from '../lib/format'
import { load_forecast_settings, save_forecast_settings } from '../lib/storage'
import type { Portfolio, SheetData } from '../types'
import { ForecastChart } from './forecast_chart'
import { Field, NumberInput, Segmented, Select } from './form_fields'
import { SERIES_COLORS } from './section_meta'

/** Form values kept as strings so partial input ("8.") stays editable; persisted on this device */
interface FormState {
  horizon: number
  lookback: number
  real: boolean
  inflation: string
  cash_rate: string
  contributions: Record<string, string>
  bonus_amount: string
  bonus_month: number
  overrides: Record<string, string>
}

const DEFAULTS: FormState = {
  horizon: 10,
  lookback: 10,
  real: false,
  inflation: '2',
  cash_rate: '1.5',
  contributions: {},
  bonus_amount: '',
  bonus_month: 2,
  overrides: {},
}

const HIGH_RETURN = 0.15

const pct_or = (s: string | undefined, fallback: number) => {
  const n = parse_num(s ?? '')
  return n == null || Number.isNaN(n) ? fallback : n / 100
}
const amount_or_zero = (s: string | undefined) => {
  const n = parse_num(s ?? '')
  return n == null || Number.isNaN(n) || n < 0 ? 0 : n
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
  const [form, set_form] = useState<FormState>(() => ({ ...DEFAULTS, ...load_forecast_settings<FormState>() }))
  useEffect(() => save_forecast_settings(form), [form])
  const update = (patch: Partial<FormState>) => set_form((f) => ({ ...f, ...patch }))

  const data = useMemo(
    () => (series ? build_forecast_data(portfolio, series, form.lookback) : null),
    [portfolio, series, form.lookback],
  )

  const settings: ForecastSettings = useMemo(
    () => ({
      horizon_years: form.horizon,
      lookback_years: form.lookback,
      real: form.real,
      inflation: pct_or(form.inflation, 0.02),
      cash_rate: pct_or(form.cash_rate, 0.015),
      contributions: Object.fromEntries(Object.entries(form.contributions).map(([k, v]) => [k, amount_or_zero(v)])),
      bonus_amount: amount_or_zero(form.bonus_amount),
      bonus_month: form.bonus_month,
      overrides: Object.fromEntries(
        Object.entries(form.overrides)
          .map(([k, v]) => [k, parse_num(v)] as const)
          .filter(([, v]) => v != null && !Number.isNaN(v))
          .map(([k, v]) => [k, v! / 100]),
      ),
    }),
    [form],
  )

  // Anchor the timeline to the data timestamp so rendering stays deterministic
  const result = useMemo(
    () => (data ? simulate(data, settings, new Date(sheet.updated_at)) : null),
    [data, settings, sheet.updated_at],
  )

  if (error) return <p className="rounded-xl bg-rose-950/60 px-4 py-3 text-sm text-rose-300">讀取歷史價格失敗：{error}</p>
  if (!data || !result) return <p className="py-20 text-center text-slate-500">{loading ? '載入歷史價格中…' : '尚無資料'}</p>

  const end = result.p50.length - 1
  const monthly_total =
    data.groups.reduce((s, g) => s + (settings.contributions[g.name] ?? 0), 0) + (settings.contributions[CASH_BUCKET] ?? 0)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-full max-w-xs">
          <p className="mb-1 text-xs text-slate-400">試算年數</p>
          <Segmented
            options={[5, 10, 20, 30].map((y) => ({ value: String(y), label: `${y} 年` }))}
            value={String(form.horizon)}
            on_change={(v) => update({ horizon: Number(v) })}
          />
        </div>
        <div className="w-44">
          <p className="mb-1 text-xs text-slate-400">參考歷史</p>
          <Segmented
            options={[5, 10].map((y) => ({ value: String(y), label: `近 ${y} 年` }))}
            value={String(form.lookback)}
            on_change={(v) => update({ lookback: Number(v) })}
          />
        </div>
        <label className="flex items-center gap-2 pb-2 text-sm text-slate-300">
          <input type="checkbox" checked={form.real} onChange={(e) => update({ real: e.target.checked })} />
          扣除通膨（年 {form.inflation || 2}%）
        </label>
      </div>

      <section className="grid grid-cols-2 gap-3 rounded-2xl bg-slate-900 p-4 sm:grid-cols-4 sm:p-5">
        <Stat label="組合預期年化報酬" value={fmt_pct(result.portfolio_return, false)} sub={result.portfolio_vol != null ? `波動度 ${fmt_pct(result.portfolio_vol, false)}` : undefined} />
        <Stat label={`${form.horizon} 年後（中位數）`} value={fmt_money(result.p50[end], 'TWD', hide)} />
        <Stat label="10% ~ 90% 範圍" value={`${compact_money(result.p10[end], hide)} ~ ${compact_money(result.p90[end], hide)}`} />
        <Stat label="累計投入本金" value={fmt_money(result.contributed[end], 'TWD', hide)} sub={`每月 ${fmt_money(monthly_total, 'TWD', hide)}`} />
      </section>

      <section className="rounded-2xl bg-slate-900 p-4 sm:p-5">
        <ul className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-300">
          <li className="flex items-center gap-1.5">
            <span className="inline-block h-0.5 w-3.5 rounded" style={{ background: SERIES_COLORS[0] }} />
            中位數（50%）
          </li>
          <li className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm opacity-60" style={{ background: SERIES_COLORS[0] }} />
            25%～75%（深）／10%～90%（淺）
          </li>
          <li className="flex items-center gap-1.5">
            <span className="inline-block h-0.5 w-3.5 rounded" style={{ background: SERIES_COLORS[1] }} />
            累計投入本金
          </li>
        </ul>
        <ForecastChart result={result} hide={hide} />
      </section>

      <section className="rounded-2xl bg-slate-900 py-2">
        <div className="grid grid-cols-[1.3fr_1fr_1fr_1fr] gap-x-3 px-5 py-2 text-right text-xs text-slate-500 sm:grid-cols-[1.3fr_1fr_1fr_1fr_1fr]">
          <span className="text-left">帳戶</span>
          <span className="hidden sm:block">目前市值</span>
          <span>歷史年化</span>
          <span>預期報酬 %</span>
          <span>每月投入</span>
        </div>
        <ul className="divide-y divide-slate-800/80 text-sm">
          {data.groups.map((g) => {
            const exp = expected_return(g, settings)
            return (
              <li key={g.name} className="grid grid-cols-[1.3fr_1fr_1fr_1fr] items-center gap-x-3 px-5 py-2 text-right sm:grid-cols-[1.3fr_1fr_1fr_1fr_1fr]">
                <span className="min-w-0 text-left">
                  <span className="block truncate">{g.name}</span>
                  {g.hist_return == null && <span className="text-xs text-amber-400">歷史不足，用預設值</span>}
                  {exp > HIGH_RETURN && <span className="text-xs text-amber-400">高於 15%，未必能持續</span>}
                </span>
                <span className="hidden tabular-nums text-slate-400 sm:block">{fmt_money(g.value_twd, 'TWD', hide)}</span>
                <span className="tabular-nums text-slate-400">
                  {g.hist_return != null ? fmt_pct(g.hist_return, false) : '—'}
                  {g.hist_vol != null && <span className="block text-xs">±{fmt_pct(g.hist_vol, false)}</span>}
                </span>
                <NumberInput
                  value={form.overrides[g.name] ?? ''}
                  placeholder={((g.hist_return ?? g.fallback.ret) * 100).toFixed(1)}
                  onChange={(e) => update({ overrides: { ...form.overrides, [g.name]: e.target.value } })}
                />
                <NumberInput
                  value={form.contributions[g.name] ?? ''}
                  placeholder="0"
                  onChange={(e) => update({ contributions: { ...form.contributions, [g.name]: e.target.value } })}
                />
              </li>
            )
          })}
          <li className="grid grid-cols-[1.3fr_1fr_1fr_1fr] items-center gap-x-3 px-5 py-2 text-right sm:grid-cols-[1.3fr_1fr_1fr_1fr_1fr]">
            <span className="text-left">{CASH_BUCKET}</span>
            <span className="hidden tabular-nums text-slate-400 sm:block">{fmt_money(data.cash_twd, 'TWD', hide)}</span>
            <span className="text-xs text-slate-500">年利率 →</span>
            <NumberInput value={form.cash_rate} onChange={(e) => update({ cash_rate: e.target.value })} />
            <NumberInput
              value={form.contributions[CASH_BUCKET] ?? ''}
              placeholder="0"
              onChange={(e) => update({ contributions: { ...form.contributions, [CASH_BUCKET]: e.target.value } })}
            />
          </li>
        </ul>
        <div className="grid grid-cols-2 gap-3 px-5 pt-3 pb-2">
          <Field label="每年額外投入（年終、分紅）" hint="依每月投入的比例分配">
            <NumberInput value={form.bonus_amount} placeholder="0" onChange={(e) => update({ bonus_amount: e.target.value })} />
          </Field>
          <Field label="投入月份">
            <Select value={form.bonus_month} onChange={(e) => update({ bonus_month: Number(e.target.value) })}>
              {Array.from({ length: 12 }, (_, i) => (
                <option key={i + 1} value={i + 1}>
                  {i + 1} 月
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </section>

      <p className="px-1 text-xs leading-relaxed text-slate-500">
        以各帳戶近 {form.lookback} 年的月報酬重抽模擬 2,000 種未來（保留各資產的波動與相關性），並將平均報酬調整為「預期報酬」。
        這是依假設推算的可能範圍，不是預測；未計入稅、手續費與匯率變動。
        {loading && ' 更新歷史價格中…'}
      </p>
    </div>
  )
}

const compact_fmt = new Intl.NumberFormat('zh-TW', { notation: 'compact', maximumFractionDigits: 1 })
function compact_money(v: number, hide: boolean) {
  return hide ? '••••' : compact_fmt.format(v)
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-slate-400">{label}</p>
      <p className="mt-0.5 truncate text-lg font-semibold">{value}</p>
      {sub && <p className="text-xs text-slate-500">{sub}</p>}
    </div>
  )
}
