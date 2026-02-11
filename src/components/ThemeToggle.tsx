import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useTheme, type ThemePreference } from '../contexts/ThemeContext'

const OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' },
]

export function ThemeToggle() {
  const { preference, effective, setPreference } = useTheme()
  const [open, setOpen] = useState(false)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const [rect, setRect] = useState<DOMRect | null>(null)

  useEffect(() => {
    if (open && buttonRef.current) {
      setRect(buttonRef.current.getBoundingClientRect())
    }
  }, [open])

  return (
    <div className="relative shrink-0">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="rounded-xl p-2 transition-colors hover:opacity-80 focus:outline-none focus:ring-2 focus:ring-(--color-accent) focus:ring-offset-2 focus:ring-offset-(--color-bg)"
        style={{ color: 'var(--color-text-muted)' }}
        title="Theme"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label="Theme"
      >
        {effective === 'dark' ? (
          <span className="text-sm" aria-hidden>🌙</span>
        ) : (
          <span className="text-sm" aria-hidden>☀️</span>
        )}
      </button>

      {open && rect && createPortal(
        <>
          <div
            className="fixed inset-0 z-[999] bg-black/50 backdrop-blur-md transition-opacity"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          <ul
            className="fixed z-[1000] mt-2 min-w-[110px] rounded-xl border py-1 shadow-lg transition-colors animate-scale-in"
            style={{
              top: `${rect.bottom}px`,
              right: `${window.innerWidth - rect.right}px`,
              backgroundColor: 'var(--color-bg-subtle)',
              borderColor: 'var(--color-border)',
              boxShadow: 'var(--shadow-md)',
            }}
            role="listbox"
            aria-label="Theme"
          >
            {OPTIONS.map((opt) => (
              <li key={opt.value} role="option" aria-selected={preference === opt.value}>
                <button
                  type="button"
                  onClick={() => {
                    setPreference(opt.value)
                    setOpen(false)
                  }}
                  className="w-full px-3 py-2 text-left text-sm transition-colors hover:bg-(--color-surface-hover) focus:outline-none focus:bg-(--color-surface-hover)"
                  style={{
                    color: 'var(--color-text)',
                  }}
                >
                  {opt.label}
                  {preference === opt.value && (
                    <span className="ml-1.5 text-(--color-accent)">✓</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </>,
        document.body
      )}
    </div>
  )
}
