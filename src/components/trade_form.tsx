import { useMemo, useState, type FormEvent } from 'react'
import { add_business_days, compact_to_input, fmt_compact_date, input_to_compact, parse_compact } from '../lib/dates'
import { fmt_money, parse_num } from '../lib/format'
import { INVEST_TYPES } from '../lib/portfolio'
import type { Account, Holding, InvestType, NewTrade, TradeAction } from '../types'
import { Field, NumberInput, Segmented, Select, TextInput } from './form_fields'
import { SECTION_META } from './section_meta'

const ACTIONS: { value: TradeAction; label: string }[] = [
  { value: 'BUY', label: '買進' },
  { value: 'SELL', label: '賣出' },
  { value: 'DIVIDEND', label: '股利' },
]

const NEW_SYMBOL = '__new__'

// Mirrors the Apps Script validation so errors show before submitting
const NEW_HOLDING_RULES: Record<InvestType, { currency: string; symbol: RegExp; quote_id: RegExp; example: string }> = {
  TW_STOCK: { currency: 'TWD', symbol: /^\d{4,6}[A-Z]?$/, quote_id: /^\d{4,6}[A-Z]?\.TWO?$/, example: '2330' },
  US_STOCK: { currency: 'USD', symbol: /^[A-Z][A-Z0-9.]{0,9}$/, quote_id: /^[A-Z][A-Z0-9.-]{0,9}$/, example: 'VOO' },
  CRYPTO: { currency: 'USD', symbol: /^[A-Z0-9]{1,15}$/, quote_id: /^[A-Z0-9]{1,15}-USDT$/, example: 'SOL' },
}

function default_quote_id(type: InvestType, symbol: string): string {
  if (!symbol) return ''
  if (type === 'TW_STOCK') return `${symbol}.TW`
  if (type === 'CRYPTO') return `${symbol}-USDT`
  return symbol.replace('.', '-')
}

interface Props {
  holdings: Holding[]
  accounts: Account[]
  submitting: boolean
  on_submit: (record: Omit<NewTrade, 'id'>) => void
}

/** TWD (Taiwan stocks) settle T+2 business days; others on the trade date */
function default_settle(trade_date: string, currency: string): string {
  const d = parse_compact(trade_date)
  if (!d) return ''
  return fmt_compact_date(currency === 'TWD' ? add_business_days(d, 2) : d)
}

/** Mirrors Apps Script: accounts.broker mapping, else an account with the broker's name */
function settlement_account(broker: string, accounts: Account[]): Account | null {
  return accounts.find((a) => a.broker === broker) ?? accounts.find((a) => a.account === broker) ?? null
}

function round_amount(v: number, currency: string): number {
  return currency === 'TWD' ? Math.round(v) : Math.round(v * 1e8) / 1e8
}

