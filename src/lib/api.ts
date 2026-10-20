import type { Credentials, QuoteMap, SheetResponse } from '../types'

const OKX_TICKER_URL = 'https://www.okx.com/api/v5/market/ticker?instId='

export class ApiError extends Error {
  readonly unauthorized: boolean

  constructor(message: string, unauthorized = false) {
    super(message)
    this.unauthorized = unauthorized
  }
}

/**
 * Token goes in the POST body (never the URL).
 * text/plain keeps it a "simple" CORS request, so no preflight is needed.
 */
export async function fetch_sheet(credentials: Credentials, signal?: AbortSignal) {
  const res = await fetch(credentials.api_url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ token: credentials.token }),
    signal,
  })
  if (!res.ok) throw new ApiError(`Apps Script HTTP ${res.status}`)

  const data = (await res.json()) as SheetResponse
  if (!data.ok) {
    const unauthorized = ['unauthorized', 'missing token'].includes(data.error)
    throw new ApiError(data.error, unauthorized)
  }
  return data
}

interface OkxTicker {
  instId: string
  last: string
  sodUtc8: string
  ts: string
}

/** Crypto quotes from OKX public API, keyed by instId (e.g. BTC-USDT). USDT is treated as USD. */
export async function fetch_okx_quotes(inst_ids: string[], signal?: AbortSignal): Promise<QuoteMap> {
  const unique = [...new Set(inst_ids)]
  const results = await Promise.allSettled(
    unique.map(async (id) => {
      const res = await fetch(OKX_TICKER_URL + encodeURIComponent(id), { signal })
      if (!res.ok) throw new Error(`OKX HTTP ${res.status}`)
      const body = (await res.json()) as { code: string; data: OkxTicker[] }
      const t = body.data?.[0]
      if (body.code !== '0' || !t) throw new Error(`OKX: no ticker for ${id}`)
      return {
        price: Number(t.last),
        prev_close: Number(t.sodUtc8) || null, // price at 00:00 Taiwan time
        currency: 'USD',
        time: Number(t.ts),
      }
    }),
  )

  const quotes: QuoteMap = {}
  unique.forEach((id, i) => {
    const r = results[i]
    quotes[id] = r.status === 'fulfilled' ? r.value : null
  })
  return quotes
}
