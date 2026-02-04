import {
  collection,
  doc,
  addDoc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
  onSnapshot,
  Unsubscribe,
} from 'firebase/firestore'
import { db } from './firebase'
import type { Task, TaskStatus, TaskComment, TaskActivity, TaskActivityAction } from '../types'

const TASKS = 'tasks'
const COMMENTS = 'comments'
const ACTIVITY = 'activity'

const defaultAssignees = (ownerId: string) => ({
  ownerId,
  watcherIds: [] as string[],
})

export async function createTask(
  data: Omit<Task, 'id' | 'createdAt' | 'updatedAt' | 'assignees'> & {
    assignees?: { ownerId: string; watcherIds?: string[] }
  },
  createdBy: string
): Promise<string> {
  const assignees = data.assignees ?? defaultAssignees(createdBy)
  const ref = await addDoc(collection(db, TASKS), {
    ...data,
    assignees: { ownerId: assignees.ownerId, watcherIds: assignees.watcherIds ?? [] },
    createdBy,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
  await logActivity(ref.id, createdBy, 'created', { title: data.title })
  return ref.id
}

export async function getTask(id: string): Promise<Task | null> {
  const snap = await getDoc(doc(db, TASKS, id))
  if (!snap.exists()) return null
  return { id: snap.id, ...snap.data() } as Task
}

export async function getTasksByWorkspace(
  workspaceId: string,
  opts?: { status?: TaskStatus; projectId?: string; ownerId?: string }
): Promise<Task[]> {
  let q = query(
    collection(db, TASKS),
    where('workspaceId', '==', workspaceId),
    orderBy('updatedAt', 'desc')
  )
  if (opts?.status) {
    q = query(
      collection(db, TASKS),
      where('workspaceId', '==', workspaceId),
      where('status', '==', opts.status),
      orderBy('updatedAt', 'desc')
    )
  }
  if (opts?.projectId) {
    q = query(
      collection(db, TASKS),
      where('workspaceId', '==', workspaceId),
      where('projectId', '==', opts.projectId),
      orderBy('updatedAt', 'desc')
    )
  }
  if (opts?.ownerId) {
    q = query(
      collection(db, TASKS),
      where('workspaceId', '==', workspaceId),
      where('assignees.ownerId', '==', opts.ownerId),
      orderBy('updatedAt', 'desc')
    )
  }
  const snap = await getDocs(q)
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Task))
}

export function subscribeTasksByWorkspace(
  workspaceId: string,
  callback: (tasks: Task[]) => void
): Unsubscribe {
  const q = query(
    collection(db, TASKS),
    where('workspaceId', '==', workspaceId),
    orderBy('updatedAt', 'desc')
  )
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Task)))
  })
}

export async function updateTask(
  id: string,
  data: Partial<Pick<Task, 'title' | 'description' | 'status' | 'priority' | 'dueDate' | 'dueTime' | 'estimatedMinutes' | 'reminderAt' | 'tags' | 'completionNote' | 'blockedReason' | 'blockedByTaskId'>>,
  userId: string
) {
  const ref = doc(db, TASKS, id)
  const prev = await getDoc(ref)
  const prevData = prev.data()
  const updates: Record<string, unknown> = { ...data, updatedAt: serverTimestamp() }
  if (data.status === 'done') {
    updates.completedAt = serverTimestamp()
  }
  if (data.status && prevData?.status !== data.status) {
    await logActivity(id, userId, 'status_change', {
      from: prevData?.status,
      to: data.status,
    })
    if (data.status === 'blocked' && data.blockedReason) {
      await logActivity(id, userId, 'blocked', { reason: data.blockedReason })
    }
    if (data.status === 'done') {
      await logActivity(id, userId, 'completed', {})
    }
  }
  await updateDoc(ref, updates)
}

export async function assignTask(
  taskId: string,
  ownerId: string,
  watcherIds: string[],
  userId: string
) {
  const ref = doc(db, TASKS, taskId)
  await updateDoc(ref, {
    'assignees.ownerId': ownerId,
    'assignees.watcherIds': watcherIds,
    updatedAt: serverTimestamp(),
  })
  await logActivity(taskId, userId, 'assigned', { ownerId, watcherIds })
}

export async function deleteTask(id: string) {
  await deleteDoc(doc(db, TASKS, id))
}

async function logActivity(
  taskId: string,
  userId: string,
  action: TaskActivityAction,
  payload?: Record<string, unknown>
) {
  await addDoc(collection(db, TASKS, taskId, ACTIVITY), {
    userId,
    action,
    payload: payload ?? null,
    createdAt: serverTimestamp(),
  })
}

export async function addComment(
  taskId: string,
  userId: string,
  body: string,
  displayName?: string,
  mentions?: string[]
) {
  const ref = await addDoc(collection(db, TASKS, taskId, COMMENTS), {
    userId,
    displayName: displayName ?? null,
    body,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    mentions: mentions ?? [],
  })
  await logActivity(taskId, userId, 'comment', { commentId: ref.id })
  return ref.id
}

export function subscribeComments(taskId: string, callback: (comments: TaskComment[]) => void): Unsubscribe {
  const q = query(
    collection(db, TASKS, taskId, COMMENTS),
    orderBy('createdAt', 'asc')
  )
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() } as TaskComment)))
  })
}

export function subscribeActivity(taskId: string, callback: (items: TaskActivity[]) => void): Unsubscribe {
  const q = query(
    collection(db, TASKS, taskId, ACTIVITY),
    orderBy('createdAt', 'desc'),
    limit(50)
  )
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() } as TaskActivity)))
  })
}

export function subscribeTasksSharedWithMe(userId: string, callback: (tasks: Task[]) => void): Unsubscribe {
  const q = query(
    collection(db, TASKS),
    where('assignees.ownerId', '==', userId),
    orderBy('updatedAt', 'desc')
  )
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Task)))
  })
}
