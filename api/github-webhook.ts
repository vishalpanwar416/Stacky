import { createHmac, timingSafeEqual } from 'node:crypto'

import { db, FieldValue } from '../mcp/src/firestore.js'
import { checkBudget, recordSpend } from './_lib/aiBudget.js'
import { askModel } from './_lib/model.js'

/**
 * POST /api/github-webhook — read a push or pull request and suggest task moves.
 *
 * The model is asked which open tasks the change relates to and what status
 * they should move to. It only ever writes a *suggestion*: nothing on the board
 * changes until someone approves it, matching how priority suggestions already
 * work. Code that looks like it closes a task often does not, and a tracker
 * that silently marks work done is worse than one that never noticed.
 *
 * Matching is semantic rather than key-based. Requiring "STK-42" in every
 * commit message would be more precise, but only for people who remember to
 * type it — and Stacky tasks have Firestore ids nobody would.
 */

const MAX_TASKS = 120
const MAX_TITLE = 160
const MAX_BODY = 600
const MAX_COMMITS = 20

interface Change {
  kind: 'push' | 'pull_request'
  title: string
  body: string
  branch: string
  author: string
  url: string
  merged: boolean
  files: string[]
}

function verifySignature(raw: string, signature: string, secret: string): boolean {
  const expected = `sha256=${createHmac('sha256', secret).update(raw).digest('hex')}`
  const a = Buffer.from(expected)
  const b = Buffer.from(signature)
  // Length must match before timingSafeEqual, which throws on a mismatch.
  return a.length === b.length && timingSafeEqual(a, b)
}

const clip = (value: unknown, max: number) => String(value ?? '').slice(0, max)

/** Reduces a webhook body to the few things worth sending to a model. */
function describe(event: string, payload: any): Change | null {
  if (event === 'push') {
    const commits = (payload.commits ?? []).slice(0, MAX_COMMITS)
    if (commits.length === 0) return null
    return {
      kind: 'push',
      title: clip(commits[0]?.message?.split('\n')[0], MAX_TITLE),
      body: commits.map((c: any) => `- ${clip(c.message, 200)}`).join('\n').slice(0, MAX_BODY),
      branch: clip(payload.ref, 120).replace('refs/heads/', ''),
      author: clip(payload.pusher?.name ?? payload.sender?.login, 80),
      url: clip(payload.compare, 300),
      merged: false,
      files: [
        ...new Set(commits.flatMap((c: any) => [...(c.added ?? []), ...(c.modified ?? [])])),
      ].slice(0, 40) as string[],
    }
  }

  if (event === 'pull_request') {
    const pr = payload.pull_request
    if (!pr) return null
    // Only the moments that carry information: raised, or landed.
    const action = payload.action
    if (!['opened', 'reopened', 'ready_for_review', 'closed'].includes(action)) return null
    return {
      kind: 'pull_request',
      title: clip(pr.title, MAX_TITLE),
      body: clip(pr.body, MAX_BODY),
      branch: clip(pr.head?.ref, 120),
      author: clip(pr.user?.login, 80),
      url: clip(pr.html_url, 300),
      merged: action === 'closed' && !!pr.merged,
      files: [],
    }
  }

  return null
}

const SCHEMA = {
  name: 'task_suggestions',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['matches'],
    properties: {
      matches: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['taskId', 'suggestedStatus', 'confidence', 'reason'],
          properties: {
            taskId: { type: 'string' },
            suggestedStatus: {
              type: 'string',
              enum: ['in_progress', 'done', 'blocked'],
            },
            confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
            reason: {
              type: 'string',
              description: 'One sentence, naming the specific evidence in the change.',
            },
          },
        },
      },
    },
  },
}

