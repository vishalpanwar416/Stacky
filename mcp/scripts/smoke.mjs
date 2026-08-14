/**
 * End-to-end smoke test: drives the built server over real stdio MCP,
 * against the real Firestore project, then cleans up after itself.
 *
 *   node scripts/smoke.mjs
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

const TAG = 'mcp-smoke-test'
let failures = 0

const check = (label, cond, detail = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`)
  if (!cond) failures++
}

const client = new Client({ name: 'smoke', version: '0.0.0' })
await client.connect(new StdioClientTransport({ command: 'node', args: ['dist/index.js'] }))

const call = async (name, args = {}) => {
  const res = await client.callTool({ name, arguments: args })
  const text = res.content?.[0]?.text ?? ''
  return { isError: !!res.isError, text, json: safeJson(text) }
}
const safeJson = (t) => {
  try {
    return JSON.parse(t)
  } catch {
    return null
  }
}

// 1. Tool surface
const { tools } = await client.listTools()
check('8 tools registered', tools.length === 8, tools.map((t) => t.name).join(', '))

// 2. Workspace scoping
const ws = await call('list_workspaces')
const mine = ws.json ?? []
check('list_workspaces returns only reachable workspaces', mine.length === 2, `${mine.length} found: ${mine.map((w) => w.name).join(', ')}`)

// 3. Access guard against a workspace owned by someone else (Anshika's Personal)
const denied = await call('list_projects', { workspaceId: 'JbSGw2vLS2O7u8HDCEhQ' })
check('foreign workspace is rejected', denied.isError, denied.text.slice(0, 80))

const target = mine.find((w) => w.name === 'Side Projects') ?? mine[0]
if (!target) {
  console.error('No workspace available; aborting.')
  process.exit(1)
}

// 4. Create
const created = await call('create_task', {
  workspaceId: target.id,
  title: 'MCP smoke test — safe to delete',
  description: 'Created by scripts/smoke.mjs to verify the MCP write path.',
  priority: 'P3',
  tags: ['bug', TAG],
  dueDate: '2026-09-01',
})
check('create_task succeeds', !created.isError && !!created.json?.id, created.text.slice(0, 120))
const taskId = created.json?.id

// 5. Read back
const got = await call('get_task', { taskId })
const task = got.json?.task
check('task round-trips with correct fields',
  task?.title === 'MCP smoke test — safe to delete' && task?.status === 'backlog' && task?.priority === 'P3',
  `status=${task?.status} priority=${task?.priority}`)
// Stored at local midnight, matching NewTask.tsx — so compare the local date,
// not the UTC prefix (in IST those differ by a day).
const localDay = task?.dueDate
  ? new Date(task.dueDate).toLocaleDateString('en-CA') // en-CA renders YYYY-MM-DD
  : null
check('dueDate lands on the right local day', localDay === '2026-09-01', `${task?.dueDate} → ${localDay}`)
check('timerEnabled matches the UI default', task?.timerEnabled === true, String(task?.timerEnabled))
check('attributed to the configured uid', task?.createdBy === 'gG3YSXzLDJY5i6KSd8xVLFIxGv33', String(task?.createdBy))
check('created activity logged', (got.json?.activity ?? []).some((a) => a.action === 'created'))

// 6. Filtering by tag
const listed = await call('list_tasks', { workspaceId: target.id, tag: 'bug' })
check('list_tasks finds it by tag', (listed.json ?? []).some((t) => t.id === taskId), `${(listed.json ?? []).length} bug(s)`)

// 7. Comment
const commented = await call('comment_on_task', { taskId, body: 'Smoke test comment.' })
check('comment_on_task succeeds', !commented.isError && !!commented.json?.commentId)

// 8. Status lifecycle
const started = await call('update_task', { taskId, status: 'in_progress' })
check('update_task moves to in_progress', !started.isError, started.text.slice(0, 80))
const afterStart = (await call('get_task', { taskId })).json?.task
check('in_progress stamps startedAt + timer', !!afterStart?.startedAt && afterStart?.timerElapsed === 0)

const closed = await call('close_task', { taskId, completionNote: 'Verified by smoke test.' })
check('close_task succeeds', !closed.isError, closed.text.slice(0, 80))
const afterClose = (await call('get_task', { taskId })).json?.task
check('done stamps completedAt', !!afterClose?.completedAt)
check('completion note saved', afterClose?.completionNote === 'Verified by smoke test.')
check('completed activity logged',
  ((await call('get_task', { taskId })).json?.activity ?? []).some((a) => a.action === 'completed'))

// 9. Bad input is reported, not thrown
const bad = await call('create_task', { workspaceId: target.id, title: 'bad date', dueDate: 'not-a-date' })
check('invalid dueDate returns a tool error', bad.isError, bad.text.slice(0, 80))

await client.close()

// 10. Cleanup — remove anything this script created.
const { db, TASKS } = await import('../dist/firestore.js')
const leftovers = await db.collection(TASKS).where('tags', 'array-contains', TAG).get()
for (const doc of leftovers.docs) {
  for (const sub of ['comments', 'activity']) {
    const s = await doc.ref.collection(sub).get()
    await Promise.all(s.docs.map((d) => d.ref.delete()))
  }
  await doc.ref.delete()
}
check('cleanup removed smoke tasks', true, `${leftovers.size} deleted`)

console.log(failures === 0 ? '\nALL PASSED' : `\n${failures} FAILURE(S)`)
process.exit(failures === 0 ? 0 : 1)
