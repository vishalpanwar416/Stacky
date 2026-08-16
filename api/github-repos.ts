import { getApps, initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'

import { db } from '../mcp/src/firestore.js'
import { readBearer } from './_lib/mcpAuth.js'

/**
 * GET /api/github-repos — the repositories this person can pick from.
 *
 * Returns only what the chooser needs. The stored token stays on the server;
 * handing it to the browser to call GitHub directly would expose a credential
 * that can read code and manage hooks.
 */

if (!getApps().some((a) => a.name === 'github-repos')) {
  initializeApp({ projectId: 'stacky-f7f42' }, 'github-repos')
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Use GET.' })

  const idToken = readBearer(req.headers.authorization)
  if (!idToken) return res.status(401).json({ error: 'Sign in first.' })
  let uid: string
  try {
    const app = getApps().find((a) => a.name === 'github-repos')!
    uid = (await getAuth(app).verifyIdToken(idToken)).uid
  } catch {
    return res.status(401).json({ error: 'Invalid or expired session.' })
  }

  const stored = await db.collection('githubTokens').doc(uid).get()
  if (!stored.exists) {
    return res.status(200).json({ connected: false, repos: [] })
  }

  try {
    // Most recently pushed first — the repository someone wants to connect is
    // almost always one they are working in.
    const upstream = await fetch(
      'https://api.github.com/user/repos?per_page=100&sort=pushed&affiliation=owner,collaborator,organization_member',
      {
        headers: {
          Authorization: `Bearer ${stored.data()!.accessToken}`,
          Accept: 'application/vnd.github+json',
        },
      }
    )
    if (upstream.status === 401) {
      return res.status(200).json({ connected: false, repos: [], error: 'GitHub access expired. Reconnect GitHub in settings.' })
    }
    if (!upstream.ok) {
      return res.status(200).json({ connected: true, repos: [], error: `GitHub returned ${upstream.status}.` })
    }

    const repos = ((await upstream.json()) as any[]).map((r) => ({
      fullName: r.full_name,
      private: !!r.private,
      // Whether Stacky can register the webhook itself.
      canAdmin: !!r.permissions?.admin,
      pushedAt: r.pushed_at ?? null,
    }))

    return res.status(200).json({ connected: true, login: stored.data()!.login ?? null, repos })
  } catch (err) {
    console.error('github-repos failed', err)
    return res.status(500).json({ error: 'Could not reach GitHub.' })
  }
}
