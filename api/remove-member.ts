import { getApps, initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'

import { db, FieldValue } from '../mcp/src/firestore.js'
import { readBearer } from './_lib/mcpAuth.js'

/**
 * POST /api/remove-member — take someone out of a workspace.
 *
 * Covers both directions, because they are the same write:
 *   userId === caller   leaving a workspace yourself
 *   userId !== caller   the owner removing someone
 *
 * Neither can be done from the browser. Membership is decided by `memberIds` on
 * the workspace document, which only the owner may write, and member rows are
 * delete-only for the owner too — so a member had no way to leave, and an owner
 * doing it client-side would need two writes that can half-fail, which is
 * exactly how invitation acceptance used to break.
 *
 * Removal also unassigns the person from the workspace's tasks. Security rules
 * grant an assignee access to their task whether or not they are in the
 * workspace, so leaving assignments behind would make removal cosmetic — the
 * person would still read and edit every task they were assigned.
 */

if (!getApps().some((a) => a.name === 'remove-member')) {
  initializeApp({ projectId: 'stacky-f7f42' }, 'remove-member')
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST.' })

  const idToken = readBearer(req.headers.authorization)
  if (!idToken) return res.status(401).json({ error: 'Sign in first.' })

  let callerUid: string
  try {
    const app = getApps().find((a) => a.name === 'remove-member')!
    callerUid = (await getAuth(app).verifyIdToken(idToken)).uid
  } catch {
    return res.status(401).json({ error: 'Invalid or expired session.' })
  }

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body ?? {})
  const workspaceId = String(body.workspaceId ?? '').trim()
  const userId = String(body.userId ?? callerUid).trim()
  if (!workspaceId) return res.status(400).json({ error: 'workspaceId is required.' })

  try {
    const wsRef = db.collection('workspaces').doc(workspaceId)
    const wsSnap = await wsRef.get()
    if (!wsSnap.exists) return res.status(404).json({ error: 'That workspace no longer exists.' })
    const ws = wsSnap.data()!

    const leaving = userId === callerUid

    // The owner is the workspace's ownerId, not a role that can be revoked.
    // Removing them would leave a workspace nobody can administer.
    if (userId === ws.ownerId) {
      return res.status(400).json({
        error: leaving
          ? 'You own this workspace, so you cannot leave it. Delete it instead.'
          : 'The owner cannot be removed.',
      })
    }

    if (!leaving && ws.ownerId !== callerUid) {
      return res.status(403).json({ error: 'Only the workspace owner can remove people.' })
    }
    if (leaving && !(ws.memberIds ?? []).includes(callerUid)) {
      return res.status(409).json({ error: 'You are not in that workspace.' })
    }

    // --- membership, in one batch ------------------------------------------
    const batch = db.batch()
    batch.update(wsRef, {
      memberIds: FieldValue.arrayRemove(userId),
      updatedAt: FieldValue.serverTimestamp(),
    })
    batch.delete(wsRef.collection('members').doc(userId))
    await batch.commit()

    // --- and every assignment that would outlive it ------------------------
    const [owned, watched] = await Promise.all([
      db.collection('tasks').where('workspaceId', '==', workspaceId).where('assignees.ownerId', '==', userId).get(),
      db
        .collection('tasks')
        .where('workspaceId', '==', workspaceId)
        .where('assignees.watcherIds', 'array-contains', userId)
        .get(),
    ])

    const touched = new Map<string, FirebaseFirestore.DocumentReference>()
    owned.docs.forEach((d) => touched.set(d.id, d.ref))
    watched.docs.forEach((d) => touched.set(d.id, d.ref))

    // Firestore caps a batch at 500 writes.
    const refs = [...touched.values()]
    for (let i = 0; i < refs.length; i += 400) {
      const chunk = db.batch()
      for (const ref of refs.slice(i, i + 400)) {
        const isOwner = owned.docs.some((d) => d.id === ref.id)
        chunk.update(ref, {
          ...(isOwner ? { 'assignees.ownerId': '' } : {}),
          'assignees.watcherIds': FieldValue.arrayRemove(userId),
          updatedAt: FieldValue.serverTimestamp(),
        })
      }
      await chunk.commit()
    }

    return res.status(200).json({
      removed: userId,
      workspaceName: ws.name ?? null,
      unassignedTasks: refs.length,
    })
  } catch (err) {
    console.error('remove-member failed', err)
    return res.status(500).json({ error: 'Could not complete the removal.' })
  }
}
