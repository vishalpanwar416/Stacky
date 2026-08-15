/**
 * Sends a workspace invitation through the same path the browser uses —
 * REST with a real ID token, so security rules apply exactly as they would
 * for the signed-in user.
 *
 *   node scripts/invite-send.mjs <email> [workspace-name]
 */
import { readFileSync } from 'node:fs'

import { cert, initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'

import { db } from '../dist/firestore.js'

const PROJECT = 'stacky-f7f42'
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`
const INVITER = 'gG3YSXzLDJY5i6KSd8xVLFIxGv33'

const email = String(process.argv[2] ?? '').toLowerCase().trim()
const wsName = process.argv[3] ?? 'Personal Projects'
if (!email.includes('@')) throw new Error('usage: invite-send.mjs <email> [workspace-name]')

const key = JSON.parse(readFileSync(new URL('../serviceAccountKey.json', import.meta.url), 'utf8'))
const app = initializeApp({ credential: cert(key) }, `send-${Date.now()}`)
const webKey = readFileSync(new URL('../../.env', import.meta.url), 'utf8')
  .split('\n')
  .find((l) => l.startsWith('VITE_FIREBASE_API_KEY='))
  .split('=')[1]
  .replace(/"/g, '')
  .trim()

const custom = await getAuth(app).createCustomToken(INVITER)
const { idToken } = await fetch(
  `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${webKey}`,
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Referer: 'https://stackyy.vercel.app/' },
    body: JSON.stringify({ token: custom, returnSecureToken: true }),
  }
).then((r) => r.json())

const as = (path, init = {}) =>
  fetch(`${BASE}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json' },
  })

const ws = (
  await db.collection('workspaces').where('ownerId', '==', INVITER).get()
).docs.find((d) => d.data().name === wsName)
if (!ws) throw new Error(`no workspace named "${wsName}"`)

// Same duplicate guard the client applies.
const existing = await db
  .collection('invitations')
  .where('workspaceId', '==', ws.id)
  .where('invitedEmail', '==', email)
  .where('status', '==', 'pending')
  .get()
if (!existing.empty) {
  console.log(`already pending — ${email} was invited to "${ws.data().name}" (${existing.docs[0].id})`)
  process.exit(0)
}

const now = new Date().toISOString()
const res = await as('/invitations', {
  method: 'POST',
  body: JSON.stringify({
    fields: {
      workspaceId: { stringValue: ws.id },
      invitedEmail: { stringValue: email },
      status: { stringValue: 'pending' },
      role: { stringValue: 'member' },
      invitedBy: { stringValue: INVITER },
      createdAt: { timestampValue: now },
      updatedAt: { timestampValue: now },
    },
  }),
})
const body = await res.text()
console.log(`invitation write  HTTP ${res.status}`)
if (res.status !== 200) {
  console.log(body.slice(0, 400))
  process.exit(1)
}
console.log(`invited ${email} to "${ws.data().name}"`)

// Notify them in-app only if they already have an account.
const account = await db.collection('users').where('email', '==', email).limit(1).get()
if (account.empty) {
  console.log('no Stacky account for that address yet — the invite waits until they sign in')
} else {
  const uid = account.docs[0].id
  const n = await as('/notifications', {
    method: 'POST',
    body: JSON.stringify({
      fields: {
        userId: { stringValue: uid },
        type: { stringValue: 'invitation' },
        title: { stringValue: 'Workspace Invitation' },
        body: { stringValue: `You've been invited to join "${ws.data().name}".` },
        link: { stringValue: '/dashboard' },
        read: { booleanValue: false },
        createdAt: { timestampValue: now },
      },
    }),
  })
  console.log(`in-app notification to ${uid}  HTTP ${n.status}`)
}