export function TradeForm({ holdings, accounts, submitting, on_submit }: Props) {
  const positions = useMemo(
    () => holdings.filter((h) => (INVEST_TYPES as string[]).includes(h.type)),
    [holdings],
  )
  const brokers = useMemo(
    () => [
      ...new Set([
        ...positions.map((h) => h.account),
        ...accounts.map((a) => a.broker).filter(Boolean),
      ]),
    ],
    [positions, accounts],
  )

  const [broker, set_broker] = useState(brokers[0] ?? '')
  const [action, set_action] = useState<TradeAction>('BUY')
  const [symbol, set_symbol] = useState('')
  const [trade_date, set_trade_date] = useState(() => fmt_compact_date(new Date()))
  const [quantity, set_quantity] = useState('')
  const [price, set_price] = useState('')
  const [fee, set_fee] = useState('')
  const [tax, set_tax] = useState('')
  const [amount, set_amount] = useState('')
  const [settle_override, set_settle_override] = useState<string | null>(null)
  const [note, set_note] = useState('')
  const [error, set_error] = useState<string | null>(null)

  // New symbol fields
  const symbols = positions.filter((h) => h.account === broker)
  const [new_type, set_new_type] = useState<InvestType>((symbols[0]?.type as InvestType) ?? 'TW_STOCK')
  const [new_symbol, set_new_symbol] = useState('')
  const [new_name, set_new_name] = useState('')
  const [new_quote_override, set_new_quote_override] = useState<string | null>(null)

  const is_new = symbol === NEW_SYMBOL
  const holding = is_new ? null : (symbols.find((h) => h.symbol === symbol) ?? null)
  const new_quote_id = new_quote_override ?? default_quote_id(new_type, new_symbol)
  const currency = is_new
    ? NEW_HOLDING_RULES[new_type].currency
    : (holding?.currency ?? symbols[0]?.currency ?? 'TWD')
  const is_crypto = is_new ? new_type === 'CRYPTO' : holding?.type === 'CRYPTO'
  const final_symbol = is_new ? new_symbol : symbol

  const settle_date = settle_override ?? default_settle(trade_date, currency)
  const cash_account = settlement_account(broker, accounts)?.account ?? ''

  const q = parse_num(quantity)
  const p = parse_num(price)
  const f = parse_num(fee) ?? 0
  const t = parse_num(tax) ?? 0
  const computed =
    action !== 'DIVIDEND' && q != null && p != null && !Number.isNaN(q + p + f + t)
      ? round_amount(action === 'BUY' ? q * p + f + t : q * p - f - t, currency)
      : null
  const amount_value = parse_num(amount) ?? computed

  const change_broker = (b: string) => {
    set_broker(b)
    set_symbol('')
    set_settle_override(null)
  }

  const change_action = (a: TradeAction) => {
    set_action(a)
    if (a !== 'BUY' && is_new) set_symbol('')
  }

  const handle_submit = (e: FormEvent) => {
    e.preventDefault()
    const problems: string[] = []
    if (is_new) {
      const rule = NEW_HOLDING_RULES[new_type]
      if (!rule.symbol.test(new_symbol)) problems.push(`代號格式不符（例如 ${rule.example}）`)
      if (!rule.quote_id.test(new_quote_id)) problems.push('報價代號格式不符')
      if (symbols.some((h) => h.symbol === new_symbol)) problems.push('這個標的已存在，請直接從清單選擇')
    } else if (!holding) {
      problems.push('請選擇標的')
    }
    if (!parse_compact(trade_date)) problems.push('請選擇成交日')
    if (!parse_compact(settle_date)) problems.push('請選擇交割日')
    if (action !== 'DIVIDEND' && !(q != null && q > 0)) problems.push('數量必須大於 0')
    if (action !== 'DIVIDEND' && !(p != null && p > 0)) problems.push('價格必須大於 0')
    if ([f, t].some((v) => Number.isNaN(v) || v < 0)) problems.push('手續費 / 稅必須是非負數')
    if (amount_value == null || Number.isNaN(amount_value) || amount_value <= 0) problems.push('金額必須大於 0')
    if (!cash_account) problems.push(`accounts 尚未設定「${broker}」的交割帳戶（broker 欄）`)
    if (problems.length) return set_error(problems.join('、'))

    set_error(null)
    on_submit({
      trade_date,
      account: broker,
      action,
      symbol: final_symbol,
      quantity: q ?? '',
      price: p ?? '',
      fee: parse_num(fee) ?? '',
      tax: parse_num(tax) ?? '',
      amount: amount_value!,
      cash_account,
      settle_date,
      note: note.trim(),
      ...(is_new && { new_holding: { type: new_type, quote_id: new_quote_id, name: new_name.trim() } }),
    })
  }

  const cash_sign = action === 'BUY' ? '扣款' : '入帳'

  return (
    <form onSubmit={handle_submit} className="space-y-4">
      <Segmented options={ACTIONS} value={action} on_change={change_action} />

      <div className="grid grid-cols-2 gap-3">
        <Field label="帳戶">
          <Select value={broker} onChange={(e) => change_broker(e.target.value)}>
            {brokers.map((b) => (
              <option key={b}>{b}</option>
            ))}
          </Select>
        </Field>
        <Field label="標的">
          <Select value={symbol} onChange={(e) => set_symbol(e.target.value)}>
            <option value="">請選擇</option>
            {symbols.map((h) => (
              <option key={h.symbol} value={h.symbol}>
                {h.symbol} {h.name && h.name !== h.symbol ? h.name : ''}
              </option>
            ))}
            {action === 'BUY' && <option value={NEW_SYMBOL}>＋ 新增標的</option>}
          </Select>
        </Field>
      </div>

      {is_new && (
        <div className="space-y-3 rounded-lg border border-slate-700 p-3">
          <Segmented
            options={(Object.keys(NEW_HOLDING_RULES) as InvestType[]).map((v) => ({
              value: v,
              label: SECTION_META[v].label,
            }))}
            value={new_type}
            on_change={(v) => {
              set_new_type(v)
              set_new_quote_override(null)
            }}
          />
          <div className="grid grid-cols-2 gap-3">
            <Field label="代號">
              <TextInput
                value={new_symbol}
                placeholder={NEW_HOLDING_RULES[new_type].example}
                onChange={(e) => set_new_symbol(e.target.value.toUpperCase().trim())}
              />
            </Field>
            <Field label="名稱">
              <TextInput value={new_name} maxLength={50} onChange={(e) => set_new_name(e.target.value)} />
            </Field>
          </div>
          <Field
            label="報價代號"
            hint={new_type === 'TW_STOCK' ? '上市 .TW、上櫃 .TWO' : new_type === 'CRYPTO' ? 'OKX 交易對' : 'Yahoo 代號'}
          >
            <TextInput value={new_quote_id} onChange={(e) => set_new_quote_override(e.target.value.toUpperCase().trim())} />
          </Field>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Field label="成交日">
          <TextInput
            type="date"
            value={compact_to_input(trade_date)}
            onChange={(e) => set_trade_date(input_to_compact(e.target.value))}
          />
        </Field>
        <Field label="交割日" hint={currency === 'TWD' ? '預設 T+2（未排除國定假日）' : '預設為成交日'}>
          <TextInput
            type="date"
            value={compact_to_input(settle_date)}
            onChange={(e) => set_settle_override(input_to_compact(e.target.value))}
          />
        </Field>
      </div>

      {action !== 'DIVIDEND' && (
        <div className="grid grid-cols-2 gap-3">
          <Field label="數量" hint={is_crypto && action === 'BUY' ? '實際到帳數量（扣除手續費後）' : undefined}>
            <NumberInput value={quantity} onChange={(e) => set_quantity(e.target.value)} />
          </Field>
          <Field label={`價格（${currency}）`}>
            <NumberInput value={price} onChange={(e) => set_price(e.target.value)} />
          </Field>
          <Field label="手續費">
            <NumberInput value={fee} onChange={(e) => set_fee(e.target.value)} placeholder="0" />
          </Field>
          <Field label="交易稅">
            <NumberInput value={tax} onChange={(e) => set_tax(e.target.value)} placeholder="0" />
          </Field>
        </div>
      )}

      <Field
        label={`${action === 'BUY' ? '實付' : '實收'}金額（${currency}）`}
        hint={
          action === 'DIVIDEND'
            ? '實際入帳金額（扣除預扣稅後）'
            : is_crypto && action === 'BUY'
              ? '花費的 USDT（委託價值）。留空則自動計算'
              : '留空則自動計算；可改成券商 App 上的實際金額'
        }
      >
        <NumberInput
          value={amount}
          onChange={(e) => set_amount(e.target.value)}
          placeholder={computed != null ? String(computed) : ''}
        />
      </Field>

      <p className="text-sm text-slate-400">
        {cash_sign}帳戶：
        {cash_account ? (
          <span className="text-slate-200">{cash_account}</span>
        ) : (
          <span className="text-rose-400">未設定（請在 accounts 的 broker 欄填入「{broker}」）</span>
        )}
      </p>

      <Field label="備註">
        <TextInput value={note} maxLength={200} onChange={(e) => set_note(e.target.value)} />
      </Field>

      {amount_value != null && !Number.isNaN(amount_value) && cash_account && (
        <p className="rounded-lg bg-slate-800/60 px-3 py-2 text-sm text-slate-300">
          {action !== 'DIVIDEND' && final_symbol && (
            <>
              {final_symbol} {action === 'BUY' ? '+' : '−'}
              {quantity || 0}
              <br />
            </>
          )}
          {cash_account} 於 {settle_date || '—'} {cash_sign} {fmt_money(amount_value, currency)} {currency}
        </p>
      )}

      {error && <p className="text-sm text-rose-400">{error}</p>}

      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-lg bg-sky-600 py-2.5 font-medium hover:bg-sky-500 active:bg-sky-700 disabled:opacity-50"
      >
        {submitting ? '送出中…' : '送出'}
      </button>
    </form>
  )
}
