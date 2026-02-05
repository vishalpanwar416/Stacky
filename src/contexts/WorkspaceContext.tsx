import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import { useAuth } from './AuthContext'
import { getWorkspacesForUser } from '../lib/workspaces'
import type { Workspace } from '../types'

interface WorkspaceContextValue {
  workspaces: Workspace[]
  currentWorkspace: Workspace | null
  setCurrentWorkspaceId: (id: string | null) => void
  refreshWorkspaces: () => Promise<void>
  loading: boolean
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null)

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [currentWorkspaceId, setCurrentWorkspaceIdState] = useState<string | null>(() => {
    try {
      return localStorage.getItem('stacky_workspace_id')
    } catch {
      return null
    }
  })
  const [loading, setLoading] = useState(true)

  const refreshWorkspaces = useCallback(async () => {
    if (!user) {
      setWorkspaces([])
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const list = await getWorkspacesForUser(user.uid)
      setWorkspaces(list)
      if (currentWorkspaceId && !list.some((w) => w.id === currentWorkspaceId)) {
        setCurrentWorkspaceIdState(list[0]?.id ?? null)
      }
    } catch (err) {
      console.error('Failed to load workspaces:', err)
      setWorkspaces([])
    } finally {
      setLoading(false)
    }
  }, [user, currentWorkspaceId])

  useEffect(() => {
    refreshWorkspaces()
  }, [refreshWorkspaces])

  const setCurrentWorkspaceId = useCallback((id: string | null) => {
    setCurrentWorkspaceIdState(id)
    try {
      if (id) localStorage.setItem('stacky_workspace_id', id)
      else localStorage.removeItem('stacky_workspace_id')
    } catch {}
  }, [])

  const currentWorkspace =
    workspaces.find((w) => w.id === currentWorkspaceId) ?? workspaces[0] ?? null

  return (
    <WorkspaceContext.Provider
      value={{
        workspaces,
        currentWorkspace,
        setCurrentWorkspaceId: setCurrentWorkspaceId,
        refreshWorkspaces,
        loading,
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  )
}

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext)
  if (!ctx) throw new Error('useWorkspace must be used within WorkspaceProvider')
  return ctx
}
