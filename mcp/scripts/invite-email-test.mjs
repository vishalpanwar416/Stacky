/**
 * End-to-end test of POST /api/invite, including real email delivery.
 *
 * Uses a disposable workspace so no real invitation is touched. Since sanero.in
 * was verified, delivery is expected for any recipient — the assertions here
 * used to encode the unverified-domain limitation, which no longer applies.
 *
 *   node scripts/invite-email-test.mjs [base-url]
 */
import { readFileSync } from 'node:fs'

import { cert, initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'

import { db } from '../dist/firestore.js'

const BASE = process.argv[2] ?? 'http://localhost:5176'
const OWNER = 'gG3YSXzLDJY5i6KSd8xVLFIxGv33'
const READONLY_USER = 'LrpJq6Iu4NcIhikIljiOdb6OUhZ2'
const DELIVERABLE = 'vishalpanwar416a@gmail.com'
// An address unrelated to any Stacky or Resend account: with a verified sending
// domain this must be delivered just like any other.
const UNRELATED = 'stacky.invite.probe@gmail.com'

let failures = 0
const check = (label, cond, detail = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`)
  if (!cond) failures++
}

const key = JSON.parse(readFileSync(new URL('../serviceAccountKey.json', import.meta.url), 'utf8'))
const app = initializeApp({ credential: cert(key) }, `invmail-${Date.now()}`)
const webKey = readFileSync(new URL('../../.env', import.meta.url), 'utf8')
  .split('\n')
  .find((l) => l.startsWith('VITE_FIREBASE_API_KEY='))
  .split('=')[1]
  .replace(/"/g, '')
  .trim()

async function tokenFor(uid) {
  const custom = await getAuth(app).createCustomToken(uid)
  const r = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${webKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Referer: 'https://stackyy.vercel.app/' },
      body: JSON.stringify({ token: custom, returnSecureToken: true }),
    }
  ).then((x) => x.json())
  return r.idToken
}

const ws = await db
  .collection('workspaces')
  .add({
    name: `Invite Email Test ${Date.now()}`,
    slug: `invite-email-${Date.now()}`,
    visibility: 'private',
    ownerId: OWNER,
    memberIds: [OWNER, READONLY_USER],
    createdAt: new Date(),
    updatedAt: new Date(),
  })
  .then((r) => r.get())
await ws.ref.collection('members').doc(OWNER).set({ userId: OWNER, role: 'owner' })
await ws.ref.collection('members').doc(READONLY_USER).set({ userId: READONLY_USER, role: 'readonly' })

const ownerToken = await tokenFor(OWNER)
const post = (token, body) =>
  fetch(`${BASE}/api/invite`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  })

// --- authorisation ------------------------------------------------------
const unauth = await fetch(`${BASE}/api/invite`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ workspaceId: ws.id, email: DELIVERABLE }),
})
check('unauthenticated invite refused', unauth.status === 401, `HTTP ${unauth.status}`)

const byReadonly = await post(await tokenFor(READONLY_USER), { workspaceId: ws.id, email: DELIVERABLE })
check('readonly member cannot invite', byReadonly.status === 403, `HTTP ${byReadonly.status}`)

const badEmail = await post(ownerToken, { workspaceId: ws.id, email: 'not-an-email' })
check('malformed address refused', badEmail.status === 400, `HTTP ${badEmail.status}`)

// --- delivery ------------------------------------------------------------
const good = await post(ownerToken, { workspaceId: ws.id, email: DELIVERABLE })
const goodBody = await good.json()
check('invite succeeds', good.status === 200, `HTTP ${good.status}`)
check('  and the email was sent', goodBody.emailed === true, JSON.stringify(goodBody.emailError))

const blocked = await post(ownerToken, { workspaceId: ws.id, email: UNRELATED })
const blockedBody = await blocked.json()
check('invite to an unrelated address succeeds', blocked.status === 200, `HTTP ${blocked.status}`)
check('  and that email was sent too', blockedBody.emailed === true, JSON.stringify(blockedBody.emailError))
const stored = await db.collection('invitations').doc(blockedBody.invitationId ?? 'x').get()
check('  and the invitation exists', stored.exists)

// --- duplicates ----------------------------------------------------------
const dupe = await post(ownerToken, { workspaceId: ws.id, email: DELIVERABLE })
check('duplicate invite refused', dupe.status === 409, `HTTP ${dupe.status}`)

// --- cleanup -------------------------------------------------------------
for (const id of [goodBody.invitationId, blockedBody.invitationId]) {
  if (id) await db.collection('invitations').doc(id).delete()
}
for (const m of (await ws.ref.collection('members').get()).docs) await m.ref.delete()
await ws.ref.delete()
for (const n of (await db.collection('notifications').where('metadata.workspaceId', '==', ws.id).get()).docs) {
  await n.ref.delete()
}
console.log('\ncleaned up the disposable workspace and invitations')

console.log(failures === 0 ? '\nALL PASSED' : `\n${failures} FAILURE(S)`)
process.exit(failures === 0 ? 0 : 1)
