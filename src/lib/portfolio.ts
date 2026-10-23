import type {
  AccountBalance,
  AccountGroup,
  Holding,
  InvestType,
  Portfolio,
  Position,
  PriceSource,
  QuoteMap,
  SectionType,
  SheetData,
  Shortfall,
} from '../types'
import { to_ts } from './dates'

export const INVEST_TYPES: InvestType[] = ['TW_STOCK', 'US_STOCK', 'CRYPTO']
export const SECTION_TYPES: SectionType[] = [...INVEST_TYPES, 'CASH']

const EPS = 1e-9

function resolve_fx(holdings: Holding[], quotes: QuoteMap) {
  const fx = holdings.find((h) => h.type === 'FX')
  if (!fx) return { rate: null, source: 'none' as const }
  if (fx.avg_cost) return { rate: fx.avg_cost, source: 'manual' as const }
  const live = quotes[fx.quote_id]?.price
  if (live) return { rate: live, source: 'live' as const }
  if (fx.sheet_price) return { rate: fx.sheet_price, source: 'sheet' as const }
  return { rate: null, source: 'none' as const }
}

function to_twd(amount: number | null, currency: string, fx_rate: number | null): number | null {
  if (amount == null) return null
  if (currency === 'TWD') return amount
  if (currency === 'USD') return fx_rate == null ? null : amount * fx_rate
  return null
}

function price_position(h: Holding, quotes: QuoteMap, fx_rate: number | null): Position {
  const qty = h.quantity ?? 0
  const quote = quotes[h.quote_id] ?? null
  let price: number | null = null
  let price_source: PriceSource = 'none'
  if (quote?.price) {
    price = quote.price
    price_source = 'live'
  } else if (h.sheet_price) {
    price = h.sheet_price
    price_source = 'sheet'
  }

  const value = price == null ? null : price * qty
  const cost = h.avg_cost == null ? null : h.avg_cost * qty
  const pnl = value != null && cost != null ? value - cost : null
  const pnl_pct = pnl != null && cost ? pnl / cost : null
  const day_change_pct =
    price_source === 'live' && quote?.prev_close ? price! / quote.prev_close - 1 : null

  return {
    holding: h,
    price,
    price_source,
    quote_time: price_source === 'live' ? (quote?.time ?? null) : null,
    day_change_pct,
    value,
    cost,
    pnl,
    pnl_pct,
    // USD cost is converted at the current rate, so pnl_twd excludes FX gains/losses
    value_twd: to_twd(value, h.currency, fx_rate),
    cost_twd: to_twd(cost, h.currency, fx_rate),
    pnl_twd: to_twd(pnl, h.currency, fx_rate),
  }
}

export interface PositionState {
  holding: Holding
  qty: number
  cost: number | null
}

export interface CashState {
  balance: number
  pending: number
  next_debit_ts: number | null
}

export interface ReplayState {
  positions: Map<string, PositionState>
  cash: Map<string, CashState>
  warnings: string[]
}

/**
 * Opening snapshot (holdings + accounts) + events up to `now`.
 * - Positions change on the trade date (moving-average cost; sells keep the average)
 * - Cash changes on settle_date; settlements after `now` are reported as pending
 */
