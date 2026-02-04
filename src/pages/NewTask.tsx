import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useWorkspace } from '../contexts/WorkspaceContext'
import { createTask } from '../lib/tasks'
import type { TaskPriority, TaskStatus } from '../types'

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
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const wid = workspaceId ?? currentWorkspace?.id
  if (!wid || !user) {
    return (
      <div className="p-4 text-neutral-400 animate-fade-in">
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
      const id = await createTask(
        {
          workspaceId: wid,
          title: title.trim(),
          description: description.trim() || undefined,
          status,
          priority,
          tags: tags ? tags.split(',').map((s) => s.trim()).filter(Boolean) : [],
          isRecurring: false,
          createdBy: user.uid,
          assignees: { ownerId: user.uid, watcherIds: [] },
        },
        user.uid
      )
      navigate(`/tasks/${id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create task')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-8">
      <div className="glass-strong rounded-3xl p-8 animate-fade-in">
        <h1 className="text-2xl font-bold text-white tracking-tight">New task</h1>
        <p className="mt-1 text-neutral-400">Add a task to your queue.</p>

        <form onSubmit={submit} className="mt-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-neutral-400">Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-1 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-2.5 text-white placeholder-neutral-500 transition-all duration-200 focus:border-neutral-400 focus:outline-none focus:ring-1 focus:ring-neutral-400"
              placeholder="What needs to be done?"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-400">Description (optional)</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="mt-1 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-2.5 text-white placeholder-neutral-500 transition-all duration-200 focus:border-neutral-400 focus:outline-none focus:ring-1 focus:ring-neutral-400"
              placeholder="Details…"
            />
          </div>
          <div className="flex gap-4">
            <div>
              <label className="block text-sm font-medium text-neutral-400">Priority</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as TaskPriority)}
                className="mt-1 rounded-2xl border border-white/10 bg-white/5 px-4 py-2.5 text-white transition-all duration-200 focus:border-neutral-400 focus:outline-none focus:ring-1 focus:ring-neutral-400"
              >
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-400">Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as TaskStatus)}
                className="mt-1 rounded-2xl border border-white/10 bg-white/5 px-4 py-2.5 text-white transition-all duration-200 focus:border-neutral-400 focus:outline-none focus:ring-1 focus:ring-neutral-400"
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-400">Tags (comma-separated)</label>
            <input
              type="text"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              className="mt-1 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-2.5 text-white placeholder-neutral-500 transition-all duration-200 focus:border-neutral-400 focus:outline-none focus:ring-1 focus:ring-neutral-400"
              placeholder="office, urgent"
            />
          </div>
          {error && <p className="text-sm text-neutral-400">{error}</p>}
          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={loading}
              className="rounded-2xl bg-white/10 px-5 py-2.5 font-medium text-white border border-white/10 transition-all duration-300 hover:bg-white/15 hover:scale-[1.02] active:scale-[0.99] disabled:opacity-50"
            >
              {loading ? 'Creating…' : 'Create task'}
            </button>
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="rounded-2xl border border-white/10 px-5 py-2.5 text-neutral-400 transition-all duration-200 hover:bg-white/5 hover:text-white"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
