import type { DailySeries } from './api'
import type { Portfolio } from '../types'
import { invest_bucket } from './portfolio'

const MIN_MONTHS = 24 // below this a holding's history is too short to bootstrap

// Fallback assumptions when no expected return is set and history is short (annual return, annual volatility)
const FALLBACK: Record<string, { ret: number; vol: number }> = {
  TW_STOCK: { ret: 0.08, vol: 0.2 },
  US_STOCK: { ret: 0.1, vol: 0.2 },
  CRYPTO: { ret: 0.1, vol: 0.7 },
}

/** Market types that have a default expected return, editable in the forecast's advanced settings */
export const MARKET_TYPES = ['TW_STOCK', 'US_STOCK', 'CRYPTO'] as const

export const DEFAULT_RETURNS: Record<string, number> = Object.fromEntries(
  MARKET_TYPES.map((t) => [t, FALLBACK[t].ret]),
)

export interface HoldingStats {
  key: string // `${bucket}|${symbol}`
  bucket: string
  type: string
  symbol: string
  name: string
  value_twd: number
  months: number
  /** Historical annualized (geometric) return and volatility; null when history is too short */
  hist_return: number | null
  hist_vol: number | null
  /** Expected return from the holdings sheet (fraction), if set */
  sheet_return: number | null
  fallback: { ret: number; vol: number }
  /** Monthly log returns aligned to ForecastData.months; NaN where missing */
  returns: number[]
}

export interface Bucket {
  name: string
  /** 'holding' = a holding account (positions + its waiting cash); 'reserve' = standalone cash such as 總儲備 */
  kind: 'holding' | 'reserve'
  cash_twd: number
  holdings: HoldingStats[]
}

export interface ForecastData {
  months: string[]
  buckets: Bucket[]
}

export interface ForecastSettings {
  horizon_years: number
  real: boolean
  inflation: number
  /** Monthly TWD contribution per bucket */
  contributions: Record<string, number>
  /** Share (any positive weights) of a bucket's contribution per holding key; empty bucket = by current value */
  allocations: Record<string, number>
  /** Expected annual return per holding key (fraction), overriding the sheet */
  overrides: Record<string, number>
  /** Per market type (fraction), used when a holding has no expected return set */
  default_returns: Record<string, number>
  /** Extra yearly contributions, e.g. year-end bonus */
  bonuses: Bonus[]
}

export interface Bonus {
  amount: number
  month: number // 1-12
  bucket: string
}

/** 'all' | `b:${bucket}` | `h:${holding key}` */
export type Selection = string

export interface ForecastResult {
  p10: number[]
  p25: number[]
  p50: number[]
  p75: number[]
  p90: number[]
  contributed: number[]
  /** Share of paths ending below cumulative principal */
  below_principal: number
  start_month: Date
}

const month_key = (key: string) => key.slice(0, 7)

export function build_forecast_data(
  portfolio: Portfolio,
  series: Record<string, DailySeries>,
  lookback_years: number,
): ForecastData {
  const all_months = new Set<string>()
  const closes = new Map<string, Map<string, number>>()
  for (const [id, rows] of Object.entries(series)) {
    const m = new Map<string, number>()
    for (const [k, c] of rows) {
      if (c > 0) m.set(month_key(k), c)
      all_months.add(month_key(k))
    }
    closes.set(id, m)
  }
  const months = [...all_months].sort().slice(-(lookback_years * 12 + 1))
  const ret_months = months.slice(1)

  // Cash per investment bucket (broker cash, settlement and staging accounts, reserves)
  const cash = new Map<string, number>()
  for (const a of [...portfolio.groups.flatMap((g) => g.cash), ...portfolio.accounts]) {
    const bucket = invest_bucket(a.account)
    if (bucket) cash.set(bucket, (cash.get(bucket) ?? 0) + (a.available_twd ?? 0))
  }

  const buckets: Bucket[] = portfolio.groups.map((g) => ({
    name: g.account,
    kind: 'holding',
    cash_twd: cash.get(g.account) ?? 0,
    holdings: g.positions
      .filter((p) => (p.value_twd ?? 0) > 0)
      .map((p) => {
        const c = closes.get(p.holding.quote_id)
        const returns = ret_months.map((m, i) => {
          const prev = c?.get(months[i])
          const cur = c?.get(m)
          return prev && cur ? Math.log(cur / prev) : NaN
        })
        const valid = returns.filter((r) => !Number.isNaN(r))
        const enough = valid.length >= MIN_MONTHS
        const mean = enough ? valid.reduce((s, r) => s + r, 0) / valid.length : NaN
        const sd = enough ? Math.sqrt(valid.reduce((s, r) => s + (r - mean) ** 2, 0) / (valid.length - 1)) : NaN
        const er = p.holding.expected_return
        return {
          key: `${g.account}|${p.holding.symbol}`,
          bucket: g.account,
          type: p.holding.type,
          symbol: p.holding.symbol,
          name: p.holding.name || p.holding.symbol,
          value_twd: p.value_twd!,
          months: valid.length,
          hist_return: enough ? Math.exp(mean * 12) - 1 : null,
          hist_vol: enough ? sd * Math.sqrt(12) : null,
          sheet_return: er != null && Number.isFinite(er) ? er / 100 : null,
          fallback: FALLBACK[p.holding.type] ?? FALLBACK.US_STOCK,
          returns,
        }
      }),
  }))
  for (const [name, v] of cash) {
    if (!buckets.some((b) => b.name === name)) buckets.push({ name, kind: 'reserve', cash_twd: v, holdings: [] })
  }
  // Standalone reserves first (bottom of stacks), matching the history view
  buckets.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'reserve' ? -1 : 1))
  return { months: ret_months, buckets }
}

