import { getApps, initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'

import { db } from '../mcp/src/firestore.js'
import {
  TOKENS,
  fingerprint,
  generateToken,
  readBearer,
  type TokenRecord,
} from './_lib/mcpAuth.js'

/**
 * Manage the caller's own MCP access tokens.
 *
 *   GET    → list this user's tokens (metadata only, never the token itself)
 *   POST   → mint a new token, returned in full exactly once
 *   DELETE → revoke one by id
 *
 * Authenticated with a Firebase ID token from the signed-in web app, so a user
 * can only ever mint or revoke tokens for themselves. Every query below is
 * filtered by the verified uid — the client never supplies a user id.
 */

const MAX_TOKENS_PER_USER = 10

if (!getApps().some((a) => a.name === 'token-auth')) {
  initializeApp({ projectId: 'stacky-f7f42' }, 'token-auth')
}

async function callerUid(req: any): Promise<string | null> {
  const idToken = readBearer(req.headers.authorization)
  if (!idToken) return null
  try {
    const app = getApps().find((a) => a.name === 'token-auth')!
    const decoded = await getAuth(app).verifyIdToken(idToken)
    return decoded.uid
  } catch {
    return null
  }
}

export default async function handler(req: any, res: any) {
  const uid = await callerUid(req)
  if (!uid) return res.status(401).json({ error: 'Sign in again to manage MCP tokens.' })

  try {
    if (req.method === 'GET') {
      const snap = await db.collection(TOKENS).where('userId', '==', uid).get()
      const tokens = snap.docs
        .map((d) => ({ id: d.id, ...(d.data() as TokenRecord) }))
        .filter((t) => !t.revokedAt)
        .map((t) => ({
          id: t.id,
          label: t.label,
          createdAt: t.createdAt,
          lastUsedAt: t.lastUsedAt,
        }))
      return res.status(200).json({ tokens })
    }

    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body ?? {})
      const existing = await db.collection(TOKENS).where('userId', '==', uid).get()
      const live = existing.docs.filter((d) => !(d.data() as TokenRecord).revokedAt)
      if (live.length >= MAX_TOKENS_PER_USER) {
        return res
          .status(429)
          .json({ error: `You already have ${MAX_TOKENS_PER_USER} tokens. Revoke one first.` })
      }

      const { raw, id } = generateToken()
      const record: TokenRecord = {
        userId: uid,
        label: String(body.label ?? 'MCP client').slice(0, 60),
        createdAt: new Date().toISOString(),
        lastUsedAt: null,
        revokedAt: null,
      }
      await db.collection(TOKENS).doc(id).set(record)

      // The only time the raw token ever leaves the server.
      return res.status(201).json({ id, token: raw, hint: fingerprint(raw), label: record.label })
    }

    if (req.method === 'DELETE') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body ?? {})
      const id = String(body.id ?? '')
      if (!id) return res.status(400).json({ error: 'Which token? Pass its id.' })

      const ref = db.collection(TOKENS).doc(id)
      const snap = await ref.get()
      // Ownership check before revoking — otherwise anyone signed in could
      // revoke anyone else's token by guessing an id.
      if (!snap.exists || (snap.data() as TokenRecord).userId !== uid) {
        return res.status(404).json({ error: 'No such token.' })
      }
      await ref.update({ revokedAt: new Date().toISOString() })
      return res.status(200).json({ id, revoked: true })
    }

    return res.status(405).json({ error: 'Use GET, POST or DELETE.' })
  } catch (err) {
    console.error('mcp-token failed', err)
    return res.status(500).json({ error: 'Could not manage tokens right now.' })
  }
}
