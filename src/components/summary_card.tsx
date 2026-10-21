import { fmt_money, fmt_pct, fmt_price, fmt_signed_money, pnl_color } from '../lib/format'
import { SECTION_TYPES } from '../lib/portfolio'
import type { Portfolio } from '../types'
import { SECTION_META } from './section_meta'

const FX_SOURCE_LABEL = { manual: '手動', live: '即時', sheet: '試算表', none: '' }

export function SummaryCard({ portfolio, hide }: { portfolio: Portfolio; hide: boolean }) {
  const { totals } = portfolio
  const total = totals.value_twd

  return (
    <section className="rounded-2xl bg-slate-900 p-4 sm:p-5">
      <p className="text-sm text-slate-400">總資產（TWD）</p>
      <p className="mt-1 text-3xl font-semibold tabular-nums sm:text-4xl">{fmt_money(total, 'TWD', hide)}</p>

      <div className="mt-2 flex flex-wrap items-baseline gap-x-3 text-sm">
        <span className="text-slate-400">投資未實現損益</span>
        <span className={`tabular-nums ${pnl_color(totals.invested_pnl_twd)}`}>
          {fmt_signed_money(totals.invested_pnl_twd, 'TWD', hide)}（{fmt_pct(totals.invested_pnl_pct)}）
        </span>
      </div>

      {total > 0 && (
        <>
          <div className="mt-4 flex h-2.5 overflow-hidden rounded-full bg-slate-800">
            {SECTION_TYPES.map((t) => (
              <div
                key={t}
                className={SECTION_META[t].bar}
                style={{ width: `${(totals.by_type[t] / total) * 100}%` }}
              />
            ))}
          </div>
          <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
            {SECTION_TYPES.map((t) => (
              <li key={t} className="flex items-center gap-2">
                <span className={`size-2 rounded-full ${SECTION_META[t].dot}`} />
                <span className="text-slate-300">{SECTION_META[t].label}</span>
                <span className="ml-auto tabular-nums text-slate-400 sm:ml-0">
                  {fmt_pct(totals.by_type[t] / total, false)}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}

      {portfolio.fx_rate != null && (
        <p className="mt-3 text-xs text-slate-500">
          USD/TWD {fmt_price(portfolio.fx_rate)}（{FX_SOURCE_LABEL[portfolio.fx_source]}）
        </p>
      )}
    </section>
  )
}
