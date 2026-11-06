import { fmt_money, fmt_pct } from '../lib/format'
import type { AccountBalance } from '../types'
import { Sheet, SheetHeader } from './sheet'

interface Props {
  title: string
  accounts: AccountBalance[]
  hide: boolean
  on_close: () => void
}

/** Plain list of cash accounts in one class, largest first */
export function CashListSheet({ title, accounts, hide, on_close }: Props) {
  const total = accounts.reduce((s, a) => s + (a.available_twd ?? 0), 0)
  // Empty accounts are noise; negatives (shortfalls) still show
  const rows = accounts
    .filter((a) => Math.abs(a.available) >= 0.005)
    .sort((x, y) => (y.available_twd ?? 0) - (x.available_twd ?? 0))
  const twd = (v: number | null) => `NT$ ${fmt_money(v, 'TWD', hide)}`

  return (
    <Sheet on_close={on_close}>
      <SheetHeader eyebrow="現金" title={title} on_close={on_close} />
      <p className="mt-1 text-2xl font-semibold tabular-nums">{twd(total)}</p>

      {rows.length === 0 ? (
        <p className="py-10 text-center text-sm text-slate-500">沒有餘額</p>
      ) : (
        <ul className="mt-4 divide-y divide-slate-800/80 text-sm">
          {rows.map((a) => {
            const cur = a.account.currency
            return (
              <li key={a.account.account} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate">{a.account.account}</p>
                  <p className="text-xs tabular-nums text-slate-500">
                    {total > 0 && a.available_twd != null ? fmt_pct(a.available_twd / total, false) : '—'}
                  </p>
                </div>
                <div className="shrink-0 text-right tabular-nums">
                  <p>
                    {cur === 'TWD' ? twd(a.available) : `${fmt_money(a.available, cur, hide)} ${cur}`}
                  </p>
                  {cur !== 'TWD' && <p className="text-xs text-slate-500">≈ {twd(a.available_twd)}</p>}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </Sheet>
  )
}
