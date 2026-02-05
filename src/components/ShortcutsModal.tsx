import { useEffect } from 'react'

const isMac = typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform)
const mod = isMac ? '⌘' : 'Ctrl'

interface ShortcutsModalProps {
  onClose: () => void
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded-lg border theme-border theme-surface-bg px-2 py-1 font-mono text-xs font-medium theme-text-muted shadow-sm">
      {children}
    </kbd>
  )
}

export function ShortcutsModal({ onClose }: ShortcutsModalProps) {
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center theme-overlay backdrop-blur-sm p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Keyboard shortcuts"
    >
      <div
        className="glass-strong w-full max-w-md rounded-3xl p-6 shadow-xl animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl theme-surface-bg theme-text-muted" aria-hidden>
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 10h16M4 14h6m4 0h6M4 18h8" />
            </svg>
          </span>
          <h2 className="text-lg font-semibold theme-text">Keyboard shortcuts</h2>
        </div>
        <div className="mt-5 space-y-4">
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wider theme-text-muted">Actions</p>
            <ul className="space-y-2 text-sm">
              <li className="flex items-center justify-between gap-4 rounded-xl py-2 px-3 theme-surface-hover-bg">
                <span className="theme-text">New task</span>
                <Kbd>N</Kbd>
              </li>
              <li className="flex items-center justify-between gap-4 rounded-xl py-2 px-3 theme-surface-hover-bg">
                <span className="theme-text">New workspace</span>
                <Kbd>W</Kbd>
              </li>
            </ul>
          </div>
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wider theme-text-muted">Workspace & project</p>
            <ul className="space-y-2 text-sm">
              <li className="flex items-center justify-between gap-4 rounded-xl py-2 px-3 theme-surface-hover-bg">
                <span className="theme-text">Previous workspace</span>
                <Kbd>{mod}+⇧+←</Kbd>
              </li>
              <li className="flex items-center justify-between gap-4 rounded-xl py-2 px-3 theme-surface-hover-bg">
                <span className="theme-text">Next workspace</span>
                <Kbd>{mod}+⇧+→</Kbd>
              </li>
              <li className="flex items-center justify-between gap-4 rounded-xl py-2 px-3 theme-surface-hover-bg">
                <span className="theme-text">All projects</span>
                <Kbd>{mod}+⇧+A</Kbd>
              </li>
              <li className="flex items-center justify-between gap-4 rounded-xl py-2 px-3 theme-surface-hover-bg">
                <span className="theme-text">Previous project</span>
                <Kbd>{mod}+⇧+↑</Kbd>
              </li>
              <li className="flex items-center justify-between gap-4 rounded-xl py-2 px-3 theme-surface-hover-bg">
                <span className="theme-text">Next project</span>
                <Kbd>{mod}+⇧+↓</Kbd>
              </li>
            </ul>
          </div>
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wider theme-text-muted">Search</p>
            <ul className="space-y-2 text-sm">
              <li className="flex items-center justify-between gap-4 rounded-xl py-2 px-3 theme-surface-hover-bg">
                <span className="theme-text">Quick add / command bar</span>
                <Kbd>{mod}+K</Kbd>
              </li>
              <li className="flex items-center justify-between gap-4 rounded-xl py-2 px-3 theme-surface-hover-bg">
                <span className="theme-text">Focus search</span>
                <Kbd>/</Kbd>
              </li>
            </ul>
          </div>
          <div className="flex items-center justify-between gap-4 rounded-xl border-t theme-border pt-4 text-sm">
            <span className="theme-text-muted">Show this help</span>
            <Kbd>?</Kbd>
          </div>
        </div>
        <p className="mt-4 text-center text-xs theme-text-muted">Press <Kbd>Esc</Kbd> to close</p>
      </div>
    </div>
  )
}
