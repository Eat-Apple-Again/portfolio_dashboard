export type AssetType = 'TW_STOCK' | 'US_STOCK' | 'CRYPTO' | 'CASH' | 'FX'

export type Currency = 'TWD' | 'USD'

/** One row of the `holdings` sheet, as returned by Apps Script */
export interface Holding {
  type: AssetType
  symbol: string
  quote_id: string
  name: string
  quantity: number | null
  avg_cost: number | null
  currency: string
  account: string
  sheet_price: number | null
  note: string
}

export interface Quote {
  price: number
  prev_close: number | null
  currency: string
  time: number
}

export type QuoteMap = Record<string, Quote | null>

export type SheetResponse =
  | { ok: true; updated_at: string; holdings: Holding[]; quotes: QuoteMap }
  | { ok: false; error: string }

export interface Credentials {
  api_url: string
  token: string
}

export type PriceSource = 'live' | 'sheet' | 'none'

/** Holding enriched with price and P/L; amounts are in the holding's own currency unless suffixed _twd */
export interface Position {
  holding: Holding
  price: number | null
  price_source: PriceSource
  quote_time: number | null
  day_change_pct: number | null
  value: number | null
  cost: number | null
  pnl: number | null
  pnl_pct: number | null
  value_twd: number | null
  cost_twd: number | null
  pnl_twd: number | null
}

export type SectionType = Exclude<AssetType, 'FX'>

export interface Portfolio {
  fx_rate: number | null
  fx_source: 'manual' | 'live' | 'sheet' | 'none'
  sections: Record<SectionType, Position[]>
  totals: {
    value_twd: number
    invested_cost_twd: number
    invested_pnl_twd: number
    invested_pnl_pct: number | null
    by_type: Record<SectionType, number>
  }
  warnings: string[]
}
