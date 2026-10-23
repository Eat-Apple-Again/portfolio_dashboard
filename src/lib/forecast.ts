import type { DailySeries } from './api'
import type { Portfolio } from '../types'

export const CASH_BUCKET = '現金'
const MIN_MONTHS = 24 // below this a group's history is too short to bootstrap

// Fallback assumptions when a group lacks enough history (annual return, annual volatility)
const FALLBACK: Record<string, { ret: number; vol: number }> = {
  TW_STOCK: { ret: 0.07, vol: 0.2 },
  US_STOCK: { ret: 0.08, vol: 0.2 },
  CRYPTO: { ret: 0.1, vol: 0.7 },
}

export interface GroupStats {
  name: string
  value_twd: number
  months: number
  /** Historical annualized (geometric) return and volatility, null when history is too short */
  hist_return: number | null
  hist_vol: number | null
  fallback: { ret: number; vol: number }
  /** Log returns aligned to `ForecastData.months`; NaN where no holding had data */
  returns: number[]
}

export interface ForecastData {
  months: string[] // YYYY-MM
  groups: GroupStats[]
  cash_twd: number
}

export interface ForecastSettings {
  horizon_years: number
  lookback_years: number
  real: boolean
  inflation: number
  cash_rate: number
  /** Monthly TWD contribution per group name (CASH_BUCKET for cash) */
  contributions: Record<string, number>
  bonus_amount: number
  bonus_month: number // 1-12
  /** Expected annual return override per group name */
  overrides: Record<string, number | null>
}

export interface ForecastResult {
  /** Percentile paths, one value per month (index 0 = today) */
  p10: number[]
  p25: number[]
  p50: number[]
  p75: number[]
  p90: number[]
  contributed: number[]
  start_month: Date
  portfolio_return: number | null
  portfolio_vol: number | null
}

const month_key = (key: string) => key.slice(0, 7)

/** Monthly log returns per holding, aggregated into value-weighted group returns over the lookback window */
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

  const groups: GroupStats[] = portfolio.groups
    .filter((g) => g.positions.length > 0)
    .map((g) => {
      const positions = g.positions.filter((p) => (p.value_twd ?? 0) > 0)
      const returns = ret_months.map((m, i) => {
        let w_sum = 0
        let growth = 0
        for (const p of positions) {
          const c = closes.get(p.holding.quote_id)
          const prev = c?.get(months[i])
          const cur = c?.get(m)
          if (!prev || !cur) continue
          w_sum += p.value_twd!
          growth += p.value_twd! * (cur / prev)
        }
        return w_sum > 0 ? Math.log(growth / w_sum) : NaN
      })
      const valid = returns.filter((r) => !Number.isNaN(r))
      const enough = valid.length >= MIN_MONTHS
      const mean = enough ? valid.reduce((s, r) => s + r, 0) / valid.length : NaN
      const sd = enough ? Math.sqrt(valid.reduce((s, r) => s + (r - mean) ** 2, 0) / (valid.length - 1)) : NaN
      const dominant = positions[0]?.holding.type ?? 'US_STOCK'
      return {
        name: g.account,
        value_twd: positions.reduce((s, p) => s + (p.value_twd ?? 0), 0),
        months: valid.length,
        hist_return: enough ? Math.exp(mean * 12) - 1 : null,
        hist_vol: enough ? sd * Math.sqrt(12) : null,
        fallback: FALLBACK[dominant] ?? FALLBACK.US_STOCK,
        returns,
      }
    })

  // Everything that is not an invested position: bank cash plus broker / exchange cash
  const invested = groups.reduce((s, g) => s + g.value_twd, 0)
  return { months: ret_months, groups, cash_twd: portfolio.totals.value_twd - invested }
}

