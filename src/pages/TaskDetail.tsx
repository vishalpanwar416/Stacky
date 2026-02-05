import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useWorkspace } from '../contexts/WorkspaceContext'
import { useToast } from '../contexts/ToastContext'
import { getTask, updateTask, addComment, subscribeComments, subscribeActivity, getTasksByWorkspace } from '../lib/tasks'
import { getCountdown } from '../lib/taskUtils'
import { Breadcrumbs } from '../components/Breadcrumbs'
import { TaskDetailSkeleton } from '../components/Skeleton'
import type { Task, TaskComment, TaskActivity, TaskStatus } from '../types'

const STATUSES: TaskStatus[] = ['backlog', 'planned', 'in_progress', 'blocked', 'done']

function formatActivityMessage(a: TaskActivity): string {
  const who = a.displayName || 'Someone'
  switch (a.action) {
    case 'created':
      return `${who} created the task`
    case 'status_change': {
      const from = (a.payload?.from as string) ?? '?'
      const to = (a.payload?.to as string) ?? '?'
      return `${who} changed status from ${from} to ${to}`
    }
    case 'completed': {
      const countdown = a.payload?.countdownAtCompletion as string | undefined
      return countdown ? `${who} marked it done (${countdown})` : `${who} marked it done`
    }
    case 'due_set': {
      const dueLabel = a.payload?.dueLabel as string | undefined
      const countdown = a.payload?.countdown as string | undefined
      if (dueLabel && countdown) return `${who} set due date: ${dueLabel} · ${countdown}`
      if (dueLabel) return `${who} set due date: ${dueLabel}`
      return `${who} set due date`
    }
    case 'reopened':
      return `${who} reopened the task`
    case 'blocked':
      return `${who} marked blocked${a.payload?.reason ? `: ${a.payload.reason}` : ''}`
    case 'assigned':
      return `${who} updated assignees`
    case 'comment':
      return `${who} added a comment`
    default:
      return `${who} — ${a.action}`
  }
}

