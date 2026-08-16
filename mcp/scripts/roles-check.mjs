/**
 * Proves the role rules against the deployed ruleset, as real signed-in users.
 *
 * Uses the REST API with genuine ID tokens — the Admin SDK bypasses rules, so
 * testing with it would prove nothing. Everything is set up and torn down here,
 * against a disposable workspace.
 *
 *   node scripts/roles-check.mjs
 */
import { readFileSync } from 'node:fs'

import { cert, initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'

import { db } from '../dist/firestore.js'

const PROJECT = 'stacky-f7f42'
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`
const OWNER = 'gG3YSXzLDJY5i6KSd8xVLFIxGv33'
const OTHER = 'LrpJq6Iu4NcIhikIljiOdb6OUhZ2' // the member under test

let failures = 0
const check = (label, cond, detail = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`)
  if (!cond) failures++
}

const key = JSON.parse(readFileSync(new URL('../serviceAccountKey.json', import.meta.url), 'utf8'))
const app = initializeApp({ credential: cert(key) }, `roles-${Date.now()}`)
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

// --- disposable workspace with both people in it ------------------------
const ws = await db
  .collection('workspaces')
  .add({
    name: `Roles Test ${Date.now()}`,
    slug: `roles-${Date.now()}`,
    visibility: 'private',
    ownerId: OWNER,
    memberIds: [OWNER, OTHER],
    createdAt: new Date(),
    updatedAt: new Date(),
  })
  .then((r) => r.get())

await ws.ref.collection('members').doc(OWNER).set({ userId: OWNER, role: 'owner' })
const memberRow = ws.ref.collection('members').doc(OTHER)
await memberRow.set({ userId: OTHER, role: 'member', email: 'gandhianshika5@gmail.com' })

const task = await db.collection('tasks').add({
  workspaceId: ws.id,
  title: 'Role probe',
  status: 'backlog',
  priority: 'P2',
  createdBy: OWNER,
  createdAt: new Date(),
  updatedAt: new Date(),
})

const memberToken = await tokenFor(OTHER)
const as = (path, init = {}) =>
  fetch(`${BASE}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${memberToken}`, 'Content-Type': 'application/json' },
  })

const patchTitle = (title) =>
  as(`/tasks/${task.id}?updateMask.fieldPaths=title`, {
    method: 'PATCH',
    body: JSON.stringify({ fields: { title: { stringValue: title } } }),
  })

const createTask = () =>
  as('/tasks', {
    method: 'POST',
    body: JSON.stringify({
      fields: {
        workspaceId: { stringValue: ws.id },
        title: { stringValue: 'should not exist' },
        status: { stringValue: 'backlog' },
      },
    }),
  })

// --- as a full member ---------------------------------------------------
console.log('as role=member')
check('  can read the task', (await as(`/tasks/${task.id}`)).status === 200)
check('  can edit the task', (await patchTitle('edited by member')).status === 200)
const made = await createTask()
check('  can create a task', made.status === 200, `HTTP ${made.status}`)
if (made.status === 200) {
  const name = (await made.json()).name
  await db.doc(name.split('/documents/')[1]).delete()
}

// --- demoted to readonly ------------------------------------------------
await memberRow.update({ role: 'readonly' })
console.log('\nas role=readonly')
const read = await as(`/tasks/${task.id}`)
check('  can still read the task', read.status === 200, `HTTP ${read.status}`)
const edit = await patchTitle('edited by readonly')
check('  cannot edit the task', edit.status === 403, `HTTP ${edit.status}`)
const create = await createTask()
check('  cannot create a task', create.status === 403, `HTTP ${create.status}`)
const del = await as(`/tasks/${task.id}`, { method: 'DELETE' })
check('  cannot delete the task', del.status === 403, `HTTP ${del.status}`)

const comment = await as(`/tasks/${task.id}/comments`, {
  method: 'POST',
  body: JSON.stringify({ fields: { userId: { stringValue: OTHER }, body: { stringValue: 'hi' } } }),
})
check('  cannot comment', comment.status === 403, `HTTP ${comment.status}`)

const invite = await as('/invitations', {
  method: 'POST',
  body: JSON.stringify({
    fields: {
      workspaceId: { stringValue: ws.id },
      invitedEmail: { stringValue: 'nobody@example.com' },
      status: { stringValue: 'pending' },
    },
  }),
})
check('  cannot invite anyone', invite.status === 403, `HTTP ${invite.status}`)

// The role is the boundary, so it must not be self-editable.
const selfPromote = await as(`/workspaces/${ws.id}/members/${OTHER}?updateMask.fieldPaths=role`, {
  method: 'PATCH',
  body: JSON.stringify({ fields: { role: { stringValue: 'member' } } }),
})
check('  cannot promote itself', selfPromote.status === 403, `HTTP ${selfPromote.status}`)

// And the edit that was refused must not have landed.
const title = (await (await as(`/tasks/${task.id}`)).json()).fields.title.stringValue
check('  refused edit did not apply', title === 'edited by member', `title is "${title}"`)

// --- the owner can still change roles ------------------------------------
const ownerToken = await tokenFor(OWNER)
const ownerPatch = await fetch(
  `${BASE}/workspaces/${ws.id}/members/${OTHER}?updateMask.fieldPaths=role`,
  {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: { role: { stringValue: 'member' } } }),
  }
)
console.log('\nas the owner')
check('  can change a member role', ownerPatch.status === 200, `HTTP ${ownerPatch.status}`)

// --- cleanup ------------------------------------------------------------
await task.delete()
for (const m of (await ws.ref.collection('members').get()).docs) await m.ref.delete()
await ws.ref.delete()
console.log('\ncleaned up the disposable workspace and task')

console.log(failures === 0 ? '\nALL PASSED' : `\n${failures} FAILURE(S)`)
process.exit(failures === 0 ? 0 : 1)
