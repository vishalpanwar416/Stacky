import { useEffect, useState, type ReactNode } from 'react'

import { useAuth } from '../contexts/AuthContext'
import { Logo } from './Logo'
import { NotificationButton } from './NotificationButton'
import { NotificationPopup } from './NotificationPopup'
import { ProfilePopup } from './ProfilePopup'
import { ShortcutsButton } from './ShortcutsButton'
import { ThemeToggle } from './ThemeToggle'

/**
 * The application header, shared by every top-level page.
 *
 * It used to live inline in Dashboard, so Analytics — added later — had its own
 * bare header with no logo, theme toggle, notifications or profile, and read as
 * a different site. One component means the two cannot drift again.
 *
 * The profile and notification popups are the header's own business, so their
 * state lives here. `onOverlayChange` exists only because pages may need to
 * close their own overlays (the Dashboard calendar) when one opens.
 */

interface AppHeaderProps {
  /** Opens the sidebar drawer on small screens. */
  onMenuClick: () => void
  /** Page-specific controls rendered to the left of the shared actions. */
  children?: ReactNode
  /** Omit to hide the shortcuts button on pages that have no shortcuts. */
  onShortcuts?: () => void
  shortcutsOpen?: boolean
  onOverlayChange?: (open: boolean) => void
}

export function AppHeader({
  onMenuClick,
  children,
  onShortcuts,
  shortcutsOpen,
  onOverlayChange,
}: AppHeaderProps) {
  const { user, profile } = useAuth()
  const [profileOpen, setProfileOpen] = useState(false)
  const [notificationsOpen, setNotificationsOpen] = useState(false)

  useEffect(() => {
    onOverlayChange?.(profileOpen || notificationsOpen)
  }, [profileOpen, notificationsOpen, onOverlayChange])

  const avatar = profile?.photoURL ?? user?.photoURL ?? null

  return (
    <header className="sticky top-0 z-10 glass border-b theme-border">
      <div className="mx-auto flex h-14 w-full items-center justify-between gap-4 px-4 sm:px-6">
        <button
          type="button"
          onClick={onMenuClick}
          className="flex shrink-0 items-center gap-2 rounded-xl py-2 px-2 -ml-2 transition-colors theme-surface-hover-bg"
        >
          <Logo className="w-8 h-8 text-(--color-accent)" />
          <span className="text-xl font-bold tracking-tight theme-text">Stacky</span>
        </button>

        <nav className="flex flex-1 items-center justify-end gap-2 sm:gap-3">
          {children}

          <div
            className="h-6 w-px theme-bg-subtle"
            style={{ background: 'var(--color-border)' }}
            aria-hidden
          />

          <div className="flex items-center gap-2">
            <ThemeToggle />
            {onShortcuts && (
              <div className="hidden sm:block">
                <ShortcutsButton onClick={onShortcuts} aria-expanded={shortcutsOpen} />
              </div>
            )}
            <NotificationButton
              onClick={() => setNotificationsOpen((o) => !o)}
              active={notificationsOpen}
            />
            <div className="relative">
              <button
                type="button"
                onClick={() => setProfileOpen((o) => !o)}
                className="flex items-center gap-2 rounded-xl py-1 pl-2 pr-3 transition-colors theme-surface-hover-bg"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-full theme-bg-subtle text-xs theme-text-muted">
                  {avatar ? (
                    <img src={avatar} alt="" className="h-full w-full rounded-full object-cover" />
                  ) : (
                    (profile?.displayName?.[0] || profile?.email?.[0] || '?').toUpperCase()
                  )}
                </div>
                <span className="hidden max-w-[100px] truncate text-sm theme-text-muted sm:block">
                  {profile?.displayName?.split(' ')[0] || 'User'}
                </span>
                <svg
                  className="h-4 w-4 theme-text-faint"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {profileOpen && <ProfilePopup onClose={() => setProfileOpen(false)} />}
            </div>
            {notificationsOpen && <NotificationPopup onClose={() => setNotificationsOpen(false)} />}
          </div>
        </nav>
      </div>
    </header>
  )
}
