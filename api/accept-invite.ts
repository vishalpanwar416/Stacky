import { getApps, initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
// FieldValue must come from the same firebase-admin instance that created `db`.
// api/ resolves the root node_modules copy while `db` is built from mcp/'s, and
// the sentinels are compared by class identity — a mismatched serverTimestamp()
// fails to serialize at commit time.
import { db, FieldValue } from '../mcp/src/firestore.js'
import { readBearer } from './_lib/mcpAuth.js'

/**
 * POST /api/accept-invite — join a workspace you were invited to.
 *
 * Accepting cannot be done from the browser. It has to add the caller to the
 * workspace's `memberIds`, but a workspace document is writable only by its
 * owner — and it must stay that way, or anyone could add themselves to any
 * workspace by naming its id. The client used to attempt the write anyway, so
 * every acceptance failed halfway: the member subcollection row was created
 * (that rule does allow it), `memberIds` was not, and the invitation stayed
 * pending. Since membership is decided by `memberIds`, the invitee appeared in
 * the member list while still being locked out.
 *
 * So the write happens here, under an identity the rules trust, in one batch:
 * either the invitee is fully a member or nothing changed. The authorisation is
 * the invitation itself — it must be pending and addressed to the verified
 * email on the caller's own token, which they cannot forge.
 *
 * Idempotent by design: re-accepting an invitation that already half-applied
 * repairs it rather than failing.
 */

if (!getApps().some((a) => a.name === 'accept-invite')) {
  initializeApp({ projectId: 'stacky-f7f42' }, 'accept-invite')
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST.' })

  const idToken = readBearer(req.headers.authorization)
  if (!idToken) return res.status(401).json({ error: 'Sign in first.' })

  let caller: { uid: string; email?: string; name?: string }
  try {
    const app = getApps().find((a) => a.name === 'accept-invite')!
    const decoded = await getAuth(app).verifyIdToken(idToken)
    caller = { uid: decoded.uid, email: decoded.email, name: decoded.name }
  } catch {
    return res.status(401).json({ error: 'Invalid or expired session.' })
  }

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body ?? {})
  const invitationId = String(body.invitationId ?? '').trim()
  if (!invitationId) return res.status(400).json({ error: 'invitationId is required.' })

  const callerEmail = (caller.email ?? '').toLowerCase()
  if (!callerEmail) return res.status(403).json({ error: 'Your account has no verified email.' })

  try {
    const invRef = db.collection('invitations').doc(invitationId)
    const invSnap = await invRef.get()
    if (!invSnap.exists) return res.status(404).json({ error: 'Invitation not found.' })

    const inv = invSnap.data()!
    // The invitation is the credential: it must be addressed to this caller.
    if (String(inv.invitedEmail ?? '').toLowerCase() !== callerEmail) {
      return res.status(403).json({ error: 'This invitation is for a different account.' })
    }
    if (inv.status !== 'pending') {
      return res.status(409).json({ error: `Invitation is already ${inv.status}.` })
    }

    const wsRef = db.collection('workspaces').doc(String(inv.workspaceId))
    const wsSnap = await wsRef.get()
    if (!wsSnap.exists) return res.status(404).json({ error: 'That workspace no longer exists.' })

    const profile = (await db.collection('users').doc(caller.uid).get()).data()
    const displayName = profile?.displayName ?? caller.name ?? null

    const batch = db.batch()
    batch.set(
      wsRef.collection('members').doc(caller.uid),
      {
        userId: caller.uid,
        role: inv.role ?? 'member',
        joinedAt: FieldValue.serverTimestamp(),
        displayName,
        email: profile?.email ?? callerEmail,
      },
      { merge: true }
    )
    batch.update(wsRef, {
      memberIds: FieldValue.arrayUnion(caller.uid),
      updatedAt: FieldValue.serverTimestamp(),
    })
    batch.update(invRef, { status: 'accepted', updatedAt: FieldValue.serverTimestamp() })
    batch.set(db.collection('notifications').doc(), {
      userId: inv.invitedBy,
      type: 'system',
      title: 'Invitation Accepted',
      body: `${displayName ?? callerEmail} joined "${wsSnap.data()?.name ?? 'a workspace'}".`,
      link: '/',
      read: false,
      metadata: { workspaceId: inv.workspaceId },
      createdAt: FieldValue.serverTimestamp(),
    })
    await batch.commit()

    return res.status(200).json({ workspaceId: inv.workspaceId, name: wsSnap.data()?.name ?? null })
  } catch (err) {
    console.error('accept-invite failed', err)
    return res.status(500).json({ error: 'Could not accept the invitation.' })
  }
}