/** Expected return before any per-holding override: sheet value, else the market default */
export function base_return(h: HoldingStats, s: ForecastSettings): number {
  return h.sheet_return ?? s.default_returns[h.type] ?? h.fallback.ret
}

export function expected_return(h: HoldingStats, s: ForecastSettings): number {
  return s.overrides[h.key] ?? base_return(h, s)
}

export function bucket_value(b: Bucket): number {
  return b.cash_twd + b.holdings.reduce((s, h) => s + h.value_twd, 0)
}

/** Value-weighted expected return of some holdings plus idle cash (0%) */
export function weighted_return(holdings: HoldingStats[], cash: number, s: ForecastSettings): number | null {
  const total = holdings.reduce((a, h) => a + h.value_twd, 0) + cash
  if (total <= 0) return null
  return holdings.reduce((a, h) => a + h.value_twd * expected_return(h, s), 0) / total
}

/** Contribution split inside a bucket: explicit weights if any are set, otherwise by current value */
export function allocation(b: Bucket, s: ForecastSettings): number[] {
  const set = b.holdings.map((h) => s.allocations[h.key] ?? 0)
  const base = set.some((w) => w > 0) ? set : b.holdings.map((h) => h.value_twd)
  const sum = base.reduce((a, w) => a + w, 0)
  return sum > 0 ? base.map((w) => w / sum) : base.map(() => 0)
}

