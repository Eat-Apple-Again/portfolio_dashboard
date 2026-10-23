import type { Credentials, NewTrade, NewTransfer, QuoteMap, SheetData } from '../types'

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
async function call_api<T>(
  credentials: Credentials,
  payload: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<T> {
  const res = await fetch(credentials.api_url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ ...payload, token: credentials.token }),
    signal,
  })
  if (!res.ok) throw new ApiError(`Apps Script HTTP ${res.status}`)

  const data = (await res.json()) as { ok: boolean; error?: string }
  if (!data.ok) {
    const error = data.error ?? 'unknown error'
    throw new ApiError(error, ['unauthorized', 'missing token'].includes(error))
  }
  return data as T
}

export async function fetch_sheet(credentials: Credentials, signal?: AbortSignal) {
  const data = await call_api<SheetData>(credentials, { action: 'get' }, signal)
  // An outdated Apps Script deployment returns holdings only
  const required = ['holdings', 'accounts', 'trades', 'transfers'] as const
  if (required.some((k) => !Array.isArray(data[k]))) {
    throw new ApiError('Apps Script 版本過舊：請貼上最新的 Code.gs，並在「管理部署作業」部署新版本')
  }
  data.presets ??= []
  return data
}

export function add_trade(credentials: Credentials, record: NewTrade) {
  return call_api<{ id: string }>(credentials, { action: 'add_trade', record })
}

export function add_transfer(credentials: Credentials, record: NewTransfer) {
  return call_api<{ id: string }>(credentials, { action: 'add_transfer', record })
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

/** [YYYY-MM-DD, close] pairs, oldest first */
export type DailySeries = [string, number][]

export async function fetch_history(
  credentials: Credentials,
  start: string,
  signal?: AbortSignal,
  interval: '1d' | '1mo' = '1d',
) {
  try {
    const data = await call_api<{ series: Record<string, DailySeries> }>(
      credentials,
      { action: 'history', start, interval },
      signal,
    )
    return data.series
  } catch (err) {
    if (err instanceof ApiError && err.message === 'unknown action') {
      throw new ApiError('Apps Script 版本過舊：請貼上最新的 Code.gs，並在「管理部署作業」部署新版本')
    }
    throw err
  }
}

const OKX_CANDLES_URL = 'https://www.okx.com/api/v5/market/history-candles'
const OKX_MAX_PAGES = 40

const taipei_day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei' })

/** Closes from OKX (1D / 1M bars are aligned to UTC+8, i.e. Taiwan calendar), paginated back to `start_ts` */
export async function fetch_okx_history(
  inst_ids: string[],
  start_ts: number,
  signal?: AbortSignal,
  bar: '1D' | '1M' = '1D',
) {
  const out: Record<string, DailySeries> = {}
  await Promise.all(
    [...new Set(inst_ids)].map(async (id) => {
      const rows: DailySeries = []
      let after = ''
      for (let page = 0; page < OKX_MAX_PAGES; page++) {
        const qs = new URLSearchParams({ instId: id, bar, limit: '100', ...(after && { after }) })
        const res = await fetch(`${OKX_CANDLES_URL}?${qs}`, { signal })
        if (!res.ok) break
        const body = (await res.json()) as { code: string; data: string[][] }
        if (body.code !== '0' || body.data.length === 0) break
        for (const c of body.data) rows.push([taipei_day.format(new Date(Number(c[0]))), Number(c[4])])
        after = body.data[body.data.length - 1][0]
        if (Number(after) <= start_ts - 7 * 86_400_000) break
      }
      out[id] = rows.reverse()
    }),
  )
  return out
}
