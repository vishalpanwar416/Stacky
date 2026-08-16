/**
 * Covers POST /api/remove-member — both leaving and being removed.
 *
 * Runs against a disposable workspace with a real task assigned to the member,
 * because the assignment is the part that makes removal mean anything: security
 * rules let an assignee reach their task regardless of membership.
 *
 *   node scripts/remove-member-test.mjs [base-url]
 */
import { readFileSync } from 'node:fs'

import { cert, initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'

import { db } from '../dist/firestore.js'

const BASE = process.argv[2] ?? 'http://localhost:5176'
const PROJECT = 'stacky-f7f42'
const REST = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`
const OWNER = 'gG3YSXzLDJY5i6KSd8xVLFIxGv33'
const MEMBER = 'LrpJq6Iu4NcIhikIljiOdb6OUhZ2'

let failures = 0
const check = (label, cond, detail = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`)
  if (!cond) failures++
}

const key = JSON.parse(readFileSync(new URL('../serviceAccountKey.json', import.meta.url), 'utf8'))
const app = initializeApp({ credential: cert(key) }, `rm-${Date.now()}`)
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

const post = (token, body) =>
  fetch(`${BASE}/api/remove-member`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  })

async function makeWorkspace(name) {
  const ws = await db
    .collection('workspaces')
    .add({
      name: `${name} ${Date.now()}`,
      slug: `rm-${Date.now()}`,
      visibility: 'private',
      ownerId: OWNER,
      memberIds: [OWNER, MEMBER],
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .then((r) => r.get())
  await ws.ref.collection('members').doc(OWNER).set({ userId: OWNER, role: 'owner' })
  await ws.ref.collection('members').doc(MEMBER).set({ userId: MEMBER, role: 'member' })
  const task = await db.collection('tasks').add({
    workspaceId: ws.id,
    title: 'Assigned to the member',
    status: 'backlog',
    priority: 'P2',
    createdBy: OWNER,
    assignees: { ownerId: MEMBER, watcherIds: [MEMBER] },
    createdAt: new Date(),
    updatedAt: new Date(),
  })
  return { ws, task }
}

const cleanup = async ({ ws, task }) => {
  await task.delete()
  for (const m of (await ws.ref.collection('members').get()).docs) await m.ref.delete()
  await ws.ref.delete()
}

const memberToken = await tokenFor(MEMBER)
const ownerToken = await tokenFor(OWNER)

// ── 1. the owner removes a member ────────────────────────────────────────
{
  const fixture = await makeWorkspace('Remove Test')
  const { ws, task } = fixture

  // Before: the member can reach the task.
  const before = await fetch(`${REST}/tasks/${task.id}`, {
    headers: { Authorization: `Bearer ${memberToken}` },
  })
  check('member can read their assigned task beforehand', before.status === 200, `HTTP ${before.status}`)

  const res = await post(ownerToken, { workspaceId: ws.id, userId: MEMBER })
  const bodyJson = await res.json()
  check('owner removes the member', res.status === 200, `HTTP ${res.status}`)
  check('  reports the unassigned task', bodyJson.unassignedTasks === 1, JSON.stringify(bodyJson))

  const after = await ws.ref.get()
  check('  gone from memberIds', !(after.data().memberIds ?? []).includes(MEMBER))
  check('  member row deleted', !(await ws.ref.collection('members').doc(MEMBER).get()).exists)

  const t = (await task.get()).data()
  check('  no longer the task assignee', t.assignees.ownerId === '')
  check('  no longer a watcher', !(t.assignees.watcherIds ?? []).includes(MEMBER))

  // The point of all that: access is actually gone.
  const denied = await fetch(`${REST}/tasks/${task.id}`, {
    headers: { Authorization: `Bearer ${memberToken}` },
  })
  check('  and can no longer read the task', denied.status === 403, `HTTP ${denied.status}`)

  await cleanup(fixture)
}

// ── 2. a member leaves ───────────────────────────────────────────────────
{
  const fixture = await makeWorkspace('Leave Test')
  const { ws } = fixture
  const res = await post(memberToken, { workspaceId: ws.id })
  check('member leaves on their own', res.status === 200, `HTTP ${res.status}`)
  const after = await ws.ref.get()
  check('  gone from memberIds', !(after.data().memberIds ?? []).includes(MEMBER))
  await cleanup(fixture)
}

// ── 3. what must not be allowed ──────────────────────────────────────────
{
  const fixture = await makeWorkspace('Guard Test')
  const { ws } = fixture

  const byMember = await post(memberToken, { workspaceId: ws.id, userId: OWNER })
  check('member cannot remove the owner', byMember.status === 400 || byMember.status === 403, `HTTP ${byMember.status}`)

  const ownerLeaves = await post(ownerToken, { workspaceId: ws.id })
  check('owner cannot leave their own workspace', ownerLeaves.status === 400, `HTTP ${ownerLeaves.status}`)

  const unauth = await fetch(`${BASE}/api/remove-member`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ workspaceId: ws.id, userId: MEMBER }),
  })
  check('unauthenticated removal refused', unauth.status === 401, `HTTP ${unauth.status}`)

  const stillThere = await ws.ref.get()
  check('  nothing was removed by the refused calls', (stillThere.data().memberIds ?? []).length === 2)

  await cleanup(fixture)
}

// A non-owner removing a third party.
{
  const fixture = await makeWorkspace('Third Party Test')
  const { ws } = fixture
  const res = await post(memberToken, { workspaceId: ws.id, userId: 'someone-else-uid' })
  check('non-owner cannot remove anyone else', res.status === 403, `HTTP ${res.status}`)
  await cleanup(fixture)
}

console.log('\ncleaned up every disposable workspace and task')
console.log(failures === 0 ? '\nALL PASSED' : `\n${failures} FAILURE(S)`)
process.exit(failures === 0 ? 0 : 1)
