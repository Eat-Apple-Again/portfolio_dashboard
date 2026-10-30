import { useEffect, type ReactNode } from 'react'

// lg keeps a fixed height so filtering a long list does not make the dialog jump
const WIDTH = { md: 'sm:max-w-md', lg: 'h-[90dvh] sm:h-[85dvh] sm:max-w-2xl' }

/** Bottom sheet on mobile, centered dialog on larger screens */
export function Sheet({
  on_close,
  size = 'md',
  children,
}: {
  on_close: () => void
  size?: keyof typeof WIDTH
  children: ReactNode
}) {
  useEffect(() => {
    const on_key = (e: KeyboardEvent) => e.key === 'Escape' && on_close()
    window.addEventListener('keydown', on_key)
    return () => window.removeEventListener('keydown', on_key)
  }, [on_close])

  return (
    <div className="fixed inset-0 z-20 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true">
      <button type="button" aria-label="關閉" className="absolute inset-0 bg-black/60" onClick={on_close} />

      <div
        className={`relative max-h-[90dvh] w-full overflow-y-auto rounded-t-2xl bg-slate-900 p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:rounded-2xl ${WIDTH[size]}`}
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-slate-700 sm:hidden" />
        {children}
      </div>
    </div>
  )
}

export function SheetHeader({ eyebrow, title, sub, on_close }: { eyebrow: ReactNode; title: string; sub?: string; on_close: () => void }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <p className="text-xs text-slate-500">{eyebrow}</p>
        <h3 className="truncate text-lg font-semibold">{title}</h3>
        {sub && <p className="text-sm text-slate-400">{sub}</p>}
      </div>
      <button type="button" onClick={on_close} className="rounded-lg px-2 py-1 text-slate-400 hover:bg-slate-800">
        ✕
      </button>
    </div>
  )
}
