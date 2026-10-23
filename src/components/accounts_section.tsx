import { useState } from 'react'
import { fmt_money, fmt_signed_money } from '../lib/format'
import type { AccountBalance } from '../types'
import { SECTION_META } from './section_meta'
import { AccountsInfo } from './info_content'
import { SectionCard } from './section_card'

const TYPE_LABEL: Record<string, string> = { BANK: '銀行', BROKER: '券商', EXCHANGE: '交易所' }

// Container query: table columns only when the card itself is wide enough
const GRID = 'grid grid-cols-[1fr_auto] @lg:grid-cols-[1.6fr_1fr_1fr_1fr] gap-x-3'
const EPS = 1e-9

interface Props {
  accounts: AccountBalance[]
  subtotal_twd: number
  hide: boolean
}

/** Balance = money actually in the account; pending = settlements not yet debited/credited */
export function AccountsSection({ accounts, subtotal_twd, hide }: Props) {
  const [show_zero, set_show_zero] = useState(false)
  if (accounts.length === 0) return null

  const is_empty = (a: AccountBalance) => Math.abs(a.balance) < EPS && Math.abs(a.pending) < EPS
  const zero_count = accounts.filter(is_empty).length
  const visible = show_zero ? accounts : accounts.filter((a) => !is_empty(a))

  return (
    <SectionCard
      info={<AccountsInfo />}
      id="accounts"
      title={
        <>
          <span className={`size-2.5 rounded-full ${SECTION_META.CASH.dot}`} />
          帳戶現金
          <span className="text-xs font-normal text-slate-500">{accounts.length}</span>
        </>
      }
      right={`NT$ ${fmt_money(subtotal_twd, 'TWD', hide)}`}
    >
      <div className={`${GRID} hidden px-5 pb-1 text-right text-xs text-slate-500 @lg:grid`}>
        <span className="text-left">帳戶</span>
        <span>餘額</span>
        <span>待交割</span>
        <span>約當 TWD</span>
      </div>

      <ul className="divide-y divide-slate-800/80">
        {visible.map((a) => {
          const cur = a.account.currency
          const pending = Math.abs(a.pending) > EPS
          return (
            <li key={a.account.account} className={`${GRID} items-center px-5 py-2`}>
              <div className="min-w-0">
                <p className="truncate font-medium">{a.account.account}</p>
                <p className="truncate text-xs text-slate-500">
                  {TYPE_LABEL[a.account.type] ?? a.account.type} · {cur}
                </p>
              </div>

              {/* narrow */}
              <div className="text-right tabular-nums @lg:hidden">
                <p>{fmt_money(a.balance, cur, hide)}</p>
                {pending && (
                  <p className="text-xs text-amber-400">
                    待交割 {fmt_signed_money(a.pending, cur, hide)}・可用 {fmt_money(a.available, cur, hide)}
                  </p>
                )}
              </div>

              {/* wide */}
              <span className="hidden text-right tabular-nums @lg:block">{fmt_money(a.balance, cur, hide)}</span>
              <span className={`hidden text-right tabular-nums @lg:block ${pending ? 'text-amber-400' : 'text-slate-600'}`}>
                {pending ? fmt_signed_money(a.pending, cur, hide) : '—'}
              </span>
              <span className="hidden text-right tabular-nums text-slate-400 @lg:block">
                {fmt_money(a.balance_twd, 'TWD', hide)}
              </span>
            </li>
          )
        })}
      </ul>

      {zero_count > 0 && (
        <button
          type="button"
          onClick={() => set_show_zero(!show_zero)}
          className="w-full px-5 py-2 text-left text-xs text-slate-500 hover:text-slate-300"
        >
          {show_zero ? '隱藏零餘額帳戶' : `顯示 ${zero_count} 個零餘額帳戶`}
        </button>
      )}
    </SectionCard>
  )
}
