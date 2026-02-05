import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { useAuth } from './AuthContext'
import { updateUserPreferences } from '../lib/users'

export type ThemePreference = 'light' | 'dark' | 'system'

interface ThemeContextValue {
  preference: ThemePreference
  effective: 'light' | 'dark'
  setPreference: (p: ThemePreference) => Promise<void>
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

function getSystemDark(): boolean {
  if (typeof window === 'undefined') return true
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

function resolveEffective(preference: ThemePreference): 'light' | 'dark' {
  if (preference === 'system') return getSystemDark() ? 'dark' : 'light'
  return preference
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { user, profile } = useAuth()
  const [preference, setPreferenceState] = useState<ThemePreference>('system')
  const [effective, setEffective] = useState<'light' | 'dark'>(() => resolveEffective('system'))

  useEffect(() => {
    const pref = (profile?.preferences?.theme as ThemePreference) ?? 'system'
    setPreferenceState(pref)
    setEffective(resolveEffective(pref))
  }, [profile?.preferences?.theme])

  useEffect(() => {
    const root = document.documentElement
    root.setAttribute('data-theme', effective)
  }, [effective])

  useEffect(() => {
    if (preference !== 'system') return
    const m = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = (e: MediaQueryListEvent) => setEffective(e.matches ? 'dark' : 'light')
    m.addEventListener('change', handler)
    return () => m.removeEventListener('change', handler)
  }, [preference])

  const setPreference = useCallback(
    async (p: ThemePreference) => {
      setPreferenceState(p)
      setEffective(resolveEffective(p))
      if (user) await updateUserPreferences(user.uid, { theme: p }).catch(() => {})
    },
    [user]
  )

  const value: ThemeContextValue = { preference, effective, setPreference }
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider')
  return ctx
}