/** Seeded PRNG so results are stable across re-renders and selections */
function mulberry32(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Bootstrap Monte Carlo at holding level: each simulated month replays one random historical month for
 * every holding at once (keeping correlation and fat tails), shifted so each holding's mean equals its
 * expected return. Holdings without enough history draw from a normal distribution instead.
 * Cash (waiting / reserve) is idle. Only the selected slice is recorded.
 */
export function simulate(data: ForecastData, s: ForecastSettings, selection: Selection, now: Date, sims = 2000): ForecastResult {
  const H = s.horizon_years * 12
  const rand = mulberry32(42)
  const normal = () => Math.sqrt(-2 * Math.log(rand() || 1e-12)) * Math.cos(2 * Math.PI * rand())

  const holdings = data.buckets.flatMap((b) => b.holdings)
  const N = holdings.length
  const T = data.months.length
  const target = holdings.map((h) => Math.log(1 + expected_return(h, s)) / 12)
  const boot = holdings.map((h) => h.hist_return != null)
  const mean = holdings.map((h) => {
    const v = h.returns.filter((r) => !Number.isNaN(r))
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0
  })
  const sd = holdings.map((h) => (h.hist_vol ?? h.fallback.vol) / Math.sqrt(12))

  // What counts toward the selected line
  const pick_h = holdings.map((h) =>
    selection === 'all' || selection === `b:${h.bucket}` || selection === `h:${h.key}` ? 1 : 0,
  )
  const pick_cash = new Map(
    data.buckets.map((b) => [b.name, selection === 'all' || selection === `b:${b.name}` ? 1 : 0]),
  )
  // Cash flow into each holding (split by allocation) or into bucket cash (buckets without holdings)
  const index_of = new Map(holdings.map((h, i) => [h.key, i]))
  const flow = (amount_of: (b: Bucket) => number) => {
    const holding = new Float64Array(N)
    let cash = 0
    for (const b of data.buckets) {
      const c = amount_of(b)
      if (!c) continue
      if (b.holdings.length === 0) cash += c * pick_cash.get(b.name)!
      else allocation(b, s).forEach((w, k) => (holding[index_of.get(b.holdings[k].key)!] += c * w))
    }
    const picked = holding.reduce((a, v, i) => a + v * pick_h[i], 0) + cash
    return { holding, cash, picked }
  }

  const monthly = flow((b) => s.contributions[b.name] ?? 0)
  // Indexed by calendar month 0-11
  const bonus = Array.from({ length: 12 }, (_, mo) =>
    flow((b) => s.bonuses.reduce((a, x) => a + (x.month - 1 === mo && x.bucket === b.name ? x.amount : 0), 0)),
  )
  const cash_now = data.buckets.reduce((a, b) => a + b.cash_twd * pick_cash.get(b.name)!, 0)
  const start_month = new Date(now.getFullYear(), now.getMonth(), 1)
  const month_of = (m: number) => (start_month.getMonth() + m) % 12
  const deflate = (m: number) => (s.real ? (1 + s.inflation) ** (m / 12) : 1)

  const paths = Array.from({ length: H + 1 }, () => new Float64Array(sims))
  const v = new Float64Array(N)
  for (let k = 0; k < sims; k++) {
    for (let i = 0; i < N; i++) v[i] = holdings[i].value_twd
    let cash = cash_now
    let sel = cash
    for (let i = 0; i < N; i++) sel += v[i] * pick_h[i]
    paths[0][k] = sel
    for (let m = 1; m <= H; m++) {
      const t = T > 0 ? Math.floor(rand() * T) : -1
      const extra = bonus[month_of(m)]
      sel = 0
      for (let i = 0; i < N; i++) {
        const hist = t >= 0 ? holdings[i].returns[t] : NaN
        const r = boot[i] && !Number.isNaN(hist) ? hist - mean[i] + target[i] : target[i] + sd[i] * normal()
        v[i] = v[i] * Math.exp(r) + monthly.holding[i] + extra.holding[i]
        sel += v[i] * pick_h[i]
      }
      cash += monthly.cash + extra.cash
      paths[m][k] = (sel + cash) / deflate(m)
    }
  }

  const pct = (arr: Float64Array, q: number) => arr[Math.min(arr.length - 1, Math.floor(q * arr.length))]
  const out: ForecastResult = { p10: [], p25: [], p50: [], p75: [], p90: [], contributed: [], below_principal: 0, start_month }
  let principal = paths[0][0]
  for (let m = 0; m <= H; m++) {
    const sorted = paths[m].sort()
    out.p10.push(pct(sorted, 0.1))
    out.p25.push(pct(sorted, 0.25))
    out.p50.push(pct(sorted, 0.5))
    out.p75.push(pct(sorted, 0.75))
    out.p90.push(pct(sorted, 0.9))
    if (m > 0) principal += monthly.picked + bonus[month_of(m)].picked
    out.contributed.push(principal / deflate(m))
  }
  const final_principal = out.contributed[H]
  out.below_principal = paths[H].reduce((a, v) => a + (v < final_principal - 1e-6 ? 1 : 0), 0) / sims
  return out
}

/** Annualized volatility of the value-weighted historical portfolio of these holdings (null if too short) */
export function weighted_vol(holdings: HoldingStats[], months: number): number | null {
  const total = holdings.reduce((a, h) => a + h.value_twd, 0)
  if (total <= 0 || months < MIN_MONTHS) return null
  const series = Array.from({ length: months }, (_, t) =>
    holdings.reduce((a, h) => {
      const r = h.returns[t]
      return a + (h.value_twd / total) * (Number.isNaN(r) ? 0 : r)
    }, 0),
  )
  const m = series.reduce((a, b) => a + b, 0) / series.length
  return Math.sqrt(series.reduce((a, r) => a + (r - m) ** 2, 0) / (series.length - 1)) * Math.sqrt(12)
}
