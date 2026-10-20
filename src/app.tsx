import { useState, type ButtonHTMLAttributes } from 'react'
import { DetailSheet } from './components/detail_sheet'
import { HoldingsSection } from './components/holdings_section'
import { LockScreen } from './components/lock_screen'
import { SummaryCard } from './components/summary_card'
import { usePortfolio } from './hooks/use_portfolio'
import { SECTION_TYPES } from './lib/portfolio'
import {
  clear_credentials,
  load_credentials,
  load_hide_amounts,
  save_credentials,
  save_hide_amounts,
} from './lib/storage'
import type { Credentials, Position } from './types'

export default function App() {
  const [credentials, set_credentials] = useState<Credentials | null>(load_credentials)
  const [login_error, set_login_error] = useState<string | null>(null)

  const login = (c: Credentials) => {
    save_credentials(c)
    set_login_error(null)
    set_credentials(c)
  }

  const logout = (reason: string | null = null) => {
    clear_credentials()
    set_login_error(reason)
    set_credentials(null)
  }

  if (!credentials) return <LockScreen on_submit={login} error={login_error} />
  return <Dashboard credentials={credentials} on_logout={logout} />
}

function Dashboard({
  credentials,
  on_logout,
}: {
  credentials: Credentials
  on_logout: (reason?: string | null) => void
}) {
  const { portfolio, loading, error, unauthorized, fetched_at, refresh } = usePortfolio(credentials)
  const [hide, set_hide] = useState(load_hide_amounts)
  const [selected_key, set_selected_key] = useState<string | null>(null)

  // Look up by key so the open detail sheet reflects refreshed prices
  const selected = selected_key
    ? (SECTION_TYPES.flatMap((t) => portfolio?.sections[t] ?? []).find((p) => position_key(p) === selected_key) ??
      null)
    : null

  const toggle_hide = () => {
    save_hide_amounts(!hide)
    set_hide(!hide)
  }

  return (
    <div className="mx-auto max-w-5xl px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(2rem,env(safe-area-inset-bottom))]">
      <header className="mb-4 flex items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold">Portfolio</h1>
          <p className="text-xs text-slate-500">
            {fetched_at
              ? `更新於 ${new Date(fetched_at).toLocaleTimeString('zh-TW', { hour12: false })}`
              : '載入中…'}
          </p>
        </div>
        <nav className="flex items-center gap-1 text-sm">
          <HeaderButton onClick={refresh} disabled={loading}>
            <span className={loading ? 'inline-block animate-spin' : ''}>↻</span>
          </HeaderButton>
          <HeaderButton onClick={toggle_hide}>{hide ? '顯示' : '隱藏'}</HeaderButton>
          <HeaderButton onClick={() => on_logout()}>登出</HeaderButton>
        </nav>
      </header>

      {error && (
        <div className="mb-4 rounded-xl bg-rose-950/60 px-4 py-3 text-sm text-rose-300">
          <p>讀取失敗：{error}</p>
          {unauthorized && (
            <button
              type="button"
              className="mt-2 underline"
              onClick={() => on_logout('Token 無效，請重新輸入')}
            >
              重新輸入網址與 token
            </button>
          )}
        </div>
      )}

      {portfolio && (
        <div className="space-y-4">
          {portfolio.warnings.length > 0 && (
            <ul className="rounded-xl bg-amber-950/50 px-4 py-3 text-sm text-amber-300">
              {portfolio.warnings.map((w) => (
                <li key={w}>⚠ {w}</li>
              ))}
            </ul>
          )}

          <SummaryCard portfolio={portfolio} hide={hide} />

          {SECTION_TYPES.map((t) => (
            <HoldingsSection
              key={t}
              type={t}
              positions={portfolio.sections[t]}
              subtotal_twd={portfolio.totals.by_type[t]}
              hide={hide}
              on_select={(p) => set_selected_key(position_key(p))}
            />
          ))}
        </div>
      )}

      {!portfolio && !error && <p className="py-20 text-center text-slate-500">載入中…</p>}

      {selected && <DetailSheet position={selected} hide={hide} on_close={() => set_selected_key(null)} />}
    </div>
  )
}

function position_key(p: Position): string {
  return `${p.holding.type}:${p.holding.account}:${p.holding.symbol}`
}

function HeaderButton(props: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...props}
      className="min-w-9 rounded-lg px-2.5 py-1.5 text-slate-300 hover:bg-slate-800 active:bg-slate-700 disabled:opacity-50"
    />
  )
}
