import type { DailySeries } from './api'
import type { Portfolio, SheetData } from '../types'
import { INVEST_TYPES, replay } from './portfolio'
import { to_ts } from './dates'

export const BANK_GROUP = '帳戶現金'

export interface HistoryPoint {
  key: string // YYYY-MM-DD (local calendar day)
  total: number
  /** Opening total + cumulative outside money (income − expense): the line total would follow with zero market movement */
  net_invested: number
  /** Outside money that arrived during this day */
  flow: number
  groups: Record<string, number>
}

const DAY_MS = 86_400_000

export function day_key(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Latest close on or before `key`; before the first close, the first close (carry back) */
function price_on(series: DailySeries | undefined, key: string): number | null {
  if (!series || series.length === 0) return null
  let lo = 0
  let hi = series.length - 1
  if (key < series[0][0]) return series[0][1]
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (series[mid][0] <= key) lo = mid
    else hi = mid - 1
  }
  return series[lo][1]
}

/**
 * Chart groups, bottom of the stack first: custom bank groups (e.g. an emergency fund, which barely moves),
 * then other bank cash, then each holding account in dashboard order.
 */
export function chart_groups(sheet: SheetData, today: Portfolio): string[] {
  const custom = sheet.accounts.filter((a) => a.type === 'BANK' && a.group).map((a) => a.group)
  return [...new Set([...custom, BANK_GROUP, ...today.groups.map((g) => g.account)])]
}

/** Earliest account opening date: the first day history can be reconstructed for */
export function history_start(sheet: SheetData): Date | null {
  const ts = sheet.accounts.map((a) => to_ts(a.opening_date)).filter((t): t is number => t != null)
  if (ts.length === 0) return null
  const d = new Date(Math.min(...ts))
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

/**
 * Value the replayed state at each past day's close; today's point uses the live portfolio
 * so the chart always ends exactly at the dashboard total.
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
  const fx_on = (key: string) => manual_fx ?? (fx_row ? price_on(series[fx_row.quote_id], key) : null) ?? today.fx_rate
  const to_twd = (amount: number, currency: string, fx: number | null) =>
    currency === 'TWD' ? amount : currency === 'USD' && fx != null ? amount * fx : 0

  const currency_of = new Map(sheet.accounts.map((a) => [a.account, a.currency]))
  const live_price = new Map(
    today.groups.flatMap((g) => g.positions).map((p) => [p.holding.quote_id, p.price] as const),
  )
  const group_of_cash = new Map(
    sheet.accounts.map((a) => [
      a.account,
      a.type === 'BROKER' || a.type === 'EXCHANGE' ? a.broker || a.account : a.group || BANK_GROUP,
    ]),
  )

  // Outside money per calendar day (income has no from_account, expense has no to_account)
  const flows_by_day = new Map<string, { currency: string; amount: number }[]>()
  for (const tr of sheet.transfers) {
    const ts = to_ts(tr.datetime)
    if (ts == null || tr.amount == null || (tr.from_account && tr.to_account)) continue
    const key = day_key(new Date(ts))
    const list = flows_by_day.get(key) ?? []
    if (!tr.from_account) list.push({ currency: currency_of.get(tr.to_account) ?? 'TWD', amount: tr.to_amount ?? tr.amount })
    else list.push({ currency: currency_of.get(tr.from_account) ?? 'TWD', amount: -(tr.amount + (tr.fee ?? 0)) })
    flows_by_day.set(key, list)
  }

  const points: HistoryPoint[] = []
  const today_key = day_key(new Date(now))
  let net_invested = 0

  for (let d = start; ; d = new Date(d.getTime() + DAY_MS)) {
    // Re-anchor to local midnight so DST-free arithmetic never drifts
    d = new Date(d.getFullYear(), d.getMonth(), d.getDate())
    const key = day_key(d)
    if (key > today_key) break
    const fx = fx_on(key)
    const flow = (flows_by_day.get(key) ?? []).reduce((s, f) => s + to_twd(f.amount, f.currency, fx), 0)

    let total: number
    let groups: Record<string, number>
    if (key === today_key) {
      groups = Object.fromEntries(today.groups.map((g) => [g.account, g.value_twd]))
      for (const a of today.accounts) {
        const g = a.account.group || BANK_GROUP
        groups[g] = (groups[g] ?? 0) + (a.available_twd ?? 0)
      }
      total = today.totals.value_twd
    } else {
      const state = replay(sheet, d.getTime() + DAY_MS - 1)
      groups = {}
      const add = (g: string, v: number) => (groups[g] = (groups[g] ?? 0) + v)
      for (const p of state.positions.values()) {
        if (p.qty <= 1e-9 || !(INVEST_TYPES as string[]).includes(p.holding.type)) continue
        const price =
          price_on(series[p.holding.quote_id], key) ?? live_price.get(p.holding.quote_id) ?? p.holding.sheet_price ?? 0
        add(p.holding.account, to_twd(p.qty * price, p.holding.currency, fx))
      }
      for (const [account, c] of state.cash) {
        add(group_of_cash.get(account) ?? BANK_GROUP, to_twd(c.balance + c.pending, currency_of.get(account) ?? 'TWD', fx))
      }
      total = Object.values(groups).reduce((s, v) => s + v, 0)
    }

    net_invested = points.length === 0 ? total : net_invested + flow
    points.push({ key, total, net_invested, flow: points.length === 0 ? 0 : flow, groups })
  }
  return points
}
