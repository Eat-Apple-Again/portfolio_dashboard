import { fmt_compact_date, fmt_compact_datetime, to_ts } from '../lib/dates'
import { fmt_money, fmt_qty } from '../lib/format'
import type { SheetData } from '../types'
import { SectionCard } from './section_card'

const ACTION_LABEL: Record<string, string> = { BUY: '買進', SELL: '賣出', DIVIDEND: '股利' }
const LIMIT = 6

interface Row {
  key: string
  ts: number
  date_only: boolean
  title: string
  detail: string
}

/** Latest trades and transfers, for checking what was just recorded */
export function RecentRecords({ sheet, hide }: { sheet: SheetData; hide: boolean }) {
  const currency_of = new Map(sheet.accounts.map((a) => [a.account, a.currency]))

  const rows: Row[] = [
    ...sheet.trades.map((t) => {
      const cur = currency_of.get(t.cash_account) ?? ''
      return {
        key: `t:${t.id || t.trade_date}`,
        ts: to_ts(t.trade_date) ?? 0,
        date_only: true,
        title: `${ACTION_LABEL[t.action] ?? t.action} ${t.symbol}${t.quantity ? ` × ${fmt_qty(t.quantity, hide)}` : ''}`,
        detail: `${t.account}・${t.cash_account} ${fmt_money(t.amount, cur, hide)} ${cur}`,
      }
    }),
    ...sheet.transfers.map((tr) => {
      const cur = currency_of.get(tr.from_account || tr.to_account) ?? ''
      const kind = !tr.from_account ? '收入' : !tr.to_account ? '支出' : '轉帳'
      return {
        key: `x:${tr.id || tr.datetime}`,
        ts: to_ts(tr.datetime) ?? 0,
        date_only: false,
        title: `${kind} ${tr.from_account || ''}${tr.from_account && tr.to_account ? ' → ' : ''}${tr.to_account || ''}`,
        detail: `${fmt_money(tr.amount, cur, hide)} ${cur}${tr.note ? `・${tr.note}` : ''}`,
      }
    }),
  ]
    .sort((a, b) => b.ts - a.ts)
    .slice(0, LIMIT)

  if (rows.length === 0) return null

  return (
    <SectionCard id="records" title="最近紀錄">
      <ul className="divide-y divide-slate-800/80">
        {rows.map((r) => (
          <li key={r.key} className="flex items-baseline justify-between gap-3 px-5 py-2 text-sm">
            <div className="min-w-0">
              <p className="truncate">{r.title}</p>
              <p className="truncate text-xs text-slate-500">{r.detail}</p>
            </div>
            <span className="shrink-0 text-xs tabular-nums text-slate-500">
              {r.ts ? (r.date_only ? fmt_compact_date : fmt_compact_datetime)(new Date(r.ts)) : '—'}
            </span>
          </li>
        ))}
      </ul>
    </SectionCard>
  )
}
