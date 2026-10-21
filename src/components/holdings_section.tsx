import { fmt_money, fmt_pct, fmt_price, fmt_qty, fmt_signed_money, pnl_color } from '../lib/format'
import type { InvestType, Position } from '../types'
import { SECTION_META } from './section_meta'
import { SectionCard } from './section_card'

interface Props {
  type: InvestType
  positions: Position[]
  subtotal_twd: number
  hide: boolean
  on_select: (p: Position) => void
}

// Container query: table columns only when the card itself is wide enough
const GRID = 'grid grid-cols-[1fr_auto] @2xl:grid-cols-[1.6fr_repeat(6,1fr)] gap-x-3'

export function HoldingsSection({ type, positions, subtotal_twd, hide, on_select }: Props) {
  if (positions.length === 0) return null
  const meta = SECTION_META[type]

  return (
    <SectionCard
      id={`holdings:${type}`}
      title={
        <>
          <span className={`size-2.5 rounded-full ${meta.dot}`} />
          {meta.label}
          <span className="text-xs font-normal text-slate-500">
            {meta.currency} · {positions.length}
          </span>
        </>
      }
      right={`NT$ ${fmt_money(subtotal_twd, 'TWD', hide)}`}
    >
      <div className={`${GRID} hidden px-5 pb-1 text-right text-xs text-slate-500 @2xl:grid`}>
        <span className="text-left">標的</span>
        <span>數量</span>
        <span>均價</span>
        <span>現價</span>
        <span>今日</span>
        <span>現值</span>
        <span>損益</span>
      </div>

      <ul className="divide-y divide-slate-800/80">
        {positions.map((p) => (
          <li key={`${p.holding.account}:${p.holding.symbol}`}>
            <button
              type="button"
              onClick={() => on_select(p)}
              className={`${GRID} w-full items-center px-5 py-2 text-left hover:bg-slate-800/60 active:bg-slate-800`}
            >
              <div className="min-w-0">
                <p className="truncate font-medium">{p.holding.name || p.holding.symbol}</p>
                <p className="truncate text-xs text-slate-500">
                  {p.holding.symbol} · {p.holding.account}
                  {p.price_source === 'sheet' && <span className="ml-1 text-amber-400">（試算表報價）</span>}
                  {p.price_source === 'none' && <span className="ml-1 text-rose-400">（無報價）</span>}
                </p>
              </div>
              <PositionCells p={p} hide={hide} />
            </button>
          </li>
        ))}
      </ul>
    </SectionCard>
  )
}

function PositionCells({ p, hide }: { p: Position; hide: boolean }) {
  const cur = p.holding.currency
  return (
    <>
      {/* narrow */}
      <div className="text-right tabular-nums @2xl:hidden">
        <p>{fmt_money(p.value, cur, hide)}</p>
        <p className={`text-xs ${pnl_color(p.pnl_pct)}`}>{fmt_pct(p.pnl_pct)}</p>
      </div>
      {/* wide */}
      <span className="hidden text-right tabular-nums @2xl:block">{fmt_qty(p.holding.quantity, hide)}</span>
      <span className="hidden text-right tabular-nums @2xl:block">{fmt_price(p.holding.avg_cost)}</span>
      <span className="hidden text-right tabular-nums @2xl:block">{fmt_price(p.price)}</span>
      <span className={`hidden text-right tabular-nums @2xl:block ${pnl_color(p.day_change_pct)}`}>
        {fmt_pct(p.day_change_pct)}
      </span>
      <span className="hidden text-right tabular-nums @2xl:block">{fmt_money(p.value, cur, hide)}</span>
      <span className={`hidden text-right tabular-nums @2xl:block ${pnl_color(p.pnl)}`}>
        {fmt_signed_money(p.pnl, cur, hide)}
        <span className="block text-xs">{fmt_pct(p.pnl_pct)}</span>
      </span>
    </>
  )
}
