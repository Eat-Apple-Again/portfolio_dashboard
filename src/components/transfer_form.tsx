import { useState, type FormEvent } from 'react'
import {
  compact_to_datetime_input,
  datetime_input_to_compact,
  fmt_compact_datetime,
  parse_compact,
} from '../lib/dates'
import { fmt_money, fmt_price, parse_num } from '../lib/format'
import { expand_note, has_template } from '../lib/presets'
import type { Account, NewTransfer, Preset } from '../types'
import { Field, NumberInput, Segmented, Select, TextInput } from './form_fields'

type Mode = 'TRANSFER' | 'INCOME' | 'EXPENSE'

const MODES: { value: Mode; label: string }[] = [
  { value: 'TRANSFER', label: '轉帳' },
  { value: 'INCOME', label: '收入' },
  { value: 'EXPENSE', label: '支出' },
]

const NOTE_HINT: Record<Mode, string> = {
  TRANSFER: '',
  INCOME: '例如：薪水、年終、分紅',
  EXPENSE: '例如：提領現金',
}

interface Props {
  accounts: Account[]
  presets: Preset[]
  submitting: boolean
  on_submit: (record: Omit<NewTransfer, 'id'>) => void
}

/** Transfer between own accounts, income (outside -> account) or expense (account -> outside) */
export function TransferForm({ accounts, presets, submitting, on_submit }: Props) {
  const [mode, set_mode] = useState<Mode>('TRANSFER')
  const [datetime, set_datetime] = useState(() => fmt_compact_datetime(new Date()))
  const [from_sel, set_from] = useState('')
  const [to_sel, set_to] = useState('')
  const [amount, set_amount] = useState('')
  const [to_amount, set_to_amount] = useState('')
  const [fee, set_fee] = useState('')
  const [note, set_note] = useState('')
  const [error, set_error] = useState<string | null>(null)

  const has_from = mode !== 'INCOME'
  const has_to = mode !== 'EXPENSE'
  const from = has_from ? from_sel : ''
  const to = has_to ? to_sel : ''

  const from_cur = accounts.find((a) => a.account === from)?.currency ?? ''
  const to_cur = accounts.find((a) => a.account === to)?.currency ?? ''
  const cross = Boolean(from_cur && to_cur && from_cur !== to_cur)
  const amount_cur = has_from ? from_cur : to_cur

  const a = parse_num(amount)
  const ta = parse_num(to_amount)
  const f = has_from ? (parse_num(fee) ?? 0) : 0
  const received = cross ? ta : (ta ?? a)
  const rate = cross && a && ta && a > 0 && ta > 0 ? Math.max(a, ta) / Math.min(a, ta) : null
  // Templates resolve against the transfer's own date, not today
  const ref_date = parse_compact(datetime)
  const expand = (t: string) => (ref_date ? expand_note(t, ref_date, rate) : t)
  const final_note = expand(note.trim())
  const chips = presets.filter((p) => p.kind === mode || p.kind === 'ALL' || p.kind === '')

  const handle_submit = (e: FormEvent) => {
    e.preventDefault()
    const problems: string[] = []
    if (!parse_compact(datetime) || datetime.length !== 15) problems.push('請選擇時間')
    if (has_from && !from) problems.push('請選擇轉出帳戶')
    if (has_to && !to) problems.push('請選擇轉入帳戶')
    if (from && from === to) problems.push('轉出與轉入帳戶不可相同')
    if (!(a != null && a > 0)) problems.push('金額必須大於 0')
    if (cross && !(ta != null && ta > 0)) problems.push('跨幣別轉帳請填寫轉入金額')
    if (Number.isNaN(f) || f < 0) problems.push('手續費必須是非負數')
    if (has_template(final_note)) problems.push('備註中的 {rate} 需要跨幣別的轉出與轉入金額')
    if (problems.length) return set_error(problems.join('、'))

    set_error(null)
    on_submit({
      datetime,
      from_account: from,
      to_account: to,
      amount: a!,
      to_amount: cross ? ta! : '',
      fee: has_from ? (parse_num(fee) ?? '') : '',
      note: final_note,
    })
  }

  const account_options = accounts.map((acc) => (
    <option key={acc.account} value={acc.account}>
      {acc.account}（{acc.currency}）
    </option>
  ))

  return (
    <form onSubmit={handle_submit} className="space-y-4">
      <Segmented options={MODES} value={mode} on_change={set_mode} />

      <Field label="時間">
        <TextInput
          type="datetime-local"
          step={1}
          value={compact_to_datetime_input(datetime)}
          onChange={(e) => set_datetime(datetime_input_to_compact(e.target.value))}
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        {has_from && (
          <Field label="轉出帳戶">
            <Select value={from_sel} onChange={(e) => set_from(e.target.value)}>
              <option value="">請選擇</option>
              {account_options}
            </Select>
          </Field>
        )}
        {has_to && (
          <Field label="轉入帳戶">
            <Select value={to_sel} onChange={(e) => set_to(e.target.value)}>
              <option value="">請選擇</option>
              {account_options}
            </Select>
          </Field>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label={`金額${amount_cur ? `（${amount_cur}）` : ''}`}>
          <NumberInput value={amount} onChange={(e) => set_amount(e.target.value)} />
        </Field>
        {has_from && (
          <Field label={`手續費${from_cur ? `（${from_cur}）` : ''}`} hint="另外從轉出帳戶扣除">
            <NumberInput value={fee} onChange={(e) => set_fee(e.target.value)} placeholder="0" />
          </Field>
        )}
      </div>

      {cross && (
        <Field
          label={`轉入金額（${to_cur}）`}
          hint={
            a && ta && a > 0 && ta > 0 ? `換算匯率 ${fmt_price(Math.max(a, ta) / Math.min(a, ta))}` : '實際到帳金額'
          }
        >
          <NumberInput value={to_amount} onChange={(e) => set_to_amount(e.target.value)} />
        </Field>
      )}

      <Field label="備註" hint={has_template(note) && final_note !== note ? `將記錄為：${final_note}` : undefined}>
        <TextInput
          value={note}
          maxLength={200}
          placeholder={NOTE_HINT[mode]}
          onChange={(e) => set_note(e.target.value)}
        />
      </Field>

      {chips.length > 0 && (
        <div className="-mt-2 flex flex-wrap gap-1.5">
          {chips.map((p) => (
            <button
              key={p.note}
              type="button"
              onClick={() => set_note(p.note)}
              className={`rounded-full px-2.5 py-1 text-xs ${
                note === p.note ? 'bg-sky-700 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              {expand(p.note)}
            </button>
          ))}
        </div>
      )}

      {(from || to) && a != null && a > 0 && (
        <p className="rounded-lg bg-slate-800/60 px-3 py-2 text-sm text-slate-300">
          {from && (
            <>
              {from} −{fmt_money(a + (Number.isNaN(f) ? 0 : f), from_cur)} {from_cur}
              {to && <br />}
            </>
          )}
          {to && (
            <>
              {to} +{received != null && !Number.isNaN(received) ? fmt_money(received, to_cur) : '—'} {to_cur}
            </>
          )}
        </p>
      )}

      {error && <p className="text-sm text-rose-400">{error}</p>}

      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-lg bg-sky-600 py-2.5 font-medium hover:bg-sky-500 active:bg-sky-700 disabled:opacity-50"
      >
        {submitting ? '送出中…' : '送出'}
      </button>
    </form>
  )
}
