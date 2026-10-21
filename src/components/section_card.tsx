import { useState, type ReactNode } from 'react'
import { load_collapsed, save_collapsed } from '../lib/storage'

interface Props {
  id: string
  title: ReactNode
  right?: ReactNode
  children: ReactNode
}

/** Card with a clickable header that collapses its body; collapsed state is remembered per device */
export function SectionCard({ id, title, right, children }: Props) {
  const [open, set_open] = useState(() => !load_collapsed(id))

  const toggle = () => {
    save_collapsed(id, open)
    set_open(!open)
  }

  return (
    <section className="rounded-2xl bg-slate-900">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="flex w-full items-baseline justify-between gap-3 px-5 py-3 text-left"
      >
        <h2 className="flex items-center gap-2 font-semibold">
          <span className={`inline-block text-xs text-slate-500 transition-transform ${open ? 'rotate-90' : ''}`}>
            ▶
          </span>
          {title}
        </h2>
        {right && <span className="text-sm tabular-nums text-slate-400">{right}</span>}
      </button>
      {open && <div className="@container pb-2">{children}</div>}
    </section>
  )
}
