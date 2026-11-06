import { useState } from 'react'
import { fmt_money, fmt_pct, fmt_price, fmt_signed_money, pnl_color } from '../lib/format'
import { EMERGENCY_TAG, INVEST_TYPES } from '../lib/portfolio'
import type { InvestType, Portfolio } from '../types'
import { AllocationSheet } from './allocation_sheet'
import { CashListSheet } from './cash_list_sheet'
import { SummaryInfo } from './info_content'
import { InvestCashSheet } from './invest_cash_sheet'
import { SECTION_META } from './section_meta'

const INVEST_CASH = 'INVEST_CASH'
const OTHER_CASH = 'OTHER_CASH'
const EMERGENCY = 'EMERGENCY'

const FX_SOURCE_LABEL = { manual: '手動', live: '即時', sheet: '試算表', none: '' }

export function SummaryCard({ portfolio, hide }: { portfolio: Portfolio; hide: boolean }) {
  const { totals } = portfolio
  const [open_type, set_open_type] = useState<string | null>(null)
  const total = totals.value_twd
  const { invest, other, emergency } = portfolio.cash_split
  const parts = [
    ...INVEST_TYPES.map((t) => ({
      key: t as string,
      label: SECTION_META[t].label,
      bar: SECTION_META[t].bar,
      dot: SECTION_META[t].dot,
      value: totals.by_type[t],
    })),
    { key: INVEST_CASH, label: '待投入', bar: 'bg-emerald-400', dot: 'bg-emerald-400', value: invest },
    { key: OTHER_CASH, label: '其他現金', hint: '信用卡費、預房租...', bar: 'bg-slate-400', dot: 'bg-slate-400', value: other },
    ...(emergency > 0
      ? [{ key: EMERGENCY, label: EMERGENCY_TAG, bar: 'bg-slate-600', dot: 'bg-slate-600', value: emergency }]
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
          <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-3 xl:flex xl:justify-between">
            {parts.map((p) => {
              const content = (
                <>
                  <span className={`size-2 rounded-full ${p.dot}`} />
                  <span className="text-slate-300">
                    {p.label}
                    {'hint' in p && <span className="text-xs text-slate-500"> ({p.hint})</span>}
                  </span>
                  <span className="ml-auto tabular-nums text-slate-400 sm:ml-0">
                    {fmt_pct(p.value / total, false)}
                  </span>
                </>
              )
              return (
                <li key={p.key} title={fmt_money(p.value, 'TWD', hide)}>
                  <button
                    type="button"
                    onClick={() => set_open_type(p.key)}
                    className="-mx-1.5 flex w-[calc(100%+0.75rem)] items-center gap-2 rounded-md px-1.5 text-left hover:bg-slate-800 xl:w-auto"
                  >
                    {content}
                    <span className="text-slate-600">›</span>
                  </button>
                </li>
              )
            })}
          </ul>
        </>
      )}

      {portfolio.fx_rate != null && (
        <p className="mt-3 text-xs text-slate-500">
          USD/TWD {fmt_price(portfolio.fx_rate)} ({FX_SOURCE_LABEL[portfolio.fx_source]})
        </p>
      )}

      {open_type === INVEST_CASH && (
        <InvestCashSheet portfolio={portfolio} hide={hide} on_close={() => set_open_type(null)} />
      )}
      {(open_type === OTHER_CASH || open_type === EMERGENCY) && (
        <CashListSheet
          title={open_type === EMERGENCY ? EMERGENCY_TAG : '其他現金'}
          accounts={portfolio.cash_accounts[open_type === EMERGENCY ? 'emergency' : 'other']}
          hide={hide}
          on_close={() => set_open_type(null)}
        />
      )}
      {INVEST_TYPES.includes(open_type as InvestType) && (
        <AllocationSheet
          portfolio={portfolio}
          type={open_type as InvestType}
          hide={hide}
          on_close={() => set_open_type(null)}
        />
      )}
    </section>
  )
}
