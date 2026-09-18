import { useEffect, useRef, type ReactNode } from 'react'

interface Props {
  title: string
  onClose: () => void
  children: ReactNode
  width?: string
  testId?: string
}

/** Boîte de dialogue accessible : focus initial, fermeture par Échap, rôle dialog. */
export function Modal({ title, onClose, children, width = 'max-w-lg', testId }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const first = ref.current?.querySelector<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')
    first?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose])
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} role="dialog" aria-modal="true" aria-label={title} className={`max-h-full w-full ${width} overflow-y-auto rounded-lg bg-white p-4 shadow-xl`} data-testid={testId}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">{title}</h2>
          <button type="button" className="btn btn-sm" onClick={onClose} aria-label="Fermer">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
