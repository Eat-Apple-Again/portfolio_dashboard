import type { ReactNode } from 'react'
import { fmt_money, fmt_pct, fmt_price, fmt_qty, fmt_signed_money, fmt_time, pnl_color } from '../lib/format'
import type { Position } from '../types'
import { SECTION_META } from './section_meta'
import { Sheet, SheetHeader } from './sheet'

const SOURCE_LABEL = { live: '即時報價', sheet: '試算表 sheet_price', none: '—' }

interface Props {
  position: Position
  hide: boolean
  on_close: () => void
}

export function DetailSheet({ position: p, hide, on_close }: Props) {
  const h = p.holding
  const cur = h.currency

  return (
    <Sheet on_close={on_close}>
      <SheetHeader
        eyebrow={`${SECTION_META[h.type as keyof typeof SECTION_META]?.label} · ${h.account}`}
        title={h.name || h.symbol}
        sub={h.symbol}
        on_close={on_close}
      />

      <dl className="mt-5 divide-y divide-slate-800 text-sm">
        <Row label={`現價 (${cur})`}>{fmt_price(p.price)}</Row>
        <Row label="今日漲跌">
          <span className={pnl_color(p.day_change_pct)}>{fmt_pct(p.day_change_pct)}</span>
        </Row>
        <Row label="數量">{fmt_qty(h.quantity, hide)}</Row>
        <Row label={`平均成本 (${cur})`}>{fmt_price(h.avg_cost)}</Row>
        <Row label={`總成本 (${cur})`}>{fmt_money(p.cost, cur, hide)}</Row>
        <Row label={`現值 (${cur})`}>{fmt_money(p.value, cur, hide)}</Row>
        <Row label={`未實現損益 (${cur})`}>
          <span className={pnl_color(p.pnl)}>
            {fmt_signed_money(p.pnl, cur, hide)} ({fmt_pct(p.pnl_pct)})
          </span>
        </Row>
        {cur !== 'TWD' && (
          <>
            <Row label="現值 (TWD)">{fmt_money(p.value_twd, 'TWD', hide)}</Row>
            <Row label="未實現損益 (TWD)">
              <span className={pnl_color(p.pnl_twd)}>{fmt_signed_money(p.pnl_twd, 'TWD', hide)}</span>
            </Row>
          </>
        )}
        <Row label="報價來源">{SOURCE_LABEL[p.price_source]}</Row>
        <Row label="報價時間">{fmt_time(p.quote_time)}</Row>
        <Row label="報價代號">{h.quote_id || '—'}</Row>
        {h.note && <Row label="備註">{h.note}</Row>}
      </dl>
    </Sheet>
  )
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2.5">
      <dt className="text-slate-400">{label}</dt>
      <dd className="text-right tabular-nums">{children}</dd>
    </div>
  )
}
