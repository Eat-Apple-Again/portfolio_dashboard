import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react'

const INPUT_CLASS =
  'w-full rounded-lg bg-slate-800 px-3 py-2 text-base outline-none focus:ring-2 focus:ring-sky-500 disabled:opacity-50 sm:text-sm'

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-sm text-slate-300">{label}</span>
      {children}
      {hint && <span className="block text-xs text-slate-500">{hint}</span>}
    </label>
  )
}

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input type="text" autoComplete="off" spellCheck={false} {...props} className={INPUT_CLASS} />
}

export function NumberInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <TextInput inputMode="decimal" {...props} />
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={INPUT_CLASS} />
}

export function Segmented<T extends string>({
  options,
  value,
  on_change,
}: {
  options: { value: T; label: string }[]
  value: T
  on_change: (v: T) => void
}) {
  return (
    <div className="flex rounded-lg bg-slate-800 p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => on_change(o.value)}
          className={`flex-1 rounded-md py-1.5 text-sm ${
            value === o.value ? 'bg-slate-600 font-medium text-white' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
