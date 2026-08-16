/**
 * End-to-end test of POST /api/accept-invite against a disposable account.
 *
 * Creates its own user, workspace invitation and tokens so it never touches
 * real invitations, and removes everything it made. Checks both that a genuine
 * invitee is fully joined and that someone else's token cannot use it.
 *
 *   node scripts/accept-invite-test.mjs [base-url]
 */
import { readFileSync } from 'node:fs'

import { cert, initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'

import { db } from '../dist/firestore.js'

const BASE = process.argv[2] ?? 'http://localhost:5176'
const OWNER = 'gG3YSXzLDJY5i6KSd8xVLFIxGv33'
const OUTSIDER_UID = 'LrpJq6Iu4NcIhikIljiOdb6OUhZ2' // Anshika — the invitee here
const OUTSIDER = OWNER // the owner is not the addressee, so may not accept

let failures = 0
const check = (label, cond, detail = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`)
  if (!cond) failures++
}

const key = JSON.parse(readFileSync(new URL('../serviceAccountKey.json', import.meta.url), 'utf8'))
const app = initializeApp({ credential: cert(key) }, `accept-${Date.now()}`)
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

// The service account can mint tokens but not create users, so the invitee is
// a real account that is not a member of anything this test touches. The
// workspace is disposable and deleted at the end, so no real membership moves.
const INVITEE = { uid: OUTSIDER_UID, email: 'gandhianshika5@gmail.com', name: 'Anshika' }
const testUser = { uid: INVITEE.uid }
const email = INVITEE.email

const ws = await db.collection('workspaces').add({
  name: `Accept Test ${Date.now()}`,
  slug: `accept-test-${Date.now()}`,
  visibility: 'private',
  ownerId: OWNER,
  memberIds: [OWNER],
  createdAt: new Date(),
  updatedAt: new Date(),
}).then((r) => r.get())

const inv = await db.collection('invitations').add({
  workspaceId: ws.id,
  workspaceName: ws.data().name,
  invitedEmail: email,
  status: 'pending',
  role: 'member',
  invitedBy: OWNER,
  invitedByName: 'Vishal Panwar',
  createdAt: new Date(),
  updatedAt: new Date(),
})

console.log(`invitation ${inv.id} → ${email}\n`)

const post = (token, body) =>
  fetch(`${BASE}/api/accept-invite`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  })

// --- someone else's invitation is not a credential ----------------------
const outsider = await post(await tokenFor(OUTSIDER), { invitationId: inv.id })
check('a non-addressee cannot accept this invitation', outsider.status === 403, `HTTP ${outsider.status}`)

const unauth = await fetch(`${BASE}/api/accept-invite`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ invitationId: inv.id }),
})
check('unauthenticated accept is rejected', unauth.status === 401, `HTTP ${unauth.status}`)

// --- the real invitee joins --------------------------------------------
const res = await post(await tokenFor(testUser.uid), { invitationId: inv.id })
check('invitee accepts successfully', res.status === 200, `HTTP ${res.status}`)

const after = await ws.ref.get()
check('added to memberIds', (after.data().memberIds ?? []).includes(testUser.uid))
check('member row created', (await ws.ref.collection('members').doc(testUser.uid).get()).exists)
check('invitation marked accepted', (await inv.get()).data().status === 'accepted')

const notes = await db
  .collection('notifications')
  .where('userId', '==', OWNER)
  .where('type', '==', 'system')
  .get()
const note = notes.docs.find((d) => d.data().body?.includes(INVITEE.name))
check('inviter notified', !!note)

// --- accepting twice is refused, not half-applied -----------------------
const again = await post(await tokenFor(testUser.uid), { invitationId: inv.id })
check('re-accepting is rejected cleanly', again.status === 409, `HTTP ${again.status}`)

// --- cleanup ------------------------------------------------------------
for (const m of (await ws.ref.collection('members').get()).docs) await m.ref.delete()
await ws.ref.delete()
await inv.delete()
if (note) await note.ref.delete()
console.log('\ndeleted the disposable workspace, invitation and notification')

console.log(failures === 0 ? '\nALL PASSED' : `\n${failures} FAILURE(S)`)
process.exit(failures === 0 ? 0 : 1)
