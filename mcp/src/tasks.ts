import { ACTIVITY, COMMENTS, FieldValue, TASKS, Timestamp, db } from './firestore.js'
import { assertProjectInWorkspace, assertTask, assertWorkspace } from './scope.js'

/**
 * Write helpers that mirror src/lib/tasks.ts in the web app.
 *
 * Field-for-field parity is the point: a task filed from Claude has to be
 * indistinguishable from one filed in the UI, or the Dashboard filters, the
 * timer, and the activity feed quietly disagree with each other.
 */

export type TaskStatus = 'backlog' | 'planned' | 'in_progress' | 'blocked' | 'done'
export type TaskPriority = 'P0' | 'P1' | 'P2' | 'P3'

type Activity =
  | 'created'
  | 'status_change'
  | 'assigned'
  | 'comment'
  | 'completed'
  | 'reopened'
  | 'blocked'
  | 'due_set'

async function logActivity(
  userId: string,
  taskId: string,
  action: Activity,
  payload?: Record<string, unknown>
) {
  await db.collection(TASKS).doc(taskId).collection(ACTIVITY).add({
    userId,
    action,
    payload: payload ?? null,
    createdAt: FieldValue.serverTimestamp(),
  })
}

/**
 * Accepts `2026-08-20` or a full ISO timestamp, and folds in `dueTime` the way
 * NewTask.tsx does. Parsing is deliberately local-time, not UTC: the app writes
 * `new Date(dateStr + 'T' + time)` and renders with `toLocaleDateString()`, so
 * a UTC reading here would land tasks on the wrong day in the Dashboard.
 */
export function toTimestamp(value: string, field: string, time?: string): Timestamp {
  const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value)
  const date = new Date(isDateOnly ? `${value}T${time || '00:00:00'}` : value)
  if (Number.isNaN(date.getTime())) {
    throw new Error(`${field} must be YYYY-MM-DD or an ISO timestamp, got "${value}".`)
  }
  return Timestamp.fromDate(date)
}

/** Timestamps render as ISO strings so the model reads dates, not {_seconds}. */
export function serializeTask(id: string, data: FirebaseFirestore.DocumentData) {
  const out: Record<string, unknown> = { id }
  for (const [key, value] of Object.entries(data)) {
    out[key] = value instanceof Timestamp ? value.toDate().toISOString() : value
  }
  return out
}

export interface CreateInput {
  workspaceId: string
  projectId?: string
  title: string
  description?: string
  status?: TaskStatus
  priority?: TaskPriority
  dueDate?: string
  dueTime?: string
  estimatedMinutes?: number
  tags?: string[]
  timerEnabled?: boolean
}

export async function createTask(userId: string, input: CreateInput) {
  await assertWorkspace(userId, input.workspaceId)
  if (input.projectId) await assertProjectInWorkspace(input.projectId, input.workspaceId)

  const payload: Record<string, unknown> = {
    workspaceId: input.workspaceId,
    title: input.title,
    status: input.status ?? 'backlog',
    priority: input.priority ?? 'P2',
    tags: input.tags ?? [],
    isRecurring: false,
    timerEnabled: input.timerEnabled ?? true,
    assignees: { ownerId: userId, watcherIds: [] },
    createdBy: userId,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  }
  if (input.projectId) payload.projectId = input.projectId
  if (input.description) payload.description = input.description
  if (input.dueTime) payload.dueTime = input.dueTime
  if (input.estimatedMinutes !== undefined) payload.estimatedMinutes = input.estimatedMinutes
  if (input.dueDate) payload.dueDate = toTimestamp(input.dueDate, 'dueDate', input.dueTime)

  const ref = await db.collection(TASKS).add(payload)
  await logActivity(userId, ref.id, 'created', { title: input.title })
  if (input.dueDate) await logActivity(userId, ref.id, 'due_set', { dueDate: input.dueDate })
  return ref.id
}

export interface UpdateInput {
  title?: string
  description?: string
  status?: TaskStatus
  priority?: TaskPriority
  projectId?: string
  dueDate?: string
  dueTime?: string
  estimatedMinutes?: number
  tags?: string[]
  completionNote?: string
  blockedReason?: string
}

export async function updateTask(userId: string, taskId: string, input: UpdateInput) {
  const { ref, data: prev } = await assertTask(userId, taskId)

  if (input.projectId) await assertProjectInWorkspace(input.projectId, prev.workspaceId)

  const updates: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() }
  for (const key of [
    'title',
    'description',
    'status',
    'priority',
    'projectId',
    'dueTime',
    'estimatedMinutes',
    'tags',
    'completionNote',
    'blockedReason',
  ] as const) {
    if (input[key] !== undefined) updates[key] = input[key]
  }
  if (input.dueDate) {
    updates.dueDate = toTimestamp(input.dueDate, 'dueDate', input.dueTime ?? prev.dueTime)
  }

  // Same lifecycle side effects the web client applies in updateTask().
  const changingStatus = input.status !== undefined && input.status !== prev.status
  if (input.status === 'done') updates.completedAt = FieldValue.serverTimestamp()
  if (input.status === 'in_progress' && prev.status !== 'in_progress') {
    updates.startedAt = FieldValue.serverTimestamp()
    if (prev.timerEnabled !== false) {
      updates.timerLastStartedAt = FieldValue.serverTimestamp()
      if (prev.timerElapsed === undefined) updates.timerElapsed = 0
    }
  }

  await ref.update(updates)

  if (changingStatus) {
    await logActivity(userId, taskId, 'status_change', { from: prev.status, to: input.status })
    if (input.status === 'done') await logActivity(userId, taskId, 'completed', {})
    if (prev.status === 'done') await logActivity(userId, taskId, 'reopened', {})
    if (input.status === 'blocked' && input.blockedReason) {
      await logActivity(userId, taskId, 'blocked', { reason: input.blockedReason })
    }
  }
  if (input.dueDate) await logActivity(userId, taskId, 'due_set', { dueDate: input.dueDate })

  return { previousStatus: prev.status as string, title: prev.title as string }
}

export async function addComment(userId: string, taskId: string, body: string) {
  await assertTask(userId, taskId)
  const ref = await db.collection(TASKS).doc(taskId).collection(COMMENTS).add({
    userId,
    displayName: null,
    body,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    mentions: [],
  })
  await logActivity(userId, taskId, 'comment', { commentId: ref.id })
  return ref.id
}
