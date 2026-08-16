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

const WEBHOOK_URL = `${process.env.APP_URL ?? 'https://stackyy.vercel.app'}/api/github-webhook`

/**
 * Creates the delivery hook on the repository, if the stored GitHub token
 * allows it. Best-effort and idempotent: an existing hook pointing at the same
 * URL is left alone, and any failure is reported rather than thrown, so the
 * link still succeeds and can be completed by hand.
 */
async function ensureWebhook(uid: string, repo: string): Promise<{ webhook: string }> {
  const secret = process.env.GITHUB_WEBHOOK_SECRET
  if (!secret) return { webhook: 'not configured on this deployment' }

  const stored = await db.collection('githubTokens').doc(uid).get()
  if (!stored.exists) return { webhook: 'no GitHub connection — add the webhook manually' }
  const token = stored.data()!.accessToken

  const gh = (path: string, init: RequestInit = {}) =>
    fetch(`https://api.github.com/repos/${repo}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
      },
    })

  try {
    const existing = await gh('/hooks')
    if (existing.ok) {
      const hooks = (await existing.json()) as any[]
      if (hooks.some((h) => h.config?.url === WEBHOOK_URL)) return { webhook: 'already registered' }
    } else if (existing.status === 404 || existing.status === 403) {
      return { webhook: 'no permission to manage hooks on that repository' }
    }

    const created = await gh('/hooks', {
      method: 'POST',
      body: JSON.stringify({
        name: 'web',
        active: true,
        events: ['push', 'pull_request'],
        config: { url: WEBHOOK_URL, content_type: 'json', secret },
      }),
    })
    if (created.ok) return { webhook: 'registered' }
    const detail = (await created.json().catch(() => ({}))) as { message?: string }
    return { webhook: detail.message ?? `GitHub returned ${created.status}` }
  } catch (err) {
    console.error('ensureWebhook failed', err)
    return { webhook: 'could not reach GitHub' }
  }
}

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

    // Register the webhook too, if we hold a token that can. Linking without it
    // looks connected but delivers nothing, which is the worst of both.
    const hook = await ensureWebhook(uid, repo)
    return res.status(200).json({ ok: true, repo, linked: true, ...hook })
  } catch (err) {
    console.error('repo-link failed', err)
    return res.status(500).json({ error: 'Could not update the repository link.' })
  }
}
