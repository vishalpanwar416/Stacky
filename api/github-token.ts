import { getApps, initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'

import { db, FieldValue } from '../mcp/src/firestore.js'
import { readBearer } from './_lib/mcpAuth.js'

/**
 * POST /api/github-token — keep the GitHub OAuth token issued at sign-in.
 * DELETE /api/github-token — forget it.
 *
 * Firebase hands the provider's access token back once, at the moment of
 * sign-in, and does not store it. Holding it server-side is what lets Stacky
 * list your repositories and register the webhook for you instead of asking
 * you to paste a name and configure a hook by hand.
 *
 * Server-only collection: this token can read code and manage hooks, so it is
 * never exposed to the client again after it is handed over.
 */

if (!getApps().some((a) => a.name === 'github-token')) {
  initializeApp({ projectId: 'stacky-f7f42' }, 'github-token')
}

export default async function handler(req: any, res: any) {
  if (!['POST', 'DELETE'].includes(req.method)) {
    return res.status(405).json({ error: 'Use POST or DELETE.' })
  }

  const idToken = readBearer(req.headers.authorization)
  if (!idToken) return res.status(401).json({ error: 'Sign in first.' })
  let uid: string
  try {
    const app = getApps().find((a) => a.name === 'github-token')!
    uid = (await getAuth(app).verifyIdToken(idToken)).uid
  } catch {
    return res.status(401).json({ error: 'Invalid or expired session.' })
  }

  const ref = db.collection('githubTokens').doc(uid)

  if (req.method === 'DELETE') {
    await ref.delete()
    return res.status(200).json({ ok: true })
  }

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body ?? {})
  const accessToken = String(body.accessToken ?? '').trim()
  if (!accessToken) return res.status(400).json({ error: 'accessToken is required.' })

  // Confirm it works, and record who it belongs to, before storing it.
  const who = await fetch('https://api.github.com/user', {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/vnd.github+json' },
  })
  if (!who.ok) return res.status(400).json({ error: 'GitHub rejected that token.' })
  const login = ((await who.json()) as { login?: string }).login ?? null

  await ref.set({ accessToken, login, updatedAt: FieldValue.serverTimestamp() })
  return res.status(200).json({ ok: true, login })
}
