import type { SectionType } from '../types'

export const SECTION_META: Record<SectionType, { label: string; bar: string; dot: string; currency: string | null }> = {
  TW_STOCK: { label: '台股', bar: 'bg-sky-400', dot: 'bg-sky-400', currency: 'TWD' },
  US_STOCK: { label: '美股', bar: 'bg-indigo-400', dot: 'bg-indigo-400', currency: 'USD' },
  CRYPTO: { label: '加密貨幣', bar: 'bg-amber-400', dot: 'bg-amber-400', currency: 'USD' },
  CASH: { label: '現金', bar: 'bg-slate-400', dot: 'bg-slate-400', currency: null },
}