const SYSTEM = `You connect code changes to tasks on a board.

You are given one change (a push or a pull request) and a list of open tasks.
Return only tasks the change plainly relates to. An empty list is the correct
and common answer — most commits touch no tracked task.

Rules:
- Match on substance, not vocabulary. A shared word is not a match.
- A merged pull request that implements a task means 'done'.
- An open pull request, or commits on a branch, mean 'in_progress'.
- Never suggest 'done' for an unmerged change.
- Use 'high' confidence only when the change explicitly names the task's subject.
- The reason must cite the actual evidence — a file, a branch name, a phrase
  from the commit. Never restate the task title back.`

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST.' })

  const secret = process.env.GITHUB_WEBHOOK_SECRET
  if (!secret) return res.status(500).json({ error: 'Webhook secret is not configured.' })

  // Vercel parses JSON bodies, but the signature covers the exact bytes GitHub
  // sent — so it has to be recomputed from a stable re-serialisation.
  const raw = typeof req.body === 'string' ? req.body : JSON.stringify(req.body)
  const signature = String(req.headers['x-hub-signature-256'] ?? '')
  if (!signature || !verifySignature(raw, signature, secret)) {
    return res.status(401).json({ error: 'Bad signature.' })
  }

  const event = String(req.headers['x-github-event'] ?? '')
  if (event === 'ping') return res.status(200).json({ ok: true, pong: true })

  const payload = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body ?? {})
  // Lowercased to match how repo-link stores it: GitHub preserves the
  // owner's chosen casing in full_name, so a verbatim lookup misses.
  const repo: string = (payload.repository?.full_name ?? '').toLowerCase()
  if (!repo) return res.status(400).json({ error: 'No repository in payload.' })

  try {
    // Which workspace is this repository's work tracked in?
    const link = await db.collection('repoLinks').doc(repo.replace('/', '__')).get()
    if (!link.exists) {
      return res.status(200).json({ ok: true, skipped: 'repository is not linked to a workspace' })
    }
    const { workspaceId, projectId, linkedBy } = link.data() as {
      workspaceId: string
      projectId?: string
      linkedBy: string
    }

    const change = describe(event, payload)
    if (!change) return res.status(200).json({ ok: true, skipped: 'nothing actionable in this event' })

    const apiKey = process.env.OPENROUTER_API_KEY
    if (!apiKey) return res.status(500).json({ error: 'OPENROUTER_API_KEY is not configured.' })

    // Spend is charged to whoever linked the repository — the webhook has no
    // caller of its own, and an uncharged path would sit outside the cap.
    const budget = await checkBudget(linkedBy)
    if (!budget.allowed) {
      return res.status(200).json({ ok: true, skipped: 'AI budget reached' })
    }

    // A repository maps to one project, so only that project's tasks are
    // candidates — a change in one repository should not be matched against
    // unrelated work elsewhere in the workspace.
    //
    // Filtered on projectId alone and narrowed in memory: adding status to the
    // query would need a composite index for a set this small.
    const snap = projectId
      ? await db.collection('tasks').where('projectId', '==', projectId).limit(500).get()
      : await db.collection('tasks').where('workspaceId', '==', workspaceId).limit(500).get()

    const open = snap.docs.filter((d) =>
      ['backlog', 'planned', 'in_progress', 'blocked'].includes(d.data().status)
    )
    if (open.length === 0) return res.status(200).json({ ok: true, skipped: 'no open tasks' })

    const tasks = open.slice(0, MAX_TASKS).map((d) => ({
      id: d.id,
      title: clip(d.data().title, MAX_TITLE),
      status: d.data().status,
      description: clip(d.data().description, 200),
    }))

    const userPrompt = [
      `Change type: ${change.kind}${change.merged ? ' (merged)' : ''}`,
      `Branch: ${change.branch}`,
      `Title: ${change.title}`,
      change.body ? `Details:\n${change.body}` : '',
      change.files.length ? `Files touched: ${change.files.join(', ')}` : '',
      '',
      'Open tasks:',
      JSON.stringify(tasks),
    ]
      .filter(Boolean)
      .join('\n')

    const { result, costUsd } = await askModel(apiKey, SYSTEM, userPrompt, SCHEMA)
    await recordSpend(linkedBy, costUsd)

    const valid = new Set(tasks.map((t) => t.id))
    const matches = (result?.matches ?? [])
      // A task id that was not in the candidate list is a hallucination.
      .filter((m: any) => valid.has(m.taskId))
      // Unmerged work is not done, however finished the commit message sounds.
      // This used to drop such matches, which threw away a correct match
      // because its status was wrong — the relationship to the task is the
      // valuable part, so correct the status and keep it.
      .map((m: any) =>
        m.suggestedStatus === 'done' && !change.merged
          ? { ...m, suggestedStatus: 'in_progress', reason: `${m.reason} (not merged yet)` }
          : m
      )

    if (matches.length === 0) {
      return res.status(200).json({ ok: true, matched: 0 })
    }

    const batch = db.batch()
    for (const m of matches) {
      const task = tasks.find((t) => t.id === m.taskId)!
      batch.set(db.collection('gitSuggestions').doc(), {
        workspaceId,
        projectId: projectId ?? null,
        taskId: m.taskId,
        taskTitle: task.title,
        currentStatus: task.status,
        suggestedStatus: m.suggestedStatus,
        confidence: m.confidence,
        reason: clip(m.reason, 300),
        source: {
          kind: change.kind,
          title: change.title,
          branch: change.branch,
          author: change.author,
          url: change.url,
          merged: change.merged,
        },
        status: 'pending',
        createdAt: FieldValue.serverTimestamp(),
      })
    }
    await batch.commit()

    return res.status(200).json({ ok: true, matched: matches.length })
  } catch (err) {
    console.error('github-webhook failed', err)
    // Never fail the delivery: GitHub retries and disables flapping webhooks,
    // and a suggestion is not worth that.
    return res.status(200).json({ ok: false, error: 'Could not process the event.' })
  }
}
