import { useMemo } from 'react'
import { fmt_money, fmt_pct } from '../lib/format'
import type { InvestType, Portfolio } from '../types'
import { SECTION_META, SERIES_COLORS } from './section_meta'
import { Sheet, SheetHeader } from './sheet'

// Display currency per type; crypto is valued in USD but traded in USDT
const NATIVE: Record<InvestType, { currency: string; label: string }> = {
  TW_STOCK: { currency: 'TWD', label: 'TWD' },
  US_STOCK: { currency: 'USD', label: 'USD' },
  CRYPTO: { currency: 'USD', label: 'USDT' },
}

// Beyond the palette size, the smallest holdings fold into one slice
const MAX_SLICES = SERIES_COLORS.length

interface Slice {
  key: string
  label: string
  sub: string
  value: number
  native: number | null
  color: string
}

interface Props {
  portfolio: Portfolio
  type: InvestType
  hide: boolean
  on_close: () => void
}

/** Share of each holding within one asset type; the same symbol across accounts is merged */
export function AllocationSheet({ portfolio, type, hide, on_close }: Props) {
  const total = portfolio.totals.by_type[type]
  const slices = useMemo(() => build_slices(portfolio, type), [portfolio, type])
  const native = NATIVE[type]
  const is_twd = native.currency === 'TWD'
  const sum_native = (xs: Slice[]) => (xs.some((x) => x.native == null) ? null : xs.reduce((s, x) => s + x.native!, 0))
  const fmt_native = (v: number | null) => `${fmt_money(v, native.currency, hide)} ${native.label}`
  const fmt_twd = (v: number) => `NT$ ${fmt_money(v, 'TWD', hide)}`

  return (
    <Sheet on_close={on_close}>
      <SheetHeader eyebrow={`持股分布 · ${native.label}`} title={SECTION_META[type].label} on_close={on_close} />
      <p className="mt-1 flex flex-wrap items-baseline gap-x-2 tabular-nums">
        <span className="text-2xl font-semibold">{is_twd ? fmt_twd(total) : fmt_native(sum_native(slices))}</span>
        {!is_twd && <span className="text-sm text-slate-400">≈ {fmt_twd(total)}</span>}
      </p>

      {total > 0 ? (
        <>
          <div className="mt-4 flex h-2.5 gap-0.5 overflow-hidden rounded-full">
            {slices.map((s) => (
              <div key={s.key} style={{ width: `${(s.value / total) * 100}%`, backgroundColor: s.color }} />
            ))}
          </div>

          <ul className="mt-4 divide-y divide-slate-800/80 text-sm">
            {slices.map((s) => (
              <li key={s.key} className="flex items-center gap-3 py-2.5">
                <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: s.color }} />
                <div className="min-w-0 flex-1">
                  <p className="truncate">{s.label}</p>
                  {s.sub && <p className="truncate text-xs text-slate-500">{s.sub}</p>}
                </div>
                <div className="text-right tabular-nums">
                  <p>{fmt_pct(s.value / total, false)}</p>
                  <p className="text-xs text-slate-500">
                    {is_twd ? fmt_twd(s.value) : `${fmt_native(s.native)} · ${fmt_twd(s.value)}`}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="py-10 text-center text-sm text-slate-500">沒有持股</p>
      )}
    </Sheet>
  )
}

function build_slices(portfolio: Portfolio, type: InvestType): Slice[] {
  const base = NATIVE[type].currency
  const merged = new Map<string, { label: string; sub: string; value: number; native: number | null }>()
  for (const p of portfolio.groups.flatMap((g) => g.positions)) {
    const h = p.holding
    if (h.type !== type || !p.value_twd || p.value_twd <= 0) continue
    // Holdings priced in another currency are converted through TWD
    const native =
      h.currency === base ? p.value : portfolio.fx_rate && base === 'USD' ? p.value_twd / portfolio.fx_rate : null
    const cur = merged.get(h.symbol)
    if (cur) {
      cur.value += p.value_twd
      cur.native = cur.native == null || native == null ? null : cur.native + native
    } else {
      const label = h.name || h.symbol
      merged.set(h.symbol, { label, sub: label === h.symbol ? '' : h.symbol, value: p.value_twd, native })
    }
  }

  const sorted = [...merged.entries()].sort((a, b) => b[1].value - a[1].value)
  const head = sorted.length > MAX_SLICES ? sorted.slice(0, MAX_SLICES - 1) : sorted
  const rest = sorted.slice(head.length)
  const slices = head.map(([key, s], i) => ({ key, ...s, color: SERIES_COLORS[i] }))
  if (rest.length > 0) {
    slices.push({
      key: '__other',
      label: '其他',
      sub: `${rest.length} 檔`,
      value: rest.reduce((s, [, x]) => s + x.value, 0),
      native: rest.some(([, x]) => x.native == null) ? null : rest.reduce((s, [, x]) => s + x.native!, 0),
      color: '#64748b',
    })
  }
  return slices
}
