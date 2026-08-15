import { getApps, initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'

import { checkBudget, recordSpend } from './_lib/aiBudget.js'

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


/**
 * The overview read interprets aggregates, not a task list: the client has
 * already computed the trends, so this call reasons about a handful of numbers
 * rather than re-reading every task. It answers the question the charts raise
 * but never settle — is this good, and what changed?
 */
const OVERVIEW_PROMPT = `You read a workspace's delivery metrics and say what they mean.

You are given counts, a seven-day series of tasks completed and created, median cycle time, and tag/project rollups. Interpret them; do not restate them.

You may also be given "previous" — what you said at the last reading, with its timestamp. When it is present, report the *change*, because the reader has already seen that text:
- Say what moved since then and by how much. "The backlog grew by 3 more since 09:14" beats restating that the backlog is growing.
- If the numbers have genuinely not moved, say so in one short sentence and stop. Padding an unchanged reading with fresh adjectives wastes the reader's attention and hides real movement when it comes.
- Never contradict the previous reading without explaining what changed.

Judge:
1. Intake vs throughput. Created outpacing completed over the week means the backlog is growing — say so plainly.
2. Concentration. Work bunched in one project or tag is a risk if it stalls.
3. Overdue and blocked items outrank general progress.
4. Cycle time is a median. Do not describe it as an average.

Rules:
- Never invent a number. Use only what you are given, and only quote a figure when it carries the point.
- If a metric looks unremarkable, say things are steady. Manufactured concern is worse than silence.
- Each signal names something specific and actionable, not a restatement of a count.
- "good" means genuinely healthy, "watch" means worth an eye, "risk" means act now. Most weeks are watch or good.

Output shape, which matters as much as the content:
- headline: under 90 characters, one clause. It is a title, not a summary — never repeat the summary's wording, and never let it run long enough to be cut off.
- summary: two or three complete sentences.
- signals[].label: two to four words naming the thing observed — "Backlog growing", "Security work concentrated", "One item overdue". Never the tone word; "watch" and "risk" are not labels.
- signals[].detail: one complete sentence with the evidence.

Good signal → label: "Backlog growing", tone: "watch", detail: "18 tasks were created against 13 completed this week, so the queue grew by 5."
Bad signal → label: "watch", detail: "incoming above completion" — the label repeats the tone and the detail is a fragment.

Write for someone glancing at their dashboard. No headings, no bullets, no preamble.`

const OVERVIEW_SCHEMA = {
  name: 'stacky_overview',
  strict: true,
  schema: {
    type: 'object',
    properties: {
      headline: { type: 'string', description: 'A title under 90 characters. One clause, not a summary, and never a truncated sentence.' },
      change: {
        type: 'string',
        enum: ['first', 'improved', 'worse', 'unchanged'],
        description: 'Compared with the previous reading: "improved", "worse", or "unchanged" when nothing material moved. Use "first" ONLY when no previous reading was supplied.',
      },
      summary: { type: 'string', description: 'Two or three sentences interpreting the trend.' },
      signals: {
        type: 'array',
        description: 'Up to 3 specific observations. Empty is valid when nothing stands out.',
        items: {
          type: 'object',
          properties: {
            label: { type: 'string', description: 'Two to four words naming the observation, e.g. "Backlog growing". Never the tone word.' },
            tone: { type: 'string', enum: ['good', 'watch', 'risk'] },
            detail: { type: 'string', description: 'One sentence citing the evidence.' },
          },
          required: ['label', 'tone', 'detail'],
          additionalProperties: false,
        },
      },
    },
    required: ['headline', 'summary', 'signals'],
    additionalProperties: false,
  },
}


/**
 * Whether a reading is the first one is a fact the server knows — it either
 * sent a previous reading or it didn't. The model reported "first" on a
 * follow-up read, which would defeat the de-duplication downstream, so the
 * claim is corrected here rather than trusted.
 */
function normaliseChange(claimed: unknown, hadPrevious: boolean): string {
  const valid = ['first', 'improved', 'worse', 'unchanged']
  const value = valid.includes(claimed as string) ? (claimed as string) : 'unchanged'
  if (!hadPrevious) return 'first'
  return value === 'first' ? 'unchanged' : value
}

/** One place that talks to OpenRouter, so both modes share the token cap. */
async function askModel(
  apiKey: string,
  systemPrompt: string,
  userPrompt: string,
  schema: unknown
): Promise<any> {
  const upstream = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://stackyy.vercel.app',
      'X-Title': 'Stacky',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: MAX_OUTPUT_TOKENS,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      response_format: { type: 'json_schema', json_schema: schema },
    }),
  })
  if (!upstream.ok) {
    const detail = await upstream.text()
    console.error('OpenRouter error', upstream.status, detail.slice(0, 500))
    throw new Error(`The model provider returned ${upstream.status}.`)
  }
  const payload = (await upstream.json()) as any
  const content = payload?.choices?.[0]?.message?.content
  if (!content) throw new Error('The model returned an empty response.')
  // OpenRouter reports the real cost of the call; the ledger uses it rather
  // than estimating from token counts and a price table.
  return { result: JSON.parse(content), costUsd: Number(payload?.usage?.cost ?? 0) }
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
  let callerUid: string
  try {
    callerUid = (await getAuth().verifyIdToken(idToken)).uid
  } catch {
    return res.status(401).json({ error: 'Invalid or expired session. Sign in again.' })
  }

  // The key cannot cap itself upstream, so the ceiling is enforced here.
  const budget = await checkBudget(callerUid)
  if (!budget.allowed) {
    return res.status(429).json({ error: budget.reason })
  }

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body ?? {})

  // The overview read takes pre-computed aggregates, not a task list — the
  // client already derives these for the charts, so there is nothing to
  // recompute and the payload stays a few hundred tokens.
  if (body.mode === 'overview') {
    const metrics = body.metrics
    if (!metrics || typeof metrics !== 'object') {
      return res.status(400).json({ error: 'No metrics supplied.' })
    }
    try {
      const { result: analysis, costUsd } = await askModel(
        apiKey,
        OVERVIEW_PROMPT,
        `Today is ${new Date().toISOString().slice(0, 10)}.\n\n` +
          `${JSON.stringify(metrics, null, 1)}\n\n` +
          (body.previous ? `previous: ${JSON.stringify(body.previous, null, 1)}` : 'previous: none'),
        OVERVIEW_SCHEMA
      )
      await recordSpend(callerUid, costUsd)
      return res.status(200).json({
        headline: String(analysis.headline ?? '').slice(0, 200),
        change: normaliseChange(analysis.change, Boolean(body.previous)),
        summary: String(analysis.summary ?? '').slice(0, 1200),
        signals: (analysis.signals ?? []).slice(0, 3).map((sig: any) => ({
          label: String(sig.label ?? '').slice(0, 60),
          tone: ['good', 'watch', 'risk'].includes(sig.tone) ? sig.tone : 'watch',
          detail: String(sig.detail ?? '').slice(0, 300),
        })),
        model: MODEL,
        generatedAt: new Date().toISOString(),
      })
    } catch (err) {
      console.error('Overview read failed', err)
      return res.status(502).json({ error: (err as Error).message })
    }
  }

  // 2. Bound the payload so one request can't run up an unbounded bill.
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
    const { result: analysis, costUsd } = await askModel(
      apiKey,
      SYSTEM_PROMPT,
      userPrompt,
      RESPONSE_SCHEMA
    )
    await recordSpend(callerUid, costUsd)

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
