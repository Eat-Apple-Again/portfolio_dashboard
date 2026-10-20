import type { Holding, Portfolio, Position, PriceSource, QuoteMap, SectionType } from '../types'

export const SECTION_TYPES: SectionType[] = ['TW_STOCK', 'US_STOCK', 'CRYPTO', 'CASH']

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

function build_position(h: Holding, quotes: QuoteMap, fx_rate: number | null): Position {
  const qty = h.quantity ?? 0

  if (h.type === 'CASH') {
    const value_twd = to_twd(qty, h.currency, fx_rate)
    return {
      holding: h,
      price: null,
      price_source: 'none',
      quote_time: null,
      day_change_pct: null,
      value: qty,
      cost: null,
      pnl: null,
      pnl_pct: null,
      value_twd,
      cost_twd: null,
      pnl_twd: null,
    }
  }

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

export function build_portfolio(holdings: Holding[], quotes: QuoteMap): Portfolio {
  const fx = resolve_fx(holdings, quotes)
  const warnings: string[] = []
  if (fx.rate == null) warnings.push('找不到 USD/TWD 匯率，美元資產無法換算成台幣')

  const sections = Object.fromEntries(SECTION_TYPES.map((t) => [t, [] as Position[]])) as Record<
    SectionType,
    Position[]
  >
  for (const h of holdings) {
    if (h.type === 'FX' || !(h.type in sections)) continue
    const p = build_position(h, quotes, fx.rate)
    if (h.type !== 'CASH' && p.price == null) warnings.push(`${h.symbol} 抓不到報價`)
    sections[h.type].push(p)
  }

  // Largest positions first
  for (const t of SECTION_TYPES) {
    sections[t].sort((a, b) => (b.value_twd ?? 0) - (a.value_twd ?? 0))
  }

  const by_type = Object.fromEntries(
    SECTION_TYPES.map((t) => [t, sections[t].reduce((s, p) => s + (p.value_twd ?? 0), 0)]),
  ) as Record<SectionType, number>

  const invested = SECTION_TYPES.filter((t) => t !== 'CASH').flatMap((t) => sections[t])
  const invested_cost_twd = invested.reduce((s, p) => s + (p.cost_twd ?? 0), 0)
  const invested_pnl_twd = invested.reduce((s, p) => s + (p.pnl_twd ?? 0), 0)

  return {
    fx_rate: fx.rate,
    fx_source: fx.source,
    sections,
    totals: {
      value_twd: Object.values(by_type).reduce((s, v) => s + v, 0),
      invested_cost_twd,
      invested_pnl_twd,
      invested_pnl_pct: invested_cost_twd ? invested_pnl_twd / invested_cost_twd : null,
      by_type,
    },
    warnings,
  }
}