export function replay(data: Omit<SheetData, 'quotes' | 'updated_at'>, now: number): ReplayState {
  const warnings: string[] = []
  // Opening date per cash account; trades are dated against their cash account
  const opening = new Map<string, number>()
  const cash = new Map<string, CashState>()
  for (const a of data.accounts) {
    if (!a.account) continue
    const ts = to_ts(a.opening_date)
    if (ts == null) warnings.push(`accounts「${a.account}」缺少 opening_date`)
    opening.set(a.account, ts ?? 0)
    cash.set(a.account, { balance: a.opening_balance ?? 0, pending: 0, next_debit_ts: null })
  }

  const positions = new Map<string, PositionState>()
  const pos_key = (account: string, symbol: string) => `${account}|${symbol}`
  for (const h of data.holdings) {
    if (h.type === 'CASH') {
      warnings.push(`holdings 的 CASH 列（${h.symbol}）已改由 accounts 管理，請刪除`)
      continue
    }
    if (!INVEST_TYPES.includes(h.type as InvestType)) continue
    const qty = h.quantity ?? 0
    positions.set(pos_key(h.account, h.symbol), {
      holding: h,
      qty,
      // A zero-quantity row (new symbol) starts with zero cost even if avg_cost is blank
      cost: h.avg_cost == null ? (qty === 0 ? 0 : null) : h.avg_cost * qty,
    })
  }

  const trades = data.trades
    .map((t) => ({ t, ts: to_ts(t.trade_date) }))
    .sort((a, b) => (a.ts ?? 0) - (b.ts ?? 0))

  for (const { t, ts } of trades) {
    const label = `${t.account} ${t.symbol}`
    if (ts == null || t.amount == null) {
      warnings.push(`trades「${label}」缺少 trade_date 或 amount，已略過`)
      continue
    }
    if (ts > now) continue

    const start = opening.get(t.cash_account)
    const cash_state = cash.get(t.cash_account)
    if (start == null || !cash_state) {
      warnings.push(`trades「${label}」的 cash_account「${t.cash_account}」不在 accounts 中`)
      continue
    }

    // Position: only trades on/after the start date (earlier ones are already in holdings)
    if (ts >= start && (t.action === 'BUY' || t.action === 'SELL')) {
      const p = positions.get(pos_key(t.account, t.symbol))
      const qty = t.quantity ?? 0
      if (!p) {
        warnings.push(`trades「${label}」在 holdings 中找不到對應標的`)
      } else if (t.action === 'BUY') {
        p.qty += qty
        p.cost = p.cost == null ? null : p.cost + t.amount
      } else {
        const avg = p.qty > EPS && p.cost != null ? p.cost / p.qty : null
        p.qty -= qty
        p.cost = avg == null ? p.cost : p.cost! - avg * qty
        if (Math.abs(p.qty) < EPS) {
          p.qty = 0
          p.cost = 0
        }
        if (p.qty < 0) warnings.push(`${label} 賣出數量超過持有數量`)
      }
    }

    // Cash: on settle date (defaults to trade datetime)
    const settle_ts = to_ts(t.settle_date) ?? ts
    if (settle_ts >= start) {
      const delta = t.action === 'BUY' ? -t.amount : t.amount
      if (settle_ts <= now) cash_state.balance += delta
      else {
        cash_state.pending += delta
        if (delta < 0 && (cash_state.next_debit_ts == null || settle_ts < cash_state.next_debit_ts)) {
          cash_state.next_debit_ts = settle_ts
        }
      }
    }
  }

  for (const tr of data.transfers) {
    const ts = to_ts(tr.datetime)
    const label = `${tr.from_account || '收入'} → ${tr.to_account || '支出'}`
    if (ts == null || tr.amount == null) {
      warnings.push(`transfers「${label}」缺少 datetime 或 amount，已略過`)
      continue
    }
    if (ts > now) continue
    const from = cash.get(tr.from_account)
    const to = cash.get(tr.to_account)
    // A blank side is outside money: income has no from_account, expense has no to_account
    if ((tr.from_account && !from) || (tr.to_account && !to) || (!from && !to)) {
      warnings.push(`transfers「${label}」的帳戶不在 accounts 中`)
      continue
    }
    if (from && ts >= opening.get(tr.from_account)!) from.balance -= tr.amount + (tr.fee ?? 0)
    if (to && ts >= opening.get(tr.to_account)!) to.balance += tr.to_amount ?? tr.amount
  }

  return { positions, cash, warnings }
}

