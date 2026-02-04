import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { WorkspaceProvider } from './contexts/WorkspaceContext'
import { Dashboard } from './pages/Dashboard'
import { Login } from './pages/Login'
import { CreateWorkspace } from './pages/CreateWorkspace'
import { NewTask } from './pages/NewTask'
import { TaskDetail } from './pages/TaskDetail'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return <div className="flex min-h-screen items-center justify-center bg-neutral-950 text-neutral-400 animate-fade-in">Loading…</div>
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
  return (
    <BrowserRouter>
      <AuthProvider>
        <WorkspaceProvider>
          <AppRoutes />
        </WorkspaceProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
