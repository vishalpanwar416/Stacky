/**
 * End-to-end test of the token lifecycle a real user goes through:
 * mint via /api/mcp-token, use it against /api/mcp, then revoke it.
 *
 *   node scripts/token-flow.mjs [baseUrl]
 */
import { readFileSync } from 'node:fs'

import { cert, initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'

const BASE = process.argv[2] ?? 'http://localhost:5176'
const UID = 'gG3YSXzLDJY5i6KSd8xVLFIxGv33'

let failures = 0
const check = (label, cond, detail = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`)
  if (!cond) failures++
}

// Stand in for the signed-in web app: obtain a Firebase ID token for the user.
const key = JSON.parse(readFileSync(new URL('../serviceAccountKey.json', import.meta.url), 'utf8'))
const app = initializeApp({ credential: cert(key) }, 'token-flow')
const customToken = await getAuth(app).createCustomToken(UID)

const webKey = readFileSync(new URL('../../.env', import.meta.url), 'utf8')
  .split('\n')
  .find((l) => l.startsWith('VITE_FIREBASE_API_KEY='))
  .split('=')[1]
  .replace(/"/g, '')
  .trim()

const signIn = await fetch(
  `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${webKey}`,
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Referer: 'https://stackyy.vercel.app/' },
    body: JSON.stringify({ token: customToken, returnSecureToken: true }),
  }
).then((r) => r.json())
check('obtained a Firebase session', Boolean(signIn.idToken), signIn.error?.message ?? '')
const idToken = signIn.idToken

const api = (init) =>
  fetch(`${BASE}/api/mcp-token`, {
    ...init,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
  }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }))

// --- mint ---------------------------------------------------------------
const created = await api({ method: 'POST', body: JSON.stringify({ label: 'flow-test' }) })
check('POST mints a token', created.status === 201 && !!created.body.token, created.body.error ?? '')
const raw = created.body.token
check('token is prefixed and long enough', /^stk_[\w-]{40,}$/.test(raw ?? ''), created.body.hint ?? '')

// --- list (must never include the secret) --------------------------------
const listed = await api({ method: 'GET' })
const mine = listed.body.tokens ?? []
check('GET lists it', mine.some((t) => t.label === 'flow-test'), `${mine.length} token(s)`)
check('list never returns the token value', !JSON.stringify(mine).includes(raw))

// --- use it as an MCP client --------------------------------------------
async function tryMcp(token) {
  const client = new Client({ name: 'flow-test', version: '0.0.0' })
  try {
    await client.connect(
      new StreamableHTTPClientTransport(new URL('/api/mcp', BASE), {
        requestInit: { headers: { Authorization: `Bearer ${token}` } },
      })
    )
    const res = await client.callTool({ name: 'list_workspaces', arguments: {} })
    await client.close().catch(() => {})
    return { ok: !res.isError, text: res.content?.[0]?.text ?? '' }
  } catch (err) {
    return { ok: false, text: String(err).slice(0, 80) }
  }
}

const used = await tryMcp(raw)
const workspaces = used.ok ? JSON.parse(used.text) : []
check('minted token works against /api/mcp', used.ok, workspaces.map?.((w) => w.name).join(', ') ?? used.text)

// --- revoke --------------------------------------------------------------
const id = mine.find((t) => t.label === 'flow-test')?.id
const revoked = await api({ method: 'DELETE', body: JSON.stringify({ id }) })
check('DELETE revokes it', revoked.status === 200 && revoked.body.revoked === true)

const afterRevoke = await tryMcp(raw)
check('revoked token no longer works', !afterRevoke.ok, afterRevoke.text.slice(0, 60))

console.log(failures === 0 ? '\nALL PASSED' : `\n${failures} FAILURE(S)`)
process.exit(failures === 0 ? 0 : 1)
