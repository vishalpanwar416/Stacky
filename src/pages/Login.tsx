import { Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { Logo } from '../components/Logo'
import { Skeleton } from '../components/Skeleton'

const features = [
  {
    title: 'Collaborative workspaces',
    description: 'Create shared workspaces to work with friends on your new SaaS idea, side projects, or anything else. Add projects inside each so you can focus and filter your dashboard when you need to.',
    icon: 'folder',
  },
  {
    title: 'Focus with a small queue',
    description: 'Limit how many tasks are in progress so you don’t get overwhelmed. Set your own cap, pull from the queue when ready, and search or browse history to find anything.',
    icon: 'list',
  },
  {
    title: 'Move fast with the keyboard',
    description: 'Add tasks and switch context without the mouse. Quick add with ⌘K, jump between workspaces and projects with shortcuts, and press ? anytime for the full list.',
    icon: 'keyboard',
  },
  {
    title: 'Work in light or dark',
    description: 'Switch between light, dark, or system theme so the app fits how and when you work — and is easy on your eyes.',
    icon: 'palette',
  },
  {
    title: 'Collaborate on tasks',
    description: 'Add watchers to tasks, leave comments, and see activity so you and your friends stay in sync — no extra tools or meetings needed.',
    icon: 'people',
  },
  {
    title: 'See what’s next',
    description: 'Prioritize with P0–P3, move tasks from backlog to in progress to done, and link blocked tasks so you know what’s waiting on what.',
    icon: 'flag',
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
    default:
      return null
  }
}

export function Login() {
  const { user, loading, signInWithGoogle, authError, clearAuthError } = useAuth()

  if (loading) {
    return (
      <div className="theme-page flex min-h-screen flex-col items-center justify-center gap-6 p-8">
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
    <div className="theme-page flex min-h-screen flex-col relative overflow-x-hidden">
      {/* Background */}
      <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none" aria-hidden>
        <div
          className="absolute inset-0 opacity-[0.85]"
          style={{
            background: 'radial-gradient(ellipse 120% 90% at 50% -20%, var(--color-accent-muted), transparent 50%)',
          }}
        />
        <div
          className="absolute inset-0 opacity-50"
          style={{
            background: 'radial-gradient(ellipse 60% 40% at 90% 50%, var(--color-accent-muted), transparent 55%)',
          }}
        />
        <div
          className="absolute inset-0 opacity-40"
          style={{
            background: 'radial-gradient(ellipse 50% 40% at 10% 80%, var(--color-accent-muted), transparent 50%)',
          }}
        />
        <div
          className="absolute inset-0"
          style={{
            background: 'linear-gradient(to bottom, transparent 0%, var(--color-bg) 88%)',
          }}
        />
      </div>

      <main className="flex-1 flex flex-col lg:grid lg:grid-cols-[1fr_1.1fr] lg:gap-16 xl:gap-20 items-center justify-center w-full max-w-7xl mx-auto px-4 sm:px-6 py-12 sm:py-16 lg:py-20 lg:min-h-[calc(100vh-5rem)]">
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
          <h1 className="text-4xl font-bold font-display tracking-tight sm:text-5xl lg:text-5xl xl:text-6xl" style={{ color: 'var(--color-text)' }}>
            Stacky
          </h1>
          <span className="mt-3 inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1 text-xs font-medium theme-accent-bg">
            <span className="h-1.5 w-1.5 rounded-full bg-current opacity-80" aria-hidden style={{ color: 'var(--color-accent)' }} />
            Open source
          </span>
          <p className="mx-auto lg:mx-0 mt-4 max-w-md text-base sm:text-lg theme-page-muted">
            Keep track of your work in one place — from daily tasks to big projects. Create collaborative workspaces to work with your friends on your new SaaS idea, side projects, and more. Stay focused and get things done.
          </p>
          <div className="mt-8 flex flex-col items-center lg:items-start w-full">
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
              className="rounded-2xl border-2 px-8 py-4 font-semibold text-base transition-all duration-300 hover:scale-[1.03] active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-(--color-accent) focus:ring-offset-2 focus:ring-offset-(--color-bg) theme-accent-bg hover:shadow-lg"
              style={{
                color: 'var(--color-accent)',
                borderColor: 'var(--color-accent)',
                boxShadow: '0 4px 24px -4px var(--color-accent-muted)',
              }}
            >
              Sign in with Google
            </button>
            <p className="mt-4 text-xs theme-page-muted text-center lg:text-left">
              Press <kbd className="rounded border px-1.5 py-0.5 font-mono text-[10px] theme-surface">?</kbd> in the app for all shortcuts.
            </p>
          </div>
        </div>

        {/* Feature cards (right on lg) */}
        <section className="w-full mt-14 lg:mt-0">
          <h2 className="text-sm font-semibold uppercase tracking-wider theme-page-muted mb-6 text-center lg:text-left animate-fade-in">
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
        </section>
      </main>

      <footer className="border-t py-3 sm:py-4" style={{ borderColor: 'var(--color-border)' }}>
        <p className="text-center text-xs theme-page-muted">
          Open source · React 19 · TypeScript · Vite · Tailwind CSS 4 · Firebase Auth & Firestore
        </p>
      </footer>
    </div>
  )
}
