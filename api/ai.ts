import { getApps, initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'

/**
 * POST /api/ai — analyses a workspace's tasks and returns a focus summary plus
 * priority suggestions.
 *
 * This route exists because Stacky is a static SPA: the OpenRouter key must
 * never reach the browser bundle, so the model call happens here instead.
 *
 * Two things guard the key:
 *   1. A Firebase ID token is required, so only signed-in Stacky users can
 *      spend it — an open proxy in front of an uncapped key would be drained.
 *   2. The payload is bounded (MAX_TASKS, trimmed descriptions), so a single
 *      caller can't run up an unbounded bill on one request.
 *
 * The route is read-only by design. It returns suggestions; the client applies
 * them through the normal Firestore path, where security rules still apply.
 */

const MODEL = 'deepseek/deepseek-v4-flash'
const MAX_TASKS = 200
const MAX_DESCRIPTION = 280
/**
 * Hard ceiling on output tokens per call. DeepSeek is a reasoning model, so
 * its thinking counts toward completion tokens and is the part that could run
 * away on a large workspace. At $0.28/M output this caps a single analysis at
 * roughly a tenth of a cent, whatever the model decides to do.
 */
const MAX_OUTPUT_TOKENS = 4000

// Verifying an ID token needs only the project ID — the Admin SDK fetches
// Google's public signing certs itself. No service account key lives here.
if (!getApps().length) initializeApp({ projectId: 'stacky-f7f42' })

interface IncomingTask {
  id: string
  title: string
  status: string
  priority: string
  tags?: string[]
  description?: string
  dueDate?: string | null
  projectName?: string | null
  blockedByTaskId?: string | null
  blockedReason?: string | null
  estimatedMinutes?: number | null
}

const SYSTEM_PROMPT = `You are the planning assistant inside Stacky, a task tracker.
You are given the open tasks in one workspace. Decide what the person should work on next, and flag priorities that look wrong.

Stacky's fields:
- status: backlog | planned | in_progress | blocked | done
- priority: P0 (drop everything) | P1 (this week) | P2 (normal) | P3 (whenever)
- tags: free-form; "bug" and "ticket" are used to classify work

How to judge urgency, in order:
1. Blockers. A task that other tasks are waiting on outranks its nominal priority.
2. Overdue, then due today, then due this week.
3. Work already in progress — finishing beats starting.
4. Age. A P0 or P1 sitting untouched in the backlog is a real signal.
5. Bugs affecting existing users generally outrank new features at equal priority.

Rules for suggestions:
- Only suggest a priority change when you can name a concrete reason from the data. Never suggest a change just to have one.
- Reasons must reference specifics — a due date, a blocking relationship, a tag. Never say "seems important".
- Confidence is "high" only when the data plainly supports it (overdue, or explicitly blocking another task).
- If the priorities look right, return an empty suggestions array. That is a good answer.
- Never invent a task id. Use only ids that appear in the input.

Write the summary for someone opening their dashboard in the morning: what state things are in, and what to do first. Two or three sentences, plain and direct. No preamble, no bullet points, no headings.`

const RESPONSE_SCHEMA = {
  name: 'stacky_analysis',
  strict: true,
  schema: {
    type: 'object',
    properties: {
      headline: {
        type: 'string',
        description: 'One short line naming the single most important thing right now.',
      },
      summary: {
        type: 'string',
        description: 'Two or three sentences on the current state and what to do first.',
      },
      focusTaskIds: {
        type: 'array',
        description: 'Up to 3 task ids to work on first, most important first.',
        items: { type: 'string' },
      },
      suggestions: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            taskId: { type: 'string' },
            suggestedPriority: { type: 'string', enum: ['P0', 'P1', 'P2', 'P3'] },
            confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
            reason: {
              type: 'string',
              description: 'One sentence citing the specific evidence for the change.',
            },
          },
          required: ['taskId', 'suggestedPriority', 'confidence', 'reason'],
          additionalProperties: false,
        },
      },
    },
    required: ['headline', 'summary', 'focusTaskIds', 'suggestions'],
    additionalProperties: false,
  },
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Use POST.' })
  }

  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) {
    return res.status(500).json({ error: 'OPENROUTER_API_KEY is not configured on the server.' })
  }

  // 1. Authenticate. Without this the route is an open, uncapped spend endpoint.
  const header: string = req.headers.authorization ?? ''
  const idToken = header.startsWith('Bearer ') ? header.slice(7) : ''
  if (!idToken) {
    return res.status(401).json({ error: 'Missing Firebase ID token.' })
  }
  try {
    await getAuth().verifyIdToken(idToken)
  } catch {
    return res.status(401).json({ error: 'Invalid or expired session. Sign in again.' })
  }

  // 2. Bound the payload so one request can't run up an unbounded bill.
  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body ?? {})
  const rawTasks: IncomingTask[] = Array.isArray(body.tasks) ? body.tasks : []
  if (rawTasks.length === 0) {
    return res.status(400).json({ error: 'No tasks supplied.' })
  }
  const tasks = rawTasks.slice(0, MAX_TASKS).map((t) => ({
    id: String(t.id),
    title: String(t.title ?? '').slice(0, 200),
    status: t.status,
    priority: t.priority,
    tags: t.tags?.slice(0, 10) ?? [],
    description: t.description ? String(t.description).slice(0, MAX_DESCRIPTION) : undefined,
    dueDate: t.dueDate ?? undefined,
    project: t.projectName ?? undefined,
    blockedBy: t.blockedByTaskId ?? undefined,
    blockedReason: t.blockedReason ?? undefined,
    estimatedMinutes: t.estimatedMinutes ?? undefined,
  }))

  const today = new Date().toISOString().slice(0, 10)
  const userPrompt = `Today is ${today}.\n\nOpen tasks in this workspace:\n${JSON.stringify(tasks, null, 1)}`

  try {
    const upstream = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        // OpenRouter attributes usage in its dashboard by these.
        'HTTP-Referer': 'https://stackyy.vercel.app',
        'X-Title': 'Stacky',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_OUTPUT_TOKENS,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
        response_format: { type: 'json_schema', json_schema: RESPONSE_SCHEMA },
      }),
    })

    if (!upstream.ok) {
      const detail = await upstream.text()
      console.error('OpenRouter error', upstream.status, detail.slice(0, 500))
      return res.status(502).json({ error: `The model provider returned ${upstream.status}.` })
    }

    const payload = (await upstream.json()) as any
    const content = payload?.choices?.[0]?.message?.content
    if (!content) {
      return res.status(502).json({ error: 'The model returned an empty response.' })
    }

    let analysis: any
    try {
      analysis = JSON.parse(content)
    } catch {
      console.error('Unparseable model content', String(content).slice(0, 500))
      return res.status(502).json({ error: 'The model returned malformed JSON.' })
    }

    // Drop any suggestion naming a task that wasn't in the input, or that
    // doesn't actually change anything — a hallucinated id would otherwise
    // become an Apply button that writes to the wrong document.
    const byId = new Map(tasks.map((t) => [t.id, t]))
    const suggestions = (analysis.suggestions ?? [])
      .filter((s: any) => {
        const task = byId.get(s?.taskId)
        return task && s.suggestedPriority && s.suggestedPriority !== task.priority
      })
      .map((s: any) => ({
        taskId: s.taskId,
        title: byId.get(s.taskId)!.title,
        currentPriority: byId.get(s.taskId)!.priority,
        suggestedPriority: s.suggestedPriority,
        confidence: s.confidence ?? 'low',
        reason: String(s.reason ?? '').slice(0, 400),
      }))

    return res.status(200).json({
      headline: String(analysis.headline ?? '').slice(0, 200),
      summary: String(analysis.summary ?? '').slice(0, 1200),
      focusTaskIds: (analysis.focusTaskIds ?? []).filter((id: string) => byId.has(id)).slice(0, 3),
      suggestions,
      model: MODEL,
      analysedCount: tasks.length,
      generatedAt: new Date().toISOString(),
    })
  } catch (err) {
    console.error('AI route failed', err)
    return res.status(500).json({ error: 'Analysis failed. Try again in a moment.' })
  }
}
