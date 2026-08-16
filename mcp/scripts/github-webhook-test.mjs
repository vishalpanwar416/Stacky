/**
 * Exercises POST /api/github-webhook with real, signed payloads.
 *
 * Uses a disposable workspace, repo link and tasks, so nothing real is touched.
 * The point is not that the model matches perfectly — it is that the route
 * authenticates, never closes a task from an unmerged change, and only ever
 * writes suggestions rather than moving anything.
 *
 *   node scripts/github-webhook-test.mjs [base-url]
 */
import { createHmac } from 'node:crypto'
import { readFileSync } from 'node:fs'

import { db } from '../dist/firestore.js'

const BASE = process.argv[2] ?? 'http://localhost:5173'
const OWNER = 'gG3YSXzLDJY5i6KSd8xVLFIxGv33'
const REPO = 'stacky-test/webhook-probe'

let failures = 0
const check = (label, cond, detail = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`)
  if (!cond) failures++
}

const secret = readFileSync(new URL('../../.env', import.meta.url), 'utf8')
  .split('\n')
  .find((l) => l.startsWith('GITHUB_WEBHOOK_SECRET='))
  .split('=')[1]
  .replace(/"/g, '')
  .trim()

const send = (event, payload, { badSignature = false } = {}) => {
  const raw = JSON.stringify(payload)
  const sig = `sha256=${createHmac('sha256', badSignature ? 'wrong' : secret).update(raw).digest('hex')}`
  return fetch(`${BASE}/api/github-webhook`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-GitHub-Event': event,
      'X-Hub-Signature-256': sig,
    },
    body: raw,
  })
}

// --- fixture -------------------------------------------------------------
const ws = await db
  .collection('workspaces')
  .add({
    name: `Webhook Probe ${Date.now()}`,
    slug: `wh-${Date.now()}`,
    visibility: 'private',
    ownerId: OWNER,
    memberIds: [OWNER],
    createdAt: new Date(),
    updatedAt: new Date(),
  })
  .then((r) => r.get())

const task = await db.collection('tasks').add({
  workspaceId: ws.id,
  title: 'Rate limit the password reset endpoint',
  description: 'Reset requests are unthrottled and can be used to spam a mailbox.',
  status: 'backlog',
  priority: 'P1',
  createdBy: OWNER,
  assignees: { ownerId: OWNER, watcherIds: [] },
  createdAt: new Date(),
  updatedAt: new Date(),
})

await db.collection('repoLinks').doc(REPO.replace('/', '__')).set({
  repo: REPO,
  workspaceId: ws.id,
  linkedBy: OWNER,
  linkedAt: new Date(),
})

const repository = { full_name: REPO }
const cleanupSuggestions = async () => {
  const s = await db.collection('gitSuggestions').where('workspaceId', '==', ws.id).get()
  for (const d of s.docs) await d.ref.delete()
  return s.size
}

// --- authentication ------------------------------------------------------
const bad = await send('push', { repository, commits: [{ message: 'x' }] }, { badSignature: true })
check('rejects a bad signature', bad.status === 401, `HTTP ${bad.status}`)

const unsigned = await fetch(`${BASE}/api/github-webhook`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'X-GitHub-Event': 'push' },
  body: JSON.stringify({ repository }),
})
check('rejects an unsigned delivery', unsigned.status === 401, `HTTP ${unsigned.status}`)

const ping = await send('ping', { repository, zen: 'hi' })
check('answers ping', ping.status === 200, `HTTP ${ping.status}`)

// --- an unlinked repository is ignored ------------------------------------
const unlinked = await send('push', {
  repository: { full_name: 'someone/else' },
  commits: [{ message: 'anything' }],
})
const unlinkedBody = await unlinked.json()
check('ignores an unlinked repository', unlinkedBody.skipped?.includes('not linked'), JSON.stringify(unlinkedBody))

// --- a push suggests in_progress, never done ------------------------------
const push = await send('push', {
  repository,
  ref: 'refs/heads/fix/reset-rate-limit',
  pusher: { name: 'vishalpanwar416' },
  compare: 'https://github.com/x/y/compare/aaa...bbb',
  commits: [
    {
      message: 'Throttle password reset requests to 5 per hour per address',
      added: [],
      modified: ['api/auth/reset.ts'],
    },
  ],
})
const pushBody = await push.json()
check('accepts a signed push', push.status === 200, `HTTP ${push.status}`)

let suggestions = await db.collection('gitSuggestions').where('workspaceId', '==', ws.id).get()
const fromPush = suggestions.docs.map((d) => d.data())
check('  matched the related task', fromPush.length > 0, JSON.stringify(pushBody))
check(
  '  never suggests done for an unmerged change',
  fromPush.every((s) => s.suggestedStatus !== 'done'),
  fromPush.map((s) => s.suggestedStatus).join(',')
)
check('  wrote it as pending, not applied', fromPush.every((s) => s.status === 'pending'))
check(
  '  left the task untouched',
  (await task.get()).data().status === 'backlog',
  (await task.get()).data().status
)
if (fromPush[0]) console.log(`        reason: "${fromPush[0].reason}"`)
await cleanupSuggestions()

// --- a merged PR may suggest done -----------------------------------------
const merged = await send('pull_request', {
  repository,
  action: 'closed',
  pull_request: {
    title: 'Rate limit password reset requests',
    body: 'Adds a 5/hour per-address limit to the reset endpoint.',
    merged: true,
    html_url: 'https://github.com/x/y/pull/12',
    head: { ref: 'fix/reset-rate-limit' },
    user: { login: 'vishalpanwar416' },
  },
})
check('accepts a merged pull request', merged.status === 200, `HTTP ${merged.status}`)
suggestions = await db.collection('gitSuggestions').where('workspaceId', '==', ws.id).get()
const fromPr = suggestions.docs.map((d) => d.data())
check('  matched the task', fromPr.length > 0, JSON.stringify(await merged.json().catch(() => ({}))))
check('  and still did not move it', (await task.get()).data().status === 'backlog')
if (fromPr[0]) console.log(`        suggests: ${fromPr[0].suggestedStatus} — "${fromPr[0].reason}"`)

// --- unrelated work matches nothing ---------------------------------------
await cleanupSuggestions()
const unrelated = await send('push', {
  repository,
  ref: 'refs/heads/chore/readme',
  pusher: { name: 'vishalpanwar416' },
  commits: [{ message: 'Fix a typo in the contributing guide', modified: ['CONTRIBUTING.md'] }],
})
await unrelated.json()
const none = await db.collection('gitSuggestions').where('workspaceId', '==', ws.id).get()
check('unrelated commits produce no suggestions', none.size === 0, `${none.size} raised`)

// --- cleanup --------------------------------------------------------------
await cleanupSuggestions()
await task.delete()
await db.collection('repoLinks').doc(REPO.replace('/', '__')).delete()
await ws.ref.delete()
console.log('\ncleaned up the probe workspace, task, repo link and suggestions')

console.log(failures === 0 ? '\nALL PASSED' : `\n${failures} FAILURE(S)`)
process.exit(failures === 0 ? 0 : 1)
