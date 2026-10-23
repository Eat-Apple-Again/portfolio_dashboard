import type { Credentials } from '../types'

const CREDENTIALS_KEY = 'portfolio_dashboard_credentials'
const HIDE_AMOUNTS_KEY = 'portfolio_dashboard_hide_amounts'
// Legacy key from an earlier version; still cleared on logout
const PREFS_KEY = 'portfolio_dashboard_prefs'
const FORECAST_KEY = 'portfolio_dashboard_forecast'

// Only accept Apps Script web app URLs so the token can never be sent to another host
const API_URL_PATTERN = /^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/

export function is_valid_api_url(url: string): boolean {
  return API_URL_PATTERN.test(url.trim())
}

export function load_credentials(): Credentials | null {
  try {
    const raw = localStorage.getItem(CREDENTIALS_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Credentials
    if (!is_valid_api_url(parsed.api_url) || !parsed.token) return null
    return parsed
  } catch {
    return null
  }
}

export function save_credentials(credentials: Credentials): void {
  try {
    localStorage.setItem(CREDENTIALS_KEY, JSON.stringify(credentials))
  } catch {
    // storage unavailable (e.g. private mode): credentials live only for this session
  }
}

export function clear_credentials(): void {
  try {
    localStorage.removeItem(CREDENTIALS_KEY)
    localStorage.removeItem(PREFS_KEY)
    localStorage.removeItem(FORECAST_KEY)
  } catch {
    // ignore
  }
}

export function load_hide_amounts(): boolean {
  try {
    return localStorage.getItem(HIDE_AMOUNTS_KEY) === '1'
  } catch {
    return false
  }
}

export function save_hide_amounts(hide: boolean): void {
  try {
    localStorage.setItem(HIDE_AMOUNTS_KEY, hide ? '1' : '0')
  } catch {
    // ignore
  }
}

const PNL_STYLE_KEY = 'portfolio_dashboard_pnl_style'

/** 'tw' = red up / green down, 'us' = green up / red down */
export type PnlStyle = 'tw' | 'us'

export function load_pnl_style(): PnlStyle {
  try {
    return localStorage.getItem(PNL_STYLE_KEY) === 'us' ? 'us' : 'tw'
  } catch {
    return 'tw'
  }
}

export function save_pnl_style(style: PnlStyle): void {
  try {
    localStorage.setItem(PNL_STYLE_KEY, style)
  } catch {
    // ignore
  }
}

/** Applied on <html> so every gain / loss color switches at once */
export function apply_pnl_style(style: PnlStyle): void {
  document.documentElement.dataset.pnl = style
}

const COLLAPSED_KEY = 'portfolio_dashboard_collapsed'

/** Which dashboard sections are collapsed (UI only, no asset data) */
export function load_collapsed(id: string): boolean {
  try {
    const ids = JSON.parse(localStorage.getItem(COLLAPSED_KEY) ?? '[]') as string[]
    return ids.includes(id)
  } catch {
    return false
  }
}

export function save_collapsed(id: string, collapsed: boolean): void {
  try {
    const ids = new Set(JSON.parse(localStorage.getItem(COLLAPSED_KEY) ?? '[]') as string[])
    if (collapsed) ids.add(id)
    else ids.delete(id)
    localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...ids]))
  } catch {
    // ignore
  }
}

/** Forecast inputs (contributions, assumptions); device-only, cleared on logout */
export function load_forecast_settings<T>(): Partial<T> | null {
  try {
    const raw = localStorage.getItem(FORECAST_KEY)
    return raw ? (JSON.parse(raw) as Partial<T>) : null
  } catch {
    return null
  }
}

export function save_forecast_settings<T>(settings: T): void {
  try {
    localStorage.setItem(FORECAST_KEY, JSON.stringify(settings))
  } catch {
    // ignore
  }
}
