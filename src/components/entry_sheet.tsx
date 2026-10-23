import { useEffect, useRef, useState } from 'react'
import { add_trade, add_transfer } from '../lib/api'
import type { Credentials, NewTrade, NewTransfer, SheetData } from '../types'
import { Segmented } from './form_fields'
import { TradeForm } from './trade_form'
import { TransferForm } from './transfer_form'

type Tab = 'trade' | 'transfer'

interface Props {
  credentials: Credentials
  sheet: SheetData
  on_close: () => void
  on_saved: () => void
}

export function EntrySheet({ credentials, sheet, on_close, on_saved }: Props) {
  const [tab, set_tab] = useState<Tab>('trade')
  const [submitting, set_submitting] = useState(false)
  const [error, set_error] = useState<string | null>(null)
  // One id per form session: a retry after a network error is rejected server-side as a duplicate
  const id_ref = useRef(crypto.randomUUID())

  useEffect(() => {
    const on_key = (e: KeyboardEvent) => e.key === 'Escape' && !submitting && on_close()
    window.addEventListener('keydown', on_key)
    return () => window.removeEventListener('keydown', on_key)
  }, [on_close, submitting])

  const submit = async (send: () => Promise<unknown>) => {
    set_submitting(true)
    set_error(null)
    try {
      await send()
      on_saved()
    } catch (err) {
      set_error(err instanceof Error ? err.message : String(err))
    } finally {
      set_submitting(false)
    }
  }

  const submit_trade = (r: Omit<NewTrade, 'id'>) =>
    submit(() => add_trade(credentials, { ...r, id: id_ref.current }))
  const submit_transfer = (r: Omit<NewTransfer, 'id'>) =>
    submit(() => add_transfer(credentials, { ...r, id: id_ref.current }))

  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true">
      <button
        type="button"
        aria-label="關閉"
        className="absolute inset-0 bg-black/60"
        onClick={() => !submitting && on_close()}
      />

      <div className="relative max-h-[92dvh] w-full overflow-y-auto rounded-t-2xl bg-slate-900 p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:max-w-lg sm:rounded-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold">記一筆</h3>
          <button
            type="button"
            onClick={on_close}
            disabled={submitting}
            className="rounded-lg px-2 py-1 text-slate-400 hover:bg-slate-800"
          >
            ✕
          </button>
        </div>

        <div className="mb-4">
          <Segmented
            options={[
              { value: 'trade', label: '交易' },
              { value: 'transfer', label: '轉帳 / 收支' },
            ]}
            value={tab}
            on_change={set_tab}
          />
        </div>

        {tab === 'trade' ? (
          <TradeForm
            holdings={sheet.holdings}
            accounts={sheet.accounts}
            submitting={submitting}
            on_submit={submit_trade}
          />
        ) : (
          <TransferForm
            accounts={sheet.accounts}
            presets={sheet.presets}
            submitting={submitting}
            on_submit={submit_transfer}
          />
        )}

        {error && <p className="mt-3 rounded-lg bg-rose-950/60 px-3 py-2 text-sm text-rose-300">送出失敗：{error}</p>}
      </div>
    </div>
  )
}
