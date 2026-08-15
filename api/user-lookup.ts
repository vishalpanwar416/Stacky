import { getApps, initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'

import { db } from '../mcp/src/firestore.js'
import { readBearer } from './_lib/mcpAuth.js'

/**
 * POST /api/user-lookup — does this email already have a Stacky account?
 *
 * This exists so the `users` collection can be locked to its owner. Inviting
 * someone needs to know whether they already have an account, which the client
 * previously answered by querying every user document — and Firestore rules are
 * per-document, so allowing that query meant allowing any profile to be read.
 *
 * The answer is deliberately minimal: a user id or null. No name, no photo, no
 * preferences. It reveals only what an inviter can already infer by sending an
 * invitation and seeing whether it is accepted, and only to signed-in callers.
 */

if (!getApps().some((a) => a.name === 'user-lookup')) {
  initializeApp({ projectId: 'stacky-f7f42' }, 'user-lookup')
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST.' })

  const idToken = readBearer(req.headers.authorization)
  if (!idToken) return res.status(401).json({ error: 'Sign in first.' })
  try {
    const app = getApps().find((a) => a.name === 'user-lookup')!
    await getAuth(app).verifyIdToken(idToken)
  } catch {
    return res.status(401).json({ error: 'Invalid or expired session.' })
  }

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body ?? {})
  const email = String(body.email ?? '').trim().toLowerCase()
  if (!email || !email.includes('@')) {
    return res.status(400).json({ error: 'A valid email is required.' })
  }

  try {
    const snap = await db.collection('users').where('email', '==', email).limit(1).get()
    return res.status(200).json({ userId: snap.empty ? null : snap.docs[0].id })
  } catch (err) {
    console.error('user-lookup failed', err)
    return res.status(500).json({ error: 'Lookup failed.' })
  }
}
