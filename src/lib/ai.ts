import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore'

import { getAuth, getDb } from './firebase'
import { updateTask } from './tasks'
import type { Project, Task, TaskPriority } from '../types'

/**
 * Client side of the AI focus panel.
 *
 * The analysis itself runs in /api/ai — the OpenRouter key is server-side only.
 * This module decides *when* to spend a call: results are cached per workspace
 * in Firestore under a fingerprint of the tasks that produced them, so opening
 * the dashboard repeatedly is free and the model only re-runs when the work
 * actually changed.
 */

const INSIGHTS = 'aiInsights'

export interface PrioritySuggestion {
  taskId: string
  title: string
  currentPriority: TaskPriority
  suggestedPriority: TaskPriority
  confidence: 'high' | 'medium' | 'low'
  reason: string
}

export interface AiAnalysis {
  headline: string
  summary: string
  focusTaskIds: string[]
  suggestions: PrioritySuggestion[]
  model: string
  analysedCount: number
  generatedAt: string
  /** Fingerprint of the tasks this analysis was computed from. */
  fingerprint: string
}

/** Tasks that are still actionable — done work is not worth spending tokens on. */
export function openTasks(tasks: Task[]): Task[] {
  return tasks.filter((t) => t.status !== 'done')
}

/**
 * Identifies the task state an analysis was based on. Only fields that could
 * change the advice are included, so cosmetic edits (a description typo, a
 * timer tick) don't burn a fresh call.
 */
export function fingerprintTasks(tasks: Task[]): string {
  const parts = openTasks(tasks)
    .map((t) =>
      [
        t.id,
        t.status,
        t.priority,
        t.blockedByTaskId ?? '',
        t.dueDate && typeof t.dueDate.toMillis === 'function' ? t.dueDate.toMillis() : '',
        (t.tags ?? []).join('|'),
      ].join(':')
    )
    .sort()
  // Date included so advice re-runs the next day — "due tomorrow" ages badly.
  return `${new Date().toISOString().slice(0, 10)}#${hash(parts.join(','))}`
}

/** djb2 — short, stable, and sufficient for cache invalidation. */
function hash(input: string): string {
  let h = 5381
  for (let i = 0; i < input.length; i++) h = ((h << 5) + h + input.charCodeAt(i)) | 0
  return (h >>> 0).toString(36)
}

export async function readCachedAnalysis(workspaceId: string): Promise<AiAnalysis | null> {
  const snap = await getDoc(doc(getDb(), INSIGHTS, workspaceId))
  return snap.exists() ? (snap.data() as AiAnalysis) : null
}

async function writeCachedAnalysis(workspaceId: string, analysis: AiAnalysis) {
  await setDoc(doc(getDb(), INSIGHTS, workspaceId), { ...analysis, cachedAt: serverTimestamp() })
}

/** Calls the serverless route. Throws with a message safe to show the user. */
async function requestAnalysis(tasks: Task[], projects: Project[]): Promise<Omit<AiAnalysis, 'fingerprint'>> {
  const user = getAuth().currentUser
  if (!user) throw new Error('You need to be signed in.')
  const token = await user.getIdToken()

  const projectNames = new Map(projects.map((p) => [p.id, p.name]))
  const payload = openTasks(tasks).map((t) => ({
    id: t.id,
    title: t.title,
    status: t.status,
    priority: t.priority,
    tags: t.tags ?? [],
    description: t.description,
    dueDate:
      t.dueDate && typeof t.dueDate.toDate === 'function'
        ? t.dueDate.toDate().toISOString().slice(0, 10)
        : null,
    projectName: t.projectId ? (projectNames.get(t.projectId) ?? null) : null,
    blockedByTaskId: t.blockedByTaskId ?? null,
    blockedReason: t.blockedReason ?? null,
    estimatedMinutes: t.estimatedMinutes ?? null,
  }))

  const res = await fetch('/api/ai', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ tasks: payload }),
  })

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? `Analysis failed (${res.status}).`)
  }
  return res.json()
}

/**
 * Returns the cached analysis when it still matches the current tasks, and
 * otherwise runs a fresh one. Pass `force` for the manual refresh button.
 */
export async function getAnalysis(
  workspaceId: string,
  tasks: Task[],
  projects: Project[],
  options: { force?: boolean } = {}
): Promise<AiAnalysis> {
  const fingerprint = fingerprintTasks(tasks)

  if (!options.force) {
    const cached = await readCachedAnalysis(workspaceId).catch(() => null)
    if (cached && cached.fingerprint === fingerprint) return cached
  }

  const fresh = await requestAnalysis(tasks, projects)
  const analysis: AiAnalysis = { ...fresh, fingerprint }
  // A cache write failure shouldn't lose the analysis the user just paid for.
  await writeCachedAnalysis(workspaceId, analysis).catch((err) =>
    console.warn('Could not cache AI analysis:', err)
  )
  return analysis
}

/** Applies one suggestion through the normal task path, so rules and activity logging still apply. */
export async function applySuggestion(suggestion: PrioritySuggestion, userId: string) {
  await updateTask(suggestion.taskId, { priority: suggestion.suggestedPriority }, userId)
}

/**
 * Removes suggestions from the cached document once handled, so they don't
 * reappear — and re-stamps the fingerprint when applying changed the tasks.
 *
 * Without the re-stamp, applying a suggestion would change a priority, which
 * changes the fingerprint, which would trigger a fresh paid analysis on every
 * single click. The analysis we already have is still the right one; it just
 * describes a state we deliberately moved on from.
 */
export async function resolveSuggestions(
  workspaceId: string,
  taskIds: string[],
  newFingerprint?: string
) {
  const cached = await readCachedAnalysis(workspaceId)
  if (!cached) return
  const remaining = cached.suggestions.filter((s) => !taskIds.includes(s.taskId))
  await setDoc(
    doc(getDb(), INSIGHTS, workspaceId),
    {
      ...cached,
      suggestions: remaining,
      ...(newFingerprint ? { fingerprint: newFingerprint } : {}),
    },
    { merge: true }
  )
}

/**
 * The fingerprint the tasks will have once these priority changes land, so the
 * cache can be re-stamped without waiting for the Firestore subscription.
 */
export function fingerprintAfterApplying(
  tasks: Task[],
  applied: { taskId: string; suggestedPriority: TaskPriority }[]
): string {
  const overrides = new Map(applied.map((a) => [a.taskId, a.suggestedPriority]))
  return fingerprintTasks(
    tasks.map((t) => (overrides.has(t.id) ? { ...t, priority: overrides.get(t.id)! } : t))
  )
}

const AUTO_APPLY_KEY = 'stacky.ai.autoApply'

/**
 * Auto-apply is deliberately limited to high-confidence suggestions — those the
 * model only issues on hard evidence like an overdue date or an explicit
 * blocking relationship. Medium and low always wait for a click.
 */
export function autoApplyEnabled(): boolean {
  return localStorage.getItem(AUTO_APPLY_KEY) === 'true'
}

export function setAutoApply(enabled: boolean) {
  localStorage.setItem(AUTO_APPLY_KEY, String(enabled))
}

export function autoApplicable(suggestions: PrioritySuggestion[]): PrioritySuggestion[] {
  return suggestions.filter((s) => s.confidence === 'high')
}
