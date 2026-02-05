import { useState, useRef, useEffect } from 'react'
import { useTheme, type ThemePreference } from '../contexts/ThemeContext'

const OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' },
]

export function ThemeToggle() {
  const { preference, effective, setPreference } = useTheme()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('click', onOutside)
    return () => window.removeEventListener('click', onOutside)
  }, [open])

  return (
    <div className="relative shrink-0" ref={ref}>
      <button
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
      {open && (
        <ul
          className="absolute right-0 top-full z-20 mt-1.5 min-w-[110px] rounded-xl border py-1 shadow-lg transition-colors"
          style={{
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
      )}
    </div>
  )
}
