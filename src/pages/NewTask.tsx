import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Timestamp } from 'firebase/firestore'
import { useAuth } from '../contexts/AuthContext'
import { useWorkspace } from '../contexts/WorkspaceContext'
import { useToast } from '../contexts/ToastContext'
import { createTask } from '../lib/tasks'
import { getProjectsByWorkspace } from '../lib/projects'
import { Breadcrumbs } from '../components/Breadcrumbs'
import type { TaskPriority, TaskStatus, Project } from '../types'

const PRIORITIES: TaskPriority[] = ['P0', 'P1', 'P2', 'P3']
const STATUSES: TaskStatus[] = ['backlog', 'planned', 'in_progress']

export function NewTask() {
  const { workspaceId } = useParams<{ workspaceId: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { currentWorkspace } = useWorkspace()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState<TaskPriority>('P1')
  const [status, setStatus] = useState<TaskStatus>('backlog')
  const [tags, setTags] = useState('')
  const [dueDateStr, setDueDateStr] = useState('')
  const [dueTimeStr, setDueTimeStr] = useState('')
  const [projectId, setProjectId] = useState('')
  const [projects, setProjects] = useState<Project[]>([])
  const [timerEnabled, setTimerEnabled] = useState(true)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const { toast } = useToast()

  const wid = workspaceId ?? currentWorkspace?.id
  const workspace = currentWorkspace ?? (workspaceId ? { id: workspaceId, name: 'Workspace' } : null)

  useEffect(() => {
    if (!wid) return
    getProjectsByWorkspace(wid).then(setProjects).catch(() => setProjects([]))
  }, [wid])
  if (!wid || !user) {
    return (
      <div className="p-4 theme-text-muted animate-fade-in">
        Select a workspace first or sign in.
      </div>
    )
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return
    setError('')
    setLoading(true)
    try {
      const dueDate = dueDateStr
        ? Timestamp.fromDate(new Date(dueDateStr + 'T' + (dueTimeStr || '00:00:00')))
        : undefined
      await createTask(
        {
          workspaceId: wid,
          projectId: projectId || undefined,
          title: title.trim(),
          description: description.trim() || undefined,
          status,
          priority,
          dueDate,
          dueTime: dueTimeStr || undefined,
          tags: tags ? tags.split(',').map((s) => s.trim()).filter(Boolean) : [],
          isRecurring: false,
          timerEnabled,
          createdBy: user.uid,
          assignees: { ownerId: user.uid, watcherIds: [] },
        },
        user.uid
      )
      toast('Task created', 'success')
      navigate('/')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to create task'
      setError(msg)
      toast(msg, 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-8">
      <Breadcrumbs
        items={[
          { label: 'Stacky', path: '/' },
          { label: workspace?.name ?? 'Workspace', path: '/' },
          { label: 'New task' },
        ]}
      />
      <div className="mt-6 glass-strong rounded-3xl p-8 animate-fade-in">
        <h1 className="text-2xl font-bold theme-text tracking-tight">New task</h1>
        <p className="mt-1 theme-text-muted">Add a task to your queue.</p>

        <form onSubmit={submit} className="mt-6 space-y-4">
          <div>
            <label className="block text-sm font-medium theme-text-muted">Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-1 w-full rounded-2xl theme-input px-4 py-2.5"
              placeholder="What needs to be done?"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium theme-text-muted">Description (optional)</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="mt-1 w-full rounded-2xl theme-input px-4 py-2.5"
              placeholder="Details…"
            />
          </div>
          <div>
            <label className="block text-sm font-medium theme-text-muted">Project (optional)</label>
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className="select-input mt-1 w-full"
            >
              <option value="">No project</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          <div className="flex gap-4">
            <div>
              <label className="block text-sm font-medium theme-text-muted">Priority</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as TaskPriority)}
                className="select-input mt-1"
              >
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium theme-text-muted">Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as TaskStatus)}
                className="select-input mt-1"
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex gap-4">
            <div className="flex-1">
              <label className="block text-sm font-medium theme-text-muted">Due date (optional)</label>
              <input
                type="date"
                value={dueDateStr}
                onChange={(e) => setDueDateStr(e.target.value)}
                className="mt-1 w-full rounded-2xl theme-input px-4 py-2.5"
              />
            </div>
            <div className="w-32">
              <input
                type="time"
                value={dueTimeStr}
                onChange={(e) => setDueTimeStr(e.target.value)}
                className="mt-1 w-full rounded-2xl theme-input px-4 py-2.5"
              />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="enableTimer"
              checked={timerEnabled}
              onChange={(e) => setTimerEnabled(e.target.checked)}
              className="h-5 w-5 rounded-md border-gray-300 text-orange-600 focus:ring-orange-500"
            />
            <label htmlFor="enableTimer" className="text-sm font-medium theme-text-muted select-none cursor-pointer">
              Enable time tracking for this task
            </label>

          </div>
          <div>
            <label className="block text-sm font-medium theme-text-muted">Tags (comma-separated)</label>
            <input
              type="text"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              className="mt-1 w-full rounded-2xl theme-input px-4 py-2.5"
              placeholder="office, urgent"
            />
          </div>
          {error && <p className="text-sm theme-text-muted">{error}</p>}
          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={loading}
              className="rounded-2xl theme-surface-bg theme-border border px-5 py-2.5 font-medium theme-text transition-all duration-300 theme-surface-hover-bg hover:scale-[1.02] active:scale-[0.99] disabled:opacity-50"
            >
              {loading ? 'Creating…' : 'Create task'}
            </button>
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="rounded-2xl border theme-border px-5 py-2.5 theme-text-muted theme-surface-hover-bg hover:theme-text transition-all duration-200"
            >
              Cancel
            </button>
          </div>
        </form>
      </div >
    </div >
  )
}