/** Current portfolio: replayed state valued at live quotes */
export function build_portfolio(data: Omit<SheetData, 'quotes' | 'updated_at'>, quotes: QuoteMap, now = Date.now()): Portfolio {
  const fx = resolve_fx(data.holdings, quotes)
  const warnings: string[] = []
  if (fx.rate == null) warnings.push('找不到 USD/TWD 匯率，美元資產無法換算成台幣')

  const state = replay(data, now)
  const { positions, cash } = state
  warnings.push(...state.warnings)

  const sections = Object.fromEntries(INVEST_TYPES.map((t) => [t, [] as Position[]])) as Record<
    InvestType,
    Position[]
  >
  for (const p of positions.values()) {
    if (p.qty <= EPS) continue
    const avg_cost = p.cost != null ? p.cost / p.qty : p.holding.avg_cost
    const position = price_position({ ...p.holding, quantity: p.qty, avg_cost }, quotes, fx.rate)
    if (position.price == null) warnings.push(`${p.holding.symbol} 抓不到報價`)
    sections[p.holding.type as InvestType].push(position)
  }
  for (const t of INVEST_TYPES) {
    sections[t].sort((a, b) => (b.value_twd ?? 0) - (a.value_twd ?? 0))
  }

  const accounts: AccountBalance[] = data.accounts
    .filter((a) => a.account && cash.has(a.account))
    .map((a) => {
      const { balance, pending, next_debit_ts } = cash.get(a.account)!
      const available = balance + pending
      return {
        account: a,
        balance,
        pending,
        available,
        balance_twd: to_twd(balance, a.currency, fx.rate),
        available_twd: to_twd(available, a.currency, fx.rate),
        next_debit_ts,
      }
    })

  // Pending settlements that the current balance cannot cover
  const shortfalls: Shortfall[] = accounts
    .filter((a) => a.available < -0.005)
    .map((a) => ({
      account: a.account.account,
      currency: a.account.currency,
      amount: -a.available,
      settle_ts: a.next_debit_ts,
    }))

  const by_type = {
    ...(Object.fromEntries(
      INVEST_TYPES.map((t) => [t, sections[t].reduce((s, p) => s + (p.value_twd ?? 0), 0)]),
    ) as Record<InvestType, number>),
    // Pending settlements are already reflected in positions, so count cash net of them
    CASH: accounts.reduce((s, a) => s + (a.available_twd ?? 0), 0),
  }

  const groups = build_groups(data.holdings, invested_positions(sections), accounts)

  const invested = INVEST_TYPES.flatMap((t) => sections[t])
  const invested_cost_twd = invested.reduce((s, p) => s + (p.cost_twd ?? 0), 0)
  const invested_pnl_twd = invested.reduce((s, p) => s + (p.pnl_twd ?? 0), 0)

  return {
    fx_rate: fx.rate,
    fx_source: fx.source,
    groups,
    // Bank accounts only; broker / exchange cash is shown inside its group
    accounts: accounts.filter((a) => !is_broker_cash(a)),
    totals: {
      value_twd: Object.values(by_type).reduce((s, v) => s + v, 0),
      invested_cost_twd,
      invested_pnl_twd,
      invested_pnl_pct: invested_cost_twd ? invested_pnl_twd / invested_cost_twd : null,
      by_type,
    },
    warnings,
    shortfalls,
  }
}

function invested_positions(sections: Record<InvestType, Position[]>): Position[] {
  return INVEST_TYPES.flatMap((t) => sections[t])
}

function is_broker_cash(a: AccountBalance): boolean {
  return a.account.type === 'BROKER' || a.account.type === 'EXCHANGE'
}

/**
 * One group per holding account, in the order accounts first appear in the holdings sheet.
 * Broker / exchange cash joins the group named by its `broker` column (or its own name).
 */
function build_groups(holdings: Holding[], positions: Position[], accounts: AccountBalance[]): AccountGroup[] {
  const groups = new Map<string, AccountGroup>()
  const ensure = (account: string) => {
    let g = groups.get(account)
    if (!g) {
      g = { account, positions: [], cash: [], value_twd: 0 }
      groups.set(account, g)
    }
    return g
  }

  for (const h of holdings) {
    if ((INVEST_TYPES as string[]).includes(h.type) && h.account) ensure(h.account)
  }
  for (const p of positions) {
    const g = ensure(p.holding.account)
    g.positions.push(p)
    g.value_twd += p.value_twd ?? 0
  }
  for (const a of accounts) {
    if (!is_broker_cash(a)) continue
    const g = ensure(a.account.broker || a.account.account)
    g.cash.push(a)
    g.value_twd += a.available_twd ?? 0
  }

  for (const g of groups.values()) g.positions.sort((a, b) => (b.value_twd ?? 0) - (a.value_twd ?? 0))
  return [...groups.values()].filter((g) => g.positions.length > 0 || g.cash.length > 0)
}
