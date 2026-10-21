import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError, fetch_okx_quotes, fetch_sheet } from '../lib/api'
import { build_portfolio } from '../lib/portfolio'
import type { Credentials, Portfolio, SheetData } from '../types'

const REFRESH_MS = 60_000

interface State {
  sheet: SheetData | null
  portfolio: Portfolio | null
  loading: boolean
  error: string | null
  unauthorized: boolean
  fetched_at: number | null
}

export function usePortfolio(credentials: Credentials) {
  const [state, set_state] = useState<State>({
    sheet: null,
    portfolio: null,
    loading: true,
    error: null,
    unauthorized: false,
    fetched_at: null,
  })
  const abort_ref = useRef<AbortController | null>(null)

  // All state updates happen after an await, so this is safe to call from an effect
  const load = useCallback(async () => {
    // Cancel any in-flight request so stale responses never overwrite newer ones
    abort_ref.current?.abort()
    const controller = new AbortController()
    abort_ref.current = controller

    try {
      const sheet = await fetch_sheet(credentials, controller.signal)
      const crypto_ids = sheet.holdings
        .filter((h) => h.type === 'CRYPTO' && h.quote_id)
        .map((h) => h.quote_id)
      const crypto_quotes = await fetch_okx_quotes(crypto_ids, controller.signal)

      set_state({
        sheet,
        portfolio: build_portfolio(sheet, { ...sheet.quotes, ...crypto_quotes }),
        loading: false,
        error: null,
        unauthorized: false,
        fetched_at: Date.now(),
      })
    } catch (err) {
      if (controller.signal.aborted) return
      set_state((s) => ({
        ...s,
        loading: false,
        error: err instanceof Error ? err.message : String(err),
        unauthorized: err instanceof ApiError && err.unauthorized,
      }))
    }
  }, [credentials])

  const refresh = useCallback(() => {
    set_state((s) => ({ ...s, loading: true }))
    void load()
  }, [load])

  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect -- external fetch; state is only set after await
    void load()
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') refresh()
    }, REFRESH_MS)
    const on_visible = () => {
      if (document.visibilityState === 'visible') refresh()
    }
    document.addEventListener('visibilitychange', on_visible)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', on_visible)
      abort_ref.current?.abort()
    }
  }, [load, refresh])

  return { ...state, refresh }
}
