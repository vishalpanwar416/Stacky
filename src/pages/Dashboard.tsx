import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useWorkspace } from '../contexts/WorkspaceContext'
import { subscribeTasksByWorkspace } from '../lib/tasks'
import type { Task } from '../types'

const statusOrder: Task['status'][] = ['in_progress', 'blocked', 'planned', 'backlog', 'done']
const priorityOrder: Task['priority'][] = ['P0', 'P1', 'P2', 'P3']

function sortTasks(tasks: Task[]) {
  return [...tasks].sort((a, b) => {
    const statusA = statusOrder.indexOf(a.status)
    const statusB = statusOrder.indexOf(b.status)
    if (statusA !== statusB) return statusA - statusB
    const priA = priorityOrder.indexOf(a.priority)
    const priB = priorityOrder.indexOf(b.priority)
    return priA - priB
  })
}

export function Dashboard() {
  const navigate = useNavigate()
  const { profile, signOut } = useAuth()
  const { workspaces, currentWorkspace, setCurrentWorkspaceId, loading: wsLoading } = useWorkspace()
  const [tasks, setTasks] = useState<Task[]>([])

  useEffect(() => {
    if (!currentWorkspace) return
    const unsub = subscribeTasksByWorkspace(currentWorkspace.id, setTasks)
    return () => unsub()
  }, [currentWorkspace])

  const inProgress = tasks.filter((t) => t.status === 'in_progress')
  const queue = sortTasks(tasks.filter((t) => t.status !== 'done'))

  return (
    <div className="min-h-screen bg-neutral-950">
      <header className="sticky top-0 z-10 glass border-b border-white/5">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4">
          <h1 className="text-lg font-semibold text-white tracking-tight">Stacky</h1>
          <div className="flex items-center gap-3">
            <select
              value={currentWorkspace?.id ?? ''}
              onChange={(e) => setCurrentWorkspaceId(e.target.value || null)}
              className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-white transition-all duration-200 hover:bg-white/10 focus:border-neutral-400 focus:outline-none focus:ring-1 focus:ring-neutral-400"
            >
              {!currentWorkspace && <option value="">Select workspace</option>}
              {workspaces.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
            <span className="text-sm text-neutral-400">{profile?.displayName}</span>
            <button
              type="button"
              onClick={() => signOut()}
              className="rounded-2xl px-4 py-2 text-sm text-neutral-400 transition-all duration-200 hover:bg-white/5 hover:text-white"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8">
        {wsLoading && (
          <p className="text-neutral-400 animate-fade-in">Loading workspaces…</p>
        )}
        {!wsLoading && !currentWorkspace && workspaces.length === 0 && (
          <div className="glass-strong rounded-3xl p-8 text-center animate-fade-in">
            <p className="text-neutral-300">No workspaces yet.</p>
            <button
              type="button"
              onClick={() => navigate('/workspaces/new')}
              className="mt-4 rounded-2xl bg-white/10 px-5 py-2.5 text-sm font-medium text-white border border-white/10 transition-all duration-300 hover:bg-white/15 hover:scale-[1.02] active:scale-[0.99]"
            >
              Create your first workspace
            </button>
          </div>
        )}
        {currentWorkspace && (
          <>
            <div className="mb-8 flex items-center justify-between animate-fade-in">
              <h2 className="text-xl font-semibold text-white tracking-tight">{currentWorkspace.name}</h2>
              <button
                type="button"
                onClick={() => navigate(`/workspaces/${currentWorkspace.id}/tasks/new`)}
                className="rounded-2xl bg-white/10 px-5 py-2.5 text-sm font-medium text-white border border-white/10 transition-all duration-300 hover:bg-white/15 hover:scale-[1.02] active:scale-[0.99]"
              >
                New task
              </button>
            </div>

            <section className="mb-10">
              <h3 className="mb-4 text-xs font-medium uppercase tracking-widest text-neutral-500">
                In progress ({inProgress.length})
              </h3>
              <ul className="space-y-3 animate-stagger">
                {inProgress.slice(0, 5).map((t) => (
                  <li
                    key={t.id}
                    className="glass-strong flex items-center justify-between rounded-2xl px-5 py-4 transition-all duration-300 hover:bg-white/[0.08]"
                  >
                    <button
                      type="button"
                      onClick={() => navigate(`/tasks/${t.id}`)}
                      className="text-left font-medium text-white hover:underline decoration-neutral-400"
                    >
                      {t.title}
                    </button>
                    <span className="rounded-xl bg-white/10 px-2.5 py-1 text-xs font-medium text-neutral-300">
                      {t.priority}
                    </span>
                  </li>
                ))}
                {inProgress.length === 0 && (
                  <li className="glass rounded-2xl border border-dashed border-white/10 py-8 text-center text-neutral-500">
                    No tasks in progress. Pick one from the queue below.
                  </li>
                )}
              </ul>
            </section>

            <section>
              <h3 className="mb-4 text-xs font-medium uppercase tracking-widest text-neutral-500">
                Queue
              </h3>
              <ul className="space-y-3 animate-stagger">
                {queue.filter((t) => t.status !== 'in_progress').slice(0, 15).map((t) => (
                  <li
                    key={t.id}
                    className="glass-strong flex items-center justify-between rounded-2xl px-5 py-4 transition-all duration-300 hover:bg-white/[0.08]"
                  >
                    <button
                      type="button"
                      onClick={() => navigate(`/tasks/${t.id}`)}
                      className="text-left text-neutral-200 hover:underline decoration-neutral-500"
                    >
                      {t.title}
                    </button>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-neutral-500">{t.status}</span>
                      <span className="rounded-xl bg-white/10 px-2.5 py-1 text-xs text-neutral-400">
                        {t.priority}
                      </span>
                    </div>
                  </li>
                ))}
                {queue.length === 0 && (
                  <li className="glass rounded-2xl border border-dashed border-white/10 py-8 text-center text-neutral-500">
                    No tasks in queue.
                  </li>
                )}
              </ul>
            </section>
          </>
        )}
      </main>
    </div>
  )
}
