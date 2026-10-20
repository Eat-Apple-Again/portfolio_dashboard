import { fmt_money, fmt_pct, fmt_price, fmt_qty, fmt_signed_money, pnl_color } from '../lib/format'
import type { Position, SectionType } from '../types'
import { SECTION_META } from './section_meta'

interface Props {
  type: SectionType
  positions: Position[]
  subtotal_twd: number
  hide: boolean
  on_select: (p: Position) => void
}

// md+ shows table-like columns; mobile shows a compact 2-column row
const INVEST_GRID = 'grid grid-cols-[1fr_auto] md:grid-cols-[1.6fr_repeat(6,1fr)] gap-x-3'
const CASH_GRID = 'grid grid-cols-[1fr_auto] md:grid-cols-[1.6fr_1fr_1fr] gap-x-3'

export function HoldingsSection({ type, positions, subtotal_twd, hide, on_select }: Props) {
  if (positions.length === 0) return null
  const meta = SECTION_META[type]
  const is_cash = type === 'CASH'

  return (
    <section className="rounded-2xl bg-slate-900">
      <header className="flex items-baseline justify-between px-5 pt-4 pb-2">
        <h2 className="flex items-center gap-2 font-semibold">
          <span className={`size-2.5 rounded-full ${meta.dot}`} />
          {meta.label}
          {meta.currency && <span className="text-xs font-normal text-slate-500">{meta.currency}</span>}
        </h2>
        <span className="text-sm tabular-nums text-slate-400">NT$ {fmt_money(subtotal_twd, 'TWD', hide)}</span>
      </header>

      <div
        className={`${is_cash ? CASH_GRID : INVEST_GRID} hidden px-5 pb-1 text-right text-xs text-slate-500 md:grid`}
      >
        <span className="text-left">標的</span>
        {is_cash ? (
          <>
            <span>餘額</span>
            <span>約當 TWD</span>
          </>
        ) : (
          <>
            <span>數量</span>
            <span>均價</span>
            <span>現價</span>
            <span>今日</span>
            <span>現值</span>
            <span>損益</span>
          </>
        )}
      </div>

      <ul className="divide-y divide-slate-800/80">
        {positions.map((p) => (
          <li key={`${p.holding.account}:${p.holding.symbol}`}>
            <button
              type="button"
              onClick={() => on_select(p)}
              className={`${is_cash ? CASH_GRID : INVEST_GRID} w-full items-center px-5 py-3 text-left hover:bg-slate-800/60 active:bg-slate-800`}
            >
              <div className="min-w-0">
                <p className="truncate font-medium">{p.holding.name || p.holding.symbol}</p>
                <p className="truncate text-xs text-slate-500">
                  {p.holding.symbol} · {p.holding.account}
                  {p.price_source === 'sheet' && <span className="ml-1 text-amber-400">（試算表報價）</span>}
                  {p.price_source === 'none' && !is_cash && <span className="ml-1 text-rose-400">（無報價）</span>}
                </p>
              </div>
              {is_cash ? <CashCells p={p} hide={hide} /> : <InvestCells p={p} hide={hide} />}
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}

function CashCells({ p, hide }: { p: Position; hide: boolean }) {
  const cur = p.holding.currency
  return (
    <>
      <div className="text-right tabular-nums">
        <p>
          {fmt_money(p.value, cur, hide)} <span className="text-xs text-slate-500">{cur}</span>
        </p>
        {cur !== 'TWD' && (
          <p className="text-xs text-slate-500 md:hidden">≈ NT$ {fmt_money(p.value_twd, 'TWD', hide)}</p>
        )}
      </div>
      <p className="hidden text-right tabular-nums text-slate-400 md:block">{fmt_money(p.value_twd, 'TWD', hide)}</p>
    </>
  )
}

function InvestCells({ p, hide }: { p: Position; hide: boolean }) {
  const cur = p.holding.currency
  return (
    <>
      {/* mobile */}
      <div className="text-right tabular-nums md:hidden">
        <p>{fmt_money(p.value, cur, hide)}</p>
        <p className={`text-xs ${pnl_color(p.pnl_pct)}`}>{fmt_pct(p.pnl_pct)}</p>
      </div>
      {/* md+ */}
      <span className="hidden text-right tabular-nums md:block">{fmt_qty(p.holding.quantity, hide)}</span>
      <span className="hidden text-right tabular-nums md:block">{fmt_price(p.holding.avg_cost)}</span>
      <span className="hidden text-right tabular-nums md:block">{fmt_price(p.price)}</span>
      <span className={`hidden text-right tabular-nums md:block ${pnl_color(p.day_change_pct)}`}>
        {fmt_pct(p.day_change_pct)}
      </span>
      <span className="hidden text-right tabular-nums md:block">{fmt_money(p.value, cur, hide)}</span>
      <span className={`hidden text-right tabular-nums md:block ${pnl_color(p.pnl)}`}>
        {fmt_signed_money(p.pnl, cur, hide)}
        <span className="block text-xs">{fmt_pct(p.pnl_pct)}</span>
      </span>
    </>
  )
}
