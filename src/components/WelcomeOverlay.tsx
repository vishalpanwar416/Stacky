import { useEffect, useState } from 'react'
import { Logo } from './Logo'

const STORAGE_KEY = 'stacky_show_welcome'
const DURATION_MS = 3200

interface WelcomeOverlayProps {
  /** Optional display name for personalized greeting (e.g. first name) */
  displayName?: string | null
}

export function WelcomeOverlay({ displayName }: WelcomeOverlayProps) {
  const [visible, setVisible] = useState(false)
  const [exiting, setExiting] = useState(false)

  useEffect(() => {
    try {
      if (sessionStorage.getItem(STORAGE_KEY) !== '1') return
      setVisible(true)
      const t = setTimeout(() => {
        setExiting(true)
        setTimeout(() => {
          setVisible(false)
          try {
            sessionStorage.removeItem(STORAGE_KEY)
          } catch {}
        }, 500)
      }, DURATION_MS)
      return () => clearTimeout(t)
    } catch {
      return undefined
    }
  }, [])

  const handleDismiss = () => {
    if (!visible || exiting) return
    setExiting(true)
    setTimeout(() => {
      setVisible(false)
      try {
        sessionStorage.removeItem(STORAGE_KEY)
      } catch {}
    }, 500)
  }

  if (!visible) return null

  const firstName = displayName?.trim().split(/\s+/)[0] || null
  const greeting = firstName ? `Hi, ${firstName}` : 'Welcome'

  return (
    <div
      role="dialog"
      aria-label="Welcome"
      className="fixed inset-0 z-100 flex items-center justify-center overflow-hidden transition-opacity duration-500"
      style={{
        opacity: exiting ? 0 : 1,
        background: 'var(--color-bg)',
      }}
      onClick={handleDismiss}
    >
      {/* Subtle radial glow behind logo */}
      <div
        className="absolute inset-0 pointer-events-none welcome-glow"
        aria-hidden
      />
      <div
        className="relative flex flex-col items-center justify-center gap-8 px-8 py-12"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="welcome-splash-logo">
          <Logo
            className="h-20 w-20 sm:h-24 sm:w-24 welcome-logo-icon"
            style={{ color: 'var(--color-accent)' }}
          />
        </div>
        <div className="flex flex-col items-center gap-3 text-center">
          <p
            className="text-lg sm:text-xl font-medium welcome-splash-greeting"
            style={{ color: 'var(--color-text-muted)' }}
          >
            {greeting}
          </p>
          <h1
            className="text-3xl font-bold tracking-tight sm:text-4xl md:text-5xl font-display welcome-splash-brand"
            style={{ color: 'var(--color-text)' }}
          >
            Stacky
          </h1>
          <p
            className="text-sm welcome-splash-tagline"
            style={{ color: 'var(--color-text-muted)' }}
          >
            Your task queue, sorted.
          </p>
        </div>
      </div>
    </div>
  )
}
