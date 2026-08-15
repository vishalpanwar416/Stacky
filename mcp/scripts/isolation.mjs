/**
 * Cross-tenant isolation test for the hosted MCP server.
 *
 * The Admin SDK bypasses firestore.rules, so scope.ts is the only thing keeping
 * one user's token away from another user's data. This drives the real HTTP
 * endpoint as two different users and asserts the boundary holds.
 *
 *   node scripts/isolation.mjs [baseUrl]
 */
import { createHash, randomBytes } from 'node:crypto'

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'

import { db } from '../dist/firestore.js'

const BASE = process.argv[2] ?? 'http://localhost:5176'
const MCP_URL = new URL('/api/mcp', BASE)

const USER_A = { uid: 'gG3YSXzLDJY5i6KSd8xVLFIxGv33', name: 'Vishal' }
const USER_B = { uid: 'LrpJq6Iu4NcIhikIljiOdb6OUhZ2', name: 'Anshika' }

let failures = 0
const check = (label, cond, detail = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`)
  if (!cond) failures++
}

/**
 * Insert a token row directly. Deliberately bypasses /api/mcp-token so the test
 * never has to authenticate as another human — it only needs a credential that
 * maps to their uid, which is exactly what the endpoint would have produced.
 */
async function issueToken(uid, label) {
  const raw = 'stk_' + randomBytes(32).toString('base64url')
  const id = createHash('sha256').update(raw, 'utf8').digest('hex')
  await db.collection('mcpTokens').doc(id).set({
    userId: uid,
    label,
    createdAt: new Date().toISOString(),
    lastUsedAt: null,
    revokedAt: null,
  })
  return { raw, id }
}

async function connect(token) {
  const client = new Client({ name: 'isolation-test', version: '0.0.0' })
  await client.connect(
    new StreamableHTTPClientTransport(MCP_URL, {
      requestInit: { headers: { Authorization: `Bearer ${token}` } },
    })
  )
  return client
}

const call = async (client, name, args = {}) => {
  const res = await client.callTool({ name, arguments: args })
  const text = res.content?.[0]?.text ?? ''
  return { isError: !!res.isError, text, json: (() => { try { return JSON.parse(text) } catch { return null } })() }
}

const a = await issueToken(USER_A.uid, 'isolation-test-A')
const b = await issueToken(USER_B.uid, 'isolation-test-B')

try {
  // --- Identity is per token, not baked into the server -------------------
  const clientA = await connect(a.raw)
  const clientB = await connect(b.raw)

  const { tools } = await clientA.listTools()
  check('tools served over HTTP', tools.length === 10, `${tools.length} tools`)

  const wsA = (await call(clientA, 'list_workspaces')).json ?? []
  const wsB = (await call(clientB, 'list_workspaces')).json ?? []
  console.log(`   A (${USER_A.name}): ${wsA.map((w) => w.name).join(', ') || '(none)'}`)
  console.log(`   B (${USER_B.name}): ${wsB.map((w) => w.name).join(', ') || '(none)'}`)

  check('two tokens see different workspaces', JSON.stringify(wsA) !== JSON.stringify(wsB))
  check('A sees A-only workspaces', wsA.length > 0)
  check('B sees B-only workspaces', wsB.length > 0)

  const idsA = new Set(wsA.map((w) => w.id))
  const idsB = new Set(wsB.map((w) => w.id))
  const overlap = [...idsA].filter((id) => idsB.has(id))
  check('no workspace visible to both', overlap.length === 0, overlap.join(',') || 'disjoint')

  // --- A cannot reach into B's data, even naming the id directly ----------
  if (wsB[0]) {
    const readAttempt = await call(clientA, 'list_projects', { workspaceId: wsB[0].id })
    check("A cannot list B's projects", readAttempt.isError, readAttempt.text.slice(0, 70))

    const writeAttempt = await call(clientA, 'create_task', {
      workspaceId: wsB[0].id,
      title: 'ISOLATION BREACH — should never be created',
    })
    check("A cannot write into B's workspace", writeAttempt.isError, writeAttempt.text.slice(0, 70))

    const leaked = await db
      .collection('tasks')
      .where('title', '==', 'ISOLATION BREACH — should never be created')
      .get()
    check('nothing was actually written', leaked.empty, `${leaked.size} found`)
  }

  // --- Revocation takes effect ------------------------------------------
  await db.collection('mcpTokens').doc(a.id).update({ revokedAt: new Date().toISOString() })
  let revokedRejected = false
  try {
    const after = await connect(a.raw)
    const res = await call(after, 'list_workspaces')
    revokedRejected = res.isError
  } catch {
    revokedRejected = true // transport refused to connect at all
  }
  check('revoked token stops working', revokedRejected)

  await clientA.close().catch(() => {})
  await clientB.close().catch(() => {})
} finally {
  await db.collection('mcpTokens').doc(a.id).delete().catch(() => {})
  await db.collection('mcpTokens').doc(b.id).delete().catch(() => {})
  console.log('\ncleaned up test tokens')
}

console.log(failures === 0 ? 'ALL PASSED' : `${failures} FAILURE(S)`)
process.exit(failures === 0 ? 0 : 1)
