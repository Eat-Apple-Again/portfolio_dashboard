import { useMemo, useState } from 'react'
import { to_ts } from '../lib/dates'
import { fmt_money, fmt_price, fmt_qty, fmt_signed_money } from '../lib/format'
import { build_statement, type StatementRow } from '../lib/portfolio'
import type { AccountBalance, CashEntry } from '../types'
import { Segmented } from './form_fields'
import { ACCOUNT_TYPE_LABEL } from './section_meta'
import { Sheet, SheetHeader } from './sheet'

type Period = 'ALL' | 'MONTH' | 'WEEK' | 'DAY'

const PERIODS: { value: Period; label: string }[] = [
  { value: 'ALL', label: '全部' },
  { value: 'MONTH', label: '本月' },
  { value: 'WEEK', label: '本週' },
  { value: 'DAY', label: '今天' },
]

const TRADE_KINDS = new Set(['BUY', 'SELL', 'DIVIDEND'])

// Wide screens: date | description | amount | balance; narrow: amount and balance stack
const ROW = 'grid grid-cols-[3.5rem_1fr_auto] items-baseline gap-x-3 sm:grid-cols-[4rem_1fr_8rem_8rem]'

interface Props {
  account: AccountBalance
  hide: boolean
  on_close: () => void
}

/** Statement of one cash account: every transfer and settlement with the balance after it */
export function AccountSheet({ account: a, hide, on_close }: Props) {
  const [period, set_period] = useState<Period>('ALL')
  // Periods are relative to when the sheet was opened
  const [now] = useState(() => new Date())
  const acc = a.account
  const cur = acc.currency
  const rows = useMemo(() => build_statement(a), [a])

  const [from, to] = period_range(period, now)
  const in_period = (ts: number | null) => ts != null && ts >= from && ts < to
  const visible = rows.filter((r) => in_period(r.entry.ts))
  const inflow = visible.reduce((s, r) => s + Math.max(r.entry.delta, 0), 0)
  const outflow = visible.reduce((s, r) => s + Math.min(r.entry.delta, 0), 0)
  const opening_ts = to_ts(acc.opening_date)
  const show_opening = period === 'ALL' || in_period(opening_ts)
  const has_pending = Math.abs(a.pending) > 1e-9

  return (
    <Sheet on_close={on_close} size="lg">
      {/* Header, totals and filters stay put while the list scrolls */}
      <div className="sticky top-0 z-10 -mx-5 bg-slate-900 px-5 pb-2">
        <SheetHeader
          eyebrow={`${ACCOUNT_TYPE_LABEL[acc.type] ?? acc.type} · ${cur}`}
          title={acc.account}
          sub={acc.note || undefined}
          on_close={on_close}
        />

        <dl className="mt-4 grid grid-cols-3 gap-2 rounded-xl bg-slate-800/60 p-3 text-center text-sm tabular-nums">
          <Stat label="餘額" value={fmt_money(a.balance, cur, hide)} />
          <Stat
            label="待交割"
            value={has_pending ? fmt_signed_money(a.pending, cur, hide) : '—'}
            tone={has_pending ? 'text-amber-400' : 'text-slate-500'}
          />
          <Stat label="可用" value={fmt_money(a.available, cur, hide)} />
        </dl>

        <div className="mt-3">
          <Segmented options={PERIODS} value={period} on_change={set_period} />
        </div>

        <div className="mt-3 flex justify-between gap-3 text-xs tabular-nums text-slate-400">
          <span>{visible.length} 筆</span>
          <span>
            流入 {fmt_signed_money(inflow, cur, hide)} · 流出 {fmt_signed_money(outflow, cur, hide)}
          </span>
        </div>

        <div className={`${ROW} mt-2 hidden border-t border-slate-800 pt-2 text-xs text-slate-500 sm:grid`}>
          <span>日期</span>
          <span>內容</span>
          <span className="text-right">金額</span>
          <span className="text-right">餘額</span>
        </div>
      </div>

      <ul className="divide-y divide-slate-800/80 text-sm">
        {visible.map((r) => (
          <EntryRow key={r.entry.key} row={r} currency={cur} hide={hide} />
        ))}
        {show_opening && (
          <li className={`${ROW} py-2.5`}>
            <span className="text-xs tabular-nums text-slate-500">{fmt_day(opening_ts)}</span>
            <span className="text-slate-400">期初餘額</span>
            <span className="hidden sm:block" />
            <span className="text-right tabular-nums text-slate-400">{fmt_money(acc.opening_balance ?? 0, cur, hide)}</span>
          </li>
        )}
      </ul>
      {visible.length === 0 && !show_opening && <p className="py-10 text-center text-sm text-slate-500">這段期間沒有紀錄</p>}
    </Sheet>
  )
}

