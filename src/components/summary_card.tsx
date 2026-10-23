import { fmt_money, fmt_pct, fmt_price, fmt_signed_money, pnl_color } from '../lib/format'
import { SECTION_TYPES } from '../lib/portfolio'
import type { Portfolio } from '../types'
import { SummaryInfo } from './info_content'
import { SECTION_META } from './section_meta'

// accounts.note containing this marks an emergency fund, shown as its own slice at the end
const EMERGENCY_TAG = '緊急預備金'

const FX_SOURCE_LABEL = { manual: '手動', live: '即時', sheet: '試算表', none: '' }

export function SummaryCard({ portfolio, hide }: { portfolio: Portfolio; hide: boolean }) {
  const { totals } = portfolio
  const total = totals.value_twd
  const emergency = portfolio.accounts
    .filter((a) => a.account.note.includes(EMERGENCY_TAG))
    .reduce((s, a) => s + (a.available_twd ?? 0), 0)
  const parts = [
    ...SECTION_TYPES.map((t) => ({
      key: t as string,
      label: SECTION_META[t].label,
      bar: SECTION_META[t].bar,
      dot: SECTION_META[t].dot,
      value: t === 'CASH' ? totals.by_type[t] - emergency : totals.by_type[t],
    })),
    ...(emergency > 0
      ? [{ key: 'EMERGENCY', label: EMERGENCY_TAG, bar: 'bg-slate-600', dot: 'bg-slate-600', value: emergency }]
      : []),
  ]

  return (
    <section className="rounded-2xl bg-slate-900 p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-slate-400">總資產 (TWD)</p>
        <SummaryInfo />
      </div>
      <p className="mt-1 text-3xl font-semibold tabular-nums sm:text-4xl">{fmt_money(total, 'TWD', hide)}</p>

      <div className="mt-2 flex flex-wrap items-baseline gap-x-3 text-sm">
        <span className="text-slate-400">投資未實現損益</span>
        <span className={`tabular-nums ${pnl_color(totals.invested_pnl_twd)}`}>
          {fmt_signed_money(totals.invested_pnl_twd, 'TWD', hide)} ({fmt_pct(totals.invested_pnl_pct)})
        </span>
      </div>

      {total > 0 && (
        <>
          <div className="mt-4 flex h-2.5 overflow-hidden rounded-full bg-slate-800">
            {parts.map((p) => (
              <div key={p.key} className={p.bar} style={{ width: `${(Math.max(0, p.value) / total) * 100}%` }} />
            ))}
          </div>
          <ul className={`mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm ${emergency > 0 ? 'sm:grid-cols-5' : 'sm:grid-cols-4'}`}>
            {parts.map((p) => (
              <li key={p.key} className="flex items-center gap-2" title={fmt_money(p.value, 'TWD', hide)}>
                <span className={`size-2 rounded-full ${p.dot}`} />
                <span className="text-slate-300">{p.label}</span>
                <span className="ml-auto tabular-nums text-slate-400 sm:ml-0">
                  {fmt_pct(p.value / total, false)}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}

      {portfolio.fx_rate != null && (
        <p className="mt-3 text-xs text-slate-500">
          USD/TWD {fmt_price(portfolio.fx_rate)} ({FX_SOURCE_LABEL[portfolio.fx_source]})
        </p>
      )}
    </section>
  )
}
