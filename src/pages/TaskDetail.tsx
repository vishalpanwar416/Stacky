import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { getTask, updateTask, addComment, subscribeComments, subscribeActivity } from '../lib/tasks'
import type { Task, TaskComment, TaskActivity, TaskStatus } from '../types'

const STATUSES: TaskStatus[] = ['backlog', 'planned', 'in_progress', 'blocked', 'done']

export function TaskDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user, profile } = useAuth()
  const [task, setTask] = useState<Task | null>(null)
  const [comments, setComments] = useState<TaskComment[]>([])
  const [activity, setActivity] = useState<TaskActivity[]>([])
  const [commentText, setCommentText] = useState('')
  const [status, setStatus] = useState<TaskStatus | null>(null)
  const [blockedReason, setBlockedReason] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!id) return
    getTask(id).then(setTask)
  }, [id])

  useEffect(() => {
    if (!id) return
    setStatus(task?.status ?? null)
  }, [id, task?.status])

  useEffect(() => {
    if (!id) return
    const unsubC = subscribeComments(id, setComments)
    const unsubA = subscribeActivity(id, setActivity)
    return () => {
      unsubC()
      unsubA()
    }
  }, [id])

  if (!id) return null
  if (!task) return <div className="p-4 text-neutral-400 animate-fade-in">Loading…</div>

  const isOwner = task.assignees.ownerId === user?.uid
  const canComplete = task.status !== 'done' && isOwner

  const handleStatusChange = async (newStatus: TaskStatus) => {
    if (!user || saving) return
    setSaving(true)
    try {
      await updateTask(
        id,
        newStatus === 'blocked' ? { status: newStatus, blockedReason } : { status: newStatus },
        user.uid
      )
      setTask((t) => (t ? { ...t, status: newStatus } : null))
      setStatus(newStatus)
    } finally {
      setSaving(false)
    }
  }

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user || !commentText.trim()) return
    await addComment(id, user.uid, commentText.trim(), profile?.displayName)
    setCommentText('')
  }

  const formatDate = (ts: { toDate?: () => Date }) => {
    const d = ts && typeof ts.toDate === 'function' ? ts.toDate() : new Date(0)
    return d.toLocaleString()
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <button
        type="button"
        onClick={() => navigate(-1)}
        className="mb-4 text-sm text-neutral-400 transition-all duration-200 hover:text-white animate-fade-in"
      >
        ← Back
      </button>

      <div className="glass-strong rounded-3xl p-6 animate-slide-up">
        <h1 className="text-2xl font-bold text-white tracking-tight">{task.title}</h1>
        {task.description && (
          <p className="mt-2 whitespace-pre-wrap text-neutral-300">{task.description}</p>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          <span className="rounded-xl bg-white/10 px-2.5 py-1 text-xs text-neutral-300">
            {task.priority}
          </span>
          <span className="rounded-xl bg-white/10 px-2.5 py-1 text-xs text-neutral-300">
            {task.status}
          </span>
          {task.tags.map((tag) => (
            <span key={tag} className="rounded-xl bg-white/10 px-2.5 py-1 text-xs text-neutral-400">
              {tag}
            </span>
          ))}
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <label className="text-sm text-neutral-400">Status</label>
          <select
            value={status ?? task.status}
            onChange={(e) => {
              const v = e.target.value as TaskStatus
              setStatus(v)
              if (v !== 'blocked') handleStatusChange(v)
            }}
            className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white transition-all duration-200 focus:border-neutral-400 focus:outline-none focus:ring-1 focus:ring-neutral-400"
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          {status === 'blocked' && (
            <>
              <input
                type="text"
                value={blockedReason}
                onChange={(e) => setBlockedReason(e.target.value)}
                placeholder="Reason blocked"
                className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-neutral-500 focus:border-neutral-400 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => handleStatusChange('blocked')}
                disabled={!blockedReason.trim() || saving}
                className="rounded-2xl bg-white/10 px-4 py-2 text-sm text-white border border-white/10 transition-all duration-200 hover:bg-white/15 disabled:opacity-50"
              >
                Set blocked
              </button>
            </>
          )}
          {status && status !== 'blocked' && status !== task.status && (
            <button
              type="button"
              onClick={() => handleStatusChange(status)}
              disabled={saving}
              className="rounded-2xl bg-white/10 px-4 py-2 text-sm text-white border border-white/10 transition-all duration-200 hover:bg-white/15 hover:scale-[1.02] disabled:opacity-50"
            >
              Update
            </button>
          )}
          {canComplete && (
            <button
              type="button"
              onClick={() => handleStatusChange('done')}
              disabled={saving}
              className="rounded-2xl bg-white/15 px-4 py-2 text-sm font-medium text-white border border-white/20 transition-all duration-200 hover:bg-white/20 hover:scale-[1.02] disabled:opacity-50"
            >
              Mark done
            </button>
          )}
        </div>
      </div>

      <section className="mt-8 animate-fade-in" style={{ animationDelay: '0.1s' }}>
        <h2 className="text-lg font-semibold text-white tracking-tight">Activity</h2>
        <ul className="mt-3 space-y-2 text-sm text-neutral-400">
          {activity.slice(0, 20).map((a) => (
            <li key={a.id} className="glass rounded-2xl px-4 py-2">
              {a.action}: {a.payload && JSON.stringify(a.payload)} — {formatDate(a.createdAt)}
            </li>
          ))}
          {activity.length === 0 && <li className="text-neutral-500">No activity yet.</li>}
        </ul>
      </section>

      <section className="mt-8 animate-fade-in" style={{ animationDelay: '0.15s' }}>
        <h2 className="text-lg font-semibold text-white tracking-tight">Comments</h2>
        <form onSubmit={handleAddComment} className="mt-3 flex gap-2">
          <input
            type="text"
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            placeholder="Add a comment…"
            className="flex-1 rounded-2xl border border-white/10 bg-white/5 px-4 py-2.5 text-white placeholder-neutral-500 transition-all duration-200 focus:border-neutral-400 focus:outline-none focus:ring-1 focus:ring-neutral-400"
          />
          <button
            type="submit"
            disabled={!commentText.trim()}
            className="rounded-2xl bg-white/10 px-4 py-2.5 text-sm font-medium text-white border border-white/10 transition-all duration-200 hover:bg-white/15 hover:scale-[1.02] disabled:opacity-50"
          >
            Post
          </button>
        </form>
        <ul className="mt-3 space-y-2 animate-stagger">
          {comments.map((c) => (
            <li key={c.id} className="glass rounded-2xl p-4">
              <p className="text-neutral-300">{c.body}</p>
              <p className="mt-1 text-xs text-neutral-500">
                {c.displayName ?? c.userId} · {formatDate(c.createdAt)}
              </p>
            </li>
          ))}
          {comments.length === 0 && <li className="text-neutral-500">No comments yet.</li>}
        </ul>
      </section>
    </div>
  )
}
