import { Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { Logo } from '../components/Logo'
import { Skeleton } from '../components/Skeleton'

const features = [
  {
    title: 'Morning — set the scene',
    description: 'You open Stacky, see today’s plan on a calm dark canvas, and drop fresh ideas into the queue with a quick shortcut.',
    icon: 'keyboard',
  },
  {
    title: 'Afternoon — stay in flow',
    description: 'A tiny in‑progress limit keeps you focused while the calendar view shows what’s due next. Timers quietly track the real story of your work.',
    icon: 'calendar',
  },
  {
    title: 'Evening — share the win',
    description: 'Mark tasks done, add a note, and let the workspace history tell the team what shipped today.',
    icon: 'people',
  },
  {
    title: 'Calendar, not chaos',
    description: 'Sync Google Calendar and schedule tasks by day so your work and events live on one timeline.',
    icon: 'flag',
  },
  {
    title: 'Offline still counts',
    description: 'Keep working on the plane or with spotty Wi‑Fi—your updates sync the moment you’re back.',
    icon: 'cloud',
  },
  {
    title: 'Privacy-first by default',
    description: 'Firebase Auth + Firestore rules keep data locked down; nothing is shared unless you invite it.',
    icon: 'shield',
  },
]

function FeatureIcon({ name }: { name: string }) {
  const style = { color: 'var(--color-accent)' }
  switch (name) {
    case 'folder':
      return (
        <svg className="h-5 w-5 shrink-0 opacity-90" style={style} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
        </svg>
      )
    case 'list':
      return (
        <svg className="h-5 w-5 shrink-0 opacity-90" style={style} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
        </svg>
      )
    case 'keyboard':
      return (
        <svg className="h-5 w-5 shrink-0 opacity-90" style={style} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 10h16M4 14h10m4 0h2M4 18h4m6 0h6m-6-4h2m-2 0h2m-2-4h2m-2 0h2" />
        </svg>
      )
    case 'palette':
      return (
        <svg className="h-5 w-5 shrink-0 opacity-90" style={style} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
        </svg>
      )
    case 'people':
      return (
        <svg className="h-5 w-5 shrink-0 opacity-90" style={style} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
      )
    case 'flag':
      return (
        <svg className="h-5 w-5 shrink-0 opacity-90" style={style} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 3 3 3h-8.5l-1-1H5a2 2 0 00-2 2zm9-13.5V9" />
        </svg>
      )
    case 'calendar':
      return (
        <svg className="h-5 w-5 shrink-0 opacity-90" style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
          <rect x="3" y="5" width="18" height="16" rx="3" />
          <path d="M3 10h18" />
          <path d="M8 3v4" />
          <path d="M16 3v4" />
          <circle cx="9" cy="14" r="1" />
          <circle cx="13" cy="14" r="1" />
          <circle cx="17" cy="14" r="1" />
        </svg>
      )
    case 'cloud':
      return (
        <svg className="h-5 w-5 shrink-0 opacity-90" style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18h11a4 4 0 100-8 6 6 0 10-11.31 3.5" />
        </svg>
      )
    case 'shield':
      return (
        <svg className="h-5 w-5 shrink-0 opacity-90" style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 3l7 4v5c0 4.5-3.5 7.5-7 9-3.5-1.5-7-4.5-7-9V7l7-4z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.5 12.5l1.5 1.5 3.5-3.5" />
        </svg>
      )
    default:
      return null
  }
}

import updates from '../../docs/updates.json'

export function Login() {
  const { user, loading, signInWithGoogle, authError, clearAuthError } = useAuth()

  if (loading) {
    return (
      <div className="theme-page flex min-h-screen flex-col items-center justify-center gap-6 p-8">
        <div style={{ color: 'black' }}>Loading application...</div>
        <Skeleton className="h-12 w-12 rounded-2xl" />
        <Skeleton className="h-10 w-48 rounded-lg" />
        <div className="flex gap-3">
          <Skeleton className="h-12 w-32 rounded-2xl" />
          <Skeleton className="h-12 w-24 rounded-2xl" />
        </div>
      </div>
    )
  }
  if (user) {
    return <Navigate to="/" replace />
  }

  return (
    <div className="theme-page force-dark flex min-h-screen flex-col relative overflow-hidden" style={{ backgroundColor: 'var(--color-bg)' }}>
      {/* Background */}
      <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none" aria-hidden>
        <div
          className="absolute inset-0 opacity-[0.9]"
          style={{
            background: 'radial-gradient(ellipse 120% 90% at 50% -20%, rgba(99,102,241,0.45), transparent 52%)',
          }}
        />
        <div
          className="absolute inset-0 opacity-50"
          style={{
            background: 'radial-gradient(ellipse 60% 40% at 90% 50%, rgba(56,189,248,0.28), transparent 55%)',
          }}
        />
        <div
          className="absolute inset-0 opacity-40"
          style={{
            background: 'radial-gradient(ellipse 50% 40% at 10% 80%, rgba(16,185,129,0.22), transparent 50%)',
          }}
        />
        <div
          className="absolute inset-0"
          style={{
            background: 'linear-gradient(to bottom, rgba(0,0,0,0) 0%, var(--color-bg) 88%)',
          }}
        />
      </div>

      <main className="flex-1 flex flex-col lg:grid lg:grid-cols-[1fr_1.1fr] lg:gap-12 xl:gap-14 items-center justify-center w-full max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8 lg:py-12 lg:min-h-[calc(100vh-4rem)] max-h-[calc(100vh-4rem)] overflow-auto lg:overflow-visible">
        {/* Hero + CTA (left on lg) */}
        <div className="flex flex-col items-center lg:items-start text-center lg:text-left w-full max-w-xl mx-auto lg:mx-0 animate-stagger">
          <div
            className="rounded-2xl p-4 mb-6 backdrop-blur-sm border transition-transform duration-500 animate-landing-float"
            style={{
              background: 'var(--color-surface)',
              borderColor: 'var(--color-border)',
              boxShadow: 'var(--shadow-md)',
            }}
          >
            <Logo className="w-14 h-14 sm:w-16 sm:h-16" style={{ color: 'var(--color-accent)' }} />
          </div>
          <h1 className="text-3xl sm:text-4xl lg:text-5xl xl:text-6xl font-bold font-display tracking-tight" style={{ color: 'var(--color-text)' }}>
            Stacky
          </h1>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1 text-xs font-medium theme-accent-bg">
              <span className="h-1.5 w-1.5 rounded-full bg-current opacity-80" aria-hidden style={{ color: 'var(--color-accent)' }} />
              Open source
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1 text-xs font-medium bg-emerald-500/10 border-emerald-500/20 text-emerald-400">
              <span className="h-1.5 w-1.5 rounded-full bg-current opacity-80" aria-hidden />
              New: Google Calendar Sync
            </span>
          </div>
          <p className="mx-auto lg:mx-0 mt-4 max-w-md text-base sm:text-lg theme-page-muted">
            Imagine your day as a simple arc: you set the scene, stay in flow, and close the loop. Stacky keeps that story intact—across workspaces, projects, and the calendar—without pulling you out of momentum.
          </p>
          <div className="mt-6 sm:mt-8 flex flex-col items-center lg:items-start w-full gap-3">
            {authError && (
              <div className="mb-4 w-full max-w-sm rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200">
                <p>{authError}</p>
                <button type="button" onClick={clearAuthError} className="mt-2 text-xs underline hover:no-underline">
                  Dismiss
                </button>
              </div>
            )}
            <button
              type="button"
              onClick={signInWithGoogle}
              className="w-full max-w-sm rounded-2xl border-2 px-6 sm:px-8 py-3.5 sm:py-4 font-semibold text-base transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-(--color-accent) focus:ring-offset-2 focus:ring-offset-(--color-bg) theme-accent-bg hover:shadow-lg"
              style={{
                color: 'var(--color-accent)',
                borderColor: 'var(--color-accent)',
                boxShadow: '0 4px 24px -4px var(--color-accent-muted)',
              }}
            >
              Sign in with Google
            </button>
            <p className="mt-2 text-xs theme-page-muted text-center lg:text-left">
              Press <kbd className="rounded border px-1.5 py-0.5 font-mono text-[10px] theme-surface">?</kbd> in the app for all shortcuts.
            </p>
          </div>

          {/* New: Updates Section */}
          <div className="mt-12 w-full max-w-md hidden lg:block animate-fade-in">
            <h2 className="text-sm font-semibold uppercase tracking-wider theme-page-muted mb-4 flex items-center gap-2">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10l4 4v10a2 2 0 01-2 2z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 3v3a1 1 0 001 1h3" />
              </svg>
              What's New
            </h2>
            <div className="space-y-4">
              {updates.slice(0, 2).map((update, idx) => (
                <div key={idx} className="relative pl-4 border-l-2 border-(--color-border) hover:border-(--color-accent)/50 transition-colors">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold uppercase ${update.type === 'feature' ? 'bg-indigo-500/20 text-indigo-400' : 'bg-amber-500/20 text-amber-400'
                      }`}>
                      {update.type}
                    </span>
                    <span className="text-[10px] theme-page-muted">{update.date}</span>
                  </div>
                  <h3 className="text-sm font-medium text-(--color-text)">{update.title}</h3>
                  <p className="text-xs theme-page-muted mt-0.5 line-clamp-2">{update.description}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Feature cards (right on lg) */}
        <section className="w-full mt-8 lg:mt-0 max-h-[60vh] overflow-auto lg:overflow-visible pr-1 flex flex-col gap-8">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wider theme-page-muted mb-5 text-center lg:text-left animate-fade-in">
              How it helps you
            </h2>
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 animate-stagger">
              {features.map((f) => (
                <li key={f.title}>
                  <div
                    className="group rounded-2xl border p-4 sm:p-5 backdrop-blur-sm transition-all duration-300 hover:scale-[1.02] hover:border-(--color-accent)/30 hover:shadow-lg hover:shadow-(--color-accent-muted)/20"
                    style={{
                      background: 'var(--color-surface)',
                      borderColor: 'var(--color-border)',
                    }}
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className="rounded-xl p-2 shrink-0 transition-colors duration-300 group-hover:opacity-100"
                        style={{ background: 'var(--color-accent-muted)' }}
                      >
                        <FeatureIcon name={f.icon} />
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-semibold text-sm sm:text-base" style={{ color: 'var(--color-text)' }}>
                          {f.title}
                        </h3>
                        <p className="mt-1 text-xs sm:text-sm theme-page-muted leading-relaxed">
                          {f.description}
                        </p>
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          {/* Mobile Updates Section */}
          <div className="lg:hidden mt-4">
            <h2 className="text-sm font-semibold uppercase tracking-wider theme-page-muted mb-4 text-center">
              What's New
            </h2>
            <div className="space-y-4">
              {updates.slice(0, 2).map((update, idx) => (
                <div key={idx} className="rounded-2xl border p-4 backdrop-blur-sm" style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }}>
                  <div className="flex items-center justify-between mb-2">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${update.type === 'feature' ? 'bg-indigo-500/20 text-indigo-400' : 'bg-amber-500/20 text-amber-400'
                      }`}>
                      {update.type}
                    </span>
                    <span className="text-[10px] theme-page-muted">{update.date}</span>
                  </div>
                  <h3 className="text-sm font-medium text-(--color-text)">{update.title}</h3>
                  <p className="text-xs theme-page-muted mt-1">{update.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t py-3 sm:py-4" style={{ borderColor: 'var(--color-border)' }}>
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row justify-between items-center gap-2">
          <p className="text-xs theme-page-muted text-center sm:text-left">
            Open source · React 19 · TypeScript · Vite · Tailwind CSS 4 · Firebase Auth & Firestore
          </p>
          <div className="flex gap-4">
            <a href="/docs/CHANGELOG.md" className="text-xs theme-page-muted hover:text-(--color-accent) transition-colors">Changelog</a>
            <a href="/docs/DATA_MODEL.md" className="text-xs theme-page-muted hover:text-(--color-accent) transition-colors">Documentation</a>
          </div>
        </div>
      </footer>

    </div>
  )
}
