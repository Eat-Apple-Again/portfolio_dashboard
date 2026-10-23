import type { DailySeries } from './api'
import type { Portfolio, SheetData } from '../types'
import { INVEST_TYPES, invest_bucket, replay, type ReplayState } from './portfolio'
import { to_ts } from './dates'

export interface HistoryPoint {
  key: string // YYYY-MM-DD (local calendar day)
  /** Value of the investment scope: holdings + cash in investment buckets */
  total: number
  /** Opening value + cumulative money moved into the scope: the line total would follow with zero market movement */
  net_invested: number
  /** Money that crossed into (+) or out of (−) the scope during this day */
  flow: number
  groups: Record<string, number>
}

const DAY_MS = 86_400_000

export function day_key(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Latest close on or before `key`; before the first close, the first close (carry back) */
export function price_on(series: DailySeries | undefined, key: string): number | null {
  if (!series || series.length === 0) return null
  if (key < series[0][0]) return series[0][1]
  let lo = 0
  let hi = series.length - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (series[mid][0] <= key) lo = mid
    else hi = mid - 1
  }
  return series[lo][1]
}

/** Earliest account opening date: the first day history can be reconstructed for */
export function history_start(sheet: SheetData): Date | null {
  const ts = sheet.accounts.map((a) => to_ts(a.opening_date)).filter((t): t is number => t != null)
  if (ts.length === 0) return null
  const d = new Date(Math.min(...ts))
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

/**
 * Chart groups, bottom of the stack first: standalone reserves (barely move), then holding accounts so that
 * the first one in dashboard order ends up on top. Bank accounts outside the investment scope are not shown.
 */
export function chart_groups(sheet: SheetData, today: Portfolio): string[] {
  const holding_groups = today.groups.map((g) => g.account).reverse()
  const buckets = sheet.accounts.map(invest_bucket).filter((b): b is string => b != null)
  const reserves = buckets.filter((b) => !holding_groups.includes(b))
  return [...new Set([...reserves, ...holding_groups])]
}

/**
 * Value the investment scope at each past day's close (today at live prices), replaying
 * the opening snapshot + events up to that day.
 */
export function build_history(
  sheet: SheetData,
  series: Record<string, DailySeries>,
  today: Portfolio,
  now = Date.now(),
): HistoryPoint[] {
  const start = history_start(sheet)
  if (!start) return []

  const fx_row = sheet.holdings.find((h) => h.type === 'FX')
  const manual_fx = fx_row?.avg_cost || null
  const to_twd = (amount: number, currency: string, fx: number | null) =>
    currency === 'TWD' ? amount : currency === 'USD' && fx != null ? amount * fx : 0

  const accounts = new Map(sheet.accounts.map((a) => [a.account, a]))
  const bucket_of = new Map(sheet.accounts.map((a) => [a.account, invest_bucket(a)]))
  const in_scope = (account: string) => Boolean(account && bucket_of.get(account))
  const live_price = new Map(
    today.groups.flatMap((g) => g.positions).map((p) => [p.holding.quote_id, p.price] as const),
  )

  // Money crossing the scope boundary, per calendar day (internal moves and trades net to zero)
  const flows_by_day = new Map<string, { currency: string; amount: number }[]>()
  for (const tr of sheet.transfers) {
    const ts = to_ts(tr.datetime)
    if (ts == null || tr.amount == null) continue
    const from_in = in_scope(tr.from_account)
    const to_in = in_scope(tr.to_account)
    if (from_in === to_in) continue
    const key = day_key(new Date(ts))
    const list = flows_by_day.get(key) ?? []
    if (to_in) list.push({ currency: accounts.get(tr.to_account)!.currency, amount: tr.to_amount ?? tr.amount })
    else list.push({ currency: accounts.get(tr.from_account)!.currency, amount: -(tr.amount + (tr.fee ?? 0)) })
    flows_by_day.set(key, list)
  }

  const value = (state: ReplayState, price: (quote_id: string) => number, fx: number | null) => {
    const groups: Record<string, number> = {}
    const add = (g: string, v: number) => (groups[g] = (groups[g] ?? 0) + v)
    for (const p of state.positions.values()) {
      if (p.qty <= 1e-9 || !(INVEST_TYPES as string[]).includes(p.holding.type)) continue
      add(p.holding.account, to_twd(p.qty * price(p.holding.quote_id), p.holding.currency, fx))
    }
    for (const [account, c] of state.cash) {
      const bucket = bucket_of.get(account)
      if (bucket) add(bucket, to_twd(c.balance + c.pending, accounts.get(account)!.currency, fx))
    }
    return groups
  }

  const points: HistoryPoint[] = []
  const today_key = day_key(new Date(now))
  let net_invested = 0

  for (let d = start; ; d = new Date(d.getTime() + DAY_MS)) {
    // Re-anchor to local midnight so day arithmetic never drifts
    d = new Date(d.getFullYear(), d.getMonth(), d.getDate())
    const key = day_key(d)
    if (key > today_key) break
    const is_today = key === today_key
    const fx = is_today
      ? today.fx_rate
      : (manual_fx ?? (fx_row ? price_on(series[fx_row.quote_id], key) : null) ?? today.fx_rate)
    const flow = (flows_by_day.get(key) ?? []).reduce((s, f) => s + to_twd(f.amount, f.currency, fx), 0)

    const state = replay(sheet, is_today ? now : d.getTime() + DAY_MS - 1)
    const groups = value(
      state,
      (id) => (is_today ? live_price.get(id) : price_on(series[id], key)) ?? live_price.get(id) ?? 0,
      fx,
    )
    const total = Object.values(groups).reduce((s, v) => s + v, 0)

    net_invested = points.length === 0 ? total : net_invested + flow
    points.push({ key, total, net_invested, flow: points.length === 0 ? 0 : flow, groups })
  }
  return points
}
