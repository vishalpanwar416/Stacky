import { QUERY_CHUNK } from './config.js'
import { PROJECTS, TASKS, WORKSPACES, db } from './firestore.js'

/**
 * Every tool routes its reads and writes through this module.
 *
 * The Admin SDK ignores firestore.rules, and Stacky's database is shared, so
 * access is re-checked here on every call rather than trusted from the
 * arguments the caller passes in.
 *
 * `userId` is threaded explicitly through every function rather than read from
 * a module constant. Over HTTP one process serves many people, so identity
 * belongs to the request — a module-level "current user" would be a
 * cross-tenant data leak waiting for its first concurrent request.
 */

export class AccessError extends Error {}

export interface WorkspaceRef {
  id: string
  name: string
  ownerId: string
  memberIds: string[]
}

function toWorkspace(doc: FirebaseFirestore.DocumentSnapshot): WorkspaceRef {
  const d = doc.data() ?? {}
  return {
    id: doc.id,
    name: d.name ?? '(unnamed)',
    ownerId: d.ownerId ?? '',
    memberIds: Array.isArray(d.memberIds) ? d.memberIds : [],
  }
}

const canReach = (w: WorkspaceRef, userId: string) =>
  w.ownerId === userId || w.memberIds.includes(userId)

/** Workspaces this user owns or is a member of. */
export async function listWorkspaces(userId: string): Promise<WorkspaceRef[]> {
  const [owned, joined] = await Promise.all([
    db.collection(WORKSPACES).where('ownerId', '==', userId).get(),
    db.collection(WORKSPACES).where('memberIds', 'array-contains', userId).get(),
  ])
  const byId = new Map<string, WorkspaceRef>()
  for (const doc of [...owned.docs, ...joined.docs]) byId.set(doc.id, toWorkspace(doc))
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name))
}

/** Throws unless this user can reach `workspaceId`. */
export async function assertWorkspace(userId: string, workspaceId: string): Promise<WorkspaceRef> {
  const doc = await db.collection(WORKSPACES).doc(workspaceId).get()
  if (!doc.exists) throw new AccessError(`Workspace ${workspaceId} does not exist.`)
  const ws = toWorkspace(doc)
  if (!canReach(ws, userId)) {
    // Deliberately does not echo the caller's uid back — the message is a
    // refusal, not a lookup service for other people's identifiers.
    throw new AccessError(`Workspace ${workspaceId} is not one you have access to.`)
  }
  return ws
}

/** Throws unless the task exists and sits in a workspace this user can reach. */
export async function assertTask(userId: string, taskId: string) {
  const doc = await db.collection(TASKS).doc(taskId).get()
  if (!doc.exists) throw new AccessError(`Task ${taskId} does not exist.`)
  const data = doc.data() ?? {}
  await assertWorkspace(userId, data.workspaceId)
  return { ref: doc.ref, data }
}

/** Throws unless the project exists and belongs to the workspace given. */
export async function assertProjectInWorkspace(projectId: string, workspaceId: string) {
  const doc = await db.collection(PROJECTS).doc(projectId).get()
  if (!doc.exists) throw new AccessError(`Project ${projectId} does not exist.`)
  const actual = doc.data()?.workspaceId
  if (actual !== workspaceId) {
    throw new AccessError(`Project ${projectId} does not belong to workspace ${workspaceId}.`)
  }
  return doc
}

/**
 * Firestore rejects `in` filters above a fixed size, so callers that fan out
 * across every reachable workspace batch their queries through this.
 */
export function chunk<T>(items: T[], size = QUERY_CHUNK): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}