export function TaskDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user, profile } = useAuth()
  const { currentWorkspace, workspaces } = useWorkspace()
  const [task, setTask] = useState<Task | null>(null)
  const [comments, setComments] = useState<TaskComment[]>([])
  const [activity, setActivity] = useState<TaskActivity[]>([])
  const [commentText, setCommentText] = useState('')
  const [status, setStatus] = useState<TaskStatus | null>(null)
  const [blockedReason, setBlockedReason] = useState('')
  const [blockedByTaskId, setBlockedByTaskId] = useState('')
  const [workspaceTasks, setWorkspaceTasks] = useState<Task[]>([])
  const [blockedByTask, setBlockedByTask] = useState<Task | null>(null)
  const [completionNote, setCompletionNote] = useState('')
  const [saving, setSaving] = useState(false)
  const { toast } = useToast()

  useEffect(() => {
    if (!id) return
    getTask(id).then(setTask)
  }, [id])

  useEffect(() => {
    if (!id) return
    setStatus(task?.status ?? null)
    if (task?.blockedByTaskId) setBlockedByTaskId(task.blockedByTaskId)
    else setBlockedByTaskId('')
  }, [id, task?.status, task?.blockedByTaskId])

  useEffect(() => {
    if (!id) return
    const unsubC = subscribeComments(id, setComments)
    const unsubA = subscribeActivity(id, setActivity)
    return () => {
      unsubC()
      unsubA()
    }
  }, [id])

  useEffect(() => {
    if (!task?.workspaceId) return
    getTasksByWorkspace(task.workspaceId).then(setWorkspaceTasks).catch(() => setWorkspaceTasks([]))
  }, [task?.workspaceId])

  useEffect(() => {
    if (!task?.blockedByTaskId) {
      setBlockedByTask(null)
      return
    }
    getTask(task.blockedByTaskId).then(setBlockedByTask)
  }, [task?.blockedByTaskId])

  if (!id) return null
  if (!task) return <TaskDetailSkeleton />

  const isOwner = task.assignees.ownerId === user?.uid
  const canComplete = task.status !== 'done' && isOwner

  const handleStatusChange = async (newStatus: TaskStatus) => {
    if (!user || saving) return
    setSaving(true)
    try {
      const updates =
        newStatus === 'blocked'
          ? { status: newStatus, blockedReason, blockedByTaskId: blockedByTaskId || undefined }
          : newStatus === 'done'
            ? { status: newStatus, completionNote: completionNote.trim() || undefined }
            : { status: newStatus }
      await updateTask(id, updates, user.uid)
      setTask((t) =>
        t
          ? {
              ...t,
              status: newStatus,
              completionNote: updates.completionNote ?? t.completionNote,
              blockedByTaskId: newStatus === 'blocked' ? (blockedByTaskId || undefined) : t.blockedByTaskId,
            }
          : null
      )
      setStatus(newStatus)
      if (newStatus === 'done') setCompletionNote('')
      toast('Status updated', 'success')
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Update failed', 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user || !commentText.trim()) return
    try {
      await addComment(id, user.uid, commentText.trim(), profile?.displayName)
      setCommentText('')
      toast('Comment added', 'success')
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to add comment', 'error')
    }
  }

  const formatDate = (ts: { toDate?: () => Date }) => {
    const d = ts && typeof ts.toDate === 'function' ? ts.toDate() : new Date(0)
    return d.toLocaleString()
  }

  const workspaceName = currentWorkspace?.id === task.workspaceId ? currentWorkspace.name : workspaces.find((w) => w.id === task.workspaceId)?.name ?? 'Workspace'

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
      <div className="mb-4 flex items-center justify-between gap-2">
        <Breadcrumbs
          items={[
            { label: 'Stacky', path: '/' },
            { label: workspaceName, path: '/' },
            { label: task.title },
          ]}
        />
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="text-sm theme-text-muted transition-colors hover:theme-text shrink-0"
        >
          ← Back
        </button>
      </div>

      <div className="glass-strong rounded-3xl p-6 animate-slide-up">
        <h1 className="text-2xl font-bold theme-text tracking-tight">{task.title}</h1>
        {task.description && (
          <p className="mt-2 whitespace-pre-wrap theme-text-muted">{task.description}</p>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          <span className="rounded-xl theme-surface-bg px-2.5 py-1 text-xs theme-text-muted">
            {task.priority}
          </span>
          <span className="rounded-xl theme-surface-bg px-2.5 py-1 text-xs theme-text-muted">
            {task.status}
          </span>
          {task.tags.map((tag) => (
            <span key={tag} className="rounded-xl theme-surface-bg px-2.5 py-1 text-xs theme-text-muted">
              {tag}
            </span>
          ))}
        </div>
        {(task.startedAt || task.completedAt || task.dueDate || task.blockedByTaskId) && (
          <p className="mt-3 flex flex-wrap gap-x-3 gap-y-0.5 text-xs theme-text-faint">
            {task.status === 'blocked' && task.blockedByTaskId && (
              <span>
                Blocked by:{' '}
                {blockedByTask ? (
                  <button
                    type="button"
                    onClick={() => navigate(`/tasks/${task.blockedByTaskId}`)}
                    className="theme-text-muted underline hover:theme-text"
                  >
                    {blockedByTask.title}
                  </button>
                ) : (
                  <span className="theme-text-faint">…</span>
                )}
              </span>
            )}
            {task.dueDate && typeof task.dueDate.toMillis === 'function' && (
              <>
                <span className={task.dueDate.toMillis() < new Date().setHours(0, 0, 0, 0) ? 'text-amber-400' : ''}>
                  Due {formatDate(task.dueDate)}{task.dueTime ? ` ${task.dueTime}` : ''}
                </span>
                {(() => {
                  const countdown = getCountdown(task)
                  return countdown ? (
                    <span className={countdown.isOverdue ? 'text-amber-400' : 'theme-text-faint'}>
                      {' '}· {countdown.text}
                    </span>
                  ) : null
                })()}
              </>
            )}
            {task.startedAt && task.status !== 'done' && (
              <span>Started {formatDate(task.startedAt)}</span>
            )}
            {task.completedAt && (
              <span>Completed {formatDate(task.completedAt)}</span>
            )}
          </p>
        )}

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <label className="text-sm theme-text-muted">Status</label>
          <select
            value={status ?? task.status}
            onChange={(e) => {
              const v = e.target.value as TaskStatus
              setStatus(v)
              if (v !== 'blocked') handleStatusChange(v)
            }}
            className="select-input"
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
                className="rounded-2xl border theme-border theme-surface-bg px-3 py-2 text-sm theme-text theme-input"
              />
              <div className="flex flex-col gap-1">
                <label className="text-xs theme-text-faint">Blocked by task (optional)</label>
                <select
                  value={blockedByTaskId}
                  onChange={(e) => setBlockedByTaskId(e.target.value)}
                  className="select-input min-w-[180px]"
                >
                  <option value="">None</option>
                  {workspaceTasks
                    .filter((t) => t.id !== id)
                    .map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.title}
                      </option>
                    ))}
                </select>
              </div>
              <button
                type="button"
                onClick={() => handleStatusChange('blocked')}
                disabled={!blockedReason.trim() || saving}
                className="rounded-2xl theme-surface-bg px-4 py-2 text-sm theme-text border theme-border transition-all duration-200 theme-surface-hover-bg disabled:opacity-50"
              >
                Set blocked
              </button>
            </>
          )}
          {(status === 'done' || (status ?? task.status) === 'done') && (
            <div className="flex flex-col gap-1">
              <label className="text-xs theme-text-faint">Completion note (optional)</label>
              {task.status === 'done' && task.completionNote ? (
                <p className="rounded-2xl border theme-border theme-surface-bg px-3 py-2 text-sm theme-text-muted">
                  {task.completionNote}
                </p>
              ) : (
                <input
                  type="text"
                  value={completionNote}
                  onChange={(e) => setCompletionNote(e.target.value)}
                  placeholder="What was completed?"
                  className="rounded-2xl border theme-border theme-surface-bg px-3 py-2 text-sm theme-text theme-input"
                />
              )}
            </div>
          )}
          {status && status !== 'blocked' && status !== task.status && (
            <button
              type="button"
              onClick={() => handleStatusChange(status)}
              disabled={saving}
              className="rounded-2xl theme-surface-bg px-4 py-2 text-sm theme-text border theme-border transition-all duration-200 theme-surface-hover-bg hover:scale-[1.02] disabled:opacity-50"
            >
              Update
            </button>
          )}
          {canComplete && (
            <button
              type="button"
              onClick={() => handleStatusChange('done')}
              disabled={saving}
              className="rounded-2xl theme-surface-bg px-4 py-2 text-sm font-medium theme-text border theme-border transition-all duration-200 theme-surface-hover-bg hover:scale-[1.02] disabled:opacity-50"
            >
              Mark done
            </button>
          )}
        </div>
      </div>

      <section className="mt-8 animate-fade-in" style={{ animationDelay: '0.1s' }}>
        <h2 className="text-lg font-semibold theme-text tracking-tight">Activity</h2>
        <ul className="mt-3 space-y-2 text-sm theme-text-muted">
          {activity.slice(0, 20).map((a) => (
            <li key={a.id} className="glass rounded-2xl px-4 py-2">
              <span className="theme-text-muted">{formatActivityMessage(a)}</span>
              <span className="ml-2 theme-text-faint text-xs">— {formatDate(a.createdAt)}</span>
            </li>
          ))}
          {activity.length === 0 && <li className="theme-text-faint">No activity yet.</li>}
        </ul>
      </section>

      <section className="mt-8 animate-fade-in" style={{ animationDelay: '0.15s' }}>
        <h2 className="text-lg font-semibold theme-text tracking-tight">Comments</h2>
        <form onSubmit={handleAddComment} className="mt-3 flex gap-2">
          <input
            type="text"
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            placeholder="Add a comment…"
            className="flex-1 rounded-2xl border theme-border theme-surface-bg px-4 py-2.5 theme-text theme-input transition-all duration-200"
          />
          <button
            type="submit"
            disabled={!commentText.trim()}
            className="rounded-2xl theme-surface-bg px-4 py-2.5 text-sm font-medium theme-text border theme-border transition-all duration-200 theme-surface-hover-bg hover:scale-[1.02] disabled:opacity-50"
          >
            Post
          </button>
        </form>
        <ul className="mt-3 space-y-2 animate-stagger">
          {comments.map((c) => (
            <li key={c.id} className="glass rounded-2xl p-4">
              <p className="theme-text-muted">{c.body}</p>
              <p className="mt-1 text-xs theme-text-faint">
                {c.displayName ?? c.userId} · {formatDate(c.createdAt)}
              </p>
            </li>
          ))}
          {comments.length === 0 && <li className="theme-text-faint">No comments yet.</li>}
        </ul>
      </section>
    </div>
  )
}
