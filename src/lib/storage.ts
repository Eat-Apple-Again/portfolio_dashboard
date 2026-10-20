import type { Credentials } from '../types'

const CREDENTIALS_KEY = 'portfolio_dashboard_credentials'
const HIDE_AMOUNTS_KEY = 'portfolio_dashboard_hide_amounts'

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
