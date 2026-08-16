import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import { useAuth } from './AuthContext'
import { getWorkspacesForUser, subscribeWorkspaces } from '../lib/workspaces'
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

  useEffect(() => {
    if (!user) {
      setWorkspaces([])
      setLoading(false)
      return
    }

    setLoading(true)
    const unsubscribe = subscribeWorkspaces(user.uid, (list) => {
      setWorkspaces(list)
      setLoading(false)
    })

    return () => unsubscribe()
    // Deliberately not keyed on currentWorkspaceId: selecting a workspace must
    // not tear down and rebuild the subscription. It used to, and the rebuilt
    // listener's first emission raced the fallback below — picking a workspace
    // you belong to but do not own immediately snapped back to an owned one.
  }, [user])

  // If the selected workspace is gone — deleted, or access removed — fall back.
  // Keyed on the settled list rather than on the act of selecting.
  useEffect(() => {
    if (loading) return
    if (currentWorkspaceId && !workspaces.some((w) => w.id === currentWorkspaceId)) {
      setCurrentWorkspaceIdState(workspaces[0]?.id ?? null)
    }
  }, [workspaces, currentWorkspaceId, loading])

  const refreshWorkspaces = useCallback(async () => {
    if (!user) return
    const list = await getWorkspacesForUser(user.uid)
    setWorkspaces(list)
  }, [user])

  const setCurrentWorkspaceId = useCallback((id: string | null) => {
    setCurrentWorkspaceIdState(id)
    try {
      if (id) localStorage.setItem('stacky_workspace_id', id)
      else localStorage.removeItem('stacky_workspace_id')
    } catch { }
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
