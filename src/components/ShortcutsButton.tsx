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
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M4 6h16M4 10h16M4 14h6m4 0h6M4 18h8" />
      </svg>
    </button>
  )
}
