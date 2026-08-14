import { QUERY_CHUNK, STACKY_USER_ID } from './config.js'
import { PROJECTS, TASKS, WORKSPACES, db } from './firestore.js'

/**
 * Every tool routes its reads and writes through this module.
 *
 * The Admin SDK ignores firestore.rules, and Stacky's database is shared with
 * other people. So access is re-checked here on every call rather than trusted
 * from the arguments the model passes in.
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

const canReach = (w: WorkspaceRef) =>
  w.ownerId === STACKY_USER_ID || w.memberIds.includes(STACKY_USER_ID)

/** Workspaces the configured user owns or is a member of. */
export async function listWorkspaces(): Promise<WorkspaceRef[]> {
  const [owned, joined] = await Promise.all([
    db.collection(WORKSPACES).where('ownerId', '==', STACKY_USER_ID).get(),
    db.collection(WORKSPACES).where('memberIds', 'array-contains', STACKY_USER_ID).get(),
  ])
  const byId = new Map<string, WorkspaceRef>()
  for (const doc of [...owned.docs, ...joined.docs]) byId.set(doc.id, toWorkspace(doc))
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name))
}

/** Throws unless the configured user can reach `workspaceId`. */
export async function assertWorkspace(workspaceId: string): Promise<WorkspaceRef> {
  const doc = await db.collection(WORKSPACES).doc(workspaceId).get()
  if (!doc.exists) throw new AccessError(`Workspace ${workspaceId} does not exist.`)
  const ws = toWorkspace(doc)
  if (!canReach(ws)) {
    throw new AccessError(
      `Workspace ${workspaceId} belongs to another user. This server is scoped to ${STACKY_USER_ID}.`
    )
  }
  return ws
}

/** Throws unless the task exists and sits in a reachable workspace. */
export async function assertTask(taskId: string) {
  const doc = await db.collection(TASKS).doc(taskId).get()
  if (!doc.exists) throw new AccessError(`Task ${taskId} does not exist.`)
  const data = doc.data() ?? {}
  await assertWorkspace(data.workspaceId)
  return { ref: doc.ref, data }
}

/** Throws unless the project exists and belongs to the workspace given. */
export async function assertProjectInWorkspace(projectId: string, workspaceId: string) {
  const doc = await db.collection(PROJECTS).doc(projectId).get()
  if (!doc.exists) throw new AccessError(`Project ${projectId} does not exist.`)
  const actual = doc.data()?.workspaceId
  if (actual !== workspaceId) {
    throw new AccessError(
      `Project ${projectId} belongs to workspace ${actual}, not ${workspaceId}.`
    )
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
