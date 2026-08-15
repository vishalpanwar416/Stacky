/**
 * Exercises the deployed security rules as a real signed-in user.
 *
 * Uses the REST API with a genuine ID token rather than the Admin SDK, because
 * the Admin SDK bypasses rules entirely — testing with it would prove nothing.
 *
 *   node scripts/rules-check.mjs
 */
import { readFileSync } from 'node:fs'

import { cert, initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'

import { db } from '../dist/firestore.js'

const PROJECT = 'stacky-f7f42'
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`

// Two real users who share no workspace.
const ATTACKER = { uid: 'LrpJq6Iu4NcIhikIljiOdb6OUhZ2', name: 'Anshika' }
const VICTIM = { uid: 'gG3YSXzLDJY5i6KSd8xVLFIxGv33', name: 'Vishal' }

let failures = 0
const check = (label, cond, detail = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`)
  if (!cond) failures++
}

const key = JSON.parse(readFileSync(new URL('../serviceAccountKey.json', import.meta.url), 'utf8'))
const app = initializeApp({ credential: cert(key) }, `rules-${Date.now()}`)
const webKey = readFileSync(new URL('../../.env', import.meta.url), 'utf8')
  .split('\n')
  .find((l) => l.startsWith('VITE_FIREBASE_API_KEY='))
  .split('=')[1]
  .replace(/"/g, '')
  .trim()

async function idTokenFor(uid) {
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

const token = await idTokenFor(ATTACKER.uid)
const as = (path, init = {}) =>
  fetch(`${BASE}/${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  })

// Find a task belonging to the victim, in a workspace the attacker is not in.
const victimTask = (
  await db.collection('tasks').where('createdBy', '==', VICTIM.uid).limit(1).get()
).docs[0]

console.log(`acting as ${ATTACKER.name}, targeting ${VICTIM.name}'s data\n`)

// --- P0: forging activity on someone else's task ------------------------
if (victimTask) {
  const res = await as(`tasks/${victimTask.id}/activity`, {
    method: 'POST',
    body: JSON.stringify({
      fields: {
        userId: { stringValue: ATTACKER.uid },
        action: { stringValue: 'status_change' },
        payload: { nullValue: null },
      },
    }),
  })
  check('cannot forge activity on another user\'s task', res.status === 403, `HTTP ${res.status}`)
}

// --- P0: task_dependencies ---------------------------------------------
const depRead = await as('task_dependencies')
check('cannot read task_dependencies', depRead.status === 403, `HTTP ${depRead.status}`)

const depWrite = await as('task_dependencies', {
  method: 'POST',
  body: JSON.stringify({ fields: { blocks: { stringValue: 'anything' } } }),
})
check('cannot write task_dependencies', depWrite.status === 403, `HTTP ${depWrite.status}`)

// --- credentials and ledger stay server-only ----------------------------
const tokens = await as('mcpTokens')
check('cannot read mcpTokens', tokens.status === 403, `HTTP ${tokens.status}`)

const budget = await as('aiBudget')
check('cannot read aiBudget', budget.status === 403, `HTTP ${budget.status}`)

// --- and the legitimate path still works --------------------------------
const own = await as(`users/${ATTACKER.uid}`)
check('can still read own profile', own.status === 200, `HTTP ${own.status}`)

// --- known-open hole, asserted so it cannot regress silently -------------
const otherProfile = await as(`users/${VICTIM.uid}`)
console.log(
  `\nSTILL OPEN  reading another user's profile — HTTP ${otherProfile.status}` +
    ' (needs the email lookup moved server-side first)'
)

console.log(failures === 0 ? '\nALL PASSED' : `\n${failures} FAILURE(S)`)
process.exit(failures === 0 ? 0 : 1)
