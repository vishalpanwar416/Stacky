import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import {
  applySuggestion,
  autoApplicable,
  autoApplyEnabled,
  fingerprintAfterApplying,
  fingerprintTasks,
  getAnalysis,
  openTasks,
  resolveSuggestions,
  setAutoApply,
  type AiAnalysis,
  type PrioritySuggestion,
} from '../lib/ai'
import { useToast } from '../contexts/ToastContext'
import type { Project, Task } from '../types'

const priorityTone: Record<string, string> = {
  P0: 'text-rose-400',
  P1: 'text-amber-400',
  P2: 'theme-text-muted',
  P3: 'theme-text-faint',
}

const confidenceLabel: Record<PrioritySuggestion['confidence'], string> = {
  high: 'Strong evidence',
  medium: 'Worth a look',
  low: 'Low confidence',
}

interface Props {
  workspaceId: string
  tasks: Task[]
  projects: Project[]
  userId: string
}

export function AiFocusPanel({ workspaceId, tasks, projects, userId }: Props) {
  const navigate = useNavigate()
  const { toast } = useToast()

  const [analysis, setAnalysis] = useState<AiAnalysis | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busyIds, setBusyIds] = useState<string[]>([])
  const [autoApply, setAutoApplyState] = useState(autoApplyEnabled)

  const open = openTasks(tasks)
  const fingerprint = open.length > 0 ? fingerprintTasks(tasks) : ''
  // Analyses are keyed by fingerprint; this guards against re-running for a
  // fingerprint already in flight when Firestore pushes an unrelated update.
  const lastRun = useRef<string>('')
  // Applying a suggestion changes a priority, which changes the fingerprint.
  // That is our own edit, not new work to re-analyse — adopt the fingerprint
  // silently instead of paying for another call on every click.
  const skipNextRun = useRef(false)

  const run = useCallback(
    async (force: boolean) => {
      if (open.length === 0) return
      setLoading(true)
      setError(null)
      try {
        const result = await getAnalysis(workspaceId, tasks, projects, { force })
        setAnalysis(result)

        // Auto-apply only ever touches high-confidence suggestions.
        if (autoApplyEnabled()) {
          const auto = autoApplicable(result.suggestions)
          if (auto.length > 0) {
            skipNextRun.current = true
            await Promise.all(auto.map((s) => applySuggestion(s, userId)))
            await resolveSuggestions(
              workspaceId,
              auto.map((s) => s.taskId),
              fingerprintAfterApplying(tasks, auto)
            )
            setAnalysis({
              ...result,
              suggestions: result.suggestions.filter((s) => s.confidence !== 'high'),
            })
            toast(
              `Auto-applied ${auto.length} priority ${auto.length === 1 ? 'change' : 'changes'}`,
              'success'
            )
          }
        }
      } catch (err) {
        setError((err as Error).message)
      } finally {
        setLoading(false)
      }
    },
    // `tasks`/`projects` are read through the fingerprint, which is the dep that
    // actually decides whether a re-run is warranted.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [workspaceId, fingerprint, userId]
  )

  useEffect(() => {
    if (!fingerprint || lastRun.current === fingerprint) return
    if (skipNextRun.current) {
      // Our own applied change landing back through the subscription.
      skipNextRun.current = false
      lastRun.current = fingerprint
      return
    }
    lastRun.current = fingerprint
    void run(false)
  }, [fingerprint, run])

  async function handleApply(suggestion: PrioritySuggestion) {
    setBusyIds((ids) => [...ids, suggestion.taskId])
    skipNextRun.current = true
    try {
      await applySuggestion(suggestion, userId)
      await resolveSuggestions(
        workspaceId,
        [suggestion.taskId],
        fingerprintAfterApplying(tasks, [suggestion])
      )
      setAnalysis((a) =>
        a ? { ...a, suggestions: a.suggestions.filter((s) => s.taskId !== suggestion.taskId) } : a
      )
      toast(`${suggestion.title} → ${suggestion.suggestedPriority}`, 'success')
    } catch (err) {
      toast((err as Error).message, 'error')
    } finally {
      setBusyIds((ids) => ids.filter((id) => id !== suggestion.taskId))
    }
  }

  async function handleDismiss(suggestion: PrioritySuggestion) {
    setAnalysis((a) =>
      a ? { ...a, suggestions: a.suggestions.filter((s) => s.taskId !== suggestion.taskId) } : a
    )
    await resolveSuggestions(workspaceId, [suggestion.taskId]).catch(() => {})
  }

  async function handleApplyAll() {
    if (!analysis) return
    const all = analysis.suggestions
    setBusyIds(all.map((s) => s.taskId))
    skipNextRun.current = true
    try {
      await Promise.all(all.map((s) => applySuggestion(s, userId)))
      await resolveSuggestions(
        workspaceId,
        all.map((s) => s.taskId),
        fingerprintAfterApplying(tasks, all)
      )
      setAnalysis({ ...analysis, suggestions: [] })
      toast(`Applied ${all.length} priority changes`, 'success')
    } catch (err) {
      toast((err as Error).message, 'error')
    } finally {
      setBusyIds([])
    }
  }

  function toggleAutoApply() {
    const next = !autoApply
    setAutoApplyState(next)
    setAutoApply(next)
    toast(
      next ? 'High-confidence changes will apply automatically' : 'Auto-apply turned off',
      'success'
    )
  }

  if (open.length === 0) return null

  const focusTasks = (analysis?.focusTaskIds ?? [])
    .map((id) => open.find((t) => t.id === id))
    .filter((t): t is Task => Boolean(t))

  return (
    // Rendered inside the greeting card, so this is a divider rather than its
    // own card. z-10 clears that card's decorative background layers.
    <section className="relative z-10 mt-5 border-t pt-4 theme-border">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold theme-text">Focus</span>
          <span className="rounded-lg theme-surface-bg px-2 py-0.5 text-[11px] theme-text-faint">
            AI
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={toggleAutoApply}
            title="When on, only high-confidence suggestions apply without asking"
            className={`rounded-xl border px-2.5 py-1 text-xs font-medium transition-colors theme-border ${
              autoApply ? 'text-emerald-400' : 'theme-text-faint hover:theme-text'
            }`}
          >
            Auto-apply {autoApply ? 'on' : 'off'}
          </button>
          <button
            type="button"
            onClick={() => void run(true)}
            disabled={loading}
            className="rounded-xl border px-2.5 py-1 text-xs font-medium theme-border theme-text-muted transition-colors hover:theme-text disabled:opacity-50"
          >
            {loading ? 'Thinking…' : 'Refresh'}
          </button>
        </div>
      </div>

      {loading && !analysis && (
        <div className="space-y-2">
          <div className="h-4 w-2/3 animate-pulse rounded theme-surface-bg" />
          <div className="h-3 w-full animate-pulse rounded theme-surface-bg" />
          <div className="h-3 w-4/5 animate-pulse rounded theme-surface-bg" />
        </div>
      )}

      {error && (
        <div className="flex items-center justify-between gap-3 rounded-2xl bg-amber-500/10 px-4 py-3 text-sm text-amber-400">
          <span>{error}</span>
          <button
            type="button"
            onClick={() => void run(true)}
            className="shrink-0 rounded-lg px-2 py-1 text-xs font-medium hover:bg-amber-500/20"
          >
            Retry
          </button>
        </div>
      )}

      {analysis && !error && (
        <>
          <p className="text-base font-medium theme-text">{analysis.headline}</p>
          <p className="mt-1.5 text-sm leading-relaxed theme-text-muted">{analysis.summary}</p>

          {focusTasks.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {focusTasks.map((task, i) => (
                <button
                  key={task.id}
                  type="button"
                  onClick={() => navigate(`/tasks/${task.id}`)}
                  className="flex items-center gap-2 rounded-xl theme-surface-bg theme-border border px-3 py-1.5 text-xs font-medium theme-text transition-colors theme-surface-hover-bg"
                >
                  <span className="theme-text-faint">{i + 1}</span>
                  <span className="max-w-[16rem] truncate">{task.title}</span>
                  <span className={priorityTone[task.priority]}>{task.priority}</span>
                </button>
              ))}
            </div>
          )}

          {analysis.suggestions.length > 0 && (
            <div className="mt-5 border-t pt-4 theme-border">
              <div className="mb-3 flex items-center justify-between gap-3">
                <p className="text-xs font-medium theme-text-muted">
                  {analysis.suggestions.length} suggested priority{' '}
                  {analysis.suggestions.length === 1 ? 'change' : 'changes'}
                </p>
                <button
                  type="button"
                  onClick={() => void handleApplyAll()}
                  disabled={busyIds.length > 0}
                  className="rounded-xl border px-2.5 py-1 text-xs font-medium theme-border theme-text-muted transition-colors hover:theme-text disabled:opacity-50"
                >
                  Apply all
                </button>
              </div>

              <ul className="space-y-2">
                {analysis.suggestions.map((s) => {
                  const busy = busyIds.includes(s.taskId)
                  return (
                    <li
                      key={s.taskId}
                      className="flex flex-wrap items-start justify-between gap-3 rounded-2xl theme-surface-bg px-4 py-3"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => navigate(`/tasks/${s.taskId}`)}
                            className="truncate text-sm font-medium theme-text hover:underline"
                          >
                            {s.title}
                          </button>
                          <span className="flex items-center gap-1 text-xs">
                            <span className={priorityTone[s.currentPriority]}>
                              {s.currentPriority}
                            </span>
                            <span className="theme-text-faint">→</span>
                            <span className={`font-semibold ${priorityTone[s.suggestedPriority]}`}>
                              {s.suggestedPriority}
                            </span>
                          </span>
                          <span className="rounded-lg px-1.5 py-0.5 text-[11px] theme-text-faint">
                            {confidenceLabel[s.confidence]}
                          </span>
                        </div>
                        <p className="mt-1 text-xs leading-relaxed theme-text-muted">{s.reason}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <button
                          type="button"
                          onClick={() => void handleApply(s)}
                          disabled={busy}
                          className="rounded-xl border px-2.5 py-1 text-xs font-medium theme-border theme-text transition-colors theme-surface-hover-bg disabled:opacity-50"
                        >
                          {busy ? '…' : 'Apply'}
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDismiss(s)}
                          disabled={busy}
                          className="rounded-xl px-2.5 py-1 text-xs font-medium theme-text-faint transition-colors hover:theme-text disabled:opacity-50"
                        >
                          Dismiss
                        </button>
                      </div>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}

          <p className="mt-4 text-[11px] theme-text-faint">
            {analysis.analysedCount} open {analysis.analysedCount === 1 ? 'task' : 'tasks'} ·{' '}
            {analysis.model}
          </p>
        </>
      )}
    </section>
  )
}
