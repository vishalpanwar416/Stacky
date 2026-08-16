import { useEffect, useState } from 'react'

import { useToast } from '../contexts/ToastContext'
import {
  applyGitSuggestion,
  dismissGitSuggestion,
  subscribeGitSuggestions,
  type GitSuggestion,
} from '../lib/gitSuggestions'

/**
 * Status changes proposed from GitHub activity, waiting on a decision.
 *
 * Renders nothing when there is nothing pending — a panel reading "no
 * suggestions" is noise on a board somebody uses every day.
 */

const STATUS_LABEL: Record<string, string> = {
  in_progress: 'In Progress',
  done: 'Done',
  blocked: 'Blocked',
  planned: 'Planned',
  backlog: 'Backlog',
}

const CONFIDENCE_STYLE: Record<string, string> = {
  high: 'border-emerald-500/25 bg-emerald-500/10 text-emerald-400',
  medium: 'border-amber-500/25 bg-amber-500/10 text-amber-400',
  low: 'theme-border theme-text-faint',
}

export function GitSuggestions({ workspaceId, canWrite }: { workspaceId: string; canWrite: boolean }) {
  const { toast } = useToast()
  const [suggestions, setSuggestions] = useState<GitSuggestion[]>([])
  const [busy, setBusy] = useState<string | null>(null)

  useEffect(() => {
    if (!workspaceId) return
    return subscribeGitSuggestions(workspaceId, setSuggestions)
  }, [workspaceId])

  if (suggestions.length === 0) return null

  const act = async (s: GitSuggestion, accept: boolean) => {
    setBusy(s.id)
    try {
      if (accept) {
        await applyGitSuggestion(s)
        toast(`Moved to ${STATUS_LABEL[s.suggestedStatus] ?? s.suggestedStatus}`, 'success')
      } else {
        await dismissGitSuggestion(s)
      }
    } catch (err) {
      console.error(err)
      toast(err instanceof Error ? err.message : 'Could not update the task', 'error')
    } finally {
      setBusy(null)
    }
  }

  return (
    <section className="mb-8 rounded-2xl border theme-border p-4 sm:p-5" style={{ background: 'var(--color-surface)' }}>
      <div className="mb-4 flex items-center gap-2">
        <svg className="h-4 w-4 theme-text-muted" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
          <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0016 8c0-4.42-3.58-8-8-8z" />
        </svg>
        <h2 className="text-sm font-semibold tracking-tight theme-text">
          From GitHub ({suggestions.length})
        </h2>
        <span className="text-xs theme-text-faint">— nothing moves until you say so</span>
      </div>

      <div className="flex flex-col gap-2">
        {suggestions.map((s) => (
          <div key={s.id} className="rounded-xl border theme-border p-3" style={{ background: 'var(--color-bg)' }}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium theme-text">{s.taskTitle}</span>
                  <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-tight ${CONFIDENCE_STYLE[s.confidence] ?? CONFIDENCE_STYLE.low}`}>
                    {s.confidence}
                  </span>
                </div>
                <p className="mt-1 text-xs theme-text-muted">
                  {STATUS_LABEL[s.currentStatus] ?? s.currentStatus} → <strong className="theme-text">{STATUS_LABEL[s.suggestedStatus] ?? s.suggestedStatus}</strong>
                  {' · '}{s.reason}
                </p>
                <a
                  href={s.source.url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1.5 inline-block truncate text-[11px] theme-text-faint underline-offset-2 hover:underline"
                >
                  {s.source.kind === 'pull_request' ? 'PR' : 'push'} · {s.source.branch} · {s.source.title}
                </a>
              </div>

              {canWrite && (
                <div className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    disabled={busy === s.id}
                    onClick={() => act(s, true)}
                    className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                  >
                    Apply
                  </button>
                  <button
                    type="button"
                    disabled={busy === s.id}
                    onClick={() => act(s, false)}
                    className="rounded-lg px-3 py-1.5 text-xs font-medium theme-text-muted transition-colors hover:bg-white/5 disabled:opacity-50"
                  >
                    Dismiss
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
