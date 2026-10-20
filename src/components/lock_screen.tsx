import { useState, type FormEvent } from 'react'
import { is_valid_api_url } from '../lib/storage'
import type { Credentials } from '../types'

interface Props {
  on_submit: (credentials: Credentials) => void
  error?: string | null
}

export function LockScreen({ on_submit, error }: Props) {
  const [api_url, set_api_url] = useState('')
  const [token, set_token] = useState('')
  const [form_error, set_form_error] = useState<string | null>(null)

  const handle_submit = (e: FormEvent) => {
    e.preventDefault()
    const url = api_url.trim()
    if (!is_valid_api_url(url)) {
      set_form_error('網址格式應為 https://script.google.com/macros/s/.../exec')
      return
    }
    if (!token.trim()) {
      set_form_error('請輸入 token')
      return
    }
    on_submit({ api_url: url, token: token.trim() })
  }

  const message = form_error ?? error

  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <form onSubmit={handle_submit} className="w-full max-w-sm space-y-4 rounded-2xl bg-slate-900 p-6">
        <div>
          <h1 className="text-xl font-semibold">Portfolio Dashboard</h1>
          <p className="mt-1 text-sm text-slate-400">設定只會儲存在這台裝置上</p>
        </div>

        <label className="block space-y-1">
          <span className="text-sm text-slate-300">API 網址</span>
          <input
            type="url"
            inputMode="url"
            autoComplete="off"
            spellCheck={false}
            value={api_url}
            onChange={(e) => set_api_url(e.target.value)}
            placeholder="https://script.google.com/macros/s/.../exec"
            className="w-full rounded-lg bg-slate-800 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-sky-500"
          />
        </label>

        <label className="block space-y-1">
          <span className="text-sm text-slate-300">Token</span>
          <input
            type="password"
            autoComplete="off"
            value={token}
            onChange={(e) => set_token(e.target.value)}
            className="w-full rounded-lg bg-slate-800 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-sky-500"
          />
        </label>

        {message && <p className="text-sm text-rose-400">{message}</p>}

        <button
          type="submit"
          className="w-full rounded-lg bg-sky-600 py-2 font-medium hover:bg-sky-500 active:bg-sky-700"
        >
          登入
        </button>
      </form>
    </main>
  )
}
