const MASK = '••••'

const formatters = new Map<string, Intl.NumberFormat>()

function nf(min: number, max: number): Intl.NumberFormat {
  const key = `${min}-${max}`
  let f = formatters.get(key)
  if (!f) {
    f = new Intl.NumberFormat('zh-TW', { minimumFractionDigits: min, maximumFractionDigits: max })
    formatters.set(key, f)
  }
  return f
}

/** Money amount: TWD without decimals, others with 2 */
export function fmt_money(v: number | null, currency: string, hide = false): string {
  if (v == null) return '—'
  if (hide) return MASK
  const digits = currency === 'TWD' ? 0 : 2
  return nf(digits, digits).format(v)
}

/** Unit price: more decimals for small prices (e.g. ADA) */
export function fmt_price(v: number | null): string {
  if (v == null) return '—'
  const abs = Math.abs(v)
  const digits = abs >= 1000 ? 0 : abs >= 1 ? 2 : 4
  return nf(digits, digits).format(v)
}

export function fmt_qty(v: number | null, hide = false): string {
  if (v == null) return '—'
  if (hide) return MASK
  return nf(0, 4).format(v)
}

export function fmt_pct(v: number | null, signed = true): string {
  if (v == null) return '—'
  const s = nf(2, 2).format(Math.abs(v * 100))
  if (!signed) return `${s}%`
  return `${v > 0 ? '+' : v < 0 ? '-' : ''}${s}%`
}

export function fmt_signed_money(v: number | null, currency: string, hide = false): string {
  if (v == null) return '—'
  if (hide) return MASK
  const s = fmt_money(Math.abs(v), currency)
  return `${v > 0 ? '+' : v < 0 ? '-' : ''}${s}`
}

/** Taiwan convention: red = up, green = down */
export function pnl_color(v: number | null): string {
  if (v == null || v === 0) return 'text-slate-400'
  return v > 0 ? 'text-rose-400' : 'text-emerald-400'
}

export function fmt_time(ms: number | null): string {
  if (ms == null) return '—'
  return new Date(ms).toLocaleString('zh-TW', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

/** '' -> null, invalid -> NaN; commas allowed */
export function parse_num(s: string): number | null {
  const t = s.replace(/,/g, '').trim()
  if (t === '') return null
  const n = Number(t)
  return Number.isFinite(n) ? n : NaN
}
