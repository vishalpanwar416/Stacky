import { useEffect } from 'react'
import { useToast, type ToastVariant } from '../contexts/ToastContext'

const AUTO_DISMISS_MS = 4500

const variantStyles: Record<ToastVariant, string> = {
  success: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200',
  error: 'border-amber-500/40 bg-amber-500/10 text-amber-200',
  info: 'border-white/15 bg-white/10 text-neutral-200',
}

export function ToastContainer() {
  const { toasts, removeToast } = useToast()

  return (
    <div
      className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 max-w-[min(24rem,calc(100vw-2rem))] pointer-events-none"
      aria-live="polite"
      aria-label="Notifications"
    >
      {toasts.map((t) => (
        <ToastItem key={t.id} item={t} onDismiss={() => removeToast(t.id)} />
      ))}
    </div>
  )
}

function ToastItem({ item, onDismiss }: { item: { id: number; message: string; variant: ToastVariant }; onDismiss: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDismiss, AUTO_DISMISS_MS)
    return () => clearTimeout(t)
  }, [onDismiss])

  return (
    <div
      className={`pointer-events-auto rounded-2xl border px-4 py-3 text-sm shadow-lg backdrop-blur-xl animate-toast-in ${variantStyles[item.variant]}`}
      role="status"
    >
      {item.message}
    </div>
  )
}
