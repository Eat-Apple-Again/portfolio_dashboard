import { useRef, type ReactNode } from 'react'

/** Small "i" button that opens a modal explanation; native <dialog> handles focus trap and Esc */
export function InfoButton({ title, children }: { title: string; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null)

  return (
    <>
      <button
        type="button"
        aria-label={`說明：${title}`}
        onClick={(e) => {
          e.stopPropagation()
          ref.current?.showModal()
        }}
        className="inline-flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-slate-400 ring-1 ring-slate-600 hover:text-slate-100 hover:ring-slate-400"
      >
        i
      </button>
      <dialog
        ref={ref}
        aria-label={title}
        // Click on the backdrop (outside the content box) closes
        onClick={(e) => e.target === ref.current && ref.current.close()}
        className="m-auto w-[min(44rem,calc(100vw-2rem))] rounded-2xl bg-slate-900 text-slate-200 shadow-2xl ring-1 ring-white/10 backdrop:bg-black/60"
      >
        <div className="max-h-[80vh] overflow-y-auto p-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h3 className="font-semibold text-slate-100">{title}</h3>
            <button
              type="button"
              aria-label="關閉"
              onClick={() => ref.current?.close()}
              className="rounded-lg px-2 py-1 text-slate-400 hover:bg-slate-800 hover:text-slate-100"
            >
              ✕
            </button>
          </div>
          <div className="space-y-3 text-sm leading-relaxed text-slate-300 [&_b]:text-slate-100 [&_h4]:mt-4 [&_h4]:font-medium [&_h4]:text-slate-100 [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5">
            {children}
          </div>
        </div>
      </dialog>
    </>
  )
}
