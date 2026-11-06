export type AssetType = 'TW_STOCK' | 'US_STOCK' | 'CRYPTO' | 'FX'

/** One row of the `holdings` sheet: opening positions as of the start date */
export interface Holding {
  type: AssetType | string
  symbol: string
  quote_id: string
  name: string
  quantity: number | null
  avg_cost: number | null
  currency: string
  account: string
  sheet_price: number | null
  /** Expected annual return in percent (8 = 8%), used by the forecast */
  expected_return?: number | null
  note: string
}

/** One row of the `accounts` sheet */
export interface Account {
  account: string
  type: string
  currency: string
  opening_balance: number | null
  opening_date: string | null
  /** Broker (holdings.account) that settles through this cash account */
  broker: string
  /**
   * Investment purpose: a holding account name (cash waiting to be invested there), another name
   * (a standalone reserve such as 總儲備), or blank (outside the investment scope)
   */
  group: string
  note: string
}

export type TradeAction = 'BUY' | 'SELL' | 'DIVIDEND'

export interface Trade {
  id: string
  trade_date: string | null
  account: string
  action: TradeAction | string
  symbol: string
  quantity: number | null
  price: number | null
  fee: number | null
  tax: number | null
  amount: number | null
  cash_account: string
  settle_date: string | null
  note: string
}

export interface Transfer {
  id: string
  datetime: string | null
  from_account: string
  to_account: string
  amount: number | null
  to_amount: number | null
  fee: number | null
  note: string
}

export interface Quote {
  price: number
  prev_close: number | null
  currency: string
  time: number
}

export type QuoteMap = Record<string, Quote | null>

export interface SheetData {
  updated_at: string
  holdings: Holding[]
  accounts: Account[]
  trades: Trade[]
  transfers: Transfer[]
  presets: Preset[]
  quotes: QuoteMap
}

/** Quick-pick note from the optional `presets` sheet; kind = TRANSFER / INCOME / EXPENSE / ALL */
export interface Preset {
  kind: string
  note: string
}

export type SheetResponse = ({ ok: true } & SheetData) | { ok: false; error: string }

export interface Credentials {
  api_url: string
  token: string
}

export type PriceSource = 'live' | 'sheet' | 'none'

/** Holding after applying trades, enriched with price and P/L; amounts in the holding's currency unless suffixed _twd */
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

/** Cash account after applying transfers and settled trades */
export interface AccountBalance {
  account: Account
  balance: number
  pending: number
  available: number
  balance_twd: number | null
  available_twd: number | null
  /** Earliest future settlement debit, for shortfall alerts */
  next_debit_ts: number | null
  /** Every cash movement applied by replay, in replay order */
  entries: CashEntry[]
}

export type CashEntryKind = 'BUY' | 'SELL' | 'DIVIDEND' | 'TRANSFER_IN' | 'TRANSFER_OUT' | 'INCOME' | 'EXPENSE'

export interface CashEntry {
  key: string
  /** Settle date for trades, datetime for transfers */
  ts: number
  kind: CashEntryKind
  /** Signed change in this account's currency (fees included) */
  delta: number
  pending: boolean
  /** Holding account for trades; the other cash account for transfers */
  counterparty: string
  symbol: string
  quantity: number | null
  fee: number | null
  /** Cross-currency transfers: from amount per to amount */
  rate: number | null
  note: string
}

export interface Shortfall {
  account: string
  currency: string
  amount: number
  settle_ts: number | null
}

/** Positions and broker cash that live in the same account (e.g. a brokerage) */
export interface AccountGroup {
  account: string
  positions: Position[]
  cash: AccountBalance[]
  value_twd: number
}

export type InvestType = 'TW_STOCK' | 'US_STOCK' | 'CRYPTO'
export type SectionType = InvestType | 'CASH'

/** Cash waiting to be invested, per market (all its holding accounts merged) or standalone reserve */
export interface InvestCash {
  /** Market type, or the reserve's group name */
  bucket: string
  /** Market of the holding account; null for a standalone reserve */
  type: InvestType | null
  accounts: AccountBalance[]
  value_twd: number
}

export interface Portfolio {
  fx_rate: number | null
  fx_source: 'manual' | 'live' | 'sheet' | 'none'
  groups: AccountGroup[]
  accounts: AccountBalance[]
  /** Available cash split by purpose; sums to totals.by_type.CASH */
  cash_split: { invest: number; other: number; emergency: number }
  /** Accounts behind cash_split.other / emergency */
  cash_accounts: { other: AccountBalance[]; emergency: AccountBalance[] }
  invest_cash: InvestCash[]
  totals: {
    value_twd: number
    invested_cost_twd: number
    invested_pnl_twd: number
    invested_pnl_pct: number | null
    by_type: Record<SectionType, number>
  }
  warnings: string[]
  shortfalls: Shortfall[]
}

export interface NewHolding {
  type: InvestType
  quote_id: string
  name: string
}

export interface NewTrade {
  id: string
  trade_date: string
  account: string
  action: TradeAction
  symbol: string
  quantity: number | ''
  price: number | ''
  fee: number | ''
  tax: number | ''
  amount: number
  cash_account: string
  settle_date: string
  note: string
  new_holding?: NewHolding
}

export interface NewTransfer {
  id: string
  datetime: string
  from_account: string
  to_account: string
  amount: number
  to_amount: number | ''
  fee: number | ''
  note: string
}