/** Seeded PRNG so results are stable across re-renders */
function mulberry32(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function expected_return(g: GroupStats, s: ForecastSettings): number {
  return s.overrides[g.name] ?? g.hist_return ?? g.fallback.ret
}

/**
 * Bootstrap Monte Carlo: each simulated month replays one random historical month for all groups at once
 * (keeping their correlation and fat tails), shifted so each group's mean matches its expected return.
 */
export function simulate(data: ForecastData, s: ForecastSettings, now: Date, sims = 2000): ForecastResult {
  const H = s.horizon_years * 12
  const rand = mulberry32(42)
  const normal = () => Math.sqrt(-2 * Math.log(rand() || 1e-12)) * Math.cos(2 * Math.PI * rand())

  const G = data.groups.length
  const target = data.groups.map((g) => Math.log(1 + expected_return(g, s)) / 12)
  const bootstrap = data.groups.map((g) => g.hist_return != null)
  const hist_mean = data.groups.map((g) => {
    const v = g.returns.filter((r) => !Number.isNaN(r))
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0
  })
  const fallback_sd = data.groups.map((g) => g.fallback.vol / Math.sqrt(12))
  const T = data.months.length
  const contrib = data.groups.map((g) => s.contributions[g.name] ?? 0)
  const cash_contrib = s.contributions[CASH_BUCKET] ?? 0
  const monthly_total = contrib.reduce((a, b) => a + b, 0) + cash_contrib
  const bonus_share = (c: number) => (monthly_total > 0 ? (s.bonus_amount * c) / monthly_total : 0)
  const cash_growth = (1 + s.cash_rate) ** (1 / 12)
  const start_month = new Date(now.getFullYear(), now.getMonth(), 1)

  const paths = Array.from({ length: H + 1 }, () => new Float64Array(sims))
  const deflate = (m: number) => (s.real ? (1 + s.inflation) ** (m / 12) : 1)

  for (let k = 0; k < sims; k++) {
    const v = data.groups.map((g) => g.value_twd)
    let cash = data.cash_twd
    paths[0][k] = v.reduce((a, b) => a + b, 0) + cash
    for (let m = 1; m <= H; m++) {
      const t = T > 0 ? Math.floor(rand() * T) : -1
      const is_bonus = (start_month.getMonth() + m) % 12 === s.bonus_month - 1
      let total = 0
      for (let g = 0; g < G; g++) {
        const hist = t >= 0 ? data.groups[g].returns[t] : NaN
        const r =
          bootstrap[g] && !Number.isNaN(hist) ? hist - hist_mean[g] + target[g] : target[g] + fallback_sd[g] * normal()
        v[g] = v[g] * Math.exp(r) + contrib[g] + (is_bonus ? bonus_share(contrib[g]) : 0)
        total += v[g]
      }
      cash = cash * cash_growth + cash_contrib + (is_bonus ? (monthly_total > 0 ? bonus_share(cash_contrib) : s.bonus_amount) : 0)
      paths[m][k] = (total + cash) / deflate(m)
    }
  }

  const pct = (arr: Float64Array, q: number) => arr[Math.min(arr.length - 1, Math.floor(q * arr.length))]
  const out = { p10: [] as number[], p25: [] as number[], p50: [] as number[], p75: [] as number[], p90: [] as number[] }
  const contributed: number[] = []
  let principal = paths[0][0]
  for (let m = 0; m <= H; m++) {
    const sorted = paths[m].sort()
    out.p10.push(pct(sorted, 0.1))
    out.p25.push(pct(sorted, 0.25))
    out.p50.push(pct(sorted, 0.5))
    out.p75.push(pct(sorted, 0.75))
    out.p90.push(pct(sorted, 0.9))
    if (m > 0) {
      const is_bonus = (start_month.getMonth() + m) % 12 === s.bonus_month - 1
      principal += monthly_total + (is_bonus ? s.bonus_amount : 0)
    }
    contributed.push(principal / deflate(m))
  }

  // Portfolio-level expected return / volatility, value-weighted (cash at cash_rate, zero volatility)
  const total_now = data.groups.reduce((a, g) => a + g.value_twd, 0) + data.cash_twd
  let portfolio_return: number | null = null
  let portfolio_vol: number | null = null
  if (total_now > 0) {
    portfolio_return =
      data.groups.reduce((a, g) => a + g.value_twd * expected_return(g, s), 0) / total_now +
      (data.cash_twd / total_now) * s.cash_rate
    // Volatility from the weighted historical monthly series (falls back to group vols where missing)
    const series = data.months.map((_, t) =>
      data.groups.reduce((a, g, gi) => {
        const r = g.returns[t]
        return a + (g.value_twd / total_now) * (Number.isNaN(r) ? hist_mean[gi] : r)
      }, 0),
    )
    if (series.length >= MIN_MONTHS) {
      const mean = series.reduce((a, b) => a + b, 0) / series.length
      portfolio_vol = Math.sqrt(series.reduce((a, r) => a + (r - mean) ** 2, 0) / (series.length - 1)) * Math.sqrt(12)
    }
  }

  return { ...out, contributed, start_month, portfolio_return, portfolio_vol }
}
