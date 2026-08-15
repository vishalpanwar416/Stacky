/**
 * Reproduces the workspace invite flow exactly as the browser performs it:
 * the duplicate-check query, then the invitation write, then the notification.
 *
 * Uses the REST API with a real ID token — the Admin SDK bypasses rules and
 * would report success no matter what the client actually experiences.
 *
 *   node scripts/invite-repro.mjs <invitee-email>
 */
import { readFileSync } from 'node:fs'

import { cert, initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'

import { db } from '../dist/firestore.js'

const PROJECT = 'stacky-f7f42'
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`
const INVITER = 'gG3YSXzLDJY5i6KSd8xVLFIxGv33' // Vishal
const invitee = (process.argv[2] ?? 'someone-new@example.com').toLowerCase()

const key = JSON.parse(readFileSync(new URL('../serviceAccountKey.json', import.meta.url), 'utf8'))
const app = initializeApp({ credential: cert(key) }, `invite-${Date.now()}`)
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

// A workspace this user owns.
const ws = (await db.collection('workspaces').where('ownerId', '==', INVITER).limit(1).get()).docs[0]
console.log(`inviting ${invitee} to "${ws.data().name}" (${ws.id})\n`)

// --- step 1: the duplicate-check query ----------------------------------
const eq = (field, value) => ({
  fieldFilter: { field: { fieldPath: field }, op: 'EQUAL', value: { stringValue: value } },
})
const queryRes = await as(':runQuery', {
  method: 'POST',
  body: JSON.stringify({
    structuredQuery: {
      from: [{ collectionId: 'invitations' }],
      where: {
        compositeFilter: {
          op: 'AND',
          filters: [eq('workspaceId', ws.id), eq('invitedEmail', invitee), eq('status', 'pending')],
        },
      },
    },
  }),
})
const queryBody = await queryRes.text()
console.log(`1. duplicate-check query  HTTP ${queryRes.status}`)
if (queryRes.status !== 200) console.log(`   ${queryBody.slice(0, 400)}\n`)

// --- step 2: create the invitation --------------------------------------
const now = new Date().toISOString()
const writeRes = await as('/invitations', {
  method: 'POST',
  body: JSON.stringify({
    fields: {
      workspaceId: { stringValue: ws.id },
      invitedEmail: { stringValue: invitee },
      status: { stringValue: 'pending' },
      role: { stringValue: 'member' },
      invitedBy: { stringValue: INVITER },
      createdAt: { timestampValue: now },
      updatedAt: { timestampValue: now },
    },
  }),
})
const writeBody = await writeRes.text()
console.log(`2. create invitation      HTTP ${writeRes.status}`)
if (writeRes.status !== 200) console.log(`   ${writeBody.slice(0, 400)}`)

// Clean up anything this probe created.
if (writeRes.status === 200) {
  const name = JSON.parse(writeBody).name
  await as(`/invitations/${name.split('/invitations/')[1]}`, { method: 'DELETE' })
  console.log('   (probe invitation deleted)')
}
