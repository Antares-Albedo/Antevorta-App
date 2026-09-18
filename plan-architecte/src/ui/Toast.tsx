import { create } from 'zustand'

interface ToastState {
  messages: { id: number; text: string; kind: 'info' | 'erreur' }[]
  push: (text: string, kind?: 'info' | 'erreur') => void
  remove: (id: number) => void
}

let counter = 0
export const useToast = create<ToastState>((set) => ({
  messages: [],
  push: (text, kind = 'info') => {
    const id = ++counter
    set((s) => ({ messages: [...s.messages, { id, text, kind }] }))
    setTimeout(() => set((s) => ({ messages: s.messages.filter((m) => m.id !== id) })), kind === 'erreur' ? 7000 : 3500)
  },
  remove: (id) => set((s) => ({ messages: s.messages.filter((m) => m.id !== id) })),
}))

export function ToastContainer() {
  const messages = useToast((s) => s.messages)
  const remove = useToast((s) => s.remove)
  if (messages.length === 0) return null
  return (
    <div className="pointer-events-none fixed bottom-4 left-1/2 z-[60] flex -translate-x-1/2 flex-col gap-2" aria-live="polite">
      {messages.map((m) => (
        <div key={m.id} className={`pointer-events-auto flex items-center gap-2 rounded px-3 py-2 text-sm shadow-lg ${m.kind === 'erreur' ? 'bg-red-600 text-white' : 'bg-slate-800 text-white'}`} role={m.kind === 'erreur' ? 'alert' : 'status'}>
          <span>{m.text}</span>
          <button type="button" className="text-white/70 hover:text-white" onClick={() => remove(m.id)} aria-label="Fermer le message">
            ✕
          </button>
        </div>
      ))}
    </div>
  )
}
