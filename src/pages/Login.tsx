import { useAuth } from '../contexts/AuthContext'

export function Login() {
  const { signInWithGoogle } = useAuth()

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-neutral-950 px-4">
      <div className="glass-strong w-full max-w-sm rounded-3xl p-8 shadow-2xl animate-scale-in">
        <h1 className="text-center text-2xl font-bold text-white tracking-tight">Stacky</h1>
        <p className="mt-2 text-center text-neutral-400 text-sm">
          Your task queue. Office, personal, shared — one place.
        </p>
        <button
          type="button"
          onClick={signInWithGoogle}
          className="mt-6 w-full rounded-2xl bg-white/10 px-4 py-3.5 font-medium text-white border border-white/10 transition-all duration-300 hover:bg-white/15 hover:scale-[1.02] active:scale-[0.99] focus:outline-none focus:ring-2 focus:ring-neutral-400 focus:ring-offset-2 focus:ring-offset-neutral-950"
        >
          Sign in with Google
        </button>
      </div>
    </div>
  )
}
