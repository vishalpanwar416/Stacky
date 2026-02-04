import { Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

export function Login() {
  const {
    user,
    loading,
    signInWithGoogle,
    signInWithGoogleRedirect,
    authError,
    clearAuthError,
  } = useAuth()

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-950 text-neutral-400">
        Loading…
      </div>
    )
  }
  if (user) {
    return <Navigate to="/" replace />
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-neutral-950 px-4">
      <div className="glass-strong w-full max-w-sm rounded-3xl p-8 shadow-2xl animate-scale-in">
        <h1 className="text-center text-2xl font-bold text-white tracking-tight">Stacky</h1>
        <p className="mt-2 text-center text-neutral-400 text-sm">
          Your task queue. Office, personal, shared — one place.
        </p>
        {authError && (
          <div className="mt-4 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200">
            <p>{authError}</p>
            <button
              type="button"
              onClick={clearAuthError}
              className="mt-2 text-xs underline hover:no-underline"
            >
              Dismiss
            </button>
          </div>
        )}
        <button
          type="button"
          onClick={signInWithGoogle}
          className="mt-6 w-full rounded-2xl bg-white/10 px-4 py-3.5 font-medium text-white border border-white/10 transition-all duration-300 hover:bg-white/15 hover:scale-[1.02] active:scale-[0.99] focus:outline-none focus:ring-2 focus:ring-neutral-400 focus:ring-offset-2 focus:ring-offset-neutral-950"
        >
          Sign in with Google
        </button>
        <button
          type="button"
          onClick={signInWithGoogleRedirect}
          className="mt-3 w-full rounded-2xl bg-white/5 px-4 py-2.5 text-sm text-neutral-400 border border-white/5 transition-all duration-200 hover:bg-white/10 hover:text-neutral-300 focus:outline-none focus:ring-2 focus:ring-neutral-500 focus:ring-offset-2 focus:ring-offset-neutral-950"
        >
          Sign in with Google (redirect)
        </button>
        <p className="mt-3 text-center text-xs text-neutral-500">
          If the first button fails, use the redirect option.
        </p>
      </div>
    </div>
  )
}
