import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import { useAuth } from './AuthContext'
import { doc, getDoc } from 'firebase/firestore'
import { getDb } from '../lib/firebase'
import { getWorkspacesForUser, subscribeWorkspaces } from '../lib/workspaces'
import type { Workspace, WorkspaceRole } from '../types'

interface WorkspaceContextValue {
  /** The signed-in user's role in the current workspace. */
  currentRole: WorkspaceRole
  /** False when the role is readonly. Convenience only — rules are the boundary. */
  canWrite: boolean
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
  const [currentRole, setCurrentRole] = useState<WorkspaceRole>('member')

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

  // Mirror the role so the UI can stop offering actions that firestore.rules
  // will refuse. This is presentation only: a stale or wrong value here changes
  // nothing about what the server actually permits.
  useEffect(() => {
    const workspace = workspaces.find((w) => w.id === currentWorkspaceId) ?? workspaces[0] ?? null
    if (!user || !workspace) {
      setCurrentRole('member')
      return
    }
    if (workspace.ownerId === user.uid) {
      setCurrentRole('owner')
      return
    }
    let cancelled = false
    getDoc(doc(getDb(), 'workspaces', workspace.id, 'members', user.uid))
      .then((snap) => {
        if (!cancelled) setCurrentRole((snap.data()?.role as WorkspaceRole) ?? 'member')
      })
      .catch(() => {
        if (!cancelled) setCurrentRole('member')
      })
    return () => {
      cancelled = true
    }
  }, [user, workspaces, currentWorkspaceId])

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
        currentRole,
        canWrite: currentRole !== 'readonly',
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
