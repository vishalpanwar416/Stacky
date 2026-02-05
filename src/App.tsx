import { Component, type ErrorInfo, type ReactNode } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { WorkspaceProvider } from './contexts/WorkspaceContext'
import { ToastProvider } from './contexts/ToastContext'
import { ThemeProvider } from './contexts/ThemeContext'
import { ToastContainer } from './components/ToastContainer'
import { Skeleton } from './components/Skeleton'
import { Dashboard } from './pages/Dashboard'
import { Login } from './pages/Login'
import { CreateWorkspace } from './pages/CreateWorkspace'
import { NewTask } from './pages/NewTask'
import { TaskDetail } from './pages/TaskDetail'
import { isFirebaseConfigured } from './lib/firebase'

class ErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('App error:', error, info.componentStack)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center bg-neutral-950 p-6 text-neutral-300">
          <h1 className="text-xl font-semibold text-white">Something went wrong</h1>
          <pre className="mt-4 max-w-2xl overflow-auto rounded-xl bg-white/5 p-4 text-sm">
            {this.state.error.message}
          </pre>
          <button
            type="button"
            onClick={() => this.setState({ error: null })}
            className="mt-6 rounded-2xl bg-white/10 px-4 py-2 text-sm text-white hover:bg-white/15"
          >
            Try again
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

function FirebaseConfigScreen() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-neutral-950 p-8 text-center text-neutral-400">
      <h1 className="text-xl font-semibold text-white">Firebase not configured</h1>
      <p className="mt-3 max-w-lg text-left text-sm">
        Add your Firebase web app keys to the <code className="rounded bg-white/10 px-1.5 py-0.5">.env</code> file in the project root, then restart the dev server.
      </p>
      <ol className="mt-4 max-w-lg list-inside list-decimal space-y-1 text-left text-sm">
        <li>
          Open{' '}
          <a
            href="https://console.firebase.google.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-neutral-300 underline hover:text-white"
          >
            Firebase Console
          </a>
          , select your project (e.g. Stacky).
        </li>
        <li>Click the gear icon → Project settings → scroll to “Your apps”.</li>
        <li>Select your web app (or add one) and copy the <code className="rounded bg-white/10 px-1 py-0.5">firebaseConfig</code> object.</li>
        <li>Paste each value into <code className="rounded bg-white/10 px-1 py-0.5">.env</code>: <code className="rounded bg-white/10 px-1 py-0.5">apiKey</code> → <code className="rounded bg-white/10 px-1 py-0.5">VITE_FIREBASE_API_KEY</code>, <code className="rounded bg-white/10 px-1 py-0.5">authDomain</code> → <code className="rounded bg-white/10 px-1 py-0.5">VITE_FIREBASE_AUTH_DOMAIN</code>, etc.</li>
        <li>Save <code className="rounded bg-white/10 px-1 py-0.5">.env</code> and run <code className="rounded bg-white/10 px-1 py-0.5">npm run dev</code> again.</li>
      </ol>
      <p className="mt-4 text-xs text-neutral-500">
        Required at minimum: <code className="rounded bg-white/5 px-1">VITE_FIREBASE_API_KEY</code> and <code className="rounded bg-white/5 px-1">VITE_FIREBASE_PROJECT_ID</code>.
      </p>
    </div>
  )
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-950 p-8">
        <div className="flex flex-col items-center gap-4">
          <Skeleton className="h-10 w-10 rounded-xl" />
          <Skeleton className="h-4 w-24 rounded" />
        </div>
      </div>
    )
  }
  if (!user) return <Navigate to="/login" replace />
  return <>{children}</>
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/workspaces/new"
        element={
          <ProtectedRoute>
            <CreateWorkspace />
          </ProtectedRoute>
        }
      />
      <Route
        path="/workspaces/:workspaceId/tasks/new"
        element={
          <ProtectedRoute>
            <NewTask />
          </ProtectedRoute>
        }
      />
      <Route
        path="/tasks/new"
        element={
          <ProtectedRoute>
            <NewTask />
          </ProtectedRoute>
        }
      />
      <Route
        path="/tasks/:id"
        element={
          <ProtectedRoute>
            <TaskDetail />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  if (!isFirebaseConfigured) {
    return <FirebaseConfigScreen />
  }
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <ThemeProvider>
            <WorkspaceProvider>
              <ToastProvider>
                <AppRoutes />
                <ToastContainer />
              </ToastProvider>
            </WorkspaceProvider>
          </ThemeProvider>
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  )
}