function EntryRow({ row: { entry: e, balance }, currency, hide }: { row: StatementRow; currency: string; hide: boolean }) {
  const is_trade = TRADE_KINDS.has(e.kind)
  const details = [
    is_trade ? e.counterparty : e.note,
    e.fee ? `手續費 ${fmt_money(e.fee, currency, hide)}` : '',
    e.rate ? `匯率 ${fmt_price(e.rate)}` : '',
    is_trade ? e.note : '',
  ].filter(Boolean)

  return (
    <li className={`${ROW} py-2.5`}>
      <span className={`text-xs tabular-nums ${e.pending ? 'text-amber-400' : 'text-slate-500'}`}>{fmt_day(e.ts)}</span>
      <div className="min-w-0">
        <p className="truncate">{title(e, hide)}</p>
        {(details.length > 0 || e.pending) && (
          <p className="truncate text-xs text-slate-500">
            {e.pending && <span className="text-amber-400">待交割{details.length > 0 && ' · '}</span>}
            {details.join(' · ')}
          </p>
        )}
      </div>
      {/* sm:contents lets amount and balance become their own grid columns */}
      <div className="text-right tabular-nums sm:contents">
        <p className={`sm:text-right ${e.pending ? 'text-amber-400' : ''}`}>{fmt_signed_money(e.delta, currency, hide)}</p>
        <p className="text-xs text-slate-500 sm:text-right sm:text-sm sm:text-slate-400">{fmt_money(balance, currency, hide)}</p>
      </div>
    </li>
  )
}

function title(e: CashEntry, hide: boolean): string {
  const qty = e.quantity ? ` × ${fmt_qty(e.quantity, hide)}` : ''
  switch (e.kind) {
    case 'BUY':
      return `買進 ${e.symbol}${qty}`
    case 'SELL':
      return `賣出 ${e.symbol}${qty}`
    case 'DIVIDEND':
      return `股利 ${e.symbol}`
    case 'TRANSFER_IN':
      return `轉入 ← ${e.counterparty}`
    case 'TRANSFER_OUT':
      return `轉出 → ${e.counterparty}`
    case 'INCOME':
      return '收入'
    case 'EXPENSE':
      return '支出'
  }
}

/** [start, end) in local time; weeks start on Monday. Future-dated settlements inside the period are included */
function period_range(p: Period, now: Date): [number, number] {
  const y = now.getFullYear()
  const m = now.getMonth()
  const d = now.getDate()
  switch (p) {
    case 'ALL':
      return [-Infinity, Infinity]
    case 'MONTH':
      return [new Date(y, m, 1).getTime(), new Date(y, m + 1, 1).getTime()]
    case 'WEEK': {
      const monday = d - ((now.getDay() + 6) % 7)
      return [new Date(y, m, monday).getTime(), new Date(y, m, monday + 7).getTime()]
    }
    case 'DAY':
      return [new Date(y, m, d).getTime(), new Date(y, m, d + 1).getTime()]
  }
}

/** "MM/DD", with the year when it is not the current one */
function fmt_day(ts: number | null): string {
  if (ts == null) return '—'
  const d = new Date(ts)
  const md = `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`
  return d.getFullYear() === new Date().getFullYear() ? md : `${String(d.getFullYear()).slice(2)}/${md}`
}

function Stat({ label, value, tone = '' }: { label: string; value: string; tone?: string }) {
  return (
    <div>
      <dt className="text-xs text-slate-400">{label}</dt>
      <dd className={`mt-0.5 font-medium ${tone}`}>{value}</dd>
    </div>
  )
}
