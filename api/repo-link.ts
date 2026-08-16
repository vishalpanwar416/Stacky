import { getApps, initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'

import { db, FieldValue } from '../mcp/src/firestore.js'
import { readBearer } from './_lib/mcpAuth.js'

/**
 * POST /api/repo-link — connect a GitHub repository to a workspace.
 * DELETE /api/repo-link — disconnect it.
 *
 * The webhook needs to know which workspace a repository's work is tracked in,
 * and it arrives with no user attached, so the mapping is stored under the
 * repository's full name. Owner-only: linking decides whose AI budget the
 * webhook spends, so it is not a decision an ordinary member should make.
 */

if (!getApps().some((a) => a.name === 'repo-link')) {
  initializeApp({ projectId: 'stacky-f7f42' }, 'repo-link')
}

const docId = (repo: string) => repo.replace('/', '__')

export default async function handler(req: any, res: any) {
  if (!['POST', 'DELETE'].includes(req.method)) {
    return res.status(405).json({ error: 'Use POST or DELETE.' })
  }

  const idToken = readBearer(req.headers.authorization)
  if (!idToken) return res.status(401).json({ error: 'Sign in first.' })
  let uid: string
  try {
    const app = getApps().find((a) => a.name === 'repo-link')!
    uid = (await getAuth(app).verifyIdToken(idToken)).uid
  } catch {
    return res.status(401).json({ error: 'Invalid or expired session.' })
  }

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body ?? {})
  const workspaceId = String(body.workspaceId ?? '').trim()
  const repo = String(body.repo ?? '').trim().toLowerCase()
  if (!workspaceId) return res.status(400).json({ error: 'workspaceId is required.' })
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) {
    return res.status(400).json({ error: 'Use the owner/repository form, e.g. vishalpanwar416/Stacky.' })
  }

  try {
    const ws = await db.collection('workspaces').doc(workspaceId).get()
    if (!ws.exists) return res.status(404).json({ error: 'That workspace no longer exists.' })
    if (ws.data()!.ownerId !== uid) {
      return res.status(403).json({ error: 'Only the workspace owner can connect a repository.' })
    }

    const ref = db.collection('repoLinks').doc(docId(repo))

    if (req.method === 'DELETE') {
      const existing = await ref.get()
      if (existing.exists && existing.data()!.workspaceId !== workspaceId) {
        return res.status(403).json({ error: 'That repository is linked to a different workspace.' })
      }
      await ref.delete()
      return res.status(200).json({ ok: true, repo, linked: false })
    }

    const existing = await ref.get()
    if (existing.exists && existing.data()!.workspaceId !== workspaceId) {
      return res.status(409).json({ error: 'That repository is already linked to another workspace.' })
    }

    await ref.set({
      repo,
      workspaceId,
      // Whose AI budget the webhook spends.
      linkedBy: uid,
      linkedAt: FieldValue.serverTimestamp(),
    })
    return res.status(200).json({ ok: true, repo, linked: true })
  } catch (err) {
    console.error('repo-link failed', err)
    return res.status(500).json({ error: 'Could not update the repository link.' })
  }
}
