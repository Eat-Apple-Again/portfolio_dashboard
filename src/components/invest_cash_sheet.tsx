import { fmt_money, fmt_pct } from '../lib/format'
import type { AccountBalance, Portfolio } from '../types'
import { SECTION_META } from './section_meta'
import { Sheet, SheetHeader } from './sheet'

interface Props {
  portfolio: Portfolio
  hide: boolean
  on_close: () => void
}

/** Cash waiting to be invested, grouped by market; reserves without a market come last */
export function InvestCashSheet({ portfolio, hide, on_close }: Props) {
  const total = portfolio.cash_split.invest
  const fx = portfolio.fx_rate
  const twd = (v: number) => `NT$ ${fmt_money(v, 'TWD', hide)}`

  return (
    <Sheet on_close={on_close}>
      <SheetHeader eyebrow="現金" title="待投入" on_close={on_close} />
      <p className="mt-1 text-2xl font-semibold tabular-nums">{twd(total)}</p>

      {portfolio.invest_cash.length === 0 ? (
        <p className="py-10 text-center text-sm text-slate-500">沒有待投入的現金</p>
      ) : (
        <ul className="mt-4 space-y-3 text-sm">
          {portfolio.invest_cash.map((b) => {
            const meta = b.type ? SECTION_META[b.type] : null
            // Markets are shown in their trading currency; reserves in TWD
            const unit = b.type === 'CRYPTO' ? 'USDT' : (meta?.currency ?? 'TWD')
            const in_usd = unit !== 'TWD' && fx != null
            const mixed = b.accounts.some((a) => a.account.currency !== (in_usd ? 'USD' : 'TWD'))
            return (
              <li key={b.bucket} className="rounded-xl bg-slate-800/50 p-3">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="flex min-w-0 items-center gap-2">
                    <span className={`size-2 shrink-0 rounded-full ${meta?.dot ?? 'bg-emerald-400'}`} />
                    <span className="truncate font-medium">{meta?.label ?? b.bucket}</span>
                  </p>
                  <p className="shrink-0 text-right tabular-nums">
                    {in_usd ? `${mixed ? '約 ' : ''}${fmt_money(b.value_twd / fx!, 'USD', hide)} ${unit}` : twd(b.value_twd)}
                  </p>
                </div>
                <div className="mt-0.5 flex justify-between gap-3 text-xs tabular-nums text-slate-500">
                  <span>{total > 0 ? fmt_pct(b.value_twd / total, false) : '—'}</span>
                  {in_usd && <span>≈ {twd(b.value_twd)}</span>}
                </div>

                <ul className="mt-2 divide-y divide-slate-700/50 border-t border-slate-700/50">
                  {/* Empty settlement accounts are noise; negatives (shortfalls) still show */}
                  {b.accounts.filter((a) => Math.abs(a.available) >= 0.005).map((a) => (
                    <AccountRow key={a.account.account} a={a} hide={hide} />
                  ))}
                </ul>
              </li>
            )
          })}
        </ul>
      )}
    </Sheet>
  )
}

function AccountRow({ a, hide }: { a: AccountBalance; hide: boolean }) {
  const cur = a.account.currency
  const label = a.account.type === 'EXCHANGE' ? 'USDT' : cur
  return (
    <li className="flex justify-between gap-3 py-1.5 text-xs">
      <span className="truncate text-slate-400">{a.account.account}</span>
      <span className="shrink-0 tabular-nums text-slate-300">
        {fmt_money(a.available, cur, hide)} {label}
      </span>
    </li>
  )
}
