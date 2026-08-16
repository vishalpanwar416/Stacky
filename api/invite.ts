import { getApps, initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'

import { db, FieldValue } from '../mcp/src/firestore.js'
import { invitationEmail, sendEmail } from './_lib/email.js'
import { readBearer } from './_lib/mcpAuth.js'

/**
 * POST /api/invite — invite someone to a workspace, and tell them.
 *
 * Invitations used to be written straight from the browser, which meant an
 * invitee with no Stacky account was never contacted at all: the document sat
 * in Firestore until they happened to sign up. Sending mail needs a server, and
 * once the server is in the path it may as well own the whole operation, so the
 * duplicate check, the document, the in-app notification and the email are one
 * request with one clear outcome.
 *
 * This runs on the Admin SDK, which bypasses security rules, so the permission
 * check that firestore.rules would have made is made here instead: the caller
 * must be a member of the workspace and must not be readonly.
 */

if (!getApps().some((a) => a.name === 'invite')) {
  initializeApp({ projectId: 'stacky-f7f42' }, 'invite')
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST.' })

  const idToken = readBearer(req.headers.authorization)
  if (!idToken) return res.status(401).json({ error: 'Sign in first.' })

  let caller: { uid: string; email?: string; name?: string }
  try {
    const app = getApps().find((a) => a.name === 'invite')!
    const decoded = await getAuth(app).verifyIdToken(idToken)
    caller = { uid: decoded.uid, email: decoded.email, name: decoded.name }
  } catch {
    return res.status(401).json({ error: 'Invalid or expired session.' })
  }

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body ?? {})
  const workspaceId = String(body.workspaceId ?? '').trim()
  const email = String(body.email ?? '').trim().toLowerCase()

  if (!workspaceId) return res.status(400).json({ error: 'workspaceId is required.' })
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'A valid email address is required.' })
  }
  if (email === (caller.email ?? '').toLowerCase()) {
    return res.status(400).json({ error: 'That is your own address.' })
  }

  try {
    const wsRef = db.collection('workspaces').doc(workspaceId)
    const wsSnap = await wsRef.get()
    if (!wsSnap.exists) return res.status(404).json({ error: 'That workspace no longer exists.' })
    const ws = wsSnap.data()!

    // --- the check firestore.rules would have made ------------------------
    const isOwner = ws.ownerId === caller.uid
    if (!isOwner) {
      const isMember = (ws.memberIds ?? []).includes(caller.uid)
      if (!isMember) return res.status(403).json({ error: 'You are not in that workspace.' })
      const row = await wsRef.collection('members').doc(caller.uid).get()
      if ((row.data()?.role ?? 'member') === 'readonly') {
        return res.status(403).json({ error: 'Read-only members cannot invite people.' })
      }
    }

    // --- already in, or already asked? ------------------------------------
    const existingUser = await db.collection('users').where('email', '==', email).limit(1).get()
    const inviteeId = existingUser.empty ? null : existingUser.docs[0].id
    if (inviteeId && (ws.memberIds ?? []).includes(inviteeId)) {
      return res.status(409).json({ error: 'They are already in this workspace.' })
    }

    const pending = await db
      .collection('invitations')
      .where('workspaceId', '==', workspaceId)
      .where('invitedEmail', '==', email)
      .where('status', '==', 'pending')
      .get()
    if (!pending.empty) {
      const existing = pending.docs[0]
      const inv = existing.data()
      const mail = invitationEmail({
        workspaceName: inv.workspaceName ?? ws.name ?? 'a workspace',
        inviterName: inv.invitedByName ?? null,
        inviterEmail: caller.email ?? null,
        role: inv.role ?? 'member',
        appUrl: process.env.APP_URL ?? 'https://stackyy.vercel.app',
      })
      const again = await sendEmail({
        to: email,
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
        replyTo: caller.email,
      })
      await existing.ref.update({
        emailed: again.ok,
        emailError: again.ok ? null : again.reason,
        emailedAt: FieldValue.serverTimestamp(),
      })
      return res.status(200).json({
        invitationId: existing.id,
        resent: true,
        emailed: again.ok,
        emailError: again.ok ? null : again.reason,
        hasAccount: !!inviteeId,
      })
    }

    // --- create it --------------------------------------------------------
    const inviterProfile = (await db.collection('users').doc(caller.uid).get()).data()
    const inviterName = inviterProfile?.displayName ?? caller.name ?? null

    const invitation = await db.collection('invitations').add({
      workspaceId,
      workspaceName: ws.name ?? null,
      invitedEmail: email,
      status: 'pending',
      role: 'member',
      invitedBy: caller.uid,
      invitedByName: inviterName,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    })

    // In-app notification only helps people who already have an account.
    if (inviteeId) {
      await db.collection('notifications').add({
        userId: inviteeId,
        type: 'invitation',
        title: 'Workspace Invitation',
        body: `You've been invited to join "${ws.name ?? 'a workspace'}".`,
        link: '/settings',
        read: false,
        metadata: { workspaceId },
        createdAt: FieldValue.serverTimestamp(),
      })
    }

    // --- and tell them ----------------------------------------------------
    const appUrl = process.env.APP_URL ?? 'https://stackyy.vercel.app'
    const mail = invitationEmail({
      workspaceName: ws.name ?? 'a workspace',
      inviterName,
      inviterEmail: caller.email ?? null,
      role: 'member',
      appUrl,
    })
    const sent = await sendEmail({
      to: email,
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
      replyTo: caller.email,
    })

    // Without this, whether a message went out is unknowable after the request
    // ends — which is exactly the question asked when one does not arrive.
    await invitation.update({
      emailed: sent.ok,
      emailError: sent.ok ? null : sent.reason,
      emailedAt: FieldValue.serverTimestamp(),
    })

    return res.status(200).json({
      invitationId: invitation.id,
      // The invitation exists regardless. Report delivery separately so the
      // inviter is never told someone was emailed when they were not.
      emailed: sent.ok,
      emailError: sent.ok ? null : sent.reason,
      hasAccount: !!inviteeId,
    })
  } catch (err) {
    console.error('invite failed', err)
    return res.status(500).json({ error: 'Could not create the invitation.' })
  }
}
