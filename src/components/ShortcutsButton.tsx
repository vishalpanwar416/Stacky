interface ShortcutsButtonProps {
  onClick: () => void
  'aria-expanded'?: boolean
}

export function ShortcutsButton({ onClick, 'aria-expanded': ariaExpanded }: ShortcutsButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1.5 rounded-xl px-2.5 py-2 text-sm theme-text-muted transition-colors theme-surface-hover-bg hover:theme-text focus:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent) focus-visible:ring-offset-2 focus-visible:ring-offset-(--color-bg)"
      title="Keyboard shortcuts"
      aria-label="Show keyboard shortcuts"
      aria-expanded={ariaExpanded}
    >
      <svg
        className="h-5 w-5 shrink-0"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <circle cx="12" cy="12" r="9" />
        <path d="M12 16h.01" />
        <path d="M9.5 9a2.5 2.5 0 115 0c0 1.5-1.25 2-1.75 2.25-.5.25-.75.75-.75 1.25" />
      </svg>
    </button>
  )
}
