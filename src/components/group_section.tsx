import { fmt_money, fmt_pct, fmt_price, fmt_qty, fmt_signed_money, pnl_color } from '../lib/format'
import type { AccountBalance, AccountGroup, Position, SectionType } from '../types'
import { SECTION_META } from './section_meta'
import { SectionCard } from './section_card'

interface Props {
  group: AccountGroup
  hide: boolean
  on_select: (p: Position) => void
}

// Container query: table columns only when the card itself is wide enough
const GRID = 'grid grid-cols-[1fr_auto] @2xl:grid-cols-[1.6fr_repeat(6,1fr)] gap-x-3'
const EPS = 1e-9

/** One brokerage / exchange / wallet: its positions followed by its cash */
export function GroupSection({ group, hide, on_select }: Props) {
  const types = [...new Set(group.positions.map((p) => p.holding.type as SectionType))]
  const currencies = [...new Set(group.positions.map((p) => p.holding.currency))]
  const dot = SECTION_META[types[0] ?? 'CASH'].dot

  return (
    <SectionCard
      id={`group:${group.account}`}
      title={
        <>
          <span className={`size-2.5 rounded-full ${dot}`} />
          {group.account}
          <span className="text-xs font-normal text-slate-500">
            {[...types.map((t) => SECTION_META[t].label), ...currencies].join(' · ')}
          </span>
        </>
      }
      right={`NT$ ${fmt_money(group.value_twd, 'TWD', hide)}`}
    >
      {group.positions.length > 0 && (
        <div className={`${GRID} hidden px-5 pb-1 text-right text-xs text-slate-500 @2xl:grid`}>
          <span className="text-left">標的</span>
          <span>數量</span>
          <span>均價</span>
          <span>現價</span>
          <span>今日</span>
          <span>現值</span>
          <span>未實現損益</span>
        </div>
      )}

      <ul className="divide-y divide-slate-800/80">
        {group.positions.map((p) => (
          <li key={p.holding.symbol}>
            <button
              type="button"
              onClick={() => on_select(p)}
              className={`${GRID} w-full items-center px-5 py-2 text-left hover:bg-slate-800/60 active:bg-slate-800`}
            >
              <div className="min-w-0">
                <p className="truncate font-medium">{p.holding.name || p.holding.symbol}</p>
                <p className="truncate text-xs text-slate-500">
                  {p.holding.symbol}
                  {p.price_source === 'sheet' && <span className="ml-1 text-amber-400">(試算表報價)</span>}
                  {p.price_source === 'none' && <span className="ml-1 text-rose-400">(無報價)</span>}
                </p>
              </div>
              <PositionCells p={p} hide={hide} />
            </button>
          </li>
        ))}
        {group.cash.map((a) => (
          <CashRow key={a.account.account} a={a} hide={hide} />
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

/** Broker / exchange cash, e.g. brokerage USD cash or exchange USDT */
function CashRow({ a, hide }: { a: AccountBalance; hide: boolean }) {
  const cur = a.account.currency
  const label = a.account.type === 'EXCHANGE' ? 'USDT' : `現金 (${cur})`
  const pending = Math.abs(a.pending) > EPS

  return (
    <li className={`${GRID} items-center px-5 py-2`}>
      <div className="min-w-0">
        <p className="truncate font-medium text-slate-300">{label}</p>
        {pending && (
          <p className="truncate text-xs text-amber-400">
            待交割 {fmt_signed_money(a.pending, cur, hide)}・可用 {fmt_money(a.available, cur, hide)}
          </p>
        )}
      </div>
      <p className="text-right tabular-nums @2xl:col-start-6">{fmt_money(a.balance, cur, hide)}</p>
    </li>
  )
}
