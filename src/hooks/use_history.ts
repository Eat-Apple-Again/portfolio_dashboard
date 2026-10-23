import { useEffect, useRef, useState } from 'react'
import { fetch_history, fetch_okx_history, type DailySeries } from '../lib/api'
import { fmt_compact_date, parse_compact } from '../lib/dates'
import { history_start } from '../lib/history'
import type { Credentials, SheetData } from '../types'

export type HistoryInterval = 'daily' | 'monthly'

const MONTHLY_YEARS = 10

interface State {
  key: string | null
  series: Record<string, DailySeries> | null
  error: string | null
}

/** Daily: from the start date. Monthly: 10 years back from the data timestamp (deterministic per load) */
function start_date(sheet: SheetData, interval: HistoryInterval): Date | null {
  if (interval === 'daily') return history_start(sheet)
  const d = new Date(sheet.updated_at)
  return new Date(d.getFullYear() - MONTHLY_YEARS, d.getMonth(), 1)
}

/** "interval|YYYYMMDD|crypto ids|other ids" — refetch only when the window or the set of symbols changes */
function history_key(sheet: SheetData | null, interval: HistoryInterval): string | null {
  const start = sheet ? start_date(sheet, interval) : null
  if (!sheet || !start) return null
  const crypto_ids = sheet.holdings.filter((h) => h.type === 'CRYPTO' && h.quote_id).map((h) => h.quote_id)
  const others = sheet.holdings.filter((h) => h.type !== 'CRYPTO').map((h) => h.quote_id)
  return `${interval}|${fmt_compact_date(start)}|${[...new Set(crypto_ids)].join(',')}|${others.join(',')}`
}

/**
 * Closing prices for every holding. Fetched lazily the first time the view needing them opens,
 * then kept for the session (Apps Script also caches for 6 hours).
 */
export function useHistory(
  credentials: Credentials,
  sheet: SheetData | null,
  active: boolean,
  interval: HistoryInterval = 'daily',
) {
  const [state, set_state] = useState<State>({ key: null, series: null, error: null })
  const loaded = useRef<string | null>(null)
  const key = history_key(sheet, interval)

  useEffect(() => {
    if (!active || !key || loaded.current === key) return
    const [mode, start_str, crypto_str] = key.split('|')
    const start = parse_compact(start_str)!
    const crypto_ids = crypto_str ? crypto_str.split(',') : []
    const monthly = mode === 'monthly'

    const controller = new AbortController()
    Promise.all([
      fetch_history(credentials, start_str, controller.signal, monthly ? '1mo' : '1d'),
      fetch_okx_history(crypto_ids, start.getTime(), controller.signal, monthly ? '1M' : '1D'),
    ])
      .then(([yahoo, okx]) => {
        loaded.current = key
        set_state({ key, series: { ...yahoo, ...okx }, error: null })
      })
      .catch((err) => {
        if (!controller.signal.aborted) {
          set_state({ key, series: null, error: err instanceof Error ? err.message : String(err) })
        }
      })
    return () => controller.abort()
  }, [active, key, credentials])

  return { series: state.series, error: state.error, loading: active && key !== state.key }
}
