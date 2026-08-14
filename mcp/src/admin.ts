import { STACKY_USER_ID } from './config.js'
import { FieldValue, PROJECTS, WORKSPACES, db } from './firestore.js'
import { assertWorkspace } from './scope.js'

/**
 * Workspace and project creation, mirroring src/lib/workspaces.ts and
 * src/lib/projects.ts so records created from Claude are identical to ones
 * created in the UI — including the `members` subcollection, which the web app
 * reads for the member list.
 */

const MEMBERS = 'members'

/** Matches the app's slug handling: lowercase, non-alphanumerics collapsed to dashes. */
function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'workspace'
  )
}

export async function createWorkspace(input: {
  name: string
  description?: string
  visibility?: 'private' | 'shared'
}) {
  const ref = await db.collection(WORKSPACES).add({
    name: input.name,
    slug: slugify(input.name),
    ...(input.description ? { description: input.description } : {}),
    visibility: input.visibility ?? 'private',
    ownerId: STACKY_USER_ID,
    memberIds: [STACKY_USER_ID],
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  })

  // The UI lists members from this subcollection, not from memberIds.
  await ref.collection(MEMBERS).doc(STACKY_USER_ID).set({
    userId: STACKY_USER_ID,
    role: 'owner',
    joinedAt: FieldValue.serverTimestamp(),
    displayName: null,
    email: null,
  })

  return ref.id
}

export async function createProject(input: {
  workspaceId: string
  name: string
  description?: string
  status?: 'active' | 'on_hold' | 'completed'
  health?: 'on_track' | 'at_risk' | 'behind'
}) {
  await assertWorkspace(input.workspaceId)
  const ref = await db.collection(PROJECTS).add({
    workspaceId: input.workspaceId,
    name: input.name,
    ...(input.description ? { description: input.description } : {}),
    status: input.status ?? 'active',
    ...(input.health ? { health: input.health } : {}),
    createdBy: STACKY_USER_ID,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  })
  return ref.id
}
